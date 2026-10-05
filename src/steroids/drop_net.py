#!/usr/bin/env python3
"""Steroids drop transport — T1-2 announce/register + T1-3 drop (LocalSend
v2 subset, technique-cited, never vendored).

Wire shape mirrors LocalSend so any compatible peer interops: UDP
multicast announce (224.0.0.167:53317), HTTPS JSON REST, self-signed cert
pinned by fingerprint, PIN-gated sessions. Stdlib only.
"""
import hashlib
import http.client
import http.server
import json
import os
import secrets
import socket
import ssl
import struct
import threading
import time
import urllib.parse

MULTICAST_GROUP = "224.0.0.167"  # LocalSend default; Android-safe range
MULTICAST_PORT = 53317
PROTOCOL_VERSION = "2.0"
PEER_TIMEOUT = 120  # stale peers (left network) drop after 2 minutes
SESSION_TTL = 600  # dead sessions stop blocking new prepares after 10 min



def self_info(alias, port, fingerprint):
    return {"alias": alias, "version": PROTOCOL_VERSION,
            "deviceModel": "PC", "deviceType": "desktop",
            "fingerprint": fingerprint, "port": port, "protocol": "https",
            "download": False}


def announce(alias, port, fingerprint, dest=(MULTICAST_GROUP, MULTICAST_PORT)):
    """Fire one multicast presence packet. UDP, never raises."""
    msg = json.dumps(dict(self_info(alias, port, fingerprint),
                          announce=True)).encode()
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM,
                             socket.IPPROTO_UDP)
        sock.setsockopt(socket.IPPROTO_IP, socket.IP_MULTICAST_TTL, 2)
        sock.sendto(msg, dest)
        sock.close()
    except OSError:
        pass  # hostile network: manual-IP fallback covers it


class PeerTable:
    """Live peers with last-seen expiry. Ghosts age out, never linger."""

    def __init__(self):
        self._peers = {}
        self._lock = threading.Lock()

    def seen(self, info, addr):
        with self._lock:
            self._peers[info.get("fingerprint", addr)] = (info, time.time())

    def live(self):
        now = time.time()
        with self._lock:
            stale = [k for k, (_, t) in self._peers.items()
                     if now - t > PEER_TIMEOUT]
            for k in stale:
                del self._peers[k]
            return [info for info, _ in self._peers.values()]


def listen_multicast(peers, stop, port=MULTICAST_PORT):
    """Background: join group, table every announce. Ends on stop event."""
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM,
                         socket.IPPROTO_UDP)
    sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    try:
        sock.bind(("", port))
    except OSError:
        return  # port held by another drop instance; that one listens
    mreq = struct.pack("4sl", socket.inet_aton(MULTICAST_GROUP),
                       socket.INADDR_ANY)
    try:
        sock.setsockopt(socket.IPPROTO_IP, socket.IP_ADD_MEMBERSHIP, mreq)
    except OSError:
        sock.close()
        return  # no multicast here; manual-IP fallback covers it
    sock.settimeout(0.5)
    while not stop.is_set():
        try:
            data, addr = sock.recvfrom(65535)
        except socket.timeout:
            continue
        except OSError:
            break
        try:
            info = json.loads(data.decode())
        except ValueError:
            continue
        if isinstance(info, dict) and "fingerprint" in info:
            peers.seen(info, addr[0])
    sock.close()


def pinned_get(host, port, path, fingerprint, body=None, timeout=10):
    """HTTPS client with cert pinning: fingerprint MUST match, else refuse
    loudly (never silently trust). Returns (status, parsed_json)."""
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE  # pinning replaces CA trust
    conn = http.client.HTTPSConnection(host, port, timeout=timeout,
                                       context=ctx)
    try:
        conn.connect()
        der = conn.sock.getpeercert(True)
        got = hashlib.sha256(der).hexdigest()
        if got != fingerprint.lower():
            raise ValueError("fingerprint mismatch: peer refused")
        headers = {}
        payload = None
        if body is not None:
            payload = json.dumps(body).encode()
            headers["Content-Type"] = "application/json"
        conn.request("POST", path, body=payload, headers=headers)
        resp = conn.getresponse()
        return resp.status, json.loads(resp.read().decode() or "{}")
    finally:
        conn.close()


def manual_add(host, port, fingerprint, own_info, peers):
    """Hostile-network fallback: direct pinned register, no multicast.
    Returns the peer info; raises (loudly) on refusal or mismatch."""
    st, info = pinned_get(host, port, "/api/localsend/v2/register",
                          fingerprint, own_info)
    if st != 200 or not isinstance(info, dict) or \
            "fingerprint" not in info:
        raise ConnectionError("manual register failed: %s %s" % (st, info))
    peers.seen(info, host)
    return info


