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

    def test_opencode_usage_shape_and_never_throws(self):
        import sqlite3
        import time
        d = tempfile.mkdtemp()
        db = os.path.join(d, "opencode.db")
        c = sqlite3.connect(db)
        c.execute("CREATE TABLE session (id TEXT, title TEXT, model TEXT,"
                  " cost REAL, tokens_input INT, tokens_output INT,"
                  " tokens_cache_read INT, time_updated INT)")
        now_ms = int(time.time() * 1000)
        c.execute("INSERT INTO session VALUES (?,?,?,?,?,?,?,?)",
                  ("s1", "fix grid",
                   '{"id":"m1","providerID":"opencode"}', 0.0,
                   1000, 200, 5000, now_ms))
        c.execute("INSERT INTO session VALUES (?,?,?,?,?,?,?,?)",
                  ("s0", "old", '{"id":"m0","providerID":"opencode"}', 0.0,
                   7, 7, 7, now_ms - 3 * 86400 * 1000))
        c.commit()
        c.close()
        real = agentlog._opencode_db
        agentlog._opencode_db = lambda: sqlite3.connect(db)
        try:
            u = agentlog.opencode_usage()
        finally:
            agentlog._opencode_db = real
        self.assertEqual(u["provider"], "opencode")
        self.assertEqual(u["model"], "m1")
        self.assertEqual(u["today"]["sessions"], 1)
        self.assertEqual((u["today"]["in"], u["today"]["out"],
                          u["today"]["cached"]), (1000, 200, 5000))
        self.assertEqual(u["current"]["title"], "fix grid")
        # missing db -> honest empty, never throws
        agentlog._opencode_db = lambda: None
        try:
            e = agentlog.opencode_usage()
        finally:
            agentlog._opencode_db = real
        self.assertEqual(e["today"]["sessions"], 0)

    def test_work_today_counts_and_pct(self):
        import time
        now = time.time()
        evs = [
            {"event": "UserPromptSubmit", "text": "fix grid", "ts": now - 50,
             "tool": "", "file": "", "added": 0, "removed": 0, "ok": True},
            {"event": "PostToolUse", "tool": "Edit", "file": "/x/a.py",
             "added": 5, "removed": 2, "ts": now - 40, "ok": True},
            {"event": "Stop", "ts": now - 30, "ok": True},
            {"event": "UserPromptSubmit", "text": "offline cache",
             "ts": now - 10, "tool": "", "file": "", "added": 0,
             "removed": 0, "ok": True},
        ]
        w = agentlog.work_today(evs, now=now)
        self.assertEqual((w["asks"], w["done"], w["left"], w["pct"]),
                         (2, 1, 1, 50))
        self.assertEqual(w["current"], "offline cache")
        self.assertEqual((w["files"], w["added"], w["removed"]),
                         (["a.py"], 5, 2))
        self.assertEqual(w["state"], "thinking")
        # yesterday's noise never leaks in
        old = [dict(e, ts=now - 90000) for e in evs]
        self.assertEqual(agentlog.work_today(old, now=now)["asks"], 0)
        # pasted blobs collapse to a first-line headline
        blob = [{"event": "UserPromptSubmit",
                 "text": "Now working\nline2\nline3", "ts": now,
                 "tool": "", "file": "", "added": 0, "removed": 0,
                 "ok": True}]
        self.assertEqual(agentlog.work_today(blob, now=now)["current"],
                         "Now working")

    def test_file_lens_tail_and_honest_empty(self):
        import time
        d = tempfile.mkdtemp()
        p = os.path.join(d, "invoice.ts")
        with open(p, "w") as f:
            f.write("\n".join(f"line{i}" for i in range(1, 21)))
        lens = agentlog.file_lens(p)
        self.assertEqual(lens["file"], "invoice.ts")
        self.assertEqual(lens["lines"], [f"line{i}" for i in range(7, 21)])
        self.assertEqual(agentlog.file_lens("/nope/missing.py"),
                          {"file": "", "lines": [], "diff": []})
        now = time.time()
        evs = [{"event": "PostToolUse", "tool": "Edit", "file": p,
                "ts": now, "session": "s", "added": 1, "removed": 0,
                "ok": True}]
        self.assertEqual(agentlog.session_progress(evs, "s")["lens"]["file"],
                          "invoice.ts")

    def test_cwd_lens_newest_dirty_file(self):
        import subprocess
        d = tempfile.mkdtemp()
        subprocess.run(["git", "init", "-q", d], check=True)
        subprocess.run(["git", "-C", d, "config", "user.email", "t@t"],
                        check=True)
        subprocess.run(["git", "-C", d, "config", "user.name", "t"],
                        check=True)
        a = os.path.join(d, "a.py")
        with open(a, "w") as f:
            f.write("v1\n")
        subprocess.run(["git", "-C", d, "add", "a.py"], check=True)
        subprocess.run(["git", "-C", d, "commit", "-qm", "init"],
                        check=True)
        with open(a, "w") as f:
            f.write("v2\n")
        self.assertEqual(agentlog.cwd_lens(d)["lines"], ["v2"])
        self.assertEqual(agentlog.cwd_lens("/nope/missing"),
                          {"file": "", "lines": [], "diff": []})
        # dirty file -> live unified diff rows (- red / + green)
        dlens = agentlog.file_lens(a)
        self.assertIn("-v1", dlens["diff"])
        self.assertIn("+v2", dlens["diff"])
        # clean file -> honest empty diff
        subprocess.run(["git", "-C", d, "add", "a.py"], check=True)
        subprocess.run(["git", "-C", d, "commit", "-qm", "v2"],
                        check=True)
        self.assertEqual(agentlog.file_lens(a)["diff"], [])

    def test_build_handoff_brief_packs_task_steps_transcript(self):
        import time
        now = time.time()
        evs = [
            {"event": "UserPromptSubmit", "text": "fix the grid",
             "ts": now - 50, "session": "s", "tool": "", "file": "",
             "added": 0, "removed": 0, "ok": True, "agent": "opencode"},
            {"event": "PreToolUse", "tool": "Edit", "file": "/r/a.py",
             "ts": now - 40, "session": "s", "added": 0, "removed": 0,
             "ok": True, "agent": "opencode"},
            {"event": "PostToolUse", "tool": "Edit", "file": "/r/a.py",
             "ts": now - 30, "session": "s", "added": 3, "removed": 1,
             "ok": True, "agent": "opencode"},
            {"event": "Stop", "ts": now - 10, "session": "s", "tool": "",
             "file": "", "added": 0, "removed": 0, "ok": True,
             "agent": "opencode"},
        ]
        brief = agentlog.build_handoff_brief(evs, "s", "review it")
        self.assertIn("fix the grid", brief)
        self.assertIn("review it", brief)
        self.assertIn("a.py", brief)
        self.assertIn("finished", brief)
        self.assertEqual(agentlog.build_handoff_brief(evs, "nope", "x"),
                         "")
        self.assertEqual(agentlog.build_handoff_brief([], "", ""), "")

    def test_session_steps_checklist(self):
        import time
        now = time.time()
        evs = [
            {"event": "UserPromptSubmit", "text": "fix grid", "ts": now - 50,
             "session": "s", "tool": "", "file": "", "added": 0,
             "removed": 0, "ok": True},
            {"event": "PreToolUse", "tool": "read", "file": "/x/a.py",
             "ts": now - 40, "session": "s", "added": 0, "removed": 0,
             "ok": True},
            {"event": "PostToolUse", "tool": "read", "file": "/x/a.py",
             "ts": now - 39, "session": "s", "added": 0, "removed": 0,
             "ok": True},
            {"event": "PreToolUse", "tool": "edit", "file": "/x/a.py",
             "ts": now - 10, "session": "s", "added": 0, "removed": 0,
             "ok": True},
        ]
        steps = agentlog.work_today(evs, now=now)["steps"]
        self.assertEqual([(s["label"], s["status"]) for s in steps],
                         [("fix grid", "done"), ("read a.py", "done"),
                          ("edit a.py", "active")])
        self.assertEqual(agentlog.work_today([], now=now)["steps"], [])

    def test_session_steps_collapse_repeat_tool(self):
        import time
        now = time.time()
        evs = [{"event": "PreToolUse", "tool": "Edit",
                "file": f"/x/{c}.py", "ts": now - 50 + i,
                "session": "s", "added": 0, "removed": 0,
                "ok": True} for i, c in enumerate("abcde")]
        evs += [{"event": "PostToolUse", "tool": "Edit",
                 "file": "/x/e.py", "ts": now, "session": "s",
                 "added": 1, "removed": 0, "ok": True}]
        steps = agentlog.work_today(evs, now=now)["steps"]
        self.assertEqual([(s["label"], s["status"]) for s in steps],
                         [("Edit ×5", "active")])

    def test_project_of_cwd_and_docs(self):
        import time
        d = tempfile.mkdtemp()
        with open(os.path.join(d, "PLAN.md"), "w") as f:
            f.write("# Ship it\nnext steps\n")
        with open(os.path.join(d, "notes.txt"), "w") as f:
            f.write("not markdown\n")
        now = time.time()
        evs = [{"event": "UserPromptSubmit", "text": "fix grid",
                "ts": now - 10, "cwd": d, "session": "s",
                "tool": "", "file": "", "added": 0, "removed": 0,
                "ok": True}]
        p = agentlog.project_of(evs)
        self.assertEqual(p["cwd"], d)
        self.assertEqual(p["name"], os.path.basename(d))
        self.assertEqual([x["name"] for x in p["docs"]], ["PLAN.md"])
        self.assertEqual(p["docs"][0]["snippet"], "Ship it")
        # file-dir fallback when cwd is missing (opencode events today)
        sub = os.path.join(d, "sub")
        os.makedirs(sub)
        fp = os.path.join(sub, "a.py")
        with open(fp, "w") as f:
            f.write("x\n")
        evs2 = [{"event": "PostToolUse", "tool": "Edit", "file": fp,
                 "ts": now - 5, "session": "s", "added": 1,
                 "removed": 0, "ok": True}]
        p2 = agentlog.project_of(evs2)
        self.assertEqual(p2["cwd"], sub)
        # empty ledger -> honest empty, never throws
        self.assertEqual(agentlog.project_of([]),
                         {"cwd": "", "name": "", "docs": []})
        self.assertIn("project", agentlog.work_today(evs, now=now))

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

    def test_describe_command_model_flag(self):
        argv, _ = agentlog.describe_command("opencode", "hi", None,
                                             model="opencode/claude-sonnet-4-5")
        self.assertIn("-m", argv)
        self.assertIn("opencode/claude-sonnet-4-5", argv)
        argv, _ = agentlog.describe_command("opencode", "hi", "s1")
        self.assertNotIn("-m", argv)  # default: no flag
        argv, _ = agentlog.describe_command("claude", "hi", None, model="opus")
        self.assertIn("--model", argv)
        self.assertIn("opus", argv)
        argv, _ = agentlog.describe_command("claude", "hi", None,
                                             model="router-pick")
        self.assertNotIn("--model", argv)  # auto: no flag

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
