"""J99 trust report: unit tests (fabricated snippets, no live reports needed)."""
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "scripts")))
import trust_report

NIGHTLY = """# Nightly router report — 2026-09-23

bench @ `abc123` (dirty paths: 0)

| set | n | P@1 | P@3 | MRR | leaks |
|-----|---|-----|-----|-----|-------|
| live16 | 16 | 0.875 | 0.750 | 0.875 | 2 |

## traffic (today, 10 serves)
- distinct queries: 9, abstentions: 1 (10.0%), unstable repeats: 0
- top skills: foo 5
"""


class TestTrust(unittest.TestCase):
    def _tmp(self, text):
        p = os.path.join(tempfile.mkdtemp(), "r.md")
        open(p, "w", encoding="utf-8").write(text)
        return p

    def test_parse_nightly(self):
        n = trust_report.parse_nightly(self._tmp(NIGHTLY))
        self.assertEqual(n["commit"], "abc123")
        self.assertEqual(n["bench"][0]["set"], "live16")
        self.assertAlmostEqual(n["bench"][0]["p1"], 0.875)
        t = n["traffic"]["today"]
        self.assertEqual((t["serves"], t["abstentions"], t["unstable"]), (10, 1, 0))

    def test_parse_lint(self):
        p = self._tmp("# Skill lint — x\n\nskills scanned: 10 files / 7 unique  errors: 2  warnings: 3  collisions: 1\n")
        self.assertEqual(trust_report.parse_lint(p),
                         {"files": 10, "unique": 7, "errors": 2, "warnings": 3, "collisions": 1})


if __name__ == "__main__":
    unittest.main()
