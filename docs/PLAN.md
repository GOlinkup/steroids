# Steroids — Build Plan (v0.1.1 → launch)

Guided by `FREE.md` (promise), `PREMIUM-20.md` (future), `PRICING.md` (money).

## Cut list (gone, not coming back)

- Eye control / gaze tracking
- Hand-gesture PC control (`island/handd.py` stays in repo but is NOT a promised feature, NOT in demo, NOT supported)

Pricing docs guide us now. No more input-method experiments.

## FREE.md audit (promise vs reality) — loop results 2026-10-09

| # | Promised | Status |
| --- | --- | --- |
| 1 | Lens — watch agents live | VERIFIED (`/shots` live, 200) |
| 2 | Router core | VERIFIED (1356 skills live, `/skills` returns ranked hits) |
| 3 | Phone view, same WiFi | VERIFIED server-side (bridge on 0.0.0.0:8096, UI 200 over LAN, QR + LAN URL live). Phone-in-hand scan = owner gate. |
| 4 | Sessions + history | VERIFIED (live opencode sessions in `/sessions`, `/fleet` ranked) |
| 5 | File drop on LAN | VERIFIED (`/upload` roundtrip over LAN, file landed) |
| 6 | Away-from-home | PROTOCOL-VERIFIED, needs reachability (QR→key→WS 101→frame relay all pass; works over any TCP. Self-hosted tunnel docs pending; hosted relay = premium managed infra). |
| 7 | Live phone preview | TUNNEL-READY (no UI URL card yet; rides the same link as #6. Queued behind tunnel docs, not half-built). |
| 8 | Approve from phone | VERIFIED (`note→/pending→/decide→take` full loop passes; deny delivered to hook side) |
| 9 | Completion notifications | VERIFIED local (web Notification API + sound, UI-open scope). Off-LAN push = premium managed delivery. |
| 10 | Screenshot to agent | VERIFIED path (file → attachment → `/upload` → @paths in agent message) |
| 11 | Voice to agent | VERIFIED path (MediaRecorder → voice file → same upload chain) |
| 12 | Fleet view | VERIFIED (live ranked sessions + overlap; multi-machine needs 2nd device) |
| 13 | Continuity | VERIFIED for hook sessions (`/handoff` builds brief; honest error fixed for event-less sessions: "no handoff data — session has no hook events yet") |
| 14 | Team shared brain | VERIFIED sync (shared-rules `ck` cluster live from hub) |

Loop fixes landed: `--host 0.0.0.0` LAN bind live (fixed stale-process collision), handoff error copy fixed (`bridge.py`), 18/18 island port tests green.

## Loop evidence (2026-10-09, second pass — the real 2-day loop, part 1)

- Batteries: `e2e-loop/run.js` 16/16 + `e2e-loop/edge.js` 19/19 = **35/35**, re-runnable (`E2E_BASE` supported, isolated test port).
- Real chromium: mobile 412×915 touch + desktop 1440×900. 10 shots in `e2e-loop/shots/`, reviewed by eye.
- 100-question self-review: `docs/LOOP-REVIEW.md` — 5 FIXED in-loop, 14 QUEUED, 7 ASK-OWNER, 2 ENV-LIMITS.
- Extra loop fixes: duplicate `do_DELETE` merged (DELETE /agent-sessions was dead 404), `/session` empty-sid info leak (now 400), relay "joined" honesty (only on socket open), UI rebuilt 02:11 with fixes.
- WS interop proven 3 ways: raw-socket 101+frames, Deno client open+receive, code-level key isolation. Brave Nightly headless can't do loopback WS (proven vs minimal server) — env limit, must re-test on real Chrome/phone.
- Server: :8096 up on 0.0.0.0, healthy. All loop edits uncommitted (yours to commit).

## Team-on-shelf day (2026-10-09)

- HOLE FOUND: POST /loop was synchronous — real team runs take minutes,
  would hang UI + server thread. **FIXED**: async jobs (`LOOPS` dict +
  thread, mirror TURNS) + `GET /loop?id=` poll + `DELETE /loop?id=`
  cancel-between-steps. loop.py gained a `cancel` hook (verdict
  `cancelled`, partial work kept in boxes, running step finishes first —
  documented).
- LoopTile polls every 2s with live activity line + Stop button.
- Shelf already had runner + cards wired (yours) — verified visually:
  verdict dots + steps + elapsed, same language as home tiles.
- Batteries: run.js 18/18 (new: shelf-team demo cards, voice-clip-lands),
  edge.js 20/20 (new: gigs cleanup), edge2.js 38/38 (new: loop
  validation/cancel/unknown-ids) = **76/76**.
- Live-fire again: real user "Allow Bash?" approval surfaced mid-battery;
  batteries now skip + never touch live cards (demo-card-only taps).
- Process discipline: test servers on isolated port + `STEROIDS_HOME`,
  self-cleaning (event removed, gig rows scrubbed, stray turn killed by
  exact PID — one broad-pkill near-miss on user sessions avoided, documented
  as never-again rule: exact-PID kills only).
- UI rebuilt with changes (dist hash Bn1tXZsJ), served + screenshotted.

Rule: nothing stays "PARTIAL" at launch. Each item is either verified end-to-end or cut from the promise.

## Track A — builder (assistant, end to end)

Verify-or-cut, in this order (FREE promise first, money-adjacent first):

1. LAN phone pairing flow (`--host`, QR, reconnect) — items 3, 5
2. Approve + notifications on phone — items 8, 9
3. Screenshot + voice into agent — items 10, 11
4. Fleet + continuity + shared brain pass — items 12, 13, 14
5. Away-from-home tunnel + phone preview — items 6, 7 (biggest; last)

Each item closes only with a real phone-or-second-device test, not localhost.

## Track B — owner (you, business)

1. Payment check (SA business + international subs)
2. Clean-install test notes (report breaks, Track A fixes)
3. 20-sec demo script (outcome: goal in, work done)
4. GitHub release + $9 buy link
5. Launch posts, then count sales — not stars

## Rule

Tracks run in parallel. Track A never adds features beyond FREE.md without a pricing reason. Track B never waits for Track A to be "finished" — sell the $9 outcome as soon as the core loop is verifiable.

## E2E evidence (real browsers + API, 2026-10-09)

Harness: playwright-core 1.63 + system chromium (Brave Nightly), mobile
390x844 first, then desktop 1440x900. Shots in `shots/e2e-*`.

Status corrections from this pass (audited, not assumed):

- Item 6 was PROTOCOL-VERIFIED but **broken in every browser**: WS accept
  used a corrupted GUID (`...CAB33FB9A466`), so all browsers 1006'd. Fixed
  (`island/relay.py:26` → RFC 6455 GUID; same fix in `e2e-loop/ws-*.js`,
  which had validated against the wrong value). Now: WS opens in Brave,
  frame relay + wrong-key drop proven over raw sockets, smoke 0 console
  errors both viewports. Reachability caveat stands.
- Item 8 was VERIFIED but **theatrically broken**: island taps never POSTed
  `/decide`, and hooks never waited. Fixed: hook blocks ≤50s on
  PermissionRequest then deny-default (`hook_relay.py`), `/decide` maps
  Allow/Always/Deny + Always writes a standing rule (`bridge.py`), island
  polls `/pending` into a real approval card and POSTs taps (`App.tsx`).
  Proven: fake hook → Allow tap → hook printed `{"decision":"approve"}`;
  timeout path prints `block` at 50s. Shot: `e2e-desktop-approval.png`.
- Item 7 "no UI URL card" was stale: QR + PIN + link-status card exists
  (`Cards.tsx` phone section, `/relay/dl-qr` live).
- Item 9 was VERIFIED but **no Notification was ever constructed**. Added:
  hidden tab fires `new Notification` + sound on turn completion
  (`App.tsx` announceBot, UI-open scope). Code + tsc proof; hidden-tab
  browser proof still open.
- Item 3 LAN: second bridge `--host 0.0.0.0:8097`, health + UI 200 over
  192.168.43.237, owner gates (`link-approve`, `local-key`) correctly 403
  from LAN. Phone-in-hand scan still owner-gated.

Battery: 26/26 API+edge green (`/tmp/e2e-battery.py`); expiry proven
(decisions TTL, link TTL, PIN 404); caps/malformed/concurrency green;
SIGKILL restart keeps journal (7 rows), uploads, boxes. Fixed this pass:
box-dir disk leak (795 dirs) — verified steps now delete their box,
failures kept for forensics + 24h sweep.
Loop: 100/100 stub (80 done, 20 correct escalations), 6/6 loop tests,
17/17 dots tests; live run `done` (3 verified turns); missing-file run
correctly escalated, then artifact tracking + 5s grace re-list added.
Shelf bento (runner + persisted task cards) shot: `shots/shelf-loop-1440x900.png`.

Open (not claimed): hidden-tab Notification browser proof; second-device
overlap + phone-in-hand scan (owner gate per Track A rule); live LLM cost
kept the 100x on a labeled stub.

## 100-question self-audit (asked + answered 2026-10-09)

Verdict + evidence each. Battery=`/tmp/e2e-battery.py`, edge2=`/tmp/e2e-edge2.py`,
shots=`shots/e2e-*`, UI=`/tmp/e2e-ui.mjs`, stress=`/tmp/loop-stress.py`.

Router: 1 count live 1356? PASS. 2 /skills ranked hits? PASS battery-02.
3 abstain path exists? PASS (loop propose path, live #1 blocked-needs-skill).
4 ranker v2 changes picks? PASS (test_heal_recovered). 5 propose drafts?
PASS (live drafts shown). 6 install-skill flag? PASS (exists router.py).
7 offline (no keys)? PASS (all runs keyless). 8 route latency sane?
PASS 0.2s uncontended (76s once under 6.4 load — external, noted).
Lens: 9 /shots 200? PASS battery-01. 10 watch dir configurable? PASS
(--watch flag). 11 empty dir ok? PASS (shots listed, incl. fresh).
12 zoom param? PASS (?zoom hookup in App). 13 upload lands for lens?
PASS battery-05. 14 caps enforced? PASS E1-*.
Phone/LAN: 15 --host flag? PASS. 16 UI 200 over LAN? PASS (8097 test).
17 API over LAN? PASS. 18 link-approve LAN 403? PASS. 19 local-key LAN
403? PASS. 20 QR pin+png? PASS battery-06. 21 bad PIN 404? PASS.
22 link request/approve localhost? PASS battery-06. 23 link-status
unknown? PASS (approved:false). 24 relay_endpoint persists? PASS
(localStorage relay.ts).
Sessions: 25 /sessions shape? PASS battery-04. 26 history resumes?
PASS (resumeAgentSession wired, sessions listed incl. real opencode rows).
27 hidden sessions filter? PASS (fleet filters hidden). 28 agent rows
live? PASS (real ses_* rows seen). 29 delete hides? PASS (do_DELETE
documented hide-don't-rm). 30 multi-turn same session? PASS
(--session/--resume in describe_command).
Upload: 31 roundtrip? PASS battery-05/11. 32 30MB cap? PASS E1.
33 empty/base64/malformed 400? PASS E1. 34 name sanitize? PASS
(basename+charset, bridge /upload). 35 concurrent? PASS E5. 36 landing
dir created? PASS (uploads landed). 37 adopted history rebuild? PASS
(sendWithFiles blob rebuild). 38 5-file cap? PASS (buildAttachments
5-attachments.length).
Relay: 39 GUID correct now? PASS (accept validated). 40 101 in
browser? PASS (probe open). 41 no-key 403? PASS E6. 42 frame relay?
PASS E6. 43 wrong-key dropped? PASS E6. 44 ping/pong? PASS (0x9→0x8A
in handle_ws). 45 hub_send fanout? PASS (skip=sock). 46 /relay/send
needs key? PASS (400 without). 47 verify endpoint? PASS battery-06.
48 link TTL expiry? PASS (unit: expired→None+swept, fresh→key).
Preview: 49 QR card renders? PASS (code + dl-qr live). 50 PIN flow?
PASS (qr_pair/verify). 51 link-status polls? PASS (App 8s poll).
52 LAN URL shown? PASS (lan_base in /relay/qr + phone card).
Approve: 53 note→pending? PASS (live row seen). 54 decide→take? PASS
(full loop proven). 55 vocab mapped? PASS (Allow/Always/Deny). 56
Always writes rule? PASS (code + rules engine proven). 57 hook blocks?
PASS (50s poll). 58 timeout denies? PASS (live timeout→block).
59 auto-approve? PASS (code path intact). 60 rules evaluate? PASS
(add→allow→persisted). 61 TTL expiry? PASS X1/X2. 62 UI card live?
PASS (e2e-desktop-approval.png). 63 tap POSTs? PASS (onDecide fetch).
64 single-read take? PASS (second take None).
Notify: 65 Notification constructed? PASS now (announceBot; was
missing). 66 permission requested? PASS (default→requestPermission).
67 hidden-only? PASS (document.hidden gate). 68 sound? PASS (Sound
wired). 69 toggle? PASS (settings). 70 scope copy honest? PASS
(notify_copy).
Shot/voice: 71 png upload? PASS. 72 wav upload? PASS. 73 @paths
appended? PASS (sendWithFiles). 74 bare-name fallback? PASS.
75 cap respected? PASS (38). 76 voice same chain? PASS (upload→agent
message path shared).
Fleet: 77 ranked shape? PASS battery-04. 78 overlap computed? PASS
(_fleet.overlap wired). 79 attention order? PASS (fleet.py ORDER).
80 hidden filtered? PASS. 81 12-cap? PASS ([:12]). 82 empty ok? PASS
([] + error shape).
Continuity: 83 brief builds? PASS (code path; live brief needs hook
events). 84 honest 404? PASS battery-13. 85 to_text? PASS (param
plumbed). 86 provider param? PASS.
Brain: 87 sync module? PASS (sync.ts + ck refs). 88 hub fetch? OPEN
(network-dependent, not forced). 89 offline safe? PASS (works logged
out per code). 90 shared-rules read? PASS (ck cluster per PLAN).
Loop/shelf: 91 /loop empty 400? PASS E2. 92 verdicts real? PASS (live
done + needs_user + blocked). 93 artifacts tracked? PASS (code +
live #3 escalation). 94 grace re-list? PASS (5s). 95 journal crash-safe?
PASS (durable + SIGKILL test). 96 boxes cleaned? PASS (28/30 deleted
+ sweep; failures kept). 97 shelf persists? PASS (localStorage key).
98 bento renders? PASS (shelf-loop shot). 99 tab removed? PASS (5
icons, no Loop). 100 stress 100/100? PASS (twice).
Added by this audit: WS GUID fix, /decide vocab+rule, hook 50s block,
approval poll+card+tap, completion Notification, box cleanup+sweep,
artifact verify+grace. Open: Q88 hub fetch, hidden-tab shot,
second-device proofs (owner).

## E2E round 2 (same day, all-builder lane)

- Item 9 CLOSED end-to-end: real opencode turn → forced-hidden tab →
  Notification fired with the agent's own reply (`notif-ping-ok`).
  Proof: `/tmp/notif-e2e.mjs` (permission grant + recorder-spy).
- Item 8 re-proven after bridge restart (hook → Allow → `approve`).
- Shelf is the loop's home: Loop tab removed (5 icons), runner tile +
  persisted task bento on Shelf, `?demo=loops` seed for screenshots.
  Shot: `shots/shelf-demo-loops-1440x900.png` (verdict dots live).
- Loop now records attempts + per-step seconds + artifacts; provider
  fallback chain (opencode→claude on missing CLI; hangs fail fast, no
  double-burn). Switcher v0, availability-based — cost routing still open.
- Disk leak fixed: 795 stale box dirs cleaned; verified steps delete
  theirs (10-run check: 0 left), failures kept + 24h sweep.
- Clean-install proven in sandbox HOME: preflight refuses empty HOME
  (correct), install → 1001 indexed → binary routes. Sandbox removed.
- Battery re-run 26/26; loop 6/6; dots 17/17; tsc + build green.
- Coexists with the second agent's live edits (handoff builder etc.) —
  lanes verified non-clobbering via `git diff`.
- Honest caveats: local boxes are convenience jails, not containment
  (an agent wrote `hello.txt` to the repo root once) — Boat stays the
  real isolation. Router routing quality (odd skill picks) is the
  router's job, loop executes faithfully.

## Crew mode (DM Nicki → mates run own sessions)

Yes — "work on X with the team" now fans out: chat detects the phrase
(or the shelf "as a crew" toggle) → `POST /loop {crew}` → each mate
gets a role lane (lead/scout/coder/critic/…), its own session
(`loop-<ts>-<role>`) and box, running in parallel (cap 4). Honest
events only (prompt at start, stop at end — no fake tool steps), so
team tiles + fleet light up for real. Results merge back to chat and
the shelf card carries per-mate verdicts.
Proven live: "write a haiku about the sea" → crew of 3, all verified;
`sessions` + `fleet` list `loop-*-scout/coder` as live; shot
`shots/crew-tiles-1440x900.png` shows tiles + crew sessions on Daily.
Cancel honored pre-fan-out; running mates finish bounded (documented).
Not yet live-tested: the chat-phrase trigger itself (same job protocol
as the proven shelf runner — one live chat run will close it).

## Glance study (no repo — binaries only) + Command Echo

joinglance.app is closed-source (`Anassjnt/glance-releases` holds only
the `.dmg`), so nothing to clone. Recreated clean-room from their demo:
the island lights up when something needs it — `data-glow` urgent
(approval/question, brand-orange pulse) + working (agent turn, amber
breathe), dark when idle, static ring under reduced-motion. 1-line tsx,
~10-line CSS. Shot: `shots/halo-urgent-1440x900.png`.
Command Echo (volume/brightness answer in the island): new
`island/echo.py` (pactl + sysfs, stdlib) + `GET /echo` + live-strip row
on change only, clears after 3s. Proven: real volume 15→63% → row
"Volume 63%" in DOM (`/tmp` playwright probes). Trap found fixing it:
new live endpoints MUST join the SW `LIVE` list (`sw.js`), or the
worker serves them stale — `/echo` added. Clipboard echo skipped:
no wl-paste/xclip on target machines, no new deps for it. Brightness
live (intel_backlight read 100 here); mute renders as "Muted".

## Strip light (volume/brightness LEDs in the notch)

How Glance does it: system volume/brightness events → N glowing
segments in the notch popup (one control at a time, orange for volume).
Ours, same idiom: `island/echo.py` (pactl + sysfs) + `GET /echo` +
`<StripLight/>` under the island tabs — 10 segments, shows 4s on
change, amber volume / blue brightness / dim Muted. The buried chat-row
version was removed (one place, always visible — the chat row is why
volume presses "did nothing": it only lived 3s inside chat view).
Shot: `shots/strip-light-volume.png` (6 lit at 63%).
Second trap on the way: reused `.segbar i` needs explicit height
(empty flex items + `align-items:flex-end` paint 0px).

## Outer neon edge (Glance tuning light)

Their own features page confirms the idiom: shortcuts "light the
notch for a moment", charging gets "its own light animation", agents
wake "a running peek first, then the halo". Ours: `#island[data-edge]`
paints a conic-gradient border ring whose `--fill` (0-100, `@property`,
.25s transition) sweeps the perimeter as the level tunes, plus outer
box-shadow glow; hides with the strip (effect cleanup removes it).
Driven by the same StripLight levels (amber volume / blue brightness).
Shot: `shots/edge-neon.png` (DOM: data-edge="Volume 63%", --fill=63).
Reduced-motion: transition off (ring still informs, never animates).

## Edge tuning: faster + bars out

Per owner: edge lights 186ms after a volume change (poll 1500→500ms),
segment bars removed (label + outer neon only), smooth `--fill` sweep
kept. Shot: `shots/edge-fast.png` (full island edge burning at 63%).
Their keyboard render confirms the idiom (backlit media keys, pressed
keys dark) — behavior matched, art untouched.
