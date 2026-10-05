"""Stdlib unittest for drop_net (T1-2 + T1-3). Loopback pair, no network."""
import hashlib
import http.client
import importlib.util
import json
import os
import ssl
import time
import unittest

_HERE = os.path.dirname(os.path.abspath(__file__))
_SRC = os.path.normpath(os.path.join(_HERE, "..", "src", "steroids"))


def _load(name):
    spec = importlib.util.spec_from_file_location("st_" + name,
        os.path.join(_SRC, name + ".py"))
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


pair = _load("drop_pair")
net = _load("drop_net")


def _raw_post(host, port, path, data, fingerprint):
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    conn = http.client.HTTPSConnection(host, port, timeout=10, context=ctx)
    try:
        conn.connect()
        got = hashlib.sha256(conn.sock.getpeercert(True)).hexdigest()
        assert got == fingerprint
        conn.request("POST", path, body=data,
                     headers={"Content-Length": str(len(data))})
        resp = conn.getresponse()
        return resp.status, json.loads(resp.read().decode() or "{}")
    finally:
        conn.close()


class DropNetTest(unittest.TestCase):
    def setUp(self):
        self.tmp = "/tmp/drop-net-test-%d" % os.getpid()
        for d in ("a-in", "b-in", "files"):
            os.makedirs(os.path.join(self.tmp, d), exist_ok=True)
        self._old = (pair.CERT_DIR, pair.CERT_FILE, pair.KEY_FILE,
                     pair.REGISTRY_FILE)
        pair.CERT_DIR = self.tmp
        pair.CERT_FILE = os.path.join(self.tmp, "cert.pem")
        pair.KEY_FILE = os.path.join(self.tmp, "key.pem")
        pair.REGISTRY_FILE = os.path.join(self.tmp, "paired.json")
        cert, key = pair.ensure_cert()
        self.fpA = pair.fingerprint()
        pair.CERT_FILE = os.path.join(self.tmp, "cert-b.pem")
        pair.KEY_FILE = os.path.join(self.tmp, "key-b.pem")
        pair.ensure_cert()  # second identity: A and B must differ
        self.fp = pair.fingerprint()  # self.fp = B from here on
        self.issued = pair.mint_pin()
        check = lambda p, iss=self.issued: pair.pin_valid(iss, p)
        kwA = {"pin_state": {"check": check}, "fingerprint": self.fpA}
        kwB = {"pin_state": {"check": check}, "fingerprint": self.fp}
        self.a = net.DropServer("pc-a", 0, cert, key,
                                os.path.join(self.tmp, "a-in"),
                                **kwA).start()
        self.b = net.DropServer("pc-b", 0, pair.CERT_FILE, pair.KEY_FILE,
                                os.path.join(self.tmp, "b-in"),
                                **kwB).start()
        self.f1 = os.path.join(self.tmp, "files", "hello.txt")
        with open(self.f1, "wb") as f:
            f.write(b"hello drop" * 1000)
        self.f2 = os.path.join(self.tmp, "files", "data.bin")
        with open(self.f2, "wb") as f:
            f.write(bytes(range(256)) * 40)

    def tearDown(self):
        self.a.stop()
        self.b.stop()
        (pair.CERT_DIR, pair.CERT_FILE, pair.KEY_FILE,
         pair.REGISTRY_FILE) = self._old

    def _sha(self, path):
        with open(path, "rb") as f:
            return hashlib.sha256(f.read()).hexdigest()

    def test_register_roundtrip(self):
        st, info = net.pinned_get("127.0.0.1", self.b.port,
                                  "/api/localsend/v2/register", self.fp,
                                  net.self_info("pc-a", self.a.port,
                                                self.fpA))
        self.assertEqual(st, 200)
        self.assertEqual(info["alias"], "pc-b")
        live = [p["alias"] for p in self.b.peers.live()]
        self.assertIn("pc-a", live)  # join shows up within the call

    def test_multicast_ear_tables_peer(self):
        import socket as _sock
        import threading as _th
        table = net.PeerTable()
        stop = _th.Event()
        t = _th.Thread(target=net.listen_multicast,
                       args=(table, stop, 45317), daemon=True)
        t.start()
        try:
            s = _sock.socket(_sock.AF_INET, _sock.SOCK_DGRAM)
            s.sendto(json.dumps(net.self_info("loud", 9, "f" * 64)).encode(),
                     ("127.0.0.1", 45317))
            s.close()
            heard = []
            for _ in range(40):
                heard = table.live()
                if heard:
                    break
                time.sleep(0.1)
            self.assertEqual([p["alias"] for p in heard], ["loud"])
        finally:
            stop.set()
            t.join()

    def test_peer_expiry(self):
        self.b.peers.seen({"fingerprint": "ghost", "alias": "x"}, "1.2.3.4")
        self.assertIn("x", [p["alias"] for p in self.b.peers.live()])
        net.PEER_TIMEOUT = 0  # age everything out instantly
        try:
            self.assertEqual(self.b.peers.live(), [])
        finally:
            net.PEER_TIMEOUT = 120

    def test_drop_both_directions(self):
        landed_ab = net.send_files("127.0.0.1", self.b.port, self.fp,
                                   self.issued["pin"], [self.f1, self.f2])
        self.assertEqual(len(landed_ab), 2)
        for src, dst in zip([self.f1, self.f2], sorted(landed_ab)):
            self.assertTrue(os.path.exists(dst))
        got = sorted(self._sha(p) for p in landed_ab)
        want = sorted([self._sha(self.f1), self._sha(self.f2)])
        self.assertEqual(got, want)  # byte-identical both files
        landed_ba = net.send_files("127.0.0.1", self.a.port, self.fpA,
                                   self.issued["pin"], [self.f1])
        self.assertEqual(self._sha(landed_ba[0]), self._sha(self.f1))

    def test_conflict_keep_both(self):
        once = net.send_files("127.0.0.1", self.b.port, self.fp,
                              self.issued["pin"], [self.f1])[0]
        twice = net.send_files("127.0.0.1", self.b.port, self.fp,
                               self.issued["pin"], [self.f1])[0]
        self.assertNotEqual(once, twice)  # never silently overwrites
        self.assertEqual(self._sha(once), self._sha(twice))

    def test_wrong_pin_refused(self):
        with self.assertRaises(PermissionError):
            net.send_files("127.0.0.1", self.b.port, self.fp,
                           "000000", [self.f1])

    def test_wrong_fingerprint_refused(self):
        with self.assertRaises(ValueError):
            net.send_files("127.0.0.1", self.b.port, "00" * 32,
                           self.issued["pin"], [self.f1])

    def test_checksum_mismatch_422(self):
        st, prep = net.pinned_get(
            "127.0.0.1", self.b.port,
            "/api/localsend/v2/prepare-upload?pin=" + self.issued["pin"],
            self.fp, {"files": {"x": {"fileName": "x.bin", "size": 4,
                                      "sha256": "00" * 32}}})
        self.assertEqual(st, 200)
        st, _ = _raw_post("127.0.0.1", self.b.port,
                          "/api/localsend/v2/upload?sessionId=%s"
                          "&fileId=x&token=%s" % (prep["sessionId"],
                                                  prep["files"]["x"]),
                          b"WRONG", self.fp)
        self.assertEqual(st, 422)  # corrupt body dropped, loudly

    def test_self_register_412(self):
        own = net.self_info("pc-b", self.b.port, self.fp)
        st, _ = net.pinned_get("127.0.0.1", self.b.port,
                               "/api/localsend/v2/register", self.fp, own)
        self.assertEqual(st, 412)  # never table yourself
        self.assertNotIn(self.fp, [p for p in self.b.peers.live()])

    def test_prepare_busy_409(self):
        q = "/api/localsend/v2/prepare-upload?pin=" + self.issued["pin"]
        st, p1 = net.pinned_get("127.0.0.1", self.b.port, q, self.fp,
                                {"files": {"f": {"fileName": "w.bin",
                                                 "size": 3}}})
        self.assertEqual(st, 200)
        st, _ = net.pinned_get("127.0.0.1", self.b.port, q, self.fp,
                               {"files": {}})
        self.assertEqual(st, 409)  # first drop still unfinished
        st, _ = _raw_post("127.0.0.1", self.b.port,
                          "/api/localsend/v2/upload?sessionId=%s"
                          "&fileId=f&token=%s" % (p1["sessionId"],
                                                  p1["files"]["f"]),
                          b"abc", self.fp)
        self.assertEqual(st, 200)
        st, _ = net.pinned_get("127.0.0.1", self.b.port, q, self.fp,
                               {"files": {}})
        self.assertEqual(st, 200)  # finished: gate reopens

    def test_manual_add(self):
        own = net.self_info("probe", 1, "00" * 32)
        info = net.manual_add("127.0.0.1", self.b.port, self.fp, own,
                              self.a.peers)
        self.assertEqual(info["alias"], "pc-b")
        self.assertIn("pc-b", [p["alias"] for p in self.a.peers.live()])

    def test_bad_token_403(self):
        st, _ = _raw_post("127.0.0.1", self.b.port,
                          "/api/localsend/v2/upload?sessionId=nope"
                          "&fileId=nope&token=nope", b"data", self.fp)
        self.assertEqual(st, 403)


if __name__ == "__main__":
    unittest.main()
