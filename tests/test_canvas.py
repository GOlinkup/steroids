"""Stdlib unittest for steroids 2D live-fire helpers; headless, no tkinter window."""
import importlib.util
import json
import os
import unittest

_CANVAS_PATH = os.path.join(os.path.dirname(__file__), "..", "src", "steroids", "steroids2d.py")
_spec = importlib.util.spec_from_file_location("steroids_canvas_under_test", os.path.normpath(_CANVAS_PATH))
canvas = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(canvas)


class TestLiveFire(unittest.TestCase):
    def test_read_served_skills_tail(self):
        import tempfile
        with tempfile.NamedTemporaryFile("w", suffix=".jsonl", delete=False) as f:
            f.write(json.dumps({"t": 1, "q": "a", "trigs": "x", "skills": ""}) + "\n")
            f.write(json.dumps({"t": 2, "q": "b", "trigs": "y", "skills": "alpha/beta"}) + "\n")
            path = f.name
        try:
            self.assertEqual(canvas.read_served_skills(path), ["alpha", "beta"])
        finally:
            os.unlink(path)

    def test_read_served_abstain_and_missing(self):
        import tempfile
        with tempfile.NamedTemporaryFile("w", suffix=".jsonl", delete=False) as f:
            f.write(json.dumps({"t": 1, "q": "a", "trigs": "x", "skills": ""}) + "\n")
            path = f.name
        try:
            self.assertEqual(canvas.read_served_skills(path), [])
        finally:
            os.unlink(path)
        self.assertEqual(canvas.read_served_skills("/nope/missing-xyz.jsonl"), [])

    def test_ignite_and_decay(self):
        a = canvas.Blob(10, 10, 30, 132, "alpha")
        b = canvas.Blob(100, 100, 30, 216, "beta")
        self.assertEqual(canvas.ignite([a, b], ["beta", "ghost"]), ["beta"])
        self.assertEqual(b.heat, 1.0)
        self.assertEqual(a.heat, 0.0)
        b.update(0, b)
        self.assertAlmostEqual(b.heat, 1.0 - canvas.HEAT_DECAY)
        for _ in range(100):
            b.update(0, b)
        self.assertEqual(b.heat, 0.0)


if __name__ == "__main__":
    unittest.main()
