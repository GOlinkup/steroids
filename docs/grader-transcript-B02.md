# Grader transcript read-through — B-02 (P0-6 example)

Recorded 2026-09-24 from a real run on branch fix/warnings-rebaseline
(`phase0_harness.py` with partial-credit scoring). No model calls:
Steroids is a plugin — the host CLI owns its brain and its bill, so
the harness only runs deterministic graders and records rows.

Bank task: B-02 "status.py crashed on --help".

## Raw transcript

```text
$ python3 scripts/phase0_harness.py --tasks B-02 --trials 1 --arm host+steroids --out /tmp/p06-b02.csv
wrote 1 rows (B-02) to /tmp/p06-b02.csv
task digests (hash-only): B-02:5881847b5825
```

```csv
task_id,arm,trial,tokens_in,tokens_out,cost_usd,wall_s,interventions,rework,grader_pass,grader_score,notes
B-02,host+steroids,1,,,,0.23,0,0,1,1.0,grader-only; no model calls (host brain does the work)
```

## Read-through

1. `wrote 1 rows (B-02)` — one row per task per trial under the
   operator-supplied `--arm` label. The arm names the host-side
   condition the human executed (host-only vs host+steroids); the
   script itself never touches a model.
2. `task digests (hash-only): B-02:5881847b5825` — privacy rule holds: the
   log carries the task id + sha256 prefix, never the prompt text.
3. `grader_pass=1, grader_score=1.0` — the extracted grader
   (`python3 src/steroids/status.py --help`, allowlisted prefix) exited 0
   in an isolated TMPDIR; single sub-check, so pass and score agree.
4. `wall_s=0.23` — grader ran, not stubbed; sub-second wall fits a --help
   invocation (a hung grader would show the timeout note instead).
5. `notes=grader-only; ...` — no keys, no spend, zero billable runs.
6. Exit 0 overall (no REFUSE lines) — frozen golden record untouched
   before and after the probe.

## Verdict

PASS. Read this way, the transcript shows the grader graded
the outcome (`--help` exits 0, prints usage) without constraining how the
fix was written — outputs, not paths, per §11 rule 1.
