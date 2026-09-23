# J98 Skill bounties — design (no code)

A market for expertise: requesters post bounties, authors earn them.
Design only; nothing here runs.

## Bounty lifecycle
1. Post: `steroids bounty post --need "X" --reward <amount>` — need text
   is embedded locally; only the trigger-token sketch leaves the machine.
2. Claim: author drafts a SKILL.md (G61 generator), attaches goldens
   (D31: 5 queries, CI-enforced).
3. Judge: blind eval delta on the affected query cluster + G62 lint clean
   + no bench regression (D32 gate). Payout releases iff all three hold.
4. Settle: skill merges to the index; author recorded for G68 royalties
   if outcome tracking (C22) later attributes fires.

## Anti-gaming
- Goldens are held out (author never sees the eval rows, only the need).
- Keyword-stuffing the draft fails the held-out paraphrase half by
  construction (blind sets are stranger-style, not keyword dumps).
- Duplicate of an existing skill (G64 overlap > 0.9) resolves as merge
  with a reduced finder-fee, not a full bounty.

## Pricing (starter)
- Fixed tiers (S/M/L) in stablecoin via agent rails (see agent-payment-x402);
  L-tier requires a digest-recorded bench delta. No auctions in v1.

## Open at build
- Escrow/custody for rewards; dispute oracle when judge metrics tie;
  sybil authors farming their own bounties (ties to J97 reporter identity).
