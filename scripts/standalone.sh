#!/usr/bin/env bash
# Steroids standalone launcher — no VS Code, no terminal babysitting.
# Attach-or-start: never kills anything; a live bridge is reused as-is.
# Usage: standalone.sh [--check] [--install] [--electron] [--port N]
set -euo pipefail
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PORT="${PORT:-8096}"
BASE="http://127.0.0.1:${PORT}"
LOG="${XDG_STATE_HOME:-$HOME/.local/state}/steroids/bridge.log"

healthy() { curl -sf -o /dev/null --max-time 2 "$BASE/health"; }

if [ "${1:-}" = "--check" ]; then
  command -v python3 curl >/dev/null || { echo "MISSING: python3/curl"; exit 1; }
  [ -f "$REPO/island-ui/dist/index.html" ] || { echo "MISSING: island-ui/dist (run: npm --prefix island-ui run build)"; exit 1; }
  if healthy; then echo "OK: bridge live at $BASE (attached, nothing started)"; else echo "OK: bridge down, launcher would start it (port $PORT free)"; fi
  exit 0
fi

if [ "${1:-}" = "--install" ]; then
  mkdir -p "$HOME/.local/share/applications"
  cat > "$HOME/.local/share/applications/steroids-standalone.desktop" <<EOF
[Desktop Entry]
Type=Application
Name=Steroids (standalone)
Comment=Launch Steroids island without VS Code
Exec=$REPO/scripts/standalone.sh --electron
Terminal=false
Categories=Utility;
EOF
  echo "installed — 'Steroids (standalone)' in the app menu."
  exit 0
fi

# Bridge: attach if live, else start detached (refuse if port held by stranger).
if healthy; then
  echo "bridge already live at $BASE — attached."
elif (exec 3<>"/dev/tcp/127.0.0.1/${PORT}") 2>/dev/null; then
  echo "port $PORT busy but not our bridge — refusing (Dispatch = sign-off)."; exit 1
else
  mkdir -p "$(dirname "$LOG")"
  # ponytail: detached single bridge; per-user supervisor if this ever matters
  nohup python3 "$REPO/island/bridge.py" --serve >>"$LOG" 2>&1 &
  for _ in $(seq 1 20); do healthy && break; sleep 0.5; done
  healthy || { echo "bridge failed to come up — see $LOG"; exit 1; }
  echo "bridge started at $BASE (log $LOG)."
fi

# Shell: browser by default; Electron pill only on request.
if [ "${1:-}" = "--electron" ]; then
  if [ -x "$REPO/island-app/node_modules/.bin/electron" ]; then
    (cd "$REPO/island-app" && exec ./node_modules/.bin/electron --ozone-platform=x11 . "$BASE/?app=1")
  else
    echo "electron shell not built — opening browser instead."
    xdg-open "$BASE/" || echo "open $BASE/ in your browser."
  fi
else
  echo "open $BASE/ in your browser (or re-run with --electron for the pill shell)."
  xdg-open "$BASE/" 2>/dev/null || true
fi
