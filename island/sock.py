"""Socket hygiene — port of CodeIsland's HookServer safeguards (MIT).

Owner-only Unix socket, payload caps, deny-before-drop: on overflow the
hook answers deny FIRST, then drops — the CLI must never JSON-parse "".
Stdlib only.
"""
import json
import os
import socket
import stat

MAX_PAYLOAD = 10_485_760  # 10 MB like theirs

DENY = {"hookSpecificOutput": {"decision": "deny",
                               "reason": "payload over 10MB cap"}}


def secure_path(path):
    """makedirs parent 0700, unlink stale socket. Returns parent dir."""
    parent = os.path.dirname(path)
    try:
        os.makedirs(parent, mode=0o700, exist_ok=True)
        os.chmod(parent, 0o700)
    except OSError:
        pass
    try:
        if os.path.exists(path):
            os.unlink(path)
    except OSError:
        pass
    return parent


def listen(path):
    """Bound owner-only Unix socket (0600 via umask). Caller accept()s."""
    secure_path(path)
    old = os.umask(0o077)
    try:
        s = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        s.bind(path)
        try:
            os.chmod(path, 0o600)
        except OSError:
            pass
        s.listen(8)
        return s
    finally:
        os.umask(old)


def owner_only(path):
    """True when path exists and has no group/other perms."""
    try:
        return stat.S_IMODE(os.stat(path).st_mode) & 0o077 == 0
    except OSError:
        return False


def check_size(n):
    """(ok, response_bytes|None): overflow -> deny JSON to send first."""
    if n <= MAX_PAYLOAD:
        return True, None
    return False, json.dumps(DENY).encode()
