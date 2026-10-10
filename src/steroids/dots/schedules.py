"""Schedules. Port of open-dots schedule_service.py.

Same semantics: cron + timezone per schedule, 30s poll loops,
misfire>15min skipped, 3 consecutive failures (or need-user-action on
first) auto-pauses, reports exactly once. Only change: stdlib cron
matcher instead of APScheduler, sqlite instead of Postgres.
"""
import sqlite3
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from . import store

MISFIRE_GRACE_SECONDS = 900
POLL_BATCH_SIZE = 20
REPORT_BATCH_SIZE = 20
MAX_CONSECUTIVE_FAILURES = 3
NEEDS_USER_ACTION_MARKERS = (
    "Failed to authenticate",
    "No credential found for user",
    "Unsupported provider",
)
UPDATABLE_FIELDS = {"provider", "box_id", "prompt_text", "cron_expression", "timezone"}
WEEKDAY_NAMES = ("sun", "mon", "tue", "wed", "thu", "fri", "sat")


class ScheduleNotFoundError(Exception):
    pass


class InvalidScheduleError(Exception):
    pass


class ScheduleInactiveError(Exception):
    pass


def _translate_weekday(expr: str) -> str:
    """Crontab Sunday=0 -> names (open-dots used APScheduler Monday=0)."""
    minute, hour, day, month, weekday = expr.split()
    parts = []
    for part in weekday.split(","):
        if part == "*":
            parts.append(part)
            continue
        chunk = ""
        for piece in part.split(","):
            if "-" in piece or "/" in piece or piece.isdigit():
                nums = piece.replace("/", "-").split("-")
                try:
                    vals = [int(n) for n in nums if n.isdigit()]
                except ValueError:
                    chunk = piece
                    break
                chunk = ",".join(WEEKDAY_NAMES[v % 7] for v in
                                 range(vals[0], (vals[1] if len(vals) > 1 else vals[0]) + 1))
            else:
                chunk = piece
        parts.append(chunk)
    return f"{minute} {hour} {day} {month} {','.join(parts)}"


def _field_matches(field: str, value: int, names: tuple = ()) -> bool:
    if field == "*":
        return True
    for part in field.split(","):
        step = 1
        if "/" in part:
            part, _, step_s = part.partition("/")
            step = int(step_s)
        if part == "*":
            if value % step == 0:
                return True
            continue
        if "-" in part:
            lo, _, hi = part.partition("-")
            def num(s):
                s = s.lower()
                return names.index(s) if s in names else int(s)
            if num(lo) <= value <= num(hi) and (value - num(lo)) % step == 0:
                return True
            continue
        s = part.lower()
        cand = names.index(s) if s in names else int(s)
        if cand == value:
            return True
    return False


def compute_next_run(cron_expression: str, tz_name: str, after: datetime) -> datetime:
    try:
        parts = cron_expression.split()
        if len(parts) != 5:
            raise ValueError("need 5 fields")
        minute, hour, day, month, weekday = parts
        tz = ZoneInfo(tz_name)
    except (ValueError, ZoneInfoNotFoundError) as exc:
        raise InvalidScheduleError(f"Invalid cron {cron_expression!r}: {exc}") from exc
    cand = (after + timedelta(minutes=1)).astimezone(tz).replace(second=0, microsecond=0)
    for _ in range(525600 + 60):  # ~1 year of minutes, then give up
        w = (cand.isoweekday() % 7)  # Sunday=0 like crontab
        if (_field_matches(minute, cand.minute) and _field_matches(hour, cand.hour)
                and _field_matches(day, cand.day) and _field_matches(month, cand.month)
                and _field_matches(weekday, w, WEEKDAY_NAMES)):
            if not day.startswith("*") and not weekday.startswith("*"):
                day_ok = _field_matches(day, cand.day)
                wday_ok = _field_matches(weekday, w, WEEKDAY_NAMES)
                if not (day_ok or wday_ok):
                    cand += timedelta(minutes=1)
                    continue
            return cand.astimezone(timezone.utc)
        cand += timedelta(minutes=1)
    raise InvalidScheduleError(f"Cron expression {cron_expression!r} never fires")


