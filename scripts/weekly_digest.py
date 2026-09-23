#!/usr/bin/env python3
"""I89 weekly digest: new/better skills for your stack, first digest generated.

New = in live index but absent from reports/index-snapshot.json (last
reindex). Better-for-stack = stack_tour brief for the given stack.
Writes reports/digest-YYYY-MM-DD-<stack>.md.
Usage:  python3 scripts/weekly_digest.py flutter
Stdlib only.
"""
import importlib.util
import json
import os
import sys
from datetime import datetime

_HERE = os.path.dirname(os.path.abspath(__file__))
_ROOT = os.path.normpath(os.path.join(_HERE, ".."))
sys.path.insert(0, _HERE)
import stack_tour

_SNAP = os.path.join(_ROOT, "reports", "index-snapshot.json")


def new_since_snapshot(idx_names, snap_path=_SNAP):
    try:
        old = json.load(open(snap_path, encoding="utf-8"))
    except (OSError, ValueError):
        old = {}
    return sorted(set(idx_names) - set(old))


def main(stack):
    with open(os.path.join(_ROOT, "skill-rules.json"), encoding="utf-8") as f:
        rules = json.load(f)
    files = stack_tour.router.skill_files(rules.get("index_dirs", []))
    brief = stack_tour.brief_for_stack(stack, files)
    idx_names = [s for _, md in files for s in [os.path.basename(os.path.dirname(md))]]
    new = new_since_snapshot(idx_names)
    date = datetime.now().date().isoformat()
    path = os.path.join(_ROOT, "reports", f"digest-{date}-{stack}.md")
    L = [f"# Weekly digest: {stack} — {date}", "",
         f"## new since last snapshot ({len(new)})"]
    L += [f"- {s}" for s in new[:20]] or ["- none"]
    if len(new) > 20:
        L.append(f"- ... +{len(new) - 20} more")
    L += ["", f"## top for your stack ({len(brief)})"]
    for b in brief:
        L.append(f"- {b['skill']}: {', '.join(b['why'])}")
    with open(path, "w", encoding="utf-8") as f:
        f.write("\n".join(L) + "\n")
    print(f"new={len(new)} top={len(brief)}")
    print(f"wrote {path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1] if len(sys.argv) > 1 else "flutter"))
