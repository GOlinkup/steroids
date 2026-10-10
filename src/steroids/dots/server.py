"""REST server. Port of open-dots app/routers/*.py + app/main.py.

Same endpoints (/api/v1/link, /sandboxes, /tasks, /permissions,
/schedules). Stdlib http.server instead of FastAPI; Bearer HOOK_TOKEN
on the permission hook; background loops (poll/report/sync) run as
threads, started on serve() like the FastAPI lifespan did.
"""
import json
import re
import threading
import time
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import urlparse

from . import auth_flow, credentials, link, notify, permissions, sandboxes, schedules, store, tasks
from .config import settings

_conn = None
_boxes = None


def _db():
    global _conn
    if _conn is None:
        _conn = store.connect(settings.DOTS_DB_PATH)
    return _conn


def _boxes():
    global _boxes
    if _boxes is None:
        _boxes = sandboxes.provider()
    return _boxes


def _loops():
    while True:
        try:
            schedules.poll_due_schedules(_db(), _boxes())
            tasks.sync_active_tasks(_db())
            schedules.report_finished_runs(_db(), notify.send_telegram_message)
        except Exception:
            pass
        time.sleep(30)


class Handler(BaseHTTPRequestHandler):
    server_version = "dots/0.1.0"

    def _send(self, code: int, obj=None):
        body = b"" if obj is None else json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(body)

    def _body(self) -> dict:
        try:
            return json.loads(self.rfile.read(int(self.headers.get("Content-Length", 0) or 0)) or b"{}")
        except (json.JSONDecodeError, ValueError):
            return {}

    def do_GET(self):
        path = urlparse(self.path).path
        if path.endswith("/health"):
            return self._send(200, {"status": "ok"})
        m = re.match(r".*/tasks/(\d+)$", path)
        if m:
            task = tasks.get_task(_db(), int(m.group(1)))
            return self._send(200, task) if task else self._send(404, {"detail": "not found"})
        m = re.match(r".*/permissions/ask/task/(\d+)$", path)
        if m:
            return self._send(200, permissions.get_pending_ask_for_task(_db(), int(m.group(1))))
        if path.rstrip("/").endswith("/tasks"):
            qs = urlparse(self.path).query
            uid = re.search(r"user_id=([^&]+)", qs)
            return self._send(200, tasks.list_tasks_for_user(_db(), uid.group(1) if uid else ""))
        if path.rstrip("/").endswith("/schedules"):
            qs = urlparse(self.path).query
            uid = re.search(r"user_id=([^&]+)", qs)
            return self._send(200, schedules.list_schedules(_db(), uid.group(1) if uid else ""))
        m = re.match(r".*/link/([A-Za-z0-9]+)$", path)
        if m:
            row = link.get_code(_db(), m.group(1))
            if not row:
                return self._send(404, {"detail": "unknown code"})
            claimed = bool(row["claimed_at"])
            return self._send(200, {"status": "claimed" if claimed else "pending", "user_id": row["user_id"]})
        return self._send(404, {"detail": "unknown route"})

    def do_POST(self):
        from urllib.parse import parse_qs
        path = urlparse(self.path).path
        body = self._body()
        if path.rstrip("/").endswith("/link"):
            return self._send(200, link.create_code(_db()))
        if path.rstrip("/").endswith("/sandboxes/ensure"):
            row = sandboxes.ensure(_db(), _boxes(), user_id=body.get("user_id", ""))
            return self._send(200, {"box_id": row["box_id"], "state": row["state"]})
        if path.rstrip("/").endswith("/tasks"):
            try:
                task = tasks.create_task(_db(), user_id=body["user_id"], provider=body.get("provider", "claude"),
                                         box_id=body["box_id"], prompt_text=body["prompt_text"],
                                         parent_task_id=body.get("parent_task_id"))
            except (tasks.TaskNotFoundError, tasks.ParentTaskActiveError) as exc:
                return self._send(400, {"detail": str(exc)})
            threading.Thread(target=tasks.start_task, args=(_db(), _boxes(), task["id"]), daemon=True).start()
            return self._send(200, task)
        m = re.match(r".*/permissions/ask/(\d+)/answer$", path)
        if m:
            return self._send(200, permissions.answer_ask(
                _db(), int(m.group(1)), body.get("decision", "deny"), bool(body.get("always"))))
        m = re.match(r".*/permissions/check/([^/]+)/(\d+)$", path)
        if m:  # sandbox hook: Bearer HOOK_TOKEN, classify + ask + block
            if self.headers.get("Authorization") != f"Bearer {settings.HOOK_TOKEN}":
                return self._send(401, {"detail": "bad hook token"})
            user_id, task_id = m.group(1), int(m.group(2))
            bucket, connector, tool = permissions.classify(body.get("tool_name", ""), body)
            if permissions.check_permission(_db(), user_id, bucket, connector, tool) == "allow":
                return self._send(200, {"decision": "allow"})
            ask = permissions.create_ask(_db(), user_id, bucket, task_id, connector, tool)
            chat = notify.telegram_chat_id(user_id)
            if chat:
                notify.send_permission_ask(chat, ask)
            decision = permissions.poll_for_answer(_db(), ask["id"])
            return self._send(200, {"decision": decision})
        if path.rstrip("/").endswith("/schedules"):
            try:
                return self._send(200, schedules.create_schedule(
                    _db(), user_id=body["user_id"], provider=body.get("provider", "claude"),
                    box_id=body["box_id"], prompt_text=body["prompt_text"],
                    cron_expression=body["cron_expression"], tz_name=body.get("timezone", "UTC")))
            except schedules.InvalidScheduleError as exc:
                return self._send(400, {"detail": str(exc)})
        m = re.match(r".*/schedules/(\d+)/(pause|resume|run-now)$", path)
        if m:
            qs = parse_qs(urlparse(self.path).query)
            uid = (qs.get("user_id") or [""])[0]
            try:
                fn = {"pause": schedules.pause_schedule, "resume": schedules.resume_schedule,
                      "run-now": schedules.run_schedule_now}[m.group(2)]
                return self._send(200, fn(_db(), int(m.group(1)), uid))
            except (schedules.ScheduleNotFoundError, schedules.ScheduleInactiveError) as exc:
                return self._send(404 if "not found" in str(exc).lower() else 400, {"detail": str(exc)})
        return self._send(404, {"detail": "unknown route"})

    def do_DELETE(self):
        from urllib.parse import parse_qs
        m = re.match(r".*/schedules/(\d+)$", urlparse(self.path).path)
        if m:
            qs = parse_qs(urlparse(self.path).query)
            try:
                schedules.delete_schedule(_db(), int(m.group(1)), (qs.get("user_id") or [""])[0])
                return self._send(204)
            except schedules.ScheduleNotFoundError as exc:
                return self._send(404, {"detail": str(exc)})
        return self._send(404, {"detail": "unknown route"})

    def log_message(self, *args):
        pass


def serve(port: int = 8000) -> None:
    threading.Thread(target=_loops, daemon=True).start()
    HTTPServer(("127.0.0.1", port), Handler).serve_forever()
