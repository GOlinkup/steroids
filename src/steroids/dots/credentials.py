"""Credentials. Port of open-dots user_credential_service.py.

Same API: save_token / get_decrypted / inject / pull-renewed. Encrypted
at rest via dots.crypto; box file access goes through the sandbox
provider (local dir or Boat). Sync + sqlite.
"""
import json
import sqlite3

from . import crypto, store


class CredentialNotFoundError(Exception):
    pass


def _get_row(conn: sqlite3.Connection, user_id: str, provider: str) -> dict | None:
    rows = store.where(conn, "user_credential", "user_id=? AND provider=?", (user_id, provider))
    return rows[0] if rows else None


def save_token(conn: sqlite3.Connection, *, user_id: str, provider: str,
               file_path: str, plaintext: str) -> dict:
    ciphertext = crypto.encrypt(plaintext)
    existing = _get_row(conn, user_id, provider)
    if existing is None:
        return store.get(conn, "user_credential", store.insert(conn, "user_credential", {
            "user_id": user_id, "provider": provider,
            "file_path": file_path, "ciphertext": ciphertext}))
    store.update(conn, "user_credential", existing["id"],
                 {"file_path": file_path, "ciphertext": ciphertext})
    return store.get(conn, "user_credential", existing["id"])


def get_decrypted(conn: sqlite3.Connection, user_id: str, provider: str) -> tuple | None:
    record = _get_row(conn, user_id, provider)
    if record is None:
        return None
    return crypto.decrypt(record["ciphertext"]), record["file_path"]


def claude_expires_at(content: str) -> int | None:
    try:
        data = json.loads(content)
    except (json.JSONDecodeError, TypeError):
        return None
    exp = (data.get("claudeAiOauth") or {}).get("expiresAt")
    return int(exp) if isinstance(exp, (int, float)) else None


def inject_credential_into_box(conn: sqlite3.Connection, boxes, user_id: str,
                               provider: str, box_id: str) -> bool:
    """Restore the stored credential into the sandbox before a task runs."""
    found = get_decrypted(conn, user_id, provider)
    if found is None:
        return False
    plaintext, file_path = found
    boxes.write_file(box_id, file_path, plaintext)
    return True


def pull_renewed_credential_from_box(conn: sqlite3.Connection, boxes, user_id: str,
                                     provider: str, box_id: str) -> bool:
    """Pick up a login the sandbox renewed itself instead of overwriting it."""
    found = get_decrypted(conn, user_id, provider)
    if found is None:
        return False
    _, file_path = found
    try:
        content = boxes.read_file(box_id, file_path)
    except Exception:
        return False
    if content:
        save_token(conn, user_id=user_id, provider=provider, file_path=file_path, plaintext=content)
        return True
    return False
