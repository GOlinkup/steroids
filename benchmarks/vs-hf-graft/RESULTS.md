# Router probe: Steroids vs Hugging Face vs Graft (2026-09-25)

Method: 20 labeled queries through Steroids `route_query`, run INSIDE
`offline_guard()` (any socket creation raises) — raw data in `results.json`,
repro with `python3 run.py`. HF and Graft columns are documented as
non-runnable with reasons, not scored. No numbers invented.

| | Steroids (measured) | Hugging Face | Graft AI |
|---|---|---|---|
| Routing P@1 (20 tasks) | **0.950** (19/20) | N/A — no routing product; you name the skill by hand | N/A — private beta, waitlist-only, no access |
| Mean latency | 86ms (956ms cold first query, ~40ms warm) | human minutes (manual selection) | unmeasurable |
| Works offline | **proven** — full run under socket-killing guard | skills are local files once installed; discovery is web | on-prem by design (unverified, no access) |
| Cost per 1k routes | $0 (no model calls) | $0 (static files) | unknown (enterprise) |
| Cross-user learning | yes, anonymous 100-row cap | none | company map (vendor claims) |

The one MISS: "draw a diagram of this system architecture" routed to
`diagrammer` instead of `archify` — a legit sibling skill, wrong label.
Tracked, not hidden.

Sources: huggingface.co/docs/hub/en/agents-skills,
github.com/huggingface/skills, github.com/graft-org/graft (private beta).
