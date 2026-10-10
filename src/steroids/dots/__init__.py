"""Steroids dots: port of open-dots (github.com/Anil-matcha/open-dots).

Self-hosted coding-agent runner: sandboxes, permission prompts, tasks,
schedules, Telegram bot + web UI client. Adapted to steroids rules:
stdlib only, sqlite instead of Postgres, Boat/Telegram/FastAPI are
optional (lazy imports, local fallbacks). Nothing here imports
router/benchmark.

Provenance: logic mirrors open-dots backend/app/*; see each module header.
"""
DOTS_VERSION = "0.1.0"
DOTS_UPSTREAM = "https://github.com/Anil-matcha/open-dots"
