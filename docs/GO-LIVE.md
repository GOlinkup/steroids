# Steroids — Go-Live Facts (verified 2026-10-09, v0.1.1)

No marketing. Everything below was executed, not assumed.

## Requirements

- Python 3.9+, any static file server unnecessary (bridge serves UI).
- Node 22 + npm only to REBUILD the UI (`island-ui`, `npm run build`).
  The shipped `island-ui/dist` runs as-is.
- One agent CLI for chat/loops: `opencode` and/or `claude` on PATH.
  Without either, the island runs in mock mode (bridge says so honestly).
- Linux primary. macOS/Windows: all readers degrade to empty (proven by
  code audit — guarded paths, no crashes); first real Mac/Windows run
  still untested. bash 3-safe install script.
- Ports: 8096 (default). LAN mode: `--host 0.0.0.0`.

## Install (tested)

- Empty HOME: preflight refuses before copying anything (exit 1 path).
- Seeded HOME: installs, eval gate passes, hooks live, fresh binary
  indexes (1000 skills in test env, 1356 here).
- Live redeploy on a working machine: owner's call (install.sh is
  idempotent but rewrites the live binary mid-session).

## Eval numbers (live, 1356-skill index, 2026-10-09)

| Eval | n | P@1 | P@3 | leaks |
| --- | --- | --- | --- | --- |
| blind149 | 149 | 0.993 | 1.000 | 0 |
| second315 | 315 | 0.895 | 0.959 | 0 |
| live16 | 16 | 1.000 | 1.000 | 0 |

README snapshot (1265-frozen) still gates green (`benchmark.py --check`
passes). blind149 reads HIGHER than the published 0.799 — index growth
or methodology drift; flagged, not edited (owner's numbers).

## E2E batteries (all green)

- `e2e-loop/run.js` 18/18 localhost + 18/18 LAN-origin (real chromium,
  mobile touch + desktop), shots reviewed by eye.
- `e2e-loop/edge.js` 21/21 (validation, expiry, caps, malformed,
  concurrency, LAN guards, upload abuse).
- `e2e-loop/edge2.js` 38/38 (untested endpoints, clamps, loop jobs,
  isolation via `E2E_BASE`/`E2E_HOME`).
- `tests/test_island_ports.py` 18/18. Soak 300 reqs 0 fails.
- WS proven 3 ways (raw socket, Deno client, in-code isolation);
  this lab's Brave Nightly cannot do loopback WS — retest on real
  Chrome + physical phone before claiming mobile-relay victory.

## Known limits (say them upfront at launch)

- Away-from-home needs the user's own tunnel (docs/AWAY.md); hosted
  relay is premium, not built.
- Live dev-preview = dev-server URL over that tunnel; no in-island
  preview card yet.
- Off-LAN push: not built (managed delivery = premium).
- Team UX + judge + cost-assassin: premium concepts, not built.
- Physical phone + Mac/Windows runs: never executed here.
