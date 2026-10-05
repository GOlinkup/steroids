# Story S-V0.1.1-4: Socials link + reply (Sprint 4)

Outcome: socials link fast via login in Settings (golinkup auth reused) and
support read + reply only. Mastodon + Bluesky first, Reddit next. X / IG /
TikTok explicitly cut (paid or no-reply-API — recon proved it).

Task V0.1.1-4-1: sign-up for Steroids in Settings (Jim)
Description: add Steroids sign-up/sign-in in Settings (golinkup auth
  machinery reusable underneath, but the account is Steroids — not a
  golinkup login). OAuth on-device; we never hold passwords; per-account
  link/unlink.
Do-not-touch: golinkup internals (borrow the machinery, never rebrand the account)
Acceptance:
- [ ] sign-in completes from Settings in under a minute
- [ ] unlink removes all local tokens (verified, none left on disk)
- [ ] no password or secret ever touches our storage (grep proof)
Verification: link/unlink cycle + storage grep for secrets (clean)
Dependencies: V0.1.1-S2 reply path (queued behind Sprint 2, same hands)
Files likely touched: settings screen + auth wrapper (mine only)
Size: S

Task V0.1.1-4-2: Mastodon + Bluesky read + reply (Jim)
Description: free, open reply APIs (Mastodon OAuth; Bluesky ATProto
  app-password). Mentions/notifications readable, replies post.
Do-not-touch: composing/posting/scheduling (OUT — later, not this card)
Acceptance:
- [ ] mentions list reads live on both networks
- [ ] reply posts and is visible from a second client
- [ ] explicit-send only (matches platform consent rules)
Verification: reply round-trip ×2 networks, confirmed from second client
Dependencies: V0.1.1-4-1
Files likely touched: social adapters (new files)
Size: M

Task V0.1.1-4-3: Reddit next, cuts recorded (Jim)
Description: Reddit free OAuth read + reply; X (paid + summoned-only
  replies), IG/TT (no reply API) recorded as cut with reasons, never
  silently retried.
Do-not-touch: paid tiers (no spend without human order, standing rule)
Acceptance:
- [ ] Reddit reply round-trip proven, or parked with the exact blocker
- [ ] cut list (X/IG/TT + reasons) filed in the spec, human acknowledged
Verification: Reddit proof or blocker evidence; cut list read-back by human
Dependencies: V0.1.1-4-2
Files likely touched: reddit adapter or blocker note
Size: S

Checkpoint CP-V0.1.1-4: two-network reply demoed from the island before any
management-console scope is discussed.
