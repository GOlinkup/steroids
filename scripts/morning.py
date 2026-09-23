#!/usr/bin/env python3
"""Morning digest (RQ-8): 2-minute review starter. Stdlib only.

Prints: (1) nightly-report streak x/3, (2) TBD miss proposals awaiting a
human, (3) candidate bank failures from the last 24h (fix/revert commits
+ cron ERROR markers) as B-NN drafts. The machine drafts, humans dispose.
Usage (repo root):  python3 scripts/morning.py
"""
import glob
import os
import re
import subprocess

_ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
_REPORTS = os.path.join(_ROOT, "reports")

FAIL_WORDS = ("fix", "revert", "fail", "probe", "regression", "transient")


def main():
    print("== 1. nightly streak ==")
    nights = sorted({os.path.basename(p)[8:18] for p in
                     glob.glob(os.path.join(_REPORTS, "nightly-20*.md"))
                     if not p.endswith("-ERROR.md")}, reverse=True)
    print(f"reports: {len(nights)}/3 nights ({', '.join(nights[:3]) or 'none yet'})")
    errs = sorted(glob.glob(os.path.join(_REPORTS, "nightly-*-ERROR.md")))
    print("ERROR markers:", ", ".join(map(os.path.basename, errs)) or "none")

    print("== 2. miss proposals (TBD = you assign) ==")
    miss = sorted(glob.glob(os.path.join(_REPORTS, "miss-goldens-*.md")))
    if miss:
        rows = [l.strip() for l in open(miss[-1], encoding="utf-8")
                if l.strip().startswith("- `")]
        print(f"{os.path.basename(miss[-1])}: {len(rows)} TBD")
        for r in rows[:5]:
            print("  approve/reject:", r)
    else:
        print("no proposal files yet")

    print("== 3. bank candidates (last 24h) ==")
    log = subprocess.run(["git", "log", "--since=24 hours ago", "--oneline"],
                         capture_output=True, text=True, cwd=_ROOT).stdout
    cands = [l for l in log.splitlines()
             if any(w in l.lower() for w in FAIL_WORDS)]
    if cands:
        for c in cands[:5]:
            print("  draft B-NN from:", c)
    else:
        print("no fix/revert commits in 24h — nothing to bank")
    print("done: assign TBDs, draft any B-NN, else close terminal.")


if __name__ == "__main__":
    main()
