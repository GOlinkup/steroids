#!/usr/bin/env python3
"""r356 install preflight: detect HOME-without-skills/model before install runs.

- Zero resolvable skills under $HOME -> REFUSE (exit 1): an install there
  would deploy an empty index.
- Missing embed model files -> WARN (exit 0): install proceeds in degraded
  lexical-only mode (measured blind P@1 drop), loudly.
Usage:  python3 scripts/preflight_check.py [--home DIR]
Stdlib only. Paths take an explicit home (no environ mutation).
"""
import json
import os
import sys

MODEL_FILES = ("model_quantized.onnx", "vocab.txt")


def expand(home, path):
    if path == "~":
        return home
    if path.startswith("~/"):
        return os.path.join(home, path[2:])
    return path


def preflight(home, rules):
    skills = 0
    for d in rules.get("index_dirs", []):
        if d.startswith("./"):
            continue
        top = expand(home, d)
        if not os.path.isdir(top):
            continue
        for name in os.listdir(top):
            if os.path.isfile(os.path.join(top, name, "SKILL.md")):
                skills += 1
    emb = os.path.join(home, ".cache", "steroids", "embed")
    model = all(os.path.isfile(os.path.join(emb, f)) for f in MODEL_FILES)
    warnings = []
    if not model:
        warnings.append(f"embed model absent under {emb} — lexical-only mode (precision degrades)")
    verdict = "refuse" if skills == 0 else "go"
    if skills == 0:
        warnings.append(f"no skills resolvable under {home} — refusing install")
    return {"skills": skills, "model": model, "verdict": verdict, "warnings": warnings}


def main(argv):
    home = os.path.expanduser("~")
    if "--home" in argv:
        home = argv[argv.index("--home") + 1]
    with open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "skill-rules.json"),
              encoding="utf-8") as f:
        rules = json.load(f)
    r = preflight(home, rules)
    print(f"skills={r['skills']} model={'yes' if r['model'] else 'no'} verdict={r['verdict']}")
    for w in r["warnings"]:
        print(f"warn: {w}")
    return 0 if r["verdict"] == "go" else 1


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
