"""H-batch (r346): per-story tests. H71 role packs."""
import importlib.util
import json
import os
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


if __name__ == "__main__":
    unittest.main()
