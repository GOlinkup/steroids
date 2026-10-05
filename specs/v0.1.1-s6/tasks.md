# Story S-V0.1.1-6: 3D mascot (Sprint 6, LAST)

Outcome: a lightweight 3D companion on the island — AFTER everything works.
Tool choice decided by recon numbers, not taste. Runs after Sprint 4 lands.

Task V0.1.1-6-1: tool recon — Blender-glTF vs procedural vs Rive (Jim)
Description: compare on numbers: APK/IPA size delta, offline capability,
  animation cost (fps + battery), pipeline weight (artist dependency?).
  Lean (not a ruling): procedural/Rive over Blender — town precedent ships
  light with procedural Three.js.
Do-not-touch: island UI (recon only, zero edits)
Acceptance:
- [ ] all three options scored on the same 4 numbers
- [ ] one recommendation with the numbers attached
- [ ] asset-IP check (no ripped models; Mojang-style IP rule stands)
Verification: read the comparison; numbers reproducible
Dependencies: V0.1.1-S4 (queued last, same hands)
Files likely touched: none (spec only)
Size: S

Task V0.1.1-6-2: build on recon GO (Jim)
Description: build the winner only, on explicit GO after recon review.
  Idle states + happy-jump on task finish (island pill language).
Do-not-touch: transport/briefing/socials (mascot reads state, never rewires)
Acceptance:
- [ ] mascot idles + reacts to task-finish events from the bus
- [ ] size + fps budgets from recon met or card stops
Verification: event → reaction demo; size/fps measured, not claimed
Dependencies: V0.1.1-6-1 recon GO
Files likely touched: mascot module (new files)
Size: M (capped — overruns stop, not sprawl)

Checkpoint CP-V0.1.1-6: mascot demoed on-device; v0.1.1 feature-complete.
