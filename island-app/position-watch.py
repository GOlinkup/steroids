#!/usr/bin/env python3
"""Pin Steroids Island top-center using X ground truth.

Electron's Ozone-X11 position requests land mirrored on this setup
(asked +928 DIP arrived as -1856 X px — the "lost" closed pill), while
sizes scale correctly. So Electron keeps owning SIZE; this watcher owns
POSITION from _NET_WORKAREA each poll. Exits when the island is gone —
every run.sh launch starts a fresh watcher.
"""
import os
import sys
import time

os.environ.setdefault("DISPLAY", ":0")
os.environ.setdefault("XAUTHORITY", "/run/user/1000/xauth_mVlIoX")

from Xlib import X, display  # noqa: E402  (pip install python-xlib)

LOG = "/tmp/opencode/island-pos.log"


def log(msg):
    try:
        with open(LOG, "a") as f:
            f.write(f"{time.strftime('%H:%M:%S')} {msg}\n")
    except OSError:
        pass


def main():
    d = display.Display()
    root = d.screen().root
    NET_WA = d.intern_atom("_NET_WORKAREA")
    NET_STACK = d.intern_atom("_NET_CLIENT_LIST_STACKING")
    NET_NAME = d.intern_atom("_NET_WM_NAME")
    UTF8 = d.intern_atom("UTF8_STRING")
    miss = 0
    while True:
        try:
            wa = root.get_full_property(NET_WA, X.AnyPropertyType)
            wx, wy, ww, wh = (list(wa.value) + [0, 0, 0, 0])[:4]
            stack = root.get_full_property(NET_STACK, X.AnyPropertyType)
            found = None
            if stack:
                for wid in stack.value:
                    try:
                        w = d.create_resource_object("window", int(wid))
                        nm = w.get_full_property(NET_NAME, UTF8)
                        name = bytes(nm.value).decode("utf-8", "replace") if nm else ""
                        if "Steroids Island" in name:
                            found = w
                            break
                    except Exception:
                        continue
            if found is None:
                miss += 1
                if miss >= 5:
                    log("island gone — watcher exiting")
                    return
                time.sleep(2)
                continue
            miss = 0
            g = found.get_geometry()
            pos = found.translate_coords(root, 0, 0)
            want_x = wx + (ww - g.width) // 2
            if abs(pos.x - want_x) > 4 or abs(pos.y - wy) > 4:
                found.configure(x=want_x, y=wy)
                d.flush()
                log(f"moved {pos.x},{pos.y} {g.width}x{g.height} -> {want_x},{wy}")
        except Exception as e:  # never die on a transient X error
            log(f"poll error: {e}")
        time.sleep(2)


if __name__ == "__main__":
    main()
