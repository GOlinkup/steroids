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


if __name__ == "__main__":
    unittest.main()
