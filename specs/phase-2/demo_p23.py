#!/usr/bin/env python3
"""P2-3 demo: one task's unknowns change retrieved context vs baseline.

Baseline prompt = title only. Seeded prompt = title + unknowns + open
questions (tasks.seed_queries). Routes both against the frozen golden
index; exits 1 if the top-5 sets are identical (no demonstrable change).
Scoring weights untouched (golden rules.json as-is). Stdlib only.
"""
import importlib.util
import json
import os
import sys

_HERE = os.path.dirname(os.path.abspath(__file__))
_ROOT = os.path.normpath(os.path.join(_HERE, "..", ".."))
_GOLDEN = os.path.join(_ROOT, "benchmarks", "golden-1265")


def _load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


def top5(router, rules, idx, prompt):
    return [s for _, s, _ in router.route_query(prompt, rules, idx)][:5]


def main():
    router = _load("steroids_router_demo",
                   os.path.join(_ROOT, "src", "steroids", "router.py"))
    tmod = _load("st_tasks_demo",
                 os.path.join(_ROOT, "src", "steroids", "tasks.py"))
    with open(os.path.join(_GOLDEN, "rules.json"), encoding="utf-8") as f:
        rules = json.load(f)
    with open(os.path.join(_GOLDEN, "index.json"), encoding="utf-8") as f:
        idx = json.load(f)
    with open(os.path.join(_HERE, "samples", "p0-4-task.json"), encoding="utf-8") as f:
        task = json.load(f)
    queries = tmod.seed_queries(task)
    base = top5(router, rules, idx, task["title"])
    seeded = top5(router, rules, idx, " ".join(queries))
    print(f"task:    {task['id']} {task['title']}")
    print(f"seeds:   {queries[1:]}")
    print(f"base:    {base}")
    print(f"seeded:  {seeded}")
    print(f"only-in-seeded: {[s for s in seeded if s not in base]}")
    if set(base) == set(seeded):
        print("P2-3 FAIL: unknowns changed nothing")
        return 1
    print("P2-3 OK: unknowns demonstrably change retrieved context")
    return 0


if __name__ == "__main__":
    sys.exit(main())
