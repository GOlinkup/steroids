# HANDOFF — V1 build session, 2026-09-23

Branch `fix/warnings-rebaseline`, tree clean at write time. Resume:
`git log --oneline -6` (expect `c9214d2` on top),
`python3 -m unittest tests.test_tasks tests.test_bus tests.test_otlp tests.test_durable` (expect 21 OK),
`bash scripts/eval_gate.sh` (expect PASS).

## Landed this session (oldest → newest)
- `ae7fcab` P2-1 schemas+dogfood · `16e889c` P2-2 machine (block-bypass fixed at root) ·
  `7ed1278` P2-3 seed/lifecycle+CP-2 approved · `0bd34c7` P2-4 contracts ·
  `bb1db96` P2-5 S-25 e2e (12-event trace) · `67ce34f` P2-6 retro+M6 gate
- `22c409f` P1 fixes · `ddb9856` bank 5/20 · `7579d41` M7 Jaeger render (RQ-4) ·
  `04cb1d3` RQ-3 kill-9 demo · `610482a` RQ-6 uninstall · `c9214d2` eval-gate fix (phantom distractor)

## Rules earned (don't re-learn)
- One task/session; CP gates before building on a model; commit per task.
- Probes overwrite frozen records: never `--trials 1` on golden (revert if so).
- Jaeger binary lives in /tmp (not repo). AgentDojo pip-installed (user site).
- Free tier only: no model keys, no billable runs without a cap.

## Open (in order)
1. Bank 15/20 real failures (human-paced) → P0-4 harness → P0-5 M4 kill verdict
2. M8 AgentDojo on existing harness (inventoried: 4 suites/97 tasks, v1.2.2)
3. RQ-6 live reinstall (gate green now) · M10 ship review · RQ-8 trend
- Watch: 1 unreproduced test transient (suspect ids.py 24-bit rand, 125+ green since)
