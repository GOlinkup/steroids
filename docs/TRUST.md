# Steroids router — trust report (1st edition)

_Published 2026-09-27 · bench commit `10b80366cb9b` · sources: `nightly-2026-09-27.md`, `lint-2026-09-26.md`_

## Precision (labeled sets, 480 queries)
| set | n | P@1 | P@3 | MRR | leaks |
|-----|---|-----|-----|-----|-------|
| blind149 | 149 | 0.993 | 1.000 | 0.997 | 0 |
| second315 | 315 | 0.898 | 0.959 | 0.932 | 0 |
| live16 | 16 | 1.000 | 1.000 | 1.000 | 0 |

## Live traffic health (unlabeled — prompts are hash-only by design)
- today: 0 serves, 0 distinct queries, abstentions 0 (0.0%), unstable repeats 0
- all: 2031 serves, 1758 distinct queries, abstentions 27 (1.3%), unstable repeats 24

## Index hygiene (linter)
- 1353 unique skills (2863 files across harness homes), 590 frontmatter errors, 1362 warnings, 1352 cross-home shadows (first wins, by design)

## Method + limitations
- P@1 strict top-1; P@3 needs relevant-in-top-3 with zero excluded; MRR = mean 1/rank of first relevant in top-3.
- Live prompts are never stored (hash-only log), so traffic health is proxies: abstention (no confident skill), instability (same prompt, different top-1 across hits).
- Deploy is gated: install refuses on any unit/precision regression (see `scripts/eval_gate.sh`).
