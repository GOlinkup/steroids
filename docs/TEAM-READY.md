# TEAM-READY — startup huddle + catch-up-to-the-best plan

**Status:** research done (4 parallel tracks, 2026-10-09) · **Build on:** island-ui chat + crew tiles, `island/hive.py` + `loop.py` + `bridge.py`, `src/steroids/dots/` port, `thinking-orbs`
**Goal:** (1) app-open feels like *calling the team to be ready*; (2) copy the best of Grok, Dots, Muse, Manus, Cowork, ChatGPT-agent, Munder-Difflin; (3) this file is the work list.

**TL;DR:** full huddle plays once a day (~2.4s, skippable), lite assemble otherwise. Steal 5 Grok patterns, 6 agent patterns, 5 hive ports — phased P0→P3 below, **all shipped 2026-10-09 (§7)**. Turns + loops survive bridge restarts (detached log-file agents, disk registries, one-tap loop resume). Handoff-notes continuity slice shipped (§6). No true "crew tiles" exist anywhere else: our roster board is the open lane.

---

## 1. Startup huddle — "calling the team to be ready"

Today: cold open = empty chat, no greeting (`scheduleGreet` is a no-op), mascot sits still. Target: Nicki drops in, mates pop left→right with name-echo, status dots light, leader line, readiness chips. **Leader speaks last.**

### Storyboard (6 beats, ~2.4s total)

| Beat | Time | What happens | Animation (CSS) | Sound | Skip |
|---|---|---|---|---|---|
| B1 Assemble | 0–350ms | stage fades in, floor shadow scales | `opacity 200ms ease-out; transform 250ms cubic-bezier(0.2,0,0.2,1)` | room-tone swell 200ms | tap → end state |
| B2 Nicki drops | 350–650ms | leader hops from top, squash on land | `translateY(-24px→0) 220ms cubic-bezier(0.34,1.56,0.64,1)` | connect blip 660Hz 120ms | tap → end state |
| B3 Roll call ×5–8 | 650–1450ms | mates pop left→right + name-tag echo | `scale(.6→1) + translateY(8px→0) 200ms ease-out`, `animation-delay: calc(650ms + var(--i)*90ms)` | pop per mate, pitch +5% each, 60ms | tap next mate shortens |
| B4 Status dots | 900–1500ms (overlap) | dot under each tile gray→green | `background-color 150ms linear` + `box-shadow` ping 300ms | none (visual only) | — |
| B5 Leader line | 1500–2000ms | bubble types "Crew ready — what's first?" | typewriter 400ms (instant on reduce/2nd open) | chime 880→1320Hz 180ms | tap → full text |
| B6 Checklist + settle | 2000–2400ms | 3 chips (bridge/agent/phone) flip to ✓; crew idles | 3×80ms stagger; idle bob `1s steps(2) infinite` | none | any key jumps to end |

### Rules (converged from games + apps)

- **Budget:** full show ≤2.5s; 2nd open same day = lite static assemble <300ms (`huddleSeenAt` in localStorage).
- **Stagger:** 80–90ms per tile; total stagger block ≤800ms. Entrances ease-out 180–250ms; pops `cubic-bezier(0.34,1.56,0.64,1)` 220ms; exits 150ms fade. **Never block input.**
- **Reduced motion:** `prefers-reduced-motion` → instant assemble, opacity-only, no countdown/bounce.
- **Readiness chips (B6):** bridge up? agent installed? phone linked? — green ✓ or red nudge that deep-links (tap chip → installer / phone page). WoW flask/food/rune columns, but 3 chips.
- **Milestone rule (Duolingo):** daily ceremony stays small; big fanfare only on milestones (new mate added, 100th chat).

### Acceptance

- [ ] Cold open day 1: full 6-beat huddle, skippable, ≤2.5s.
- [ ] Same-day reopen: static assembled crew <300ms, no sound.
- [ ] Chips reflect live truth (bridge/agent/phone), red chips deep-link.
- [ ] Reduced-motion + tap-to-skip verified.

---

## 2. What the best do (reverse-engineer notes)

### 2.1 Grok (xAI) — steal 5

