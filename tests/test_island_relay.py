"""Relay tests: PIN pairing, WS handshake, keyed broadcast, inject.

Stdlib only. Spins the real bridge Handler on loopback; speaks raw
RFC 6455 (masked client frames) over plain sockets.
"""
import base64
import json
import os
import socket
import struct
import sys
import threading
import unittest
from http.client import HTTPConnection
from threading import Thread
from http.server import ThreadingHTTPServer

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "island"))

import relay  # noqa: E402
from bridge import Handler  # noqa: E402


def _masked(text):
    raw = text.encode()
    mask = b"\x01\x02\x03\x04"
    head = bytes([0x81, 0x80 | len(raw)]) if len(raw) < 126 else struct.pack(
        ">BBH", 0x81, 0x80 | 126, len(raw))
    return head + mask + bytes(c ^ mask[i % 4] for i, c in enumerate(raw))


def _read_frame(sock):
    head = sock.recv(2)
    ln = head[1] & 0x7F
    if ln == 126:
        ln = struct.unpack(">H", sock.recv(2))[0]
    data = b""
    while len(data) < ln:
        data += sock.recv(ln - len(data))
    return head[0] & 0x0F, data


class RelayTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.srv = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        cls.port = cls.srv.server_address[1]
        cls.thread = Thread(target=cls.srv.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.srv.shutdown()

    def _ws(self, key):
        s = socket.create_connection(("127.0.0.1", self.port), timeout=5)
        k = base64.b64encode(b"testkey123456789").decode()
        s.sendall(("GET /relay/ws?key=%s HTTP/1.1\r\n"
                   "Host: x\r\n"
                   "Upgrade: websocket\r\n"
                   "Connection: Upgrade\r\n"
                   "Sec-WebSocket-Key: %s\r\n"
                   "Sec-WebSocket-Version: 13\r\n\r\n" % (key, k)).encode())
        head = s.recv(200)
        self.assertIn(b"101", head)
        return s

    def _pair(self):
        c = HTTPConnection("127.0.0.1", self.port, timeout=5)
        c.request("GET", "/relay/qr")
        qr = json.loads(c.getresponse().read())
        self.assertTrue(qr["png_b64"].startswith("iVBOR"))
        c.request("POST", "/relay/verify",
                  json.dumps({"pin": qr["pin"]}),
                  {"Content-Type": "application/json"})
        hit = json.loads(c.getresponse().read())
        self.assertTrue(hit["ok"])
        return qr["pin"], hit["key"]

    def test_qr_verify_roundtrip_single_use(self):
        pin, key = self._pair()
        self.assertEqual(len(key), 32)
        c = HTTPConnection("127.0.0.1", self.port, timeout=5)
        c.request("POST", "/relay/verify",
                  json.dumps({"pin": pin}),
                  {"Content-Type": "application/json"})
        self.assertEqual(c.getresponse().status, 404)  # PIN pops
        c.request("POST", "/relay/verify",
                  json.dumps({"pin": "000000"}),
                  {"Content-Type": "application/json"})
        self.assertEqual(c.getresponse().status, 404)  # wrong PIN

    def test_ws_keyed_broadcast_and_mismatch_drop(self):
        _, key = self._pair()
        a = self._ws(key)
        b = self._ws(key)
        frame = json.dumps({"type": "reply", "key": key, "text": "hi"})
        a.sendall(_masked(frame))
        op, data = _read_frame(b)
        self.assertEqual(op, 0x1)
        self.assertEqual(json.loads(data)["text"], "hi")
        # Mismatched frame key: dropped, never routed.
        a.sendall(_masked(json.dumps({"type": "x", "key": "wrong"})))
        b.settimeout(0.5)
        with self.assertRaises(socket.timeout):
            _read_frame(b)
        a.close()
        b.close()

    def test_ws_without_key_refused(self):
        s = socket.create_connection(("127.0.0.1", self.port), timeout=5)
        s.sendall(b"GET /relay/ws HTTP/1.1\r\nHost: x\r\n\r\n")
        self.assertIn(b"403", s.recv(100))
        s.close()

    def test_backend_inject_reaches_socket(self):
        _, key = self._pair()
        a = self._ws(key)
        c = HTTPConnection("127.0.0.1", self.port, timeout=5)
        c.request("POST", "/relay/send",
                  json.dumps({"key": key,
                              "frame": {"type": "nudge", "key": key}}),
                  {"Content-Type": "application/json"})
        self.assertTrue(json.loads(c.getresponse().read())["ok"])
        op, data = _read_frame(a)
        self.assertEqual(op, 0x1)
        self.assertEqual(json.loads(data)["type"], "nudge")
        a.close()


if __name__ == "__main__":
    unittest.main()
