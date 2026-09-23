# Grader transcript read-through — B-02 (P0-6 example)

Recorded 2026-09-23 from a real dry-run on branch fix/warnings-rebaseline
(`phase0_harness.py` with partial-credit scoring). No model calls.
Bank task: B-02 "status.py crashed on --help".

## Raw transcript

```text
$ python3 scripts/phase0_harness.py --tasks B-02 --trials 1 --dry-run --out /tmp/p06-b02.csv
wrote 2 rows (B-02) to /tmp/p06-b02.csv
task digests (hash-only): B-02:5881847b5825
```

```csv
task_id,arm,trial,tokens_in,tokens_out,cost_usd,wall_s,interventions,rework,grader_pass,grader_score,notes
B-02,model-only,1,,,,0.04,0,0,1,1.0,dry-run: no model calls; grader-only
B-02,model+steroids,1,,,,0.04,0,0,1,1.0,dry-run: no model calls; grader-only
```

## Read-through

1. `wrote 2 rows (B-02)` — both arms ran (model-only, model+steroids), 1
   trial each. Row count proves the paired shape, not just one arm.
2. `task digests (hash-only): B-02:5881847b5825` — privacy rule holds: the
   log carries the task id + sha256 prefix, never the prompt text.
3. `grader_pass=1, grader_score=1.0` on both rows — the extracted grader
   (`python3 src/steroids/status.py --help`, allowlisted prefix) exited 0
   in an isolated TMPDIR; single sub-check, so pass and score agree.
4. `wall_s=0.04` — grader ran, not stubbed; near-zero wall fits a --help
   invocation (a hung grader would show the timeout note instead).
5. `notes=dry-run: no model calls; grader-only` — skeleton mode confirmed;
   zero spend, zero keys.
6. Exit 0 overall (no REFUSE lines) — frozen golden record untouched
   before and after the probe.

## Verdict

PASS on both arms. Read this way, the transcript shows the grader graded
the outcome (`--help` exits 0, prints usage) without constraining how the
fix was written — outputs, not paths, per §11 rule 1.
