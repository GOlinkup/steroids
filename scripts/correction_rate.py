#!/usr/bin/env python3
"""D-3 correction-rate query over the served log (RQ-6). Stdlib only.

Correction = a row carrying the D-2 `correction` field (filed via
`steroids --correct <prompt> --skill <name>`). Abstention = a row with
empty skills. Prompts stay hashed in the log; this query never unhashes.
Usage:  python3 scripts/correction_rate.py [served.jsonl]
"""
import json
import os
import sys

_DEFAULT = os.path.expanduser("~/.config/steroids/served.jsonl")


def rate(path):
    n = corr = abst = 0
    try:
        f = open(path, encoding="utf-8")
    except FileNotFoundError:
        return {"impressions": 0, "corrections": 0, "abstentions": 0,
                "correction_rate": None, "abstention_rate": None}
    for line in f:
        try:
            r = json.loads(line)
        except json.JSONDecodeError:
            continue
        n += 1
        if r.get("correction"):
            corr += 1
        if not r.get("skills"):
            abst += 1
    return {"impressions": n, "corrections": corr, "abstentions": abst,
            "correction_rate": round(corr / n, 4) if n else None,
            "abstention_rate": round(abst / n, 4) if n else None}


def main(argv):
    r = rate(argv[1] if len(argv) > 1 else _DEFAULT)
    print("impressions=%d corrections=%d abstentions=%d" % (
        r["impressions"], r["corrections"], r["abstentions"]))
    print("correction_rate=%s abstention_rate=%s" % (
        r["correction_rate"], r["abstention_rate"]))
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
