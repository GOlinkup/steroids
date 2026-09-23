# Story S-20: Phase 2 task engine (M6)

Outcome: a real feature driven through goal → tasks → evidence → verified
completion, with contracts enforced in code. Checkpoint CP-2 after P2-3
(object model review before contracts consume it).

Task P2-1: Goal/task JSON Schemas (M6)
Description: formalize the §9 task object (id, title, parent, status,
  goal, inputs, deps, questions, facts, unknowns, assumptions, context,
  actions, verification, evidence, failures, decisions) + the 11 statuses
  as versioned schemas.
Do-not-touch: src/ (schemas first)
Acceptance:
- [ ] specs/phase-2/task.schema.json + goal.schema.json validate samples
- [ ] all 11 statuses have documented entry/exit conditions
- [ ] our own specs/phase-0 tasks validate against the schema (dogfood)
Verification: validate samples + existing task files with a script
Dependencies: P1-1 (envelope conventions reused)
Files likely touched: specs/phase-2/*.schema.json
RQ tag: RQ-2 (feeds objective verification)
Size: S

Task P2-2: Hierarchy + status machine (M6)
Description: parent/child links, dependency edges, status transitions
  enforced (no illegal jumps, e.g. pending → completed).
Do-not-touch: router, benchmark
Acceptance:
- [ ] transition table implemented + unit-tested (all legal/illegal pairs)
- [ ] blocked records its missing input (never waits silently)
- [ ] cycle detection on dependency edges
Verification: unit tests incl. adversarial transitions
Dependencies: P2-1
Files likely touched: src/steroids/tasks.py, tests/test_tasks.py
RQ tag: RQ-2
Size: M

Task P2-3: Questions/assumptions/evidence wired to router (M6)
Description: task questions drive context retrieval (router queries seeded
  from task unknowns); assumptions carry confidence + status; evidence
  links to sources.
Do-not-touch: scoring weights (reuse, don't retune)
Acceptance:
- [ ] one task's unknowns demonstrably change retrieved context vs baseline
- [ ] assumption lifecycle demoed (unverified → verified | invalidated)
- [ ] CP-2 review of object model before contracts build on it
Verification: scripted demo with before/after context diff
Dependencies: P2-2
Files likely touched: src/steroids/tasks.py, tests/test_tasks.py
RQ tag: RQ-2
Size: M

Task P2-4: Completion contracts enforced (M6)
Description: task completes iff its contract's checks pass with evidence;
  agent-declared "done" without evidence is rejected by the machine.
Do-not-touch: human override path (must exist: explicit force-complete
  with reason, logged)
Acceptance:
- [ ] contract schema (required checks + evidence pointers)
- [ ] premature "done" rejected in a recorded demo (the fail-plausible test)
- [ ] force-complete path exists, logged, auditable
Verification: adversarial test (declare done early → rejected); unit tests
Dependencies: P2-3
Files likely touched: src/steroids/tasks.py, tests/test_tasks.py
RQ tag: RQ-2
Size: M

Task P2-5: End-to-end real feature (M6)
Description: drive one real Steroids feature (e.g. trial-policy bench or
  OTel emission) entirely through the engine, on the record.
Do-not-touch: nothing (this one touches the world — that's the point)
Acceptance:
- [ ] full trace: goal → tree → evidence → verification → report
- [ ] end-of-task report generated with real numbers
- [ ] retro notes what the engine caught that ad-hoc work would have missed
Verification: read the generated report; replay the trace from events
Dependencies: P2-4, P1-4 (streaming shows it live)
Files likely touched: (whatever the feature needs) + specs/phase-2/e2e-report.md
RQ tag: RQ-2
Size: M

Task P2-6: Phase 2 retro (M6)
Description: one page + M6 gate (task tree for one real feature, verified).
Do-not-touch: code
Acceptance:
- [ ] specs/phase-2/retro.md with keep/kill decisions
- [ ] M6 boxes ticked or cut in writing
Verification: read retro + gate record
Dependencies: P2-5
Files likely touched: specs/phase-2/retro.md
RQ tag: RQ-2
Size: S

Checkpoint CP-2: after P2-3 — object model reviewed before contracts.
