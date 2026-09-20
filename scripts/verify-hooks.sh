#!/usr/bin/env bash
# verify-hooks-live: hard FAIL if the routing path is dead, WARN on missing harness wiring.
# Read-only. Run: bash scripts/verify-hooks.sh
set -u
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BIN="$HOME/.local/bin/steroids"
LIVE_DATA="$HOME/.config/opencode/plugins/steroids"
HOOK="$LIVE_DATA/hook.sh"
INDEX="$LIVE_DATA/skill-index.json"
fail=0

if [ -x "$BIN" ]; then echo "ok: binary executable"; else echo "FAIL: binary executable"; fail=1; fi
if cmp -s "$REPO/src/steroids/router.py" "$BIN"; then echo "ok: deployed == repo router.py"; else echo "FAIL: deployed == repo router.py"; fail=1; fi
if [ -f "$HOOK" ] && bash "$HOOK" --count 2>/dev/null | grep -qE "Indexed skills: [0-9]+"; then echo "ok: hook.sh forwards"; else echo "FAIL: hook.sh forwards"; fail=1; fi
if python3 -c "import json;assert len(json.load(open('$INDEX')).get('index',{}))>0" 2>/dev/null; then echo "ok: index non-empty"; else echo "FAIL: index non-empty"; fail=1; fi

warn() { # $1 desc, $2 pattern, $3 file
    if grep -qi "$2" "$3" 2>/dev/null; then echo "ok: $1"; else echo "warn: $1 (missing)"; fi
}
warn "claude hook registered" "steroids" "$HOME/.claude/settings.json"
warn "antigravity hook registered" "steroids" "$HOME/.gemini/antigravity-cli/hooks.json"
warn "opencode plugin registered" "steroids" "$HOME/.config/opencode/opencode.jsonc"
warn "opencode plugin file deployed" "SteroidsPlugin" "$HOME/.config/opencode/plugins/steroids-plugin.ts"

if [ "$fail" -eq 0 ]; then echo "hooks live"; else echo "hooks BROKEN"; fi
exit "$fail"
