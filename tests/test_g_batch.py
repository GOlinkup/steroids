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


class TestG67Ratings(unittest.TestCase):
    def test_perfect_track_record(self):
        self.assertEqual(router.star_rating(100, 90, 80, 10), 5)

    def test_provisional_cap(self):
        self.assertLessEqual(router.star_rating(2, 2, 2, 0), 3)

    def test_poor_record(self):
        self.assertLessEqual(router.star_rating(100, 10, 1, 9), 2)


if __name__ == "__main__":
    unittest.main()
