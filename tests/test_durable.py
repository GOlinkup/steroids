"""Stdlib unittest for durability (RQ-3). No kill needed here."""
import importlib.util
import os
import unittest

_HERE = os.path.dirname(os.path.abspath(__file__))
_SRC = os.path.normpath(os.path.join(_HERE, "..", "src", "steroids"))


def _load(name):
    spec = importlib.util.spec_from_file_location("st_" + name,
                                                  os.path.join(_SRC, name + ".py"))
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


durable = _load("durable")


class TestDurable(unittest.TestCase):
    def test_resume_skips_completed(self):
        db = durable.open_journal(":memory:")
        calls = []
        steps = [("a", lambda ctx: calls.append("a") or "ra"),
                 ("b", lambda ctx: calls.append("b") or "rb")]
        r1 = durable.run_workflow(db, steps)
        self.assertEqual(r1["done"], ["a", "b"])
        r2 = durable.run_workflow(db, steps)
        self.assertEqual(r2["done"], [])
        self.assertEqual(r2["skipped"], ["a", "b"])
        self.assertEqual(calls, ["a", "b"])  # never re-ran

    def test_effect_issued_once(self):
        db = durable.open_journal(":memory:")
        issued = []

        def flaky(ctx):
            ctx.effect("send", lambda: issued.append(1) or "ok")
            raise RuntimeError("crash after effect, before step commit")

        with self.assertRaises(RuntimeError):
            durable.run_workflow(db, [("a", flaky)])
        r = durable.run_workflow(
            db, [("a", lambda ctx: ctx.effect("send", lambda: issued.append(1) or "ok"))])
        self.assertEqual(issued, [1])
        self.assertEqual(r["replayed_effects"], ["send"])
        self.assertEqual(r["done"], ["a"])

    def test_crash_between_steps(self):
        db = durable.open_journal(":memory:")
        def boom(ctx):
            ctx.effect("e1", lambda: "r1")
            raise RuntimeError("kill simulation")
        with self.assertRaises(RuntimeError):
            durable.run_workflow(db, [("a", lambda ctx: ctx.effect("e0", lambda: "r0")),
                                      ("b", boom)])
        r = durable.run_workflow(db, [("a", lambda ctx: ctx.effect("e0", lambda: "r0")),
                                      ("b", lambda ctx: ctx.effect("e1", lambda: "r1"))])
        self.assertEqual(r["skipped"], ["a"])  # a kept, b retried
        self.assertEqual(r["done"], ["b"])


if __name__ == "__main__":
    unittest.main()
