# Sprint 4 cut list: X / IG / TikTok (filed, not silent)

Outcome per `tasks.md` T4-3: Mastodon + Bluesky ship, Reddit next.
The networks below are explicitly CUT with reasons — never silently
retried, no spend without a human order (standing rule).

## X (cut: paid + summoned-only replies)

- Reply path requires API access tiers that cost money. Standing rule:
  no spend without a human order.
- Even paid, reply scope is summoned-only (replies to mentions of the
  authenticated account in constrained contexts) — not a general
  island reply surface.
- Revisit only on: human orders the spend AND the reply scope covers
  island use. Until then, no adapter, no retries.

## Instagram (cut: no reply API)

- No public API for replying to comments/DMs from a third-party client
  (Messenger API covers Pages, not personal reply-from-island).
- Revisit only on: Meta ships a personal reply API. Until then, cut.

## TikTok (cut: no reply API)

- TikTok's open APIs cover login/kit, posting, and display — no
  comment-reply surface for a third-party client.
- Revisit only on: TikTok ships comment-reply scope. Until then, cut.

## Live-proof parking (human read-back)

- Masto + Bluesky reply round-trips are fixture-proven in
  `test/features/social/social_adapters_test.dart`; second-client
  visibility confirmation needs human credentials → rides the T2-4
  device pass (same hands, same device session).
- Reddit shapes are fixture-proven in
  `test/features/social/reddit_test.dart`; live round-trip likewise
  rides the device pass (installed-app OAuth, no secret, no spend).
