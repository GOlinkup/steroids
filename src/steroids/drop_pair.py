#!/usr/bin/env python3
"""Steroids drop pairing — T1-1: QR+PIN trust, platform TLS after.

One trust for all drop channels: a self-signed cert, its SHA-256
fingerprint carried in the QR, and a 6-digit PIN that opens a session.
No in-tree E2E libs exist (stdlib has no AES-GCM/X25519) — secrecy rides
platform TLS; the PIN authorizes, the fingerprint defeats MITM.

Requires: openssl CLI (declared dep). Absent or failing openssl raises
a clean RuntimeError naming the fix — never a CalledProcessError death.
"""
import hashlib
import json
import os
import secrets
import shutil
import subprocess
import time

REQUIRES = ("openssl CLI",)  # declared external dep, exactly one
CERT_DIR = os.path.join(os.environ.get("XDG_CACHE_HOME",
                                        os.path.expanduser("~/.cache")),
                        "steroids", "drop")
CERT_FILE = os.path.join(CERT_DIR, "cert.pem")
KEY_FILE = os.path.join(CERT_DIR, "key.pem")
REGISTRY_FILE = os.path.join(CERT_DIR, "paired.json")
PIN_TTL = 120  # a shown PIN opens sessions for 2 minutes, then dies


def _openssl(args):
    """Run openssl, refusing cleanly instead of dying on check=True."""
    if shutil.which("openssl") is None:
        raise RuntimeError("openssl CLI required for drop certs "
                           "(install openssl, then retry)")
    proc = subprocess.run(["openssl"] + args, capture_output=True)
    if proc.returncode != 0:
        tail = proc.stderr.decode().strip().splitlines()[-1:]
        raise RuntimeError("openssl failed: %s" % " ".join(tail))
    return proc.stdout


def ensure_cert():
    """Mint (once) + return (cert_path, key_path). Shells to openssl CLI."""
    os.makedirs(CERT_DIR, exist_ok=True)
    if not (os.path.exists(CERT_FILE) and os.path.exists(KEY_FILE)):
        _openssl(["req", "-x509", "-newkey", "rsa:2048",
                  "-keyout", KEY_FILE, "-out", CERT_FILE,
                  "-days", "3650", "-nodes", "-subj", "/CN=steroids-drop"])
        os.chmod(KEY_FILE, 0o600)
    return CERT_FILE, KEY_FILE


def fingerprint(cert_path=None):
    """SHA-256 hex of the DER cert — the value the QR carries."""
    cert_path = cert_path or CERT_FILE  # resolve late: tests repoint it
    der = _openssl(["x509", "-in", cert_path, "-outform", "DER"])
    return hashlib.sha256(der).hexdigest()


def mint_pin():
    """6-digit PIN + expiry epoch. Short-lived by construction."""
    return {"pin": "%06d" % secrets.randbelow(1000000),
            "expires": time.time() + PIN_TTL}


def pin_valid(issued, candidate):
    """True iff candidate matches and the PIN has not expired."""
    return (candidate == issued.get("pin")
            and time.time() < issued.get("expires", 0))


def _load_registry():
    try:
        with open(REGISTRY_FILE) as f:
            return json.load(f)
    except (OSError, ValueError):
        return {}


def is_paired(peer_fingerprint):
    """Trust-forever check: fingerprint pinned at pair time.

    Hex is case-blind: the QR ships UPPER, callers may pass either."""
    return peer_fingerprint.lower() in _load_registry()


def pair(peer_fingerprint, alias):
    """Pin a verified fingerprint. Call only after QR/PIN verification."""
    reg = _load_registry()
    reg[peer_fingerprint.lower()] = {"alias": alias,
                                     "paired_at": time.time()}
    os.makedirs(CERT_DIR, exist_ok=True)
    with open(REGISTRY_FILE, "w") as f:
        json.dump(reg, f)


def unpair(peer_fingerprint):
    """Revoke trust. All channels die with it (checked per session)."""
    reg = _load_registry()
    reg.pop(peer_fingerprint.lower(), None)
    with open(REGISTRY_FILE, "w") as f:
        json.dump(reg, f)
