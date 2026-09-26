#!/usr/bin/env python3
"""P0-4 bank grader recorder (RQ-2). Stdlib only.

Steroids is a plugin: it never calls a model, holds no keys, spends
nothing. The host CLI owns its brain and its bill. This script runs
deterministic bank graders + isolation checks and records one CSV row
per task per trial under a human-supplied --arm label (e.g. host-only
vs host+steroids, executed by the operator in their own CLI).

  python3 scripts/phase0_harness.py --tasks B-02,B-03 --trials 1 --arm host+steroids --out /tmp/p04.csv
  python3 scripts/phase0_harness.py --help   # shows grader policy (P0-6)

Do-not-touch: benchmarks/golden-1265/* (frozen), src/steroids/router.py scoring.
Privacy: logs carry task_id + sha256 of task text, never full prompts.
"""
import argparse
import csv
import hashlib
import os
import re
import subprocess
import sys
import tempfile
import time

_ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
_BANK = os.path.join(_ROOT, "specs", "phase-0", "task-bank.md")
_FROZEN = os.path.join(_ROOT, "benchmarks", "golden-1265")
_CSV_COLS = ["task_id", "arm", "trial", "tokens_in", "tokens_out",
             "cost_usd", "wall_s", "interventions", "rework",
             "grader_pass", "grader_score", "notes"]
# ponytail: single recorded arm per run; the human supplies the label for
# the host-side condition they executed (host-only vs host+steroids).
# ponytail: allowlist keeps skeleton from executing arbitrary bank text.
_SAFE_PREFIXES = ("python3 -m unittest ", "python3 src/steroids/",
                  "python3 -c ", "git diff --quiet ", "git show ", "git checkout -- ")

GRADER_POLICY = """Grader policy (P0-6 draft): outputs-not-paths (grade observable
outcome, not the route taken); partial credit where tasks have sub-checks;
every task needs a reference solution or deterministic grader; one transcript
read-through recorded as example; calibration policy: two-grader disagreement
re-opens the task. Privacy: hash-only prompts in logs."""


def parse_bank(path=_BANK):
    text = open(path).read()
    blocks = re.findall(r"```text\n(Task B-\d+:.*?)\n```", text, re.S)
    tasks = []
    for b in blocks:
        m = re.match(r"(Task B-\d+):\s*(.+)", b.strip())
        if not m:
            continue
        tid, title = m.group(1).replace("Task ", ""), m.group(2).splitlines()[0].strip()
        typ = re.search(r"^Type:\s*(.+)$", b, re.M)
        exp = re.search(r"^Expected:\s*(.+)$", b, re.M | re.S)
        grader = ""
        if exp:
            g = re.search(r"grader:\s*(.+)", exp.group(1), re.S)
            grader = " ".join(g.group(1).split()) if g else ""
            grader = re.sub(r"\s+\(exit.*\)\s*$", "", grader)
        tasks.append({"id": tid, "title": title,
                      "type": typ.group(1).strip() if typ else "?",
                      "grader": grader,
                      "digest": hashlib.sha256(b.encode()).hexdigest()[:12]})
    return tasks


def frozen_clean():
    r = subprocess.run(["git", "diff", "--quiet", "benchmarks/golden-1265"],
                       cwd=_ROOT, capture_output=True)
    return r.returncode == 0


def split_checks(grader):
    """Split a grader into ` + `-separated sub-checks (P0-6 partial credit).

    Bank text is never edited for this: splitting happens at run time.
    A fragment that is not allowlisted is skipped, never executed.
    Returns (runnable, skipped) fragment lists.
    """
    parts = [p.strip() for p in (grader or "").split(" + ") if p.strip()]
    runnable = [p for p in parts if p.startswith(_SAFE_PREFIXES)]
    skipped = [p for p in parts if not p.startswith(_SAFE_PREFIXES)]
    return runnable, skipped


def run_grader(grader, timeout=120):
    runnable, skipped = split_checks(grader)
    if not runnable:
        return None, None, 0.0, "grader-skipped-not-allowlisted"
    t0 = time.time()
    passed = 0
    try:
        with tempfile.TemporaryDirectory(prefix="p04-") as tmp:
            for check in runnable:
                r = subprocess.run(check, shell=True, cwd=_ROOT, capture_output=True,
                                   text=True, timeout=timeout, env={**os.environ, "TMPDIR": tmp})
                passed += (r.returncode == 0)
    except subprocess.TimeoutExpired:
        wall = round(time.time() - t0, 2)
        score = round(passed / len(runnable), 3)
        return False, score, wall, "grader-timeout (%d/%d sub-checks)" % (passed, len(runnable))
    wall = round(time.time() - t0, 2)
    score = round(passed / len(runnable), 3)
    note = ""
    if len(runnable) > 1:
        note = "sub-checks %d/%d" % (passed, len(runnable))
    if skipped:
        note = (note + "; " if note else "") + "skipped %d non-allowlisted" % len(skipped)
    return (passed == len(runnable)), score, wall, note


def main():
    ap = argparse.ArgumentParser(description="P0-4 bank grader recorder",
                                 epilog=GRADER_POLICY)
    ap.add_argument("--tasks", default="B-02,B-03",
                    help="comma list of bank ids, or 'all'")
    ap.add_argument("--trials", type=int, default=1)
    ap.add_argument("--arm", default="host+steroids",
                    help="host-side condition label for these rows "
                         "(e.g. host-only vs host+steroids)")
    ap.add_argument("--out", default=os.path.join(_ROOT, "specs", "phase-0", "results.csv"))
    a = ap.parse_args()

    bank = {t["id"]: t for t in parse_bank()}
    ids = list(bank) if a.tasks == "all" else [s.strip() for s in a.tasks.split(",")]
    missing = [i for i in ids if i not in bank]
    if missing:
        print("unknown task ids: %s (bank holds %s)" % (missing, sorted(bank)), file=sys.stderr)
        return 2
    if not frozen_clean():
        print("REFUSE: benchmarks/golden-1265 dirty — restore before probing", file=sys.stderr)
        return 1

    rows = []
    for tid in ids:
        t = bank[tid]
        for trial in range(1, max(1, a.trials) + 1):
            ok, score, wall, note = run_grader(t["grader"])
            note = (note + "; " if note else "") + "grader-only; no model calls (host brain does the work)"
            rows.append([tid, a.arm, trial, "", "", "", wall, 0, 0,
                         "" if ok is None else int(ok),
                         "" if score is None else score, note])
        if not frozen_clean():  # ponytail: probe must never dirty frozen record (B-04)
            print("REFUSE: probe dirtied frozen golden record — reverting run", file=sys.stderr)
            subprocess.run(["git", "checkout", "--", "benchmarks/golden-1265"],
                           cwd=_ROOT, capture_output=True)
            return 1

    os.makedirs(os.path.dirname(a.out) or ".", exist_ok=True)
    with open(a.out, "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(_CSV_COLS)
        w.writerows(rows)
    print("wrote %d rows (%s) to %s" % (len(rows), ",".join(ids), a.out))
    print("task digests (hash-only): %s" % ", ".join("%s:%s" % (i, bank[i]["digest"]) for i in ids))
    return 0


if __name__ == "__main__":
    sys.exit(main())
