#!/usr/bin/env python3
"""Steroids status (P1-4): tail the bus file, 80-col summary. Stdlib only."""
import json
import sys

def fmt(ev):
    t = ev.get("time", "")[11:19]
    typ = ev.get("type", "")[:22].ljust(22)
    subj = ev.get("subject", "")[:18].ljust(18)
    d = ev.get("data", {})
    extra = (d.get("summary") or d.get("skills") or d.get("state") or "") if isinstance(d, dict) else ""
    line = f"{t} {typ} {subj} {str(extra)[:30]}"
    return line[:80]

def main():
    path = sys.argv[1] if len(sys.argv) > 1 else "-"
    if path in ("-h", "--help"):
        print("usage: status.py [bus.jsonl|-]")
        return
    fh = sys.stdin if path == "-" else open(path, encoding="utf-8")
    with fh:
        for line in fh:
            line = line.strip()
            if not line:
                continue
            try:
                print(fmt(json.loads(line)))
            except Exception:
                continue

if __name__ == "__main__":
    main()
