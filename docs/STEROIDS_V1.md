# STEROIDS V1

## Dynamic Context, Planning, Memory, Verification & Recovery Layer for AI Agents

**Project objective:** build Steroids into a runtime layer that makes existing AI
agents substantially more reliable by automatically selecting relevant knowledge,
dynamically decomposing tasks, maintaining task/project state, detecting
uncertainty and failures, recovering from mistakes, and verifying completed work.

**North-star sentence (keep on the wall):**

> Steroids exists to keep an AI agent grounded in the right context, the right
> plan, the right evidence, and the actual state of the world until the user's
> objective is truly complete.

**Product promise:** the same AI model performs better with Steroids, because
Steroids gives it the right information, structure, feedback and verification at
the right time. Steroids is NOT another model, NOT another coding assistant, NOT
just a skill manager. Model = intelligence; Steroids = discipline.

**Core rule for every feature:** does this measurably improve the agent's ability
to complete tasks correctly, efficiently, or reliably? If no, don't build it yet.

---

## 1. The fundamental problem

Agents can access enormous information (skills, docs, MCP tools, APIs, files,
memories) but context is finite and its usefulness depends on relevance. Steroids
treats context as a managed resource. The fundamental question:

> What does the agent need to know right now to make the next correct decision?

Don't think "how do we make the AI smarter" — think "how do we make the AI less
likely to operate while it is confused."

## 2. The Steroids loop

```
UNDERSTAND → PLAN → DECOMPOSE → GROUND → EXECUTE → OBSERVE → VERIFY → REMEMBER → CONTINUE
```

On failure:

```
VERIFY → FAIL → DIAGNOSE → IDENTIFY MISSING KNOWLEDGE → RETRIEVE
  → UPDATE PLAN → RETRY → VERIFY AGAIN
```

So a mistake becomes detected → understood → corrected → verified, instead of
mistake → hallucination → worse mistake.

## 3. The five core systems

- **A. Goal system** — maintains the original user objective so long executions
  don't lose it.
- **B. Planning system** — hierarchical task graph (goal → epic → feature →
  story → task → subtask → action), expanded progressively, only where needed.
- **C. Context system** — the original Steroids engine: 1,265 available →
  candidates → selected → irrelevant rejected. Optimize useful information per
  token, not document count.
- **D. Evidence/verification system** — distinguishes FACT / ASSUMPTION /
  INFERENCE / UNKNOWN / VERIFIED FACT. Never let an unverified assumption
  silently become a fact.
- **E. Recovery system** — ERROR → STOP → CLASSIFY → failed assumption? →
  retrieve → replan → retry → verify. Never random-fix loops.

## 4. Task state (non-negotiable)

Every task tracks: GOAL, PLAN, CURRENT STEP, KNOWN, UNKNOWN, ASSUMPTIONS,
EVIDENCE, FAILURES. Memory tells you what happened; task state tells you what
you're trying to accomplish.

## 5. Task object model

```json
{
  "id": "AUTH-2.4.3", "title": "Validate JWT signature", "parent": "AUTH-2.4",
  "status": "pending", "goal": "...", "inputs": [], "dependencies": [],
  "questions": [], "known_facts": [], "unknowns": [], "assumptions": [],
  "required_context": [], "actions": [], "verification": [], "evidence": [],
  "failures": [], "decisions": [], "memory_updates": []
}
```

Statuses: PENDING, DISCOVERING, PLANNED, READY, RUNNING, VERIFYING, BLOCKED,
FAILED, RECOVERING, COMPLETED, CANCELLED.

## 6. Task granularity + question-driven tasks

A task is small enough when it has a clear objective, identifiable inputs,
executability, measurable result, independent verifiability. Tasks generate
internal questions (what auth exists? where are users stored? what happens on
failure?) to reduce uncertainty — not necessarily exposed to the user.

## 7. Dynamic expansion

Never generate 100,000 tasks up front. Expand progressively (payments → backend →
webhooks → signature verification …), only the branch under work. The plan
itself must not become context bloat. The task graph changes as the system
learns (e.g. discovering a missing persistence layer mid-task).

