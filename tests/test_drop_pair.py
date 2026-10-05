"""Stdlib unittest for drop_pair (T1-1). No install."""
import importlib.util
import os
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


class PairTest(unittest.TestCase):
    def setUp(self):
        self.tmp = "/tmp/drop-pair-test-%d" % os.getpid()
        os.makedirs(self.tmp, exist_ok=True)
        self._old = (pair.CERT_DIR, pair.CERT_FILE, pair.KEY_FILE,
                     pair.REGISTRY_FILE)
        pair.CERT_DIR = self.tmp
        pair.CERT_FILE = os.path.join(self.tmp, "cert.pem")
        pair.KEY_FILE = os.path.join(self.tmp, "key.pem")
        pair.REGISTRY_FILE = os.path.join(self.tmp, "paired.json")

    def tearDown(self):
        (pair.CERT_DIR, pair.CERT_FILE, pair.KEY_FILE,
         pair.REGISTRY_FILE) = self._old

    def test_cert_and_fingerprint_stable(self):
        c1, k1 = pair.ensure_cert()
        self.assertTrue(os.path.exists(c1) and os.path.exists(k1))
        f1 = pair.fingerprint()
        c2, _ = pair.ensure_cert()  # second call reuses, not mints
        self.assertEqual(c1, c2)
        self.assertEqual(f1, pair.fingerprint())
        self.assertEqual(len(f1), 64)
        int(f1, 16)  # valid hex

    def test_pin_lifecycle(self):
        p = pair.mint_pin()
        self.assertEqual(len(p["pin"]), 6)
        self.assertTrue(pair.pin_valid(p, p["pin"]))
        self.assertFalse(pair.pin_valid(p, "000000"))
        old = {"pin": p["pin"], "expires": time.time() - 1}
        self.assertFalse(pair.pin_valid(old, p["pin"]))  # expired dies

    def test_openssl_missing_refuses_clean(self):
        import shutil as _shutil
        real = _shutil.which
        _shutil.which = lambda c: None
        pair.CERT_FILE = os.path.join(self.tmp, "fresh-cert.pem")
        pair.KEY_FILE = os.path.join(self.tmp, "fresh-key.pem")
        try:
            self.assertIn("openssl", pair.REQUIRES[0].lower())
            with self.assertRaises(RuntimeError) as ctx:
                pair.ensure_cert()
            self.assertIn("openssl", str(ctx.exception).lower())
        finally:
            _shutil.which = real

    def test_pair_unpair_roundtrip(self):
        self.assertFalse(pair.is_paired("abc"))
        pair.pair("abc", "test-phone")
        self.assertTrue(pair.is_paired("abc"))
        self.assertFalse(pair.is_paired("other"))
        pair.unpair("abc")  # revocation kills trust
        self.assertFalse(pair.is_paired("abc"))

    def test_pair_lookup_case_blind(self):
        pair.pair("ab12cd", "case-phone")  # stored lower...
        self.assertTrue(pair.is_paired("AB12CD"))  # ...QR ships UPPER
        pair.unpair("AB12CD")  # revocation is case-blind too
        self.assertFalse(pair.is_paired("ab12cd"))


if __name__ == "__main__":
    unittest.main()
