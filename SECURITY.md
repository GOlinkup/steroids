# Security Policy

## Supported versions

| Version | Supported |
|---------|-----------|
| 0.1.x   | Yes       |

## Reporting a vulnerability

Contact: **TBC** — security contact address pending (human ask outstanding).
Do not open a public issue for a suspected vulnerability.

What helps: affected version/commit, steps to reproduce, impact assessment.
Expect an acknowledgement once the contact is staffed; until then reports
are queued, not dropped.

## Scope notes

- Steroids is offline-first: routing, logs, and evals stay on the machine.
  There is no server side to probe.
- Never commit secrets, tokens, or PATs. A shredded PAT is precedent
  (`f5e9843`); anything leaked is rotated, never amended into history.
- Log files (`served.jsonl`) hold prompt hashes and trigger words only —
  no prompt text. Treat any change that would log raw prompts as
  security-relevant and flag it in the commit.
