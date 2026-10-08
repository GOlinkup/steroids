"""Sound packs — port of ping-island's SoundPackCatalog.

openpeon.json layout (compatible with their packs + CESP):
  {name, display_name, categories: {task.acknowledge|input.required|
   task.complete|task.error|resource.limit: {sounds: [{file, label}]}}}
Auto-discovers ~/.openpeon/packs and ~/.claude/hooks/peon-ping/packs.
Falls back to built-in synth when a category is missing.
"""
import json
import os

EVENTS = {
    'start': ('task.acknowledge', 'session.start'),
    'attention': ('input.required',),
    'complete': ('task.complete',),
    'error': ('task.error',),
    'limit': ('resource.limit',),
}

DIRS = ('~/.openpeon/packs', '~/.claude/hooks/peon-ping/packs')


def packs():
    out = []
    for d in DIRS:
        base = os.path.expanduser(d)
        try:
            names = os.listdir(base)
        except OSError:
            continue
        for n in names:
            meta = os.path.join(base, n, 'openpeon.json')
            if os.path.isfile(meta):
                out.append(os.path.join(base, n))
    return out


def load(pack_dir):
    """{event: [wav/mp3/ogg paths]} — missing categories simply absent."""
    try:
        with open(os.path.join(pack_dir, 'openpeon.json'), encoding='utf-8') as f:
            meta = json.load(f)
    except (OSError, ValueError):
        return {}
    cats = meta.get('categories') or {}
    out = {}
    for ev, keys in EVENTS.items():
        for k in keys:
            c = cats.get(k) or {}
            for s in (c.get('sounds') or []):
                fn = (s or {}).get('file')
                if not fn:
                    continue
                p = os.path.join(pack_dir, fn)
                if os.path.isfile(p) and p.endswith(('.wav', '.mp3', '.ogg')):
                    out.setdefault(ev, []).append(p)
            if out.get(ev):
                break
    return out


def resolve(event, pack_dir=''):
    """First file for event, or '' (caller falls back to synth)."""
    if pack_dir:
        files = load(pack_dir).get(event) or []
        if files:
            return files[0]
    return ''
