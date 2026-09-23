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


if __name__ == "__main__":
    unittest.main()
