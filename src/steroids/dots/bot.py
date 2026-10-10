"""Telegram bot. Port of open-dots backend/app/telegram_bot.py.

Same commands (/start /link /connect /connect_github /schedule
/schedules /pause /resume /unschedule, plain-text tasks, OAuth code
paste, Allow/Deny buttons). Stdlib long-polling via urllib instead of
python-telegram — no new dependency. All state in dots.store.
"""
import re
import threading
import time

from . import auth_flow, credentials, link, notify, permissions, sandboxes, schedules, store, tasks

PROVIDER = "claude"
POLL_INTERVAL_SECONDS = 3
POLL_ATTEMPTS = tasks.MAX_TASK_SECONDS // POLL_INTERVAL_SECONDS + 1

TIME_RE = re.compile(r"^([01]?\d|2[0-3]):([0-5]\d)$")
WEEKDAY_CODES = {"sun": 0, "mon": 1, "tue": 2, "wed": 3, "thu": 4, "fri": 5, "sat": 6}
SCHEDULE_USAGE = ("Usage: /schedule hourly <prompt> | /schedule daily HH:MM <prompt> | "
                  "/schedule weekdays HH:MM <prompt> | /schedule weekly <day> HH:MM <prompt>")

_awaiting_code: dict = {}  # chat_id -> box_id while waiting for an OAuth paste


def parse_schedule_args(args: list) -> tuple:
    """(cron_expression, prompt_text) — same grammar as open-dots."""
    if not args:
        raise ValueError(SCHEDULE_USAGE)
    frequency, rest = args[0].lower(), args[1:]
    if frequency == "hourly":
        if not rest:
            raise ValueError(SCHEDULE_USAGE)
        return "0 * * * *", " ".join(rest)
    if frequency in ("daily", "weekdays"):
        if len(rest) < 2 or not TIME_RE.match(rest[0]):
            raise ValueError(SCHEDULE_USAGE)
        hour, minute = map(int, rest[0].split(":"))
        cron = f"{minute} {hour} * * *" if frequency == "daily" else f"{minute} {hour} * * 1-5"
        return cron, " ".join(rest[1:])
    if frequency == "weekly":
        if len(rest) < 3 or rest[0].lower() not in WEEKDAY_CODES or not TIME_RE.match(rest[1]):
            raise ValueError(SCHEDULE_USAGE)
        weekday = WEEKDAY_CODES[rest[0].lower()]
        hour, minute = map(int, rest[1].split(":"))
        return f"{minute} {hour} * * {weekday}", " ".join(rest[2:])
    raise ValueError(SCHEDULE_USAGE)


