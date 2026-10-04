# Free feats — money (ideas 13–16)

Outcome: gig money without paid tools — invoice, rate math, alerts, and CV
export, all computed on-device from data the user already has. Keyless,
no subscriptions. Feeds Sprint 5 (gig → profile → learning).

Task F-13: invoice generator (money)
Description: build a simple invoice from a gig record (client, lines,
  totals, sequential invoice number) and export as PDF/markdown, on-device.
  Numbering is gapless per user; voided numbers stay listed, never reused.
Do-not-touch: payment rails (paper only — no charging, no Paystack here)
Acceptance:
- [ ] invoice renders from a gig with correct line totals + grand total
- [ ] numbers are sequential with no silent reuse after void
- [ ] export opens/shares as a file through the existing drop pipe
Verification: create 3 invoices, void #2, create #4 — sequence 1,3,4 with void listed
Dependencies: gig record shape (Sprint 5 contract; stub shape acceptable now)
Files likely touched: new invoice module + export
Size: M

Task F-14: rate calculator (money)
Description: hourly/project rate from costs + target income + billable
  hours (freelancer formula, on-device). Inputs stay on device; result
  feeds quotes and F-13 line defaults.
Do-not-touch: live market data (formula only, no rate feeds)
Acceptance:
- [ ] rate recomputes live as costs/hours change, math shown (no black box)
- [ ] result can be saved as the default rate for new gigs
- [ ] zero/negative inputs refuse with a reason, never produce a rate
Verification: hand-check 3 scenarios against the formula; bad inputs refused
Dependencies: none (standalone; feeds F-13)
Files likely touched: new calculator module
Size: S

Task F-15: gig alerts (money)
Description: on-device matching of new gig posts against the user profile,
  alerted via the existing push path. Sources are free RSS/boards only
  (no paid APIs, no keys); matching keywords live on device; user picks
  which feeds to watch.
Do-not-touch: auto-applying (alerts only — no applications sent by the app)
Acceptance:
- [ ] a matching post produces one alert with the matched keywords shown
- [ ] non-matching posts produce nothing (precision over recall)
- [ ] feeds are user-chosen; disabling a feed stops its alerts
Verification: seed 10 posts (5 match, 5 not) — exactly 5 alerts with reasons
Dependencies: profile shape (Sprint 5); push path (own-relay/ntfy per recon)
Files likely touched: new matcher + feed list
Size: M

Task F-16: CV export (money)
Description: export the on-device profile (gigs, skills, rates) as a clean
  CV in markdown + PDF. No templates bought, no cloud builder; one honest
  layout done well.
Do-not-touch: profile editing (export reads the Sprint 5 profile as-is)
Acceptance:
- [ ] export contains every profile section, nothing silently dropped
- [ ] empty sections render as honest placeholders, not fake entries
- [ ] regenerated export after a profile change reflects the change
Verification: export, diff against profile data; add a gig, re-export, gig present
Dependencies: profile shape (Sprint 5)
Files likely touched: new export module
Size: S

## LEVEL-UP (money)

Improvements to the four above:
- Chain them: F-14 rate → F-13 invoice lines → F-16 CV rate line all read
  one saved default rate, so the three numbers can never disagree.
- F-15 matcher doubles as the Sprint 5 gig-feed filter — same keyword
  profile, alerts now, feed ranking later.
- Honest-money rule: every money surface shows its formula or source
  (rate math, matched keywords, invoice sequence); nothing is a black box.

New free-only ideas (one line each):
- F-M17: quote generator — client-facing estimate (sister doc to the invoice) that converts to an F-13 invoice in one tap.
- F-M18: receipt snap — photo of a paper receipt attaches to a gig as an expense (uses the F-3 photo path, no OCR).
- F-M19: late-payment nudge list — aging unpaid invoices surfaced with days-overdue, no auto-send (human sends).
