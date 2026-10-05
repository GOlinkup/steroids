# v11 glue feats (F-17..F-20) — free-only

Rule: keyless pipes or on-device or own relay. No API keys, no paid tiers.

## Task F-17 — Task-capture (share-to-task inbox)

- Description: System share-target ("send to Steroids") drops text/URL into a local task inbox; triage later.
- Acceptance:
  - [ ] Share from any app -> inbox row in <2s, offline OK
  - [ ] URL rows keep source link; text rows keep full body
  - [ ] Inbox survives restart (persisted, not memory-only)
- Verification: 3 shares (text, URL, offline) -> 3 persisted rows after restart.
- Size: S (share-target + local store).
- Deps: none. Files: new `skills/capture/`.
- Do-not-touch: router.py, island bridge protocol.

## Task F-18 — Money-moved (transaction ping log)

- Description: Bank/payment notifications via listener become a cents-exact moved-money log (in/out per payee).
- Acceptance:
  - [ ] Transaction notification -> log row (payee, signed cents, timestamp)
  - [ ] Non-money notifications ignored (no spam rows)
  - [ ] Running total matches sum of rows (no float math)
- Verification: 4 synthetic txns (2 in, 2 out) -> total exact in cents; 1 non-txn -> ignored.
- Size: S (listener filter + cents log).
- Deps: notification-listener seam (v11 Q3). Files: new `skills/moneymoved/`.
- Do-not-touch: earn/payout math, wallet tables, MONEY_MODEL.

## Task F-19 — Read-later (offline reading queue)

- Description: Save URLs to a local queue with cached readable text; airplane-mode reading works.
- Acceptance:
  - [ ] Save URL -> readable text cached (own fetch, no key)
  - [ ] Offline open renders cached copy with stale label
  - [ ] Unfetchable URL -> honest error row, queue intact
- Verification: save 2 URLs, airplane on -> both readable + labeled stale; 1 bad URL -> error row.
- Size: M (fetch + extract + cache + reader).
- Deps: none keyless. Files: new `skills/readlater/`.
- Do-not-touch: content feed/ranker, WebView article path.

## Task F-20 — Skill pre-warm (boot-time index ready)

- Description: At boot/charger-idle, pre-warm router index + skill hooks so first query never cold-starts (extends existing prewarm precedent).
- Acceptance:
  - [ ] Cold boot -> first query < warm p50 budget (bench before/after)
  - [ ] Pre-warm never blocks boot (background, capped time)
  - [ ] Battery-saver on -> pre-warm deferred, stated honestly
- Verification: latency bench delta recorded; boot-time regression test green.
- Size: S (schedule + cap + gate).
- Deps: existing prewarm path. Files: `skills/prewarm/` (new) + additive hook only.
- Do-not-touch: router hot loop internals, live index format.

## LEVEL-UP

- Improvements: F-17/F-19 share one URL row shape (source, body, cached, stale flag) — single `skills/queue-lib/`; F-18 reuses F-8's cents rule; pre-warm (F-20) covers F-19's extractor at idle, not query time.
- New free-only ideas (max 3):
  - G-N1: Missed-task backfill — notification-log replay (own store) resurrects shares dismissed before F-17 existed, one import pass.
  - G-N2: Charger-idle sync — F-19 queue + F-9 feeds refresh only on charger + Wi-Fi, battery story stays clean.
  - G-N3: Pre-warm signal — F-20 emits index-ready event; island mascot shows idle->ready (no fake progress, honest state only).