## 8. Uncertainty mechanism

When the model lacks information to act safely, don't let it fill the hole with
an assumption. "I'll use API X / because I think it's available / evidence? none"
must trigger: retrieve documentation → inspect project → verify. Goal: don't
turn uncertainty into an unverified fact.

## 9. Verification engine (five levels)

1. Syntax (type check, lint, compile) 2. Unit 3. Integration 4. Runtime
5. Objective — does this satisfy the original request? A passing build with a
wrong feature is still failure. Every task needs a completion contract; only
evidence against the contract marks COMPLETED.

## 10. Failure classification + anti-loop

Classes: KNOWLEDGE, TOOL, ENVIRONMENT, CODE, TEST, PLANNING, ASSUMPTION,
DEPENDENCY, CONFIGURATION, EXTERNAL_SERVICE, UNKNOWN. Anti-loop rules: same
failure 2× → stop and diagnose; same strategy 2× → replan; same error 3× →
escalate; no progress for N iterations → pause; repeated contradiction → human
input. Progress = movement toward completion supported by evidence.

## 11. Memory (four levels, strict promotion)

L1 current action → L2 current task → L3 project facts (durable, evidenced) →
L4 historical decisions/failures. Promotion rule: OBSERVATION → candidate →
durable? project-specific? likely useful? evidenced? → STORE. Otherwise memory
becomes a junk drawer. Includes failed-approach memory ("do not repeat") and
forgetting/conflict resolution. Test retention AND forgetting.

## 12. Project facts vs opinions + trust levels

