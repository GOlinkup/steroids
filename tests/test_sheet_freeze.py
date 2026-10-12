#!/usr/bin/env python3
"""SHEET-FREEZE — human order 2026-10-11: top-center positioning + sheet
geometry locked. No agent edits the frozen files until the human says
"unfreeze". Hands-off zones (prose-only, see CONTRIBUTING.md "Sheet
freeze"): App.tsx footprint/cover/shell-typing regions, index.css
#island/.stage.app/.navbar.pc/body-cap rules, Island.tsx shell markup.

Run: python3 tests/test_sheet_freeze.py  (also picked up by
`python3 -m unittest discover -s tests -p "test_*.py"`)
"""
import hashlib
import os
import unittest

MANIFEST = {
    'island-app/main.js': '476f9aa436488a81',
    'island-app/kwin-pin.js': '3563990bad9dbf9e',
    'island-app/preload.js': '78d2a359adbe28dc',
    'island-app/run.sh': 'e697d9dd4d394a25',
    'island-ui/src/fsm.ts': '1228beaa8af97016',
}

REGEN = (
    "python3 -c \"import hashlib; [print(f\\\"  '{f}': "
    "'{hashlib.sha256(open(f,'rb').read()).hexdigest()[:16]}',\\\") "
    "for f in ['island-app/main.js','island-app/kwin-pin.js',"
    "'island-app/preload.js','island-app/run.sh','island-ui/src/fsm.ts']]\""
)


def _root():
    return os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def _digest(rel):
    with open(os.path.join(_root(), rel), 'rb') as f:
        return hashlib.sha256(f.read()).hexdigest()[:16]


class SheetFreezeTest(unittest.TestCase):
    def test_frozen_files_untouched(self):
        changed = [rel for rel, want in MANIFEST.items()
                   if _digest(rel) != want]
        self.assertFalse(
            changed,
            "SHEET FROZEN by human order 2026-10-11 — files changed: %s. "
            "Revert your edit. If the human ordered this change, regenerate "
            "the manifest with (from repo root): %s "
                "then run this test again." % (changed, REGEN))


if __name__ == "__main__":
    unittest.main(verbosity=2)