- Cold open = chat box instantly, no onboarding. **Speed is the greeting** (4.8–4.9★). No mascot theatre.
- Think / DeepSearch toggles above input; reviewers beg for "best for…" tooltips + auto-nudge.
- Streaming: fast plain append + gradient edge shimmer; send morphs to stop-square.
- Companions (retired to text): Affection meter −10…+15, reactive avatar, blush/hearts drove daily return.
- Weak spots to beat: confusing model menu, no branch/fork, "High Demand" hard-block paywall rage.
- **Steal:** (1) zero-friction cold open; (2) Think/Deep toggles + auto-nudge; (3) live grounding side-source; (4) visible progression meter + reactive avatar; (5) split-pane Studio + @-mention multi-bot groups with in-transcript approvals.

### 2.2 Paid agents — steal 6

| Product | Signature | Gating |
|---|---|---|
| OpenAI Dots | named always-on agents, Activity View + redirect, Custom Rules, specialist dots | 1st dot in Pro/Business Premium/Enterprise |
| Meta Muse | errand browser, in-chat approval card, single-use scoped pay card, audit trail | Free / Power $20 / Maximum $100 |
| Manus 2.0 + Cue | async cloud computer, to-do decomposition, close-app-notify, Automations 2.0 | credit-based, Free 300/day → Team ~$20/seat |
| Claude Cowork | plan → parallel chunks, plugins (skills+connectors+agents), Manual/Auto/Skip perms | Pro/Max/Team/Enterprise, no free tier |
| ChatGPT agent | watchable browser + narration + take-over-anytime, approval ladder | Plus/Team/Pro/Enterprise |
| Open Dots (ours, vendored) | Telegram/web coding tasks, sandboxes, Allow/Deny, schedules, GitHub connect | self-hosted |

- **Scheduling best:** Manus Automations (NL create, calendar view, run-cards link results, pause/test/edit, retry 3x + Investigate).
- **Approvals best:** ChatGPT + Dots ladder (Always ask / read / low-risk / all; card shows app+account+exact action; Custom Rules allow/ask/block; auto-review pre-check).
- **Crew UI:** nobody has live crew tiles — Manus Cue group-chat handoffs closest. **Open lane.**
- **Steal:** (1) approval card with exact payload + scope; (2) NL scheduling + calendar + run-cards; (3) Custom Rules + low-risk auto-approve; (4) watchable run + take-over + narration; (5) async close-and-notify + same-context continue; (6) one-install capability packs.

### 2.3 Munder-Difflin (HarnessMD) upstream vs our hive — gap table

Upstream: FIPA-lite (`act` request/inform/propose/query/agree/refuse/done, hop caps → god escalation), inbox/outbox + router, cursor + `.done` idempotent ack, terminal plane (tmux) + hook event plane → avatar state machine, god-as-single-scribe, single-committer git, markdown-first memory + SQLite FTS.

| Upstream capability | Our status |
|---|---|
| FIPA-lite schema + terminal acts + hop-cap escalation | ported (`hive.py`) |
| Inbox/outbox + router, broadcast, unknown→god proxy | ported |
| Cursor + `.done` idempotent ack | ported |
| Append-only log feed | ported (no git committer) |
| Task ledger add/update | ported |
| Markdown-first memory append/recall | ported |
| God-brief prompt (roster+tasks+inbox+policy in `/chat`) | ported |
| Crew parallel loop + ledger + mate→nicki reports | ported (`loop.py`) |
| Single-committer git (queue, retry, lock cleanup) | **missing** |
| God-as-single-scribe board lock | partial (open write) |
| Stop-hook autonomous inbox-drain loop + block-cap | **missing** (one-shot read) |
| Full hook event plane + spawn injection + PROTOCOL.md + rich registry + FTS/semantic recall + reflection + idle-wake + remote HITL | **missing** (bulk) |

**Port next (ranked):** (1) stop-hook drain loop — mates re-check inbox per step [S]; (2) board scribe lock — only Nicki writes board [S]; (3) git single-committer — audit trail [M]; (4) richer registry + PROTOCOL.md in crew prompt [S]; (5) FTS recall + reflection cap [M].

---

## 3. Master gap table — best-in-class vs us