class DropHandler(http.server.BaseHTTPRequestHandler):
    server_version = "SteroidsDrop/1.0"
    # set by serve(): srv.info, srv.peers, srv.pin_state, srv.on_upload

    def log_message(self, *args):
        pass  # quiet; errors surface through responses

    def _send(self, code, obj):
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _read_json(self):
        try:
            length = int(self.headers.get("Content-Length", 0))
        except ValueError:
            length = 0
        if not length:
            return {}
        try:
            return json.loads(self.rfile.read(length).decode())
        except ValueError:
            return {}

    def do_POST(self):  # noqa: N802 (BaseHTTPRequestHandler shape)
        url = urllib.parse.urlparse(self.path)
        query = urllib.parse.parse_qs(url.query)
        if url.path == "/api/localsend/v2/register":
            info = self._read_json()
            if not isinstance(info, dict) or "fingerprint" not in info:
                return self._send(400, {"error": "bad peer info"})
            if info["fingerprint"] == self.server.info["fingerprint"]:
                return self._send(412, {"error": "self-register refused"})
            host = self.client_address[0]
            self.server.peers.seen(info, host)
            return self._send(200, self.server.info)
        elif url.path == "/api/localsend/v2/prepare-upload":
            self._handle_prepare(query)
        elif url.path == "/api/localsend/v2/upload":
            self._handle_upload(query)
        else:
            self._send(404, {"error": "unknown route"})

    def _pin_ok(self, query):
        pins = query.get("pin", [])
        return self.server.pin_state.get("check", lambda p: False)(pins[0]
                if pins else "")

    def _handle_prepare(self, query):
        if not self._pin_ok(query):
            self._send(401, {"error": "PIN required or expired"})
            return
        # NOTE (consent): a correct PIN typed on the sender IS the human
        # consent gate for this session. A full per-file accept-UI on the
        # receiver waits for the phone card; until then one live session
        # at a time — a second prepare while one is unfinished gets 409.
        now = time.time()
        with self.server.sessions_lock:
            for sid in [s for s in self.server.sessions
                        if now - self.server.sessions[s]["created"] > SESSION_TTL]:
                del self.server.sessions[sid]
            busy = [s for s, v in self.server.sessions.items()
                    if any(not m.get("done") for m in v["files"].values())]
        if busy:
            self._send(409, {"error": "busy: current drop unfinished"})
            return
        req = self._read_json()
        files = req.get("files", {}) if isinstance(req, dict) else {}
        session_id = secrets.token_hex(8)
        accepted = {}
        with self.server.sessions_lock:
            self.server.sessions[session_id] = {"files": {}, "created": time.time()}
            for fid, meta in files.items():
                if not isinstance(meta, dict):
                    continue
                token = secrets.token_hex(8)
                self.server.sessions[session_id]["files"][fid] = dict(meta, token=token)
                accepted[fid] = token
        self._send(200, {"sessionId": session_id, "files": accepted})

    def _handle_upload(self, query):
        session_id = (query.get("sessionId", [""])[0]
                      if "sessionId" in query else "")
        file_id = query.get("fileId", [""])[0] if "fileId" in query else ""
        token = query.get("token", [""])[0] if "token" in query else ""
        with self.server.sessions_lock:
            session = self.server.sessions.get(session_id)
            meta = (session or {}).get("files", {}).get(file_id)
        if not session or not meta or meta.get("token") != token:
            self._send(403, {"error": "bad session, file, or token"})
            return
        try:
            length = int(self.headers.get("Content-Length", 0))
        except ValueError:
            length = 0
        digest = hashlib.sha256()
        received = 0
        try:
            dest = self.server.dest_dir
            os.makedirs(dest, exist_ok=True)
            tmp = os.path.join(dest, ".drop-%s-%s.part" % (session_id,
                                                           file_id))
            with open(tmp, "wb") as f:
                while received < length:
                    chunk = self.rfile.read(min(65536, length - received))
                    if not chunk:
                        break
                    f.write(chunk)
                    digest.update(chunk)
                    received += len(chunk)
        except OSError as e:
            self._send(500, {"error": "store failed: %s" % e})
            return
        if received != length:
            self._send(400, {"error": "short body"})
            return
        want = meta.get("sha256")
        if want and digest.hexdigest() != want:
            try:
                os.remove(tmp)
            except OSError:
                pass
            self._send(422, {"error": "checksum mismatch, dropped"})
            return
        final = os.path.join(dest, _safe_name(meta.get("fileName",
                                                        file_id)))
        final = _keep_both(final)  # F-5: never silently overwrite
        try:
            os.rename(tmp, final)
        except OSError as e:
            self._send(500, {"error": "finalize failed: %s" % e})
            return
        with self.server.sessions_lock:  # landed: session progress for the 409 gate
            done_mark = self.server.sessions.get(session_id, {}).get("files", {}).get(
                file_id)
            if done_mark is not None:
                done_mark["done"] = True
        try:
            self.server.on_upload(dict(meta, path=final,
                                       sha256=digest.hexdigest()))
        except Exception:  # noqa: BLE001 (callback must not break upload)
            pass
        self._send(200, {"ok": True, "path": final})


