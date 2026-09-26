#!/usr/bin/env python3
"""G62 skill linter: frontmatter / freshness / collisions over all indexed skills.

Reads index_dirs from skill-rules.json, scans every <dir>/<name>/SKILL.md
(keeping every copy, so cross-dir shadowing shows as collisions).
  ERRORS (exit 1): missing/unclosed frontmatter, missing name, missing
    description, name != directory name.
  WARNINGS (exit 0): stale mtime (>365d), short description (<40 chars),
    name shadowed in 2+ dirs (first dir wins at index time).
Writes reports/lint-YYYY-MM-DD.md and prints the summary.
Usage (repo root):  python3 scripts/lint_skills.py
Stdlib only.
"""
import json
import os
import sys
from datetime import datetime

_HERE = os.path.dirname(os.path.abspath(__file__))
_ROOT = os.path.normpath(os.path.join(_HERE, ".."))
_RULES = os.path.join(_ROOT, "skill-rules.json")
STALE_DAYS = 365

def parse_frontmatter(text):
    """Return (fields dict, error or None). Minimal --- parser, no yaml needed."""
    lines = text.splitlines()
    if not lines or lines[0].strip() != "---":
        return {}, "missing-frontmatter"
    fields, key, buf = {}, None, []
    for line in lines[1:40]:
        if line.strip() == "---":
            break
        if line[:1] in (" ", "\t") and key:
            buf.append(line.strip())
            continue
        if key:
            fields[key] = " ".join(buf).strip()
        if ":" in line:
            key, _, val = line.partition(":")
            key, buf = key.strip(), [val.strip()] if val.strip() else []
        else:
            key = None
            buf = []
    else:
        return fields, "unclosed-frontmatter"
    if key:
        fields[key] = " ".join(buf).strip()
    return fields, None

def lint():
    with open(_RULES, encoding="utf-8") as f:
        rules = json.load(f)
    errors, warnings, total, oldest = [], [], 0, []
    seen = {}
    now = datetime.now().timestamp()
    for d in rules.get("index_dirs", []):
        d = os.path.expanduser(d)
        if not os.path.isdir(d):
            continue
        for name in sorted(os.listdir(d)):
            md = os.path.join(d, name, "SKILL.md")
            if not os.path.isfile(md):
                continue
            total += 1
            seen.setdefault(name, []).append(md)
            try:
                with open(md, encoding="utf-8", errors="replace") as f:
                    head = f.read(8000)
            except OSError as e:
                errors.append((md, f"unreadable: {e}"))
                continue
            fields, err = parse_frontmatter(head)
            if err:
                errors.append((md, err))
                continue
            if not fields.get("name"):
                errors.append((md, "missing-name"))
            elif fields["name"] != name:
                errors.append((md, f"name-mismatch: frontmatter {fields['name']!r} != dir {name!r}"))
            desc = fields.get("description", "")
            if not desc:
                errors.append((md, "missing-description"))
            elif len(desc) < 40:
                warnings.append((md, f"short-description ({len(desc)} chars)"))
            try:
                age = (now - os.path.getmtime(md)) / 86400
            except OSError:
                age = -1
            oldest.append((age, md))
            if age > STALE_DAYS:
                warnings.append((md, f"stale ({int(age)}d since mtime)"))
    collisions = {k: v for k, v in seen.items() if len(v) > 1}
    unique = len(seen)
    for name, paths in sorted(collisions.items()):
        warnings.append((name, f"shadowed x{len(paths)}: first wins: {paths[0]}"))
    return {"total": total, "unique": unique, "errors": errors, "warnings": warnings,
            "collisions": collisions, "oldest": oldest}


# Backlog #2 ritual: every new trigger batch must survive adversarial probes
# (trigger word + unrelated domain). A TOP-1 carried ONLY by generic words
# (df>=3, no distinctive anchor) = hijack class (cf. bare-car → 3d-web).
_ADV_DOMAINS = ("postgres database server", "email inbox login",
                "loan interest calculator", "rotate log files daily",
                "standup meeting notes")

def _load_router():
    import importlib.util
    rp = os.path.join(_ROOT, "src", "steroids", "router.py")
    spec = importlib.util.spec_from_file_location("steroids_router_lint", rp)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod

def neg_check(skills=None):
    """Return [(skill, trigger, query, top3)] hijack rows. Empty = clean."""
    with open(_RULES, encoding="utf-8") as f:
        rules = json.load(f)
    rt = _load_router()
    idx = rt.get_index(rules)
    over = rules.get("skills", {})
    names = skills or sorted(over)
    # document frequency over the live index: triggers owned by >=3 skills
    # are generic words that must never carry a top-1 alone.
    df = {}
    for keys in idx.values():
        for k in set(keys):
            df[k] = df.get(k, 0) + 1
    rows = []
    for name in names:
        trigs = over.get(name, [])
        if name not in idx:
            continue
        for t in trigs:
            for d in _ADV_DOMAINS:
                q = f"{t} {d}"
                top = rt.route_query(q, rules, idx)[:3]
                if not top or top[0][1] != name:
                    continue
                hits = top[0][2]
                if hits and all(df.get(h, 99) >= 3 for h in hits):
                    rows.append((name, t, q, [sk for _, sk, _ in top]))
                    break
    return rows

def main():
    if "--neg-check" in sys.argv:
        names = [a for a in sys.argv[1:] if not a.startswith("-")] or None
        rows = neg_check(names)
        print(f"neg-check skills={names or 'ALL-overrides'} hijacks={len(rows)}")
        for name, t, q, top3 in rows[:30]:
            print(f"  HIJACK {name} via {t!r} on {q!r} top3={top3}")
        return 1 if rows else 0
    r = lint()
    date = datetime.now().date().isoformat()
    out_dir = os.path.join(_ROOT, "reports")
    os.makedirs(out_dir, exist_ok=True)
    path = os.path.join(out_dir, f"lint-{date}.md")
    L = [f"# Skill lint — {date}", "",
         f"skills scanned: {r['total']} files / {r['unique']} unique  errors: {len(r['errors'])}  "
         f"warnings: {len(r['warnings'])}  collisions: {len(r['collisions'])}", "",
         "## errors"]
    L += [f"- `{m}` — {e}" for m, e in r["errors"]] or ["- none"]
    L += ["", "## warnings (first 40)"]
    L += [f"- `{m}` — {w}" for m, w in r["warnings"][:40]] or ["- none"]
    if len(r["warnings"]) > 40:
        L.append(f"- ... +{len(r['warnings']) - 40} more")
    L += ["", "## oldest files (top 10)"]
    for age, m in sorted(r["oldest"], reverse=True)[:10]:
        L.append(f"- {int(age)}d `{m}`")
    with open(path, "w", encoding="utf-8") as f:
        f.write("\n".join(L) + "\n")
    print("\n".join(L[:8]))
    print(f"... wrote {path}")
    return 1 if r["errors"] else 0


if __name__ == "__main__":
    sys.exit(main())
