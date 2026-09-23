# V1 Planning Pack — scope, dependencies, sized Phase 0

Method note: this pack does NOT use naive t-shirt sizing. For AI/agent work,
t-shirt sizing rests on assumptions that collapse (prior experience transfers,
similar-looking tasks cost similar effort, work decomposes cleanly —
arXiv:2602.17734). Instead: **ranges + timeboxed spikes + checkpoint gates**,
per the Cone of Uncertainty (Boehm/McConnell: early estimates carry 4x–0.25x
variability, reducible only by refining the work itself). A range 3× wider at
the top than the bottom is not an estimate — it is a request for a spike.

## 1. Scope statement

- **Product scope (V1):** local reliability layer for AI coding agents —
  skill routing (shipped, measured), run/task state, event stream + CLI
  status, completion contracts, failure recovery loop, frozen-golden eval
  harness with trial policy and CIs.
- **Project scope (this plan):** Phases 0–2 + four §26 adoptions
  (durable-execution decision, OTel/CloudEvents emission, AgentDojo dimension,
  body-text ablation) + planning pack itself.
- **Out of scope (V1):** daemon/server, multi-agent orchestration, MCP
  discovery, web dashboard, marketplace, federated/team learning rollout,
  model hosting, fine-tuning a router.
- **Acceptance criteria (V1 ships iff ALL hold):** frozen golden green with
  trials + CIs; MODEL vs MODEL+STEROIDS separation on 20 real tasks;
  kill -9 resume demonstrated; run renders in unmodified OTel dashboard;
  Utility-Under-Attack reported; install/uninstall clean on all 4 harnesses.
- **Assumptions:** solo developer; local-first (no cloud dependency in V1);
  Python stdlib preference holds; 1265-skill index as reference scale.
- **Constraints:** no new paid infrastructure; no model fine-tuning budget;
  privacy rule (hash-only prompts in logs) is inviolable.

## 2. Dependency map

```
Phase 0 baseline ─┬─→ Phase 1 events ──→ Phase 2 task engine
                  │        │                    │
                  │        └─→ OTel emission ────┘
                  ├─→ trial-policy bench (extends frozen golden)
                  ├─→ AgentDojo dimension (needs bench runner)
                  ├─→ body-text ablation (needs bench runner)
                  └─→ durability ADR + spike (needs task engine draft)
```

Rule: nothing downstream starts until its upstream's acceptance test exists
(test-first at phase granularity). The bench runner is the critical path —
it gates §26 items 2, 4, 5.

## 3. Spikes register (timeboxed, question-first, knowledge output)

| ID | Question | Timebox | Output |
|---|---|---|---|
| SP-1 | DBOS-shaped vs Temporal vs Inngest for offline-first durability? | 2 days | ADR + §26.1 decision |
| SP-2 | OTel GenAI semconv: emit natively or translate at export? | 1 day | ADR + emission sketch |
| SP-3 | Body-text indexing: ΔP@1 vs Δtokens/latency on golden? | 2 days | keep/drop + numbers |
| SP-4 | AgentDojo: which suites map to coding-agent threat model? | 1 day | suite list + cost estimate |

Spike rule: stated question + deadline + written output (goes in ADR log),
or it becomes the project.

## 4. Phase 0 — executable tasks (ranges, solo dev)

- [ ] P0-1 Freeze reference environment: record index size, skill-rules hash,
  model versions, vectors digest → `benchmarks/REFERENCE.md`. (0.5–1d)
- [ ] P0-2 Trial policy in bench: `--trials N`, report mean + 95% CI
  (bootstrap, stdlib). Re-measure golden 0.799 with trials. (2–4d)
- [ ] P0-3 Collect 20 real tasks from actual failures/sessions (per
  Anthropic: 20–50 from real failures, not synthetic). (2–5d, mostly waiting
  on reality)
- [ ] P0-4 Harness: run identical task list MODEL-only vs MODEL+STEROIDS,
  isolated trials, paired cases, record tokens/cost/time/corrections. (3–7d)
- [ ] P0-5 Baseline report with CIs + the honest gap analysis. Gate: if no
  separation, stop and simplify (kill criterion fires here, cheapest point).
- [ ] P0-6 Grader rules adopted: outputs-not-paths, partial credit,
  reference solutions, transcript reads. (1–2d, with P0-4)

Phase 0 total: 1.5–4 weeks elapsed (P0-3 waits on real failures; parallelize
P0-1/P0-2/P0-6 with collection).

## 5. Phase 1–2 sizing (ranges, pre-spike)

- Phase 1 event system (IDs, schema as CloudEvents, bus, CLI stream): 1–3 wk.
- Phase 2 task engine (goal/task objects, hierarchy, states, questions,
  assumptions, evidence, contracts): 2–5 wk.
- §26 items post-spike: durability 2–6 wk; OTel emission 0.5–2 wk; AgentDojo
  dimension 1–3 wk; body-text ablation 1–2 wk (then keep/drop).

## 6. Change control

Scope changes go through the same gate as code: propose → measured impact →
accept/reject recorded. The `--check` pattern (machine-verifiable claims)
extends to plans: any committed date without a narrowed range is flagged
stale. Re-estimate at each checkpoint with new evidence; never defend an old
number.

## 7. Milestones (10, relative weeks from kickoff W0)