def _safe_name(name):
    return "".join(c if c.isalnum() or c in "._- " else "_"
                   for c in os.path.basename(name or "unnamed"))[:128]


def _keep_both(path):
    if not os.path.exists(path):
        return path
    base, ext = os.path.splitext(path)
    i = 2
    while os.path.exists("%s (%d)%s" % (base, i, ext)):
        i += 1
    return "%s (%d)%s" % (base, i, ext)


class DropServer:
    """One HTTPS drop endpoint + multicast presence. Threaded, closable."""

    def __init__(self, alias, port, cert_file, key_file, dest_dir,
                 pin_state=None, fingerprint=None):
        if fingerprint is None:  # caller pins trust (see drop_pair)
            raise ValueError("fingerprint required: QR binds it, never guess")
        self.info = self_info(alias, port, fingerprint)
        self.peers = PeerTable()
        self._stop = threading.Event()
        ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        ctx.load_cert_chain(cert_file, key_file)
        self._http = http.server.ThreadingHTTPServer(("0.0.0.0", port),
                                                     DropHandler)
        self._http.info = self.info
        self._http.peers = self.peers
        self._http.pin_state = pin_state or {}
        self._http.sessions = {}  # per-server: instances never share
        self._http.sessions_lock = threading.Lock()
        self._http.dest_dir = dest_dir
        self._http.on_upload = lambda meta: None
        self._http.socket = ctx.wrap_socket(self._http.socket,
                                            server_side=True)
        self.port = self._http.server_address[1]
        self.info["port"] = self.port  # ephemeral ports resolve after bind
        self._threads = []

    def start(self):
        t = threading.Thread(target=self._http.serve_forever,
                             kwargs={"poll_interval": 0.2}, daemon=True)
        t.start()
        self._threads.append(t)
        l = threading.Thread(target=listen_multicast,
                             args=(self.peers, self._stop,
                                   MULTICAST_PORT),
                             daemon=True)
        l.start()
        self._threads.append(l)
        announce(self.info["alias"], self.port, self.info["fingerprint"])
        return self

    def stop(self):
        self._stop.set()
        self._http.shutdown()
        self._http.server_close()


def send_files(host, port, fingerprint, pin, paths):
    """Push local files to a peer: prepare (PIN-gated) then upload each,
    verifying the session token per file. Returns list of server paths."""
    files = {}
    for p in paths:
        with open(p, "rb") as f:
            content = f.read()
        fid = secrets.token_hex(4)
        files[fid] = {"id": fid, "fileName": os.path.basename(p),
                      "size": len(content),
                      "sha256": hashlib.sha256(content).hexdigest(),
                      "preview": None, "content": content}
    status, prep = pinned_get(host, port,
                              "/api/localsend/v2/prepare-upload?pin=" + pin,
                              fingerprint, {"info": {}, "files":
                                            {k: {kk: vv for kk, vv in
                                                 v.items() if kk !=
                                                 "content"}
                                             for k, v in files.items()}})
    if status == 401:
        raise PermissionError("PIN refused or expired")
    if status != 200:
        raise ConnectionError("prepare failed: %s" % prep)
    session_id = prep["sessionId"]
    landed = []
    for fid, meta in files.items():
        token = prep["files"][fid]
        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
        conn = http.client.HTTPSConnection(host, port, timeout=30,
                                           context=ctx)
        try:
            conn.connect()
            got = hashlib.sha256(
                conn.sock.getpeercert(True)).hexdigest()
            if got != fingerprint.lower():
                raise ValueError("fingerprint mismatch: peer refused")
            path = ("/api/localsend/v2/upload?sessionId=%s&fileId=%s"
                    "&token=%s" % (session_id, fid, token))
            conn.request("POST", path, body=meta.pop("content"),
                         headers={"Content-Length": str(meta["size"])})
            resp = conn.getresponse()
            result = json.loads(resp.read().decode() or "{}")
            if resp.status == 422:
                raise ValueError("checksum mismatch, peer dropped it")
            if resp.status != 200:
                raise ConnectionError("upload failed: %s" % result)
            landed.append(result.get("path"))
        finally:
            conn.close()
    return landed
