# Release draft — UNRELEASED (do not publish as-is)

Benchmark + story-chain snapshot for the next tagged release.
Covers r329–r348 (bench harness through J-batch) on top of the P00/G61 base.

## Measured truth (pristine HEAD, `scripts/bench.py --record` + `--replay`)

| set | n | P@1 | P@3 | MRR | leaks |
|-----|---|-----|-----|-----|-------|
| blind149 | 149 | 0.705 | 0.866 | 0.780 | 0 |
| second315 | 315 | 0.803 | 0.914 | 0.861 | 0 |
| live16 | 16 | 0.875 | 0.750 | 0.875 | 2 |
| replay | 480 queries | — | — | — | 0 drifts |

Deploy gate (`scripts/eval_gate.sh`, wired first in `install.sh`):
unit evals + bench compare; refusal before any live file is copied.
Verified: refuses dirty tree (known foreign unit red), passes pristine,
full install body verified against temp HOME (1265 indexed, hooks live,
`--explain` smoke green, live binary untouched).

## Shipped this cycle

- Bench + baselines, `--replay` per-query drift, nightly dashboard,
  skill linter (422 name-mismatches found, 1265 shadows mapped),
  one-index agreement (14/14 across harness homes), install gate,
  trust report 1st edition, nightly/author/cost/digest reports,
  dup detector, changelog, stack tours, menubar widget, explorer
  (<2s via baked layout), replay scrubber, off-switch demo.
- E-batch (9), F-batch (9 UX), G-batch (8), H-batch (10), I-batch (10),
  J-batch (8): all per-story commits, all green, STORIES ticked.

## Known drift (read-only findings, not fixed here)

- README results table (2026-09-20: blind 0.933/0.993, live 0.938/0.812/3,
  second 0.886/0.962) no longer matches measured truth above. Candidates:
  P00a–g routing changes, corpus growth, embed on/off differences.
  Owner must re-run and refresh the table before release.
- Live binary (`~/.local/bin/steroids`) predates this cycle — `install.sh`
  refresh needed at ship time (gate must be green first).
- Temp-HOME installs degrade: skill dirs + embed model resolve via `$HOME`,
  so a bare temp HOME yields an empty/lexical-only index. Consider an
  install.sh preflight check.
