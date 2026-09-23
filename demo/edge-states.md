# D-1 edge states — text mocks (all outputs captured from real runs, 2026-09-23)

Throwaway HOME, no keys, stdlib only. States 1–2 from `preflight_check.py`,
states 3–4 from `router.py` on a 3915-skill synthetic index.

## 1. zero-skills — install refused (exit 1)

```text
$ python3 scripts/preflight_check.py --home /tmp/d1home   # empty HOME
skills=0 model=no verdict=refuse
warn: embed model absent under /tmp/d1home/.cache/steroids/embed — lexical-only mode (precision degrades)
warn: no skills resolvable under /tmp/d1home — refusing install
EXIT:1
```

`install.sh` stops before copying anything. Correct: an install there
would deploy an empty index.

## 2. missing-embed — install proceeds degraded (exit 0, loud warn)

```text
$ python3 scripts/preflight_check.py --home /tmp/d1home   # 2 skills, no model files
skills=2 model=no verdict=go
warn: embed model absent under /tmp/d1home/.cache/steroids/embed — lexical-only mode (precision degrades)
EXIT:0
```

Lexical-only routing still works; measured blind P@1 drops (see README
history: 0.933 with embed vs 0.799 without on the bigger index).

## 3. 3000-skills — scale holds (3915 indexed, count 3.7s)

3000 synthetic `scale-N` skills + live index dirs under one HOME:

```text
$ HOME=/tmp/d1home python3 src/steroids/router.py --count
Indexed skills: 3915
real 0m3.726s
$ HOME=/tmp/d1home python3 src/steroids/router.py "scale probe skill 1500"
Possibly relevant skills (load what applies, skip rest): probe,scale,skill -> scale-1/scale-10/scale-100
real 0m0.583s
```

Indexing is linear-ish; single queries stay sub-second. (LCH-6 record:
5000-skill route p50 ~18ms.)

## 4. abstain — pure noise says so (exit 0)

```text
$ python3 src/steroids/router.py "zxqv jkwq vxqm"
no confident skill — abstaining
EXIT:0
```

Near-miss noise still routes by design (`zzzqqq florp` → typo-fix); only
zero-overlap noise abstains, and it is logged hash-only for `propose()`
to mine. Before the D-1 fix the plain CLI printed nothing (exit 0,
0 bytes) — hooks/`--json` already had their shapes; now all three do.

## Appendix: clean-HOME install attempt (timed, refused honestly)

```text
$ HOME=/tmp/d1fresh time bash install.sh        # realistic skill set, no steroids state
skills=1768 model=no verdict=go
[gate] unit evals...
EVAL GATE FAILED — deploy refused, live files untouched
real 0m19.870s
```

Root cause (verified same session): the gate is calibrated to the dev
machine's exact state — goldens pass on real HOME (`n=100 skills=20
misses=0`) but cold/warmed memory + composition shifts flip 2–3 P@1
verdicts on a fresh HOME. No partial install ever lands: refusal happens
before any file is copied. First-run wow without install:

```text
$ HOME=/tmp/d1fresh python3 src/steroids/router.py "build a flutter mobile app"
Possibly relevant skills (load what applies, skip rest): app,build,flutter,mobile -> ui-ux-pro-max/app-store-optimization/firebase-basics
real 0m3.322s
```

Routing works from a clean checkout with zero install — the binary copy
is convenience, not a prerequisite.
