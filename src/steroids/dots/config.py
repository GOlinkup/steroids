"""Settings. Port of open-dots backend/app/core/config.py.

Only change: stdlib dataclass + .env parsing instead of pydantic-settings
and sqlalchemy URL helpers. Same variable names and defaults.
"""
import os
from dataclasses import dataclass, field


def _load_dotenv(path: str) -> None:
    try:
        with open(path, encoding="utf-8") as fh:
            for line in fh:
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                key, _, value = line.partition("=")
                key, value = key.strip(), value.strip().strip("\"'")
                os.environ.setdefault(key, value)
    except OSError:
        pass


@dataclass
class Settings:
    BOAT_BASE_URL: str = "https://boat.dev/api/v1"
    BOAT_API_KEY: str = ""
    BOAT_ORG_ID: str = ""
    TOKEN_ENCRYPTION_KEYS: str = ""
    TELEGRAM_BOT_TOKEN: str = ""
    TELEGRAM_BOT_USERNAME: str = ""
    FRONTEND_ORIGINS: str = "http://localhost:3000"
    HOOK_TOKEN: str = ""
    PERMISSION_HOOK_BASE_URL: str = ""
    DOTS_DB_PATH: str = field(default_factory=lambda: os.path.expanduser("~/.config/steroids/dots.db"))

    @property
    def FRONTEND_ORIGIN_LIST(self) -> list:
        return [o.strip() for o in self.FRONTEND_ORIGINS.split(",") if o.strip()]


def load(env_file: str = "") -> Settings:
    for candidate in (env_file, os.environ.get("DOTS_ENV", ""), ".env"):
        if candidate:
            _load_dotenv(candidate)
    get = os.environ.get
    return Settings(
        BOAT_BASE_URL=get("BOAT_BASE_URL", Settings.BOAT_BASE_URL),
        BOAT_API_KEY=get("BOAT_API_KEY", ""),
        BOAT_ORG_ID=get("BOAT_ORG_ID", ""),
        TOKEN_ENCRYPTION_KEYS=get("TOKEN_ENCRYPTION_KEYS", ""),
        TELEGRAM_BOT_TOKEN=get("TELEGRAM_BOT_TOKEN", ""),
        TELEGRAM_BOT_USERNAME=get("TELEGRAM_BOT_USERNAME", ""),
        FRONTEND_ORIGINS=get("FRONTEND_ORIGINS", Settings.FRONTEND_ORIGINS),
        HOOK_TOKEN=get("HOOK_TOKEN", ""),
        PERMISSION_HOOK_BASE_URL=get("PERMISSION_HOOK_BASE_URL", ""),
        DOTS_DB_PATH=get("DOTS_DB_PATH", os.path.expanduser("~/.config/steroids/dots.db")),
    )


settings = load()
