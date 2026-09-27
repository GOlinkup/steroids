# Benchmark tables — skill routing (published numbers only, collected 2026-09-26)

📊 **Visual version:** [`benchmarks.html`](benchmarks.html) — every table below as
TalkStream-styled charts (per-benchmark cards, latency, landscape). Same data,
same sources, one file, works offline (Outfit font falls back to system-ui).

Every number below is quoted from a public primary source — nothing here was
run locally. Sources linked per table. Steroids' own numbers come from its
frozen golden benchmark (`tests/benchmark.py --golden`, README verified
2026-09-25) and are **not** computed on the same queries as the papers' rows.

## 1. Master table — published skill-routing results

Benchmark A = SkillRouter's (75 expert-verified queries, ~80K-skill pool,
Hit@1 averaged over Easy/Hard tiers, full skill text unless noted).
Benchmark B = SkillRet's (16,129 skills, 4,392 eval queries, NDCG@10).
Benchmark C = Steroids' own golden sets (1,265–1,267 skills, P@1/P@3).

| System | Benchmark | Metric | Score | Params | Runs on | Source |
|---|---|---|---|---|---|---|
| BM25 (full text) | A | Hit@1 | **.314** | — | CPU | SkillRouter Table 2 |
| BM25 metadata-only (name+desc) | A | Hit@1 | **.000** | — | CPU | SkillRouter §3 |
| E5-Large-v2 | A | Hit@1 | ~.55–.60* | 335M | CPU/GPU | SkillRouter Table 2/9 |
| BGE-Large-v1.5 | A | Hit@1 | .600 | 335M | CPU/GPU | SkillRouter Table 2 |
| Gemini embedding-001 | A | Hit@1 | .587 | API | API | SkillRouter Table 2 |
| OpenAI text-embedding-3-large | A | Hit@1 | .620 | API | API | SkillRouter Table 2 |
| Qwen3-Emb-0.6B (base) | A | Hit@1 | .560 | 0.6B | GPU | SkillRouter Table 2 |
| Qwen3-Emb-8B (base) | A | Hit@1 | .640 | 8B | GPU | SkillRouter Table 2 |
| GPT-4o-mini LLM-judge (top-20→1) | A | Hit@1 | .673 | API | API | SkillRouter §5.2 |
| 16B base pipeline (Qwen3-Emb-8B × Rank-8B) | A | Hit@1 | .680 | 16B | GPU, ~2.9 s med | SkillRouter Table 3 |
| **SkillRouter 1.2B** (tuned 0.6B+0.6B) | A | Hit@1 | **.740** | 1.2B | GPU, 496 ms med | SkillRouter Table 3 |
| SkillRouter 8B | A | Hit@1 | .760 | 8B | GPU | SkillRouter Table 3 |
| Strongest off-the-shelf retriever | B | NDCG@10 | baseline | — | GPU | SkillRet abstract |
| SkillRet fine-tuned 0.6B/8B | B | NDCG@10 | **+12.9 to +16.2 pts** vs above | 0.6B/8B | GPU | SkillRet abstract |
| **Steroids (frozen golden)** | C | P@1 / P@3 | **0.799 / 0.960** | 0 (stdlib) | CPU, ~18 ms p50 | README 2026-09-25 |
| Steroids (live GOLDEN, 1,267 skills) | C | P@1 / P@3 | 0.993 / 1.000 | 0 (stdlib) | CPU | README 2026-09-25 |
| Steroids (second315, stranger-style) | C | P@1 / P@3 | 0.898 / 0.959 | 0 (stdlib) | CPU | README 2026-09-25 |
| Steroids (vs-hf-graft probe, n=20) | C | P@1 | 0.95 | 0 (stdlib) | CPU, p95 239 ms | `benchmarks/vs-hf-graft/results.json` |

\* E5 exact value not extracted from the v4 HTML; ranged from the surrounding table.

**Read the bold rows honestly:** SkillRouter .740 and Steroids 0.799 are on
**different benchmarks** — different queries, different pools, different metrics
(their Hit@1 counts any-required-skill at rank 1 on 51/75 multi-skill queries;
our P@1 demands the exact golden skill). The only valid cross-comparison column
is *params/latency/cost*: 1.2B params + GPU + 496 ms vs zero params + CPU + 18 ms.

## 2. The body-text finding (why the field indexes SKILL.md bodies now)

SkillRouter §3, removing skill body text (metadata-only routing), Hit@1 drop:

| Method | Full text | Metadata only | Drop |
|---|---|---|---|
| BM25 | .314 | .000 | −31.4 pp |
| Qwen3-Emb-8B | .640 | .253 | −38.7 pp |
| Qwen3-Emb-8B × Qwen3-Rank-8B | .680 | .240 | −44.0 pp |

Direct implication for Steroids (already logged in `STEROIDS_V1.md` §26.5):
we index names/descriptions/keywords only — at 80K-scale overlap this collapses;
at 1.2K-scale with trigger packs it still hits 0.799. The body-text ablation is
the most evidence-backed roadmap item.

## 3. Downstream value of routing (their end-to-end study)

SkillRouter §5.5 — 4 coding agents (Kimi-K2.5, glm-5, Claude Sonnet 4.6, Claude Opus 4.6)
in Claude Code harness, 75 tasks, avg of 3 trials:

| Condition | Overall task success |
|---|---|
| No skills | 14.89% |
| Gold skills (oracle) | 32.67% |
| Base 16B router top-1 | 25.78% |
| SkillRouter top-1 | **27.56%** (+1.78 pp, recovers ~71% of oracle uplift) |

SkillsBench (arXiv:2602.12670) framing stat: curated skills lift agent pass
rates **+16.2 pp** average across 86–87 tasks (SWE only +4.5 pp, healthcare +51.9 pp).

## 4. Benchmark landscape (who measures what)

| Benchmark | Target | Eval size | Public training set? | Notes |
|---|---|---|---|---|
| SkillRouter (arXiv:2603.22455) | Skill routing | 75 queries + 256 supp | Reported 37,979 pairs, **not released** | ~80K pool, Easy/Hard tiers |
| SkillRet (arXiv:2605.05726) | Skill retrieval | **4,392 queries** | ✓ 63,259 samples | 16,129 skills, 6/18 taxonomy |
| SkillsBench (arXiv:2602.12670) | End-to-end skill value | 86–87 tasks | — | Measures skills, not routing |
| SWE-Skills-Bench | End-to-end (SWE) | 565 tasks | — | Most public SWE skills: no pass-rate lift |
| ToolRet (arXiv, Shi et al. 2025) | Tool retrieval | 7,615 tasks / 43K tools | ✓ >200K | Predecessor; tools ≠ skills |
| AgentSkillOS | Skill orchestration | 30 tasks | — | Ecosystem-scale DAGs |

## 5. What we still owe

`benchmarks/vs-skillrouter/run.py` remains staged (pool + tasks materialized)
but **unrun** — per house decision, not executed locally due to runtime cost.
Until it runs, no cross-benchmark claim goes in the README: our 0.799 and their
.740 must stay in separate rows, as above.

Sources: [SkillRouter v4](https://arxiv.org/html/2603.22455v4) ·
[SkillRouter GitHub](https://github.com/zhengyanzhao1997/SkillRouter) ·
[SkillRet v3](https://arxiv.org/html/2605.05726v3) ·
[SkillsBench](https://www.skillsbench.ai/) ·
[vs-hf-graft results](../benchmarks/vs-hf-graft/results.json)
