#!/usr/bin/env python3
"""Steroids benchmark: frozen golden vs live index. Stdlib only.

  python3 tests/benchmark.py --golden   # frozen 1265-skill snapshot, reproducible anywhere
  python3 tests/benchmark.py --live     # current live index (whatever is installed today)
  python3 tests/benchmark.py --check    # README claims match golden metadata (catches stale docs)

--golden exits 1 on regression vs metadata.json. --check exits 1 when the
README table disagrees with metadata.json (the 35d4583 class of error:
count updated, measurements not re-run).
"""
import importlib.util
import json
import os
import re
import subprocess
import sys

_HERE = os.path.dirname(os.path.abspath(__file__))
_ROOT = os.path.normpath(os.path.join(_HERE, ".."))
_GOLDEN_DIR = os.path.join(_ROOT, "benchmarks", "golden-1265")
_META = os.path.join(_GOLDEN_DIR, "metadata.json")
_README = os.path.join(_ROOT, "README.md")


def load_router():
    path = os.path.join(_ROOT, "src", "steroids", "router.py")
    spec = importlib.util.spec_from_file_location("steroids_router_bench", path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def score_set(router, goldens, rules, idx):
    p1 = p3 = leaks = 0
    rrs = []
    for row in goldens:
        query, exp = row[0], row[1]
        acc = row[2] if len(row) > 2 else []
        exc = row[3] if len(row) > 3 else []
        ranked = [s for _, s, _ in router.route_query(query, rules, idx)]
        p1 += ranked[:1] == [exp]
        rel = [i for i, s in enumerate(ranked[:3]) if s == exp or s in acc]
        leak = bool(set(ranked[:3]) & set(exc))
        p3 += bool(rel) and not leak
        leaks += leak
        rrs.append(1.0 / (rel[0] + 1) if rel else 0.0)
    n = len(goldens)
    return {"n": n, "p1": round(p1 / n, 3), "p3": round(p3 / n, 3),
            "mrr": round(sum(rrs) / n, 3), "leaks": leaks}


def cmd_golden():
    router = load_router()
    idx = json.load(open(os.path.join(_GOLDEN_DIR, "index.json")))
    rules = json.load(open(os.path.join(_GOLDEN_DIR, "rules.json")))
    goldens = json.load(open(os.path.join(_GOLDEN_DIR, "prompts.json")))
    # ponytail: freeze means freeze — seed embed descriptions from the
    # snapshot so scoring never reads live SKILL.md files (else a skill
    # edit silently changes golden numbers; index_dirs absence once cost
    # us 0.007 P@1 via keyword-only fallback docs).
    descs = json.load(open(os.path.join(_GOLDEN_DIR, "descs.json")))
    router._DESC_MEM = {"key": id(idx), "map": {s: descs.get(s, "") for s in idx}}
    meta = json.load(open(_META))
    got = score_set(router, goldens, rules, idx)
    exp = meta["results"]["blind149"]
    print("STEROIDS GOLDEN BENCHMARK")
    print("index:     %d skills (frozen %s)" % (meta["index_size"], meta["snapshot_id"]))
    print("prompts:   %d" % got["n"])
    print("P@1        %.3f (recorded %.3f)" % (got["p1"], exp["p1"]))
    print("P@3        %.3f (recorded %.3f)" % (got["p3"], exp["p3"]))
    print("leaks:     %d (recorded %d)" % (got["leaks"], exp["leaks"]))
    ok = (got["p1"] >= exp["p1"] and got["p3"] >= exp["p3"]
          and got["leaks"] <= exp["leaks"] and got["n"] == exp["n"])
    print("PASS" if ok else "FAIL — regression vs %s" % _META)
    return 0 if ok else 1


def cmd_live():
    procs = [
        ("blind149", [sys.executable, os.path.join(_HERE, "blind_eval_100.py")]),
        ("second315", [sys.executable, os.path.join(_HERE, "blind_eval_second.py")]),
        ("live16", [sys.executable, os.path.join(_HERE, "live_probe.py")]),
    ]
    failed = False
    for name, cmd in procs:
        out = subprocess.run(cmd, capture_output=True, text=True, cwd=_ROOT, timeout=300)
        tail = (out.stdout + out.stderr).strip().splitlines()
        line = next((l for l in reversed(tail) if l.startswith("n=")), "(no summary)")
        print("%-10s %s" % (name, line))
        failed = failed or out.returncode != 0
    return 1 if failed else 0


def cmd_check():
    meta = json.load(open(_META))
    exp = meta["results"]["blind149"]
    text = open(_README).read()
    m = re.search(r"## Results \(verified (\d{4}-\d{2}-\d{2}); live index (\d+) skills", text)
    if not m:
        print("CHECK FAIL — Results header not found in README")
        return 1
    errors = []
    if m.group(2) != str(meta["index_size"]):
        errors.append("header index %s != snapshot %d" % (m.group(2), meta["index_size"]))
    row = re.search(r"\| Blind \(in-script GOLDEN[^|]*\| (\d+) \| ([\d.]+) \| ([\d.]+) \| (\d+)", text)
    if not row:
        errors.append("blind149 row not found in README table")
    else:
        n, p1, p3, leaks = int(row.group(1)), float(row.group(2)), float(row.group(3)), int(row.group(4))
        if n != exp["n"] or abs(p1 - exp["p1"]) > 0.0005 or abs(p3 - exp["p3"]) > 0.0005 or leaks != exp["leaks"]:
            errors.append("README blind149 (%d %.3f %.3f %d) != metadata (%d %.3f %.3f %d)"
                          % (n, p1, p3, leaks, exp["n"], exp["p1"], exp["p3"], exp["leaks"]))
    if errors:
        print("CHECK FAIL — stale benchmark claims:")
        for e in errors:
            print("  - " + e)
        print("Regenerate: re-run --golden/--live and update README + metadata together.")
        return 1
    print("CHECK PASS — README matches %s" % _META)
    return 0


if __name__ == "__main__":
    mode = sys.argv[1] if len(sys.argv) > 1 else "--golden"
    if mode == "--golden":
        sys.exit(cmd_golden())
    if mode == "--live":
        sys.exit(cmd_live())
    if mode == "--check":
        sys.exit(cmd_check())
    print(__doc__)
    sys.exit(2)
