#!/usr/bin/env python3
"""Steroids hook relay — one payload in, one ledger line out.

Claude Code calls:   python3 hook_relay.py claude           (stdin JSON)
OpenCode plugin calls: python3 hook_relay.py opencode     (stdin JSON)

Exit 0 ALWAYS — hooks must never block an agent. Stdlib only.
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import agentlog  # noqa: E402


def main():
    agent = 'claude'
    if len(sys.argv) > 1:
        a = sys.argv[1].strip().lower()
        agent = a if a in ('claude', 'opencode') else 'claude'
    try:
        raw = sys.stdin.read()
        payload = json.loads(raw) if raw.strip() else {}
        ev = agentlog.normalize(payload, agent=agent)
        if ev is not None:
            agentlog.append_event(ev)
    except Exception:
        pass  # never block, never stderr-flood
    return 0


if __name__ == '__main__':
    sys.exit(main())
