"""Unit test for bootstrap CI math on synthetic data (P0-2). No model calls."""
import importlib.util
import os
import unittest

_HERE = os.path.dirname(os.path.abspath(__file__))
_spec = importlib.util.spec_from_file_location("st_bench",
    os.path.join(_HERE, "benchmark.py"))
bench = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(bench)


class TestBootstrapCI(unittest.TestCase):
    def test_all_hits(self):
        self.assertEqual(bench.bootstrap_ci([1] * 20), (1.0, 1.0))

    def test_no_hits(self):
        self.assertEqual(bench.bootstrap_ci([0] * 20), (0.0, 0.0))

    def test_mixed_brackets_mean(self):
        hits = [1, 0, 1, 1, 0] * 10
        lo, hi = bench.bootstrap_ci(hits)
        self.assertLessEqual(lo, 0.6)
        self.assertGreaterEqual(hi, 0.6)

    def test_deterministic(self):
        hits = [1, 0, 0, 1] * 25
        self.assertEqual(bench.bootstrap_ci(hits), bench.bootstrap_ci(hits))

    def test_empty_raises(self):
        with self.assertRaises(ValueError):
            bench.bootstrap_ci([])


if __name__ == "__main__":
    unittest.main()
