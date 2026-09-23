# ADR 005 — V1 scope cut + per-phase kill numbers (10/10 gate)

Date: 2026-09-23. Status: locked.

## V1 ships iff ALL hold (unchanged from V1_PLANNING §1)
RQ-1 frozen golden green with trials+CIs; RQ-2 MODEL vs MODEL+STEROIDS
separation on 20 real tasks; RQ-3 kill-9 resume; RQ-4 unmodified OTel
dashboard render; RQ-5 Utility-Under-Attack reported; RQ-6 clean
install/uninstall on 4 harnesses.

## Cut to later (explicit, not implied)
Multi-agent, reviewer layer, knowledge graph, giant dashboard, daemon/server,
marketplace, federated/team rollout, model hosting, router fine-tuning.
Each needs its own ADR + eval before re-entering scope.

## Per-phase kill numbers (no phase proceeds on vibes)
- P0 baseline: MODEL+STEROIDS must beat MODEL-only on 20 real tasks with
  non-overlapping 95% CIs or scope cuts to routing+verification only.
- P1 events: golden output bit-identical bus on vs off; overhead <5%.
- P2 task engine: one real feature end-to-end through goal/task/evidence
  objects with completion contract enforced, or cut to state-only.
- Context router: +ΔP@1 must exceed +Δlatency budget (17ms/q reference,
  ADR-003) or keep lex-only.
- Memory: retention AND forgetting tested; junk-drawer growth fails the phase.
- Verification: every COMPLETED needs evidence against its contract; a
  passing build with a wrong feature is failure.
- Recovery: repeat-failure rate must drop on injected-failure benchmark or
  scope cuts to detect+escalate (no auto-retry).
- Durability: kill-9 resume with no double side-effects or no durability claim.
