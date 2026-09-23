#!/usr/bin/env python3
"""D38 token cost ledger: top-10 context hogs listed.

cost(skill) = SKILL.md tokens x top-1 serves (via cost_report.allocate),
split into size and fires columns so hogs read as big-file vs hot-skill.
Writes reports/hogs-YYYY-MM-DD.md.
Usage:  python3 scripts/hogs.py
Stdlib only.
"""
import json
import os
import sys
from datetime import datetime

_HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, _HERE)
import cost_report


def hogs(per_skill, sizes, fires, n=10):
    rows = sorted(per_skill.items(), key=lambda kv: -kv[1])[:n]
    return [{"skill": s, "cost": c, "size": sizes.get(s, 0),
             "fires": fires.get(s, 0)} for s, c in rows]


def main():
    rules = json.load(open(os.path.join(_HERE, "..", "skill-rules.json"), encoding="utf-8"))
    per_skill, _ = cost_report.allocate()
    sizes, fires = {}, {}
    import importlib.util
    spec = importlib.util.spec_from_file_location(
        "rt", os.path.join(_HERE, "..", "src", "steroids", "router.py"))
    router = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(router)
    for sname, md in router.skill_files(rules.get("index_dirs", [])):
        if sname not in sizes:
            try:
                sizes[sname] = os.path.getsize(md) // 4
            except OSError:
                sizes[sname] = 0
    log = os.path.expanduser("~/.config/steroids/served.jsonl")
    try:
        with open(log, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                sk = [x for x in json.loads(line).get("skills", "").split("/") if x]
                if sk:
                    fires[sk[0]] = fires.get(sk[0], 0) + 1
    except OSError:
        pass
    rows = hogs(per_skill, sizes, fires)
    date = datetime.now().date().isoformat()
    path = os.path.join(_HERE, "..", "reports", f"hogs-{date}.md")
    L = [f"# Context hogs — {date}", "",
         "| skill | cost tokens | size | fires | driver |",
         "|-------|-------------|------|-------|--------|"]
    for r in rows:
        driver = "hot" if r["fires"] * 1000 > r["size"] else "big"
        L.append(f"| {r['skill']} | {r['cost']} | {r['size']} | {r['fires']} | {driver} |")
    with open(path, "w", encoding="utf-8") as f:
        f.write("\n".join(L) + "\n")
    for r in rows[:5]:
        print(f"{r['cost']:>9} {r['skill']}")
    print(f"wrote {path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
