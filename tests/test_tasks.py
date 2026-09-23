"""Stdlib unittest for tasks (P2-2). No install."""
import importlib.util
import os
import unittest

_HERE = os.path.dirname(os.path.abspath(__file__))
_SRC = os.path.normpath(os.path.join(_HERE, "..", "src", "steroids"))


def _load(name):
    spec = importlib.util.spec_from_file_location(
        "st_" + name, os.path.join(_SRC, name + ".py"))
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


tasks = _load("tasks")


def _t(status="pending", **kw):
    d = {"id": "T", "title": "t", "status": status, "goal": "g"}
    d.update(kw)
    return d


class TestMachine(unittest.TestCase):
    def test_exhaustive_pairs(self):
        n_legal = 0
        for old in tasks.STATUSES:
            for new in tasks.STATUSES:
                if new in tasks.TRANSITIONS[old]:
                    n_legal += 1
                    self.assertEqual(tasks.transition(_t(old), new)["status"], new)
                else:
                    with self.assertRaises(ValueError, msg=f"{old}->{new}"):
                        tasks.transition(_t(old), new)
        self.assertGreater(n_legal, 10)  # table is not a stub

    def test_adversarial_jumps(self):
        for old, new in [("pending", "completed"), ("running", "completed"),
                         ("verifying", "running"), ("completed", "running"),
                         ("cancelled", "pending"), ("failed", "completed")]:
            with self.assertRaises(ValueError, msg=f"{old}->{new}"):
                tasks.transition(_t(old), new)

    def test_block_records_missing(self):
        t = tasks.block(_t("ready"), "P0-3 bank")
        self.assertEqual(t["status"], "blocked")
        self.assertIn("P0-3 bank", t["unknowns"])
        with self.assertRaises(ValueError):
            tasks.block(_t("ready"), "  ")

    def test_block_respects_machine(self):
        for s in ("planned", "running"):
            self.assertEqual(tasks.block(_t(s), "x")["status"], "blocked")
        for s in ("pending", "completed", "cancelled", "verifying", "failed"):
            with self.assertRaises(ValueError, msg=f"block from {s}"):
                tasks.block(_t(s), "x")

    def test_cycles(self):
        ok = [_t("pending", id="a"), _t("pending", id="b", dependencies=["a"]),
              _t("pending", id="c", dependencies=["a", "b"])]
        tasks.check_cycles(ok)  # diamond, no raise
        with self.assertRaises(ValueError):
            tasks.check_cycles([_t("pending", id="a", dependencies=["a"])])
        with self.assertRaises(ValueError):
            tasks.check_cycles([_t("pending", id="a", dependencies=["b"]),
                                _t("pending", id="b", dependencies=["a"])])
        with self.assertRaises(ValueError):
            tasks.check_cycles([_t("pending", id="a", dependencies=["ghost"])])

    def test_children(self):
        ts = [_t("pending", id="a"), _t("pending", id="b", parent="a"),
              _t("pending", id="c", parent="a")]
        self.assertEqual(sorted(tasks.children("a", ts)), ["b", "c"])

    def test_emit_hook(self):
        seen = []
        t = _t("ready", id="R/T1")
        tasks.transition(t, "running", emit=lambda *a: seen.append(a))
        self.assertEqual(seen, [("task.state", "R/T1",
                                 {"from": "ready", "to": "running"})])
        tasks.block(_t("ready", id="R/T2"), "bank", emit=lambda *a: seen.append(a))
        self.assertEqual(seen[1][0], "task.state")
        self.assertEqual(seen[1][2]["missing"], "bank")
        n = len(seen)
        with self.assertRaises(ValueError):
            tasks.transition(_t("pending", id="R/T3"), "completed",
                             emit=lambda *a: seen.append(a))
        self.assertEqual(len(seen), n)  # illegal jumps emit nothing


if __name__ == "__main__":
    unittest.main()
