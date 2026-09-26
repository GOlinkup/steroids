# Steroids Town — a knowledge town (STEP 01)

Single-file interactive 3D town (`step01-evolution.html`) where 12 knowledge
domains are sized and crowded by real served-log routing counts.

## Run

Serve over http (live snapshot) — `file://` falls back to the baked snapshot:

```sh
python3 -m http.server 8095
# open http://127.0.0.1:8095/step01-evolution.html
```

No build, no npm. Three.js via CDN import map.

## What's inside

- **4 hero buildings, 12 infos** — flat-top floor stacks (1 floor ≈ 75 learns,
  1 lit window row per floor), auto-rotating tour through all 12 domains
- **Living crowd** — voxel pedestrians with GPU gait, sidewalk lanes,
  CatmullRom routes, queues with rope barriers, sliding entry doors,
  lobby pacing, cross-plaza visits (three-pathfinding navmesh)
- **Free-flow traffic** — loop + central + cross-street cars, spinning wheels,
  brake-glow taillights, shutter-gated light trails + pedestrian smears
- **Honest data** — snapshot learns size towers/crowds; entry pace follows
  real daily volume; 1 door entry = 1 live learn; towers grow floors live
- **Cinematic camera** — front-side framing, slow drift orbit, macro DOF,
  day/night cycle, timelapse 2×/16×/48×/96×
- **Controls** — ←/→ shops · space pause · T speed · D macro · [ ] shutter ·
  H help · drag orbit · scroll zoom

## Files

- `step01-evolution.html` — the town (everything)
- `town-data.js` + `snapshot.json` + `trends.json` — live-data layer
- `REFERENCE.md` / `VISION.md` — direction briefs
- `vendor-ref/` — reference drops (licenses only)
