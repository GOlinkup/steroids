# J97 Federated private learning — design (no code)

Share gradients across harnesses without sharing prompts. Design only;
nothing here runs.

## Problem
Ranking improves with outcome data (accepts, C22), but prompts are
hash-only by design (privacy rule) and must never leave the machine.
Harnesses (Claude, Codex, agents, OpenCode) each see a slice.

## Design
- Local gradient: each harness accumulates pairwise preference deltas
  (accepted skill +1, shown-but-skipped -0.2, abstained query recorded
  hash-only) into a local vector over skill keyword weights. Raw prompts,
  transcripts, and file paths never enter the vector — only stemmed
  trigger tokens and skill ids.
- Share step: harnesses exchange signed gradient blobs (skill id ->
  delta map, no payloads). Merge rule: median per key across reporters
  (Byzantine-light: a single poisoned reporter cannot move the median
  far), then damp by 0.5 before applying to the shared overlay.
- Apply: merged deltas land in a `federated_overlay` section of
  skill-rules.json, applied last in build_index with a cap (|delta| <=
  0.3 per cycle) so shared learning can never override local NEG guards
  or pins, only re-rank within them.
- Cadence: weekly merge via the nightly job; every merge records
  before/after bench in the digest (C27 ranking-A/B harness consumes this).

## Privacy argument
Exchanged blobs contain (skill, stemmed-token, float) triples only.
No prompt text, no hashes of prompts (hashes would allow confirmation
attacks against known prompt dictionaries), no file paths, no timing.

## Open at build
- Sybil resistance beyond median (reporter identity/staking — see J98
  bounties for the incentive half); cold-start reporters with no history;
  divergence alarms when a harness disagrees persistently.
