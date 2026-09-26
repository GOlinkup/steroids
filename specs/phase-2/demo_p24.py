#!/usr/bin/env python3
"""P2-4 recorded demo: premature done rejected, evidence completes, force path logged."""
import importlib.util
import os
import sys

_HERE = os.path.dirname(os.path.abspath(__file__))


def _load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


def main():
    tmod = _load("st_tasks_demo4", os.path.join(_HERE, "..", "..", "src", "steroids", "tasks.py"))
    log = []
    t = {"id": "DEMO/1", "title": "demo", "status": "verifying", "goal": "g"}
    tmod.set_contract(t, ["tests-green"])
    try:
        tmod.complete(t, emit=lambda *a: log.append(a))
        print("P2-4 FAIL: premature done accepted")
        return 1
    except ValueError as e:
        print(f"1. premature done rejected: {e}")
    tmod.add_evidence(t, "10/10 pass", "unittest")["check"] = "tests-green"
    tmod.complete(t, emit=lambda *a: log.append(a))
    print(f"2. evidenced done accepted: {t['status']}, events={len(log)}")
    f = {"id": "DEMO/2", "title": "demo", "status": "failed", "goal": "g"}
    tmod.force_complete(f, "human accepts risk", emit=lambda *a: log.append(a))
    print(f"3. force-complete: {f['status']}, decisions={f['decisions']}")
    print("P2-4 OK: done requires evidence; override is logged")
    return 0


if __name__ == "__main__":
    sys.exit(main())
