"""E46 one-index check: unit tests (fabricated views, no harness index needed)."""
import os
import sys
import unittest

sys.path.insert(0, os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "scripts")))
import oneindex_check

RULES = {"glue": [], "max_recommendations": 3}


class TestOneIndex(unittest.TestCase):
    def test_agree(self):
        idx = {"ski-x": ["alpha"], "ski-y": ["beta"]}
        c, m, d, s = oneindex_check.agree([("alpha query", "ski-x", [], [])],
                                          RULES, dict(idx), RULES, dict(idx), {})
        self.assertEqual((c, m, s), (1, 1, 0))
        self.assertEqual(d, [])

    def test_divergence_captured(self):
        a = {"ski-x": ["alpha"], "ski-y": ["beta"]}
        b = {"ski-x": ["zzz"], "ski-y": ["beta"]}
        c, m, d, s = oneindex_check.agree([("alpha query", "ski-x", [], [])],
                                          RULES, a, RULES, b, {})
        self.assertEqual(c, 1)
        self.assertEqual(m, 0)
        self.assertEqual(len(d), 1)

    def test_skip_when_missing(self):
        a = {"ski-x": ["alpha"]}
        c, m, d, s = oneindex_check.agree([("alpha query", "ski-x", [], [])],
                                          RULES, a, RULES, {}, {})
        self.assertEqual((c, s), (0, 1))


if __name__ == "__main__":
    unittest.main()
