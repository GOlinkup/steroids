"""Stdlib unittest for steroids router; loads router.py directly, no install."""
import importlib.util
import os
import unittest

_ROUTER_PATH = os.path.join(os.path.dirname(__file__), "..", "src", "steroids", "router.py")
_spec = importlib.util.spec_from_file_location("steroids_router_under_test", os.path.normpath(_ROUTER_PATH))
router = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(router)

RULES = {"glue": ["onto", "main", "file", "files", "folder", "folders", "repo", "code", "thing", "stuff"],
         "max_recommendations": 3}


class TestRouter(unittest.TestCase):
    def test_neg_filter_blocks_wireguard_on_mobile_payments(self):
        idx = {
            "homelab-wireguard-vpn": ["flutter", "mobile", "payment"],
            "dart-flutter-patterns": ["flutter", "mobile", "payment"],
        }
        top = router.route_query("flutter mobile payments", RULES, idx)
        names = [s for _, s, _ in top]
        self.assertNotIn("homelab-wireguard-vpn", names)
        self.assertIn("dart-flutter-patterns", names)

    def test_name_bonus_ranks_resolve_conflicts_first(self):
        idx = {
            "resolving-merge-conflicts": ["merge", "conflict", "rebase"],
            "git-helper": ["merge", "conflict", "rebase"],
        }
        top = router.route_query("merge conflict rebase", RULES, idx)
        self.assertTrue(top)
        self.assertEqual(top[0][1], "resolving-merge-conflicts")

    def test_glue_removal_empty_prompt_returns_empty(self):
        idx = {"resolving-merge-conflicts": ["merge", "conflict", "rebase"]}
        self.assertEqual(router.route_query("", RULES, idx), [])
        self.assertEqual(router.route_query("the code thing stuff", RULES, idx), [])

    def test_abstain_on_pure_trigram_noise(self):
        idx = {"resolving-merge-conflicts": ["merge", "conflict", "rebase"]}
        rules = dict(RULES, semantic_weight=1.0)
        self.assertEqual(router.route_query("k8s pod crashloop xyzzy", rules, idx), [])

    def test_short_tech_tokens_kept(self):
        self.assertIn("go", router.toks("go routine leak"))
        self.assertIn("js", router.toks("js bundle size"))
        self.assertIn("s3", router.toks("s3 bucket policy"))
        self.assertIn("db", router.toks("db index slow"))

    def test_synonym_expansion(self):
        self.assertIn("kubernetes", router.toks("k8s pod"))
        self.assertIn("golang", router.toks("go routine"))
        self.assertIn("javascript", router.toks("js bundle"))
        idx = {"kubernetes-pro": ["kubernetes", "pod"], "other": ["zzz"]}
        top = router.route_query("k8s pod", RULES, idx)
        self.assertEqual(top[0][1], "kubernetes-pro")

    def test_typo_fix_single_neighbor(self):
        idx = {"flutter-skill": ["flutter", "app"], "other": ["zzz"]}
        top = router.route_query("fluter app", RULES, idx)
        names = [s for _, s, _ in top]
        self.assertIn("flutter-skill", names)

    def test_typo_fix_ambiguous_skipped(self):
        idx = {"a-skill": ["abc", "abcd"], "b-skill": ["abce", "zzz"]}
        # 'abcx' is ed1 from both abcd and abce -> ambiguous -> no fix, abstain-safe
        top = router.route_query("abcx", dict(RULES, semantic_weight=1.0), idx)
        self.assertEqual(top, [])


if __name__ == "__main__":
    unittest.main()
