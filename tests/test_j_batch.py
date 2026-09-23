"""J-batch (r348): per-story tests. J91 fusion."""
import importlib.util
import os
import sys
import unittest

_HERE = os.path.dirname(os.path.abspath(__file__))
_ROUTER_PATH = os.path.normpath(os.path.join(_HERE, "..", "src", "steroids", "router.py"))

_spec = importlib.util.spec_from_file_location("steroids_router_jbatch", _ROUTER_PATH)
router = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(router)


class TestJ91Fusion(unittest.TestCase):
    def test_fusion_demo(self):
        idx = {"sa": ["alpha", "common"], "sb": ["beta", "common"], "z": ["common"]}
        rules = {"glue": [], "max_recommendations": 3}
        fused = router.fuse_skills("sa", "sb", idx)
        self.assertTrue(fused["ephemeral"])
        self.assertNotIn(fused["name"], idx)
        top = router.route_fused("alpha beta", fused, rules, idx)
        self.assertEqual(top[0][1], "sa+sb")


class TestJ92Dream(unittest.TestCase):
    def test_cache_hit_demo(self):
        idx = {"sa": ["alpha"], "sb": ["beta"]}
        rules = {"glue": [], "max_recommendations": 3}
        cache = router.precompute(["alpha query", "beta query"], rules, idx)
        self.assertEqual(router.dream_route("alpha query", cache),
                         [s for _, s, _ in router.route_query("alpha query", rules, idx)])
        self.assertEqual(cache["beta query"], ["sb"])
        self.assertIsNone(router.dream_route("unseen query", cache))


class TestJ94Counterfactual(unittest.TestCase):
    IDX = {"sa": ["alpha", "common"], "sb": ["beta", "common"], "z": ["common"]}
    RULES = {"glue": [], "max_recommendations": 3}

    def test_winner_removed_flips(self):
        r = router.counterfactual("alpha", "sa", self.RULES, self.IDX)
        self.assertEqual(r["top"], "sa")
        self.assertNotEqual(r["top_without"], "sa")
        self.assertEqual(r["miss"], "sa")

    def test_nonwinner_removed_no_miss(self):
        r = router.counterfactual("alpha", "sb", self.RULES, self.IDX)
        self.assertEqual(r["top"], "sa")
        self.assertIsNone(r["miss"])

    def test_winner_removed_nothing_left(self):
        r = router.counterfactual("alpha", "sa", self.RULES, {"sa": ["alpha"]})
        self.assertEqual(r["miss"], "sa")
        self.assertIsNone(r["top_without"])


class TestJ95Replay(unittest.TestCase):
    def test_find_drifts(self):
        sys.path.insert(0, os.path.normpath(os.path.join(_HERE, "..", "scripts")))
        import bench
        old = {"q1": ["a", "b"], "q2": ["c"]}
        new = {"q1": ["a", "b"], "q2": ["d", "c"]}
        self.assertEqual(bench.find_drifts(old, new), [("q2", "c", "d")])
        self.assertEqual(bench.find_drifts(old, dict(old)), [])


if __name__ == "__main__":
    unittest.main()
