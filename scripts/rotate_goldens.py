#!/usr/bin/env python3
"""D34 golden rotation: monthly held-out swap + log.

Round-robins the golden files: each YYYY-MM holds out exactly one file
from CI (kept as the unseen check), all others active. Deterministic by
month key — no state file needed.
Usage:  python3 scripts/rotate_goldens.py [YYYY-MM]
Writes reports/rotation-YYYY-MM-DD.md. Stdlib only.
"""
import os
import sys
from datetime import datetime

FILES = ["tests/blind_eval_100.py", "tests/blind_eval_second.py",
         "tests/live_probe.py", "tests/goldens_per_skill.py",
         "tests/adversarial_bank.py"]


def rotation(month_key, files=None):
    """Return (held_out, active). Pure function (D34 test seam)."""
    files = list(files or FILES)
    held = files[month_key % len(files)]
    return held, [f for f in files if f != held]


def main(month=None):
    today = datetime.now().date()
    key = int((month or today.strftime("%Y-%m")).replace("-", ""))
    held, active = rotation(key)
    path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..",
                        "reports", f"rotation-{today.isoformat()}.md")
    L = [f"# Golden rotation — {today.isoformat()} (key {key})", "",
         f"held out of CI: `{held}` (unseen check)", "",
         "active:"]
    L += [f"- `{f}`" for f in active]
    with open(path, "w", encoding="utf-8") as f:
        f.write("\n".join(L) + "\n")
    print(f"held={held}")
    print(f"wrote {path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1] if len(sys.argv) > 1 else None))
