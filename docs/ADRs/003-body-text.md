# ADR 003 — Body-text ablation (SP-3, RQ-7)

Date: 2026-09-23. Trials policy: same as golden (`--trials 3` + 10k bootstrap).
Status: KEEP desc-level embed, DEFER full-body indexing.

## Numbers (blind149 frozen golden-1265-2026-09-23, rerunnable)
- lex-only (`embed_weight=0`): P@1=0.638 P@3=0.859, 21.5ms/q
- lex+embed desc (`embed_weight=3.0`, name+keywords+desc[:800]): P@1=0.799
  P@3=0.960, 38.7ms/q
- ΔP@1=+0.161, ΔP@3=+0.101, Δlatency=+17.1ms/q
- Golden with CIs: P@1 0.799 95% CI [0.732, 0.859]; P@3 0.960 [0.926, 0.987];
  deterministic True (`benchmarks/golden-1265/trial-stats.json`)

Rerun: `python3 tests/benchmark.py --golden --trials 3` then the inline
ablation in this ADR's commit message (route_query with/without embed).

## Near-duplicate audit
Golden penalizes correct near-duplicate picks (e.g. `dart-flutter-patterns`
vs `flutter-expert`, `code-review` vs `git-workflow`); instability list in
nightly report (21 unstable repeats / 1308 serves) overlaps these twins.
Effect: reported P@1 understates user-accept P@1. Next: false-negative
filter for twin pairs before claiming a regression.

## Decision
KEEP desc-level embed (biggest P@1 lever, +17ms acceptable offline).
DEFER full SKILL.md body indexing: desc[:800] already captures the signal;
full bodies add tokens/latency for marginal expected gain. Revisit with a
bi-encoder top-20 → cross-encoder rerank experiment only if P@1 stalls.
