# Steroids FREE Loop — 100-Question Self-Review (2026-10-09)

Method: real chromium (mobile 412×915 touch + desktop 1440×900), live bridge,
raw-socket WS proof, Deno WS interop proof. Batteries: `e2e-loop/run.js`
(16/16) + `e2e-loop/edge.js` (19/19). Shots in `e2e-loop/shots/`, reviewed
by eye. Legend: **FIXED** (changed + verified), **VERIFIED** (passes as-is),
**QUEUED** (real gap, recorded), **ASK-OWNER** (needs your call).

## Router core (FREE #2)

1. Does `--count` work from a fresh checkout? A: yes, 1356 skills. **VERIFIED**
2. Does a plain query route sensibly? A: "write a git commit message" → commit helpers. **VERIFIED**
3. Does `/skills?q=` return ranked hits over HTTP? A: yes, 3 hits with scores. **VERIFIED**
4. Empty query? A: `{"hits": []}`, no crash. **VERIFIED**
5. Absurd `n` param (`?n=abc`)? A: falls back to 8. **VERIFIED**
6. Do descriptions backfill for skills missing from descs.json? A: yes via SKILL.md frontmatter. **VERIFIED**
7. Does trending work with zero log? A: returns empty lists, no crash. **VERIFIED** (code path; live log present here)
8. Is the log polluted by `--dry-run` searches? A: no, dry-run skips served.jsonl. **VERIFIED**

## Lens (FREE #1)

9. Does `/shots` return cards? A: yes, newest-first with file URLs. **VERIFIED**
10. Do shot files serve with correct MIME? A: yes (mimetypes guess, png default). **VERIFIED**
11. Path traversal via `/shots-file/../../etc`? A: `safe_name` gate, 404 "nope". **VERIFIED** (code + 404 seen)
12. Does the lens view render on mobile viewport? A: yes, 467 chars + shot. **VERIFIED**
13. Lens with empty watch dir? A: `{"shots": []}`, UI shows empty state. **VERIFIED** (code path)
14. Does mascot paint on real canvas? A: yes in chat/jacked views (orange character in shots). **VERIFIED**
15. Hidden-state black pill — bug or design? A: design (hidden bar minimal by intent). **ASK-OWNER** to confirm the empty black box is the look you want.
16. Do lens screenshots respect reduced motion? A: unknown, town page does; island TBD. **QUEUED**

## Sessions + history (FREE #4)

17. Does `/sessions` merge hooks + opencode DB + claude + readers? A: yes, 12 live rows seen. **VERIFIED**
18. Do hidden sessions stay hidden? A: yes, filtered + DELETE works now. **FIXED** (was 404 — duplicate `do_DELETE` shadowed the first; merged into one handler, verified live)
19. Does `/session` for unknown id leak? A: now idle-empty, never another session's data. **FIXED** (empty sid matched session-less events and leaked their text; now 400 on empty)
20. Does chat history survive bridge restart? A: `agent-chat.jsonl` persisted, yes. **VERIFIED** (file present + code path)
21. Do e2e test sessions pollute user history? A: yes (e2e ping rows visible in explore). **QUEUED** — need `?e2e` tag filtering or a test-session prefix hidden by default.
22. Session with 0 events → handoff? A: honest 404 "no handoff data — session has no hook events yet". **FIXED** (was misleading "no such session")
23. Does `/turn?id=nope` 404? A: yes. **VERIFIED**
24. Turn cleanup — do finished turns pile up? A: 10-min TTL sweep. **VERIFIED** (code + delete path tested)

## Phone view + pairing (FREE #3)

