#!/usr/bin/env python3
"""Steroids on SkillRouter Eval-Core (arXiv 2603.22455) — head-to-head probe.

Protocol (mirrors SkillRouter's public release as closely as steroids allows):
- Pool: 79,141 skills materialized as SKILL.md dirs (bench-pool/, regen below).
- Queries: tasks.jsonl instruction_text; generic_only tasks skipped per
  SkillRouter's own protocol ("skip generic_only tasks during scoring").
- Metric: Hit@1 = top-1 in core_gt_ids (graded-3 ground truth), matching the
  paper's headline Hit@1. We also report MRR over core_gt_ids for context.
- Scoring runs with the network unreachable for routing itself (stdlib only,
  no model calls — same guarantee as the vs-hf-graft probe).

Pool prep (one-time, needs network; ~800MB unpacked in /tmp):
  python3 - <<'EOF'
  from huggingface_hub import hf_hub_download
  import shutil, gzip, json, os, hashlib, re
  os.makedirs("/tmp/sr-eval", exist_ok=True)
  for f in ["tasks.jsonl", "relevance.json", "manifest.json"]:
      shutil.copy(hf_hub_download("pipizhao/SkillRouter-Eval-Core", f, repo_type="dataset"), f)
  for part in ["easy", "hard"]:
      os.makedirs(part, exist_ok=True)
      for i in range(10):
          p = hf_hub_download("pipizhao/SkillRouter-Eval-Core", f"{part}/part-{i:05d}.jsonl.gz", repo_type="dataset")
          shutil.copy(p, f"{part}/part-{i:05d}.jsonl.gz")
  # then materialize pool dirs (see git history / session notes)
  EOF

Differences vs SkillRouter's own run (honesty):
- SkillRouter uses a 0.6B encoder + 0.6B reranker over full skill bodies
  (CUDA). Steroids is TF-IDF lexical + trigram-semantic, no model calls.
- Pool size matches (~80K); queries match; ground truth matches. Hardware
  differs (this box: CPU only).
"""
import importlib.util
import json
import os
import sys
import time
import re


def canon(sid):
    # gt/mesh-analysis == mesh-analysis-31447b9e (materialized pool name):
    # strip source prefix + 8-hex materialization suffix.
    s = re.sub(r"^[a-z]+/", "", sid or "")
    return re.sub(r"-[0-9a-f]{8}$", "", s).lower()

_HERE = os.path.dirname(os.path.abspath(__file__))
_ROOT = os.path.normpath(os.path.join(_HERE, "..", ".."))
_POOL = "/tmp/sr-pool"          # 79,141 SKILL.md dirs (materialized pool)
_EVAL = "/tmp/sr-eval"          # tasks.jsonl + relevance.json


def load_router():
    path = os.path.join(_ROOT, "src", "steroids", "router.py")
    spec = importlib.util.spec_from_file_location("steroids_router_sr", path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def main():
    router = load_router()
    tasks = [json.loads(l) for l in open(os.path.join(_EVAL, "tasks.jsonl")) if l.strip()]
    rel = json.load(open(os.path.join(_EVAL, "relevance.json")))

    rules = router.load_rules()
    # Route ONLY over the benchmark pool: point index_dirs at the materialized
    # pool so the machine's installed skills can't leak in as distractors
    # (they aren't in relevance.json, so they'd count as wrong anyway — this
    # keeps the candidate universe exactly SkillRouter's).
    rules["index_dirs"] = [_POOL]

    files = router.skill_files(rules["index_dirs"])
    idx, _ = router.build_index(files)
    print(f"pool indexed: {len(idx)} skills (expected ~79141)", file=sys.stderr)

    rows = []
    p1 = hits = 0
    rrs = []
    lat = []
    skipped = 0
    for t in tasks:
        v = rel.get(t["task_id"], {})
        if v.get("task_type") == "generic_only" or t.get("excluded"):
            skipped += 1
            continue
        core = {canon(g) for g in v["core_gt_ids"]}
        t0 = time.perf_counter()
        ranked = [canon(s) for _, s, _ in router.route_query(t["instruction_text"], rules, idx)]
        lat.append((time.perf_counter() - t0) * 1000)
        hit = ranked and ranked[0] in core
        first_rel = next((i for i, s in enumerate(ranked) if s in core), None)
        p1 += bool(hit)
        rrs.append(1.0 / (first_rel + 1) if first_rel is not None else 0.0)
        hits += first_rel is not None
        rows.append({"task_id": t["task_id"], "difficulty": t["difficulty"],
                     "gt": sorted(core), "top1": ranked[0] if ranked else None,
                     "hit1": bool(hit), "first_rel_rank": first_rel})

    n = len(rows)
    lat.sort()
    out = {
        "date": time.strftime("%Y-%m-%d"),
        "benchmark": "SkillRouter Eval-Core (pipizhao/SkillRouter-Eval-Core)",
        "protocol": "Hit@1 over core_gt_ids; generic_only + excluded tasks skipped (SkillRouter protocol)",
        "pool_size": len(idx),
        "n_scored": n,
        "skipped_generic_or_excluded": skipped,
        "hit1": round(p1 / n, 3),
        "any_relevant_retrieved": round(hits / n, 3),
        "mrr_core": round(sum(rrs) / n, 3),
        "latency_ms_median": round(lat[len(lat) // 2], 1),
        "latency_ms_mean": round(sum(lat) / len(lat), 1),
        "rows": rows,
    }
    os.makedirs(_HERE, exist_ok=True)
    with open(os.path.join(_HERE, "results.json"), "w") as f:
        json.dump(out, f, indent=1)
    print(f"n={n}  Hit@1={out['hit1']}  MRR@core={out['mrr_core']}  "
          f"latency median={out['latency_ms_median']}ms mean={out['latency_ms_mean']}ms")
    print(f"SkillRouter paper reference: 0.740 Hit@1 (their pool, their hardware)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
