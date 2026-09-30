# Maldrive 87-task with/without list

Source: Maldrive ACTIVE_TASK.md OUTCOME-10 + FEED-11-15 (M-01..M-15) + git log 766 commits since 2026-08-01.
Method per task (both runs): `dart analyze` on touched files + acceptance box. No device E2E (T10 rule).
Columns WITHOUT / WITH to fill per run: PASS/FAIL + evidence path.

| ID | Task | Verify | WITHOUT | WITH |
|---|---|---|---|---|
| M-01 | T1 rename video_player_iten typo | video_player_item.dart + imports, analyze clean |  | PASS 3 imports fixed, analyze clean, 26 flutter tests passed |
| M-02 | T2 feed_spinner polish | scaled stroke + semantics, analyze clean |  | PASS semantics+stroke present |
| M-03 | T3 dirty search-in-feed [OPEN] | search_controller/search_home/search_screen |  | OPEN named files gone, superseded by r296-r300 |
| M-04 | T4 BUG-003 MWK->ZAR | incoming_request_model.dart:159, analyze clean |  | PASS zero MWK in requests/ |
| M-05 | T5 verify video_screen+profile | 147+/34-, 0 new lints |  | DIRTY-HELD tree still dirty, analyze not run |
| M-06 | T6 verify explore sections+match_detail | analyze clean |  | DIRTY-HELD tree still dirty, analyze not run |
| M-07 | T7 sports_api+chat_list import | analyze clean |  | DIRTY-HELD tree still dirty, analyze not run |
| M-08 | T8 deleted-file removals | 0 dangling refs, grep clean |  | PASS zero import refs, comments only |
| M-09 | T9 dart analyze touched files | touched clean, 40 pre-existing elsewhere |  | PARTIAL explore 33 infos, 3 test files clean |
| M-10 | T10 outcome 10/10 skill routing | 0 failures, no device E2E |  | PASS this run |
| M-11 | FEED-11 DiscoverHeader under PageView | moved LAST in Stack |  | PASS header LAST in Stack :487 |
| M-12 | FEED-12 header tabs recipe | 17px + 28px indicator |  | PASS 17px+28px recipe :827 |
| M-13 | FEED-13 feed warnings | explore 33 infos left |  | PASS explore 33 issues |
| M-14 | FEED-14 Following/Nearby fallback | fallback to discover |  | PASS _filtered fallback :234-247 |
| M-15 | FEED-15 profile spinner timeout | 25s timeout + Retry |  | PASS 25s timeout+Retry :105-141 |
| M-16 | abd690c feat(steroids-ping): shared rules count only last-30d corrections | dart analyze touched + grep refs |  | SHIPPED commit abd690c in history |
| M-17 | d1f157d feat(steroids-ping): static snapshot publish + 1h cache (zero-cost reads) | dart analyze touched + grep refs |  | SHIPPED commit d1f157d in history |
| M-18 | 777620a steroids-ping v3: shared learning hub (phases 1-3) — learn/corr tables + cache | dart analyze touched + grep refs |  | SHIPPED commit 777620a in history |
| M-19 | f5ca28f r301 hero Google-only + search text-button out (god hands) | dart analyze touched + grep refs |  | SHIPPED commit f5ca28f in history |
| M-20 | 80aa62d r300 search stamina: debounce, suggestions TTL, keep-state, paging | dart analyze touched + grep refs |  | SHIPPED commit 80aa62d in history |
| M-21 | de95690 r299 never-empty search: scoped tabs backfill, typing pool fallback, no not-found strings | dart analyze touched + grep refs |  | SHIPPED commit de95690 in history |
| M-22 | 2b19a73 r309 server counters: save/repost/comment-like triggers, drop client bumps | dart analyze touched + grep refs |  | SHIPPED commit 2b19a73 in history |
| M-23 | afa4ac6 r307 consolidate polls: earn 60s floor, kill dead presence svc + earnings herd | dart analyze touched + grep refs |  | SHIPPED commit afa4ac6 in history |
| M-24 | 47e4f3c r306 scope realtime: drop dead global jobs herd, per-user apps filter | dart analyze touched + grep refs |  | SHIPPED commit 47e4f3c in history |
| M-25 | f9ca96f r316 silent-fail honesty: follow/save/repost toasts, story draft-kept copy | dart analyze touched + grep refs |  | SHIPPED commit f9ca96f in history |
| M-26 | 760a15f r304 intelligence: mandatory auth + 30-per-60s quota (401/429) | dart analyze touched + grep refs |  | SHIPPED commit 760a15f in history |
| M-27 | 5102c8b r312 Discover header: AppHeader chrome, logo/tabs/search, shell wiring, 4/4 tests | dart analyze touched + grep refs |  | SHIPPED commit 5102c8b in history |
| M-28 | 02e4b29 r303 moderate-portfolio: mandatory auth + caller-match (401/403) | dart analyze touched + grep refs |  | SHIPPED commit 02e4b29 in history |
| M-29 | 5251eea r302 owner-only writes videos/comments + counter RPCs/trigger, _bump via RPC | dart analyze touched + grep refs |  | SHIPPED commit 5251eea in history |
| M-30 | eebfa82 r310 abuse rails: comment CHECK+rate gate, view cooldown, follow gates, client guards | dart analyze touched + grep refs |  | SHIPPED commit eebfa82 in history |
| M-31 | b566b7d r296/r297 search: bio circle buttons, live typing hits, exact-first backfill, text Search | dart analyze touched + grep refs |  | SHIPPED commit b566b7d in history |
| M-32 | fc6cd1e r291 card-2 P1 restyle: ExploreScorePin dark card, comp header, goal panel (honest, no min | dart analyze touched + grep refs |  | SHIPPED commit fc6cd1e in history |
| M-33 | 53e9955 wip: remaining workspace changes (auth, earn, ride, explore, migrations) | dart analyze touched + grep refs |  | SHIPPED commit 53e9955 in history |
| M-34 | 92bbf06 ex-inbox-hub: public guest inbox, notifications hub, Discover styling | dart analyze touched + grep refs |  | SHIPPED commit 92bbf06 in history |
| M-35 | 4de65e7 ex-capture-sections DONE: split add_video_screen into sections + AppHeader top bar + exten | dart analyze touched + grep refs |  | SHIPPED commit 4de65e7 in history |
| M-36 | 7e64c01 test(explore): fix stale 45% comment + add 50% boundary case | dart analyze touched + grep refs |  | SHIPPED commit 7e64c01 in history |
| M-37 | 0e645a5 split 45-50pct DONE: creator 50/platform 40 of NET, s6b rates version (TDD red-green) | dart analyze touched + grep refs |  | SHIPPED commit 0e645a5 in history |
| M-38 | 4aefe66 ex-summary-containers DONE: Perf-sized Earned+Views header on Summary | dart analyze touched + grep refs |  | SHIPPED commit 4aefe66 in history |
| M-39 | ad1cc92 ex-studio-payout-states DONE: wire Jim payout math into studio | dart analyze touched + grep refs |  | SHIPPED commit ad1cc92 in history |
| M-40 | e708def ex-feed-s6-money DONE: 45-of-NET payout math + threshold gate (TDD red-green) | dart analyze touched + grep refs |  | SHIPPED commit e708def in history |
| M-41 | 3ee14fc ex-studio-build DONE: real grid + era-aware ZAR money + payouts label | dart analyze touched + grep refs |  | SHIPPED commit 3ee14fc in history |
| M-42 | 4becf50 ex-offline-e2e DONE: toggleSave fail-honest offline + offline comment queue proofs | dart analyze touched + grep refs |  | SHIPPED commit 4becf50 in history |
| M-43 | 1a1bd96 ex-guest-nudge-sweep DONE: rail like/save/follow/forward nudge + guest-safe build | dart analyze touched + grep refs |  | SHIPPED commit 1a1bd96 in history |
| M-44 | cb5f95f ex-home-header-images DONE: resilient header avatar (dead URL falls back to initial) | dart analyze touched + grep refs |  | SHIPPED commit cb5f95f in history |
| M-45 | 7bbdba9 ex-search-field-reuse DONE: shared AdaptiveField on search (focus passthrough, same h44 ch | dart analyze touched + grep refs |  | SHIPPED commit 7bbdba9 in history |
| M-46 | 854d705 ex-search-header DONE: flat search chrome plain (surface capsule + AppHeader-parity back,  | dart analyze touched + grep refs |  | SHIPPED commit 854d705 in history |
| M-47 | 8633a87 ex-inbox-field: red-screen kill + shared dark-capable AdaptiveField | dart analyze touched + grep refs |  | SHIPPED commit 8633a87 in history |
| M-48 | 7768357 ex-inbox-align: divider inset 88->92 to text column x + lock | dart analyze touched + grep refs |  | SHIPPED commit 7768357 in history |
| M-49 | d80bd21 ex-nav-root-guard: AppNav.pop never pops last route + 6 router backs via facade | dart analyze touched + grep refs |  | SHIPPED commit d80bd21 in history |
| M-50 | 4f7d7ff ex-search-anything DONE: videos+people search, activity-ordered, sectioned results | dart analyze touched + grep refs |  | SHIPPED commit 4f7d7ff in history |
| M-51 | c851559 ex-appheader-reuse: profile rail on MalDriveTokens + AppHeader-parity semantics | dart analyze touched + grep refs |  | SHIPPED commit c851559 in history |
| M-52 | 4ad10a0 ex-post-screen DONE: upload-hang kill + TikTok post rebuild + dead-end pop | dart analyze touched + grep refs |  | SHIPPED commit 4ad10a0 in history |
| M-53 | 52c9e6c ex-chat-idempotency: client_message_id column + lost-ack dup collapse | dart analyze touched + grep refs |  | SHIPPED commit 52c9e6c in history |
| M-54 | 7f42623 type-collapse profile: ladder sizes/weights + darkText tokens (2 files) | dart analyze touched + grep refs |  | SHIPPED commit 7f42623 in history |
| M-55 | 3c66a8d ex-story-viewer-inline DONE: dialog to container, inbox-bubble reply/status | dart analyze touched + grep refs |  | SHIPPED commit 3c66a8d in history |
| M-56 | 6d6ed2c ex-discover-real-verify DONE: honest-empty locks, no dummies (verify-only) | dart analyze touched + grep refs |  | SHIPPED commit 6d6ed2c in history |
| M-57 | 57d4c48 ex-story-composer-build DONE: confirm sheet preview + Post/Discard | dart analyze touched + grep refs |  | SHIPPED commit 57d4c48 in history |
| M-58 | a850c1a type-collapse screens2: last ladder stragglers (2 files) | dart analyze touched + grep refs |  | SHIPPED commit a850c1a in history |
| M-59 | 3dc95e1 type-collapse screens: ladder + tabular scores + darkText (5 files) | dart analyze touched + grep refs |  | SHIPPED commit 3dc95e1 in history |
| M-60 | ca7ec0e ex8 addendum DONE: bio rotation wall-clock 5s + stop-when-filled | dart analyze touched + grep refs |  | SHIPPED commit ca7ec0e in history |
| M-61 | 9355d9d type-collapse widgets: ladder sizes/weights + textPrimary/secondary/darkText (8 files) | dart analyze touched + grep refs |  | SHIPPED commit 9355d9d in history |
| M-62 | 7b30cd4 ex8-profile-edit-fields DONE: name+bio sheet + avatar change, null paths verified clean | dart analyze touched + grep refs |  | SHIPPED commit 7b30cd4 in history |
| M-63 | 60fd22d type-collapse chris: ladder sizes/weights + darkText tokens (9 files) | dart analyze touched + grep refs |  | SHIPPED commit 60fd22d in history |
| M-64 | f148983 ex-getuserdata-guard DONE: single in-flight getUserData (join, not fan-out) | dart analyze touched + grep refs |  | SHIPPED commit f148983 in history |
| M-65 | b0a3422 ex-paystack-pollcap: 45-poll verify budget + honest timeout | dart analyze touched + grep refs |  | SHIPPED commit b0a3422 in history |
| M-66 | 240f82f ex-profile-header-eye DONE (A): mini-avatar block + orphan params out, avatar tests to abs | dart analyze touched + grep refs |  | SHIPPED commit 240f82f in history |
| M-67 | ad6bfc1 ex-ws-deadcode: delete uncalled WS reconnect service + its test (placeholder socket, zero  | dart analyze touched + grep refs |  | SHIPPED commit ad6bfc1 in history |
| M-68 | 7d760d5 retry-storm: earn poll circuit (5-strike stop), queue 42703 classification locks | dart analyze touched + grep refs |  | SHIPPED commit 7d760d5 in history |
| M-69 | e100bcb r-explore-story-reply-provider DONE: own-story reply gate + controller dispose | dart analyze touched + grep refs |  | SHIPPED commit e100bcb in history |
| M-70 | 6b1b3ce ex-live-profile: guest follow nudge, avatar sheet tap, offline catches + 8 tests | dart analyze touched + grep refs |  | SHIPPED commit 6b1b3ce in history |
| M-71 | 302153f ex-live-audit addendum DONE: videos reads video_url->videoUrl (42703); jobs fallback pinne | dart analyze touched + grep refs |  | SHIPPED commit 302153f in history |
| M-72 | 04574a6 ex-live-audit DONE: videos.filterId column (write on upload, read for label) + migration | dart analyze touched + grep refs |  | SHIPPED commit 04574a6 in history |
| M-73 | c3600e2 ex4-followup DONE: bar Save nudges signed-out to login | dart analyze touched + grep refs |  | SHIPPED commit c3600e2 in history |
| M-74 | f1ff2fe ex4 DONE: signed-out like/comment/share nudge to login | dart analyze touched + grep refs |  | SHIPPED commit f1ff2fe in history |
| M-75 | b3ededa ex4 test-only (god-ruled): actionbar suite runs signed-in past nudge | dart analyze touched + grep refs |  | SHIPPED commit b3ededa in history |
| M-76 | ce7a84a ex-avatar-guard DONE: comment tiles reuse avatar guard + initial fallback | dart analyze touched + grep refs |  | SHIPPED commit ce7a84a in history |
| M-77 | decc2b5 ex-discover-fix DONE: deep search merge, comment back+guard, feed Post CTA, avatar guard,  | dart analyze touched + grep refs |  | SHIPPED commit decc2b5 in history |
| M-78 | dfbea45 ex-post-trim DONE: trim range on confirm, fused into ffmpeg pass | dart analyze touched + grep refs |  | SHIPPED commit dfbea45 in history |
| M-79 | b33b4bd ex-post-music DONE: sound picker on confirm, fused ffmpeg bake | dart analyze touched + grep refs |  | SHIPPED commit b33b4bd in history |
| M-80 | 7a8ef96 ex-post-filters DONE: OSS filter picker on confirm, ffmpeg bake pre-compress | dart analyze touched + grep refs |  | SHIPPED commit 7a8ef96 in history |
| M-81 | 4641bd1 ex-profile-fix: grid cells open video, saved/liked mine-only, drop dead widget | dart analyze touched + grep refs |  | SHIPPED commit 4641bd1 in history |
| M-82 | ad518f0 ex-post-refresh DONE: profile grid auto-reloads on post via notifyPostLanded seam | dart analyze touched + grep refs |  | SHIPPED commit ad518f0 in history |
| M-83 | 6b1143c ex-inbox-dead-taps: followers + activity tiles land on real sheets | dart analyze touched + grep refs |  | SHIPPED commit 6b1143c in history |
| M-84 | eedd3a5 ex-chat-failedsends: failed chat sends queue+retry via offline_write_queue | dart analyze touched + grep refs |  | SHIPPED commit eedd3a5 in history |
| M-85 | 34f3008 r47 select overflow: flex trailing slot, 320px lock | dart analyze touched + grep refs |  | SHIPPED commit 34f3008 in history |
| M-86 | eb02e58 r51 delivery voice gap: hold-for-tiers instead of ride misroute | dart analyze touched + grep refs |  | SHIPPED commit eb02e58 in history |
| M-87 | a1c7b48 ex-deck-rewire: 6 screens literals to RideCopy constants | dart analyze touched + grep refs |  | SHIPPED commit a1c7b48 in history |
