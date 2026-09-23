# ADR 001 — Durable execution (SP-1, RQ-3)

Date: 2026-09-23. Timebox: 2 days. Status: decided.

## Question
DBOS-shaped vs Temporal vs Inngest for offline-first durability?

## Decision
DBOS-shaped durability: Postgres-backed library (`@workflow`/`@step`, 1–2ms
step overhead), SQLite variant keeps zero-dependency installs possible.
No new infra in V1; library, not server.

## Why
- Offline-first + solo-operable constraints kill Temporal (orchestration
  server + Cassandra/ES, tens–hundreds ms/step, operator burden).
- Inngest (step memoization, `waitForEvent` zero infra) is runner-up for
  serverless, but data leaves the box; DBOS keeps data in your Postgres.
- Purpose-built AI-agent integrations (OpenAI Agents, Vercel AI SDK) match
  the harness-agnostic loop; parallel-tool-call exactly-once is the property
  fan-out agent work needs.

## Rejected
1. Temporal — durable workflows + event-history recovery, rejected: infra
   + latency + ops cost for solo dev.
2. Inngest — memoization + waitForEvent, rejected: off-box data, weaker
   exactly-once for parallel tools.

## Acceptance (V1)
`kill -9` mid-task → resumes from last completed step; completed side
effects never re-issue. Router today is stateless (served.jsonl append-only,
atomic) so durability binds Phase 2 task engine, not the router.
