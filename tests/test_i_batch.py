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


if __name__ == "__main__":
    unittest.main()
