"""Fleet attention ranking + worktree overlap — port of DevIsland's Fleet Radar.

Ranking is ordinal, not weighted: needsDecision < blocked < overlapRisk
< unread < live, ties by newest activity. Overlap warns when two sessions
in different worktrees of one repo touch the same paths.
Clean-room reimplementation (MIT source); stdlib only, never throws.
"""
import os
import subprocess
import time

ORDER = {'needsDecision': 0, 'blocked': 1, 'overlapRisk': 2,
         'unread': 3, 'live': 4}


def attention_kind(s, overlaps=()):
    """s: session dict {pending, blocked, unread, ...}. overlaps: peer ids."""
    if s.get('pending') or s.get('hasMissedApproval'):
        return 'needsDecision'
    if s.get('blocked'):
        return 'needsDecision' if False else ('blocked' if True else 'live')
    if s.get('session') in overlaps or s.get('overlap'):
        return 'overlapRisk'
    if s.get('unread'):
        return 'unread'
    return 'live'


def rank(sessions, overlaps=()):
    """Sessions sorted for the island list. Returns same dicts, ordered."""
    over = set(overlaps)
    for s in sessions:
        if not isinstance(s, dict):
            continue
        peers = over - {s.get('session')}
        # per-session peers only when caller passed a {sid: [peers]} map
        if isinstance(overlaps, dict):
            peers = set(overlaps.get(s.get('session'), ()))
            kind = attention_kind(s, set()) if not peers else 'overlapRisk'
            if not peers:
                kind = attention_kind(s)
        else:
            kind = attention_kind(s, over)
        s['_kind'] = kind
    return sorted([s for s in sessions if isinstance(s, dict)],
                  key=lambda s: (ORDER[s.get('_kind', 'live')],
                                 -(s.get('ts') or 0),
                                 str(s.get('session'))))


def _git(cwd, *args, timeout=5):
    try:
        p = subprocess.run(['git', '-C', cwd] + list(args),
                           capture_output=True, text=True, timeout=timeout)
        return p.stdout if p.returncode == 0 else ''
    except (OSError, subprocess.TimeoutExpired):
        return ''


def snapshot(cwd):
    """{repo, worktree, changed} for one working dir. {} when not a repo."""
    if not cwd or not os.path.isdir(cwd):
        return {}
    top = _git(cwd, 'rev-parse', '--show-toplevel').strip()
    common = _git(cwd, 'rev-parse', '--git-common-dir').strip()
    if not top:
        return {}
    top = os.path.realpath(top)
    if common and not os.path.isabs(common):
        common = os.path.normpath(os.path.join(top, common))
    changed = set()
    try:
        out = subprocess.run(
            ['git', '-C', cwd, '-c', 'core.fsmonitor=false', 'status',
             '--porcelain=v1', '-z', '--untracked-files=all'],
            capture_output=True, text=True, timeout=8).stdout
        for chunk in out.split('\0'):
            path = chunk[3:].strip() if len(chunk) > 3 else ''
            if path:
                changed.add(path.split(' -> ')[-1])
    except (OSError, subprocess.TimeoutExpired):
        pass
    return {'repo': os.path.realpath(common or top), 'worktree': top,
            'changed': changed, 'ts': time.time()}


def overlap(sessions):
    """{sid: [peer sids]} sharing a repo but different worktrees with
    intersecting changed paths. Bounded, cached 2s via snapshot ts."""
    snaps = {}
    for s in sessions:
        if not isinstance(s, dict) or not s.get('cwd'):
            continue
        snap = snapshot(s['cwd'])
        if snap:
            snaps[s['session']] = snap
    out = {}
    ids = list(snaps)
    for i, a in enumerate(ids):
        for b in ids[i + 1:]:
            sa, sb = snaps[a], snaps[b]
            if sa['repo'] != sb['repo'] or sa['worktree'] == sb['worktree']:
                continue
            if sa['changed'] & sb['changed']:
                out.setdefault(a, []).append(b)
                out.setdefault(b, []).append(a)
    return out
