#!/usr/bin/env python3
"""D39 latency SLO bench: route p99 <100ms @5000 skills.

Synthesizes a 5000-skill index (deterministic keyword patterns, no live
data needed), times route_query over a query set, reports mean/p50/p99.
Writes reports/latency-YYYY-MM-DD.md with the number.
Usage:  python3 scripts/latency_bench.py [n_skills] [n_queries]
Stdlib only.
"""
import importlib.util
import os
import sys
import time
from datetime import datetime

_HERE = os.path.dirname(os.path.abspath(__file__))
_ROOT = os.path.normpath(os.path.join(_HERE, ".."))
_ROUTER = os.path.join(_ROOT, "src", "steroids", "router.py")

_spec = importlib.util.spec_from_file_location("steroids_router_lat", _ROUTER)
router = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(router)

WORDS = ("alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu nu "
         "xi omicron pi rho sigma tau upsilon phi chi psi omega router skill index "
         "query cache token test build deploy review debug trace log metric audit").split()


def synth_idx(n):
    idx = {}
    for i in range(n):
        keys = [WORDS[(i * 7 + j * 13) % len(WORDS)] for j in range(12)]
        idx[f"skill-{i:04d}"] = sorted(set(keys))
    return idx


def bench(idx, queries, rules=None):
    rules = rules or {"glue": [], "max_recommendations": 3}
    dt = []
    for q in queries:
        t0 = time.perf_counter()
        router.route_query(q, rules, idx)
        dt.append((time.perf_counter() - t0) * 1000)
    dt.sort()
    n = len(dt)
    return {"n": n, "mean": sum(dt) / n, "p50": dt[n // 2],
            "p99": dt[min(n - 1, int(n * 0.99))], "max": dt[-1]}


def main(n_skills=5000, n_queries=50):
    idx = synth_idx(n_skills)
    queries = [" ".join(WORDS[(i * 3 + j) % len(WORDS)] for j in range(4)) for i in range(n_queries)]
    m = bench(idx, queries)
    date = datetime.now().date().isoformat()
    path = os.path.join(_ROOT, "reports", f"latency-{date}.md")
    verdict = "PASS" if m["p99"] < 100 else "FAIL"
    L = [f"# Latency SLO — {date}", "",
         f"synthetic index: {n_skills} skills, {n_queries} queries",
         f"mean={m['mean']:.2f}ms p50={m['p50']:.2f}ms p99={m['p99']:.2f}ms max={m['max']:.2f}ms",
         f"SLO p99<100ms: {verdict}"]
    with open(path, "w", encoding="utf-8") as f:
        f.write("\n".join(L) + "\n")
    print("\n".join(L[2:]))
    print(f"wrote {path}")
    return 0 if verdict == "PASS" else 1


if __name__ == "__main__":
    a = sys.argv[1:]
    raise SystemExit(main(int(a[0]) if len(a) > 0 else 5000,
                         int(a[1]) if len(a) > 1 else 50))
