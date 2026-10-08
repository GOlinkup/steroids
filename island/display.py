"""External display state + navigate slots — clean-room port of cctop's
display-state.json + numbered-badge navigate mode (proprietary source).

Private ledger stays in the bridge; this publishes the minimal derived
file external consumers (waybar, tmux, Stream Deck) are allowed to read.
Slot order freezes at build time so badge N always jumps to one session.
"""
import json
import os
import time

SCHEMA = 1
COLORS = {'working': 'green', 'thinking': 'green', 'finished': 'gray',
          'error': 'red', 'idle': 'gray'}


def build_state(sessions, states=None):
    """states: {sid: (status, activity)}. Frozen slot order 1-9."""
    states = states or {}
    rows = []
    for i, s in enumerate(sessions[:9]):
        sid = s.get('session', '')
        st, _ = states.get(sid, ('idle', ''))
        if s.get('attention') or s.get('pending'):
            st = 'attention'
        rows.append({'slot': i + 1, 'id': sid,
                     'name': s.get('first', '?')[:40],
                     'status': st,
                     'color': 'orange' if st == 'attention' else
                              COLORS.get(st, 'gray')})
    return {'schema': SCHEMA, 'time': time.time(), 'sessions': rows}


def publish(state, path=None):
    """Atomic write (tmp + rename). Returns path."""
    if path is None:
        home = os.environ.get('STEROIDS_HOME') or os.path.expanduser('~')
        path = os.path.join(home, '.config', 'steroids', 'display-state.json')
    tmp = path + '.tmp'
    try:
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(tmp, 'w', encoding='utf-8') as f:
            json.dump(state, f)
        os.replace(tmp, path)
    except OSError:
        return ''
    return path


def slot_target(state, slot):
    """sid for badge N, or '' when the slot is dead (never shifts)."""
    for r in state.get('sessions', []):
        if r.get('slot') == slot:
            return r.get('id', '')
    return ''
