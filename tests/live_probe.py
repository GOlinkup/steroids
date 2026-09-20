#!/usr/bin/env python3
"""Live-index probe: ~16 hand-built queries vs the real 366-skill index.

Builds the index in-memory (no cache writes), applies repo
skill-rules.json overrides exactly like router.get_index, runs
router.route_query per GOLDEN pair, prints P@1/P@3 + every miss.

Expectations were fixed blind (domain judgment, no peeking at output).
Run: python3 tests/live_probe.py
"""
import importlib.util
import json
import os

_HERE = os.path.dirname(os.path.abspath(__file__))
_ROUTER_PATH = os.path.normpath(os.path.join(_HERE, "..", "src", "steroids", "router.py"))
_RULES_PATH = os.path.normpath(os.path.join(_HERE, "..", "skill-rules.json"))

_spec = importlib.util.spec_from_file_location("steroids_router_live", _ROUTER_PATH)
router = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(router)

GOLDEN = [
    ("build flutter mobile payments app",
     "dart-flutter-patterns",
     ["homelab-wireguard-vpn", "homelab-network-setup",
      "homelab-vlan-segmentation", "homelab-pihole-dns"]),
    ("merge conflict rebase resolve branch",
     "resolving-merge-conflicts", ["git-workflow"]),
    ("audit design system tokens palette typography spacing",
     "design-system", []),
    ("take screenshot visual e2e check page",
     "browser-qa", ["e2e-testing", "ui-demo"]),
    ("review diff standards spec pull request",
     "code-review", []),
    ("hero landing branding page design",
     "frontend-design-direction", ["design-system"]),
    ("layout theme component grid styling",
     "frontend-patterns", []),
    ("canvas obsidian mindmap spatial board",
     "canvas", ["json-canvas", "obsidian-markdown"]),
    ("antigravity agy guide cli setup",
     "antigravity_guide", ["agy-customizations"]),
    ("wireguard vpn remote access home network tunnel",
     "homelab-wireguard-vpn", ["homelab-network-setup"]),
    ("django celery beat background tasks retries scheduling",
     "django-celery", ["django-patterns"]),
    ("kubernetes probes rbac autoscaling configmap secret",
     "kubernetes-patterns", []),
    ("postgres row level security slow query index",
     "postgres-patterns", ["mysql-patterns"]),
    ("pytest fixtures mocks parametrization coverage tdd",
     "python-testing", ["python-patterns", "tdd-workflow"]),
    ("remotion video captions charts transitions react rendering",
     "remotion-video-creation", ["video-editing", "manim-video"]),
    ("swiftui observable state navigation performance ios",
     "swiftui-patterns", ["swift-concurrency-6-2"]),
]


def build_live_idx():
    """In-memory live index + repo overrides (mirrors get_index, no cache)."""
    with open(_RULES_PATH, encoding="utf-8") as f:
        rules = json.load(f)
    files = router.skill_files(rules.get("index_dirs", []))
    idx, _ = router.build_index(files)
    for skill, extra in rules.get("skills", {}).items():
        if skill in idx:
            es = [router.stem(w) for w in extra]
            idx[skill] = es + [k for k in idx[skill] if k not in es]
    return rules, idx


def main():
    rules, idx = build_live_idx()
    print(f"live skills: {len(idx)}")
    crash = [q for q, exp, _ in GOLDEN if exp not in idx]
    if crash:
        print(f"MISSING FROM INDEX: {crash}")
        return
    print(f"{'query':<46}{'top-1':<30}{'top-3':<70}P@1  P@3")
    print("-" * 158)
    p1 = p3 = leaks = 0
    for query, inc, exc in GOLDEN:
        top = router.route_query(query, rules, idx)
        ranked = [s for _, s, _ in top]
        ok1 = ranked[:1] == [inc]
        ok3 = inc in ranked[:3] and not (set(ranked[:3]) & set(exc))
        p1 += ok1
        p3 += ok3
        leaks += bool(set(ranked[:3]) & set(exc))
        print(f"{query[:45]:<46}{(ranked[0] if ranked else '-'):30}"
              f"{'/'.join(ranked[:3])[:68]:<70}{'ok' if ok1 else 'MISS':<5}"
              f"{'ok' if ok3 else 'MISS'}")
    print("-" * 158)
    print(f"n={len(GOLDEN)}  precision@1={p1/len(GOLDEN):.3f}  "
          f"precision@3={p3/len(GOLDEN):.3f}  exclusion-leaks={leaks}")


if __name__ == "__main__":
    main()
