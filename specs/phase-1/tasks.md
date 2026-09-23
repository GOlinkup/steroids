# Story S-10: Phase 1 event system (M5)

Outcome: every run observable live in the CLI; events in CloudEvents
envelope, file sink, run/task IDs. Checkpoint CP-1 after P1-3 (schema +
bus review before CLI work consumes it).

Task P1-1: Event schema as CloudEvents (M5)
Description: define the event catalog (task.*, context.*, skill.*,
  action.*, verification.*, failure.*, recovery.*, memory.*,
  human.approval.*) as a versioned JSON Schema file with CloudEvents
  envelope fields (id, source, type, time, subject, data).
Do-not-touch: src/ (schema first, code after)
Acceptance:
- [x] specs/phase-1/events.schema.json exists and validates a sample event
- [x] every §17 event type from the vision has an entry or a cut note
- [x] schema version field present (v0.1)
Verification: python3 -c json.load of schema + sample; grep catalog covers
  all 9 families
Dependencies: SP-2 decided (emission shape informs envelope)
Files likely touched: specs/phase-1/events.schema.json
RQ tag: RQ-4 (feeds M7)
Size: S

Task P1-2: Run/task ID issuance (M5)
Description: every run gets RUN-ID, every task TASK-ID; IDs flow into all
  events and logs.
Do-not-touch: router scoring code
Acceptance:
- [x] ID format documented (sortable, unique, human-readable)
- [ ] IDs present in served.jsonl new fields without breaking old readers
- [x] unit test: 1000 IDs, all unique, all match format
Verification: run ID generator unit test; inspect sample log line
Dependencies: P1-1
Files likely touched: src/steroids/ids.py (new, tiny) or router addition
RQ tag: RQ-4
Size: S

Task P1-3: Bus with file sink (M5)
Description: in-process event bus (stdlib only) + append-only JSONL sink;
  emit on route/verify/fail/recover paths.
Do-not-touch: scoring semantics (emit around, never inside, hot paths)
Acceptance:
- [x] bus module with subscribe/emit; sink writes valid JSONL per event
- [x] golden benchmark output bit-identical with bus on vs off
- [ ] CP-1 review of schema + bus before CLI work
Verification: diff golden output both modes; unit test emit/subscribe/replay
Dependencies: P1-1, P1-2
Files likely touched: src/steroids/bus.py, tests/test_bus.py
RQ tag: RQ-4
Size: M

Task P1-4: CLI live stream (M5)
Description: `steroids status` (or --watch) tails the bus: goal, current
  step, context selected/ignored, verification, failures/recoveries.
Do-not-touch: deploy paths (install.sh, hooks)
Acceptance:
- [x] streaming view works against a recorded event file (no live run needed)
- [ ] works against a live run without slowing it (>5% overhead fails)
- [x] readable in 80-col terminal
Verification: demo against fixture events; time a benchmark with/without tap
Dependencies: P1-3
Files likely touched: src/steroids/status.py (new)
RQ tag: RQ-4
Size: M

Task P1-5: Phase 1 retro (M5)
Description: one-page retro: what improved measurably, what to stop doing.
Do-not-touch: code
Acceptance:
- [x] specs/phase-1/retro.md written with at least one kill/keep decision
- [x] M5 gate reviewed (streaming + envelope + IDs all demoed)
Verification: read retro; check M5 milestone boxes ticked or cut
Dependencies: P1-4
Files likely touched: specs/phase-1/retro.md
RQ tag: RQ-4
Size: S (XS, honestly — one page)

Checkpoint CP-1: after P1-3 — schema + bus reviewed before P1-4 builds on it.
