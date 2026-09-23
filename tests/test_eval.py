"""Routing eval harness: GOLDEN (query, must_include, must_exclude) pairs.

Uses a small synthetic idx built from skill-rules.json overrides +
skill-name tokens (no live 366-skill index needed). Scores precision@1
and precision@3. Run: python3 tests/test_eval.py
"""
import importlib.util
import json
import os
import unittest

_HERE = os.path.dirname(os.path.abspath(__file__))
_ROUTER_PATH = os.path.normpath(os.path.join(_HERE, "..", "src", "steroids", "router.py"))
_RULES_PATH = os.path.normpath(os.path.join(_HERE, "..", "skill-rules.json"))

_spec = importlib.util.spec_from_file_location("steroids_router_eval", _ROUTER_PATH)
router = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(router)

RULES = {"glue": ["onto", "main", "file", "files", "folder", "folders", "repo", "code", "thing", "stuff"],
         "max_recommendations": 3}

# Distractors mirroring live-index head-token leakage (generic words like
# mobile/app that would false-positive without the NEG guard).
# Leakage-level overlap only: a distractor sharing ALL core keywords of a
# real skill is unfaithful (no live skill looks like that — git-helper
# exists nowhere but here; 35d4583 alphabetical tie-break hands perfect
# clones top-1). One shared head token each is the honest simulation.
_NOISE = {
    "homelab-wireguard-vpn": ["mobile", "app"],
    "homelab-network-setup": ["mobile", "app"],
    "homelab-vlan-segmentation": ["mobile", "app"],
    "homelab-pihole-dns": ["mobile", "app"],
    "git-helper": ["merge"],
}


def load_skill_overrides():
    try:
        with open(_RULES_PATH, encoding="utf-8") as f:
            return json.load(f).get("skills", {})
    except Exception:
        return {
            "design-system": ["tokens", "palette", "typography", "spacing", "audit"],
            "frontend-patterns": ["ui", "layout", "theme", "component"],
            "dart-flutter-patterns": ["flutter", "dart", "widget"],
            "browser-qa": ["screenshot", "visual", "e2e"],
            "frontend-design-direction": ["hero", "landing", "branding"],
            "canvas": ["canvas", "obsidian", "mindmap", "spatial"],
            "code-review": ["review", "pr", "diff", "standards", "spec"],
            "resolving-merge-conflicts": ["merge", "conflict", "rebase"],
            "agy-customizations": ["antigravity", "agy", "customization", "hook", "rule", "plugin"],
            "antigravity-guide": ["antigravity", "agy", "guide", "cli"],
        }


def build_synthetic_idx():
    """Synthetic idx: override keywords (stemmed) + skill-name tokens."""
    idx = {}
    for skill, keywords in load_skill_overrides().items():
        keys = [router.stem(w) for w in keywords]
        keys += [t for t in router.toks(skill.replace("-", " ")) if t not in keys]
        idx[skill] = keys
    for skill, noise in _NOISE.items():
        if skill not in idx:
            keys = router.toks(skill.replace("-", " "))
            keys += [router.stem(w) for w in noise if router.stem(w) not in keys]
            idx[skill] = keys
    return idx


GOLDEN = [
    ("build flutter mobile payments app",
     "dart-flutter-patterns",
     ["homelab-wireguard-vpn", "homelab-network-setup", "homelab-vlan-segmentation", "homelab-pihole-dns"]),
    ("merge conflict rebase resolve branch",
     "resolving-merge-conflicts", []),
    ("audit design system tokens palette typography spacing",
     "design-system", []),
    ("build flutter dart widget screen",
     "dart-flutter-patterns", ["homelab-wireguard-vpn"]),
    ("take screenshot visual e2e check page",
     "browser-qa", []),
    ("review diff standards spec pull request",
     "code-review", []),
    ("hero landing branding page design",
     "frontend-design-direction", []),
    ("layout theme component grid styling",
     "frontend-patterns", []),
    ("canvas obsidian mindmap spatial board",
     "canvas", []),
    ("antigravity agy guide cli setup",
     "antigravity-guide", []),
    ("fix rebase merge conflict markers",
     "resolving-merge-conflicts", []),
    ("flutter mobile app payment build release",
     "dart-flutter-patterns",
     ["homelab-wireguard-vpn", "homelab-network-setup"]),
]


def evaluate():
    """Return [(query, must_include, must_exclude, ranked_names)]."""
    idx = build_synthetic_idx()
    rows = []
    for query, must_include, must_exclude in GOLDEN:
        top = router.route_query(query, RULES, idx)
        rows.append((query, must_include, must_exclude, [s for _, s, _ in top]))
    return rows


def precision_at_k(rows, k):
    hits = sum(1 for _, inc, exc, ranked
               in rows if inc in ranked[:k] and not (set(ranked[:k]) & set(exc)))
    return hits / len(rows) if rows else 0.0


class TestEval(unittest.TestCase):
    def test_each_golden_top1(self):
        for query, must_include, must_exclude, ranked in evaluate():
            with self.subTest(query=query):
                self.assertTrue(ranked, f"no results for {query!r}")
                self.assertEqual(ranked[0], must_include, f"top1 miss for {query!r}: {ranked}")

    def test_no_excluded_in_top3(self):
        for query, _, must_exclude, ranked in evaluate():
            with self.subTest(query=query):
                self.assertFalse(set(ranked[:3]) & set(must_exclude),
                                 f"excluded skill leaked for {query!r}: {ranked}")

    def test_precision_is_perfect(self):
        rows = evaluate()
        self.assertEqual(precision_at_k(rows, 1), 1.0)
        self.assertEqual(precision_at_k(rows, 3), 1.0)


if __name__ == "__main__":
    unittest.main()
