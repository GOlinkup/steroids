#!/usr/bin/env python3
"""Managed hook installer — port of ping-island's HookInstaller.swift.

Idempotent: merges our managed block, preserves everything else.
JSON settings: our hooks live under the provider's hooks object;
TOML (kimi/codex): only [[hooks]] Island rows are touched.
Opencode: generated plugin file, never edited in place.

  python3 island/install_hooks.py --all      install every known client
  python3 island/install_hooks.py --client gemini
  python3 island/install_hooks.py --uninstall --client gemini
Stdlib only. Never throws away user config (backs up .bak once).
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import clients  # noqa: E402

RELAY = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'hook_relay.py')
MARK = 'steroids-island'


def _backup(p):
    bak = p + '.bak'
    if os.path.isfile(p) and not os.path.isfile(bak):
        try:
            with open(p, 'rb') as f:
                data = f.read()
            with open(bak, 'wb') as f:
                f.write(data)
        except OSError:
            pass


def _load_json(p):
    try:
        with open(p, encoding='utf-8') as f:
            d = json.load(f)
        return d if isinstance(d, dict) else {}
    except (OSError, ValueError):
        return {}


def _hook_cmd(client):
    return 'python3 "%s" %s' % (RELAY, client)


def install_json(client):
    """Merge managed hooks into a Claude-style settings.json. Returns path."""
    p = clients.hook_path(client)
    _backup(p)
    d = _load_json(p)
    hooks = d.get('hooks')
    if not isinstance(hooks, dict):
        hooks = {}
        d['hooks'] = hooks
    cmd = _hook_cmd(client)
    for ev in ('SessionStart', 'UserPromptSubmit', 'PreToolUse',
               'PostToolUse', 'Notification', 'Stop', 'SessionEnd'):
        rows = hooks.get(ev)
        if not isinstance(rows, list):
            rows = []
            hooks[ev] = rows
        rows[:] = [r for r in rows
                   if not (isinstance(r, dict) and MARK in str(r))]
        matcher = '.*' if client in ('gemini',) else '*'
        rows.append({'matcher': matcher, 'hooks': [
            {'type': 'command', 'command': cmd, 'name': MARK}]})
    try:
        os.makedirs(os.path.dirname(p), exist_ok=True)
        with open(p, 'w', encoding='utf-8') as f:
            json.dump(d, f, indent=2)
    except OSError as e:
        return {'ok': False, 'error': str(e)}
    return {'ok': True, 'path': p}


def install_toml(client):
    """Append/replace only our managed [[hooks]] block. Preserves the rest."""
    p = clients.hook_path(client)
    if p.endswith('config.toml') and 'kimi-code' not in p and client == 'kimi':
        for alt in (os.path.expanduser('~/.kimi-code/config.toml'), p):
            if os.path.isfile(alt):
                p = alt
                break
    _backup(p)
    try:
        cur = ''
        if os.path.isfile(p):
            with open(p, encoding='utf-8') as f:
                cur = f.read()
    except OSError as e:
        return {'ok': False, 'error': str(e)}
    lines = [ln for ln in cur.splitlines()
             if MARK not in ln and 'hook_relay.py' not in ln]
    lines.append('# %s managed — do not hand-edit' % MARK)
    for ev in ('SessionStart', 'UserPromptSubmit', 'PreToolUse',
               'PostToolUse', 'Notification', 'Stop', 'SessionEnd'):
        lines.append('[[hooks]]  # %s' % MARK)
        lines.append('event = "%s"' % ev)
        lines.append('command = \'python3 "%s" %s\'' % (RELAY, client))
    try:
        os.makedirs(os.path.dirname(p), exist_ok=True)
        with open(p, 'w', encoding='utf-8') as f:
            f.write('\n'.join(lines) + '\n')
    except OSError as e:
        return {'ok': False, 'error': str(e)}
    return {'ok': True, 'path': p}


def install_opencode():
    """Generated plugin file (matches plugins/opencode/steroids-events.ts)."""
    dst = os.path.expanduser('~/.config/opencode/plugins/steroids-events.ts')
    src = os.path.join(os.path.dirname(os.path.dirname(
        os.path.abspath(__file__))), 'plugins', 'opencode', 'steroids-events.ts')
    try:
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        with open(src, 'rb') as f:
            data = f.read()
        with open(dst, 'wb') as f:
            f.write(data)
    except OSError as e:
        return {'ok': False, 'error': str(e)}
    return {'ok': True, 'path': dst}


def uninstall(client):
    p = clients.hook_path(client)
    if p.endswith('.toml'):
        try:
            with open(p, encoding='utf-8') as f:
                lines = [ln for ln in f.read().splitlines()
                         if MARK not in ln and 'hook_relay.py' not in ln]
            with open(p, 'w', encoding='utf-8') as f:
                f.write('\n'.join(lines) + '\n')
        except OSError:
            pass
        return {'ok': True, 'path': p}
    d = _load_json(p)
    hooks = d.get('hooks')
    if isinstance(hooks, dict):
        for ev in list(hooks):
            rows = hooks[ev]
            if isinstance(rows, list):
                rows[:] = [r for r in rows
                           if not (isinstance(r, dict) and MARK in str(r))]
                if not rows:
                    del hooks[ev]
        try:
            with open(p, 'w', encoding='utf-8') as f:
                json.dump(d, f, indent=2)
        except OSError:
            pass
    return {'ok': True, 'path': p}


def install(client):
    if client == 'opencode':
        return install_opencode()
    if clients.hook_path(client).endswith('.toml'):
        return install_toml(client)
    return install_json(client)


def main(argv):
    args = list(argv)
    if '--uninstall' in args:
        args.remove('--uninstall')
        mode = uninstall
    else:
        mode = install
    targets = []
    if '--all' in args:
        targets = clients.ids()
    elif '--client' in args:
        i = args.index('--client')
        try:
            targets = [args[i + 1].lower()]
        except IndexError:
            sys.exit('--client needs a name')
    else:
        targets = ['claude', 'opencode']
    out = {}
    for t in targets:
        if t not in clients.ids():
            out[t] = {'ok': False, 'error': 'unknown client'}
            continue
        out[t] = mode(t)
    print(json.dumps(out, indent=2))


if __name__ == '__main__':
    main(sys.argv[1:])
