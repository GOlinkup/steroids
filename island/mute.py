"""Bypass mode + mute rules — clean-room port of XIsland's idea
(non-commercial source): one bool for full auto-approve, regex triples
{pattern, field, enabled} for per-event muting. Stdlib only.
"""
import json
import os
import re

FIELDS = ('agent', 'tool', 'cwd')


def _cfg_path(name):
    home = os.environ.get('STEROIDS_HOME') or os.path.expanduser('~')
    return os.path.join(home, '.config', 'steroids', name)


def bypass():
    try:
        with open(_cfg_path('bypass.json'), encoding='utf-8') as f:
            return bool(json.load(f).get('on'))
    except (OSError, ValueError):
        return False


def set_bypass(on):
    try:
        os.makedirs(os.path.dirname(_cfg_path('bypass.json')), exist_ok=True)
        with open(_cfg_path('bypass.json'), 'w', encoding='utf-8') as f:
            json.dump({'on': bool(on)}, f)
    except OSError:
        pass
    return bool(on)


def rules():
    try:
        with open(_cfg_path('mute-rules.json'), encoding='utf-8') as f:
            d = json.load(f)
        return [r for r in d if isinstance(r, dict)] if isinstance(d, list) else []
    except (OSError, ValueError):
        return []


def set_rules(rs):
    clean = [r for r in rs if isinstance(r, dict)
             and r.get('field') in FIELDS and r.get('pattern')]
    try:
        os.makedirs(os.path.dirname(_cfg_path('mute-rules.json')),
                    exist_ok=True)
        with open(_cfg_path('mute-rules.json'), 'w', encoding='utf-8') as f:
            json.dump(clean[:50], f)
    except OSError:
        pass
    return clean[:50]


def muted(agent='', tool='', cwd=''):
    """True when any enabled rule regex-matches its field (case-insensitive)."""
    vals = {'agent': agent or '', 'tool': tool or '', 'cwd': cwd or ''}
    for r in rules():
        if not r.get('enabled', True):
            continue
        try:
            if re.search(str(r['pattern']), vals[r['field']], re.I):
                return True
        except (re.error, KeyError):
            continue
    return False
