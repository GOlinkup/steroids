"""Background loop. Port of open-dots backend/app/core/background.py.

Only change: stdlib logging instead of structlog.
"""
import asyncio
import logging
from collections.abc import Awaitable, Callable

logger = logging.getLogger(__name__)


async def run_every(seconds: float, job: Callable[[], Awaitable[None]]) -> None:
    # Sleeps after each run finishes, so runs of the same job never overlap.
    while True:
        try:
            await job()
        except Exception:
            logger.exception("background job failed: %s", getattr(job, "__name__", job))
        await asyncio.sleep(seconds)
