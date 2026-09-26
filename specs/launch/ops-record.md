# LCH-5 launch-day ops record

Date: 2026-09-23. Commit: `8fdbf84` (branch `fix/warnings-rebaseline`).
RQ tag: RQ-6. Release scope untouched.

## 1. Rollback rehearsal (run for real, timed)

Rollback = restore the live deployment to the last-known-good commit:
deploy files are plain copies from the repo (`install.sh`), so rollback is
`git checkout <good> -- <deploy paths>` + reinstall + verify.

Measured on this box (all steps executed, wall time):

| Step | Command | Time |
|------|---------|------|
| Deploy-allowed verdict | `bash scripts/eval_gate.sh` | **91 s** (PASS) |
| Copy 6 deploy files | `cp` router/net/embed/hook/rules/plugin + `chmod` | ~0 s |
| Verify | `steroids --count` → 1265 | **3.1 s** |
| Uninstall half | `rm` of the same paths (`--uninstall` list) | ~0 s |

**Time-to-rollback: ~95 s — under 2 minutes**, dominated by the eval gate.
Gate is the long pole and it is also the safety: a regressed tree refuses
deploy before any live file is touched (verified: gate fails closed).

Honest limits of this rehearsal:

- The uninstall-then-reinstall cycle was rehearsed against staging mirrors,
  NOT the live `$HOME`: running `--uninstall` on prod would break live hook
  calls for the ~95 s window. Every operation was timed for real; only the
  live mutation was withheld.
- The eval gate is HOME-sensitive (proven twice this session): under a bare
  drill HOME it fails — first on missing skills (preflight-equivalent), then
  on `goldens_per_skill` exit 1 against a 456-skill partial index. Rollback
  rehearsal is only meaningful on the prod-shaped machine.
- Per-query runtime rollback already exists independent of deploy: canary
  ranker exceptions fall back with `rolled_back: true` (`docs/canary.md`) —
  per-query, never global.

## 2. T+0–72h smoke-check list (launch window)

| When | Check | Command |
|------|-------|---------|
| T+0 (deploy) | Gate green | `bash scripts/eval_gate.sh` |
| T+0 | Index intact | `python3 src/steroids/router.py --count` (expect 1265) |
| T+0 | README claims match goldens | `python3 tests/benchmark.py --check` |
| T+0 | Hooks wired | `bash scripts/verify-hooks.sh` |
| T+0 | Sample route sane | `python3 src/steroids/router.py "build a flutter mobile app"` |
| T+24h | Claims still match | `python3 tests/benchmark.py --check` |
| T+24h | Served log alive | `tail -3 ~/.config/steroids/served.jsonl` (rows flowing, hash-only) |
| T+48h | Miss review | `python3 scripts/mine_misses.py` (triage clusters, human assigns) |
| T+48h | Latency spot | `python3 scripts/latency_bench.py 5000 50` (SLO p99 < 100 ms) |
| T+72h | Full suite | `python3 -m unittest discover -s tests -p "test_*.py"` |
| T+72h | Close-out | file results next to this record |

## 3. Support channel

No support channel is named anywhere in the repo (grep clean across
`LAUNCH.md`, `specs/launch/`).

- Channel: **TBC** — owner: **TBC** (human ask outstanding; SECURITY.md and
  CODE_OF_CONDUCT.md contacts are likewise TBC).
- Until named: launch-window issues go to the maintainer through the
  existing floor channel, and the T+0–72h list above is self-serve.
- Do not invent an address. This section closes when the human names
  channel + monitored owner.
