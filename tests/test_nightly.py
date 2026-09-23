"""D35 nightly dashboard math: unit tests (fabricated rows, no log needed)."""
import os
import sys
import unittest

sys.path.insert(0, os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "scripts")))
import nightly_report


class TestNightly(unittest.TestCase):
    def test_summarize(self):
        rows = [
            {"t": 1, "q": "aa", "trigs": "x", "skills": "ski-a/ski-b"},
            {"t": 2, "q": "aa", "trigs": "x", "skills": "ski-c/ski-b"},
            {"t": 3, "q": "bb", "trigs": "", "skills": ""},
        ]
        s = nightly_report._summarize(rows)
        self.assertEqual(s["serves"], 3)
        self.assertEqual(s["abstentions"], 1)
        self.assertAlmostEqual(s["abst_rate"], 1 / 3, places=3)
        self.assertEqual(s["unstable_q"], 1)
        self.assertEqual(sorted(s["unstable"]["aa"]), ["ski-a", "ski-c"])
        self.assertEqual(s["top_skills"][0], ("ski-b", 2))


if __name__ == "__main__":
    unittest.main()
