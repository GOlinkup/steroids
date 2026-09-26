#!/usr/bin/env python3
"""P2-1 acceptance: validate samples + dogfood P0 tasks against schemas. Stdlib only."""
import json
import os
import re
import sys

_HERE = os.path.dirname(os.path.abspath(__file__))
STATUSES = ["pending", "discovering", "planned", "ready", "running",
            "verifying", "blocked", "failed", "recovering", "completed", "cancelled"]


def load(name):
    with open(os.path.join(_HERE, name), encoding="utf-8") as f:
        return json.load(f)


def check_task(t, where):
    for k in ("id", "title", "status", "goal"):
        assert k in t, f"{where}: missing {k}"
        assert isinstance(t[k], str) and t[k], f"{where}: bad {k}"
    assert t["status"] in STATUSES, f"{where}: bad status {t['status']}"
    for k in ("questions", "assumptions", "evidence"):
        assert isinstance(t.get(k, []), list), f"{where}: {k} not a list"


def main():
    task_schema = load("task.schema.json")
    goal_schema = load("goal.schema.json")
    assert task_schema["version"] == "v0.1" and goal_schema["version"] == "v0.1"
    got = sorted(task_schema["x-status-lifecycle"].keys())
    assert got == sorted(STATUSES), f"lifecycle covers {got}"
    assert sorted(task_schema["definitions"]["status"]["enum"]) == sorted(STATUSES)

    t1 = load("samples/p0-1-task.json")
    check_task(t1, "p0-1-task.json")
    bank = load("samples/p0-tasks.json")
    assert isinstance(bank, list) and len(bank) == 6
    for t in bank:
        check_task(t, f"p0-tasks.json:{t.get('id')}")

    # dogfood: every Task P0-N heading in phase-0/tasks.md has a bank entry
    md = open(os.path.join(_HERE, "..", "phase-0", "tasks.md"), encoding="utf-8").read()
    ids = re.findall(r"Task (P0-\d)", md)
    assert sorted(set(ids)) == sorted(t["id"] for t in bank), f"bank {ids} mismatch"

    g = load("samples/s20-goal.json")
    for k in goal_schema["required"]:
        assert k in g, f"s20-goal.json: missing {k}"
    assert re.match(r"^RQ-\d+$", g["rq"])
    print(f"P2-1 OK: 11 statuses, p0-1 + bank(6) + goal valid, dogfood {sorted(set(ids))}")


if __name__ == "__main__":
    try:
        main()
    except AssertionError as e:
        print(f"P2-1 FAIL: {e}")
        sys.exit(1)
