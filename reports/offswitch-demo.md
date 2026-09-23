# J100 off-switch demo — refusing nonsense live

_Recorded 2026-09-23 against the live index (dirty tree). Each nonsense query exits 0 with empty output: refused, not misrouted._

$ steroids 'asdf jkl qwer zxcv'
(no output — abstained, exit 0)

$ steroids 'blorp bluorp snorp'
(no output — abstained, exit 0)

$ steroids '!!! ??? ###'
(no output — abstained, exit 0)

## Honesty note
- Near-vocabulary noise still routes by design (typo-fix): `zzzqqq florp` -> distributed-training-megatron-core (flop), `qzx wv kq jx` -> model-architecture-torchtitan (wv).
- The off-switch covers true noise (above), not near-misses.
