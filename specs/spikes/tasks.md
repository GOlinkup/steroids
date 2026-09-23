# Spikes SP-1..SP-4 (question-first, timeboxed, knowledge output)

Outcome: four recorded decisions (durability, OTel shape, body-text, AgentDojo scope) with rejected alternatives. No ADR, no downstream build.
Rule: stated question + deadline + written output (ADR), or it becomes the
project. Outputs land in docs/ADRs/ (create dir on first spike).

Task SP-1: Durability decision (M?, RQ-3)
Description: answer DBOS-shaped vs Temporal vs Inngest for offline-first
  durability; record ADR with rejected alternatives.
Do-not-touch: src/ (spike output is knowledge, never product code)
Acceptance:
- [x] docs/ADRs/001-durable-execution.md exists (choice + 2 rejections + why)
- [x] decision respects offline-first + solo-operable constraints
- [x] timebox honored (2 days max, then decide with available evidence)
Verification: cat docs/ADRs/001-durable-execution.md
Dependencies: P2 task-engine draft readable (for interface fit)
Files likely touched: docs/ADRs/001-durable-execution.md
RQ tag: RQ-3
Size: S (timeboxed investigation, not implementation)

Task SP-2: OTel emission shape (M7, RQ-4)
Description: emit natively in OTel GenAI semconv vs translate at export;
  sketch emission point in event bus.
Do-not-touch: src/ (knowledge only)
Acceptance:
- [x] docs/ADRs/002-otel-emission.md (native vs translate + why)
- [x] attribute list mapped (gen_ai.request.model, usage, finish reasons)
- [x] content-capture default decided (mirrors OTel opt-in)
Verification: cat docs/ADRs/002-otel-emission.md
Dependencies: P1 event schema drafted
Files likely touched: docs/ADRs/002-otel-emission.md
RQ tag: RQ-4
Size: S (1 day)

Task SP-3: Body-text ablation (M9, RQ-7)
Description: measure bodies-indexed vs not on golden: ΔP@1 vs Δtokens/latency;
  record keep/drop.
Do-not-touch: golden snapshot contents
Acceptance:
- [x] ablation numbers run (same trials policy as golden)
- [x] keep/drop recorded with ΔP@1, Δtokens, Δlatency
- [x] near-duplicate false-negative audit included
Verification: rerun ablation command from the ADR text, same numbers
Dependencies: Task 2 (trial policy)
Files likely touched: docs/ADRs/003-body-text.md (+ temp scripts, removed after)
RQ tag: RQ-7
Size: M (2 days, mostly compute)

Task SP-4: AgentDojo scoping (M8, RQ-5)
Description: which suites map to the coding-agent threat model; cost estimate
  for a Utility + Utility-Under-Attack run.
Do-not-touch: src/, benchmarks/
Acceptance:
- [x] suite list with mapping rationale
- [x] cost estimate recorded (per-cycle budget input)
- [x] defense set named (tool scoping + detector baseline)
Verification: cat docs/ADRs/004-agentdojo-scope.md
Dependencies: None
Files likely touched: docs/ADRs/004-agentdojo-scope.md
RQ tag: RQ-5
Size: S (1 day)
