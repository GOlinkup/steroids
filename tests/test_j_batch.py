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


if __name__ == "__main__":
    unittest.main()
