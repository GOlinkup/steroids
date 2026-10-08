"""Ports from the island survey: fleet ranking/overlap, allow-rules,
demo fixtures, discovery, socket hygiene, quiet hours, quota, usage,
focus, osc2, display slots, mute/bypass, codex notify-only.
Stdlib only. HOME faked per-test; never touches real ~/.config.
"""
import json
import os
import sqlite3
import subprocess
import sys
import tempfile
import time
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, ".."))
ISLAND = os.path.join(ROOT, "island")
sys.path.insert(0, ISLAND)

import agentlog  # noqa: E402
import decisions  # noqa: E402
import demo  # noqa: E402
import discovery  # noqa: E402
import display  # noqa: E402
import fleet  # noqa: E402
import focus  # noqa: E402
import mute  # noqa: E402
import osc2  # noqa: E402
import quiet  # noqa: E402
import quota  # noqa: E402
import sock  # noqa: E402
import usage  # noqa: E402
from context import tty_owner_pid  # noqa: E402


class PortsTest(unittest.TestCase):
    def setUp(self):
        self._old_home = os.environ.get("HOME")
        self._old_sh = os.environ.get("STEROIDS_HOME")
        self.tmp = tempfile.mkdtemp(prefix="steroids-ports-")
        os.environ["HOME"] = self.tmp
        os.environ["STEROIDS_HOME"] = self.tmp

    def tearDown(self):
        if self._old_home is not None:
            os.environ["HOME"] = self._old_home
        if self._old_sh is not None:
            os.environ["STEROIDS_HOME"] = self._old_sh
        else:
            os.environ.pop("STEROIDS_HOME", None)

    def test_fleet_ranking_ordinal(self):
        now = time.time()
        ss = [{"session": "live1", "ts": now, "first": "a"},
              {"session": "wait1", "ts": now - 50, "first": "b",
               "pending": True},
              {"session": "unread1", "ts": now, "first": "c", "unread": True}]
        out = fleet.rank(ss)
        self.assertEqual([s["session"] for s in out],
                         ["wait1", "unread1", "live1"])
        self.assertEqual(out[0]["_kind"], "needsDecision")

    def test_fleet_overlap_two_worktrees(self):
        git = subprocess.run(["git", "--version"], capture_output=True)
        if git.returncode != 0:
            self.skipTest("no git")
        repo = os.path.join(self.tmp, "repo")
        os.makedirs(repo)
        subprocess.run(["git", "-C", repo, "init", "-q"], check=True)
        subprocess.run(["git", "-C", repo, "config", "user.email", "t@t"],
                       check=True)
        subprocess.run(["git", "-C", repo, "config", "user.name", "t"],
                       check=True)
        with open(os.path.join(repo, "shared.txt"), "w") as f:
            f.write("v1")
        subprocess.run(["git", "-C", repo, "add", "."], check=True)
        subprocess.run(["git", "-C", repo, "commit", "-qm", "init"],
                       check=True)
        w1 = os.path.join(self.tmp, "w1")
        w2 = os.path.join(self.tmp, "w2")
        subprocess.run(["git", "-C", repo, "worktree", "add", w1], check=True,
                       capture_output=True)
        subprocess.run(["git", "-C", repo, "worktree", "add", w2], check=True,
                       capture_output=True)
        for w in (w1, w2):
            with open(os.path.join(w, "shared.txt"), "w") as f:
                f.write("edited")
        over = fleet.overlap([{"session": "a", "cwd": w1},
                              {"session": "b", "cwd": w2},
                              {"session": "c", "cwd": "/nope"}])
        self.assertEqual(sorted(over.get("a", [])), ["b"])
        self.assertEqual(sorted(over.get("b", [])), ["a"])
        self.assertNotIn("c", over)

    def test_allow_rules_deny_first(self):
        decisions.add_allow_rule("npm *", "allow", kind="glob")
        decisions.add_allow_rule("npm run evil", "deny", kind="exact")
        self.assertEqual(decisions.evaluate_rules("npm run evil"), "deny")
        self.assertEqual(decisions.evaluate_rules("npm test"), "allow")
        self.assertIsNone(decisions.evaluate_rules("rm -rf /"))
        decisions.add_allow_rule("^rm -rf", "deny", kind="regex")
        self.assertEqual(decisions.evaluate_rules("rm -rf /x"), "deny")

    def test_demo_cycle(self):
        st = {}
        got = [demo.tick(st) for _ in range(5)]
        self.assertEqual([g["status"] for g in got],
                         ["working", "waiting", "working", "asking", "done"])
        self.assertTrue(got[1]["attention"])
        self.assertEqual(len(demo.demo_sessions()), 3)

    def test_discovery_never_throws_empty(self):
        self.assertEqual(discovery.cursor_sessions(), [])
        self.assertEqual(discovery.grok_sessions(), [])
        self.assertEqual(discovery.copilot_sessions(), [])
        self.assertEqual(discovery.all_extra(), [])

    def test_discovery_copilot_fake(self):
        d = os.path.join(self.tmp, ".copilot", "history-session-state")
        os.makedirs(d)
        with open(os.path.join(d, "session_x.json"), "w") as f:
            json.dump({"sessionId": "cx1", "chatMessages": [
                {"role": "user", "content": "hello copilot"}]}, f)
        os.utime(os.path.join(d, "session_x.json"), (time.time(), time.time()))
        out = discovery.copilot_sessions()
        self.assertEqual(len(out), 1)
        self.assertEqual(out[0]["first"], "hello copilot")

    def test_sock_hygiene(self):
        p = os.path.join(self.tmp, "run", "hooks.sock")
        s = sock.listen(p)
        try:
            self.assertTrue(sock.owner_only(p))
        finally:
            s.close()
        ok, _ = sock.check_size(100)
        self.assertTrue(ok)
        ok, deny = sock.check_size(sock.MAX_PAYLOAD + 1)
        self.assertFalse(ok)
        self.assertIn("deny", deny.decode())

    def test_quiet_hours_wrap(self):
        from datetime import datetime
        self.assertTrue(quiet.in_quiet_hours(datetime(2026, 1, 1, 23, 0)))
        self.assertFalse(quiet.in_quiet_hours(datetime(2026, 1, 1, 12, 0)))
        self.assertFalse(quiet.in_quiet_hours(datetime(2026, 1, 1, 23, 0),
                                              start="22:00", end="22:00"))
        self.assertTrue(quiet.error_allowed("s-test"))
        self.assertFalse(quiet.error_allowed("s-test"))

    def test_quota_no_creds(self):
        self.assertEqual(quota.cached(), {})

    def test_usage_ledger_and_buckets(self):
        db = sqlite3.connect(":memory:")
        db.executescript(usage.SCHEMA)
        n = usage.ingest_ledger(limit=0, db=db)
        self.assertEqual(n, 0)
        buckets = usage.daily_buckets(days=7, db=db)
        self.assertEqual(len(buckets), 7)
        self.assertEqual(buckets[0]["input"], 0)
        self.assertIsNone(usage.cost_micros("unknown-model-zzz", 10, 10))
        self.assertIsNotNone(usage.cost_micros("claude-sonnet-4", 10, 10))

    def test_usage_claude_jsonl(self):
        p = os.path.join(self.tmp, "t.jsonl")
        with open(p, "w") as f:
            f.write(json.dumps({"message": {"id": "m1", "usage": {
                "input_tokens": 5, "output_tokens": 7,
                "cache_read_input_tokens": 100,
                "cache_creation_input_tokens": 50}}}) + "\n")
            f.write(json.dumps({"message": {"id": "m1", "usage": {
                "input_tokens": 5, "output_tokens": 7}}}) + "\n")
        db = sqlite3.connect(":memory:")
        db.executescript(usage.SCHEMA)
        self.assertEqual(usage.ingest_claude_jsonl(p, db=db), 12)
        again = usage.ingest_claude_jsonl(p, db=db)
        self.assertEqual(again, 0)  # mtime+size gate: no rescan

    def test_focus_compositor_and_fallback(self):
        os.environ.pop("HYPRLAND_INSTANCE_SIGNATURE", None)
        os.environ.pop("SWAYSOCK", None)
        self.assertIn(focus._compositor(), ("x11", "kde"))
        r = focus.focus({"cwd": self.tmp})
        self.assertTrue(r["ok"] and r["how"] == "cwd")
        self.assertFalse(focus.focus({})["ok"])

    def test_tty_owner_pid_self(self):
        try:
            tty = os.ttyname(0)
        except OSError:
            self.skipTest("no tty")
        self.assertGreaterEqual(tty_owner_pid(tty), 0)

    def test_osc2_roundtrip(self):
        osc2.write("sid1234567890abcdef", "/home/u/myproj", "fix login")
        self.assertEqual(osc2.read("sid1234567890abcdef"), "myproj: fix login")
        self.assertEqual(osc2.read("missing"), "")

    def test_display_slots_frozen(self):
        ss = [{"session": "a", "first": "one", "attention": True},
              {"session": "b", "first": "two"}]
        st = display.build_state(ss, {"b": ("working", "")})
        self.assertEqual(st["sessions"][0]["color"], "orange")
        self.assertEqual(st["sessions"][1]["color"], "green")
        p = display.publish(st)
        self.assertTrue(os.path.isfile(p))
        self.assertEqual(display.slot_target(st, 1), "a")
        self.assertEqual(display.slot_target(st, 9), "")

    def test_mute_rules_and_bypass(self):
        self.assertFalse(mute.bypass())
        mute.set_rules([{"pattern": "prod", "field": "cwd", "enabled": True}])
        self.assertTrue(mute.muted(cwd="/srv/prod/app"))
        self.assertFalse(mute.muted(cwd="/srv/dev/app"))
        mute.set_bypass(True)
        self.assertTrue(mute.bypass())
        mute.set_bypass(False)

    def test_codex_notify_only_never_blocks(self):
        relay = os.path.join(ISLAND, "hook_relay.py")
        payload = json.dumps({"hook_event_name": "PermissionRequest",
                              "tool_name": "Bash", "session_id": "CX1"})
        r = subprocess.run([sys.executable, relay, "codex"], input=payload,
                           capture_output=True, text=True, timeout=15)
        self.assertEqual(r.returncode, 0)
        self.assertEqual(r.stdout.strip(), "")

    def test_bypass_approves_in_relay(self):
        mute.set_bypass(True)
        try:
            relay = os.path.join(ISLAND, "hook_relay.py")
            payload = json.dumps({"hook_event_name": "PreToolUse",
                                  "tool_name": "Bash", "session_id": "B1"})
            r = subprocess.run([sys.executable, relay, "claude"],
                               input=payload, capture_output=True, text=True,
                               timeout=15)
            self.assertIn("approve", r.stdout)
        finally:
            mute.set_bypass(False)


if __name__ == "__main__":
    unittest.main(verbosity=2)
