#!/usr/bin/env bash
# L-1 nightly wrapper: runs the three RQ-8 reports in order; any failure
# leaves an explicit dated ERROR marker (never silent absence).
set -u
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DATE="$(date +%F)"
LOG="$REPO/reports/cron-$DATE.log"
PYBIN="${PYBIN:-/usr/bin/python3}"
fail=0
run() { # $1 step name, $@ command
  local name="$1"; shift
  "$@" >>"$LOG" 2>&1 || { echo "ERROR $name failed (exit $?)" >>"$LOG"; fail=1; }
}
run nightly "$PYBIN" "$REPO/scripts/nightly_report.py"
run misses "$PYBIN" "$REPO/scripts/mine_misses.py"
# sync is best-effort (hub/network blip must not red-flag the night):
# yesterday's shared-rules copy stays valid, next night retries.
"$PYBIN" "$REPO/src/steroids/router.py" --sync-shared >>"$LOG" 2>&1 \
  || echo "WARN sync failed (exit $?) — shared rules keep yesterday's copy" >>"$LOG"
run trust "$PYBIN" "$REPO/scripts/trust_report.py"
# Mondays: trending-skills discover (report-only, never auto-installs).
if [ "$(date +%u)" = "1" ]; then
  bash "$REPO/scripts/trending-check.sh" >>"$LOG" 2>&1 || true
fi
if [ "$fail" -ne 0 ]; then
  echo "# Nightly ERROR $DATE — see cron-$DATE.log" > "$REPO/reports/nightly-$DATE-ERROR.md"
fi
exit "$fail"
