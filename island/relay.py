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

_link_reqs = {}  # token -> {label, expires, key|None}
_link_lock = threading.Lock()
LINK_TTL = 300  # a link knock lives 5 minutes unanswered


def request_link(label="Phone"):
    """A new device knocks: returns a token the PC owner approves one-tap.
    One knock per label — a retry replaces the stale one, so the PC never
    stacks duplicate Allow rows (or double notices) for the same phone."""
    _sweep()
    label = str(label or "Phone")[:40]
    token = secrets.token_hex(8)
    with _link_lock:
        for t, v in list(_link_reqs.items()):
            if v["label"] == label and not v["key"]:
                del _link_reqs[t]
        _link_reqs[token] = {"label": label,
                             "expires": time.time() + LINK_TTL,
                             "key": None}
    return token


def pending_links():
    now = time.time()
    with _link_lock:
        return [{"token": t, "label": v["label"]}
                for t, v in _link_reqs.items()
                if v["expires"] > now and not v["key"]]


def approve_link(token, key=None):
    """PC owner allows the knock, granting a hub key. The PC passes its
    own key so the phone joins the SAME room (drops route by key); when
    no key is supplied a fresh one is minted. None when stale."""
    _sweep()
    with _link_lock:
        hit = _link_reqs.get(str(token or ""))
        if not hit or hit["expires"] < time.time() or hit["key"]:
            return None
        hit["key"] = key or secrets.token_hex(16)
        return hit["key"]


def link_status(token):
    """Knocker polls: {approved, key?}. Approved keys pop (single read)."""
    _sweep()
    with _link_lock:
        hit = _link_reqs.get(str(token or ""))
        if not hit:
            return {"approved": False}
        if not hit["key"]:
            return {"approved": False}
        key = hit.pop("key")
        _link_reqs.pop(str(token or ""), None)
        return {"approved": True, "key": key}

_hub = {}  # key -> set of (socket, send_lock)
_hub_lock = threading.Lock()


def _sweep():
    now = time.time()
    with _pending_lock:
        for pin in [p for p, (_, exp) in _pending.items() if exp < now]:
            del _pending[pin]
    with _link_lock:
        for tok in [t for t, v in _link_reqs.items()
                    if v["expires"] < now]:
            _link_reqs.pop(tok, None)


def qr_pair(include_key=False):
    """Mint a PIN + QR. Returns {png_b64, pin, expires}.

    include_key=True reveals the hub key too — the bridge sets that only
    for localhost callers, so the PC that minted the code can join its own
    hub. LAN callers get PIN-only and must verify.
    """
    _sweep()
    issued = drop_pair.mint_pin()
    key = secrets.token_hex(16)
    with _pending_lock:
        _pending[issued["pin"]] = (key, issued["expires"])
    mat, _ver = drop_qr.encode("RL1:%s" % issued["pin"])
    out = {"png_b64": base64.b64encode(
        drop_qr.to_png(mat)).decode(),
        "pin": issued["pin"], "expires": issued["expires"]}
    if include_key:
        out["key"] = key
    return out


def dl_qr(url):
    """QR of a plain URL (scan → opens in any camera app). Powers the
    scan-to-get-the-app card: no custom scheme, instant PWA install page."""
    mat, _ver = drop_qr.encode(url)
    return {"png_b64": base64.b64encode(drop_qr.to_png(mat)).decode(),
            "url": url}


_local_key = None


def local_key():
    """This machine's own hub key — one stable room per bridge. No PIN, no
    knock. The bridge only hands it to localhost callers (a USB-forwarded
    phone counts: adb reverse presents as localhost), so a LAN device can
    never self-mint. Every screen on this bridge auto-joins the same room:
    island to island, zero taps."""
    global _local_key
    if _local_key is None:
        _local_key = secrets.token_hex(16)
    return _local_key


def verify_pin(pin):
    """Trade a live PIN for its relay key. None when wrong/expired."""
    _sweep()
    with _pending_lock:
        hit = _pending.pop(str(pin or "").strip(), None)
    return {"key": hit[0]} if hit else None


def hub_send(key, text, skip=None):
    """Push a text frame to every socket holding key, except the sender.

    Skipping the sender keeps drops and chat lines from echoing back into
    the device that sent them (it already shows its own). Backend inject
    passes no socket and still reaches everyone.
    """
    with _hub_lock:
        targets = list(_hub.get(key, ()))
    for sock, lock in targets:
        if sock is skip:
            continue
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
    if len(raw) < 126:
        head = bytes([0x81, len(raw)])
    elif len(raw) < 65536:
        head = struct.pack(">BBH", 0x81, 126, len(raw))
    else:  # photo-size inline files: 64-bit length, not just 16-bit
        head = struct.pack(">BBQ", 0x81, 127, len(raw))
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
            # big-int XOR: C speed, not a Python byte loop (~3MB/s → ~100MB/s).
            rep = (mask * ((len(payload) + 3) // 4))[:len(payload)]
            payload = (int.from_bytes(payload, "big") ^
                       int.from_bytes(rep, "big")).to_bytes(len(payload), "big")
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
            hub_send(key, payload.decode(), skip=sock)
    except (ConnectionError, OSError, KeyError):
        pass
    finally:
        _hub_discard(key, sock)
        try:
            sock.close()
        except OSError:
            pass
