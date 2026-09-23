#!/usr/bin/env python3
"""G64 duplicate detector: keyword-set Jaccard over the live index.

Lists top-10 overlap pairs as merge-proposal input, commits
reports/dup-pairs-YYYY-MM-DD.md. Overlap tokens shown per pair so a human
can judge merge vs coincidence.
Usage (repo root):  python3 scripts/dup_detect.py
Stdlib only.
"""
import importlib.util
import itertools
import json
import os
import sys
from datetime import datetime

_HERE = os.path.dirname(os.path.abspath(__file__))
_ROOT = os.path.normpath(os.path.join(_HERE, ".."))
_ROUTER = os.path.join(_ROOT, "src", "steroids", "router.py")
_RULES = os.path.join(_ROOT, "skill-rules.json")

_spec = importlib.util.spec_from_file_location("steroids_router_dup", _ROUTER)
router = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(router)


def top_pairs(idx, n=10):
    scored = []
    names = sorted(idx)
    for a, b in itertools.combinations(names, 2):
        sa, sb = set(idx[a]), set(idx[b])
        if not sa or not sb:
            continue
        inter = sa & sb
        if not inter:
            continue
        scored.append((len(inter) / len(sa | sb), a, b, sorted(inter)))
    scored.sort(key=lambda t: (-t[0], t[1], t[2]))
    return scored[:n]


def main():
    with open(_RULES, encoding="utf-8") as f:
        rules = json.load(f)
    files = router.skill_files(rules.get("index_dirs", []))
    idx, _ = router.build_index(files)
    pairs = top_pairs(idx)
    date = datetime.now().date().isoformat()
    path = os.path.join(_ROOT, "reports", f"dup-pairs-{date}.md")
    L = [f"# Duplicate candidates — {date}", "",
         f"_Top {len(pairs)} keyword-overlap (Jaccard) pairs over {len(idx)} skills — merge proposals, human decides._", ""]
    for score, a, b, inter in pairs:
        L.append(f"## {score:.2f} `{a}` × `{b}`")
        L.append(f"overlap: {', '.join(inter)}")
        L.append("")
    with open(path, "w", encoding="utf-8") as f:
        f.write("\n".join(L))
    for score, a, b, _ in pairs[:10]:
        print(f"{score:.2f} {a} x {b}")
    print(f"wrote {path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
