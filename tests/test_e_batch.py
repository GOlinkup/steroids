"""E-batch (r343): per-story tests. E41 dispatcher."""
import importlib.util
import os
import unittest

_HERE = os.path.dirname(os.path.abspath(__file__))
_ROUTER_PATH = os.path.normpath(os.path.join(_HERE, "..", "src", "steroids", "router.py"))
_RULES_PATH = os.path.normpath(os.path.join(_HERE, "..", "skill-rules.json"))

_spec = importlib.util.spec_from_file_location("steroids_router_ebatch", _ROUTER_PATH)
router = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(router)

import json
with open(_RULES_PATH, encoding="utf-8") as _f:
    RULES = json.load(_f)
FILES = router.skill_files(RULES.get("index_dirs", []))
IDX, _ = router.build_index(FILES)
for _skill, _extra in RULES.get("skills", {}).items():
    if _skill in IDX:
        _es = [router.stem(w) for w in _extra]
        IDX[_skill] = _es + [k for k in IDX[_skill] if k not in _es]


class TestE41Dispatch(unittest.TestCase):
    def test_demo_task_two_subtasks(self):
        plan = router.dispatch_task("fix merge conflict markers then write pytest tests with mocks", RULES, IDX)
        self.assertEqual(len(plan), 2)
        for row in plan:
            self.assertTrue(row["subtask"])
            self.assertIsNotNone(row["top"])
            self.assertTrue(row["skills"])

    def test_single_task_no_split(self):
        plan = router.dispatch_task("review my PR", RULES, IDX)
        self.assertEqual(len(plan), 1)



class TestE42Pinned(unittest.TestCase):
    def test_pinned_survives_no_hit(self):
        top = router.pinned_route("fix merge conflict markers", "canvas", RULES, IDX)
        self.assertIn("canvas", [s for _, s, _ in top])
        self.assertLessEqual(len(top), 3)

    def test_pinned_hit_keeps_real_score(self):
        top = router.pinned_route("lay my notes out on a visual canvas", "canvas", RULES, IDX)
        row = next(r for r in top if r[1] == "canvas")
        self.assertTrue(row[2])
        self.assertGreater(row[0], 0.0)


class TestE43Council(unittest.TestCase):
    def test_hard_call_demo(self):
        c = router.council("post this announcement to X and linkedin without duplicate text", RULES, IDX)
        self.assertGreaterEqual(len(c["debate"]), 2)
        self.assertIn(c["verdict"], [d["skill"] for d in c["debate"]])
        for d in c["debate"]:
            self.assertTrue(d["evidence"])

    def test_verdict_deterministic(self):
        q = "my django ORM does a hundred queries per page, fix it"
        self.assertEqual(router.council(q, RULES, IDX)["verdict"],
                         router.council(q, RULES, IDX)["verdict"])


class TestE44Handoff(unittest.TestCase):
    def test_go_chain(self):
        idx = {"sa": ["repo", "url"], "sb": ["other"]}
        needs = {"sb": ["repo URL"]}
        r = router.validate_handoff("sa", "sb", idx, needs)
        self.assertEqual(r["verdict"], "go")
        self.assertEqual(r["missing"], [])

    def test_blocked_chain(self):
        idx = {"sa": ["repo"], "sb": ["other"]}
        needs = {"sb": ["api key"]}
        r = router.validate_handoff("sa", "sb", idx, needs)
        self.assertEqual(r["verdict"], "blocked")
        self.assertTrue(r["missing"])

    def test_live_schema(self):
        needs = router.get_needs(RULES)
        r = router.validate_handoff("deep-research", "autoresearch", IDX, needs)
        self.assertEqual(set(r), {"a", "b", "b_needs", "covered", "missing", "verdict"})
        self.assertIn(r["verdict"], ("go", "blocked"))


class TestE45Wallet(unittest.TestCase):
    def test_cap_enforced(self):
        w = router.SkillWallet()
        self.assertTrue(w.load("a"))
        self.assertTrue(w.load("b"))
        self.assertFalse(w.load("c"))
        self.assertEqual(w.skills, ["a", "b"])

    def test_drop_frees_and_dup_ok(self):
        w = router.SkillWallet()
        w.load("a")
        self.assertTrue(w.load("a"))
        self.assertTrue(w.drop("a"))
        self.assertFalse(w.drop("a"))
        self.assertTrue(w.load("b"))


class TestE47Sandbox(unittest.TestCase):
    def test_untrusted_demo(self):
        rules = dict(RULES)
        rules["sandbox"] = ["evil-x"]
        p = router.sandbox_policy("evil-x", rules)
        self.assertTrue(p["sandboxed"])
        self.assertEqual(p["tools"], ["read"])

    def test_trusted_full(self):
        p = router.sandbox_policy("code-review", RULES)
        self.assertFalse(p["sandboxed"])
        self.assertIn("exec", p["tools"])


class TestE48Budget(unittest.TestCase):
    def test_cap_triggers(self):
        b = router.TokenBudget({"hog": 100})
        self.assertTrue(b.spend("hog", 60))
        self.assertFalse(b.spend("hog", 50))
        self.assertEqual(b.spent["hog"], 60)
        self.assertEqual(b.remaining("hog"), 40)

    def test_uncapped_always(self):
        b = router.TokenBudget()
        self.assertTrue(b.spend("any", 10 ** 9))
        self.assertIsNone(b.remaining("any"))


if __name__ == "__main__":
    unittest.main()
