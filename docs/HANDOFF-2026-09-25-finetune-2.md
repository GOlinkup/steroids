# Session handoff — 2026-09-25 · Finetune round 2 (uncommitted)

## What this session did (on top of STORY 1, also uncommitted)
- 3d-web-experience + asset-fetch trigger packs; Blender-look recipe appended
  to `skills/3d-web-experience/SKILL.md` (IBL/ACES/rig/shadow-catcher + checklist).
- NEG audit: pre-existing 3d-web guard was abstaining legit queries
  (`spinning rim on my 3d car`); expanded anchor set, stem-normalized entries.
- New `neg["asset-fetch"]` (generic download/free/model/character/animation
  must co-occur with an anchor: glb/gltf/fbx/bvh/mocap/rig/poly/pizza/...).
- Found + fixed live: hyphenated triggers/anchors are DEAD (tokenizer splits
  on hyphens; `poly-pizza` never matches). Rule added to CONTRIBUTING.md.
- Backlog #3 DONE: repo-vs-live sha8 WARN in `preflight_check.py` +
  `eval_gate.sh` (caught the exact stale-rules trap mid-session).
- Backlog #4 DONE (rule note in CONTRIBUTING.md). The reserialize damage from
  earlier sessions stands — do not reformat again, merge small.
- Backlog #2 DONE: `lint_skills.py --neg-check [skills]` (top-1 + generic-only
  ritual; 18 noisy flags → 1 accepted-noise after recalibration).
- Blender 4.2.3 LTS verified: `~/blender`, on PATH, desktop app registered,
  Cycles/CPU headless render proven (lit cube, pixel-verified).

## Verified (this session)
- Probes: 8/8 asset/blender/wheel queries top-1; 4/4 leak probes clean
  (docker/logrotate/loan/video); `car rental booking app` no-hijack holds.
- Known stale claim: STORY 1's `cinematic night car game → 3d-web` no longer
  holds (game-audio/3d-games win — arguably correct; index drift, not a bug).
- Gate: `eval_gate.sh` PASS (units + bench + freshness + README check).
- Bench: blind149 0.805/0.960, second315 0.886/0.956, leaks 0 — no regression.

## Open (not started)
- Backlog #1 attempts-to-PASS telemetry; #5 miss-golden TTL.
- `git status`: 17+ modified files across ≥2 live sessions — coordinate before
  committing; an `opencode` process was active in-repo during this session.
- Duel v2 stays PARKED per human. Commit split when approved:
  1. `fix(rules): ...` (triggers + both NEG guards)
  2. `feat(scripts): ...` (stale-guard + --neg-check + CONTRIBUTING rules)
