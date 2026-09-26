# Story S-00: Phase 0 baseline harness (M1–M4, RQ-1, RQ-2)

Outcome: host with/without-plugin measured on 20 real tasks with CIs, kill
criterion evaluated, go/no-go recorded.
criterion evaluated, go/no-go recorded. All tasks S/M size. Checkpoint CP-0
after P0-3 (review task bank before building harness).

Task P0-1: Reference environment freeze (M1, RQ-1)
Description: write benchmarks/REFERENCE.md with index size, skill-rules
  hash, model versions, vectors digest, commit hash.
Do-not-touch: src/, tests/, skill-rules.json
Acceptance:
- [x] benchmarks/REFERENCE.md exists with all five values
- [x] values re-verified by an independent re-read (same output twice)
- [x] committed on the working branch
Verification: cat benchmarks/REFERENCE.md; sha256sum skill-rules.json;
  python3 src/steroids/router.py --count
Dependencies: None
Files likely touched: benchmarks/REFERENCE.md
RQ tag: RQ-1
Size: S

Task P0-2: Trial policy in bench (M2, RQ-1)
Description: benchmark.py gains --trials N; every reported number carries a
  95% bootstrap CI (stdlib only); golden re-measured with trials.
Do-not-touch: golden snapshot contents (benchmarks/golden-1265/ frozen)
Acceptance:
- [x] python3 tests/benchmark.py --golden --trials 5 prints mean + CI per metric
- [x] 0.799 re-measured with trials; CI recorded in metadata-adjacent note
- [x] unit test for CI math on synthetic data (no model calls)
Verification: python3 tests/benchmark.py --golden --trials 5;
  python3 tests/test_router.py
Dependencies: Task 1
Files likely touched: tests/benchmark.py, tests/test_router.py
RQ tag: RQ-1
Size: M

Task P0-3: Collect 20 real tasks (M3, RQ-2)
Description: bank 20 tasks from actual failures/sessions across types
  (docs/chore first, then features); each in §2 task format with reference
  solution or unambiguous pass/fail.
Do-not-touch: src/, benchmarks/
Acceptance:
- [ ] specs/phase-0/task-bank.md holds 20 tasks, type-labeled
- [ ] every task has reference solution or deterministic grader
- [ ] reviewed at CP-0 before harness work starts
Verification: grep -c "^Task" specs/phase-0/task-bank.md (== 20);
  human review sign-off line in file
Dependencies: None (parallel with Tasks 1–2)
Files likely touched: specs/phase-0/task-bank.md
RQ tag: RQ-2
Size: M (mostly waiting on reality, not writing)

Task P0-4: Bank grader recorder (M4, RQ-2)
Description: script runs the bank's deterministic graders, isolated
  trials, one CSV row per task per trial under a human-supplied --arm
  label; the operator executes the host CLI with/without the plugin and
  fills tokens/cost from their own bill. Steroids makes no model calls,
  holds no keys, spends nothing.
Do-not-touch: golden snapshot; router scoring code
Acceptance:
- [ ] harness script runs full bank unattended (grader-only)
- [ ] per-task metrics CSV (wall time, grader pass/score; tokens/cost left for host-side runs)
- [ ] trials isolated (clean env each run, no state leakage)
Verification: run harness on 2 sample tasks end-to-end; inspect CSV columns
Dependencies: Tasks 2, 3
Files likely touched: scripts/phase0_harness.py, specs/phase-0/results.csv
RQ tag: RQ-2
Size: M

Task P0-5: Baseline report + kill evaluation (M4, RQ-2)
Description: analyze results with CIs; evaluate kill criterion; record
  go/no-go with evidence.
Do-not-touch: raw results (append analysis, never edit)
Acceptance:
- [ ] specs/phase-0/baseline-report.md with mean + CI per arm per metric
- [ ] kill criterion verdict written (go / simplify / stop) with numbers
- [ ] human sign-off line
Verification: read report; check every claim cites a CSV row or CI
Dependencies: Task 4
Files likely touched: specs/phase-0/baseline-report.md
RQ tag: RQ-2
Size: S

Task P0-6: Grader rules adopted (M4, RQ-2)
Description: codify outputs-not-paths, partial credit, reference solutions,
  transcript reads, calibration policy into the harness + task template.
Do-not-touch: collected task bank contents
Acceptance:
- [x] docs/TASK_SYSTEM.md § grader subsection added (or linked policy file)
- [x] harness applies partial-credit scoring where tasks have sub-checks
- [x] one transcript read-through recorded as example
Verification: grep grader policy file exists; run harness --help shows policy
Dependencies: Task 4 (parallel with Task 5)
Files likely touched: docs/TASK_SYSTEM.md, scripts/phase0_harness.py
RQ tag: RQ-2
Size: S

Checkpoint CP-0: after Task 3 — review bank (types covered? graders
deterministic?) before Task 4 consumes it.
