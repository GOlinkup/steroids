# P0-3 task bank (M3, RQ-2) — 12/20 collected

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

```text
Task B-11: fresh-HOME install refused by live-index-calibrated gate
Type: bugfix
Session: 2026-09-24 R-1 live-verify (this repo, HOME=/tmp/fakehome seeded with 1 demo skill)
Observed: install.sh gate ran goldens_per_skill against the throwaway-HOME
  live index (1 skill) → 18 MISSING FROM INDEX → EVAL GATE FAILED, deploy
  refused. R-1 demands install green from clean state, but the gate is
  calibrated to the dev machine's exact index — clean state can never pass.
  Refusal itself was clean (no bin dir created, live files untouched).
Expected: eval_gate skips the live-index-only per-skill goldens when the
  failure is thin-index absence (MISSING FROM INDEX), with frozen golden
  still enforcing precision; genuine routing misses still refuse deploy +
  grader: seed 1-skill HOME=/tmp/fakehome, run install.sh, verify-hooks green
```

```text
Task B-07: pilot bank run skipped the B-05 grader (not allowlisted)
Type: test
Session: 2026-09-23 pilot bank run 8fdf1ee (this repo)
Observed: 4/5 graders pass; results.csv B-05 rows carry empty grader_pass
  with note grader-skipped-not-allowlisted — pilot silently under-covers.
Expected: register/allowlist the B-05 grader (or equivalent) +
  grader: rerun pilot, results.csv shows zero empty grader_pass rows for
  banked tasks
```

```text
Task B-08: report-cleanup glob deleted tracked files
Type: chore
Session: 2026-09-23 v1-lch1-ci session (this repo)
Observed: rm reports/lint-*.md reports/latency-*.md removed TRACKED
  lint-2026-09-23.md + latency-2026-09-23.md; restored via git checkout.
Expected: cleanup scoped to just-created untracked names (or git clean -n
  preview first) +
  grader: run the cleanup, git status --porcelain reports/ shows no D lines
```

```text
Task B-09: full unittest discovery hangs on network/live tests
Type: test
Session: 2026-09-23 v1-lch1-ci resume checks (this repo)
Observed: python3 -m unittest discover -s tests exceeded 300s
  (live_probe/network tests); only scoped file runs completed.
Expected: discovery excludes network-dependent tests (split/fast subset) +
  grader: timeout 120 python3 -m unittest discover -s tests exits 0
```

```text
Task B-10: skill-lint check writes a dated report into the repo
Type: chore
Session: 2026-09-23 v1-lch1-ci verify (this repo)
Observed: python3 scripts/lint_skills.py wrote reports/lint-2026-09-24.md,
  dirtying the tree; manual rm needed (which risks B-08).
Expected: check mode writes nothing into the repo (stdout only, or tmp) +
  grader: run the lint, git status --porcelain shows no new files
```

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

```text
Task B-12: live install refused by genuine per-skill golden miss after index drift
Type: test
Session: 2026-09-24 live install (this repo, real HOME, 1774 skills vs 1265 golden snapshot)
Observed: eval gate red at goldens_per_skill — MISS exp=csharp-testing
  got=csharp-pro/csharp-testing/dotnet-backend on "fluentassertions should".
  No code changed since green 2026-09-23; live index grew 1265→1774 and new
  distractor csharp-pro steals top-1. Thin-index skip correctly did NOT fire
  (genuine miss, not absence). Live files untouched by refusal.
Expected: triage the miss (is csharp-pro the better answer? narrow golden to
  drift-stable skills, or retune) until gate green +
  grader: bash install.sh on live HOME passes gate, verify-hooks green
```

_slots B-13..B-20 open — paste failures as they happen._