25. Does bridge bind LAN? A: yes, 0.0.0.0:8096 verified + `--host` parsed. **VERIFIED** (first attempt hit a stale-process collision — **FIXED** by clean restart discipline)
26. Does `/relay/qr` issue a QR + PIN? A: yes, png_b64 + pin + expiry. **VERIFIED**
27. Is PIN single-use? A: yes, replay rejected. **VERIFIED**
28. Bad PIN? A: 404 "bad pin". **VERIFIED**
29. Link knock → visible in `/relay/pending`? A: yes. **VERIFIED**
30. Approve → key pops single-read? A: yes, second poll `approved:false`. **VERIFIED**
31. LAN approve blocked? A: 403 from LAN IP. **VERIFIED**
32. Does settings view show the phone-link surface? A: yes ("Phone link" text + QR). **VERIFIED**
33. Phone-in-hand scan test? A: NOT DONE — no physical device here. **ASK-OWNER**: 2-min gate for you (open http://192.168.43.237:8096 on your phone, scan QR).
34. Reconnect after bridge restart with approved key? A: code persists key, reconnects (LAN phones keep key). **VERIFIED** (code path; live re-test needs your phone)

## File drop (FREE #5)

35. `/upload` roundtrip over LAN? A: yes, file landed in ~/.config/steroids/uploads/. **VERIFIED**
36. Oversize upload (>30MB)? A: 400 "bad size". **VERIFIED** (cap constant)
37. Empty upload? A: 400 "empty file". **VERIFIED** (code path)
38. Bad base64? A: 400. **VERIFIED** (code path)
39. Nasty filenames (`../../x`, spaces)? A: sanitized to `[A-Za-z0-9._-]`, no spaces (survives opencode @file expansion). **VERIFIED**
40. data: URL prefix stripped? A: yes. **VERIFIED**
41. Does the composer show staged chips with names? A: yes (2 chips, names visible). **VERIFIED**
42. Do attached files reach the agent as @paths? A: yes, appended to message. **VERIFIED** (code path + upload 200 in UI test)

## Approve from phone (FREE #8)

43. Full loop hook→bridge→hook? A: note→/pending→/decide→take(deny) passes. **VERIFIED**
44. Real Deny tap in mobile browser? A: yes — tapped, view switched to explore, card unmounted. **VERIFIED** (+ dedicated card screenshot)
45. Does the approval card render (title + Allow/Always/Deny)? A: yes, pictured. **VERIFIED**
46. Decide with bad verdict string? A: `ok:false`, stored nothing. **VERIFIED**
47. Decide on unknown key? A: `ok:false`. **VERIFIED**
48. Approval TTL (5 min unanswered)? A: swept, never blocks agent (native UI wins). **VERIFIED**
49. Do approvals work when UI open but WS down? A: yes — decide is plain HTTP POST; outbox covers the rest. **VERIFIED** (design)
50. "joined its hub" said before socket opens? A: was lying on key-acquire. **FIXED** — now "joining…" on pair, "joined" only on relay `connected` event; `phoneLinked` already honest.

## Notifications (FREE #9)

51. In-browser Notification API path? A: exists, this-browser-only, honest copy. **VERIFIED**
52. Sound on finish? A: toggle + Sound module, works. **VERIFIED** (code + toggle present)
53. Finished view renders? A: yes, screenshotted. **VERIFIED**
54. Off-LAN push (phone in pocket, away)? A: NOT BUILT — needs hosted infra. **QUEUED** → premium "managed notification delivery" (already in PREMIUM.md). Free promise must say "when UI connected".
55. FREE.md #9 wording over-promises ("get notified" — anywhere)? A: yes, slightly. **ASK-OWNER**: reword to "notified in the island + sound" or keep + build push later?

## Screenshot + voice to agent (FREE #10/#11)

56. Screenshot file → agent? A: yes via upload chain. **VERIFIED**
57. Voice record in mobile browser? A: yes — mic → recording state → attachment (fake mic device in test; real mic needs your phone). **VERIFIED** (UI path)
58. Voice without mic permission? A: stays idle, no fake state ("mic denied" branch). **VERIFIED** (code path)
59. 5-file cap enforced? A: yes, "attachment cap: 5 files max". **VERIFIED** (code)
60. Images arrive as pixels or filenames? A: filenames (+ honest UI note telling the user when the model can't see pixels). **VERIFIED** — dope honesty, keep.
61. Phone system share-sheet → island? A: PWA share target unverified here. **QUEUED** — needs your phone.
62. Voice language/accuracy? A: provider-side (opencode/claude), not ours. **VERIFIED** (out of scope by design)

## Fleet view (FREE #12)

63. `/fleet` ranks attention-first? A: yes (needsDecision > unread > live). **VERIFIED** live (4 ranked)
64. Worktree overlap warnings? A: code + unit test pass; live multi-worktree untested here. **QUEUED** (needs 2nd checkout + your eyes)
65. 20 parallel requests — race/corruption? A: all 200, no corruption. **VERIFIED**
66. Team tiles live progress? A: in recent commit (8f6285f), screenshots pending. **ASK-OWNER**: you own UI shots for this.

## Continuity (FREE #13)

67. Handoff for hook sessions? A: brief builds (task+steps+tail). **VERIFIED** (code + honest-error path)
68. Handoff for DB-only sessions? A: honest 404 now. **FIXED** (see #22)
69. Cross-device resume (start PC → continue phone)? A: protocol ready (shared session id + transcript), live two-device test pending. **QUEUED** — needs your phone.
70. Handoff oversize (huge transcripts)? A: capped 3000 chars. **VERIFIED** (code)

## Shared brain (FREE #14)

71. Shared-rules sync live? A: yes, `ck` cluster from hub in local file. **VERIFIED**
72. Sync without network? A: best-effort, never raises, local rules intact. **VERIFIED** (design + try/except)
73. Anonymous-only (no prompts leave)? A: trig tokens + counters only. **VERIFIED** (design)
74. Team UX for shared rules (see/approve team knowledge)? A: minimal (counts surface). **QUEUED** → Pro/Team territory per PRICING.md, keep free read-only.

## Away-from-home + preview (FREE #6/#7)

75. WS handshake to spec? A: 101 + frame relay, raw-socket proven. **VERIFIED**
76. Non-Python WS client interop? A: Deno opens, receives broadcast. **VERIFIED**
77. Browser WS in THIS test env? A: Brave Nightly headless cannot open loopback WS at all (proven vs minimal server). **ENV-LIMIT**, not product. Needs re-test in real Chrome/phone.
78. Relay rooms isolated by key? A: mismatched frames dropped, sender skipped. **VERIFIED** (code + raw test)
79. Ping/pong keepalive? A: server pongs, 120s timeout. **VERIFIED** (code)
80. Hosted relay for away-from-home? A: NOT BUILT. **QUEUED** → premium managed infra (PRICING.md). Free path = self-hosted tunnel docs (Tailscale/SSH), not yet written. **QUEUED**
81. Live dev-server preview on phone? A: NOT BUILT (no UI URL card). **QUEUED** behind #80 — deliberately not half-built.
82. FREE.md #6/#7 wording vs reality? A: over-promises today. **ASK-OWNER**: keep as roadmap-flagged or reword to "via your own tunnel"?

## Install / upgrade / ops

83. Clean-machine install tested? A: NO. **QUEUED** — highest-risk unknown. Needs fresh VM/container: install.sh gate + hooks + first run.
84. Does install refuse sanely with no skills / no model? A: designed (exit 1 / loud warning). **QUEUED** behind #83.
85. Bridge restart persistence (decisions/hides/chat)? A: file-backed, survives. **VERIFIED**
86. Port collision on restart (stale process)? A: BITTEN twice in this loop. **QUEUED** — bridge should detect + refuse with a clear message instead of traceback (or reuse addr cleanly).
87. `BRIDGE_VERBOSE` logging for support? A: exists. **VERIFIED**
88. Uninstall path? A: install.sh handles; UI-side unpair (unlink) exists. **VERIFIED** (code path)

## Privacy / offline

89. Any telemetry in chat path? A: zero (hash-only served log). **VERIFIED** (design + README promise)
90. Served log cap (50k rows)? A: constant present. **VERIFIED** (code)
91. Uploads dir grows forever? A: no sweeper seen. **QUEUED** — add upload retention (e.g. 7-day sweep) before thousands of users.
92. Relay keys logged anywhere? A: no (memory only). **VERIFIED** (code)

## UI honesty / dope-pass

93. Debug button row + event log shipped on plain `/`? A: yes (all screenshots). **ASK-OWNER**: dev controls ("route event", "teach approval" fabricate activity) — keep as transparent power feature or gate behind `?debug`?
94. "joining/joined" honesty? A: **FIXED** (see #50).
95. Bell badge, provider pill, sound toggle all live? A: yes, visible in shots. **VERIFIED**
96. Approval Deny sound + celebrate on approve? A: wired (Sound.deny/approve, mascot celebrate). **VERIFIED** (code)
97. Reduced-motion + battery saver paths? A: town has it; island audio-energy/anim unknown. **QUEUED**
98. Is dist rebuilt with latest src? A: yes, rebuilt 02:11 in-loop, hash verified in bundle. **VERIFIED**
99. All unit tests green after loop edits? A: 18/18 island ports + py_compile. **VERIFIED**
100. What proves "end to end" to a stranger? A: this file + results.json + edge-results.json + 10 shots + 35/35 batteries re-runnable via `node run.js` / `node edge.js` with `E2E_BASE`. **VERIFIED**

## Actions out of this review

- FIXED in-loop (5): duplicate `do_DELETE` (agent-session hides now work), `/session` empty-sid leak (400), handoff copy, relay joined-honesty, LAN bind discipline.

## Second sweep (same day — "work on everything")

- FIXED (4 more): 7-day upload retention sweep on arrival; port-collision
  refuses with a clear message (no traceback); `e2e-*` test sessions hidden
  by default (`?showTests=1` reveals); batteries hardened (demo-card-only
  taps, live-intercept skips — a live user approval can no longer be
  touched or failed by the loop).
- VERIFIED: clean install both ways (empty HOME refused by preflight;
  seeded HOME installs, gate passes, hooks live, fresh binary indexes
  1000 skills); worktree overlap with 2 real worktrees; reduced-motion
  already covered (CSS ×2 + JS pupils).
- LIVE-FIRE BONUS: the loop twice intercepted REAL user approvals
  ("Allow Bash?") surfacing in the island in real time — FREE #8 proven
  under real load, pictured in `e2e-loop/shots/dbg-chat.png`. Untouched.
- Batteries now: `run.js` 16/16 + `edge.js` 19/19 = 35/35. Isolated test
  port (`E2E_BASE`, default :8099) so the loop never collides with your
  live :8096. Test servers are started/stopped inside the run (sandbox
  reaps backgrounders).
- New docs: `docs/AWAY.md` (free self-hosted away-access: Tailscale / SSH
  tunnel / hotspot + security notes). Closes QUEUED #80-docs; hosted relay
  stays premium.
- Remaining QUEUED: #81 preview card (behind tunnel use), #74 team UX
  (premium), #61 share-target + #69 two-device (need your phone),
  #64-live-multi (unit+single-live done), #21 done via filter.

## Third sweep — gap battery (35 more checks, all green)

`e2e-loop/edge2.js` covers everything the first two batteries missed:
all 15 untested GET endpoints (shape-asserted), `/display` published-file
check, dl-qr, link-status-unknown, turn 404s, OPTIONS/CORS, skills clamps,
gigs shape, `/install` guards (bad provider 400, opencode already:true —
no download triggered), e2e-filter live (`?showTests=1`), focus success
(`how=cwd`), handoff-brief content, auto_approve set/reset, double-decide
(first wins), knock dedup, hide persistence + cleanup, concurrent ×2 turns,
event cleanup. Test server runs isolated (`STEROIDS_HOME=/tmp/e2ehome`);
batteries take `E2E_BASE` + `E2E_HOME` so they never touch your live state.

Also added: voice-clip-lands-after-stop assert (run.js), gigs test-row
scrub (repo stays clean — 9 stray e2e rows removed).

Totals: run.js 18/18 (localhost) + 18/18 (LAN origin) + edge.js 22/22 + edge2.js 39/39 = **97 green**.

## Fifth sweep — all of it (threat, release, compat, evals, docs)

- Threat: PIN verify throttled per-IP (0.5→1→2→4s proven live);
  upload abuse sanitized live (traversal/spaces/dotfiles/double-ext);
  all four localhost-only guards re-probed from LAN (403s hold);
  key/PIN entropy reviewed (6-digit + 2-min TTL + single-use +
  throttle = solid on LAN threat model). CORS `*` = accepted design
  (any-origin phone browsers need it; secrets stay unguessable).
- Release: CHANGELOG updated; GET /version single-sourced from
  pyproject, island pill reads it live (was hardcoded); live evals at
  1356-index meet-or-beat README (blind149 0.993 vs published 0.799 —
  flagged, not edited); `benchmark.py --check` green.
- Compat audit (no Mac/Win machines here, code-level): all readers
  degrade to empty, no bash4-isms, getuid wrapped, player paths safe.
  One probe reserved for first Mac user (opencode sqlite XDG path).
- Launch doc: `docs/GO-LIVE.md` — requirements, install, evals,
  batteries, known limits. No fluff.
- Caught by the loop, fixed: my own edit glued `LOOP_TTL` into a
  comment (NameError killed request threads — py_compile can't catch
  that; new discipline: import + stub-smoke after every bridge edit),
  stale decisions rows flaked double-decide (unique keys per run now),
  test-gig rows scrubbed from repo.
- Soak: 1000 reqs, 0 fails, 7.5s, RSS +2.7MB (caches, sane).

## Fourth sweep — self-rating 7/10, then the fixes (2026-10-09)

What the 72 missed, found by adversarial re-read + new probes:

- **LoopTile spun forever** if the server restarted mid-loop (poll had no
  exit on 404/network-death). **FIXED**: exits with the reason
  ("no such loop" / "loop lost (server restarted?)"). Restart-during-loop
  verified live: kill -9 → new server → honest 404.
- **Unbounded team loops**: every Run click = thread + agent subprocesses,
  no cap. **FIXED**: MAX_LOOPS=2, third start refused ("2 team loops
  already running — stop one first"), proven in-process with stub executor.
- **Phone couldn't stop turns**: my DELETE merge put the localhost guard
  over /turn + /loop too (LAN battery caught it: chat-turn FAIL from LAN).
  **FIXED**: guard scoped to /agent-sessions only; regression battery added
  (turn DELETE from LAN → 200).
- **Journal growth**: checked — INSERT OR REPLACE on step names, bounded.
  Non-issue, closed.
- **LAN-origin UI**: full main battery re-ran from
  http://192.168.43.237:8099 (the phone's actual path): 18/18. Mic denial
  on LAN http is browser policy — UI stays idle, asserted as correct.
- **Soak**: 300 reqs, 0 fails, 0.9s, RSS +1.3MB (caches, sane).
- **Process discipline, hard rule**: one broad `pkill -f opencode.*run`
  nearly matched live user sessions (they survived — verified alive
  after). NEVER AGAIN: exact-PID kills only, cmdline-verified first.
  Orphaned test turns reaped the same way.

Still honestly open (need your phone / real Chrome / time, not code):
live two-device resume, share-target, claude-turn content (quota — skipped
deliberately), router-timeout path (20s SEARCH_TIMEOUT unforced), preview
card UI (owner's UI territory), team UX (premium).

Still honestly open (need your phone / real Chrome / time, not code):
live two-device resume, share-target, claude-turn content (quota — skipped
deliberately), router-timeout path (20s SEARCH_TIMEOUT unforced), preview
card UI (owner's UI territory), team UX (premium).
- QUEUED (14): #16, #21, #55-wording?, #61, #64, #69, #74-team-UX, #80-tunnel-docs, #81-preview-card, #83-clean-install (biggest risk), #84, #86-port-collision-UX, #91-upload-retention, #97-motion.
- ASK-OWNER (7): #15 hidden-pill look, #33 phone-scan gate, #55, #66 team-tile shots, #82, #93 debug row, + clean-install machine access (#83 needs your VM or a cloud box).
- ENV-LIMITS (2, not product): Brave Nightly headless loopback-WS; no physical phone/Mac in this environment.
