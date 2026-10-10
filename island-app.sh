#!/usr/bin/env bash
# Steroids Island app window — floating top-center island, no browser chrome.
# Usage: island-app.sh [--install]  (--install adds it to the app menu)
set -euo pipefail
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BASE="http://127.0.0.1:8096"
# transparent island — never bg=black (that was the opaque brave fallback
# that looked like a chrome window). Electron paints only the pill.
URL="$BASE/?app=1"
DESKTOP="$HOME/.local/share/applications/steroids-island.desktop"

if [ "${1:-}" = "--install" ]; then
  mkdir -p "$(dirname "$DESKTOP")"
  cat > "$DESKTOP" <<EOF
[Desktop Entry]
Type=Application
Name=Steroids Island
Comment=Floating AI crew island (top-center, no browser chrome)
Exec=$REPO/island-app.sh
Icon=$REPO/island-ui/public/icon-192.png
Terminal=false
Categories=Utility;
StartupWMClass=SteroidsIsland
EOF
  echo "installed — find 'Steroids Island' in the app menu."
  exit 0
fi

# bridge up? start it if not (durable now: mid-turn work reattaches).
if ! curl -sf -o /dev/null --max-time 2 "$BASE/health"; then
  nohup python3 "$REPO/island/bridge.py" --serve >>/tmp/opencode/island-live.log 2>&1 &
  for _ in $(seq 1 20); do
    curl -sf -o /dev/null --max-time 1 "$BASE/health" && break
    sleep 0.5
  done
fi

# real app window: Electron frameless transparent always-on-top island.
# (brave --app was the bug — opaque 1000x800 rect that looked like chrome.)
# pkill any leftover brave island first so only the island remains.
pkill -f "steroids-island-chrome" 2>/dev/null || true
exec "$REPO/island-app/run.sh" >/dev/null 2>&1
