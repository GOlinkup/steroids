# LCH-6 scale record — route latency at 5000-skill pool

Date: 2026-09-24 (runs ~00:37 local)
Commit: `2bf14b9b019e7929f41ea86dc1a1e4d1e941e5c5` (branch `fix/warnings-rebaseline`)
RQ tag: RQ-6. Golden snapshot untouched.

## Method

Rerunnable load command (stdlib only, single-threaded, no model calls, no keys):

```
python3 scripts/latency_bench.py 5000 50
```

What it does: synthesizes a deterministic 5000-skill keyword index, runs
`route_query` over 50 fixed queries, reports mean/p50/p99 of per-query
wall time. Runner also writes `reports/latency-<date>.md` (evidence copy,
left uncommitted).

## Hardware

- CPU: Intel i7-7600U @ 2.80GHz, 4 cores
- RAM: 30 GB total / 23 GB available at run time
- Python 3.14.7
- Box was loaded during all runs (load avg ~10 on 4 cores — other floor work);
  figures below include that noise, see limitations.

## Figure (3 runs, same command)

| run | mean | p50 | p99 | max | SLO p99<100ms |
|-----|------|------|------|------|---------------|
| 1 | 23.05 ms | 20.07 ms | 56.17 ms | 56.17 ms | PASS |
| 2 | 17.85 ms | 17.38 ms | 33.63 ms | 33.63 ms | PASS |
| 3 | 19.01 ms | 17.85 ms | 42.46 ms | 42.46 ms | PASS |

Published figure: **pool 5000 skills → p50 ≈ 17–20 ms, p99 ≈ 34–56 ms**,
3/3 runs PASS vs the 100 ms SLO.

## Honest limitations

- Variance is real, not hidden: p99 spread 34→56 ms across runs tracks the
  loaded box (load ~10). Same figure twice was NOT achieved; the range above
  is the figure. Re-verify on a quiet box for a tighter number.
- Synthetic keyword index, not the live skill corpus (live index is 1265 per
  `benchmarks/REFERENCE.md`); real-query mix will differ.
- Single-threaded in-process timing only — no server, no concurrency, no
  embed-model cost (router keyword path).
- Baseline health at this commit: full unittest suite 189/189 OK (272 s).
