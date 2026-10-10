"""Credential crypto. Port of open-dots backend/app/core/crypto.py.

Same encrypt()/decrypt() API and key-rotation semantics (comma-separated
keys, first encrypts, all decrypt). Uses cryptography.Fernet when
installed; otherwise a stdlib fallback (NOT as strong — warns once).
No new dependency for steroids core.
"""
import base64
import hashlib
import hmac
import logging
import os
import secrets

logger = logging.getLogger(__name__)
_warned = False

try:
    from cryptography.fernet import Fernet, MultiFernet

    def _fernet():
        keys = [k.strip() for k in os.environ.get("TOKEN_ENCRYPTION_KEYS", "").split(",") if k.strip()]
        if not keys:
            raise ValueError("TOKEN_ENCRYPTION_KEYS is not set")
        return MultiFernet([Fernet(k.encode()) for k in keys])

    def encrypt(plaintext: str) -> str:
        return _fernet().encrypt(plaintext.encode()).decode()

    def decrypt(ciphertext: str) -> str:
        return _fernet().decrypt(ciphertext.encode()).decode()

except ImportError:

    def _xor(data: bytes, key: bytes) -> bytes:
        return bytes(b ^ key[i % len(key)] for i, b in enumerate(data))

    def _fallback_keys() -> list:
        raw = os.environ.get("TOKEN_ENCRYPTION_KEYS", "")
        return [k.strip() for k in raw.split(",") if k.strip()]

    def encrypt(plaintext: str) -> str:
        global _warned
        keys = _fallback_keys()
        if not keys:
            raise ValueError("TOKEN_ENCRYPTION_KEYS is not set")
        if not _warned:
            logger.warning("cryptography not installed; dots crypto uses obfuscation fallback — install cryptography for Fernet")
            _warned = True
        key = hashlib.sha256(keys[0].encode()).digest()
        nonce = secrets.token_bytes(16)
        body = _xor(plaintext.encode(), key + nonce)
        tag = hmac.new(key, nonce + body, hashlib.sha256).digest()[:16]
        return base64.urlsafe_b64encode(nonce + tag + body).decode()

    def decrypt(ciphertext: str) -> str:
        keys = _fallback_keys()
        if not keys:
            raise ValueError("TOKEN_ENCRYPTION_KEYS is not set")
        raw = base64.urlsafe_b64decode(ciphertext.encode())
        nonce, tag, body = raw[:16], raw[16:32], raw[32:]
        for k in keys:  # rotation: try each key
            key = hashlib.sha256(k.encode()).digest()
            if hmac.compare_digest(hmac.new(key, nonce + body, hashlib.sha256).digest()[:16], tag):
                return _xor(body, key + nonce).decode()
        raise ValueError("decrypt failed: no key matched")
