# Task System — the 10/10 way to work tasks (solo dev + AI agents)

Sources: GitHub Spec Kit (SDD 1.0.0), GitHub Copilot task docs, RPAC workflow,
task-stratified PR study (MSR'26, 7,156 PRs), Vercel agent-eval criteria,
agent-taskbench contract, Anthropic eval guides. Every rule below traces to one.

## 1. Hierarchy (4 levels, no more)

- **Story** — user-visible outcome (e.g. "frozen golden benchmark"). Has
  acceptance criteria. Spans 1–5 tasks. Maps to RQ tags + milestones.
- **Task** — one focused session, one commit (format §2). S/M size only.
- **Spike** — timeboxed question, output is knowledge + ADR, never product
  code (SP-1..4 in planning pack).
- **Checkpoint** — after every 2–3 tasks: tests + build + human review before
  proceeding. Named explicitly (CP-1, CP-2…), never implicit.

## 2. Task file format (all fields required — a task missing any is not ready)

```text
Task [N]: [title — no "and" or it is two tasks]
Story: [parent story + milestone, e.g. M2]
Description: one paragraph: OUTCOME, never implementation.
Do-not-touch: [files/areas explicitly out of scope]
Acceptance (≤3 bullets, machine-checkable):
- [ ] ...
Verification: [exact commands — never "works" or "looks right"]
Dependencies: [task numbers or None]
Files likely touched: [...]
RQ tag: [RQ-x from planning pack]
Size: [S: 1–2 files | M: 3–5 files]
```

Field rationale: description-without-implementation lets the agent choose the
approach (agents beat humans only when free to choose); do-not-touch stops
drift into unrelated code/dependencies; ≤3 bullets forces splitting;
commands-as-verification makes success machine-checkable (test-first handoff
is the most reliable agent pattern); files-likely-touched bounds context;
RQ tag gives traceability; size gates executability.

## 3. Definition of Ready (task starts iff ALL true)

1. All §2 fields filled, acceptance ≤3 bullets.
2. Dependencies completed (or explicitly waived with reason).
3. Verification commands exist and run on current tree (red or green, not missing).
4. Size S or M (L+ → split first, no exceptions).
5. Fresh session available; branch/commit checkpoint taken before agent starts.

## 4. Definition of Done (task ends iff ALL true)

1. Every acceptance bullet demonstrably true (paste evidence, not claims).
2. Verification commands run green AFTER the change.
3. No files outside Files-likely-touched modified (or diff justified inline).
4. One commit, message references Task [N] + RQ tag.
5. Independent check where the agent authored tests (same-source tests prove
   consistency, not correctness — Vercel criterion; human or separate grader
   re-verifies).
6. Handover note: what changed, why, deviations from plan, review guide
   (paste-ready PR description).

## 5. Execution protocol (per task)

```
fresh session → read task file → implement → verify (commands) →
tick acceptance → commit → handover → human review at checkpoint
```

Rules: one task per session (context hygiene); git checkpoint before agent
starts (safety net); never batch unreviewed tasks (reviewer attention is the
bottleneck currency, not agent speed); agent output >300 lines in one
generation → stop and chunk (error rate spikes past that).

## 6. Split signals (any one fires → split before starting)

- Would take >1 focused session (~2h agent work).
- Acceptance needs >3 bullets.
- Touches ≥2 independent subsystems.
- Title contains "and".
- Expected output >300 lines or >5 files.

## 7. Tracking layout (repo-native, offline-first)

```
specs/
  <milestone>/          e.g. specs/M2-trial-policy/
    story.md            story + acceptance + RQ tags
    tasks.md            Task [N] files in §2 format
    RESULT.md           per-task outcomes (pass/fail + evidence + cost)
```

Why repo-native over a tracker: grep-able, versioned, offline, directly
consumable as agent context (PanDev: design docs live in repo or evaporate).
GitHub Issues optional mirror only. Task states: ready → running → verifying
→ done | blocked (blocked records the missing input, never waits silently).

## 8. Stratification + metrics (every task feeds eval)

- Sample work across task types (docs/chore first — 82–84% acceptance —
  before features — 66%; MSR'26). Never benchmark on one type.
- Per task record: tokens in/out, cost, wall time, interventions, rework.
  These roll up to Phase 0 metrics for free.

## 9. Anti-patterns (immediate stop + replan)

Agent edits its own test assertions to pass; scope drift beyond
Files-likely-touched; two sessions on the same failure without new evidence;
acceptance "verified" by reading code instead of running commands; batching
past a checkpoint; starting a task with unmet dependencies.

## 10. Reference story (format exemplar — first real story)

```text
Story S-01: Reference environment freeze (P0-1, M1, RQ-1)
Outcome: any future run reproduces today's index numbers bit-for-bit.

Task 1: Record environment snapshot
Description: write benchmarks/REFERENCE.md with index size, skill-rules
  hash, model versions, vectors digest, commit hash.
Do-not-touch: src/, tests/, skill-rules.json
Acceptance:
- [ ] benchmarks/REFERENCE.md exists with all five values
- [ ] values re-verified by an independent re-read (two commands, same output)
- [ ] committed on the planning branch
Verification: cat benchmarks/REFERENCE.md; sha256sum skill-rules.json;
  python3 src/steroids/router.py --count
Dependencies: None
Files likely touched: benchmarks/REFERENCE.md
RQ tag: RQ-1
Size: S
```

---

*Status: task system v1.0 (this doc). Format is frozen; fields change only via
change control with reason. First executable story: S-01 above — say go.*
