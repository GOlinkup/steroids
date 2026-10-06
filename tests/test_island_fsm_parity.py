"""Parity gate: island-ui/src/fsm.ts must not drift from island/fsm.js.

The TS port (React island-ui) and the vanilla JS FSM (island/ preview)
implement the same island state machine. If a delay default changes in
one and not the other, the two islands behave differently. This test
extracts the defaults from both files and fails on any mismatch.

stdlib only, no node needed. See also tests/README (CI runs this file).
"""
import os
import re
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, ".."))

JS = os.path.join(ROOT, "island", "fsm.js")
TS = os.path.join(ROOT, "island-ui", "src", "fsm.ts")

DELAYS = ["jackedToFlex", "flexToHidden", "greetAuto", "greetHover"]


def _js_defaults():
    with open(JS, encoding="utf-8") as f:
        src = f.read()
    out = {}
    for name in DELAYS:
        m = re.search(r"delays\.%s\s*!=\s*null\s*\?\s*delays\.%s\s*:\s*([0-9.]+)"
                      % (name, name), src)
        if not m:
            raise AssertionError("island/fsm.js: no default for %s" % name)
        out[name] = float(m.group(1))
    return out


def _ts_defaults():
    with open(TS, encoding="utf-8") as f:
        src = f.read()
    out = {}
    for name in DELAYS:
        m = re.search(r"delays\.%s\s*\?\?\s*([0-9.]+)" % name, src)
        if not m:
            raise AssertionError("island-ui/src/fsm.ts: no default for %s" % name)
        out[name] = float(m.group(1))
    return out


class TestFsmParity(unittest.TestCase):

    def test_files_exist(self):
        self.assertTrue(os.path.isfile(JS), "island/fsm.js missing")
        self.assertTrue(os.path.isfile(TS), "island-ui/src/fsm.ts missing")

    def test_delay_defaults_match(self):
        js = _js_defaults()
        ts = _ts_defaults()
        self.assertEqual(js, ts,
                         "fsm.js and fsm.ts delay defaults drifted: %s vs %s"
                         % (js, ts))


if __name__ == "__main__":
    unittest.main(verbosity=2)
