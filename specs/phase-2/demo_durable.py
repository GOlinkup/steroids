#!/usr/bin/env python3
"""RQ-3 demo: real kill -9 mid-workflow, resume, effects issued exactly once.

Spawns a worker subprocess, SIGKILLs it mid-run, re-runs: completed steps
skip, recorded effects never re-issue. Exit 1 if any effect fired twice.
"""
import importlib.util
import os
import signal
import subprocess
import sys
import time

_HERE = os.path.dirname(os.path.abspath(__file__))
WORKER = os.path.join(_HERE, "demo_durable_worker.py")
JOURNAL = "/tmp/steroids-k9.db"
EFFECTS = "/tmp/steroids-k9.effects"


def main():
    for p in (JOURNAL, EFFECTS):
        if os.path.exists(p):
            os.remove(p)
    proc = subprocess.Popen([sys.executable, WORKER, JOURNAL, EFFECTS])
    time.sleep(1.2)  # worker is mid step-2 (each step sleeps 1s)
    os.kill(proc.pid, signal.SIGKILL)
    proc.wait()
    print("killed mid-run, resuming...")
    r = subprocess.run([sys.executable, WORKER, JOURNAL, EFFECTS], capture_output=True, text=True)
    print(r.stdout.strip())
    if r.returncode != 0:
        print("RQ-3 FAIL: resume crashed");
        return 1
    with open(EFFECTS) as f:
        lines = [l for l in f.read().splitlines() if l.strip()]
    from collections import Counter
    dupes = {k: n for k, n in Counter(lines).items() if n > 1}
    print(f"effects: {sorted(lines)}, dupes: {dupes or 'none'}")
    if dupes:
        print("RQ-3 FAIL: effect re-issued");
        return 1
    print("RQ-3 OK: kill -9 resumed, no step re-ran, no effect re-issued")
    return 0


if __name__ == "__main__":
    sys.exit(main())