| Capability | Best-in-class | Us today | Phase |
|---|---|---|---|
| App-open moment | Grok instant box / Discord blip | empty chat, no greeting | **P0** §1 |
| Thinking bubble | Claude/Cursor status verbs + clock | one orb, often single design | P1 (prior research) |
| Approval card | Muse exact-total card / Dots ladder | Allow/Always/Deny, no payload detail | P2 |
| Custom Rules (allow/ask/block) | Dots / ChatGPT | none | P2 |
| Scheduling + run-cards | Manus Automations 2.0 | Telegram `/schedule` grammar only, no UI | P2 |
| Live crew board | — (open lane) | tiles + Shelf loops | extend P1 |
| Watchable run + take-over | Operator / Cowork panel | poll text only | P3 |
| Async close-and-notify | Manus | relay announce only | P3 |
| Capability packs | Cowork plugins | skills search only | P3 |
| Hive autonomy (drain loop, scribe lock, git) | Munder-Difflin | partial (see §2.3) | P2→P3 |
| Companion stickiness | Grok affection meter | static moods | P3 |
| History model | ChatGPT sidebar + search | single group thread + Terminal section | keep, P1 polish |

---

## 4. Work plan

- **P0 — Huddle (shipped):** §1 storyboard as `Huddle.tsx` + `huddle.css` (6 beats, WebAudio blips, tap/keys finish, reduced-motion static), wired into chat empty state sharing one `useTeam` with the grid; once-a-day full show (`island.huddle.v1`), lite after; phone chip deep-links to pairing. Acceptance §1 met.
- **P1 — Thinking bubble + crew visibility (shipped):** `Thought for Ns · engine` receipt under the log (`lastThought`, latest turn only); send morphs to stop while thinking (`DELETE /turn` + poll abort, partial kept); Shelf `LiveLoops` polls `GET /loops` (chat-started runs included) with per-row Stop; shimmer stays active-row-only; status verbs + elapsed clock were already live (`liveActivity` + `workSecs`).
- **P2 — Trust + recurrence (shipped):** approval card shows exact payload + scope (`tool · session …`); Custom Rules UI in Settings (`GET/POST/DELETE /rules`, deny wins, `Always` still writes one); Automations in Shelf over dots schedules (`GET/POST /schedules`: create hourly/daily/weekdays/weekly, pause/resume/run-now/delete, last-3 run-cards; rows fire when the dots runner is up); hive stop-hook drain loop (`_drain_followups`, ≤2 extra rounds) + scribe lock (`write_board` nicki-only, `propose_board` for mates).
- **P3 — Depth (shipped):** take-over = Stop + live narration (same button, no second control); affection hearts at 3+ drives per mate (local); crew packs (Balanced/Research/Ship it, roles-only); git single-committer (`hive.commit`, lockfile + retry, silent offline); FTS recall + reflection cap (`recall_fts`, `reflect` at >400 lines); cloud handoff column (migration + tolerant push/pull); async close-and-notify rides the existing relay announce.
- **Reliability — restart-proof (shipped):** turns run detached to per-turn log files with a disk registry (`turns.json`) and a stable boot id — kill -9 the bridge mid-turn and the same tab keeps polling into the result, no resend. Dead agents close honestly with partials kept. Loops persist (`loops.json`); dead ones come back flagged interrupted with one-tap Resume (never auto-rerun). Verified: real kill -9 test over HTTP, reattach + cutoff + resume paths.

Each item ships with ONE runnable check (assert/demo/test), ponytail rules apply: reuse crew tiles, orbs lib, sheet component; no new deps.

## 5. Animation appendix (copy-paste tokens)

```css
--huddle-ease-out: cubic-bezier(0.2,0,0.2,1);
--huddle-pop: cubic-bezier(0.34,1.56,0.64,1);
--huddle-stagger: 90ms;            /* per tile, block ≤800ms */
--huddle-enter: 200ms;             /* tile pop */
--huddle-nicki-drop: 220ms;        /* translateY(-24px→0) + squash */
--huddle-dot-ping: 300ms ease-out; /* status dot */
--huddle-type: 400ms;              /* leader line typewriter */
--huddle-chip: 80ms;               /* ×3 readiness chips */
--huddle-idle: 1s steps(2) infinite; /* settled bob */
@media (prefers-reduced-motion: reduce){ /* instant assemble, opacity only */ }
```

Sounds: B1 room swell 200ms · B2 blip 660Hz/120ms · B3 pop +5% pitch each/60ms · B5 chime 880→1320Hz/180ms.

## 6. Session handoffs — continuity slice (shipped 2026-10-09)

The Munder-Difflin self-text habit, adapted: every archived chat files its own last-words note, and every mate already reports to Nicki's inbox. No model call, works offline.

