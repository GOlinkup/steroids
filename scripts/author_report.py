#!/usr/bin/env python3
"""G68 author analytics: fires/accepts/outcomes per skill, first report.

Fires from served.jsonl (top-1 counts), accepts from memory.json. Outcomes
are NOT tracked anywhere yet (feeds C22) — reported as untracked, honestly.
Writes reports/author-YYYY-MM-DD.md.
Usage (repo root):  python3 scripts/author_report.py
Stdlib only.
"""
import json
import os
from collections import Counter
from datetime import datetime

ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
LOG = os.path.expanduser("~/.config/steroids/served.jsonl")
MEM = os.path.expanduser("~/.config/steroids/memory.json")


def author_stats(log_path=LOG, mem_path=MEM):
    fires = Counter()
    try:
        with open(log_path, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                skills = [x for x in json.loads(line).get("skills", "").split("/") if x]
                if skills:
                    fires[skills[0]] += 1
    except OSError:
        pass
    try:
        accepts = json.load(open(mem_path, encoding="utf-8")).get("accepts", {})
    except (OSError, ValueError):
        accepts = {}
    return fires, accepts


def main():
    fires, accepts = author_stats()
    date = datetime.now().date().isoformat()
    path = os.path.join(ROOT, "reports", f"author-{date}.md")
    skills = sorted(set(fires) | set(accepts))
    L = [f"# Author analytics — {date}", "",
         "_Fires = top-1 serves (served.jsonl). Accepts = loads (memory.json). "
         "Outcomes untracked (see C22)._", "",
         "| skill | fires | accepts | accept% |",
         "|-------|-------|---------|---------|"]
    for s in sorted(skills, key=lambda s: -fires.get(s, 0))[:40]:
        f, a = fires.get(s, 0), accepts.get(s, 0)
        pct = f"{100 * a / f:.0f}%" if f else "—"
        L.append(f"| {s} | {f} | {a} | {pct} |")
    L += ["", f"skills seen: {len(skills)}, total fires: {sum(fires.values())}, "
             f"total accepts: {sum(accepts.values())}"]
    with open(path, "w", encoding="utf-8") as fh:
        fh.write("\n".join(L) + "\n")
    print(f"skills={len(skills)} fires={sum(fires.values())} accepts={sum(accepts.values())}")
    print(f"wrote {path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
