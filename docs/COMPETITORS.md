# Competitor research — skill routing, grounded 2026-09-26

All claims traced to primary sources (papers' arXiv HTML, official repos, benchmark sites).
This doc extends the honest-comparison table in `README.md` and `STEROIDS_V1.md` §22 (D-3)
with fresh public data. Correction-log culture applies: fix claims here against the
linked sources, not the other way around.

## 1. The landscape (who actually competes)

| Competitor | What it is | Scale | Approach | Model calls? |
|---|---|---|---|---|
| **SkillRouter** (Alibaba, arXiv:2603.22455, v4 Apr 2026) | Retrieve-and-rerank skill router + benchmark | ~80K-skill pool, 75 core queries + 256 supp queries | Fine-tuned 0.6B bi-encoder → 0.6B cross-encoder, **full skill text** both stages | Yes (local 1.2B, GPU) |
| **SkillRet** (arXiv:2605.05726, v3 Sep 2026) | Skill-*retrieval* benchmark + fine-tuned retrievers | 16,129 skills, 4,392 eval queries, 63,259 train samples | Dense retrieval benchmarking; released 0.6B/8B checkpoints | Yes (local models) |
| **SkillsBench** (arXiv:2602.12670, BenchFlow, 2026) | Measures whether skills help agents (not routing) | 87 tasks, 8 domains | End-to-end agent eval with/without skills | Downstream LLM |
| ToolBench / MetaTool / ToolRerank / Gorilla / AnyTool | Tool (API) selection, smaller pools | ≤16K APIs | Various | Mostly LLM-based |

Sources: [SkillRouter v4](https://arxiv.org/html/2603.22455v4) ·
[SkillRouter repo](https://github.com/zhengyanzhao1997/SkillRouter) ·
[SkillRet](https://arxiv.org/abs/2605.05726) ·
[SkillsBench](https://www.skillsbench.ai/) (paper: arXiv:2602.12670).

## 2. SkillRouter — the head-to-head that matters

### Their headline numbers (their benchmark, their hardware)

From Table 2/3 of [v4](https://arxiv.org/html/2603.22455v4) — 75 expert-verified
SkillsBench-derived queries, Easy 78,361 / Hard 79,141 candidates, Easy/Hard averaged:

| System | A-Hit@1 | A-MRR@10 | Notes |
|---|---|---|---|
| BM25 (full text) | **.314** | .365 | Sparse retrieval, no training |
| Qwen3-Emb-8B (base) | .640 | .698 | Strongest base encoder |
| text-embedding-3-large | .620 | .658 | Proprietary API |
| SR-Emb-0.6B (tuned) | .654 | .723 | Encoder-only |
| Qwen3-Emb-8B × Qwen3-Rank-8B (16B base pipeline) | .680 | .745 | Strongest base pipeline |
| **SkillRouter 1.2B (SR-Emb-0.6B × SR-Rank-0.6B)** | **.740** | .791 | Their headline |
| SkillRouter 8B | .760 | .808 | Scaled variant |
| GPT-4o-mini as judge (top-1 pick) | .673 | — | LLM-judge not competitive |

- Serving: 495.8 ms median on GPU (real pool), 5.8× faster / 15.8% less GPU memory than the 16B base pipeline.
- Key ablations: false-negative filtering +4.0pp; listwise CE vs pointwise rerank loss **+30.7pp**.
- Their central finding: **hiding skill body costs 31.4pp (BM25: .314→.000), 38.7pp (Qwen3-Emb-8B: .640→.253), 44.0pp (16B pipeline: .680→.240).** Full skill text is the critical routing signal at 80K scale.
- Downstream (4 coding agents incl. Claude Sonnet/Opus 4.6 in Claude Code harness): SkillRouter top-1 → 27.56% task success vs 25.78% for the strongest base router (+1.78pp); recovers 71–73% of the no-skill→gold-skill uplift.

### Our numbers (our sets — NOT directly comparable to theirs)

| Eval | n | P@1 | P@3 | Source |
|---|---|---|---|---|
| blind149 frozen golden (1,265-skill snapshot) | 149 | 0.799 | 0.960 | `tests/benchmark.py --golden` |
| blind149 live GOLDEN (1,267 skills) | 149 | 0.993 | 1.000 | README 2026-09-25 |
| second315 stranger-style | 315 | 0.898 | 0.959 | `tests/blind_eval_second.py` |
| vs-hf-graft probe | 20 | 0.95 | — | `benchmarks/vs-hf-graft/results.json` (p95 239 ms; one 57 s cold-start outlier in the mean) |
| vs-skillrouter probe (75-query eval, 79,141-pool) | 75 | **not yet run** | — | `benchmarks/vs-skillrouter/run.py` staged; pool + tasks already materialized locally |

Latency at our scale (1.2K–5K skills): p50 ~18 ms, p99 34–56 ms, **CPU only, zero model calls** (LCH-6 record).

## 3. What the research says about Steroids' architecture

**Confirmed weakness (their best gift to us):** SkillRouter's body-access finding is
independent validation of the gap already logged in `STEROIDS_V1.md` §23/§26.5 — Steroids
indexes names/descriptions/keywords only. At 80K-scale with heavy overlap, metadata-only
routing collapses (BM25 → 0.0% Hit@1). The §26.5 body-text ablation is now the single most
evidence-backed roadmap item: their false-negative-filter and listwise-rerank tricks are
exactly the audit they recommend for our goldens (near-duplicate skills penalizing correct picks).

**Their own limitation, in their words:** *"metadata-only routing may be more competitive in
smaller catalogs."* Steroids operates at 1.2K–4K skills, not 80K — with trigger packs, NEG
guards, name bonus and closed-loop memory it reaches 0.799–0.993 P@1 on its own sets
(different queries; no cross-paper comparability is claimed).

**Cost/latency corner (unchanged moat):** SkillRouter = 1.2B params, GPU serving, 496 ms
median, needs 37,979 synthetic training pairs (GPT-4o-mini). Steroids = stdlib TF-IDF +
trigram-cosine (optional 30MB ONNX MiniLM), CPU, ~18 ms p50, zero training data, zero
telemetry, routes from a cold checkout. Different products: theirs is a model you serve;
ours is a hook you install.

**SkillsBench is not a router benchmark** — it shows curated skills lift agent pass rates
+16.2pp average (SWE +4.5pp, healthcare +51.9pp, 87 tasks). Use it for the "skills matter"
framing, not for routing comparisons.

## 4. The one number we still owe: the vs-skillrouter run

`benchmarks/vs-skillrouter/run.py` is staged and honest about protocol (Hit@1 over
core_gt_ids, generic_only skipped per their protocol, pool pinned to the materialized
79,141 skills so installed skills can't leak in). `/tmp/sr-eval` (87 tasks, 12 generic_only
→ 75 scored) and `/tmp/sr-pool` (79,101 dirs) are materialized. Expected reference: BM25
full-text got .314 on this pool; our probe would show where keyword+trigram routing lands
without any body text. Run it before claiming any comparison in public.

## 5. Correction log

- 2026-09-26: created from SkillRouter v4 HTML, SkillRet v3 abstract, SkillsBench site.
  Earlier draft numbers (from snippets) replaced with table-level figures from the paper.
- Known ambiguity: SkillRet abstract says 16,129 skills / 4,392 queries; secondary sources
  cite 17,810 skills / 63,000+ samples (likely v2-vs-v3 drift) — abstract of v3 is treated
  as current.