| # | Milestone | Target | Gate |
|---|---|---|---|
| M1 | Reference environment frozen | W0 | `benchmarks/REFERENCE.md` committed |
| M2 | Trial-policy bench green (`--trials N` + CIs) | W1 | golden re-measured, variance known |
| M3 | 20 real tasks collected | W1–W3 | task bank from actual failures |
| M4 | Baseline report (MODEL vs MODEL+STEROIDS) | W3–W4 | kill criterion evaluated, go/no-go recorded |
| M5 | Events streaming in CLI | W4–W6 | watch a run live, no new harness code |
| M6 | Task engine minimal (goal/task/evidence objects) | W6–W9 | task tree for one real feature, verified |
| M7 | OTel/CloudEvents emission live | W7–W10 | run renders in unmodified dashboard |
| M8 | AgentDojo dimension reported | W8–W11 | Utility + Utility-Under-Attack pair |
| M9 | Body-text ablation decided | W9–W11 | keep/drop with ΔP@1 vs Δcost |
| M10 | V1 ship review vs acceptance criteria (§1) | W11–W12 | all ship-iff boxes checked or cut recorded |

10 milestones max per standard practice; each is a stakeholder review point
(stakeholder = you, acting as approver — see §9).

## 8. Cost baseline (Sept 2026 rates, re-verify at spend time)

Formula per eval cycle: `cost = Σ_tasks Σ_trials (in_MTok × in_rate +
out_MTok × out_rate)`. Reference rates: Sonnet 4.6 $3/$15, Opus 4.5–4.8
$5/$25, Haiku 4.5 $1/$5 per MTok; Batch API −50%; prompt-cache reads −90%
input. Field data: SWE-bench-class tasks cost roughly $0.6–$3/task on
Sonnet/Opus harnesses; long-horizon company tasks ~$4/task; full benchmark
runs $100–$1,000. Budget policy (adopted from OpenHands SDK's three tiers):
programmatic mocked tests run free on every change; LLM integration tests
($0.5–$3, <5 min) daily + on risky changes; full benchmark cycles on-demand
only, capped per cycle in advance, actuals recorded next to the estimate.
Eval spend is tracked like any other budget line — a cycle that exceeds its
cap without approval is a process failure, not a cost of doing business.

## 9. RACI + reporting cadence

Solo project: one line. Responsible/Accountable/Consulted/Informed = you, in
all roles; the approver hat is worn explicitly at M-gates (write "approved"
or "cut" — silence is not approval). Reporting: nightly report auto-generates
(existing scripts); weekly review (30 min) reads it, updates ranges, records
one decision. Retrospectives at M4, M6, M10 closeout: what improved measurably,
what to stop doing — written, one page.

## 10. Risk register (top 6, owner = you)

| Risk | Mitigation | Trigger |
|---|---|---|
| Baseline shows no separation (M4) | kill/simplify per criterion; cheapest failure point by design | P0-5 numbers flat |
| Eval costs overrun | tiered testing (§8); caps per cycle | spend > budget |
| Scope creep (+50% is the industry norm) | §6 change control; any +scope re-opens kill criteria | unplanned task added |
| Vendor subsumption mid-build | harness-agnostic posture (§24.7); adoption ladder intact | vendor ships native equivalent |
| Grader/judge invalidates results | grader rules (outputs-not-paths, calibration, transcripts) | two-expert disagreement |
| Key-person (solo) stall | nightly automation carries state; docs carry context | >1 week no commit |

Contingency rule: every range carries 30% margin; margin consumed visibly
(log it). Creep guard: new work enters only via change control with its Kill
check attached — no orphan tasks.

## 11. Traceability (requirement → task)

| Req | Statement (from §1 acceptance) | Served by |
|---|---|---|
| RQ-1 | Frozen golden green with trials + CIs | P0-1, P0-2, M2 |
| RQ-2 | MODEL vs MODEL+STEROIDS separation | P0-3, P0-4, P0-5, M4 |
| RQ-3 | kill -9 resume demonstrated | SP-1, durability build |
| RQ-4 | Run renders in unmodified OTel dashboard | SP-2, M7 |
| RQ-5 | Utility-Under-Attack reported | SP-4, M8 |
| RQ-6 | Install/uninstall clean on 4 harnesses | install.sh + verify-hooks (existing) |
| RQ-7 | Body-text decision recorded | SP-3, M9 |
| RQ-8 | Learning loop trending up on flat review load | §25, weekly review |

Closeout: at M10, each RQ gets met/cut/deferred in writing; deferred items
carry their evidence forward, never their assumptions.

## 12. WBS — Phases 1–2 (Phase 0 already decomposed as P0-1..6)

Phase 1 (events → M5): P1-1 event schema as CloudEvents (+OTel attributes;
unblocks SP-2/M7). P1-2 run/task ID issuance. P1-3 bus with file sink
(JSONL, grep-able). P1-4 CLI live stream of the bus. P1-5 phase retro.
Phase 2 (task engine → M6): P2-1 goal/task JSON Schemas. P2-2 hierarchy +
status machine (the 11 states). P2-3 questions/assumptions/evidence fields
wired to router context. P2-4 completion contracts enforced in code.
P2-5 one real feature driven end-to-end through the engine. P2-6 phase
retro. WBS rule going forward: no phase starts without its P-tasks listed
with ranges; no task without its RQ tag.

---

*Status: planning pack v1. Sizes are ranges per Cone of Uncertainty; narrow
them with spikes (SP-1..4), never with confidence. Next: execute P0-1.*
