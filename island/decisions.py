"""Island decisions — port of ping-island's act-from-notch.

Blocking hooks (Claude PermissionRequest / PreToolUse-ask, opencode
permission) poll here: the island writes approve/deny/answer, the next
hook read resolves it. File-backed so hooks (short-lived subprocesses)
and bridge (long-lived server) share state with zero IPC.
Stdlib only. Never blocks: missing/expired entry -> None (let native UI win).
"""
import json
import os
import re
import time

TTL = 300  # a pending approval lives 5 minutes unanswered


def _path():
    home = os.environ.get('STEROIDS_HOME') or os.path.expanduser('~')
    d = os.path.join(home, '.config', 'steroids')
    try:
        os.makedirs(d, exist_ok=True)
    except OSError:
        pass
    return os.path.join(d, 'decisions.json')


def _load():
    try:
        with open(_path(), encoding='utf-8') as f:
            d = json.load(f)
        return d if isinstance(d, dict) else {}
    except (OSError, ValueError):
        return {}


def _save(d):
    try:
        with open(_path(), 'w', encoding='utf-8') as f:
            json.dump(d, f)
    except OSError:
        pass


def _sweep(d):
    now = time.time()
    for k in [k for k, v in d.items()
              if not isinstance(v, dict) or v.get('expires', 0) < now
              or v.get('answered')]:
        d.pop(k, None)
    return d


def request_key(session, tool='', req_id=''):
    """Stable key so approve/deny/answer find the same row."""
    return '|'.join(str(x) for x in
                    (session or '', tool or '', req_id or ''))[:160]


def pending(session=None):
    """Live unanswered rows, optionally filtered to one session."""
    d = _sweep(_load())
    out = []
    for k, v in d.items():
        if session and v.get('session') != session:
            continue
        out.append({'key': k, **v})
    return sorted(out, key=lambda r: r.get('ts', 0))


def decide(key, verdict, answer=''):
    """verdict: approve | deny | answer. Returns True when stored."""
    if verdict not in ('approve', 'deny', 'answer'):
        return False
    d = _sweep(_load())
    v = d.get(key)
    if not isinstance(v, dict):
        return False
    v['verdict'] = verdict
    v['answer'] = str(answer)[:2000]
    v['answered'] = True
    v['answered_ts'] = time.time()
    _save(d)
    return True


def note(session, tool='', req_id='', kind='approval', text=''):
    """Hook side: register a pending row (idempotent per key)."""
    d = _load()
    k = request_key(session, tool, req_id)
    if k not in d or not isinstance(d.get(k), dict):
        d[k] = {'session': session, 'tool': tool, 'req': req_id,
                'kind': kind, 'text': str(text)[:500],
                'ts': time.time(), 'expires': time.time() + TTL}
        _save(d)
    return k


def take(key):
    """Hook side: pop the answered verdict once (single read). None if none."""
    d = _load()
    v = d.get(key)
    if not isinstance(v, dict) or not v.get('answered'):
        # expire stale unanswered rows opportunistically
        _save(_sweep(d))
        return None
    d.pop(key, None)
    _save(d)
    return {'verdict': v.get('verdict'), 'answer': v.get('answer', '')}


def auto_approve(session):
    """Per-session auto-approve flag (ping-island parity). File of session ids."""
    home = os.environ.get('STEROIDS_HOME') or os.path.expanduser('~')
    p = os.path.join(home, '.config', 'steroids', 'auto-approve.json')
    try:
        with open(p, encoding='utf-8') as f:
            ids = json.load(f)
        return session in ids if isinstance(ids, list) else False
    except (OSError, ValueError):
        return False


def set_auto_approve(session, on=True):
    home = os.environ.get('STEROIDS_HOME') or os.path.expanduser('~')
    p = os.path.join(home, '.config', 'steroids', 'auto-approve.json')
    try:
        with open(p, encoding='utf-8') as f:
            ids = json.load(f)
        ids = ids if isinstance(ids, list) else []
    except (OSError, ValueError):
        ids = []
    if on and session not in ids:
        ids.append(session)
    elif not on and session in ids:
        ids.remove(session)
    try:
        os.makedirs(os.path.dirname(p), exist_ok=True)
        with open(p, 'w', encoding='utf-8') as f:
            json.dump(ids[-50:], f)
    except OSError:
        pass
    return on


# --- persistent allow-rules (DevIsland policy-engine pattern, MIT) --------
# deny-first: persistent-deny > session-deny > persistent-allow >
# session-allow > prompt. kinds: exact | glob | regex | prefix.

def _rules_path():
    home = os.environ.get('STEROIDS_HOME') or os.path.expanduser('~')
    return os.path.join(home, '.config', 'steroids', 'allow-rules.json')


def allow_rules():
    try:
        with open(_rules_path(), encoding='utf-8') as f:
            d = json.load(f)
        return [r for r in d if isinstance(r, dict)] if isinstance(d, list) else []
    except (OSError, ValueError):
        return []


def add_allow_rule(tool, action, kind='glob', workspace=''):
    """tool: pattern; action: allow|deny; kind: exact|glob|regex|prefix."""
    import fnmatch
    if action not in ('allow', 'deny') or not tool:
        return None
    if kind not in ('exact', 'glob', 'regex', 'prefix'):
        kind = 'glob'
    rs = allow_rules()
    rule = {'tool': str(tool)[:200], 'action': action, 'kind': kind,
            'workspace': str(workspace or '')[:256]}
    rs = [r for r in rs if not (r.get('tool') == rule['tool']
                                and r.get('kind') == kind)] + [rule]
    try:
        os.makedirs(os.path.dirname(_rules_path()), exist_ok=True)
        with open(_rules_path(), 'w', encoding='utf-8') as f:
            json.dump(rs[-100:], f)
    except OSError:
        pass
    return rule


def remove_allow_rule(tool, kind='glob'):
    """Drop the matching allow/deny rule. Returns True when removed."""
    try:
        rs = allow_rules()
        kept = [r for r in rs if not (r.get('tool') == tool
                                      and r.get('kind', 'glob') == kind)]
        if len(kept) == len(rs):
            return False
        os.makedirs(os.path.dirname(_rules_path()), exist_ok=True)
        with open(_rules_path(), 'w', encoding='utf-8') as f:
            json.dump(kept[-100:], f)
        return True
    except OSError:
        return False


def _rule_hit(rule, tool, cwd=''):
    if rule.get('workspace') and cwd not in (rule['workspace'],) \
            and not str(cwd).startswith(rule['workspace']):
        return False
    import fnmatch
    pat, t, kind = rule.get('tool', ''), tool or '', rule.get('kind', 'glob')
    if kind == 'exact':
        return t == pat
    if kind == 'prefix':
        return t.startswith(pat) and (len(t) == len(pat)
                                      or t[len(pat):len(pat) + 1] in (' ', '/', ':'))
    if kind == 'regex':
        try:
            return re.search(pat, t) is not None
        except re.error:
            return False
    return fnmatch.fnmatchcase(t, pat)


def evaluate_rules(tool, cwd='', session=''):
    """'allow' | 'deny' | None. Deny wins; session auto-approve counts
    as session-allow (below persistent rules, above prompt)."""
    import fnmatch  # noqa: F401 (kept near use for clarity)
    denied = allowed = False
    for r in allow_rules():
        if _rule_hit(r, tool or '', cwd or ''):
            if r.get('action') == 'deny':
                denied = True
            else:
                allowed = True
    if denied:
        return 'deny'
    if allowed:
        return 'allow'
    if session and auto_approve(session):
        return 'allow'
    return None
