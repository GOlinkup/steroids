"""J93 self-explaining hints: unit tests (no live index needed)."""
import importlib.util
import os
import unittest

_HERE = os.path.dirname(os.path.abspath(__file__))
_ROUTER_PATH = os.path.normpath(os.path.join(_HERE, "..", "src", "steroids", "router.py"))

_spec = importlib.util.spec_from_file_location("steroids_router_explain", _ROUTER_PATH)
router = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(router)


def _tmp_skills(tmp, files):
    for name, body in files.items():
        d = os.path.join(tmp, name)
        os.makedirs(d, exist_ok=True)
        with open(os.path.join(d, "SKILL.md"), "w", encoding="utf-8") as f:
            f.write(body)
    return tmp


class TestExplain(unittest.TestCase):
    def setUp(self):
        import tempfile
        self.tmp = tempfile.mkdtemp(prefix="explain-")
        _tmp_skills(self.tmp, {
            "ski-a": "ski a skill\n" + "word " * 100,
            "ski-b": "ski b skill\n" + "word " * 20,
        })
        self.rules = {"index_dirs": [self.tmp], "glue": [], "max_recommendations": 3}
        self.idx = {"ski-a": ["alpha", "common"], "ski-b": ["beta", "common"]}

    def test_picks_mirror_route(self):
        top = router.route_query("alpha common", self.rules, self.idx)
        expl = router.explain_route("alpha common", self.rules, self.idx, top)
        self.assertEqual([p["skill"] for p in expl["picks"]], [s for _, s, _ in top])
        for pick, (score, _, hits) in zip(expl["picks"], top):
            self.assertEqual(pick["score"], score)
            self.assertEqual(pick["because"], sorted(hits))
        self.assertEqual(expl["picks"][0]["skill"], "ski-a")
        self.assertIn("alpha", expl["picks"][0]["because"])

    def test_tokens_saved_math(self):
        expl = router.explain_route("alpha", self.rules, self.idx)
        sizes = {}
        for name in ("ski-a", "ski-b"):
            p = os.path.join(self.tmp, name, "SKILL.md")
            sizes[name] = os.path.getsize(p) // 4
        self.assertEqual(expl["index_tokens"], sum(sizes.values()))
        self.assertEqual(expl["picks"][0]["skill_tokens"], sizes["ski-a"])
        self.assertEqual(expl["tokens_saved"], sum(sizes.values()) - sizes["ski-a"])
        self.assertGreaterEqual(expl["tokens_saved"], 0)

    def test_abstain_explains_empty(self):
        expl = router.explain_route("zzzqqq nomatch", self.rules, self.idx)
        self.assertEqual(expl["picks"], [])


if __name__ == "__main__":
    unittest.main()
