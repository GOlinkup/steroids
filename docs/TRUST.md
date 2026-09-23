# Steroids router — trust report (1st edition)

_Published 2026-09-23 · bench commit `2da1f6441c8a` · sources: `nightly-2026-09-23.md`, `lint-2026-09-23.md`_

## Precision (labeled sets, 480 queries)
| set | n | P@1 | P@3 | MRR | leaks |
|-----|---|-----|-----|-----|-------|
| blind149 | 149 | 0.799 | 0.960 | 0.881 | 0 |
| second315 | 315 | 0.886 | 0.959 | 0.926 | 0 |
| live16 | 16 | 0.875 | 0.812 | 0.906 | 2 |

## Live traffic health (unlabeled — prompts are hash-only by design)
- today: 203 serves, 169 distinct queries, abstentions 13 (6.4%), unstable repeats 1
- all: 1308 serves, 1093 distinct queries, abstentions 13 (1.0%), unstable repeats 21

## Index hygiene (linter)
- 1265 unique skills (2686 files across harness homes), 422 frontmatter errors, 1273 warnings, 1265 cross-home shadows (first wins, by design)

## Method + limitations
- P@1 strict top-1; P@3 needs relevant-in-top-3 with zero excluded; MRR = mean 1/rank of first relevant in top-3.
- Live prompts are never stored (hash-only log), so traffic health is proxies: abstention (no confident skill), instability (same prompt, different top-1 across hits).
- Deploy is gated: install refuses on any unit/precision regression (see `scripts/eval_gate.sh`).
