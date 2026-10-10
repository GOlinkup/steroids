#!/usr/bin/env python3
"""Command echo levels: volume + brightness for the chat live-strip.

Glance's Command Echo answers every volume/brightness key with a notch
visual; we answer with a live-strip row. pactl + sysfs, stdlib only,
never throws (missing tools -> None, callers show no row).
"""
import os
import re
import subprocess


def _run(argv, timeout=3):
    try:
        return subprocess.run(argv, capture_output=True, text=True,
                              timeout=timeout).stdout
    except Exception:
        return ""


def volume():
    """(pct 0-100, muted) or (None, False) when unaudible."""
    out = _run(["pactl", "get-sink-volume", "@DEFAULT_SINK@"])
    m = re.search(r"(\d+)%", out)
    if not m:
        return None, False
    mute = _run(["pactl", "get-sink-mute", "@DEFAULT_SINK@"])
    return int(m.group(1)), "yes" in mute.lower()


def brightness():
    """0-100 or None (no backlight, e.g. desktop/VM)."""
    try:
        base = "/sys/class/backlight"
        for name in sorted(os.listdir(base)):
            cur = os.path.join(base, name, "brightness")
            mx = os.path.join(base, name, "max_brightness")
            try:
                with open(cur) as f:
                    v = int(f.read().strip())
                with open(mx) as f:
                    m = int(f.read().strip())
                if m > 0:
                    return max(0, min(100, round(v * 100 / m)))
            except (OSError, ValueError):
                continue
    except OSError:
        pass
    return None


def levels():
    vol, muted = volume()
    return {"volume": vol, "muted": muted, "brightness": brightness()}
