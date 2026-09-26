# ADR 002 — OTel emission shape (SP-2, RQ-4)

Date: 2026-09-23. Timebox: 1 day. Status: decided.

## Decision
Translate at export. §17 bus keeps its names (`task.*`, `context.*`,
`skill.*`, `action.*`, `verification.*`, `failure.*`, `recovery.*`,
`memory.*`, `human.approval.*`); `bus.py:to_cloudevent()` emits
OTel-compatible spans/events in a CloudEvents envelope. Zero custom glue.

## Attribute map (OTel GenAI semconv)
- `gen_ai.request.model` — model id from run context (or `unknown`)
- `gen_ai.usage.input_tokens` / `gen_ai.usage.output_tokens` — when known
- `gen_ai.response.finish_reasons` — `stop`/`error`/`abort`
- CloudEvents: `id`, `source` (`steroids/bus`), `type`, `time` (RFC3339),
  `subject` (run_id/task_id), `data`, `specversion` 1.0
- Content capture opt-in only (prompt hashes by default, J97 privacy rule).

## Why not native
Native OTel SDK = new dependency + collector ops for zero extra signal at
V1 scale. Translation preserves bus names, adds one pure function, renders
in unmodified Grafana/Aspire/Datadog. Revisit when a collector is deployed.

## Acceptance
`python3 -c "from steroids.bus import to_cloudevent"` → envelope validates
against `specs/phase-1/events.schema.json`; sample run renders in an
unmodified OTel dashboard with no bespoke exporter.
