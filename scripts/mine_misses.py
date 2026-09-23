#!/usr/bin/env python3
"""D36 miss mining: abstention clusters -> proposed goldens.

Runs propose() on the live served log (clusters of >=2 unmet queries by
trigger set), then emits one PROPOSED golden row per cluster: the query is
rebuilt from trigger tokens, expected is TBD for a human (same gate as
G61 generation — the machine proposes, humans dispose).
Writes reports/miss-goldens-YYYY-MM-DD.md.
Usage:  python3 scripts/mine_misses.py
Stdlib only.
"""
import importlib.util
import os
from datetime import datetime

_HERE = os.path.dirname(os.path.abspath(__file__))
_ROOT = os.path.normpath(os.path.join(_HERE, ".."))
_ROUTER = os.path.join(_ROOT, "src", "steroids", "router.py")

_spec = importlib.util.spec_from_file_location("steroids_router_misses", _ROUTER)
router = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(router)


def propose_goldens(clusters):
    """Cluster dicts -> proposed golden rows (query from trigs, expected TBD)."""
    rows = []
    for c in clusters:
        trigs = c.get("trigs", [])
        rows.append({"query": " ".join(trigs), "expected": "TBD (human assigns)",
                     "count": c.get("count", 0)})
    return rows


def main():
    clusters = router.propose()
    rows = propose_goldens(clusters)
    date = datetime.now().date().isoformat()
    path = os.path.join(_ROOT, "reports", f"miss-goldens-{date}.md")
    L = [f"# Miss-mined golden proposals — {date}", "",
         f"_From {len(clusters)} abstention clusters in the live served log. "
         "Expected skill is TBD: a human assigns it (G61 gate)._", ""]
    for r in rows:
        L.append(f"- `{r['query']}` -> {r['expected']} (x{r['count']})")
    if not rows:
        L.append("- none (no repeated abstentions — log is clean)")
    with open(path, "w", encoding="utf-8") as f:
        f.write("\n".join(L) + "\n")
    print(f"clusters={len(clusters)} proposals={len(rows)}")
    print(f"wrote {path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
