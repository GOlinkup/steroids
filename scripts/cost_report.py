#!/usr/bin/env python3
"""H75 cost allocation: tokens per team/skill, first report.

Cost input (the D38 ledger concept, built here — D38 itself is open):
cost(skill) = SKILL.md tokens (chars//4) x top-1 serves. Team from
rules[\"teams\"] {team: [skills]} (optional); unmapped skills bill to
\"unassigned\" (team mapping is the follow-up, stated in the report).
Writes reports/cost-YYYY-MM-DD.md.
Usage (repo root):  python3 scripts/cost_report.py
Stdlib only.
"""
import importlib.util
import json
import os
from collections import defaultdict
from datetime import datetime

_HERE = os.path.dirname(os.path.abspath(__file__))
_ROOT = os.path.normpath(os.path.join(_HERE, ".."))
_ROUTER = os.path.join(_ROOT, "src", "steroids", "router.py")
_RULES = os.path.join(_ROOT, "skill-rules.json")
LOG = os.path.expanduser("~/.config/steroids/served.jsonl")

_spec = importlib.util.spec_from_file_location("steroids_router_cost", _ROUTER)
router = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(router)


def allocate(log_path=LOG, rules_path=_RULES, topdir=None):
    rules = json.load(open(rules_path, encoding="utf-8"))
    dirs = [topdir] if topdir else rules.get("index_dirs", [])
    sizes = {}
    for sname, md in router.skill_files(dirs):
        if sname not in sizes:
            try:
                sizes[sname] = os.path.getsize(md) // 4
            except OSError:
                sizes[sname] = 0
    fires = defaultdict(int)
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
    teams = {}
    for team, members in (rules.get("teams") or {}).items():
        for m in members:
            teams[m] = team
    per_skill = {s: sizes.get(s, 0) * fires.get(s, 0) for s in set(sizes) | set(fires)}
    per_team = defaultdict(int)
    for s, cost in per_skill.items():
        per_team[teams.get(s, "unassigned")] += cost
    return per_skill, dict(per_team)


def main():
    per_skill, per_team = allocate()
    date = datetime.now().date().isoformat()
    path = os.path.join(_ROOT, "reports", f"cost-{date}.md")
    L = [f"# Cost allocation — {date}", "",
         "_cost(skill) = SKILL.md tokens x top-1 serves. Team map empty: "
         "all cost bills to unassigned until rules[\"teams\"] lands._", "",
         "## by team"]
    for team, cost in sorted(per_team.items(), key=lambda kv: -kv[1]):
        L.append(f"- {team}: {cost} tokens")
    L += ["", "## top-10 skills"]
    for s, cost in sorted(per_skill.items(), key=lambda kv: -kv[1])[:10]:
        L.append(f"- {s}: {cost}")
    with open(path, "w", encoding="utf-8") as f:
        f.write("\n".join(L) + "\n")
    print(f"teams={len(per_team)} total={sum(per_skill.values())}")
    print(f"wrote {path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
