#!/usr/bin/env python3
"""F59 menubar widget: fire-rate + top skills.

xbar/Argos-compatible output (first line = menu title, ---, rows), which
also reads fine as plain stdout where no menubar host exists.
Fire-rate = serves in the trailing 60 minutes from served.jsonl.
Run: python3 scripts/menubar_steroids.py   (or symlink into xbar plugins)
Stdlib only.
"""
import json
import os
import sys
import time
from collections import Counter

LOG = os.path.expanduser("~/.config/steroids/served.jsonl")
WINDOW = 3600


def stats(log_path=LOG, window=WINDOW, now=None):
    now = time.time() if now is None else now
    rate = total = abst = 0
    top = Counter()
    try:
        with open(log_path, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                r = json.loads(line)
                total += 1
                skills = [x for x in r.get("skills", "").split("/") if x]
                if not skills:
                    abst += 1
                    continue
                top[skills[0]] += 1
                if now - r.get("t", 0) <= window:
                    rate += 1
    except OSError:
        pass
    return {"rate_h": rate, "total": total, "abst": abst, "top": top.most_common(5)}


def main():
    s = stats()
    print(f"🔥 {s['rate_h']}/h")
    print("---")
    for skill, n in s["top"]:
        print(f"{skill} {n}")
    print(f"total {s['total']} · abst {s['abst']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
