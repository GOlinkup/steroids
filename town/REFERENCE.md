# STEROIDS TOWN — reference brief (for the builder)

## What you are making
World-evolution site: zoom ladder UNIVERSE -> EARTH -> ANCIENT (dinosaurs) ->
PRESENT -> FUTURE (generative, endless). The world builds ITSELF from real
Steroids learning counts (routes served, tokens saved, corrections filed,
misses-turned-skills). Every spawned object traces to a real number.
No mascot. No brain logo. Wordmark + one geometric mark.
Your 14 cards (st-01..st-14) are in the team ledger; STEP 01 file is
`step01-evolution.html`, VISION.md holds the locked direction.

## Reference 1: Token Town (THE inspiration) — https://sael.net/token-town/
By Ryan Sael. AI labs as corner shops sized by REAL OpenRouter token usage.
Study in browser: timelapse speeds, shutter light-streaks, Macro DOF lens,
day/night + hour scrub, glass HUD detail card per shop, keyboard map, honesty
footnote ("TOKEN USAGE & CROWDS: ILLUSTRATIVE").

How it is built (from page source, 2026-09-24):
- ONE static HTML file, no build, no framework.
- Three.js 0.183.2 via CDN importmap (`three`, `three/addons/`).
- Post: EffectComposer -> GTAOPass (AO) -> UnrealBloomPass -> OutputPass.
- Buildings 100% procedural: RoundedBoxGeometry + mergeGeometries, 4-6 shop
  styles with per-lab colors. Zero GLB. This is why it loads instantly.
- Data: OpenRouter catalog + rankings APIs live at load, dated SNAPSHOT
  (2026-09-17) baked in as fallback. Copy this pattern for our served counts.
- Crowds/traffic scale with the numbers. Spark icon brand, DM Sans glass HUD,
  mobile layout, prefers-reduced-motion respected, Umami analytics.
- Take: procedural + bloom + live-data-with-snapshot + honesty footnote.

## Reference 2: learnscape skill (technique package)
https://github.com/LaurentiuGabriel/learnscape — isometric explorable
explainers. Rules worth stealing: simulation must be REAL and testable with
the renderer removed; honesty ledger (computed / scaled / assumed / faked);
vehicle carries real state. SKIP its canvas-2D/isometric style — ours is 3D.

## Reference 3: Eliza Town (stack precedent)
https://github.com/ElizenDevVini/eliza-town — React + Three.js (R3F) +
Zustand, WebSocket live updates, KayKit assets. Confirms our later-phase
stack (React HUD + R3F + Zustand). NOT phase 1: we stay single-file static
until the world reads right, same as Sael.

## Do NOT copy
- Token Town's subject (AI-lab shops) — ours is time/evolution, districts are
  eras + (later) Steroids loop stages.
- Any mascot, brain imagery, or fake crowds. Real counts or honest labels.
- GLB asset hunting this phase. Procedural first; manifest (st-12) decides
  what ever needs modeling.
