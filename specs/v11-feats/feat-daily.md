# v11 daily feats (F-6..F-12) — free-only

Rule: keyless pipes or on-device. No API keys, no paid tiers, no new deps without a ruling.

## Task F-6 — OCR (screenshot/file text search)

- Description: Drop an image/screenshot; extract text on-device; full-text search over past OCR.
- Acceptance:
  - [ ] PNG/JPG drop -> text out, no network call made (airplane-mode proof)
  - [ ] Past OCR searchable by keyword
  - [ ] Non-image input rejected with honest message
- Verification: 2 files OCR'd offline + 1 keyword search returns both; `grep -r http` clean in new code.
- Size: S (Tesseract/ML-Kit-text already free on-device; thin wrapper + index).
- Deps: none. Files: new `skills/ocr/` only.
- Do-not-touch: router hot loop, existing prewarm.

## Task F-7 — Voice notes (capture + on-device transcript)

- Description: Record a voice note; transcribe on-device (Sherpa-onnx precedent); note = audio + text, searchable.
- Acceptance:
  - [ ] Record/stop/save works offline; transcript attached
  - [ ] Notes list searchable by transcript text
  - [ ] Mic-denied path explains, never spins
- Verification: airplane-mode record -> transcript present; mic-denied bench green.
- Size: M (recorder + STT wiring + list UI).
- Deps: on-device STT model already in tree. Files: new `skills/voicenotes/`.
- Do-not-touch: cloud STT keys, intelligence quota path.

## Task F-8 — Bill radar (upcoming-bill watch)

- Description: Notification-listener watches for bill keywords (bank/biller apps); upcoming amounts land on a radar list + calendar nudge.
- Acceptance:
  - [ ] Bill notification -> radar row (payee, amount, due date if parsed)
  - [ ] Zero bill apps installed -> honest empty state, no fake rows
  - [ ] Amounts stored as integer cents (money invariant)
- Verification: 3 synthetic bill notifications -> 3 rows, cents exact; no-session run = empty.
- Size: M (listener filter + parse + list).
- Deps: notification-listener seam (v11 research Q3). Files: new `skills/bills/`.
- Do-not-touch: payments/earn tables, wallet top-up flow.

## Task F-9 — Podcasts (follow + new-episode ping)

- Description: Follow shows via iTunes Search API (keyless) + direct RSS; new episodes ping, no account.
- Acceptance:
  - [ ] Search finds show without any key; follow persists
  - [ ] New episode in feed -> one notification, no dupes (guid dedupe)
  - [ ] Unfollow stops pings
- Verification: follow 1 show, inject 1 episode guid -> exactly 1 ping; re-poll -> 0.
- Size: S (search + RSS poll + dedupe).
- Deps: iTunes Search (keyless), RSS. Files: new `skills/podcasts/`.
- Do-not-touch: FCM push path (own relay only if needed).

## Task F-10 — Lyrics (synced-lyrics lookup)

- Description: Given artist+title, fetch synced lyrics from LRCLIB (keyless, free) for the current track.
- Acceptance:
  - [ ] Known track -> timestamped lines returned
  - [ ] Unknown track -> honest "no lyrics", never hallucinated lines
  - [ ] Plain (unsynced) fallback labeled as such
- Verification: 1 known + 1 unknown query; unknown returns empty, not filler.
- Size: S (one endpoint + cache).
- Deps: LRCLIB (keyless). Files: new `skills/lyrics/`.
- Do-not-touch: Spotify voice-text widget.

## Task F-11 — Focus timer (work/break cycles)

- Description: Pomodoro-style timer, fully on-device; session log stays local.
- Acceptance:
  - [ ] 25/5 default, adjustable; survives screen-off
  - [ ] Session log lists past sessions; clear-all works
  - [ ] Zero network calls (pure local)
- Verification: full cycle completes with screen off; log shows 1 session; offline green.
- Size: S (timer + local log).
- Deps: none. Files: new `skills/focus/`.
- Do-not-touch: notification channels owned by other lanes.

## Task F-12 — Location reminders (geofence nudges)

- Description: Remind on entering/leaving a place; on-device fence math, GPS poll fallback where no-GMS.
- Acceptance:
  - [ ] Enter-fence -> reminder fires once (no re-fire storm)
  - [ ] Leave-fence variant works
  - [ ] Location-off -> honest disabled state, no crash
- Verification: synthetic enter/leave -> exactly 1 fire each; location-off bench green.
- Size: M (fence store + poll loop + once-guard).
- Deps: none keyless (OS geofence or own poll). Files: new `skills/places/`.
- Do-not-touch: ride/planner GPS stack.

## LEVEL-UP

- Improvements: one shared `skills/daily-lib/` for once-guards + cents + dedupe (F-8/9/12 triplicate it otherwise); every list gets the honest-empty rule from F-8; airplane-mode proof becomes the standard Verification line.
- New free-only ideas (max 3):
  - D-N1: Morning-briefing rollup — GDELT headlines + Open-Meteo + calendar events composed into one offline-readable doc at boot (v11 research Q1 pipes).
  - D-N2: Podcast-to-note — new episode RSS enclosure + on-device STT summary appended to voice notes (F-7 x F-9, zero keys).
  - D-N3: Bill-digest ping — F-8 radar rows batched into one weekly own-relay digest instead of per-bill noise.
