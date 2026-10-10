"""Permissions. Port of open-dots permission_service.py +
permission_ask_service.py + routers/permission.py::_classify.

Same rules: most-specific match wins (tool > connector > bucket),
no rule means "ask". Asks expire to deny. Sync + sqlite instead of
async SQLAlchemy. ASK timeouts kept: 110s poll, 2s interval.
"""
import sqlite3
import time
from datetime import datetime, timezone

from . import store
from .classifier import classify_bash_command

ASK_POLL_TIMEOUT_SECONDS = 110
ASK_POLL_INTERVAL_SECONDS = 2

TOOL_BUCKETS = {
    "Write": "create",
    "Edit": "create",
    "Bash": "system",
}


def classify(tool_name: str, body: dict) -> tuple:
    """(bucket, connector, tool) for a hook call. Same plug-in point as
    open-dots: per-connector classifiers run first for Bash."""
    if tool_name == "Bash":
        command = (body.get("tool_input") or {}).get("command", "")
        classified = classify_bash_command(command)
        if classified is not None:
            return classified
    return TOOL_BUCKETS.get(tool_name, "system"), None, None


def check_permission(conn: sqlite3.Connection, user_id: str, bucket: str,
                     connector: str | None = None, tool: str | None = None) -> str:
    if connector is not None and tool is not None:
        rows = store.where(conn, "permission_rule",
                           "user_id=? AND bucket=? AND connector=? AND tool=? ORDER BY created_at DESC LIMIT 1",
                           (user_id, bucket, connector, tool))
        if rows:
            return rows[0]["decision"]
    if connector is not None:
        rows = store.where(conn, "permission_rule",
                           "user_id=? AND bucket=? AND connector=? AND tool IS NULL ORDER BY created_at DESC LIMIT 1",
                           (user_id, bucket, connector))
        if rows:
            return rows[0]["decision"]
    rows = store.where(conn, "permission_rule",
                       "user_id=? AND bucket=? AND connector IS NULL AND tool IS NULL ORDER BY created_at DESC LIMIT 1",
                       (user_id, bucket))
    if rows:
        return rows[0]["decision"]
    return "ask"  # no rule means ask, never proceed on a guess


def create_ask(conn: sqlite3.Connection, user_id: str, bucket: str, task_id: int,
               connector: str | None = None, tool: str | None = None) -> dict:
    ask_id = store.insert(conn, "permission_ask", {
        "task_id": task_id, "user_id": user_id, "bucket": bucket,
        "connector": connector, "tool": tool, "status": "pending",
    })
    task = store.get(conn, "task", task_id)
    if task is not None:
        store.update(conn, "task", task_id, {"status": "waiting_approval"})
    return store.get(conn, "permission_ask", ask_id)


def get_pending_ask_for_task(conn: sqlite3.Connection, task_id: int) -> dict | None:
    rows = store.where(conn, "permission_ask", "task_id=? AND status='pending' ORDER BY id DESC LIMIT 1", (task_id,))
    return rows[0] if rows else None


def answer_ask(conn: sqlite3.Connection, ask_id: int, decision: str, always: bool = False) -> dict | None:
    ask = store.get(conn, "permission_ask", ask_id)
    if ask is None or ask["status"] != "pending":
        return ask
    store.update(conn, "permission_ask", ask_id, {
        "status": "answered", "decision": decision,
        "always": 1 if always else 0,
        "answered_at": datetime.now(timezone.utc).isoformat(),
    })
    if always:  # standing rule so the same action doesn't ask again
        store.insert(conn, "permission_rule", {
            "user_id": ask["user_id"], "bucket": ask["bucket"],
            "connector": ask["connector"], "tool": ask["tool"], "decision": decision,
        })
    task = store.get(conn, "task", ask["task_id"])
    if task is not None and task["status"] == "waiting_approval":
        store.update(conn, "task", ask["task_id"], {"status": "running" if decision == "allow" else "failed",
                                                    **({"error": "denied by user"} if decision != "allow" else {})})
    return store.get(conn, "permission_ask", ask_id)


def poll_for_answer(conn: sqlite3.Connection, ask_id: int,
                    timeout: float = ASK_POLL_TIMEOUT_SECONDS) -> str:
    """Block until answered; expiry defaults to deny (safe default)."""
    deadline = time.time() + timeout
    while time.time() < deadline:
        ask = store.get(conn, "permission_ask", ask_id)
        if ask is None or ask["status"] != "pending":
            return (ask or {}).get("decision") or "deny"
        time.sleep(ASK_POLL_INTERVAL_SECONDS)
    expired = store.get(conn, "permission_ask", ask_id)
    if expired is not None and expired["status"] == "pending":
        store.update(conn, "permission_ask", ask_id, {
            "status": "expired",
            "answered_at": datetime.now(timezone.utc).isoformat(),
        })
    return "deny"
