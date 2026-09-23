#!/usr/bin/env python3
"""P0-4 paired harness skeleton (RQ-2). Stdlib only.

Runs identical bank tasks in two arms (MODEL-only vs MODEL+STEROIDS),
isolated trials, per-task metrics CSV. Skeleton mode: --dry-run performs
NO model calls; it runs read-only graders + isolation checks so the
harness shape is proven end-to-end on 2 sample tasks before the bank
is complete (P0-3 5/20) and before any spend.

  python3 scripts/phase0_harness.py --tasks B-02,B-03 --trials 1 --dry-run --out /tmp/p04.csv
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
             "grader_pass", "notes"]
_ARMS = ["model-only", "model+steroids"]
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


def run_grader(grader, timeout=120):
    if not grader or not grader.startswith(_SAFE_PREFIXES):
        return None, 0.0, "grader-skipped-not-allowlisted"
    t0 = time.time()
    try:
        with tempfile.TemporaryDirectory(prefix="p04-") as tmp:
            r = subprocess.run(grader, shell=True, cwd=_ROOT, capture_output=True,
                               text=True, timeout=timeout, env={**os.environ, "TMPDIR": tmp})
        return (r.returncode == 0), round(time.time() - t0, 2), ""
    except subprocess.TimeoutExpired:
        return False, round(time.time() - t0, 2), "grader-timeout"


def main():
    ap = argparse.ArgumentParser(description="P0-4 paired harness skeleton",
                                 epilog=GRADER_POLICY)
    ap.add_argument("--tasks", default="B-02,B-03",
                    help="comma list of bank ids, or 'all'")
    ap.add_argument("--trials", type=int, default=1)
    ap.add_argument("--dry-run", action="store_true",
                    help="no model calls; graders + isolation checks only")
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
        for arm in _ARMS:
            for trial in range(1, max(1, a.trials) + 1):
                if a.dry_run:
                    ok, wall, note = run_grader(t["grader"])
                    note = note or "dry-run: no model calls; grader-only"
                    rows.append([tid, arm, trial, "", "", "", wall, 0, 0,
                                 "" if ok is None else int(ok), note])
                else:
                    print("live model arms need keys + spend cap — refusing (free-tier rule)",
                          file=sys.stderr)
                    return 1
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
