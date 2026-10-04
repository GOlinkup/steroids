# Story S-V11-5: Money + onboarding (Sprint 5)

Outcome: the island surfaces gig-tasks landable today (native DB first,
Remotive seed) and first-run studies the person (observe-only + skippable
questions) with learn-me improving suggestions day by day. BLOCKED on god's
island spec — god writes it during Wave 1.

Task V11-5-1: gig surface from native DB + Remotive seed (Kevin)
Description: native jobs/job_applications tables first (gig type, cents,
  geo, status index); Remotive keyless feed as seed (attribution shown, 24h
  delay disclosed). Match ranked by "landable today" for part-time,
  no-attachment work.
Do-not-touch: money movement (no payments/payouts — surface only)
Acceptance:
- [ ] gig list renders from native DB with zero keys
- [ ] Remotive items carry attribution + freshness stamp
- [ ] money shown in subunit-safe format (subunit precedent: cents contracts)
Verification: seed + native rows render; price-format audit on every money string
Dependencies: V11-S3 (queued behind Sprint 3) + god island spec
Files likely touched: jobs surface module (mine only)
Size: M

Task V11-5-2: island profile, mirror-only (Kevin)
Description: minimal profile (user_id, handle, avatar_url, bio, links[],
  verified, counts) mirroring existing cores only — no new identity system.
Do-not-touch: auth (Sprint 4 owns it; profile reads, never mints)
Acceptance:
- [ ] profile renders from linked accounts, creatable where needed
- [ ] no duplicate identity store (grep: single source per field)
Verification: link → profile appears; storage audit (no shadow users table)
Dependencies: V11-5-1
Files likely touched: profile module
Size: S

Task V11-5-3: first-run study + learn-me (Kevin)
Description: observe-only from install (Q8 default) + optional 3 questions,
  skippable in one tap. Learn-me: island watches ~a week, then suggests
  gigs/tasks/next steps. All on-device; nothing leaves without consent.
Do-not-touch: cloud analytics (zero telemetry doctrine stands)
Acceptance:
- [ ] fresh install asks max 3 skippable questions, never blocks
- [ ] suggestions improve from observed behavior (week-simulation proof or honest device-only note)
- [ ] every learned datum viewable + deletable by the user
Verification: fresh-install flow timed; data-view/delete round-trip
Dependencies: V11-5-2
Files likely touched: onboarding + learn loop
Size: M

Checkpoint CP-V11-5: gig-to-profile-to-learning demoed end to end; money
split % stays a human business call (parked, not a blocker).
