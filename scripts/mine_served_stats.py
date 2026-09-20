#!/usr/bin/env python3
"""Mine-only analytics for the live served-query log (proposal support).

Reads /home/TWIG/.config/steroids/served.jsonl (NOT in repo) and prints:
  top trigger stems, top served skills, dup rate, zero-trigger (no-match)
  queries, and trigger-instability (same query hash, different trigs).

Read-only on the log; writes nothing. Run: python3 scripts/mine_served_stats.py
"""
import json
import os
from collections import Counter, defaultdict

LOG = os.path.expanduser("~/.config/steroids/served.jsonl")


def main():
    rows = [json.loads(l) for l in open(LOG) if l.strip()]
    n = len(rows)
    byq = defaultdict(list)
    tc, sc = Counter(), Counter()
    zero_trig = []
    for r in rows:
        byq[r["q"]].append(r["trigs"])
        trigs = [x for x in r["trigs"].split(",") if x]
        if not trigs:
            zero_trig.append(r)
        for t in trigs:
            tc[t] += 1
        for s in [x for x in r["skills"].split("/") if x]:
            sc[s] += 1
    distinct = len(byq)
    dups = n - distinct
    unstable = {q: sorted(set(v)) for q, v in byq.items() if len(set(v)) > 1}

    print(f"rows={n} distinct_q={distinct} repeats={dups} dup_rate={dups / n:.1%}")
    print(f"distinct_trigs={len(tc)} distinct_skills={len(sc)}")
    print("top_trigs=" + json.dumps(tc.most_common(12)))
    print("top_skills=" + json.dumps(sc.most_common(12)))
    print(f"zero_trig={len(zero_trig)}")
    for r in zero_trig:
        print("  " + json.dumps(r))
    print(f"unstable_q={len(unstable)}")
    for q, v in sorted(unstable.items()):
        print(f"  {q} {v}")


if __name__ == "__main__":
    main()
