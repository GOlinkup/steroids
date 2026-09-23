# D40 Canary routing — design + flag

5% traffic to a candidate ranker, auto-rollback on error. Mechanism
shipped (`canary_bucket`, `canary_route`); ranker-v2 plugs in later.

## Design
- Sampling: deterministic sha-bucket per prompt (`canary_bucket`), so a
  query always takes the same lane (debuggable, no RNG state).
- Default pct=5. The canary lane calls `ranker=`; today that defaults to
  the primary path (mechanics proven, no behavior change).
- Auto-rollback: ANY exception in the canary ranker falls back to
  `route_query`, increments `rolled_back`, and attaches
  `rolled_back: true` to the result. Rollback is per-query, never global.
- Counters (`CANARY_STATS`): canary / primary / rolled_back volumes for
  the dashboard (D35) to watch.
- Promotion rule (not yet automated): canary graduates iff 7-day bench
  delta >= 0 AND rolled_back == 0; otherwise the flag stays an experiment.

## Flag
`pct` parameter (0 = off). CLI wiring is a follow-up; the function ships
with pct=5 default.
