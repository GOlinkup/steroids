"""Unit tests for benchmark statistics. No model calls, no index, no network.

Covers bootstrap_ci (synthetic hits only) and the golden determinism
contract shape. Run: python3 tests/test_benchmark.py
"""
import os
import sys
import unittest

_HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, _HERE)
from benchmark import bootstrap_ci


class TestBootstrapCI(unittest.TestCase):
    def test_all_hits_gives_trivial_interval(self):
        self.assertEqual(bootstrap_ci([1] * 20), (1.0, 1.0))

    def test_all_misses_gives_trivial_interval(self):
        self.assertEqual(bootstrap_ci([0] * 20), (0.0, 0.0))

    def test_empty_raises(self):
        with self.assertRaises(ValueError):
            bootstrap_ci([])

    def test_deterministic_given_seed(self):
        hits = [1, 0, 1, 1, 0] * 10
        self.assertEqual(bootstrap_ci(hits), bootstrap_ci(hits))

    def test_interval_contains_mean(self):
        hits = [1] * 100 + [0] * 49  # mean 0.671
        lo, hi = bootstrap_ci(hits)
        self.assertLessEqual(lo, 0.671)
        self.assertGreaterEqual(hi, 0.671)
        self.assertLess(lo, hi)

    def test_wider_n_narrows_interval(self):
        import random
        rng = random.Random(7)
        hits = [1 if rng.random() < 0.8 else 0 for _ in range(300)]
        lo50, hi50 = bootstrap_ci(hits[:50])
        lo300, hi300 = bootstrap_ci(hits)
        self.assertLess(hi300 - lo300, hi50 - lo50)


if __name__ == "__main__":
    unittest.main()
