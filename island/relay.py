#!/usr/bin/env python3
"""Self WS relay for the React island — stdlib only (RFC 6455 server slice).

Browser flow: GET /relay/qr -> {png_b64, pin, expires};
POST /relay/verify {pin} -> {key}; WS /relay/ws?key=K carries frames.
Backend inject: POST /relay/send {key, frame} (s1 Python peers use this).

Pairing reuses s1: drop_pair.mint_pin owns PIN lifecycle, drop_qr
encodes the PIN QR. Frames carry the sender's idempotency key; the hub
routes by connection key and drops mismatched frames.
"""
import base64
import hashlib
import json
import os
import secrets
import struct
import sys
import threading
import time

sys.path.insert(0, os.path.join(os.path.dirname(
    os.path.dirname(os.path.abspath(__file__))), "src"))
from steroids import drop_pair, drop_qr  # noqa: E402

_WS_GUID = "258EAFA5-E914-47DA-95CA-CAB33FB9A466"

_pending = {}  # pin -> (key, expires)
_pending_lock = threading.Lock()

_hub = {}  # key -> set of (socket, send_lock)
_hub_lock = threading.Lock()


def _sweep():
    now = time.time()
    with _pending_lock:
        for pin in [p for p, (_, exp) in _pending.items() if exp < now]:
            del _pending[pin]


def qr_pair():
    """Mint a PIN + QR. Returns {png_b64, pin, expires}."""
    _sweep()
    issued = drop_pair.mint_pin()
    key = secrets.token_hex(16)
    with _pending_lock:
        _pending[issued["pin"]] = (key, issued["expires"])
    mat, _ver = drop_qr.encode("RL1:%s" % issued["pin"])
    return {"png_b64": base64.b64encode(
        drop_qr.to_png(mat)).decode(),
        "pin": issued["pin"], "expires": issued["expires"]}


def verify_pin(pin):
    """Trade a live PIN for its relay key. None when wrong/expired."""
    _sweep()
    with _pending_lock:
        hit = _pending.pop(str(pin or "").strip(), None)
    return {"key": hit[0]} if hit else None


def hub_send(key, text):
    """Backend inject: push a text frame to every socket holding key."""
    with _hub_lock:
        targets = list(_hub.get(key, ()))
    for sock, lock in targets:
        try:
            with lock:
                sock.sendall(_ws_frame(text))
        except OSError:
            _hub_discard(key, sock)


def _hub_add(key, sock):
    with _hub_lock:
        _hub.setdefault(key, set()).add((sock, threading.Lock()))


def _hub_discard(key, sock):
    with _hub_lock:
        members = _hub.get(key)
        if not members:
            return
        for m in [m for m in members if m[0] is sock]:
            members.discard(m)
        if not members:
            _hub.pop(key, None)


def _ws_frame(text):
    raw = text.encode()
    head = bytes([0x81, len(raw)]) if len(raw) < 126 else struct.pack(
        ">BBH", 0x81, 126, len(raw))
    return head + raw


def _ws_recv(rfile):
    """Yield (opcode, bytes) data frames; raises on close/error."""
    while True:
        head = rfile.read(2)
        if len(head) < 2:
            raise ConnectionError("eof")
        b1, b2 = head[0], head[1]
        opcode = b1 & 0x0F
        masked = b2 & 0x80
        length = b2 & 0x7F
        if length == 126:
            length = struct.unpack(">H", rfile.read(2))[0]
        elif length == 127:
            length = struct.unpack(">Q", rfile.read(8))[0]
        mask = rfile.read(4) if masked else b""
        payload = b""
        while len(payload) < length:
            chunk = rfile.read(length - len(payload))
            if not chunk:
                raise ConnectionError("eof")
            payload += chunk
        if masked:
            payload = bytes(
                c ^ mask[i % 4] for i, c in enumerate(payload))
        if opcode == 0x8:
            raise ConnectionError("close")
        if opcode == 0x9:  # ping -> caller pongs; never surfaces
            yield (opcode, payload)
            continue
        if opcode in (0x1, 0x2):
            yield (opcode, payload)


def handle_ws(handler, key):
    """Hijack the handler connection into a relay socket for key."""
    if not key:
        handler.send_response(403)
        handler.end_headers()
        return
    accept = base64.b64encode(hashlib.sha1(
        (handler.headers["Sec-WebSocket-Key"] + _WS_GUID).encode()
    ).digest()).decode()
    sock = handler.connection
    sock.sendall((
        "HTTP/1.1 101 Switching Protocols\r\n"
        "Upgrade: websocket\r\n"
        "Connection: Upgrade\r\n"
        "Sec-WebSocket-Accept: %s\r\n\r\n" % accept).encode())
    sock.settimeout(120)
    _hub_add(key, sock)
    try:
        rfile = sock.makefile("rb")
        for opcode, payload in _ws_recv(rfile):
            if opcode == 0x9:
                try:
                    sock.sendall(bytes([0x8A, 0x00]))
                except OSError:
                    break
                continue
            try:
                frame = json.loads(payload.decode())
            except ValueError:
                continue
            if not isinstance(frame, dict) or frame.get("key") != key:
                continue  # mismatched key: drop, never route
            hub_send(key, payload.decode())
    except (ConnectionError, OSError, KeyError):
        pass
    finally:
        _hub_discard(key, sock)
        try:
            sock.close()
        except OSError:
            pass
