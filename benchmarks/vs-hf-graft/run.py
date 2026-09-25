"""Steroids vs HF vs Graft routing probe (stdlib only).
Runs 20 labeled queries through route_query INSIDE offline_guard()
(socket creation raises) -> proves the hot path is network-free while
measuring P@1 + latency. HF has no routing product and Graft is
waitlist-only, so their columns are documented as non-runnable, not scored.
"""
import json
import os
import statistics
import sys
import time

sys.path.insert(0, os.path.expanduser("~/steroids/src"))
from steroids import router

TASKS = [
    ("persist this session so it survives a restart", "ck"),
    ("verify the deployed checkout flow visually, screenshot each step", "browser-qa"),
    ("how much money did I spend on tokens last week", "cost-tracking"),
    ("why is this postgres query slow on a million rows", "postgres-patterns"),
    ("write a dockerfile for local dev without compose", "docker-patterns"),
    ("help me resolve this rebase conflict on my branch", "resolving-merge-conflicts"),
    ("put these notes on an obsidian canvas as a spatial mindmap", "canvas"),
    ("audit our spacing tokens and typography palette", "design-system"),
    ("my flutter listview stutters, memoize the widget build", "dart-flutter-patterns"),
    ("review this pr diff against our standards and spec", "code-review"),
    ("dispatch parallel agents in isolated worktrees, a full fleet at once", "claude-devfleet"),
    ("drive long cli sessions side by side in tmux panes", "dmux-workflows"),
    ("argue both sides of this tradeoff before I decide", "council"),
    ("rambling idea, turn it into a build plan", "blueprint"),
    ("draw a diagram of this system architecture", "archify"),
    ("intermittent crash, hunt it down", "diagnosing-bugs"),
    ("lock down auth cookies in this django app", "django-security"),
    ("idiomatic error handling and concurrency for this go service", "golang-patterns"),
    ("strip the clutter from this article", "defuddle"),
    ("make this endpoint faster, compare approaches", "benchmark"),
]


def main():
    rules = router.load_rules()
    idx = router.get_index(rules)
    rows, lats, hits = [], [], 0
    with router.offline_guard():  # any socket attempt raises: offline proven
        for q, expected in TASKS:
            t0 = time.perf_counter()
            recs = router.route_query(q, rules, idx)[:3]
            dt = (time.perf_counter() - t0) * 1000
            top1 = recs[0][1] if recs else None
            ok = top1 == expected
            hits += ok
            lats.append(dt)
            rows.append((ok, expected, top1, round(dt, 1), q))
    p1 = hits / len(TASKS)
    out = {
        "date": time.strftime("%Y-%m-%d"),
        "n": len(TASKS),
        "p_at_1": round(p1, 3),
        "latency_ms_mean": round(statistics.mean(lats), 2),
        "latency_ms_p95": round(sorted(lats)[int(len(lats) * 0.95) - 1], 2),
        "offline": True,
        "cost_usd": 0,
        "rows": [{"ok": ok, "expected": e, "top1": t,
                  "ms": m, "q": q} for ok, e, t, m, q in rows],
    }
    base = os.path.dirname(os.path.abspath(__file__))
    json.dump(out, open(os.path.join(base, "results.json"), "w"), indent=1)
    print("P@1 %.3f  mean %.2fms  p95 %.2fms  offline=True  $0"
          % (p1, out["latency_ms_mean"], out["latency_ms_p95"]))
    for ok, e, t, m, q in rows:
        print(("HIT " if ok else "MISS"), "%s -> %s (%.1fms) :: %s" % (e, t, m, q))


if __name__ == "__main__":
    main()
