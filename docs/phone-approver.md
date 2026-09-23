# F58 Phone approver — design (no code)

Approve skill injects remotely from a phone. Design only; nothing here runs.

## Problem
The router suggests skills on a workstation harness; the human is away
from keyboard but has their phone. They should approve/deny the inject
without returning to the desk.

## Flow
1. Hook mode (`--claude-hook` / `--antigravity-hook`) produces a suggestion
   instead of injecting: `{skills, hint, request_id}`.
2. A tiny local outbox server (localhost, harness-owned) holds the pending
   request and pushes it to the paired phone (platform push or polling —
   transport TBD at build; polling the outbox server is the fallback).
3. Phone shows skill names + hint + Approve / Deny.
4. Decision returns to the outbox server; the hook's follow-up poll picks it
   up: approve → inject as today; deny/timeout (60s default) → skip, logged
   as abstention input for `propose`.

## Auth & safety
- Pairing: QR-shown secret on first run, stored phone-side; every decision
  HMAC-signed. No cloud account required.
- Scope: approve/deny suggestions only — never prompt text, never file
  writes. Prompts stay hash-only per the served-log privacy rule.
- Deny and timeout are indistinguishable downstream (both = skip).

## Open at build
- Push vs poll transport; multi-phone pairing; approve-with-edits
  (e.g. "load only the first skill").
