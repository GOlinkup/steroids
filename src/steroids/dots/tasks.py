"""Tasks. Port of open-dots task_execution_service.py.

Same contract: create_task (queued row first, parent resumes the same
session_id) / start_task / execute_task / sync helpers; same statuses
(queued/starting/pending/running/waiting_approval/succeeded/failed),
same budgets (MAX_TASK 600s, stuck-starting 600s, queued-recovery 60s),
same claude -p --output-format json command + --session-id/--resume,
same stdout parsing. Sync + sqlite + provider interface.
"""
import json
import shlex
import sqlite3
import time
import uuid
from datetime import datetime, timedelta, timezone

from . import store

ACTIVE_STATUSES = {"queued", "starting", "pending", "running", "waiting_approval"}
FINISHED_STATUSES = {"succeeded", "failed"}
MAX_TASK_SECONDS = 600
STUCK_STARTING_SECONDS = 600
QUEUED_RECOVERY_SECONDS = 60

PROVIDER_COMMANDS = {
    "claude": "claude -p {prompt} --output-format json",
}
PERMISSION_HOOK_SETTINGS_PATH = ".claude/settings.json"


class TaskNotFoundError(Exception):
    pass


class ParentTaskActiveError(Exception):
    pass


class UnsupportedProviderError(Exception):
    pass


class BoxCommandError(Exception):
    pass


def build_command(provider: str, prompt_text: str, *, session_id: str, resume: bool) -> str:
    try:
        template = PROVIDER_COMMANDS[provider]
    except KeyError:
        raise UnsupportedProviderError(f"Unsupported provider: {provider}")
    base = template.format(prompt=shlex.quote(prompt_text))
    flag = "--resume" if resume else "--session-id"
    return f"{base} {flag} {shlex.quote(session_id)}"


def finished_values(stdout: str, stderr: str) -> dict:
    try:
        payload = json.loads(stdout)
    except (json.JSONDecodeError, TypeError):
        return {"status": "failed", "error": stderr or stdout}
    if payload.get("is_error"):
        return {"status": "failed", "error": payload.get("result") or stderr}
    return {"status": "succeeded", "result": payload.get("result")}


def get_task(conn: sqlite3.Connection, task_id: int) -> dict | None:
    return store.get(conn, "task", task_id)


def list_tasks_for_user(conn: sqlite3.Connection, user_id: str) -> list:
    return store.where(conn, "task", "user_id=? ORDER BY id DESC", (user_id,))


def create_task(conn: sqlite3.Connection, *, user_id: str, provider: str, box_id: str,
                prompt_text: str, parent_task_id: int | None = None,
                schedule_id: int | None = None, scheduled_for: str | None = None) -> dict:
    if provider not in PROVIDER_COMMANDS:
        raise UnsupportedProviderError(f"Unsupported provider: {provider}")
    if parent_task_id is None:
        session_id = str(uuid.uuid4())
    else:
        parent = get_task(conn, parent_task_id)
        if parent is None or parent["user_id"] != user_id:
            raise TaskNotFoundError(f"Parent task {parent_task_id} not found")
        if not parent["session_id"]:
            raise TaskNotFoundError(f"Task {parent_task_id} predates conversation replies")
        if parent["status"] in ACTIVE_STATUSES:
            raise ParentTaskActiveError(f"Task {parent_task_id} is still {parent['status']}")
        session_id = parent["session_id"]
    return store.get(conn, "task", store.insert(conn, "task", {
        "user_id": user_id, "provider": provider, "box_id": box_id,
        "prompt_text": prompt_text, "status": "queued", "session_id": session_id,
        "schedule_id": schedule_id, "scheduled_for": scheduled_for}))


def write_permission_hook_config(boxes, box_id: str, hook_base_url: str,
                                 hook_token: str, user_id: str, task_id: int) -> None:
    url = f"{hook_base_url}/api/v1/permissions/check/{user_id}/{task_id}"
    config = {"hooks": {"PermissionRequest": [{"matcher": "*",
                "hooks": [{"type": "http", "url": url, "timeout": 120,
                           "headers": {"Authorization": f"Bearer {hook_token}"}}]}]}}
    boxes.write_file(box_id, PERMISSION_HOOK_SETTINGS_PATH, json.dumps(config))


def start_task(conn: sqlite3.Connection, boxes, task_id: int,
               hook_base_url: str = "", hook_token: str = "") -> dict:
    """Claim + launch. Caller injects credentials first (see bot/server)."""
    task = get_task(conn, task_id)
    if task is None:
        raise TaskNotFoundError(task_id)
    earlier = store.where(conn, "task", "session_id=? AND id<? LIMIT 1",
                          (task["session_id"], task_id))
    resume = bool(earlier)
    if hook_base_url:
        write_permission_hook_config(boxes, task["box_id"], hook_base_url,
                                     hook_token, task["user_id"], task_id)
    store.update(conn, "task", task_id, {"status": "running"})
    cmd = build_command(task["provider"], task["prompt_text"],
                        session_id=task["session_id"], resume=resume)
    try:
        out = boxes.run_command(task["box_id"], cmd, timeout=MAX_TASK_SECONDS)
    except Exception as exc:
        store.update(conn, "task", task_id, {"status": "failed", "error": str(exc)})
        return get_task(conn, task_id)
    values = finished_values(out.get("stdout", ""), out.get("stderr", ""))
    store.update(conn, "task", task_id, values)
    return get_task(conn, task_id)


def execute_task(conn: sqlite3.Connection, boxes, **kwargs) -> dict:
    """create + start in one call (manual tasks)."""
    task = create_task(conn, **kwargs)
    return start_task(conn, boxes, task["id"])


def sync_task_status(conn: sqlite3.Connection, task: dict) -> dict:
    """Recover tasks orphaned mid-launch: stuck starting -> failed,
    stale queued -> failed so the background loop can retry."""
    try:
        created = datetime.fromisoformat(task["created_at"])
    except (KeyError, ValueError):
        return task
    age = (datetime.now(timezone.utc) - created).total_seconds()
    if task["status"] == "starting" and age > STUCK_STARTING_SECONDS:
        store.update(conn, "task", task["id"], {"status": "failed", "error": "launcher died mid-launch"})
    elif task["status"] == "queued" and age > QUEUED_RECOVERY_SECONDS:
        store.update(conn, "task", task["id"], {"status": "failed", "error": "orphaned before launch"})
    return get_task(conn, task["id"])


def sync_active_tasks(conn: sqlite3.Connection) -> int:
    """Finish tasks nobody is polling (scheduled runs). Returns count."""
    active = store.where(conn, "task",
                         "status IN ('queued','starting','pending','running','waiting_approval')")
    for task in active:
        sync_task_status(conn, task)
    time.sleep(0)
    return len(active)
