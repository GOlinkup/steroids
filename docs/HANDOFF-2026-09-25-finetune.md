# Session handoff — 2026-09-25 · Finetune completion (STORY 1 of 3)

## What this session did
The human said "im finetuning steroids now i did half of it". Buffy reviewed
the half-done finetune (rated 8/10, direction right), found 3 landmines, and
**completed all of them in this session — done, verified, uncommitted.**

## Done 1 — NEG guard for 3d-web-experience (was landmine #1)
- Proof of bug: `car rental booking app` routed to `3d-web-experience`
  (bare `car` trigger — the exact missloop Class-B hijack the docs warn about).
- Fix: `skill-rules.json` → new `neg["3d-web-experience"]` entry:
  - bad = car, render, rotation, spin, rolling, cinematic, photorealistic, product
  - good = three, webgl, 3d, scene, blender, aces, filmic, ibl, hdri, pbr,
    wheel, axle, drift, skid, eevee, cycles, turntable, game
  - Also added `wheel-spin` trigger (distinct from generic `spin`).
- Verified after: `car rental booking app` → ito-training/shopify-apps (✅ no
  hijack), `cinematic night car game` → 3d-web-experience still fires (✅),
  golden bench P@1 0.799 / P@3 0.960 / leaks 0 → **PASS, zero regression**.

## Done 2 — asset-fetch verified real (was landmine #2)
- `steroids/skills/asset-fetch/SKILL.md` EXISTS (29 lines: poly.pizza/
  Quaternius/Mixamo/Sketchfab recipe, glb magic-byte verify, CC-BY notes).
  Not a ghost — the earlier `ls` that missed it was a glob quoting error.
- Trigger wiring verified: glb/gltf/fbx/poly-pizza/quaternius/mixamo/
  sketchfab/asset-file/mocap in `skill-rules.json["skills"]`.

## Done 3 — D37 noise gate for miss mining (was landmine #3)
- `scripts/mine_misses.py` now filters mash clusters before they reach the
  human G61 queue. Catches: no-vowel runs, 4+ char runs, home-row keyboard
  walks (asdf/jkl/qwer/zxcv), shared pseudo-word codas (blorp/bluorp/snorp
  all end `-orp`), pure repeats.
- 17/17 unit cases pass: all real queries (memory persist vault, flutter
  listview memoize, rotor shear stress, deploy kubernetes cluster...) kept;
  asdf/blorp/aaaa/repeat queries filtered.
- Live pipeline check: 3 clusters in → `memory persist vault` kept,
  2 mash clusters filtered. Report header now states the filter count.
- test_router.py + test_oneindex.py: OK.

## ⚠️ One thing the human MUST know
The router reads the DEPLOYED rules at `~/.config/steroids/skill-rules.json`,
NOT the repo copy. Buffy copied the repo file over the live one this session
(same thing install.sh does). If anything rewrites the live file, re-deploy:
```bash
cp ~/steroids/skill-rules.json ~/.config/steroids/skill-rules.json
```

## Next actor instructions (fresh session, cold)
1. Review the diffs: `git -C ~/steroids diff skill-rules.json scripts/mine_misses.py`
2. Run the gate: `python3 ~/steroids/scripts/eval_gate.sh`
3. If green, commit (suggested split):
   - `fix(rules): NEG guard for 3d-web-experience bare-car hijack + wheel-spin trigger`
   - `feat(mine): D37 noise gate — mash clusters never reach the G61 human queue`
4. Re-run `python3 tests/benchmark.py --golden` after commit; README table
   must not drift (`--check` gate enforces it).

Do-not-touch: benchmarks/golden-1265/*, router.py scoring core (per house rule).