def _sched(row: dict) -> dict:
    row = dict(row)
    row["is_active"] = bool(row["is_active"])
    return row


def create_schedule(conn: sqlite3.Connection, *, user_id: str, provider: str,
                    box_id: str, prompt_text: str, cron_expression: str,
                    tz_name: str = "UTC") -> dict:
    from .tasks import PROVIDER_COMMANDS
    if provider not in PROVIDER_COMMANDS:
        raise InvalidScheduleError(f"Unsupported provider: {provider}")
    nxt = compute_next_run(cron_expression, tz_name, datetime.now(timezone.utc))
    return _sched(store.get(conn, "schedule", store.insert(conn, "schedule", {
        "user_id": user_id, "provider": provider, "box_id": box_id,
        "prompt_text": prompt_text, "cron_expression": cron_expression,
        "timezone": tz_name, "is_active": 1, "next_run_at": nxt.isoformat()})))


def get_schedule(conn: sqlite3.Connection, schedule_id: int, user_id: str) -> dict:
    row = store.get(conn, "schedule", schedule_id)
    if row is None or row["user_id"] != user_id or row["deleted_at"]:
        raise ScheduleNotFoundError(schedule_id)
    return _sched(row)


def list_schedules(conn: sqlite3.Connection, user_id: str) -> list:
    return [_sched(r) for r in store.where(
        conn, "schedule", "user_id=? AND deleted_at IS NULL ORDER BY id", (user_id,))]


def update_schedule(conn: sqlite3.Connection, schedule_id: int, user_id: str, fields: dict) -> dict:
    sched = get_schedule(conn, schedule_id, user_id)
    patch = {k: v for k, v in fields.items() if k in UPDATABLE_FIELDS}
    if "cron_expression" in patch or "timezone" in patch:
        nxt = compute_next_run(patch.get("cron_expression", sched["cron_expression"]),
                               patch.get("timezone", sched["timezone"]),
                               datetime.now(timezone.utc))
        patch["next_run_at"] = nxt.isoformat()
    store.update(conn, "schedule", schedule_id, patch)
    return get_schedule(conn, schedule_id, user_id)


def pause_schedule(conn: sqlite3.Connection, schedule_id: int, user_id: str) -> dict:
    get_schedule(conn, schedule_id, user_id)
    store.update(conn, "schedule", schedule_id, {"is_active": 0})
    return get_schedule(conn, schedule_id, user_id)


def resume_schedule(conn: sqlite3.Connection, schedule_id: int, user_id: str) -> dict:
    sched = get_schedule(conn, schedule_id, user_id)
    nxt = compute_next_run(sched["cron_expression"], sched["timezone"], datetime.now(timezone.utc))
    store.update(conn, "schedule", schedule_id,
                 {"is_active": 1, "consecutive_failures": 0, "paused_reason": None,
                  "last_error": None, "next_run_at": nxt.isoformat()})
    return get_schedule(conn, schedule_id, user_id)


def delete_schedule(conn: sqlite3.Connection, schedule_id: int, user_id: str) -> None:
    get_schedule(conn, schedule_id, user_id)
    conn.execute("UPDATE schedule SET deleted_at=?, is_active=0 WHERE id=?",
                 (datetime.now(timezone.utc).isoformat(), schedule_id))
    conn.commit()


def run_schedule_now(conn: sqlite3.Connection, schedule_id: int, user_id: str) -> dict:
    sched = get_schedule(conn, schedule_id, user_id)
    if not sched["is_active"]:
        raise ScheduleInactiveError(schedule_id)
    return _enqueue_occurrence(conn, sched, datetime.now(timezone.utc))


def list_schedule_runs(conn: sqlite3.Connection, schedule_id: int, user_id: str) -> list:
    get_schedule(conn, schedule_id, user_id)
    return store.where(conn, "task", "schedule_id=? ORDER BY id DESC", (schedule_id,))


def _needs_user_action(error: str | None) -> bool:
    return bool(error) and any(m in error for m in NEEDS_USER_ACTION_MARKERS)


def _truncate(text: str, limit: int = 3500) -> str:
    return text if len(text) <= limit else text[:limit] + "…"


