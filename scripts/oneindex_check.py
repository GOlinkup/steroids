#!/usr/bin/env python3
"""E46 one-index check: two harnesses, same result from shared rank+learning.

Builds one index per harness view (same rules, same rank function, same
accepts) and routes the labeled queries whose expected winner exists in
BOTH views. Agreement proves ranking/learning is shared, not per-harness.
Views default to the two near-mirror harness homes (~/.agents/skills vs
~/.claude/skills, 334 skills shared).
Usage (repo root):  python3 scripts/oneindex_check.py
Writes reports/oneindex-YYYY-MM-DD.md. Exit 0 on full agreement over
comparable rows, else 1 with diffs. Stdlib only.
"""
import importlib.util
import json
import os
import sys
from datetime import datetime

_HERE = os.path.dirname(os.path.abspath(__file__))
_ROOT = os.path.normpath(os.path.join(_HERE, ".."))
_TESTS = os.path.join(_ROOT, "tests")
_ROUTER = os.path.join(_ROOT, "src", "steroids", "router.py")
_RULES = os.path.join(_ROOT, "skill-rules.json")

sys.path.insert(0, _TESTS)
import blind_eval_100
import live_probe

_spec = importlib.util.spec_from_file_location("steroids_router_oneindex", _ROUTER)
router = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(router)

VIEW_A = os.path.expanduser("~/.agents/skills")
VIEW_B = os.path.expanduser("~/.claude/skills")
ACCEPTS_PROBE = {"code-review": 4, "canvas": 4}


def build_view(topdir):
    with open(_RULES, encoding="utf-8") as f:
        rules = dict(json.load(f))
    rules["index_dirs"] = [topdir]
    files = router.skill_files([topdir])
    idx, _ = router.build_index(files)
    for skill, extra in rules.get("skills", {}).items():
        if skill in idx:
            es = [router.stem(w) for w in extra]
            idx[skill] = es + [k for k in idx[skill] if k not in es]
    return rules, idx


def agree(rows, rules_a, idx_a, rules_b, idx_b, accepts):
    """Route rows on both views. Returns (compared, matched, diffs, skipped)."""
    compared = matched = skipped = 0
    diffs = []
    for row in rows:
        query, exp = row[0], row[1]
        if exp not in idx_a or exp not in idx_b:
            skipped += 1
            continue
        a = [s for _, s, _ in router.route_query(query, rules_a, idx_a, dict(accepts))]
        b = [s for _, s, _ in router.route_query(query, rules_b, idx_b, dict(accepts))]
        print(f"  [{compared + 1}] {a[:1] == b[:1] and 'same' or 'DIFF'} {query[:50]}", flush=True)
        compared += 1
        if a[:1] == b[:1]:
            matched += 1
        else:
            diffs.append((query, exp, a[:1], b[:1]))
    return compared, matched, diffs, skipped


def main():
    live_only = "--live" in sys.argv
    rules_a, idx_a = build_view(VIEW_A)
    rules_b, idx_b = build_view(VIEW_B)
    rows = [(q, e, [], x) for q, e, x in live_probe.GOLDEN]
    if not live_only:
        rows += [(q, e, a, x) for q, e, a, x in blind_eval_100.GOLDEN]
    out = {"views": {"A": VIEW_A, "B": VIEW_B,
                     "n_a": len(idx_a), "n_b": len(idx_b),
                     "shared": len(set(idx_a) & set(idx_b))},
           "variants": {}}
    ok = True
    for vname, accepts in (("no-accepts", {}), ("accepts-probe", ACCEPTS_PROBE)):
        compared, matched, diffs, skipped = agree(rows, rules_a, idx_a, rules_b, idx_b, accepts)
        out["variants"][vname] = {
            "compared": compared, "matched": matched,
            "agreement": round(matched / compared, 3) if compared else 0.0,
            "skipped": skipped,
            "diffs": [{"q": q, "exp": e, "A": a, "B": b} for q, e, a, b in diffs]}
        if diffs:
            ok = False
    date = datetime.now().date().isoformat()
    path = os.path.join(_ROOT, "reports", f"oneindex-{date}.md")
    os.makedirs(os.path.dirname(path), exist_ok=True)
    L = [f"# One-index check — {date}", "",
         f"views: A `{VIEW_A}` ({out['views']['n_a']}) vs B `{VIEW_B}` ({out['views']['n_b']}), "
         f"shared {out['views']['shared']}", ""]
    for vname, v in out["variants"].items():
        L.append(f"## {vname}: {v['matched']}/{v['compared']} agree "
                 f"({v['agreement']:.1%}), skipped {v['skipped']}")
        for d in v["diffs"][:20]:
            L.append(f"- `{d['q'][:60]}` exp={d['exp']} A={d['A']} B={d['B']}")
        if len(v["diffs"]) > 20:
            L.append(f"- ... +{len(v['diffs']) - 20} more")
        L.append("")
    with open(path, "w", encoding="utf-8") as f:
        f.write("\n".join(L))
    print("\n".join(L[:8]))
    print(("AGREE" if ok else "DIVERGED") + f" — wrote {path}")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