"Probably uses PostgreSQL" is banned; "PostgreSQL — evidence: schema.prisma" is
required. Trust: official docs / source / tests / user intent = HIGH; model
inference / unverified memory = LOW. Every context selection explainable ("why
this? why not that? confidence?"). Report "what Steroids prevented" only with
evidence.

## 13. Context router + skill registry/health

Score context by semantic + project + dependency + historical usefulness +
task relevance − redundancy − token cost. Skill registry metadata (id, domains,
triggers, deps, version, source, trust) + health (success/failure counts,
staleness) so stale knowledge is avoided. Manual `/skill` stays as override;
automatic selection is the default. JIT loading at the moment of need, with
deduplication and selection explanations.

## 14. Knowledge freshness

Per source: FETCH → HASH/VERSION → CHANGE DETECTION → RE-INDEX → UPDATE
METADATA → MARK OLD. Never silently replace; preserve provenance (source,
version, retrieved_at, checksum). Knowledge versioning lets Steroids flag
implementations built on older docs.

## 15. Human checkpoints

Autonomous by default; stop for: destructive migrations, prod deploys, mass
deletes, credential changes, irreversible/high-cost actions, ambiguous business
requirements. ⚠ HUMAN APPROVAL REQUIRED.

## 16. Tool/MCP architecture + adapters

Every tool: name, purpose, inputs, outputs, permissions, side effects, cost,
risk, examples, failure modes. MCP (prompts/resources/tools) integrated, not
reinvented: discover → select relevant → expose only useful capabilities.
Model adapters (OpenAI/Anthropic/Gemini/DeepSeek/Qwen/GLM/local) and agent
adapters (OpenCode/Claude Code/CLI) keep the engine model-independent — the
claim must hold across models.

## 17. Observability: event bus first, UI later

Central event bus (`task.*`, `context.*`, `skill.*`, `action.*`,
`verification.*`, `failure.*`, `recovery.*`, `memory.*`, `human.approval.*`),
every event `{id, timestamp, run_id, task_id, type, source, payload,
severity}`. Every run gets a RUN-ID with goal/tasks/context/actions/failures/
verification/metrics. CLI streams the bus; web UI later consumes the same
events. Never build two systems. CLI v1: `run`, `status`, then the rest.
End-of-task REPORT with real numbers only (context selected/ignored, actions,
failures, recoveries, verification, memory updates, time).

## 18. Evaluation (not optional)

Harness early: identical real tasks, MODEL ONLY vs MODEL + STEROIDS. Metrics —
outcome (success, requirements, tests, regressions), efficiency (tokens, cost,
time, tool calls, context size), context quality (precision/recall, irrelevant
%), reliability (hallucinated assumptions, repeated failures, recovery rate,
interventions, false completions), planning (coverage, waste, missed deps).
Benchmarks: internal task set (20 → 50 → 100 → 500+, bugfix/feature/refactor/
API/DB/auth/payments/UI/testing/deps/docs/deploy), context-router benchmark,
planner benchmark (expert-judged coverage), recovery benchmark (injected
failures: detected? diagnosed? replanned? recovered? repeated?), memory
benchmark. Never optimize success alone — track quality/cost/latency together.
Optimize pipeline by metric (evaluate → identify failure → change →
re-evaluate → keep), not by vibes.

## 19. Security, sandboxing, reproducibility

Permissions, tool sandboxing, secrets isolation, approval gates, audit logs,
network restrictions, destructive-action detection; context must never leak
secrets to the model. Risky work: sandbox → change → test → inspect → approve
→ merge. Runs reproducible (model+versions, skills+versions, knowledge
versions, project commit, task tree, verification). Rollback for updates and
indexes. Git integration records start/end commits, diff, tests. Offline mode
with clear capability reporting.

## 20. Roadmap

- **Phase 0 — Baseline:** freeze version, record architecture, 20 real tasks,
  run current Steroids, save results/failures/metrics → baseline report.
- **Phase 1 — Event system:** run/task IDs, schema, bus, logging, CLI stream.
- **Phase 2 — Task engine:** goal/task objects, hierarchy, statuses, questions,
  assumptions, evidence, completion criteria.
- **Phase 3 — Dynamic decomposition:** progressive expansion, dependencies,
  prioritization, stop conditions.
- **Phase 4 — Context router:** registry, metadata, ranking, budget, dynamic
  retrieval, explanations.
- **Phase 5 — Memory:** four levels, confidence, provenance, expiration,
  conflicts.
- **Phase 6 — Evidence:** fact/assumption objects, sources, confidence,
  contradiction detection.
- **Phase 7 — Verification:** syntax → unit → integration → runtime →
  objective; completion contracts.
- **Phase 8 — Recovery:** classification, diagnosis, replanning, retry limits,
  anti-loop, escalation.
- **Phase 9 — Project memory + mistake prevention:** durable facts, failed
  approaches, do-not-repeat, conventions.
- **Phase 10 — Evaluation:** benchmark runner, baselines, comparisons,
  regressions.
- **Phase 11 — Optimization:** rank/decompose/memory/verify/recover/prompts,
  every change evaluated.
- **Phase 12 — CLI experience.** Phase 13 — Agent adapters.
  Phase 14 — MCP. Phase 15 — Security/sandbox. Phase 16 — Public beta
  (routing + state + memory + verification + recovery + eval + CLI + adapters
  + security baseline all working).

First 20 builds: freeze version, baseline benchmark, run/task IDs, event
schema, event bus, CLI stream, goal object, task object, hierarchy, status
machine, decomposition, questions, assumptions, evidence, connect skill router,
auto context selection, verification results, failure classification, recovery
loop. Then: project memory, failed-approach memory, anti-loop, objective
verification, end-of-task report, benchmark runner, baseline comparison, MCP
discovery, adapters, security. Multi-agent, reviewer layer, knowledge graph,
giant dashboard: later, only on evaluation evidence.

## 21. The demo that proves it

"Build Stripe checkout" → 1,265 available → 7 candidates → 4 selected →
implement → deliberately failing webhook test → assumption invalidated →
official docs retrieved → plan updated → tests pass → objective verified →
STEROIDS REPORT (skills used/ignored, failures recovered, zero repeats).
Under two minutes, everything reproducible. Launch claim: same model, same
skills — the only difference is how it found them and how it recovered.

## 22. Positioning

> Steroids is the context and reliability layer for AI agents.
> It gives agents the skills, docs, project knowledge and task structure they
> need, then verifies their work and helps them recover when wrong.
> Keep your AI grounded while it works.

Never "AI that never hallucinates." The dependency to create: developers feel
the difference immediately when Steroids is removed — real usefulness, not
lock-in.

---

## 23. Prior art & evidence (grounded 2026-09-23)

This vision independently converged on designs the industry has since
standardized. Key sources, what each contributes, and where the doc was
corrected against them:

- **Anthropic, "Effective context engineering for AI agents" (Sep 2025).**
  Smallest high-signal token set; just-in-time retrieval via lightweight
  identifiers; minimal non-overlapping tools; compaction; note-taking.
  Underpins §2, §10, §15.
  https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents
- **Anthropic, "Building effective agents" (Dec 2024).** Simplest solution
  first; complexity only when it demonstrably improves outcomes; workflows vs
  agents; sandboxed testing + guardrails. Underpins §70 core rule.
  https://www.anthropic.com/news/building-effective-agents
- **Reflexion, Shinn et al. (arXiv:2303.11366, 2023).** Actor / Evaluator /
  Self-Reflection; episodic memory; 91% HumanEval vs 80% GPT-4 baseline; +8%
  over episodic-only. Underpins §5 recovery loop, §11 memory.
  https://arxiv.org/abs/2303.11366
- **MemGPT, Packer et al. (arXiv:2310.08560, 2023).** Main context
  (system / working / FIFO) + external (recall / archival); paging; memory
  pressure. Underpins §11 four-level memory.
  https://arxiv.org/abs/2310.08560
- **SWE-bench Verified (OpenAI + Princeton, Aug 2024).** 500 human-verified
  real GitHub issues, Python-only, 12 repos; FAIL_TO_PASS / PASS_TO_PASS.
  Reference design for §18/§36 task benchmarks (note the Python-only scope
  when borrowing methodology). https://www.swebench.com/
- **DSPy (Stanford, since 2022).** Metric-first optimization
  (MIPROv2 / GEPA / BootstrapFewShot): define metric + baseline, optimizer
  finds prompts. Underpins §45 pipeline optimization.
  https://dspy.ai/
- **Model Context Protocol (Anthropic 2024, Linux Foundation 2026).**
  Hosts / clients / servers; resources / prompts / tools over JSON-RPC.
  The 2026-07-28 spec adds a **Skills over MCP** extension — skills
  discovered and consumed through MCP — turning §14's convergence note from
  speculation into spec. Underpins §14, §27.
  https://modelcontextprotocol.io/
- **OpenAI Agents SDK (2026).** Built-in tracing spans (agent / generation /
  function / guardrail / handoff / custom), tripwire guardrails, MCP servers,
  eval loops. Reference model for §17 event bus and §15 checkpoints.
  https://developers.openai.com/api/docs/guides/agents/sdk
- **Claude Agent Skills (Anthropic, 2025–2026).** Progressive disclosure as
  shipped product: L1 metadata always loaded → SKILL.md on match → resources
  on demand. Independent confirmation of §13/§15's design.
  https://claude.com/blog/skills
- **SkillRouter: Skill Routing for LLM Agents at Scale (arXiv:2603.22455,
  Mar 2026).** Defines the skill-routing problem at ~80K-skill scale;
  hiding skill bodies costs **31–44pp routing accuracy**; routing gains
  transfer end-to-end to task success, more for capable agents. (a) Cite as
  independent validation of Steroids' problem framing. (b) Actionable gap:
  Steroids currently indexes names/descriptions/keywords only — full
  SKILL.md body text is the largest unused routing signal; add body-text
  indexing to the roadmap with an ablation to prove it.
  https://arxiv.org/abs/2603.22455

Correction log: an early draft cited "85% token reduction" for Anthropic's
advanced tool use from a secondary gist; no primary source confirms the
figure, so it was dropped. The surrounding claim (on-demand discovery saves
tokens) stands on the primary context-engineering essay.

---

*Status: vision doc. Start at Phase 0 → 1 → 2. Make the existing implementation
observable before changing its intelligence — baseline first, then every new
piece must prove itself in evaluation.*
