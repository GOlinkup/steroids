"""Claude quota via OAuth — port of vibe-notch-codex ClaudeQuotaProvider
(Apache-2.0). Token from ~/.claude/.credentials.json, 10-min cache.
Never throws, never exfiltrates (localhost caller reads bridge output).
"""
import json
import os
import time
import urllib.request

ENDPOINT = 'https://api.anthropic.com/api/oauth/usage'
CACHE_TTL = 600


def _cache_path():
    home = os.environ.get('STEROIDS_HOME') or os.path.expanduser('~')
    return os.path.join(home, '.config', 'steroids', 'quota-cache.json')


def _token():
    try:
        with open(os.path.expanduser('~/.claude/.credentials.json'),
                   encoding='utf-8') as f:
            d = json.load(f)
        return ((d.get('claudeAiOauth') or {}).get('accessToken')) or ''
    except (OSError, ValueError):
        return ''


def refresh():
    """Live fetch -> {five_hour, seven_day, extra_usage} or {}."""
    tok = _token()
    if not tok:
        return {}
    try:
        req = urllib.request.Request(
            ENDPOINT, headers={'Authorization': 'Bearer ' + tok,
                               'anthropic-beta': 'oauth-2025-04-20',
                               'User-Agent': 'claude-code/2.1.0'})
        with urllib.request.urlopen(req, timeout=10) as r:
            d = json.loads(r.read().decode('utf-8', 'replace'))
        out = {k: d[k] for k in ('five_hour', 'seven_day', 'extra_usage')
               if isinstance(d.get(k), dict)}
        if out:
            try:
                os.makedirs(os.path.dirname(_cache_path()), exist_ok=True)
                with open(_cache_path(), 'w', encoding='utf-8') as f:
                    json.dump({'ts': time.time(), 'usage': out}, f)
            except OSError:
                pass
        return out
    except Exception:
        return {}


def cached():
    """10-min cache, fallback to stale on failure."""
    try:
        with open(_cache_path(), encoding='utf-8') as f:
            d = json.load(f)
        if time.time() - d.get('ts', 0) < CACHE_TTL:
            return d.get('usage') or {}
        stale = d.get('usage') or {}
    except (OSError, ValueError):
        stale = {}
    live = refresh()
    return live or stale
