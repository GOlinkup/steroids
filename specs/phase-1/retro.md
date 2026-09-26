# P1 retro (M5) — one page

## What improved measurably
- Trials+CIs live: P@1 0.799 [0.732, 0.859], P@3 0.960 [0.926, 0.987],
  deterministic True (`benchmark.py --golden --trials 3` PASS).
- Embed ablation: lex-only 0.638 → lex+embed 0.799 (+0.161, +17ms/q). KEEP.
- Adversarial: 50 typo rows 0 top-3 misses; injection proxy 12 rows 0 misses.
- Bus/IDs/schema/status new, golden bit-identical (router never imports bus).

## What to stop doing
- Naming attack targets in injection tests (lex hit ≠ vulnerability).
- Editing deployed binary alone (source is `src/steroids/`, deploy copies).

## Kill/keep
- KEEP desc-level embed; DEFER full-body indexing, native OTel SDK,
  Temporal server, multi-agent, dashboard (ADR-001..005).
- M5 gate: streaming + envelope + IDs demoed (`status.py` 80-col OK).

## Carry to P2
Durability binds task engine (router stateless; JSONL append = crash-safe,
replay = resume). P2 needs kill-9 resume with no double side-effects.
