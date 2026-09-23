#!/usr/bin/env python3
"""F60 stack tour: new-user top-skills brief per stack.

Matches stack keywords against the live index, writes
reports/stack-<stack>.md (top 8 skills + one-line why each).
Usage:  python3 scripts/stack_tour.py flutter django
Stdlib only (router reused for index + desc extraction, no routing change).
"""
import importlib.util
import json
import os
import sys

_HERE = os.path.dirname(os.path.abspath(__file__))
_ROOT = os.path.normpath(os.path.join(_HERE, ".."))
_ROUTER = os.path.join(_ROOT, "src", "steroids", "router.py")
_RULES = os.path.join(_ROOT, "skill-rules.json")

_spec = importlib.util.spec_from_file_location("steroids_router_tour", _ROUTER)
router = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(router)


def brief_for_stack(stack, files, top_n=8):
    want = set(router.toks(stack)) | {stack.lower()}
    idx, _ = router.build_index(files)
    scored = []
    for skill, keys in idx.items():
        hits = sorted(set(keys) & want)
        if hits:
            scored.append((len(hits), skill, hits))
    scored.sort(key=lambda t: (-t[0], t[1]))
    brief = []
    descs = {}
    for _, skill, _ in scored:
        for sname, md in files:
            if sname == skill and sname not in descs:
                try:
                    with open(md, encoding="utf-8", errors="replace") as f:
                        descs[sname] = router.extract_desc(f.read(8000))
                except OSError:
                    descs[sname] = ""
                break
    for n, skill, hits in scored[:top_n]:
        d = (descs.get(skill) or "")[:140]
        brief.append({"skill": skill, "why": hits, "desc": d})
    return brief


def main(stacks):
    with open(_RULES, encoding="utf-8") as f:
        rules = json.load(f)
    files = router.skill_files(rules.get("index_dirs", []))
    for stack in stacks:
        brief = brief_for_stack(stack, files)
        path = os.path.join(_ROOT, "reports", f"stack-{stack}.md")
        L = [f"# Stack tour: {stack}", "",
             f"_Top {len(brief)} skills for {stack} newcomers (keyword match vs live index)_", ""]
        for b in brief:
            L.append(f"## {b['skill']}")
            L.append(f"because: {', '.join(b['why'])}")
            if b["desc"]:
                L.append(b["desc"])
            L.append("")
        with open(path, "w", encoding="utf-8") as f:
            f.write("\n".join(L))
        print(f"{stack}: {len(brief)} skills -> {path}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:] or ["flutter"]))