class Bot:
    def __init__(self, db_path: str = ""):
        from .config import settings
        self.token = settings.TELEGRAM_BOT_TOKEN
        self.conn = store.connect(db_path or settings.DOTS_DB_PATH)
        self.boxes = sandboxes.provider()

    # -- transport (stdlib) --
    def _call(self, method: str, payload: dict) -> dict:
        import json, urllib.request
        req = urllib.request.Request(
            f"https://api.telegram.org/bot{self.token}/{method}",
            data=json.dumps(payload).encode(), headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=30) as res:
            return json.load(res)

    def send(self, chat_id: int, text: str) -> None:
        self._call("sendMessage", {"chat_id": chat_id, "text": text[:4000]})

    def run(self) -> None:
        offset = 0
        while True:
            try:
                data = self._call("getUpdates", {"offset": offset, "timeout": 25})
            except Exception:
                time.sleep(5)
                continue
            for upd in data.get("result", []):
                offset = upd["update_id"] + 1
                try:
                    self.handle(upd)
                except Exception as exc:
                    pass

    # -- dispatch --
    def handle(self, upd: dict) -> None:
        if "callback_query" in upd:
            self._on_callback(upd["callback_query"])
            return
        msg = upd.get("message") or {}
        text = (msg.get("text") or "").strip()
        chat_id = (msg.get("chat") or {}).get("id")
        user_id = str(((msg.get("from") or {}).get("id"))) if msg.get("from") else str(chat_id)
        if not text or chat_id is None:
            return
        if text.startswith("/start"):
            self.send(chat_id, "Send /connect to link your Claude account, then just message me a task.")
        elif text.startswith("/link"):
            self._on_link(chat_id, user_id, text.split()[1:])
        elif text.startswith("/connect_github"):
            self._on_connect(chat_id, user_id, "github")
        elif text.startswith("/connect"):
            self._on_connect(chat_id, user_id, PROVIDER)
        elif text.startswith("/schedule"):
            self._on_schedule(chat_id, user_id, text.split()[1:])
        elif text.startswith("/schedules"):
            rows = schedules.list_schedules(self.conn, user_id)
            self.send(chat_id, "\n".join(f"{s['id']}: {s['prompt_text'][:60]} next={s['next_run_at']}" for s in rows) or "No schedules.")
        elif text.startswith("/pause") or text.startswith("/resume") or text.startswith("/unschedule"):
            self._on_sched_ctl(chat_id, user_id, text)
        elif chat_id in _awaiting_code:
            self._on_code(chat_id, user_id, text)
        else:
            self._on_task(chat_id, user_id, text)

    # -- handlers --
    def _sandbox(self, user_id: str) -> dict:
        return sandboxes.ensure(self.conn, self.boxes, user_id=user_id)

    def _on_link(self, chat_id: int, user_id: str, args: list) -> None:
        if not args:
            self.send(chat_id, "Usage: /link <code> — get a code from the web UI.")
            return
        try:
            link.claim_code(self.conn, args[0], user_id)
        except link.LinkCodeInvalidError:
            self.send(chat_id, "That code isn't valid. Generate a new one on the web page.")
        except link.LinkCodeExpiredError:
            self.send(chat_id, "That code expired. Generate a new one on the web page.")
        else:
            self.send(chat_id, "Linked! Head back to the web page.")

    def _on_connect(self, chat_id: int, user_id: str, provider: str) -> None:
        box = self._sandbox(user_id)
        try:
            if provider == "github":
                login = auth_flow.start_device_login(self.boxes, box["box_id"], provider)
                self.send(chat_id, f"Open {login['url']} and enter code {login['code']}.")
                threading.Thread(target=self._finish_device, args=(chat_id, user_id, box["box_id"]),
                                 daemon=True).start()
            else:
                url = auth_flow.start_login(self.boxes, box["box_id"], provider)
                _awaiting_code[chat_id] = box["box_id"]
                self.send(chat_id, f"Open {url or 'the login page'}, complete it, and paste the code here.")
        except Exception as exc:
            self.send(chat_id, f"Login failed: {exc}")

    def _finish_device(self, chat_id: int, user_id: str, box_id: str) -> None:
        try:
            content = auth_flow.await_device_login(self.boxes, box_id, "github")
            credentials.save_token(self.conn, user_id=user_id, provider="github",
                                   file_path=auth_flow.PROVIDERS["github"]["credential_path"], plaintext=content)
            self.send(chat_id, "GitHub connected.")
        except Exception as exc:
            self.send(chat_id, f"GitHub login failed: {exc}")

    def _on_code(self, chat_id: int, user_id: str, code: str) -> None:
        box_id = _awaiting_code.pop(chat_id)
        try:
            content = auth_flow.submit_code(self.boxes, box_id, PROVIDER, code)
            credentials.save_token(self.conn, user_id=user_id, provider=PROVIDER,
                                   file_path=auth_flow.PROVIDERS[PROVIDER]["credential_path"], plaintext=content)
            self.send(chat_id, "Connected! Send me a task.")
        except Exception as exc:
            self.send(chat_id, f"Login failed: {exc}")

    def _on_task(self, chat_id: int, user_id: str, text: str) -> None:
        box = self._sandbox(user_id)
        if not credentials.inject_credential_into_box(self.conn, self.boxes, user_id, PROVIDER, box["box_id"]):
            self.send(chat_id, "Send /connect first.")
            return
        task = tasks.create_task(self.conn, user_id=user_id, provider=PROVIDER,
                                 box_id=box["box_id"], prompt_text=text)
        threading.Thread(target=self._poll_task, args=(chat_id, task["id"]), daemon=True).start()
        self.send(chat_id, f"Running task #{task['id']}…")

    def _poll_task(self, chat_id: int, task_id: int) -> None:
        task = tasks.get_task(self.conn, task_id)
        try:
            tasks.start_task(self.conn, self.boxes, task_id)
        except Exception as exc:
            self.send(chat_id, f"Task #{task_id} failed: {exc}")
            return
        for _ in range(POLL_ATTEMPTS):
            time.sleep(POLL_INTERVAL_SECONDS)
            task = tasks.get_task(self.conn, task_id)
            if task["status"] not in tasks.ACTIVE_STATUSES:
                break
        task = tasks.get_task(self.conn, task_id)
        self.send(chat_id, task.get("result") or f"Task #{task_id} {task['status']}: {task.get('error') or ''}")

    def _on_callback(self, cb: dict) -> None:
        _, _, ask_id, decision, always = (cb.get("data") or "").split(":")
        ask = permissions.answer_ask(self.conn, int(ask_id), decision, always == "1")
        chat_id = (cb.get("message") or {}).get("chat", {}).get("id")
        if chat_id and ask:
            self.send(chat_id, f"Task #{ask['task_id']}: {decision}")

    def _on_schedule(self, chat_id: int, user_id: str, args: list) -> None:
        try:
            cron, prompt = parse_schedule_args(args)
        except ValueError as exc:
            self.send(chat_id, str(exc))
            return
        box = self._sandbox(user_id)
        sched = schedules.create_schedule(self.conn, user_id=user_id, provider=PROVIDER,
                                          box_id=box["box_id"], prompt_text=prompt,
                                          cron_expression=cron, tz_name="UTC")
        self.send(chat_id, f"Scheduled #{sched['id']}, next {sched['next_run_at']} UTC.")

    def _on_sched_ctl(self, chat_id: int, user_id: str, text: str) -> None:
        parts = text.split()
        if len(parts) < 2 or not parts[1].isdigit():
            self.send(chat_id, "Usage: /pause|/resume|/unschedule <id>")
            return
        sid = int(parts[1])
        try:
            if text.startswith("/pause"):
                schedules.pause_schedule(self.conn, sid, user_id)
            elif text.startswith("/resume"):
                schedules.resume_schedule(self.conn, sid, user_id)
            else:
                schedules.delete_schedule(self.conn, sid, user_id)
            self.send(chat_id, "Done.")
        except Exception as exc:
            self.send(chat_id, f"Failed: {exc}")


def main() -> None:
    Bot().run()
