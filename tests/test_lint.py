"""G62 linter math: unit tests (no filesystem index needed)."""
import os
import sys
import unittest

sys.path.insert(0, os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "scripts")))
import lint_skills


class TestLint(unittest.TestCase):
    def test_ok(self):
        f, e = lint_skills.parse_frontmatter("---\nname: foo\n---\n# Foo\n")
        self.assertIsNone(e)
        # name without description is fine at parse level (lint flags it later)
        self.assertEqual(f["name"], "foo")

    def test_missing(self):
        _, e = lint_skills.parse_frontmatter("# No frontmatter\n")
        self.assertEqual(e, "missing-frontmatter")

    def test_unclosed(self):
        _, e = lint_skills.parse_frontmatter("---\n" + "name: foo\nkey: value\n" * 25)
        self.assertEqual(e, "unclosed-frontmatter")

    def test_continuation(self):
        f, e = lint_skills.parse_frontmatter("---\nname: foo\ndescription: line one\n  line two\n---\n")
        self.assertIsNone(e)
        self.assertEqual(f["description"], "line one line two")


if __name__ == "__main__":
    unittest.main()
