#!/usr/bin/env python3
"""RQ-3 worker: 3 steps x 1s sleeps, one file-append effect each. Slow on purpose."""
import importlib.util
import os
import sys
import time

JOURNAL, EFFECTS = sys.argv[1], sys.argv[2]
spec = importlib.util.spec_from_file_location(
    "st_durable_w", os.path.join(os.path.dirname(os.path.abspath(__file__)),
                                 "..", "..", "src", "steroids", "durable.py"))
durable = importlib.util.module_from_spec(spec)
spec.loader.exec_module(durable)


def step(name):
    def run(ctx):
        time.sleep(1)
        ctx.effect(name, lambda: open(EFFECTS, "a").write(name + "\n") or name)
        return name
    return (name, run)


db = durable.open_journal(JOURNAL)
r = durable.run_workflow(db, [step("s1"), step("s2"), step("s3")])
print(f"worker: done={r['done']} skipped={r['skipped']} replayed={r['replayed_effects']}")
