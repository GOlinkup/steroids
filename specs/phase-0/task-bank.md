# P0-3 task bank (M3, RQ-2) — 5/20 collected

Rule: real failures/sessions only, never synthetic. Each entry needs a
reference solution or deterministic grader + type label, else CP-0 rejects it.

## Format per task
```text
Task B-NN: <title>
Type: docs | chore | feature | bugfix | refactor | api | db | auth | test | deploy
Session: <date + link/pointer to failing session>
Observed: <what the agent did wrong, 1-2 lines>
Expected: <reference solution or grader command>
```

## Bank

```text
Task B-01: block() bypassed the status machine
Type: bugfix
Session: 2026-09-23 P2-2 live-review (this repo)
Observed: block() set any state incl. completed/cancelled to blocked,
  skipping the 121-pair table. Found by probe, not by tests.
Expected: git show 16e889c -- src/steroids/tasks.py (can() guard) +
  grader: python3 -m unittest tests.test_tasks.TestMachine.test_block_respects_machine
```

```text
Task B-02: status.py crashed on --help
Type: bugfix
Session: 2026-09-23 P1-fix session (this repo)
Observed: CLI treated --help as a bus file path -> FileNotFoundError.
Expected: git show 22c409f -- src/steroids/status.py +
  grader: python3 src/steroids/status.py --help (exit 0, prints usage)
```

```text
Task B-03: ids.valid rejected its own run-/task- IDs
Type: bugfix
Session: 2026-09-23 P1-fix session (this repo)
Observed: valid(run_id()) False — prefix-strip checked "-run-" not "^run-".
Expected: git show 22c409f -- src/steroids/ids.py +
  grader: python3 -c "from steroids.ids import valid,run_id,task_id,new_id; assert all(map(valid,(new_id(),run_id(),task_id())))"
```

```text
Task B-04: --trials 1 probe dirtied the frozen golden record
Type: chore
Session: 2026-09-23 P2-2 verification (this repo)
Observed: benchmark run overwrote trial-stats.json trials 3 -> 1, twice.
Expected: git checkout -- benchmarks/golden-1265/trial-stats.json +
  grader: git diff --quiet benchmarks/golden-1265/trial-stats.json
```

```text
Task B-05: single transient test failure, cause unknown
Type: test
Session: 2026-09-23 P2-5 verification (this repo)
Observed: 1 failure in 15, then 125+ green incl. 100-run hunt. Suspect
  ids.py 24-bit rand birthday collision (~3% at n=1000). Unproven.
Expected: fix = wider rand in ids.py + 200-run clean hunt (open) +
  grader: looped unittest runs, zero failures
```

_slots B-07..B-20 open — paste failures as they happen._

```text
Task B-06: fresh-HOME install wrote index to the wrong dir
Type: bugfix
Session: 2026-09-23 R-1 live-verify (this repo)
Observed: install created real ~/.config/steroids, so reindex cached
  skill-index.json there while verify-hooks looked under opencode plugins;
  masked on live HOME by a symlink. Plus uninstall left skill-needs/proof
  sidecars, blocking dir removal.
Expected: git show 14f6b12 -- install.sh (symlink + sidecar cleanup) +
  grader: HOME=/tmp/fakehome style install, verify-hooks green, uninstall
  leaves zero traces
```
