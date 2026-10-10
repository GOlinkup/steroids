"""Auth flows. Port of open-dots auth_flow_service.py.

Same provider table (login command + credential path + abandon timeout),
same poll budgets (URL/CODE 15x2s, device-complete 150x, device poll 15x),
same session naming. Sync; box ops go through the provider interface.
"""
import re
import time

POLL_INTERVAL_SECONDS = 2
URL_POLL_ATTEMPTS = 15
CODE_POLL_ATTEMPTS = 15
DEVICE_CODE_POLL_ATTEMPTS = 15
DEVICE_COMPLETION_POLL_ATTEMPTS = 150

PROVIDERS = {
    "claude": {
        "login_command": "claude auth login",
        "credential_path": ".claude/.credentials.json",
        "abandon_timeout_seconds": 300,
    },
    "github": {
        "login_command": "gh auth login --hostname github.com --git-protocol https --web",
        "env": {"GH_BROWSER": "true"},
        "credential_path": ".config/gh/hosts.yml",
        "abandon_timeout_seconds": 300,
    },
}


class UnsupportedProviderError(Exception):
    pass


class LoginTimeoutError(Exception):
    pass


class LoginFailedError(Exception):
    pass


def _config(provider: str) -> dict:
    try:
        return PROVIDERS[provider]
    except KeyError:
        raise UnsupportedProviderError(f"Unsupported provider: {provider}")


def _env_prefix(config: dict) -> str:
    return "".join(f"{k}={v} " for k, v in (config.get("env") or {}).items())


def start_login(boxes, box_id: str, provider: str) -> str:
    """Launch the OAuth login inside the sandbox; returns the login URL."""
    config = _config(provider)
    boxes.run_command(box_id, f"{_env_prefix(config)}{config['login_command']}")
    for _ in range(URL_POLL_ATTEMPTS):
        time.sleep(POLL_INTERVAL_SECONDS)
        out = boxes.run_command(box_id, "cat .dots-auth-url 2>/dev/null; true")
        url = (out.get("stdout") or "").strip()
        if url.startswith("http"):
            return url
    # fall back: caller shows the generic provider login page
    return ""


def submit_code(boxes, box_id: str, provider: str, code: str) -> str:
    """Paste the OAuth code back; returns the stored credential content."""
    config = _config(provider)
    boxes.run_command(box_id, f"echo {code!r} > .dots-auth-code")
    for _ in range(CODE_POLL_ATTEMPTS):
        time.sleep(POLL_INTERVAL_SECONDS)
        content = boxes.read_file(box_id, config["credential_path"])
        if content:
            return content
    raise LoginTimeoutError(f"{provider} login timed out waiting for the credential file")


def start_device_login(boxes, box_id: str, provider: str) -> dict:
    """Device flow (GitHub): returns {url, code} for the user to approve."""
    config = _config(provider)
    out = boxes.run_command(box_id, f"{_env_prefix(config)}{config['login_command']}")
    text = (out.get("stdout") or "") + (out.get("stderr") or "")
    code_match = re.search(r"\b([A-Z0-9]{4,8}-[A-Z0-9]{4,8})\b", text)
    url_match = re.search(r"https?://\S+", text)
    return {"url": url_match.group(0) if url_match else "https://github.com/login/device",
            "code": code_match.group(1) if code_match else ""}


def await_device_login(boxes, box_id: str, provider: str) -> str:
    config = _config(provider)
    for _ in range(DEVICE_COMPLETION_POLL_ATTEMPTS):
        time.sleep(POLL_INTERVAL_SECONDS)
        content = boxes.read_file(box_id, config["credential_path"])
        if content:
            return content
    raise LoginTimeoutError(f"{provider} device login was not approved in time")
