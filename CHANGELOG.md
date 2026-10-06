# Changelog

Format follows Keep a Changelog. Versions: `0.1.1` (current, pyproject).

## [Unreleased]

- Island is now a live agent companion (the Coucou killer feature, our
  own plumbing): Claude Code hooks and an OpenCode events plugin
  (`plugins/opencode/steroids-events.ts`) append normalized events to
  `~/.config/steroids/agent-events.jsonl` via
  `island/hook_relay.py` (exit-0, never blocks an agent). New stdlib
  ledger `island/agentlog.py`: live agent state (thinking / working /
  finished / error), activity ticker with per-edit diffs ("Edit app.py
  +12 -3"), per-session transcripts. Island gains a Sessions tab (live
  state card + session history + transcript view) and the pill shows
  agent state live with the happy jump when a task finishes.
- Chat upgrades: provider picker (router / claude / opencode — claude
  via `-p --output-format stream-json`, multi-turn via `--resume` +
  stream-json in/out; opencode via `run --format json --session`),
  streaming bubbles with live tool ticker, persistent chat history
  (`agent-chat.jsonl`, survives restarts), and **editable sent
  messages** — click any of your bubbles to edit and resend, which
  branches the conversation (✎ marks edited bubbles).
- One-time setup: `python3 island/app.py --install-hooks` merges the
  hook config into `~/.claude/settings.json` (idempotent, additive) and
  copies the relay + OpenCode plugin into place.
- Tests: `tests/test_agentlog.py` (13 cases: normalize, store, state
  machine, transcripts, chat edit/branch, relay subprocess); wired into
  CI.
- Version is now single-sourced from `pyproject.toml`: MCP `serverInfo`
  and `get_version()` fallback read it live, the island pill uses the
  same value, and static files (`fsm.js`, `fsm.ts`, `index.html`) are no
  longer version-stamped. New `tests/test_island_fsm_parity.py` gates
  `island/fsm.js` vs `island-ui/src/fsm.ts` delay defaults in CI.
- Coucou study snapshot rescued from `/tmp/opencode/coucou-study` into
  `docs/coucou-study/` (code+docs, MIT; Mochi art/sounds/icons stripped,
  provenance in `docs/coucou-study/NOTICE.md`).
- Island app (`island/app.py`, stdlib tkinter only): real always-on-top
  top-edge bar — `hidden` (hover top-center to peek) / `flex` / `jacked`
  / `pump` greeting, pixel mascot at 60 fps, pill tails live hints from
  `served.jsonl` with happy jump on fresh routes. Overview apes the
  reference layout (tabs, character card + pipeline checklist, live
  route card, 2x2 skill pills) with our art and data. Clickless
  operation (hover-dwell open, rest-to-press) for compositors that
  swallow X clicks. Autostart via `island/steroids-island.desktop`.
  Screenshot-verified via xdg portal.
- Island container is alive now (their SPEC §4 motion values): spring
  open 520 ms with overshoot / close 340 ms flat, widths grown around
  center; mascot pops in on reveal; pills land 35 ms apart; bar hides
  after 60 s idle and peeks on top-center hover instead of standing
  there.   Pinned mode still in the right-click menu.
- Flex bar redesigned to their compact (SPEC §2 ear-grid): mascot plus
  2x2 recent-skill minis, text pill moved to the jacked header. Live
  design loop: the island watches `app.py` and restarts itself on save
  (opt out with `ISLAND_NORELOAD=1`).
- Ask is now chat-style (their chat card translated): provider pill,
  bubble history seeded from recent routes, typing dots, input bar
  with ↑ send, inline Teach buttons on close calls.

## [0.1.1] — 2026-10-04

### Added

- Island mascot, Coucou-style (study now vendored at
  `docs/coucou-study/`, MIT code only — no Mochi art/sounds): `index.html` header mascot
  now breathes, grows eyes on hover, squishes on click, line-eyes
  on 2nd rapid tap (800 ms), dizzy spin on 3rd (1300 ms), plus
  `window.steroidsCelebrate()` happy jump for task-done.
- New `island/` zero-dependency preview: `fsm.js` (Steroids island FSM:
  `hidden → flex → jacked` + `pump` greeting), `mascot.js` (Canvas 2D
  render of our own 14×14 pixel mascot, same motion values),
  `index.html` demo with router-hint pill. Open via any static
  server, e.g. `python3 -m http.server` in `island/`.

### Fixed

- Header speech bubble crashed on click (`#logoSay` element missing,
  `say` was null) — bubble element added, handler null-guarded.

- Governance drafts: CONTRIBUTING, SECURITY, CHANGELOG, CODE_OF_CONDUCT
  (contacts TBC).

## [0.1.0] — 2026-09-23

### Added

- D-2 privacy: `--correct` correction command into the miss pipeline,
  README privacy promise, team-pool sharing stated opt-in (`997f740`).
- P0-6 grader policy doc + partial-credit score + B-02 transcript
  (`9e3f83a`).
- LCH-1 CI workflow wiring existing gates on push/PR (`056883f`).
- Ops: morning digest + L-1 nightly cron wiring (`f146e20`, `2efa9b3`).
- Phase-0 pilot bank run, 5 tasks x 2 arms (`8fdf1ee`).

### Fixed

- IDs: 24-bit to 64-bit rand, 200-run hunt clean, closes B-05 (`af8ddd8`).

### Docs

- LCH-6 scale record: 5000-skill pool, p50 ~18 ms, p99 34–56 ms
  (`f3aed55`).
- LCH-3 launch boxes closed, helper auth verified (`db9adbd`,
  `f5e9843`).
- P0-3 bank drafts B-07..B-10 from real sessions (`7690e05`).
- V1 release scope: paid evals moved to V-next (`54f3312`).
- CP-1 + M10 signed off (`2bf14b9`).
