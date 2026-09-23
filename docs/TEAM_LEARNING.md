# Team learning (C29) — design doc

Shared org accept pool: one JSON file both humans and agents can read.

## Format

`team-pool.json`:

```json
{"accepts": {"pdf": 12, "code-review": 7}}
```

Only aggregate counts. No prompts, no transcripts, no timestamps.

## Merge rule

Opt-in via `steroids --team <path>`. Pool sums into local accepts
(`merge_team_pool`); ranking math downstream is unchanged. No flag, no
merge, no network — the file is read from disk and never written by the
router.

## Privacy

The pool reveals which skills an org uses and how often. Keep it inside
the org boundary (repo, shared drive). Never commit other orgs' pools.

## Limits (ponytail)

No deltas, no per-user attribution, no decay inside the pool (local
decay still applies after merge). Add those when an org outgrows sums.
