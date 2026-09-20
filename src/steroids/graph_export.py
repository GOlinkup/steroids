#!/usr/bin/env python3
"""Skill-graph export: nodes + links JSON built from the live skill index. Stdlib only."""
import json
import os
import sys

TOP_K = 8
MIN_SHARED = 2
MAX_DEGREE = 6


def build_graph(idx, top_k=TOP_K, min_shared=MIN_SHARED, max_degree=MAX_DEGREE):
    names = sorted(idx)
    kw = {n: idx[n][:top_k] for n in names}
    sets = {n: set(kw[n]) for n in names}
    cand = []
    for i, a in enumerate(names):
        for b in names[i + 1:]:
            shared = sets[a] & sets[b]
            if len(shared) >= min_shared:
                cand.append((len(shared), a, b))
    cand.sort(key=lambda t: (-t[0], t[1], t[2]))
    deg = {n: 0 for n in names}
    links = []
    for w, a, b in cand:
        if deg[a] < max_degree and deg[b] < max_degree:
            deg[a] += 1
            deg[b] += 1
            links.append({"source": a, "target": b, "weight": w})
    nodes = [{"id": n, "keywords": kw[n], "degree": deg[n]} for n in names]
    return {"nodes": nodes, "links": links, "meta": {"count": len(nodes)}}


def default_out():
    root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    return os.path.join(root, "demo", "skill-graph.json")


def main(out=None):
    # ponytail: lazy import — build_graph stays importable anywhere (repo, binary dir).
    try:
        from steroids.router import get_index, load_rules
    except ImportError:
        sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
        from router import get_index, load_rules
    out = out or (sys.argv[1] if len(sys.argv) > 1 else default_out())
    g = build_graph(get_index(load_rules()))
    d = os.path.dirname(out)
    if d:
        os.makedirs(d, exist_ok=True)
    with open(out, "w", encoding="utf-8") as f:
        json.dump(g, f)
    print(f"{out}: {len(g['nodes'])} nodes, {len(g['links'])} links")
    return out


if __name__ == "__main__":
    main()
