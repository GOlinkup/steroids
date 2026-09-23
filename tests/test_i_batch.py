"""I-batch (r347): per-story tests. I81 watch mode."""
import importlib.util
import json
import os
import sys
import unittest

_HERE = os.path.dirname(os.path.abspath(__file__))
_ROUTER_PATH = os.path.normpath(os.path.join(_HERE, "..", "src", "steroids", "router.py"))
_RULES_PATH = os.path.normpath(os.path.join(_HERE, "..", "skill-rules.json"))

_spec = importlib.util.spec_from_file_location("steroids_router_ibatch", _ROUTER_PATH)
router = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(router)

with open(_RULES_PATH, encoding="utf-8") as _f:
    RULES = json.load(_f)
FILES = router.skill_files(RULES.get("index_dirs", []))
IDX, _ = router.build_index(FILES)
for _skill, _extra in RULES.get("skills", {}).items():
    if _skill in IDX:
        _es = [router.stem(w) for w in _extra]
        IDX[_skill] = _es + [k for k in IDX[_skill] if k not in _es]


class TestI81Watch(unittest.TestCase):
    def test_dockerfile_demo(self):
        rows = router.watch_suggest(["Dockerfile", "docker-compose.yml"], RULES, IDX)
        self.assertEqual(len(rows), 2)
        for row in rows:
            self.assertTrue(row["skills"], row)
        dockery = [s for r in rows for s in r["skills"] if "docker" in s]
        self.assertTrue(dockery)


class TestI82Meeting(unittest.TestCase):
    def test_meeting_demo(self):
        skills = router.meeting_skills("Sprint review: slow checkout endpoint", RULES, IDX)
        self.assertTrue(skills)
        self.assertLessEqual(len(skills), 3)


TRACE = """Traceback (most recent call last):
  File \"app.py\", line 10, in main
    run()
  File \"app.py\", line 4, in run
    int("xx")
ValueError: invalid literal"""

class TestI83Trace(unittest.TestCase):
    def test_extractor(self):
        sig = router.trace_signals(TRACE)
        self.assertEqual(sig["error"], "valueerror")
        self.assertTrue(any("app.py" in f for f in sig["frames"]))

    def test_golden(self):
        idx = {"debugger-x": ["valueerror", "traceback", "fix"],
               "other": ["widget"]}
        rules = {"glue": [], "max_recommendations": 3}
        top = router.route_traceback(TRACE, rules, idx)
        self.assertEqual(top[0][1], "debugger-x")


class TestI84Hook(unittest.TestCase):
    def test_auth_comment(self):
        sys.path.insert(0, os.path.normpath(os.path.join(_HERE, "..", "scripts")))
        import precommit_auth_review
        c = precommit_auth_review.auth_diff_comment('+password = "x"\n+user = 1\n')
        self.assertIn("security-review", c)

    def test_clean_silent(self):
        sys.path.insert(0, os.path.normpath(os.path.join(_HERE, "..", "scripts")))
        import precommit_auth_review
        self.assertEqual(precommit_auth_review.auth_diff_comment('+print("hi")\n'), "")


RED_FIXTURE = """\x1b[31mFAIL\x1b[0m\x1b[1;31m: test_each_golden_top1 (x)
AssertionError: 'git-helper' != 'resolving-merge-conflicts'
"""

class TestI85Triage(unittest.TestCase):
    def test_real_red_fixture(self):
        r = router.triage_build(RED_FIXTURE, RULES, IDX)
        self.assertTrue(r["failed"])
        self.assertIsNotNone(r["fix_skill"])
        self.assertTrue(r["excerpt"])


if __name__ == "__main__":
    unittest.main()
