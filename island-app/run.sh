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
# NOTE: position-watch.py retired — external moves are ignored by the
# compositor here; main.js compensates the mirrored write path instead.
# KWin notch pin: the compositor itself keeps the island top-center
# (X11 clients see a mirrored view on this box, so only KWin-side
# enforcement is trustworthy). Reloaded every launch, idempotent.
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
exec ./node_modules/.bin/electron --ozone-platform=wayland --disable-gpu --enable-unsafe-swiftshader --remote-debugging-port=9335 .
