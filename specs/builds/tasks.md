# Story S-30: §26 build-outs (M7–M9)

Outcome: durability demonstrated, OTel emission live, adversarial dimension
reported, body-text decision implemented. Each builds only after its spike
ADR is recorded — no ADR, no build.

Task B-1: Durable execution build (M?, RQ-3)
Description: implement the SP-1 ADR decision; demonstrate kill -9 resume
  with completed side effects never re-issued.
Do-not-touch: router scoring; benchmark harnesses
Acceptance:
- [ ] kill -9 mid-task resumes from last completed step (recorded demo)
- [ ] completed side effects provably never re-issue (fan-out case covered)
- [ ] ADR decision + rejected alternatives linked in handover
Verification: run kill -9 demo twice (same outcome); unit tests for step
  boundaries; grep ADR exists
Dependencies: SP-1 (ADR recorded), P2-2 (task states to persist)
Files likely touched: per ADR (new module under src/steroids/)
RQ tag: RQ-3
Size: M

Task B-2: OTel emission build (M7, RQ-4)
Description: emit the §17 bus as OTel spans/events in a CloudEvents
  envelope; a run renders in an unmodified dashboard.
Do-not-touch: event names already consumed by CLI (additive only)
Acceptance:
- [ ] run renders in stock OTel dashboard with zero custom glue
- [ ] content capture defaults off (sensitive-data rule honored)
- [ ] emission overhead measured (<5% task cost or cut scope)
Verification: dashboard dump attached to handover; overhead timing logged
Dependencies: SP-2 (ADR recorded), P1-3 (bus exists)
Files likely touched: src/steroids/otel.py (new), tests/test_otel.py
RQ tag: RQ-4
Size: M

Task B-3: AgentDojo dimension (M8, RQ-5)
Description: harness reports Utility + Utility-Under-Attack; defenses
  evaluated, never assumed.
Do-not-touch: golden snapshot; Utility scoring semantics
Acceptance:
- [ ] both numbers produced on one documented run
- [ ] defense set named with measured ASR delta (not asserted)
- [ ] per-cycle cost recorded against §8 budget
Verification: rerun harness command from handover, same pair of numbers
Dependencies: SP-4 (suites scoped), Task 2 (trial policy)
Files likely touched: scripts/agentdojo_harness.py (new)
RQ tag: RQ-5
Size: M

Task B-4: Body-text implementation (M9, RQ-7)
Description: apply the SP-3 keep/drop decision; if keep, index bodies and
  re-baseline golden + metadata together (never numbers without snapshot).
Do-not-touch: live skill files
Acceptance:
- [ ] SP-3 decision applied exactly as recorded
- [ ] if keep: --golden + --check green on new numbers + metadata
- [ ] ΔP@1 vs Δtokens/Δlatency published in handover
Verification: python3 tests/benchmark.py --golden --check (both green)
Dependencies: SP-3 (ablation recorded)
Files likely touched: src/steroids/router.py, benchmarks/golden-*/metadata.json
RQ tag: RQ-7
Size: M
