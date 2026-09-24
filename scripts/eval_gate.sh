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
python3 tests/goldens_per_skill.py >> /tmp/gate_units.log 2>&1
echo "[gate] bench precision vs baseline..."
python3 scripts/bench.py > /tmp/gate_bench.log 2>&1
echo "[gate] README claims match golden metadata..."
python3 tests/benchmark.py --check > /tmp/gate_bench_check.log 2>&1
echo "[gate] PASS — deploy allowed"
