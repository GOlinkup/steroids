#!/usr/bin/env python3
"""F56: bake a scrubable routing-history snapshot for session replay.

Reads ~/.config/steroids/served.jsonl, writes demo/served-snapshot.json:
last 500 served rows as [{"t": epoch, "s": top1}] (hashes dropped).
Run: python3 scripts/bake_snapshot.py. Stdlib only.
"""
import json
import os

ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
LOG = os.path.expanduser("~/.config/steroids/served.jsonl")
KEEP = 500


def bake(log_path=LOG, keep=KEEP):
    rows = []
    try:
        with open(log_path, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                r = json.loads(line)
                skills = [x for x in r.get("skills", "").split("/") if x]
                if skills:
                    rows.append({"t": r.get("t", 0), "s": skills[0]})
    except OSError:
        pass
    rows.sort(key=lambda r: r["t"])
    return rows[-keep:]


def main():
    rows = bake()
    path = os.path.join(ROOT, "demo", "served-snapshot.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(rows, f)
        f.write("\n")
    span = (rows[-1]["t"] - rows[0]["t"]) / 3600 if len(rows) > 1 else 0
    print(f"rows={len(rows)} span={span:.1f}h")
    print(f"wrote {path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
