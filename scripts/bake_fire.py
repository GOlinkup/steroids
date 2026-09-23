#!/usr/bin/env python3
"""F55: bake per-skill serve counts for the explorer heatmap.

Reads ~/.config/steroids/served.jsonl (top-1 per row), writes
demo/skill-fire.json {skill: serves}. The page tints hot nodes orange,
cold nodes stay blue. Run: python3 scripts/bake_fire.py. Stdlib only.
"""
import json
import os
from collections import Counter

ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
LOG = os.path.expanduser("~/.config/steroids/served.jsonl")


def bake(log_path=LOG):
    counts = Counter()
    try:
        with open(log_path, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                skills = [x for x in json.loads(line).get("skills", "").split("/") if x]
                if skills:
                    counts[skills[0]] += 1
    except OSError:
        pass
    return dict(counts)


def main():
    counts = bake()
    path = os.path.join(ROOT, "demo", "skill-fire.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(counts, f, indent=0)
        f.write("\n")
    top = sorted(counts.items(), key=lambda kv: -kv[1])[:5]
    print(f"skills={len(counts)} serves={sum(counts.values())} top={top}")
    print(f"wrote {path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
