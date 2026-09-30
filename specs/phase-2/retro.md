# P2 retro (M6) — one page

## What improved measurably
- Machine: 121-pair table + adversarial jumps green; block() bypass found
  by probe, fixed at root (routes through `can()`).
- Contracts: premature done rejected naming unmet checks (demo_p24
  recorded run); force-complete logged in `decisions[]`.
- Wiring: unknowns change golden top-5 (demo_p23); machine emits
  `task.state` with zero coupling (optional hook).
- E2E: S-25 goal, 3/3 tasks contracted→evidenced→completed, 12 events
  replayed from committed trace, report generated.

## What to stop doing
- Committing `--trials 1` probe runs (dirties frozen `trial-stats.json`;
  reverted twice — verify with `--trials 3` or accept the churn).
- One transient test failure in ~10 runs, unreproduced in 25 since;
  suspect 24-bit rand space in `ids.py` (3% birthday rate at n=1000).
  Flake watch, not a chase. Fix = wider rand, separate P1 commit.

## Kill/keep
- KEEP additive-only schema rule (P2-1 dogfood still green after P2-4).
- KEEP default-open gate (121-pair table untouched by P2-4).
- KEEP hand-seeded contracts (no parser in V1, per CP-2).

## M6 gate
- [x] task tree for one real feature, verified (S-25, e2e-report.md)
- [x] contracts enforced in code (complete/force_complete + tests)
- [x] trace replayable (e2e-trace.jsonl committed)
