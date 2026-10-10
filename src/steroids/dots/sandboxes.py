"""Sandboxes. Port of open-dots box_operations.py + user_sandbox_service.py.

Provider interface (create/get/stop/resume/delete/run/write/read) with
two backends: local subprocess dirs (default, stdlib, offline) and Boat
(optional — used only when boat_sdk is installed and BOAT_API_KEY set).
Record helpers (create/get/ensure/deactivate) mirror user_sandbox_service
over sqlite, including the 404-stale-row replacement rule.
"""
import os
import shutil
import sqlite3
import subprocess
import time
import uuid
from datetime import datetime, timedelta, timezone

from . import store

DEFAULT_TTL_SECONDS = 1800


class BoxNotFoundError(Exception):
    pass


class LocalBoxes:
    """Disposable local sandboxes: one dir per box under ~/.config/steroids/dots-boxes."""

    def __init__(self, root: str = ""):
        self.root = root or os.path.expanduser("~/.config/steroids/dots-boxes")
        os.makedirs(self.root, exist_ok=True)

    def _dir(self, box_id: str) -> str:
        return os.path.join(self.root, box_id)

    def create_box(self, ttl_seconds: int = DEFAULT_TTL_SECONDS) -> dict:
        box_id = "local-" + uuid.uuid4().hex[:12]
        os.makedirs(self._dir(box_id), exist_ok=True)
        return {"id": box_id, "state": "ready", "type": "local", "ttl_seconds": ttl_seconds}

    def get_box(self, box_id: str) -> dict:
        if not os.path.isdir(self._dir(box_id)):
            raise BoxNotFoundError(box_id)
        return {"id": box_id, "state": "ready", "type": "local"}

    def stop_box(self, box_id: str) -> None:
        pass  # local boxes have no billable runtime

    def resume_box(self, box_id: str) -> dict:
        return self.get_box(box_id)

    def delete_box(self, box_id: str) -> None:
        shutil.rmtree(self._dir(box_id), ignore_errors=True)

    def run_command(self, box_id: str, command: str, timeout: int = 600) -> dict:
        proc = subprocess.run(command, shell=True, cwd=self._dir(box_id),
                              capture_output=True, text=True, timeout=timeout)
        return {"stdout": proc.stdout, "stderr": proc.stderr, "returncode": proc.returncode}

    def write_file(self, box_id: str, path: str, content: str) -> None:
        dest = os.path.join(self._dir(box_id), path)
        os.makedirs(os.path.dirname(dest), exist_ok=True)
        with open(dest, "w", encoding="utf-8") as fh:
            fh.write(content)

    def read_file(self, box_id: str, path: str) -> str | None:
        try:
            with open(os.path.join(self._dir(box_id), path), encoding="utf-8") as fh:
                return fh.read()
        except OSError:
            return None


def provider():
    """Boat when configured, else local. Same call shape either way."""
    try:
        from .boat_provider import BoatBoxes  # lazy: boat_sdk optional
        import os as _os
        if _os.environ.get("BOAT_API_KEY"):
            return BoatBoxes()
    except ImportError:
        pass
    return LocalBoxes()


# -- user_sandbox record helpers (mirror user_sandbox_service) --

def create_record(conn: sqlite3.Connection, *, user_id: str, box_id: str,
                  state: str | None = None, machine_type: str | None = None,
                  ttl_seconds: int = DEFAULT_TTL_SECONDS) -> dict:
    exp = (datetime.now(timezone.utc) + timedelta(seconds=ttl_seconds)).isoformat()
    return store.get(conn, "user_sandbox", store.insert(conn, "user_sandbox", {
        "user_id": user_id, "box_id": box_id, "state": state,
        "machine_type": machine_type, "ttl_seconds": ttl_seconds,
        "expires_at": exp, "is_active": 1}))


def get_active_by_user(conn: sqlite3.Connection, user_id: str) -> dict | None:
    rows = store.where(conn, "user_sandbox",
                       "user_id=? AND is_active=1 ORDER BY id DESC LIMIT 1", (user_id,))
    return rows[0] if rows else None


def deactivate(conn: sqlite3.Connection, box_id: str) -> None:
    conn.execute("UPDATE user_sandbox SET is_active=0 WHERE box_id=?", (box_id,))
    conn.commit()


def ensure(conn: sqlite3.Connection, boxes, *, user_id: str,
           ttl_seconds: int = DEFAULT_TTL_SECONDS) -> dict:
    """Reuse the active sandbox; on remote 404 replace the stale row."""
    existing = get_active_by_user(conn, user_id)
    if existing is not None:
        try:
            info = boxes.get_box(existing["box_id"])
        except Exception as exc:
            if getattr(exc, "status", None) != 404 and not isinstance(exc, BoxNotFoundError):
                raise
            deactivate(conn, existing["box_id"])
        else:
            conn.execute("UPDATE user_sandbox SET state=? WHERE id=?", (info.get("state"), existing["id"]))
            conn.commit()
            return store.get(conn, "user_sandbox", existing["id"])
    box = boxes.create_box(ttl_seconds)
    time.sleep(0)  # local boxes are ready immediately; Boat waits internally
    return create_record(conn, user_id=user_id, box_id=box["id"],
                         state=box.get("state"), machine_type=box.get("type"),
                         ttl_seconds=ttl_seconds)
