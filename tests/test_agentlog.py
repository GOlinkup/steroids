"""Agent ledger tests: normalize, store, state, transcript, chat log, relay.

stdlib only. HOME is faked per-test so we never touch the real
~/.config/steroids files.
"""
import json
import os
import subprocess
import sys
import tempfile
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, ".."))
ISLAND = os.path.join(ROOT, "island")
sys.path.insert(0, ISLAND)

import agentlog  # noqa: E402


class LedgerTest(unittest.TestCase):
    def setUp(self):
        self._old_home = os.environ.get("HOME")
        self._old_sh = os.environ.get("STEROIDS_HOME")
        self._old_events = agentlog.events_path
        self._old_chat = agentlog.chat_path
        self.tmp = tempfile.mkdtemp(prefix="steroids-agentlog-")
        os.environ["HOME"] = self.tmp
        os.environ["STEROIDS_HOME"] = self.tmp
        # subprocess relays resolve via STEROIDS_HOME -> live_dir();
        # in-process calls use these patched paths.
        self.live = os.path.join(self.tmp, ".config", "steroids",
                                 "agent-events.jsonl")
        self.ev_path = os.path.join(self.tmp, "events.jsonl")
        self.chat_file = os.path.join(self.tmp, "chat.jsonl")
        agentlog.events_path = lambda: self.ev_path
        agentlog.chat_path = lambda: self.chat_file

    def tearDown(self):
        if self._old_home is not None:
            os.environ["HOME"] = self._old_home
        if self._old_sh is not None:
            os.environ["STEROIDS_HOME"] = self._old_sh
        else:
            os.environ.pop("STEROIDS_HOME", None)
        agentlog.events_path = self._old_events
        agentlog.chat_path = self._old_chat

    def test_normalize_claude_posttooluse_edit(self):
        e = agentlog.normalize({
            "hook_event_name": "PostToolUse", "tool_name": "Edit",
            "tool_input": {"file_path": "/x/app.py",
                           "old_string": "a\nb", "new_string": "x\ny\nz"},
            "session_id": "s1",
        }, agent="claude")
        self.assertEqual(e["event"], "PostToolUse")
        self.assertEqual(e["tool"], "Edit")
        self.assertEqual(e["added"], 3)
        self.assertEqual(e["removed"], 2)
        self.assertEqual(e["session"], "s1")

    def test_normalize_claude_prompt_and_stop(self):
        p = agentlog.normalize({"hook_event_name": "UserPromptSubmit",
                                "prompt": "fix the bug", "session_id": "s2"})
        self.assertEqual((p["event"], p["text"]), ("UserPromptSubmit", "fix the bug"))
        s = agentlog.normalize({"hook_event_name": "Stop", "session_id": "s2"})
        self.assertEqual(s["event"], "Stop")
        self.assertTrue(s["ok"])
        bad = agentlog.normalize({"hook_event_name": "Whatever"})
        self.assertIsNone(bad)

    def test_normalize_opencode_kinds(self):
        e = agentlog.normalize({"kind": "tool-before", "tool": "edit",
                                "file": "/a/b.py", "session": "oc1"},
                               agent="opencode")
        self.assertEqual(e["event"], "PreToolUse")
        self.assertEqual(e["file"], "/a/b.py")
        d = agentlog.normalize({"kind": "done", "session": "oc1"}, agent="opencode")
        self.assertEqual(d["event"], "Stop")
        err = agentlog.normalize({"kind": "error", "text": "boom"}, agent="opencode")
        self.assertEqual(err["event"], "Stop")
        self.assertFalse(err["ok"])

    def test_append_read_roundtrip(self):
        e = agentlog.normalize({"hook_event_name": "UserPromptSubmit",
                                "prompt": "hello", "session_id": "s3"})
        agentlog.append_event(e)
        agentlog.append_event(e)
        evs = agentlog.read_events()
        self.assertEqual(len(evs), 2)
        self.assertEqual(evs[0]["text"], "hello")

    def test_latest_state_machine(self):
        s1 = agentlog.normalize({"hook_event_name": "UserPromptSubmit",
                                 "prompt": "fix the login bug", "session_id": "s"})
        e1 = agentlog.normalize({"hook_event_name": "PreToolUse",
                                 "tool_name": "Edit",
                                 "tool_input": {"file_path": "/x/auth.py"},
                                 "session_id": "s"})
        e2 = agentlog.normalize({"hook_event_name": "PostToolUse",
                                 "tool_name": "Edit",
                                 "tool_input": {"file_path": "/x/auth.py",
                                                "old_string": "a\nb",
                                                "new_string": "a\nb\nc\nd"},
                                 "session_id": "s"})
        st = agentlog.normalize({"hook_event_name": "Stop", "session_id": "s"})
        self.assertEqual(agentlog.latest([s1]), ("thinking", "· fix the login bug"))
        state, act = agentlog.latest([s1, e1, e2])
        self.assertEqual(state, "working")
        self.assertIn("auth.py", act)
        self.assertIn("+4", act)
        self.assertIn("-2", act)
        state, act = agentlog.latest([s1, e1, e2, st])
        self.assertEqual(state, "finished")

    def test_latest_ignores_session_end(self):
        end = agentlog.normalize({"hook_event_name": "SessionEnd", "session_id": "s"})
        self.assertEqual(agentlog.latest([end]), ("idle", ""))

    def test_transcript_roles(self):
        s = agentlog.normalize({"hook_event_name": "UserPromptSubmit",
                                "prompt": "do it", "session_id": "s"})
        e = agentlog.normalize({"hook_event_name": "PostToolUse",
                                "tool_name": "Write",
                                "tool_input": {"file_path": "/x/new.py",
                                               "new_string": "one\ntwo"},
                                "session_id": "s"})
        f = agentlog.normalize({"hook_event_name": "Stop", "session_id": "s"})
        items = agentlog.transcript([s, e, f])
        self.assertEqual([i["role"] for i in items], ["user", "agent", "agent"])
        self.assertIn("new.py", items[1]["text"])
        self.assertIn("+2", items[1]["text"])
        self.assertIn("✓", items[2]["text"])

    def test_sessions_dedup_newest_first(self):
        a = agentlog.normalize({"hook_event_name": "UserPromptSubmit",
                                "prompt": "first", "session_id": "A"})
        b = agentlog.normalize({"hook_event_name": "UserPromptSubmit",
                                "prompt": "second", "session_id": "B"})
        a2 = agentlog.normalize({"hook_event_name": "Stop", "session_id": "A"})
        out = agentlog.sessions([a, b, a2])
        self.assertEqual([s["session"] for s in out], ["A", "B"])

    def test_chatlog_add_set_truncate(self):
        c = agentlog.ChatLog(self.chat_file)
        c.add("user", "hello", "claude")
        c.add("bot", "hi", "claude")
        c.add("user", "more", "claude")
        self.assertTrue(c.set(0, "hello edited"))
        self.assertTrue(c.items[0]["edited"])
        self.assertTrue(c.truncate_from(2))
        self.assertEqual(len(c.items), 2)
        c2 = agentlog.ChatLog(self.chat_file)  # reload: persistence
        self.assertEqual(len(c2.items), 2)
        self.assertEqual(c2.items[0]["text"], "hello edited")

    def test_describe_command_no_shell(self):
        argv, payload = agentlog.describe_command("claude", "fix bug; rm -rf /")
        self.assertEqual(argv[0], "claude")
        self.assertEqual(argv[1], "-p")
        self.assertIn("fix bug; rm -rf /", argv)  # one argv element, no shell
        self.assertIsNone(payload)
        argv2, payload2 = agentlog.describe_command("claude", "next", "sess1")
        self.assertEqual(argv2[argv2.index("--resume") + 1], "sess1")
        self.assertIn("stream-json", argv2)
        self.assertIn('"content"', payload2)
        argv3, _ = agentlog.describe_command("opencode", "hello", None)
        self.assertEqual(argv3[:2], ["opencode", "run"])
        self.assertIn("--format", argv3)

    def test_claude_line_parsing(self):
        self.assertEqual(
            agentlog.claude_line({"type": "system", "subtype": "init",
                                  "session_id": "s9"})["session"], "s9")
        a = agentlog.claude_line({"type": "assistant", "message": {"content": [
            {"type": "text", "text": "thinking"},
            {"type": "tool_use", "name": "Edit",
             "input": {"file_path": "/x/y.py"}}]}})
        self.assertEqual(a["assistant_text"], "thinking")
        self.assertEqual(a["tool"], "Edit")
        self.assertEqual(a["file"], "/x/y.py")
        r = agentlog.claude_line({"type": "result", "subtype": "success",
                                  "result": "done", "session_id": "s9"})
        self.assertTrue(r["ok"])
        self.assertEqual(r["result"], "done")

    def test_relay_subprocess(self):
        relay = os.path.join(ISLAND, "hook_relay.py")
        payload = json.dumps({"hook_event_name": "UserPromptSubmit",
                              "prompt": "relay me", "session_id": "R1"})
        r1 = subprocess.run([sys.executable, relay, "claude"], input=payload,
                            capture_output=True, text=True, timeout=15)
        self.assertEqual(r1.returncode, 0)
        r2 = subprocess.run([sys.executable, relay, "claude"], input="not json {{{",
                            capture_output=True, text=True, timeout=15)
        self.assertEqual(r2.returncode, 0)  # never blocks the agent
        evs = agentlog.read_events(path=self.live)
        self.assertEqual(len(evs), 1)
        self.assertEqual(evs[0]["text"], "relay me")

    def test_relay_path_smoke(self):
        agentlog.append_event({"event": "UserPromptSubmit", "text": "x",
                               "session": "smoke", "agent": "claude",
                               "ts": 0.0, "tool": "", "file": "", "added": 0,
                               "removed": 0, "ok": True})
        self.assertTrue(os.path.isfile(self.ev_path))


if __name__ == "__main__":
    unittest.main(verbosity=2)
