#!/usr/bin/env bash
# Steroids installer — idempotent, never breaks the live harness.
# Canonical source: this repo. Live paths: ~/.local/bin/steroids,
# ~/.config/opencode/plugins/steroids/ (data), ~/.config/opencode/plugins/steroids-plugin.ts.
set -euo pipefail
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LIVE_DATA="$HOME/.config/opencode/plugins/steroids"
BIN="$HOME/.local/bin/steroids"

# r356 preflight: HOME-without-skills refuses before anything runs.
python3 "$REPO/scripts/preflight_check.py" || { echo "PREFLIGHT FAILED — refusing install under this HOME"; exit 1; }

# D32 gate: eval regression refuses deploy (nothing copied yet at this point).
bash "$REPO/scripts/eval_gate.sh" || { echo "EVAL GATE FAILED — deploy refused, live files untouched"; exit 1; }

mkdir -p "$LIVE_DATA" "$HOME/.local/bin"
cp "$REPO/src/steroids/router.py" "$BIN"
chmod +x "$BIN"
cp "$REPO/src/steroids/net.py" "$HOME/.local/bin/net.py"
cp "$REPO/src/steroids/embed.py" "$HOME/.local/bin/embed.py"
cp "$REPO/src/steroids/hook.sh" "$LIVE_DATA/hook.sh"
cp "$REPO/skill-rules.json" "$LIVE_DATA/skill-rules.json"
cp "$REPO/plugins/opencode/steroids-plugin.ts" "$HOME/.config/opencode/plugins/steroids-plugin.ts"
mkdir -p "$HOME/.config/steroids"
cp "$REPO/src/steroids/steroids2d.py" "$HOME/.config/steroids/steroids2d.py"
echo "Installed: $BIN + plugin. Index at $LIVE_DATA/skill-index.json"
"$BIN" --reindex --count
bash "$REPO/scripts/verify-hooks.sh"