def _enqueue_occurrence(conn: sqlite3.Connection, sched: dict, at: datetime) -> dict:
    from .tasks import create_task
    nxt = compute_next_run(sched["cron_expression"], sched["timezone"], at)
    store.update(conn, "schedule", sched["id"], {"last_run_at": at.isoformat(), "next_run_at": nxt.isoformat()})
    return store.get(conn, "task", store.insert(conn, "task", {
        "user_id": sched["user_id"], "provider": sched["provider"], "box_id": sched["box_id"],
        "prompt_text": sched["prompt_text"], "status": "queued",
        "session_id": __import__("uuid").uuid4().hex,
        "schedule_id": sched["id"], "scheduled_for": at.isoformat()}))


def poll_due_schedules(conn: sqlite3.Connection, boxes=None) -> int:
    """Claim due schedules and enqueue one task each. Returns enqueued count."""
    from . import tasks as _tasks
    due = store.where(conn, "schedule",
                      "is_active=1 AND deleted_at IS NULL AND next_run_at<=? ORDER BY next_run_at LIMIT ?",
                      (datetime.now(timezone.utc).isoformat(), POLL_BATCH_SIZE))
    n = 0
    for sched in due:
        sched = _sched(sched)
        active = store.where(conn, "task", "schedule_id=? AND status IN ('queued','starting','pending','running','waiting_approval') LIMIT 1", (sched["id"],))
        at = datetime.now(timezone.utc)
        if active:
            store.update(conn, "schedule", sched["id"], {"last_error": "previous run still active"})
            nxt = compute_next_run(sched["cron_expression"], sched["timezone"], at)
            store.update(conn, "schedule", sched["id"], {"next_run_at": nxt.isoformat()})
            continue
        if datetime.fromisoformat(sched["next_run_at"]) < at - timedelta(seconds=MISFIRE_GRACE_SECONDS):
            store.update(conn, "schedule", sched["id"], {"last_error": "missed by >15min, skipped"})
            nxt = compute_next_run(sched["cron_expression"], sched["timezone"], at)
            store.update(conn, "schedule", sched["id"], {"next_run_at": nxt.isoformat()})
            continue
        task = _enqueue_occurrence(conn, sched, at)
        if boxes is not None:
            try:
                _tasks.start_task(conn, boxes, task["id"])
            except Exception as exc:
                store.update(conn, "task", task["id"], {"status": "failed", "error": str(exc)})
        n += 1
    return n


def report_finished_runs(conn: sqlite3.Connection, notify=None) -> int:
    """Report each finished scheduled run exactly once; auto-pause on
    repeated or hopeless failures. Returns reported count."""
    from . import tasks as _tasks
    rows = store.where(conn, "task",
                       "schedule_id IS NOT NULL AND reported_at IS NULL AND status IN ('succeeded','failed') LIMIT ?",
                       (REPORT_BATCH_SIZE,))
    for task in rows:
        sched = store.get(conn, "schedule", task["schedule_id"])
        if sched is None:
            continue
        if task["status"] == "succeeded":
            store.update(conn, "schedule", sched["id"],
                         {"consecutive_failures": 0, "last_error": None})
            text = _truncate(task["result"] or "")
        else:
            fails = (sched["consecutive_failures"] or 0) + 1
            store.update(conn, "schedule", sched["id"], {"consecutive_failures": fails})
            text = f"run failed: {_truncate(task['error'] or '')}"
            if _needs_user_action(task["error"]) or fails >= MAX_CONSECUTIVE_FAILURES:
                reason = task["error"] if _needs_user_action(task["error"]) else f"{fails} failures in a row"
                conn.execute("UPDATE schedule SET is_active=0, paused_reason=? WHERE id=?", (reason, sched["id"]))
                conn.commit()
                text += f"\nSchedule paused: {reason}"
        if notify is not None and str(task["user_id"]).isdigit():
            try:
                notify(int(task["user_id"]), text)
            except Exception:
                pass
        store.update(conn, "task", task["id"],
                     {"reported_at": datetime.now(timezone.utc).isoformat()})
    return len(rows)
