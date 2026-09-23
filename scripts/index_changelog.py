#!/usr/bin/env python3
"""G69 auto-changelog: index-diff digest generated from the last reindex.

Snapshots {skill: sorted keywords} to reports/index-snapshot.json, diffs
against the previous snapshot, writes reports/changelog-YYYY-MM-DD.md.
First run establishes the baseline (empty diff, stated as such).
Usage (repo root):  python3 scripts/index_changelog.py
Stdlib only.
"""
import importlib.util
import json
import os
from datetime import datetime

_HERE = os.path.dirname(os.path.abspath(__file__))
_ROOT = os.path.normpath(os.path.join(_HERE, ".."))
_ROUTER = os.path.join(_ROOT, "src", "steroids", "router.py")
_RULES = os.path.join(_ROOT, "skill-rules.json")
_SNAP = os.path.join(_ROOT, "reports", "index-snapshot.json")

_spec = importlib.util.spec_from_file_location("steroids_router_changelog", _ROUTER)
router = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(router)


def snapshot():
    with open(_RULES, encoding="utf-8") as f:
        rules = json.load(f)
    files = router.skill_files(rules.get("index_dirs", []))
    idx, _ = router.build_index(files)
    return {s: sorted(set(keys)) for s, keys in idx.items()}


def diff(old, new):
    added = sorted(set(new) - set(old))
    removed = sorted(set(old) - set(new))
    changed = sorted(s for s in set(old) & set(new) if old[s] != new[s])
    return added, removed, changed


def main():
    new = snapshot()
    old = {}
    if os.path.isfile(_SNAP):
        with open(_SNAP, encoding="utf-8") as f:
            old = json.load(f)
    first = not old
    added, removed, changed = diff(old, new)
    with open(_SNAP, "w", encoding="utf-8") as f:
        json.dump(new, f, indent=0)
        f.write("\n")
    date = datetime.now().date().isoformat()
    path = os.path.join(_ROOT, "reports", f"changelog-{date}.md")
    L = [f"# Index changelog — {date}", "",
         f"skills: {len(old) if old else 0} -> {len(new)}" if old else f"baseline established: {len(new)} skills (first snapshot, empty diff by definition)", ""]
    if not first:
        L.append(f"added ({len(added)}): {', '.join(added[:20])}" + ("" if len(added) <= 20 else f" +{len(added) - 20} more"))
        L.append(f"removed ({len(removed)}): {', '.join(removed[:20])}" + ("" if len(removed) <= 20 else f" +{len(removed) - 20} more"))
        L.append(f"keywords changed ({len(changed)}): {', '.join(changed[:20])}" + ("" if len(changed) <= 20 else f" +{len(changed) - 20} more"))
    with open(path, "w", encoding="utf-8") as f:
        f.write("\n".join(L) + "\n")
    print("\n".join(L[:4]))
    print(f"wrote {path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
