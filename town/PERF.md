# STEROIDS TOWN — perf audit (st-21, measured 2026-09-24)

Measure-only. Zero edits to `step01-evolution.html` (Kevin mid-STEP-2).
Harness: headless Chromium 152 + CDP (`/tmp/st21/probe.mjs`, scratch),
1280x800 desktop + 390x844 mobile, cache disabled (true cold load).

## Measured (commit 1499b7a, st-18 amend)

| metric | desktop 1280x800 | mobile 390x844 |
|---|---|---|
| cold load (navigate -> load event) | 2091 ms | 1376 ms |
| transfer (wire) | 442 KB (416 KB three.js CDN) | 452 KB (426 KB CDN) |
| JS heap used / total | 5.6 / 6.8 MB | 5.5 / 7.8 MB |
| console errors / failed reqs / longtasks>200ms | 0 / 0 / 0 | 0 / 0 / 0 |
| settled fps (rAF x3s) | 1 | 1 |
| render proof | shot clean: 12 shops, HUD card, sparkline | shot renders; 2 defects below |

Top wire cost: `three.core.js` 255 KB + `three.module.js` 126 KB
(jsdelivr, brotli). Page shell 20 KB. Data JSONs ~5 KB combined.

## Mobile 390px: CONDITIONAL (2 defects filed, Kevin's lane)

- M1: horizontal overflow — `scrollWidth` 413 > viewport 390 (+23px).
- M2: header collision — "Steroids Town" title overlaps the
  Previous / 1-of-12 / Next pills (see `/tmp/st21/mobile.png`).
- Card, sparkline, shops all legible otherwise. No js errors on either pass.

## Honest gaps (not measured, why)

- Settled device fps: this box has no GPU; headless falls back to
  SwiftShader software GL, so 1fps is an environmental floor, NOT the
  page's real frame rate. Real-GPU pass (device or phone) outstanding.
- Draw calls / tris: the module script keeps `renderer` in closure scope;
  no probe seam exists. Proposed one-liner for Kevin (st-19 or later):
  `window.__townStats = () => renderer.info;` — then this audit re-runs
  the same probe and fills the row without touching render code.

## Budgets (st-13 input; fail = card)

- Cold load < 3000 ms broadband (now 2091 / 1376 — PASS with headroom).
- Transfer < 500 KB (now 442 / 452 — PASS; three.js CDN is 94%).
- JS heap < 16 MB settled (now ~5.5 — PASS).
- 60fps on real GPU, 12 shops + <=400 crowd + 10 cars (UNPROVEN — device pass).
- Zero console errors, zero failed requests (now clean — PASS).
- 390px: zero horizontal overflow + no header overlap (now FAIL M1/M2).

Re-run: serve repo dir on :8901, `node /tmp/st21/probe.mjs [desktop|mobile]`
(scratch probe, not committed). Shots land next to the JSON in /tmp/st21/.
