"""Low-power policy — port of ping-island's EnergyGovernor.

Active sessions stay responsive; quiet/locked periods poll slowly.
Three tiers; the bridge asks tier() before each poll loop.
Keep-awake: systemd-inhibit while any session is working (released after).
Stdlib only.
"""
import os
import subprocess
import time

_last_active = 0.0


def mark_active():
    global _last_active
    _last_active = time.time()


def tier(has_work=False):
    """'live' (2s) | 'idle' (15s) | 'sleep' (60s)."""
    if has_work:
        return 'live'
    quiet = time.time() - _last_active
    if quiet > 600:
        return 'sleep'
    if quiet > 60:
        return 'idle'
    return 'live'


def poll_interval(has_work=False):
    return {'live': 2, 'idle': 15, 'sleep': 60}[tier(has_work)]


_inhibit = None


def keep_awake(on):
    """Hold/release a systemd sleep inhibitor. No-op without systemd."""
    global _inhibit
    if on and _inhibit is None:
        try:
            _inhibit = subprocess.Popen(
                ['systemd-inhibit', '--what=sleep', '--why=steroids-working',
                 'sleep', '3600'],
                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                stdin=subprocess.DEVNULL, start_new_session=True)
        except (OSError, FileNotFoundError):
            _inhibit = False
    elif not on and _inhibit:
        try:
            if _inhibit is not True and _inhibit is not False:
                _inhibit.terminate()
        except OSError:
            pass
        _inhibit = None


def idle_locked():
    """True when the session is locked (loginctl) — poll slowly."""
    try:
        p = subprocess.run(['loginctl', 'show-session', 'self', '-p', 'LockedHint'],
                           capture_output=True, text=True, timeout=3)
        return 'LockedHint=yes' in (p.stdout or '')
    except (OSError, subprocess.TimeoutExpired):
        return False
