"""Stdlib unittest for Steroids Lens; loads lens.py directly, no install."""
import importlib.util
import os
import tempfile
import unittest

_LENS_PATH = os.path.join(os.path.dirname(__file__), "..", "src", "steroids", "lens.py")
_spec = importlib.util.spec_from_file_location("steroids_lens_under_test", os.path.normpath(_LENS_PATH))
lens = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(lens)


def _touch(d, name, mtime=None):
    p = os.path.join(d, name)
    with open(p, "w") as f:
        f.write("x")
    if mtime is not None:
        os.utime(p, (mtime, mtime))
    return p


class TestLens(unittest.TestCase):
    def test_label_from_filename(self):
        self.assertEqual(lens.shot_label("shot-menu2.png"), "shot menu2")
        self.assertEqual(lens.shot_label("hero_final.webp"), "hero final")

    def test_collect_newest_first_and_images_only(self):
        d = tempfile.mkdtemp()
        _touch(d, "b.txt")
        _touch(d, "old.png", mtime=1000)
        _touch(d, "new.png")
        shots = lens.collect_shots(d)
        self.assertEqual([s["name"] for s in shots], ["new.png", "old.png"])
        self.assertEqual(shots[0]["label"], "new")

    def test_collect_missing_dir_is_empty(self):
        self.assertEqual(lens.collect_shots("/nope/not/here"), [])

    def test_safe_name_blocks_traversal_and_nonimages(self):
        d = tempfile.mkdtemp()
        _touch(d, "ok.png")
        self.assertIsNotNone(lens.safe_name(d, "ok.png"))
        self.assertIsNone(lens.safe_name(d, "../evil.png"))
        self.assertIsNone(lens.safe_name(d, ".hidden.png"))
        self.assertIsNone(lens.safe_name(d, "note.txt"))
        self.assertIsNone(lens.safe_name(d, "missing.png"))

    def test_ensure_singleton_reuses_live_server(self):
        import signal
        import socket
        d = tempfile.mkdtemp()
        s = socket.socket()
        s.bind(("127.0.0.1", 0))
        port = s.getsockname()[1]
        s.close()
        url, started = lens.ensure(d, port)
        self.assertTrue(started)
        self.assertIn(str(port), url)
        try:
            url2, started2 = lens.ensure(d, port)
            self.assertFalse(started2)
            self.assertEqual(url, url2)
        finally:
            with open(os.path.join(d, ".lens.pid")) as f:
                pid = int(f.read().strip())
            os.kill(pid, signal.SIGTERM)


if __name__ == "__main__":
    unittest.main()
