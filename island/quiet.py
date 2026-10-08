"""Quiet hours + error debounce — port of CodeIsland SoundManager (MIT).

Half-open [start, end) minutes-since-midnight, wraps at midnight,
start == end never mutes. Lock/idle mutes via logind. Error sounds
debounced per session. Stdlib only, never throws.
"""
import subprocess
import time
from datetime import datetime

_last_error = {}


def _mins(hhmm):
    try:
        h, m = str(hhmm).split(':')
        return (int(h) * 60 + int(m)) % 1440
    except (ValueError, AttributeError):
        return None


def in_quiet_hours(now=None, start='22:00', end='08:00'):
    s, e = _mins(start), _mins(end)
    if s is None or e is None or s == e:
        return False
    cur = now.hour * 60 + now.minute if now else (
        datetime.now().hour * 60 + datetime.now().minute)
    if s < e:
        return s <= cur < e
    return cur >= s or cur < e


def locked_or_idle():
    """logind idle/lock hint (Linux equiv of their lock/screensaver probe)."""
    for prop in ('LockedHint', 'IdleHint'):
        try:
            p = subprocess.run(['loginctl', 'show-session', 'self',
                                '-p', prop], capture_output=True, text=True,
                               timeout=3)
            if ('%s=yes' % prop) in (p.stdout or ''):
                return True
        except (OSError, subprocess.TimeoutExpired):
            return False
    return False


def error_allowed(session, debounce=60):
    """One error sound per session per debounce window."""
    now = time.time()
    if now - _last_error.get(session, 0) < debounce:
        return False
    _last_error[session] = now
    return True


def should_mute(event='', session='', cfg=None):
    """cfg: {quiet:{start,end}, events:{name:bool}, muted:bool}."""
    cfg = cfg or {}
    if cfg.get('muted'):
        return True
    q = cfg.get('quiet') or {}
    if q.get('enabled', True) and in_quiet_hours(
            start=q.get('start', '22:00'), end=q.get('end', '08:00')):
        return True
    ev = cfg.get('events') or {}
    if event and event in ev and not ev[event]:
        return True
    if locked_or_idle():
        return True
    if event == 'error' and not error_allowed(session):
        return True
    return False
