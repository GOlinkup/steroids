"""J-batch (r348): per-story tests. J91 fusion."""
import importlib.util
import os
import sys
import unittest

_HERE = os.path.dirname(os.path.abspath(__file__))
_ROUTER_PATH = os.path.normpath(os.path.join(_HERE, "..", "src", "steroids", "router.py"))
_RULES_PATH = os.path.normpath(os.path.join(_HERE, "..", "skill-rules.json"))

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


class TestJ96MetaLoop(unittest.TestCase):
    def test_improve_routing_routes_inward(self):
        import json as _json
        with open(_RULES_PATH, encoding="utf-8") as _f:
            _rules = _json.load(_f)
        _files = router.skill_files(_rules.get("index_dirs", []))
        _idx, _ = router.build_index(_files)
        for _skill, _extra in _rules.get("skills", {}).items():
            if _skill in _idx:
                _es = [router.stem(w) for w in _extra]
                _idx[_skill] = _es + [k for k in _idx[_skill] if k not in _es]
        top = router.route_query("improve routing", _rules, _idx)
        self.assertEqual(top[0][1], "steroids")


class TestR356Preflight(unittest.TestCase):
    def test_refuse_empty_home(self):
        sys.path.insert(0, os.path.normpath(os.path.join(_HERE, "..", "scripts")))
        import preflight_check
        import tempfile
        d = tempfile.mkdtemp()
        r = preflight_check.preflight(d, {"index_dirs": ["~/.agents/skills"]})
        self.assertEqual(r["verdict"], "refuse")
        self.assertEqual(r["skills"], 0)

    def test_go_and_model_warn(self):
        sys.path.insert(0, os.path.normpath(os.path.join(_HERE, "..", "scripts")))
        import preflight_check
        import tempfile
        d = tempfile.mkdtemp()
        sd = os.path.join(d, ".agents", "skills", "sa")
        os.makedirs(sd)
        open(os.path.join(sd, "SKILL.md"), "w").write("# x\n")
        r = preflight_check.preflight(d, {"index_dirs": ["~/.agents/skills"]})
        self.assertEqual(r["verdict"], "go")
        self.assertEqual(r["skills"], 1)
        self.assertFalse(r["model"])
        self.assertTrue(r["warnings"])


class TestD34Rotation(unittest.TestCase):
    def test_round_robin(self):
        sys.path.insert(0, os.path.normpath(os.path.join(_HERE, "..", "scripts")))
        import rotate_goldens
        files = ["a", "b", "c"]
        seen = {rotate_goldens.rotation(k, files)[0] for k in range(6)}
        self.assertEqual(seen, {"a", "b", "c"})
        held, active = rotate_goldens.rotation(0, files)
        self.assertEqual(held, "a")
        self.assertEqual(active, ["b", "c"])


class TestD36Misses(unittest.TestCase):
    def test_proposals(self):
        sys.path.insert(0, os.path.normpath(os.path.join(_HERE, "..", "scripts")))
        import mine_misses
        rows = mine_misses.propose_goldens([{"trigs": ["a", "b"], "count": 3}])
        self.assertEqual(rows, [{"query": "a b", "expected": "TBD (human assigns)", "count": 3}])
        self.assertEqual(mine_misses.propose_goldens([]), [])


class TestD37Votes(unittest.TestCase):
    def test_end_to_end_vote_flow(self):
        import tempfile
        p = os.path.join(tempfile.mkdtemp(), "votes.jsonl")
        for _ in range(10):
            router.record_vote("sa", True, p)
        router.record_vote("sb", False, p)
        accepts = router.load_votes(p)
        self.assertEqual(accepts, {"sa": 10})
        idx = {"sa": ["alpha"], "sb": ["alpha", "beta"],
               "sc": ["beta"], "sd": ["beta"]}
        rules = {"glue": [], "max_recommendations": 3}
        plain = [s for _, s, _ in router.route_query("alpha beta", rules, idx)]
        voted = [s for _, s, _ in router.route_query("alpha beta", rules, idx, dict(accepts))]
        self.assertEqual(plain[0], "sb")
        self.assertEqual(voted[0], "sa")


if __name__ == "__main__":
    unittest.main()
