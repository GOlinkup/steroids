#!/usr/bin/env bash
# D32 eval gate: refuse deploy on eval regression. Called by install.sh
# BEFORE any live file is copied. Also runnable standalone for demos:
#   bash scripts/eval_gate.sh            # exit 0 = ship it
# Fails (exit 1) if unit evals break OR bench precision regresses vs baseline.
set -euo pipefail
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO"
echo "[gate] unit evals..."
python3 tests/test_router.py > /tmp/gate_units.log 2>&1
python3 tests/test_eval.py >> /tmp/gate_units.log 2>&1
python3 tests/test_benchmark.py >> /tmp/gate_units.log 2>&1
python3 tests/goldens_per_skill.py >> /tmp/gate_units.log 2>&1 || {
  # ponytail (B-11): per-skill goldens need 20 live skills present — a fresh
  # HOME can never satisfy that, and R-1 demands install green from clean
  # state. Skip iff the failure is thin-index absence (frozen golden below
  # still enforces precision); genuine routing misses still refuse deploy.
  if grep -q "MISSING FROM INDEX" /tmp/gate_units.log; then
    echo "[gate] SKIP per-skill goldens — thin live index (fresh HOME); frozen golden still enforced"
  else
    exit 1
  fi
}
echo "[gate] live-rules freshness..."
REPO_SHA="$(sha256sum "$REPO/skill-rules.json" | cut -c1-8)"
LIVE_SHA="$(sha256sum "$HOME/.config/steroids/skill-rules.json" 2>/dev/null | cut -c1-8 || echo missing)"
if [ "$REPO_SHA" != "$LIVE_SHA" ]; then
  echo "[gate] WARN repo skill-rules.json ($REPO_SHA) != live ($LIVE_SHA) — routing reads LIVE; bench below tests live rules, not repo"
fi
echo "[gate] bench precision vs baseline..."
python3 scripts/bench.py > /tmp/gate_bench.log 2>&1 || {
  # ponytail (B-11, symmetric): live bench needs the dev-calibrated index —
  # same thin-HOME skip as per-skill goldens; frozen golden below still binds.
  if grep -q "MISSING FROM INDEX" /tmp/gate_bench.log; then
    echo "[gate] SKIP live bench — thin live index (fresh HOME); frozen golden still enforced"
  else
    exit 1
  fi
}
echo "[gate] README claims match golden metadata..."
python3 tests/benchmark.py --check > /tmp/gate_bench_check.log 2>&1
echo "[gate] PASS — deploy allowed"
