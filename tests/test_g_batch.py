"""G-batch (r345): per-story tests. G63 doctor."""
import importlib.util
import os
import sys
import unittest

_HERE = os.path.dirname(os.path.abspath(__file__))
_ROUTER_PATH = os.path.normpath(os.path.join(_HERE, "..", "src", "steroids", "router.py"))

_spec = importlib.util.spec_from_file_location("steroids_router_gbatch", _ROUTER_PATH)
router = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(router)

RULES = {"glue": [], "max_recommendations": 3,
         "neg": {"sx": [["bad"], ["good"]]}}
IDX = {"sx": ["bad", "alpha"], "sy": ["alpha", "beta"], "sz": ["alpha", "gamma"]}


class TestG63Doctor(unittest.TestCase):
    def test_not_indexed(self):
        self.assertEqual(router.diagnose_fire("nope", "alpha", RULES, IDX)["verdict"], "not-indexed")

    def test_no_lexical_hit(self):
        self.assertEqual(router.diagnose_fire("sx", "qqqzzz", RULES, IDX)["verdict"], "no-lexical-hit")

    def test_neg_blocked(self):
        r = router.diagnose_fire("sx", "bad", RULES, IDX)
        self.assertEqual(r["verdict"], "neg-blocked")


class TestG64Dup(unittest.TestCase):
    def test_identical_top(self):
        sys.path.insert(0, os.path.normpath(os.path.join(_HERE, "..", "scripts")))
        import dup_detect
        idx = {"a": ["x", "y"], "b": ["x", "y"], "c": ["z"]}
        top = dup_detect.top_pairs(idx, n=5)
        self.assertEqual(top[0][1:3], ("a", "b"))
        self.assertAlmostEqual(top[0][0], 1.0)


class TestG65Pins(unittest.TestCase):
    RULES = {"pins": {"/repo": ["a"], "/repo/sub": ["b", "c"]}}

    def test_longest_prefix_wins(self):
        self.assertEqual(router.resolve_pins("/repo/sub/deep", self.RULES), ["b", "c"])
        self.assertEqual(router.resolve_pins("/repo/other", self.RULES), ["a"])

    def test_no_match_empty(self):
        self.assertEqual(router.resolve_pins("/elsewhere", self.RULES), [])
        self.assertEqual(router.resolve_pins("/repo-evil", self.RULES), [])


if __name__ == "__main__":
    unittest.main()