### What shipped

- `sessionHandoff()` (`island-ui/src/store.ts`): goal (first user line) → result (last assistant line) + turn count, e.g. `route my flutter build → Routed → dart-flutter-patterns in 0.4s (2 turns)`. Filed on both archive paths (new chat, resume-switch).
- Startup greet (`App.tsx`): cold open with history → Nicki: `Last time — <note>. Continue or new orders?` Fresh page after archive → `Filed away: <note>. Fresh page — what's first?` Empty start stays empty; draft restore stays silent.
- History tooltips (`Header.tsx`): hovering a row shows `title — last: <note>`.
- `god_brief` (`island/hive.py`): identity lock (`You go by Nicki; never introduce yourself as a model or engine name`) + newest mate self-text body (`lastwords <mate>: …`), so the next turn sees what the crew just finished without re-asking.

### Where exactly it helps

1. **Cold open with memory** — biggest felt gap: no more "who are you, what were we doing".
2. **Fresh page after archive** — the filed note confirms nothing was lost.
3. **Resume picker** — tooltips tell threads apart (`which chat was the flutter one?`).
4. **Next turn after crew runs** — mate last-words ride `god_brief`; follow-ups continue instead of restarting.
5. **Phone↔PC (shipped)** — notes sync via `steroid_chats.handoff` (migration `20261009000000`, tolerant push/pull for old DBs).

### Follow-ups (not this slice)

- Model-written notes for long threads (>20 turns: local heuristic thins out; upgrade to one summarizer turn, user-approved).
- Mate self-text ledger in Daily (surface `done` reports as a readable log, not just inbox rows).

## 7. Shipped log (2026-10-09, verified)

| What | Where | Evidence |
|---|---|---|
| Huddle 6-beat + sounds + once-a-day + phone deep-link | `Huddle.tsx`, `huddle.css`, `sound.ts`, `Island.tsx` | `tsc` + build clean, `huddle-stage` in bundle |
| Thought-for-Ns receipt + send→stop morph | `Cards.tsx`, `App.tsx`, `Island.tsx`, `index.css` | `Thought for` in bundle, `DELETE /turn` kills proc |
| Shelf live loops + Stop (all origins) | `Loop.tsx` (`LiveLoops`), `bridge.py` (`GET /loops`) | `GET /loops` → `{"loops": []}` live |
| Approval payload + scope | `App.tsx` poller | card shows `tool · session …` |
| Custom Rules UI + endpoints | `Cards.tsx` (`RulesSection`), `bridge.py` (`/rules`), `decisions.py` | HTTP add/list/delete verified |
| Automations UI + endpoints | `Loop.tsx` (`SchedulesSection`), `bridge.py` (`/schedules`) | HTTP create/pause/run/resume/delete verified |
| Hive drain loop, scribe lock, git committer, FTS, reflection | `hive.py`, `loop.py`, tests | smoke: FTS hits, 457→305 cap, lock refuses |
| Affection hearts + crew packs | `TeamGrid.tsx`, `index.css` | build clean, lint clean |
| Cloud handoff | `sync.ts`, `App.tsx` merge, migration | tolerant both directions |
| Identity lock + mate last-words | `hive.py` `god_brief` | brief head verified |
| Durable turns (detach + log + registry + boot) | `bridge.py` | kill -9 HTTP test: same tab → result, no resend |
| Durable loops (registry + resume) | `bridge.py`, `Loop.tsx` | interrupted row + one-tap resume verified |
| Model-drawn diagrams (mermaid lazy chunk + CSS pop) | `Mermaid.tsx`, `Cards.tsx`, `index.css`, `mermaid@12` | build splits chunks, strict mode, code fallback |
| Visual-first brief (ADHD default) | `hive.py` `god_brief` | 528 chars total, plans/research exempt |

Remaining follow-ups: model-written notes (>20-turn threads), mate ledger in Daily, dots-runner autostart (schedules fire under bot/serve today).

## Sources

Grok app/store/teardowns · OpenAI Dots launch · Meta Muse · Manus 2.0/Cue · Claude Cowork · ChatGPT agent/Operator · Open Dots (vendored `vendor/open-dots/`) · HarnessMD/munder-difflin HIVE.md + SPEC.md · Discord/Slack/Duolingo/Apple-Watch motion conventions · prior orb/shimmer research (chat, 2026-10-09).
