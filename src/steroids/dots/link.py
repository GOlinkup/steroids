"""Link codes (web <-> Telegram). Port of open-dots link_service.py.

Same semantics: 6-char codes, 10-min TTL, idempotent reclaim by the
same user. Sync + sqlite.
"""
import secrets
import sqlite3
import string
from datetime import datetime, timedelta, timezone

from . import store

CODE_ALPHABET = string.ascii_uppercase + string.digits
CODE_LENGTH = 6
CODE_TTL_SECONDS = 600


class LinkCodeInvalidError(Exception):
    pass


class LinkCodeExpiredError(Exception):
    pass


def create_code(conn: sqlite3.Connection) -> dict:
    code = "".join(secrets.choice(CODE_ALPHABET) for _ in range(CODE_LENGTH))
    exp = (datetime.now(timezone.utc) + timedelta(seconds=CODE_TTL_SECONDS)).isoformat()
    return store.get(conn, "link_code", store.insert(conn, "link_code", {"code": code, "expires_at": exp}))


def get_code(conn: sqlite3.Connection, code: str) -> dict | None:
    rows = store.where(conn, "link_code", "code=?", (code.strip().upper(),))
    return rows[0] if rows else None


def claim_code(conn: sqlite3.Connection, code: str, user_id: str) -> dict:
    record = get_code(conn, code)
    if record is None:
        raise LinkCodeInvalidError(f"Unknown link code: {code}")
    if record["claimed_at"] is not None:
        if record["user_id"] == user_id:
            return record
        raise LinkCodeInvalidError(f"Link code already used: {code}")
    if record["expires_at"] < datetime.now(timezone.utc).isoformat():
        raise LinkCodeExpiredError(f"Link code expired: {code}")
    conn.execute("UPDATE link_code SET user_id=?, claimed_at=? WHERE id=?",
                 (user_id, datetime.now(timezone.utc).isoformat(), record["id"]))
    conn.commit()
    return store.get(conn, "link_code", record["id"])
