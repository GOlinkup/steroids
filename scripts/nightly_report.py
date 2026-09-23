#!/usr/bin/env python3
"""D35 nightly dashboard: bench precision + live traffic, one committed report.

Honest split (prompts in served.jsonl are hash-only by design, so live
traffic carries no labels):
  - P@1/P@3/MRR/leaks come from bench.py on the labeled in-repo sets.
  - served.jsonl contributes unlabeled health: serves, abstention rate
    (skills == ""), top-1 instability (same query hash, different top-1
    across hits = the router disagreeing with itself), top skills.
Usage (repo root):  python3 scripts/nightly_report.py   # writes reports/nightly-YYYY-MM-DD.md
Stdlib only. Scheduling (cron) is a follow-up, not this card.
"""
import json
import os
import sys
from collections import Counter, defaultdict
from datetime import datetime

_HERE = os.path.dirname(os.path.abspath(__file__))
_ROOT = os.path.normpath(os.path.join(_HERE, ".."))
sys.path.insert(0, _HERE)
import bench

LOG = os.path.expanduser("~/.config/steroids/served.jsonl")


def traffic():
    rows = []
    try:
        with open(LOG, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line:
                    rows.append(json.loads(line))
    except OSError:
        return None
    today = datetime.now().date().isoformat()
    day = [r for r in rows if datetime.fromtimestamp(r.get("t", 0)).date().isoformat() == today]
    return {"all": _summarize(rows), "today": _summarize(day), "date": today, "log_rows": len(rows)}


def _summarize(rows):
    n = len(rows)
    abst = sum(1 for r in rows if not (r.get("skills") or "").strip())
    byq = defaultdict(set)
    sc = Counter()
    for r in rows:
        skills = [x for x in (r.get("skills") or "").split("/") if x]
        if skills:
            byq[r.get("q")].add(skills[0])
            for s in skills:
                sc[s] += 1
    unstable = {q: sorted(v) for q, v in byq.items() if len(v) > 1}
    return {"serves": n, "distinct_q": len({r.get("q") for r in rows}),
            "abstentions": abst, "abst_rate": round(abst / n, 3) if n else 0.0,
            "unstable_q": len(unstable), "unstable": unstable,
            "top_skills": sc.most_common(8)}


def main():
    bench_result = bench.run_all()
    t = traffic()
    date = t["date"] if t else datetime.now().date().isoformat()
    out_dir = os.path.join(_ROOT, "reports")
    os.makedirs(out_dir, exist_ok=True)
    path = os.path.join(out_dir, f"nightly-{date}.md")
    L = [f"# Nightly router report — {date}", "",
         f"bench @ `{bench_result['commit'][:12]}` (dirty paths: {len(bench_result['dirty'])})", "",
         "| set | n | P@1 | P@3 | MRR | leaks |",
         "|-----|---|-----|-----|-----|-------|"]
    for name, m in bench_result["sets"].items():
        L.append(f"| {name} | {m['n']} | {m['p1']:.3f} | {m['p3']:.3f} | {m['mrr']:.3f} | {m['leaks']} |")
    L.append("")
    if t is None:
        L.append("live traffic: served.jsonl not found — bench only.")
    else:
        for window in ("today", "all"):
            s = t[window]
            L.append(f"## traffic ({window}, {s['serves']} serves)")
            L.append(f"- distinct queries: {s['distinct_q']}, abstentions: {s['abstentions']} "
                     f"({s['abst_rate']:.1%}), unstable repeats: {s['unstable_q']}")
            L.append(f"- top skills: {', '.join(f'{k} {v}' for k, v in s['top_skills'])}")
            for q, vs in sorted(s["unstable"].items())[:10]:
                L.append(f"  - unstable `{q}` -> {vs}")
            L.append("")
    with open(path, "w", encoding="utf-8") as f:
        f.write("\n".join(L))
    print("\n".join(L[:14]))
    print(f"... wrote {path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
