"""H-batch (r346): per-story tests. H71 role packs."""
import importlib.util
import json
import os
import sys
import unittest

_HERE = os.path.dirname(os.path.abspath(__file__))
_ROUTER_PATH = os.path.normpath(os.path.join(_HERE, "..", "src", "steroids", "router.py"))
_RULES_PATH = os.path.normpath(os.path.join(_HERE, "..", "skill-rules.json"))

_spec = importlib.util.spec_from_file_location("steroids_router_hbatch", _ROUTER_PATH)
router = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(router)

with open(_RULES_PATH, encoding="utf-8") as _f:
    RULES = json.load(_f)
FILES = router.skill_files(RULES.get("index_dirs", []))
IDX, _ = router.build_index(FILES)


class TestH71Packs(unittest.TestCase):
    def test_two_packs_defined_and_indexed(self):
        for role in ("designer", "backend"):
            skills = router.pack_skills(role, RULES, IDX)
            self.assertGreaterEqual(len(skills), 5, role)

    def test_unknown_role_empty(self):
        self.assertEqual(router.pack_skills("nope", RULES, IDX), [])


class TestH72Clearance(unittest.TestCase):
    RULES = {"restricted": ["vault-x"]}

    def test_restricted_hidden(self):
        idx = {"vault-x": ["k"], "open-y": ["k"]}
        self.assertEqual(router.visible_skills("standard", self.RULES, idx), ["open-y"])

    def test_full_sees_all(self):
        idx = {"vault-x": ["k"], "open-y": ["k"]}
        self.assertEqual(router.visible_skills("full", self.RULES, idx), ["open-y", "vault-x"])


class TestH73Audit(unittest.TestCase):
    def test_log_format_and_query(self):
        import tempfile
        p = os.path.join(tempfile.mkdtemp(), "audit.jsonl")
        router.audit_log("ann", ["a", "b"], p)
        router.audit_log("bob", ["c"], p)
        self.assertEqual(len(router.audit_query(path=p)), 2)
        got = router.audit_query("ann", p)
        self.assertEqual(len(got), 1)
        self.assertEqual(set(got[0]), {"t", "who", "skills"})
        self.assertEqual(got[0]["who"], "ann")


class TestH74PII(unittest.TestCase):
    RULES = {"analytics": ["analytics-x"]}

    def test_red_team_blocked(self):
        self.assertTrue(router.pii_blocked(
            "analyze churn for jane.doe@example.com last quarter", "analytics-x", self.RULES))

    def test_control_non_analytics_passes(self):
        self.assertFalse(router.pii_blocked(
            "analyze churn for jane.doe@example.com last quarter", "code-review", self.RULES))

    def test_control_no_pii_passes(self):
        self.assertFalse(router.pii_blocked(
            "analyze quarterly churn trends", "analytics-x", self.RULES))


class TestH75Cost(unittest.TestCase):
    def test_allocate_teams(self):
        sys.path.insert(0, os.path.normpath(os.path.join(_HERE, "..", "scripts")))
        import cost_report, tempfile
        d = tempfile.mkdtemp()
        dd = os.path.join(d, "sa")
        os.makedirs(dd)
        md = os.path.join(dd, "SKILL.md")
        open(md, "w").write("x" * 400)
        lp = os.path.join(d, "s.jsonl")
        open(lp, "w").write('{"t":1,"q":"a","trigs":"x","skills":"sa"}\n')
        rp = os.path.join(d, "rules.json")
        open(rp, "w").write('{"teams": {"blue": ["sa"]}}')
        per_skill, per_team = cost_report.allocate(lp, rp, topdir=d)
        self.assertEqual(per_skill["sa"], 100)
        self.assertEqual(per_team, {"blue": 100})


class TestH76Policy(unittest.TestCase):
    IDX = {"security-review": ["audit"], "other": ["widget"]}

    def test_auth_diff_auto_includes(self):
        rules = {"glue": [], "max_recommendations": 3}
        top = router.policy_route("fix login password reset flow", rules, self.IDX)
        self.assertEqual(top[0][1], "security-review")

    def test_non_auth_untouched(self):
        rules = {"glue": [], "max_recommendations": 3}
        top = router.policy_route("fix widget layout", rules, self.IDX)
        normal = router.route_query("fix widget layout", rules, self.IDX)
        self.assertEqual([s for _, s, _ in top], [s for _, s, _ in normal])


class TestH77Incident(unittest.TestCase):
    def test_outage_pack_defined(self):
        with open(_RULES_PATH, encoding="utf-8") as f:
            rules = json.load(f)
        pack = router.pack_skills("outage", rules, IDX)
        self.assertGreaterEqual(len(pack), 5)

    def test_outage_drill(self):
        with open(_RULES_PATH, encoding="utf-8") as f:
            rules = json.load(f)
        plan = router.dispatch_task("production outage, errors spiking then page the on-call", rules, IDX)
        self.assertTrue(plan)
        for row in plan:
            self.assertIsNotNone(row["top"])


class TestH79Federated(unittest.TestCase):
    def test_two_repo_demo(self):
        rules = {"glue": [], "max_recommendations": 3}
        a = {"sa": ["alpha"], "common": ["alpha"]}
        b = {"sb": ["alpha", "beta"], "common": ["alpha"]}
        out = router.federated_route("alpha beta", rules, [("repoA", a), ("repoB", b)])
        by_skill = {r["skill"]: r for r in out}
        self.assertEqual(by_skill["sb"]["repo"], "repoB")
        self.assertIn("common", by_skill)
        self.assertTrue(all(set(r) == {"skill", "score", "hits", "repo"} for r in out))


if __name__ == "__main__":
    unittest.main()
