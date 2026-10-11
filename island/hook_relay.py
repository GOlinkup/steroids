#!/usr/bin/env python3
"""Steroids hook relay — one payload in, one ledger line out.

Claude Code calls:   python3 hook_relay.py claude           (stdin JSON)
OpenCode plugin calls: python3 hook_relay.py opencode     (stdin JSON)

Exit 0 ALWAYS. Only PermissionRequest blocks (bounded 50s island wait,
then deny) — every other event never blocks an agent. Stdlib only.
"""
import json
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import agentlog  # noqa: E402
import context as _ctx  # noqa: E402  terminal context (cwd/tmux/tty)
import decisions as _dec  # noqa: E402  island approve/deny/answer
import mute as _mute  # noqa: E402  bypass flag
import sock as _sock  # noqa: E402  payload cap (deny-before-drop)


def _blocking_response(payload, ev):
    """If the island answered this approval/question, print the Claude-style
    decision JSON to stdout (only path that may speak — everything else
    stays silent). None = let native UI win."""
    if ev is None:
        return None
    if ev.get('notify_only'):
        return None  # codex owns its approval UI; never block
    sid = ev.get('session') or ''
    tool = ev.get('tool') or ''
    if _mute.bypass() and ev.get('event') == 'PreToolUse':
        return {"decision": "approve"}
    pol = _dec.evaluate_rules(tool, ev.get('cwd', ''), sid)
    if pol == 'allow':
        return {"decision": "approve"}
    if pol == 'deny':
        return {"decision": "block", "reason": "island allow-rule"}
    req = str(payload.get('tool_use_id') or payload.get('request_id') or '')
    key = _dec.request_key(sid, tool, req)
    if payload.get('hook_event_name') == 'PermissionRequest':
        # ponytail: single-card guard (coucou parity) — a second request must
        # never quietly replace the first; hand it straight back to terminal.
        try:
            for r in _dec.pending():
                if r.get('key') != key:
                    return {"decision": "block",
                            "reason": "another approval pending in island"}
        except Exception:
            pass
    hit = _dec.take(key)
    if hit is None and _dec.auto_approve(sid) and ev.get('event') == 'PreToolUse':
        hit = {'verdict': 'approve', 'answer': ''}
    if hit is None and payload.get('hook_event_name') == 'PermissionRequest':
        # The one blocking path: island gets 50s (under the 60s hook
        # timeout), then deny-by-default. Never hangs the agent.
        deadline = time.time() + 50
        while time.time() < deadline:
            time.sleep(0.5)
            hit = _dec.take(key)
            if hit is not None:
                break
        if hit is None:
            return {"decision": "block", "reason": "island approval timed out"}
    if hit is None:
        return None
    v = hit.get('verdict')
    if v == 'approve':
        return {"decision": "approve"}
    if v == 'deny':
        return {"decision": "block", "reason": "denied in island"}
    if v == 'answer':
        return {"decision": "approve", "updatedInput": {"answer": hit.get('answer', '')}}
    return None


def main():
    agent = 'claude'
    if len(sys.argv) > 1:
        a = sys.argv[1].strip().lower()
        agent = a if a else 'claude'
    try:
        raw = sys.stdin.read()
        ok, deny = _sock.check_size(len(raw.encode('utf-8', 'replace')))
        if not ok:
            # overflow: deny FIRST, then drop (CLI must never parse "").
            sys.stdout.write(json.dumps(_sock.DENY))
            return 0
        payload = json.loads(raw) if raw.strip() else {}
        try:
            payload.update(_ctx.capture())
        except Exception:
            pass
        # OSC2 title hint for jump-by-title fallback (UserPromptSubmit).
        if payload.get('hook_event_name') == 'UserPromptSubmit':
            try:
                import osc2 as _osc2
                _osc2.write(payload.get('session_id') or '',
                            payload.get('cwd') or '',
                            payload.get('prompt') or '')
                payload['title_hint'] = _osc2.format(
                    payload.get('cwd') or '', payload.get('prompt') or '')
            except Exception:
                pass
        ev = agentlog.normalize(payload, agent=agent)
        if ev is not None:
            agentlog.append_event(ev)
            # register pending row for attention-worthy hooks (cheap, idempotent)
            if ev.get('attention') or payload.get('hook_event_name') in (
                    'PermissionRequest', 'Notification'):
                try:
                    _dec.note(ev.get('session'), ev.get('tool'),
                              str(payload.get('tool_use_id') or ''),
                              kind='approval',
                              text=ev.get('text') or ev.get('tool'))
                except Exception:
                    pass
            resp = _blocking_response(payload, ev)
            if resp is not None:
                sys.stdout.write(json.dumps(resp))
    except Exception:
        pass  # never block, never stderr-flood
    return 0


if __name__ == '__main__':
    sys.exit(main())
