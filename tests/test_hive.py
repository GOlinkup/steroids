"""Hive tests: layout, ledger, log, registry, memory, messaging, brief.

stdlib only. STEROIDS_HOME is faked per-test so we never touch the real
~/.config/steroids files. Run: python3 tests/test_hive.py
"""
import json
import os
import sys
import tempfile
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, ".."))
ISLAND = os.path.join(ROOT, "island")
sys.path.insert(0, ISLAND)

import hive  # noqa: E402


class HiveTest(unittest.TestCase):
    def setUp(self):
        self._old = os.environ.get("STEROIDS_HOME")
        self.tmp = tempfile.mkdtemp(prefix="steroids-hive-")
        os.environ["STEROIDS_HOME"] = self.tmp

    def tearDown(self):
        if self._old is not None:
            os.environ["STEROIDS_HOME"] = self._old
        else:
            os.environ.pop("STEROIDS_HOME", None)

    def test_layout(self):
        r = hive.ensure()
        for name in ("registry.json", "board.md", "tasks.json",
                     "log.jsonl", "agents"):
            self.assertTrue(os.path.exists(os.path.join(r, name)), name)
        # idempotent: second ensure keeps state.
        hive.add_task("keep me")
        hive.ensure()
        self.assertEqual(len(hive.list_tasks()), 1)

    def test_ledger_cycle(self):
        row = hive.add_task("write report", "q4 numbers", "coder")
        self.assertIn("id", row)
        self.assertEqual(row["status"], "todo")
        got = hive.update_task(row["id"], status="running")
        self.assertEqual(got["status"], "running")
        got = hive.update_task(row["id"], status="done", result="ok")
        self.assertEqual(got["result"], "ok")
        self.assertIsNone(hive.update_task("nope", status="done"))
        self.assertEqual(hive.list_tasks()[-1]["id"], row["id"])

    def test_log_and_board(self):
        hive.append_log("test", a=1)
        self.assertEqual(hive.read_log()[-1]["a"], 1)
        self.assertTrue(hive.write_board("# Plan\n- ship", agent="nicki"))
        self.assertIn("ship", hive.read_board())

    def test_registry_memory(self):
        hive.register("luna", "lead")
        self.assertEqual(hive.roster()[0]["role"], "lead")
        hive.remember("luna", "prefers short replies")
        self.assertIn("short replies", hive.recall("luna"))

    def test_send_drain_unread_ack(self):
        hive.register("luna", "lead")
        hive.register("milo", "scout")
        m = hive.send_msg("luna", "milo", "request", "review this",
                          "diff inside", conv="c1")
        self.assertTrue(m["requires_reply"])
        self.assertEqual(hive.drain(), 1)
        self.assertEqual(hive.drain(), 0)  # outbox empty now
        box = hive.unread("milo")
        self.assertEqual(len(box), 1)
        self.assertEqual(box[0]["subject"], "review this")
        self.assertTrue(hive.ack("milo", m["id"]))
        self.assertEqual(hive.unread("milo"), [])
        # audit copy kept, cursor moved.
        done = os.path.join(hive.agent_dir("milo"), "inbox", ".done",
                            m["id"] + ".json")
        self.assertTrue(os.path.isfile(done))

    def test_terminal_acts_need_no_reply(self):
        m = hive.send_msg("milo", "luna", "done", "finished")
        self.assertFalse(m["requires_reply"])
        with self.assertRaises(ValueError):
            hive.send_msg("milo", "luna", "fax", "nope")

    def test_unknown_recipient_goes_to_nicki(self):
        hive.send_msg("luna", "stranger", "inform", "hi")
        self.assertEqual(hive.drain(), 1)
        self.assertEqual(len(hive.unread("nicki")), 1)

    def test_hop_cap_escalates(self):
        first = hive.send_msg("luna", "milo", "request", "q0", conv="c2")
        hive.drain()
        prev = first["id"]
        last = first
        for i in range(7):
            last = hive.send_msg("milo" if i % 2 else "luna",
                                 "luna" if i % 2 else "milo",
                                 "request", "q%d" % (i + 1), conv="c2",
                                 in_reply_to=prev)
            hive.drain()
            prev = last["id"]
        self.assertEqual(last["to"], "nicki")
        self.assertTrue(last["needs_human"])
        self.assertIn("escalated", last["subject"])

    def test_god_brief(self):
        hive.register("nicki", "orchestrator")
        hive.add_task("fix bug", assignee="coder", status="running")
        hive.send_msg("luna", "nicki", "inform", "tile lit")
        hive.drain()
        brief = hive.god_brief()
        self.assertIn("Nicki", brief)
        self.assertIn("fix bug", brief)
        self.assertIn("tile lit", brief)
        self.assertLessEqual(len(brief), 1200)
        self.assertNotIn("mermaid", brief)

    def test_scribe_lock(self):
        hive.register("nicki", "orchestrator")
        hive.register("milo", "scout")
        self.assertFalse(hive.write_board("# hijack", agent="milo"))
        self.assertFalse(hive.write_board("# anon"))
        self.assertTrue(hive.write_board("# Plan\n- ship", agent="nicki"))
        self.assertIn("ship", hive.read_board())
        self.assertTrue(hive.propose_board("milo", "add ship row"))
        self.assertEqual(len(hive.unread("nicki")), 1)
        self.assertEqual(hive.unread("nicki")[0]["act"], "propose")

    def test_commit_silent_fail(self):
        # tmp STEROIDS_HOME has no .git repo: must fail silent, never raise.
        self.assertFalse(hive.commit("no repo here"))
        hive.append_log("test", a=1)  # logging still works.
        self.assertEqual(hive.read_log()[-1]["a"], 1)

    def test_recall_fts(self):
        hive.register("luna", "lead")
        hive.remember("luna", "zebracorn prefers short replies")
        hive.append_log("test", note="zebracorn appears in log")
        hits = hive.recall_fts("zebracorn")
        self.assertTrue(any("zebracorn" in h for h in hits))
        import sqlite3
        real = sqlite3.connect
        sqlite3.connect = lambda *a, **k: (_ for _ in ()).throw(
            Exception("no fts"))
        try:
            fallback = hive.recall_fts("zebracorn")
        finally:
            sqlite3.connect = real
        self.assertTrue(any("zebracorn" in h for h in fallback))

    def test_reflect_caps(self):
        hive.register("nicki", "orchestrator")
        for i in range(450):
            hive.append_log("test", note="row %d" % i)
        self.assertTrue(hive.reflect())
        self.assertLessEqual(len(hive.read_log(limit=1000)), 400)
        self.assertIn("row 0", hive.recall("nicki"))

    def test_remove_allow_rule(self):
        import decisions
        decisions.add_allow_rule("rm *", "deny", kind="glob")
        self.assertIn("deny", decisions.evaluate_rules("rm foo"))
        self.assertTrue(decisions.remove_allow_rule("rm *", kind="glob"))
        self.assertIsNone(decisions.evaluate_rules("rm foo"))
        self.assertFalse(decisions.remove_allow_rule("rm *", kind="glob"))


if __name__ == "__main__":
    unittest.main(verbosity=2)
