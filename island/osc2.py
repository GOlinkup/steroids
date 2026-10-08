"""OSC2 title cache — clean-room port of vibe-island's idea (GPL source).

Hook writes `project: prompt…` for a session on UserPromptSubmit; the
island reads it as the jump-by-title fallback. Tiny files, never throws.
"""
import os

KEY_LEN = 16


def _dir():
    base = os.environ.get('XDG_CACHE_HOME') or os.path.join(
        os.path.expanduser('~'), '.cache')
    d = os.path.join(base, 'steroids', 'osc2-titles')
    try:
        os.makedirs(d, exist_ok=True)
    except OSError:
        pass
    return d


def format(cwd='', prompt=''):
    proj = (cwd or '').rstrip('/').rsplit('/', 1)[-1]
    prev = (prompt or '').strip().splitlines()
    prev = prev[0][:30] if prev else ''
    return ('%s: %s' % (proj, prev)).strip(': ')[:64]


def write(sid, cwd='', prompt=''):
    """Store title hint. Returns path or ''."""
    if not sid:
        return ''
    val = format(cwd, prompt)
    p = os.path.join(_dir(), str(sid)[:KEY_LEN])
    try:
        with open(p, 'w', encoding='utf-8') as f:
            f.write(val)
        return p
    except OSError:
        return ''


def read(sid):
    try:
        with open(os.path.join(_dir(), str(sid)[:KEY_LEN]),
                   encoding='utf-8') as f:
            return f.read().strip()[:64]
    except OSError:
        return ''
