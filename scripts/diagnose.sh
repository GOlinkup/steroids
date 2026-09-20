#!/usr/bin/env bash
# diagnose: one read-only command printing router/index/hook health.
# Run: bash scripts/diagnose.sh
set -u
BIN="$HOME/.local/bin/steroids"
LIVE_DATA="$HOME/.config/opencode/plugins/steroids"

echo "== binary =="
[ -x "$BIN" ] && echo "bin: $BIN" || echo "bin: MISSING ($BIN)"
"$BIN" --count 2>/dev/null || echo "count: FAILED"

echo "== index freshness =="
python3 - "$LIVE_DATA/skill-index.json" <<'EOF'
import json, os, sys, datetime
p = sys.argv[1]
try:
    idx = json.load(open(p)).get("index", {})
except Exception as e:
    print(f"index: UNREADABLE ({e})"); sys.exit()
mt = datetime.datetime.fromtimestamp(os.path.getmtime(p)).strftime("%Y-%m-%d %H:%M")
print(f"index: {len(idx)} skills, cache rebuilt {mt} (auto-rebuilds per-prompt on mtime change)")
EOF
echo "== hooks =="
bash "$(dirname "${BASH_SOURCE[0]}")/verify-hooks.sh" 2>&1 | grep -Ev "^ok:" || true
echo "== recent impressions =="
tail -3 "$LIVE_DATA/served.jsonl" 2>/dev/null || echo "(no served.jsonl yet)"
