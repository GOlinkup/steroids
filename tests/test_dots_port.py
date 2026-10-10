"""Dots round-trip tests (sqlite, stdlib). Adapted from open-dots
backend/tests/services/test_permission*.py to the sync sqlite API."""
import sqlite3
from datetime import datetime, timezone

from steroids.dots import link, permissions, schedules, store, tasks


def _db():
    conn = sqlite3.connect(":memory:")
    conn.row_factory = sqlite3.Row
    conn.executescript(store.SCHEMA)
    return conn


def test_permission_defaults_to_ask():
    conn = _db()
    assert permissions.check_permission(conn, "u1", "create") == "ask"


def test_permission_most_specific_wins():
    conn = _db()
    store.insert(conn, "permission_rule", {"user_id": "u1", "bucket": "create", "decision": "deny"})
    store.insert(conn, "permission_rule", {"user_id": "u1", "bucket": "create",
                                           "connector": "github", "decision": "allow"})
    assert permissions.check_permission(conn, "u1", "create", "github", "git.push") == "allow"
    assert permissions.check_permission(conn, "u1", "create") == "deny"


def test_ask_answer_allow_once_and_always():
    conn = _db()
    tid = store.insert(conn, "task", {"user_id": "u1", "provider": "claude",
                                      "box_id": "b1", "prompt_text": "hi", "status": "running"})
    ask = permissions.create_ask(conn, "u1", "create", tid, "github", "git.push")
    assert store.get(conn, "task", tid)["status"] == "waiting_approval"
    permissions.answer_ask(conn, ask["id"], "allow", always=True)
    assert permissions.check_permission(conn, "u1", "create", "github", "git.push") == "allow"


def test_link_claim_idempotent_same_user():
    conn = _db()
    code = link.create_code(conn)
    first = link.claim_code(conn, code["code"], "u9")
    assert link.claim_code(conn, code["code"], "u9")["id"] == first["id"]


def test_task_resume_shares_session():
    conn = _db()
    parent = tasks.create_task(conn, user_id="u1", provider="claude", box_id="b1", prompt_text="a")
    store.update(conn, "task", parent["id"], {"status": "succeeded"})
    child = tasks.create_task(conn, user_id="u1", provider="claude", box_id="b1",
                              prompt_text="follow-up", parent_task_id=parent["id"])
    assert child["session_id"] == parent["session_id"]


def test_schedule_cron_next_run():
    after = datetime(2026, 1, 1, 12, 0, tzinfo=timezone.utc)
    nxt = schedules.compute_next_run("0 8 * * *", "UTC", after)
    assert (nxt.hour, nxt.minute) == (8, 0) and nxt > after


def test_classify_plug_point():
    assert permissions.classify("Bash", {"tool_input": {"command": "git push"}}) == ("publish", "github", "git.push")
    assert permissions.classify("Write", {})[0] == "create"
