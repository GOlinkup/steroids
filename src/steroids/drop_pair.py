#!/usr/bin/env python3
"""Steroids drop pairing — T1-1: QR+PIN trust, platform TLS after.

One trust for all drop channels: a self-signed cert (openssl CLI, cached),
its SHA-256 fingerprint carried in the QR, and a 6-digit PIN that opens a
session. No in-tree E2E libs exist (stdlib has no AES-GCM/X25519) — secrecy
rides platform TLS; the PIN authorizes, the fingerprint defeats MITM.
"""
import hashlib
import json
import os
import secrets
import subprocess
import time

CERT_DIR = os.path.join(os.environ.get("XDG_CACHE_HOME",
                                        os.path.expanduser("~/.cache")),
                        "steroids", "drop")
CERT_FILE = os.path.join(CERT_DIR, "cert.pem")
KEY_FILE = os.path.join(CERT_DIR, "key.pem")
REGISTRY_FILE = os.path.join(CERT_DIR, "paired.json")
PIN_TTL = 120  # a shown PIN opens sessions for 2 minutes, then dies


def ensure_cert():
    """Mint (once) + return (cert_path, key_path). Shells to openssl CLI."""
    os.makedirs(CERT_DIR, exist_ok=True)
    if not (os.path.exists(CERT_FILE) and os.path.exists(KEY_FILE)):
        subprocess.run(["openssl", "req", "-x509", "-newkey", "rsa:2048",
                        "-keyout", KEY_FILE, "-out", CERT_FILE,
                        "-days", "3650", "-nodes", "-subj", "/CN=steroids-drop"],
                       check=True, capture_output=True)
        os.chmod(KEY_FILE, 0o600)
    return CERT_FILE, KEY_FILE


def fingerprint(cert_path=None):
    """SHA-256 hex of the DER cert — the value the QR carries."""
    cert_path = cert_path or CERT_FILE  # resolve late: tests repoint it
    out = subprocess.run(["openssl", "x509", "-in", cert_path,
                          "-outform", "DER"],
                         check=True, capture_output=True).stdout
    return hashlib.sha256(out).hexdigest()


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
    """Trust-forever check: fingerprint pinned at pair time."""
    return peer_fingerprint in _load_registry()


def pair(peer_fingerprint, alias):
    """Pin a verified fingerprint. Call only after QR/PIN verification."""
    reg = _load_registry()
    reg[peer_fingerprint] = {"alias": alias, "paired_at": time.time()}
    os.makedirs(CERT_DIR, exist_ok=True)
    with open(REGISTRY_FILE, "w") as f:
        json.dump(reg, f)


def unpair(peer_fingerprint):
    """Revoke trust. All channels die with it (checked per session)."""
    reg = _load_registry()
    reg.pop(peer_fingerprint, None)
    with open(REGISTRY_FILE, "w") as f:
        json.dump(reg, f)
