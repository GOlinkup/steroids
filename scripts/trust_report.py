#!/usr/bin/env python3
"""J99 trust report: public abstention/precision page, first edition from D35 data.

Reads the latest reports/nightly-*.md (bench precision + traffic health) and
reports/lint-*.md (index hygiene), writes docs/TRUST.md. Public-safe by
construction: no local paths, no query hashes, method + limitations stated.
Usage (repo root):  python3 scripts/trust_report.py
Stdlib only.
"""
import glob
import os
import re
import sys
from datetime import datetime

_HERE = os.path.dirname(os.path.abspath(__file__))
_ROOT = os.path.normpath(os.path.join(_HERE, ".."))
_REPORTS = os.path.join(_ROOT, "reports")


def latest(pattern):
    files = sorted(glob.glob(os.path.join(_REPORTS, pattern)))
    if not files:
        raise SystemExit(f"no {pattern} found — run nightly_report/lint first")
    return files[-1]


def parse_nightly(path):
    text = open(path, encoding="utf-8").read()
    bench = re.findall(r"\| (\w+) \| (\d+) \| ([\d.]+) \| ([\d.]+) \| ([\d.]+) \| (\d+) \|", text)
    m = re.search(r"bench @ `(\w+)`", text)
    traffic = {}
    for window in ("today", "all"):
        mm = re.search(r"## traffic \(" + window + r", (\d+) serves\)\n"
                       r"- distinct queries: (\d+), abstentions: (\d+) \(([\d.]+)%\), "
                       r"unstable repeats: (\d+)", text)
        if mm:
            serves, dq, ab, abpct, un = mm.groups()
            traffic[window] = {"serves": int(serves), "distinct": int(dq),
                               "abstentions": int(ab), "abst_pct": float(abpct),
                               "unstable": int(un)}
    return {"commit": m.group(1) if m else "unknown",
            "bench": [{"set": b[0], "n": int(b[1]), "p1": float(b[2]),
                       "p3": float(b[3]), "mrr": float(b[4]), "leaks": int(b[5])} for b in bench],
            "traffic": traffic}


def parse_lint(path):
    text = open(path, encoding="utf-8").read()
    m = re.search(r"skills scanned: (\d+) files / (\d+) unique  errors: (\d+)  warnings: (\d+)  collisions: (\d+)", text)
    if not m:
        raise SystemExit(f"cannot parse {path}")
    files, unique, err, warn, col = map(int, m.groups())
    return {"files": files, "unique": unique, "errors": err, "warnings": warn, "collisions": col}


def main():
    npath, lpath = latest("nightly-*.md"), latest("lint-*.md")
    n, li = parse_nightly(npath), parse_lint(lpath)
    date = datetime.now().date().isoformat()
    L = ["# Steroids router — trust report (1st edition)", "",
         f"_Published {date} · bench commit `{n['commit']}` · sources: "
         f"`{os.path.basename(npath)}`, `{os.path.basename(lpath)}`_", "",
         "## Precision (labeled sets, 480 queries)",
         "| set | n | P@1 | P@3 | MRR | leaks |",
         "|-----|---|-----|-----|-----|-------|"]
    for b in n["bench"]:
        L.append(f"| {b['set']} | {b['n']} | {b['p1']:.3f} | {b['p3']:.3f} | {b['mrr']:.3f} | {b['leaks']} |")
    L += ["", "## Live traffic health (unlabeled — prompts are hash-only by design)"]
    for window in ("today", "all"):
        t = n["traffic"].get(window)
        if t:
            L.append(f"- {window}: {t['serves']} serves, {t['distinct']} distinct queries, "
                     f"abstentions {t['abstentions']} ({t['abst_pct']}%), "
                     f"unstable repeats {t['unstable']}")
    L += ["", "## Index hygiene (linter)",
          f"- {li['unique']} unique skills ({li['files']} files across harness homes), "
          f"{li['errors']} frontmatter errors, {li['warnings']} warnings, "
          f"{li['collisions']} cross-home shadows (first wins, by design)", "",
          "## Method + limitations",
          "- P@1 strict top-1; P@3 needs relevant-in-top-3 with zero excluded; "
          "MRR = mean 1/rank of first relevant in top-3.",
          "- Live prompts are never stored (hash-only log), so traffic health is "
          "proxies: abstention (no confident skill), instability (same prompt, "
          "different top-1 across hits).",
          "- Deploy is gated: install refuses on any unit/precision regression "
          "(see `scripts/eval_gate.sh`)."]
    out = "\n".join(L) + "\n"
    for bad in ("/home/", "/root/", "users/"):
        assert bad not in out, f"non-public string leaked: {bad}"
    path = os.path.join(_ROOT, "docs", "TRUST.md")
    with open(path, "w", encoding="utf-8") as f:
        f.write(out)
    print(out[:600])
    print(f"... wrote {path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
