"""F-batch (r344): python-side tests. F55 fire bake."""
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "scripts")))
import bake_fire


class TestF55Fire(unittest.TestCase):
    def test_top1_counts(self):
        p = os.path.join(tempfile.mkdtemp(), "served.jsonl")
        open(p, "w").write('{"t":1,"q":"a","trigs":"x","skills":"sa/sb"}\n'
                           '{"t":2,"q":"b","trigs":"y","skills":"sa"}\n'
                           '{"t":3,"q":"c","trigs":"","skills":""}\n')
        self.assertEqual(bake_fire.bake(p), {"sa": 2})


class TestF56Snapshot(unittest.TestCase):
    def test_bake_sorted_capped(self):
        import bake_snapshot
        p = os.path.join(tempfile.mkdtemp(), "served.jsonl")
        rows = ['{"t":%d,"q":"q%d","trigs":"x","skills":"s%d"}' % (3 - i, i, i) for i in range(5)]
        rows.append('{"t":9,"q":"z","trigs":"","skills":""}')
        open(p, "w").write("\n".join(rows) + "\n")
        out = bake_snapshot.bake(p, keep=3)
        self.assertEqual([r["s"] for r in out], ["s2", "s1", "s0"])
        self.assertEqual([r["t"] for r in out], sorted(r["t"] for r in out))


class TestF59Menubar(unittest.TestCase):
    def test_rate_and_top(self):
        import menubar_steroids
        lines = ['{"t":1000,"q":"a","trigs":"x","skills":"sa/sb"}',
                 '{"t":1900,"q":"b","trigs":"y","skills":"sa"}',
                 '{"t":10,"q":"c","trigs":"","skills":""}']
        p = os.path.join(tempfile.mkdtemp(), "served.jsonl")
        open(p, "w").write("\n".join(lines) + "\n")
        s = menubar_steroids.stats(p, window=500, now=2000)
        self.assertEqual(s["rate_h"], 1)
        self.assertEqual(s["total"], 3)
        self.assertEqual(s["abst"], 1)
        self.assertEqual(s["top"][0], ("sa", 2))


class TestF60Tour(unittest.TestCase):
    def test_brief_ranked(self):
        import stack_tour
        d = tempfile.mkdtemp()
        files = []
        for name, body in (("sa", "flutter widgets"), ("sb", "django orm")):
            dd = os.path.join(d, name)
            os.makedirs(dd, exist_ok=True)
            md = os.path.join(dd, "SKILL.md")
            open(md, "w").write("---\nname: %s\ndescription: %s stuff\n---\n# T\n" % (name, body))
            files.append((name, md))
        b = stack_tour.brief_for_stack("flutter mobile", files)
        self.assertEqual(b[0]["skill"], "sa")
        self.assertIn("flutter", b[0]["why"])


if __name__ == "__main__":
    unittest.main()
