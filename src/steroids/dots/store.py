"""sqlite store. Replaces open-dots SQLAlchemy models + Alembic.

Same 7 tables and fields (task, schedule, permission_ask,
permission_rule, link_code, user_credential, user_sandbox), plain dict
rows, stdlib sqlite3. Path defaults to ~/.config/steroids/dots.db.
"""
import os
import sqlite3
from datetime import datetime, timezone

SCHEMA = """
CREATE TABLE IF NOT EXISTS task(
 id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL,
 provider TEXT NOT NULL, box_id TEXT NOT NULL, prompt_text TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'pending', prompt_id TEXT, session_id TEXT,
 schedule_id INTEGER, scheduled_for TEXT, result TEXT, reported_at TEXT,
 error TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
 UNIQUE(schedule_id, scheduled_for));
CREATE INDEX IF NOT EXISTS ix_task_user ON task(user_id);
CREATE INDEX IF NOT EXISTS ix_task_status ON task(status);
CREATE TABLE IF NOT EXISTS schedule(
 id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL,
 provider TEXT NOT NULL, box_id TEXT NOT NULL, prompt_text TEXT NOT NULL,
 cron_expression TEXT NOT NULL, timezone TEXT NOT NULL DEFAULT 'UTC',
 is_active INTEGER NOT NULL DEFAULT 1, next_run_at TEXT NOT NULL,
 last_run_at TEXT, last_error TEXT, consecutive_failures INTEGER NOT NULL DEFAULT 0,
 paused_reason TEXT, deleted_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS ix_schedule_user ON schedule(user_id);
CREATE TABLE IF NOT EXISTS permission_ask(
 id INTEGER PRIMARY KEY AUTOINCREMENT, task_id INTEGER NOT NULL,
 user_id TEXT NOT NULL, bucket TEXT NOT NULL, connector TEXT, tool TEXT,
 status TEXT NOT NULL DEFAULT 'pending', decision TEXT, always INTEGER NOT NULL DEFAULT 0,
 created_at TEXT NOT NULL, answered_at TEXT);
CREATE INDEX IF NOT EXISTS ix_ask_task ON permission_ask(task_id);
CREATE TABLE IF NOT EXISTS permission_rule(
 id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL,
 bucket TEXT NOT NULL, connector TEXT, tool TEXT, decision TEXT NOT NULL,
 created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS ix_rule_lookup ON permission_rule(user_id, bucket, connector, tool);
CREATE TABLE IF NOT EXISTS link_code(
 id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT NOT NULL UNIQUE,
 user_id TEXT, expires_at TEXT NOT NULL, claimed_at TEXT, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS user_credential(
 id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL,
 provider TEXT NOT NULL, file_path TEXT NOT NULL, ciphertext TEXT NOT NULL,
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
 UNIQUE(user_id, provider));
CREATE TABLE IF NOT EXISTS user_sandbox(
 id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL,
 box_id TEXT NOT NULL UNIQUE, state TEXT, machine_type TEXT,
 ttl_seconds INTEGER NOT NULL DEFAULT 1800, expires_at TEXT,
 is_active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
"""


def now() -> str:
    return datetime.now(timezone.utc).isoformat()


def connect(path: str = "") -> sqlite3.Connection:
    path = path or os.path.expanduser("~/.config/steroids/dots.db")
    os.makedirs(os.path.dirname(path), exist_ok=True)
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    conn.executescript(SCHEMA)
    return conn


def insert(conn: sqlite3.Connection, table: str, row: dict) -> int:
    row = {**row, "created_at": row.get("created_at", now()), "updated_at": now()} \
        if table in ("task", "schedule", "user_credential", "user_sandbox") else row
    if table in ("permission_ask", "permission_rule", "link_code") and "created_at" not in row:
        row["created_at"] = now()
    cols = ", ".join(row)
    cur = conn.execute(f"INSERT INTO {table}({cols}) VALUES({', '.join('?' * len(row))})", tuple(row.values()))
    conn.commit()
    return cur.lastrowid


def get(conn: sqlite3.Connection, table: str, row_id: int) -> dict | None:
    row = conn.execute(f"SELECT * FROM {table} WHERE id=?", (row_id,)).fetchone()
    return dict(row) if row else None


def update(conn: sqlite3.Connection, table: str, row_id: int, fields: dict) -> None:
    fields = {**fields, "updated_at": now()} if table in ("task", "schedule", "user_credential", "user_sandbox") else fields
    conn.execute(f"UPDATE {table} SET {', '.join(f'{k}=?' for k in fields)} WHERE id=?", (*fields.values(), row_id))
    conn.commit()


def where(conn: sqlite3.Connection, table: str, cond: str, args: tuple = ()) -> list:
    return [dict(r) for r in conn.execute(f"SELECT * FROM {table} WHERE {cond}", args).fetchall()]
