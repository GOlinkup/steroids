#!/usr/bin/env bash
# SHEET-FREEZE — human order 2026-10-11: top-center positioning + sheet
# geometry locked. No agent edits this file until the human says "unfreeze".
# Enforced by tests/test_sheet_freeze.py. Details: CONTRIBUTING.md.
# Steroids Island widget — transparent top-center pill on your screen.
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR"
if ! curl -sf -o /dev/null --max-time 2 http://127.0.0.1:8096/health; then
  nohup python3 ../island/bridge.py --serve >>/tmp/opencode/island-live.log 2>&1 &
  for _ in $(seq 1 20); do
    curl -sf -o /dev/null --max-time 1 http://127.0.0.1:8096/health && break
    sleep 0.5
  done
fi
# NOTE: position-watch.py retired — X11 placement uses PLAIN client coords
# on this box (proven 2026-10-11: the old -cx "mirror" compensated mirrored
# X READS, not mirrored placement — xlib reports negated values while the
# window itself obeys plain coords; KWin clamps truly-off-screen requests
# to 0,0). main.js places directly; the KWin pin backstops in compositor
# coords. Reloaded every launch, idempotent.
python3 -c "
import gi
gi.require_version('Gio', '2.0')
gi.require_version('GLib', '2.0')
from gi.repository import Gio, GLib
try:
    bus = Gio.bus_get_sync(Gio.BusType.SESSION, None)
    IF = 'org.kde.kwin.Scripting'
    # ponytail: verify the pin actually loads — an unloaded pin is exactly
    # how the island ends up compositor-centered instead of top-center.
    # loadScript answers the script id (>=0); unload-then-load keeps it fresh.
    bus.call_sync('org.kde.KWin', '/Scripting', IF, 'unloadScript', GLib.Variant('(s)', ('$DIR/kwin-pin.js',)), GLib.VariantType('(b)'), Gio.DBusCallFlags.NONE, 5000, None)
    res = bus.call_sync('org.kde.KWin', '/Scripting', IF, 'loadScript', GLib.Variant('(s)', ('$DIR/kwin-pin.js',)), GLib.VariantType('(i)'), Gio.DBusCallFlags.NONE, 5000, None)
    print('[kwin-pin] script id:', res.unpack()[0] if res else 'NO-REPLY (pin NOT loaded — island will be compositor-placed)')
except Exception as e:
    print('[kwin-pin] load failed:', e, '(pin NOT loaded — island will be compositor-placed)')
" 2>/dev/null || echo '[kwin-pin] dbus unavailable — pin NOT loaded'
# KWin: loaded scripts need an explicit start, and the Gio start call never
# resolves (journal: "Could not find slot"). busctl delivers it fine.
busctl --user call org.kde.KWin /Scripting org.kde.kwin.Scripting start 2>/dev/null || true
# ponytail: X11 platform (human order — best-and-reliable call 2026-10-11).
# Wayland clients cannot place windows (protocol forbids it) and this
# KWin 6.7.4 runs no scripts (broken start slot), so Wayland top-center
# is unachievable. Under X11 setPosition works (proven live) and main.js
# already owns plain coords + truthful settled proof. XCURSOR_SIZE keeps
# the pointer full-size over XWayland windows (1x cursors render tiny).
# If text renders soft at 4K, revert this one flag (placement dies with it).
XCURSOR_SIZE=48 exec ./node_modules/.bin/electron --ozone-platform=x11 --disable-gpu --enable-unsafe-swiftshader --remote-debugging-port=9335 .
