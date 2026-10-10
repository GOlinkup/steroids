"""Shared types. Port of open-dots app/schemas/*.py as stdlib dataclasses."""
from dataclasses import dataclass


@dataclass
class Task:
    id: int
    user_id: str
    provider: str
    box_id: str
    prompt_text: str
    status: str
    prompt_id: str | None = None
    session_id: str | None = None
    schedule_id: int | None = None
    scheduled_for: str | None = None
    result: str | None = None
    error: str | None = None


@dataclass
class Schedule:
    id: int
    user_id: str
    provider: str
    box_id: str
    prompt_text: str
    cron_expression: str
    timezone: str
    is_active: bool
    next_run_at: str
    last_error: str | None = None
    consecutive_failures: int = 0
    paused_reason: str | None = None


@dataclass
class PermissionAsk:
    id: int
    task_id: int
    user_id: str
    bucket: str
    connector: str | None = None
    tool: str | None = None
    status: str = "pending"
    decision: str | None = None
