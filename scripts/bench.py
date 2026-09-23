#!/usr/bin/env python3
"""Bench harness: one-command retrieval benchmark over the live skill index.

Query set = the in-repo labeled sets (referenced, never duplicated):
  blind149   tests/blind_eval_100.py GOLDEN       (query, exp, acc, exc)
  second315  tests/blind_eval_second.py GOLDEN2   (query, exp, acc, exc)
  live16     tests/live_probe.py GOLDEN           (query, inc, exc)

Scoring matches each set's owner script: P@1 strict top-1; P@3 =
relevant-in-top-3 AND no excluded-in-top-3; MRR = mean 1/rank of first
relevant (expected or acceptable) in top-3; leaks = rows with an
excluded skill in top-3.

Usage (repo root):
  python3 scripts/bench.py            # run + compare vs recorded baseline
  python3 scripts/bench.py --record   # run + overwrite the recorded baseline
Exit 0 when no regression; exit 1 on regression (P@1/P@3 drop or more
leaks on any set) or on missing index skills. Stdlib only.
"""
import json
import os
import subprocess
import sys

_HERE = os.path.dirname(os.path.abspath(__file__))
_ROOT = os.path.normpath(os.path.join(_HERE, ".."))
_TESTS = os.path.join(_ROOT, "tests")
_BASELINE = os.path.join(_HERE, "bench_baseline.json")

sys.path.insert(0, _TESTS)
import blind_eval_100
import blind_eval_second
import live_probe

SETS = [
    ("blind149", blind_eval_100.GOLDEN, True),
    ("second315", blind_eval_second.GOLDEN2, True),
    ("live16", live_probe.GOLDEN, False),
]


def git_state():
    try:
        commit = subprocess.run(["git", "rev-parse", "HEAD"], capture_output=True,
                                text=True, cwd=_ROOT, timeout=30).stdout.strip()
        dirty = subprocess.run(["git", "status", "--short"], capture_output=True,
                               text=True, cwd=_ROOT, timeout=30).stdout.strip().splitlines()
        return commit, [l.strip() for l in dirty if l.strip()]
    except Exception:
        return "unknown", []


def score(rows, has_acc):
    """rows: (query, exp, acc-or-exc, exc-or-None). Returns dict of metrics."""
    rules, idx = blind_eval_second.build_live_idx()
    missing = sorted({exp for _, exp, _, *_ in rows if exp not in idx})
    if missing:
        return None, missing
    p1 = p3 = leaks = rr = 0.0
    misses = []
    for row in rows:
        query, exp = row[0], row[1]
        acc, exc = (row[2], row[3]) if has_acc else ([], row[2])
        top = blind_eval_second.router.route_query(query, rules, idx)
        ranked = [s for _, s, _ in top]
        relevant = {exp} | set(acc)
        ok1 = ranked[:1] == [exp]
        ok3 = bool(relevant & set(ranked[:3])) and not (set(ranked[:3]) & set(exc))
        p1 += ok1
        p3 += ok3
        leaks += bool(set(ranked[:3]) & set(exc))
        for i, s in enumerate(ranked[:3]):
            if s in relevant:
                rr += 1.0 / (i + 1)
                break
        if not ok1 or not ok3:
            misses.append((query, exp, ranked[:3]))
    n = len(rows)
    return {"n": n, "p1": round(p1 / n, 3), "p3": round(p3 / n, 3),
            "mrr": round(rr / n, 3), "leaks": int(leaks),
            "misses": [{"q": q, "exp": e, "got": g} for q, e, g in misses]}, None


def main():
    record = "--record" in sys.argv
    commit, dirty = git_state()
    print(f"commit: {commit[:12]}  dirty_paths: {len(dirty)}")
    result = {"commit": commit, "dirty": dirty, "sets": {}}
    failed = False
    for name, rows, has_acc in SETS:
        metrics, missing = score(rows, has_acc)
        if missing:
            print(f"{name}: MISSING FROM INDEX: {missing}")
            failed = True
            continue
        result["sets"][name] = {k: v for k, v in metrics.items() if k != "misses"}
        m = result["sets"][name]
        print(f"{name:<10} n={m['n']:<4} P@1={m['p1']:.3f}  P@3={m['p3']:.3f}  "
              f"MRR={m['mrr']:.3f}  leaks={m['leaks']}")
    if failed:
        return 1
    if record:
        with open(_BASELINE, "w", encoding="utf-8") as f:
            json.dump(result, f, indent=2)
            f.write("\n")
        print(f"recorded -> {_BASELINE}")
        return 0
    try:
        with open(_BASELINE, encoding="utf-8") as f:
            base = json.load(f)
    except FileNotFoundError:
        print(f"no baseline at {_BASELINE} — run with --record first")
        return 2
    regress = []
    for name in result["sets"]:
        cur, old = result["sets"][name], base["sets"][name]
        for metric in ("p1", "p3"):
            if cur[metric] < old[metric]:
                regress.append(f"{name} {metric} {old[metric]:.3f}->{cur[metric]:.3f}")
        if cur["leaks"] > old["leaks"]:
            regress.append(f"{name} leaks {old['leaks']}->{cur['leaks']}")
    if regress:
        print("REGRESSION vs baseline:")
        for r in regress:
            print(f"  {r}")
        return 1
    print(f"no regression vs baseline (recorded @ {base['commit'][:12]})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
