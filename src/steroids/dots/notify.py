"""Notifications. Port of open-dots notification_service.py.

Same behavior: numeric user_ids are Telegram chat ids (web_… guests
have no chat); permission asks go out with inline Allow-once /
Always-allow / Deny buttons. Stdlib urllib instead of python-telegram;
works from any process (API or scheduler) without a running bot.
"""
import json
import logging
import urllib.parse
import urllib.request

from .config import settings

logger = logging.getLogger(__name__)


def telegram_chat_id(user_id: str) -> int | None:
    return int(user_id) if user_id.isdigit() else None


def _api(method: str, payload: dict):
    token = settings.TELEGRAM_BOT_TOKEN
    if not token:
        return None
    url = f"https://api.telegram.org/bot{token}/{method}"
    req = urllib.request.Request(url, data=json.dumps(payload).encode(),
                                 headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=20) as res:
            return json.load(res)
    except Exception:
        logger.exception("telegram %s failed", method)
        return None


def send_telegram_message(chat_id: int, text: str) -> bool:
    if not settings.TELEGRAM_BOT_TOKEN:
        return False
    return _api("sendMessage", {"chat_id": chat_id, "text": text}) is not None


def send_permission_ask(chat_id: int, ask: dict) -> bool:
    """Notify + inline buttons. Callback data "ask:<id>:<decision>:<always>"
    is resolved by dots.bot like telegram_bot.py does."""
    if not settings.TELEGRAM_BOT_TOKEN:
        return False
    what = ask.get("tool") or ask.get("connector") or ask.get("bucket")
    text = f"Task #{ask['task_id']} wants to use: {what} (bucket: {ask['bucket']}).\nAllow it?"
    keyboard = {"inline_keyboard": [
        [{"text": "Allow once", "callback_data": f"ask:{ask['id']}:allow:0"},
         {"text": "Always allow", "callback_data": f"ask:{ask['id']}:allow:1"}],
        [{"text": "Deny", "callback_data": f"ask:{ask['id']}:deny:0"}]]}
    return _api("sendMessage", {"chat_id": chat_id, "text": text,
                                "reply_markup": keyboard}) is not None
