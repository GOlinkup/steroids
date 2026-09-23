#!/usr/bin/env python3
"""I84 pre-commit hook: auth diffs get a review comment.

Scans the staged diff for auth patterns; on hit prints a review comment
naming security-review. Non-blocking by design (exit 0 always) — it advises,
it does not gate. Install: ln -s <repo>/scripts/precommit_auth_review.py
.git/hooks/pre-commit (or call with --repo for a demo repo).
Usage:  python3 scripts/precommit_auth_review.py [--repo DIR]
Stdlib only.
"""
import re
import subprocess
import sys

AUTH_RES = re.compile(r"auth|login|password|passwd|token|session|oauth|credential|secret|api[_-]?key", re.I)


def auth_diff_comment(diff_text):
    hits = sorted({m.group(0).lower() for m in AUTH_RES.finditer(diff_text)})
    if not hits:
        return ""
    return ("[steroids-review] auth-touching change "
            f"({', '.join(hits)}): consider loading security-review before commit.")


def main(repo="."):
    try:
        diff = subprocess.run(["git", "diff", "--cached"], capture_output=True,
                              text=True, cwd=repo, timeout=60).stdout
    except Exception as e:
        print(f"[steroids-review] could not read staged diff: {e}")
        return 0
    comment = auth_diff_comment(diff)
    if comment:
        print(comment)
    return 0


if __name__ == "__main__":
    repo = sys.argv[sys.argv.index("--repo") + 1] if "--repo" in sys.argv else "."
    raise SystemExit(main(repo))
