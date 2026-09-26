# Steroids router — trust report (1st edition)

_Published 2026-09-25 · bench commit `9ab02e7a681e` · sources: `nightly-2026-09-25.md`, `lint-2026-09-23.md`_

## Precision (labeled sets, 480 queries)
| set | n | P@1 | P@3 | MRR | leaks |
|-----|---|-----|-----|-----|-------|
| blind149 | 149 | 0.812 | 0.960 | 0.888 | 0 |
| second315 | 315 | 0.883 | 0.956 | 0.923 | 0 |
| live16 | 16 | 0.938 | 0.812 | 0.938 | 2 |

## Live traffic health (unlabeled — prompts are hash-only by design)
- today: 22 serves, 22 distinct queries, abstentions 1 (4.5%), unstable repeats 0
- all: 1694 serves, 1442 distinct queries, abstentions 26 (1.5%), unstable repeats 23

## Index hygiene (linter)
- 1265 unique skills (2686 files across harness homes), 422 frontmatter errors, 1273 warnings, 1265 cross-home shadows (first wins, by design)

## Method + limitations
- P@1 strict top-1; P@3 needs relevant-in-top-3 with zero excluded; MRR = mean 1/rank of first relevant in top-3.
- Live prompts are never stored (hash-only log), so traffic health is proxies: abstention (no confident skill), instability (same prompt, different top-1 across hits).
- Deploy is gated: install refuses on any unit/precision regression (see `scripts/eval_gate.sh`).
