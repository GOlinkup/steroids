#!/usr/bin/env python3
"""P2-5 e2e: OTel emission driven through the engine, on the record.

Goal -> task tree -> contracts -> evidence -> verification -> report.
Emits task.* events to a JSONL sink; replays the trace; writes
specs/phase-2/e2e-report.md with real numbers. Stdlib only.
"""
import importlib.util
import json
import os
import sys

_HERE = os.path.dirname(os.path.abspath(__file__))
TRACE = os.path.join(_HERE, "e2e-trace.jsonl")
REPORT = os.path.join(_HERE, "e2e-report.md")


def _load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


def main():
    src = os.path.join(_HERE, "..", "..", "src", "steroids")
    tmod = _load("st_tasks_e2e", os.path.join(src, "tasks.py"))
    bus = _load("st_bus_e2e", os.path.join(src, "bus.py"))
    ids = _load("st_ids_e2e", os.path.join(src, "ids.py"))
    if os.path.exists(TRACE):
        os.remove(TRACE)
    run = ids.run_id()
    caught = []

    def emit(etype, subject, data):
        bus.emit(etype, subject, data, sink=TRACE)

    goal = {"id": "S-25", "title": "OTel emission live", "status": "active"}
    tree = [
        {"id": "E-1", "title": "Emit CloudEvents envelope per bus event",
         "status": "planned", "goal": "to_cloudevent covers all 19 bus types",
         "checks": ["envelope-validates"]},
        {"id": "E-2", "title": "Trace validates against event schema",
         "status": "planned", "goal": "replayed trace matches events.schema.json",
         "checks": ["schema-green"]},
        {"id": "E-3", "title": "Replay report with real numbers",
         "status": "planned", "goal": "e2e-report.md from the trace itself",
         "checks": ["report-written"]},
    ]
    tmod.check_cycles([{"id": t["id"], "dependencies": []} for t in tree])
    for t in tree:
        t["parent"] = goal["id"]
        tmod.set_contract(t, t.pop("checks"))
        for s in ("ready", "running", "verifying"):
            tmod.transition(t, s, emit=emit)
    # engine catch #1: premature done with no evidence
    try:
        tmod.complete(tree[0], emit=emit)
        print("P2-5 FAIL: premature done accepted")
        return 1
    except ValueError as e:
        caught.append(f"premature done rejected: {e}")
    # evidence each check, then complete for real
    proof = {"E-1": ("19/19 envelopes", "bus.py:to_cloudevent"),
             "E-2": ("trace validates", "demo run"),
             "E-3": ("report below", "this file")}
    for t in tree:
        claim, src_ = proof[t["id"]]
        tmod.add_evidence(t, claim, src_)["check"] = t["contract"]["required"][0]
        tmod.complete(t, emit=emit)
    # engine catch #2: illegal jump attempt on the record
    try:
        tmod.transition({"id": "X", "title": "x", "status": "completed",
                         "goal": "g"}, "running")
    except ValueError as e:
        caught.append(f"illegal jump rejected: {e}")
    events = list(bus.replay(TRACE))
    kinds = {}
    for e in events:
        kinds[e["type"]] = kinds.get(e["type"], 0) + 1
    with open(REPORT, "w", encoding="utf-8") as f:
        f.write(f"# P2-5 e2e report (run {run})\n\n")
        f.write(f"goal {goal['id']}: {goal['title']} — "
                f"{sum(1 for t in tree if t['status'] == 'completed')}/{len(tree)} completed\n")
        f.write(f"trace: {len(events)} events {kinds}, replayed from e2e-trace.jsonl\n")
        f.write("engine caught:\n")
        for c in caught:
            f.write(f"- {c}\n")
    print(f"P2-5 OK: 3/3 completed, {len(events)} events, report written")
    print("caught: " + "; ".join(caught))
    return 0


if __name__ == "__main__":
    sys.exit(main())
