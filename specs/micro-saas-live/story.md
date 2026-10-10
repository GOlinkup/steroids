# Story S-MSAAS: Live-test micro-saas-launcher skill (weeks-long, chat-safe)

Outcome: micro-saas-launcher skill validated live on ONE real idea, with
mistakes patched in-skill, without ever killing the chat.

Crew split (lead owns final merge, works Lane 1 ONLY):
- Lane 1 — LEAD/MINE: skill live-test + validation + MVP scope (this dir)
- Lane 2 — NOT MINE: build (whoever owns it, separate dir)
- Lane 3 — NOT MINE: launch/distribution (whoever owns it, separate dir)

Merge rule: Lane 2/3 merge into this story only via lead review.
Lead never edits Lane 2/3 files directly.

Chat-safety rules (why weeks-long is safe):
- No blocking servers in chat (no `electron .`, no `--serve` foreground).
- All probes: `timeout 10`, background logs to `/tmp/opencode/`.
- One task per session, state lives here — chat death = resume from RESULT.md.
- Test idea (fixed for whole run): Steroids Router API — prompt→skill routing
  as a pay-per-call micro-SaaS for harness builders. Reuses existing
  `src/steroids/router.py` (no new build in Lane 1).
