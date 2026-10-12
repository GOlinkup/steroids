#!/usr/bin/env python3
"""Sandbox factory: Grokbot's createSandboxProvider, island-sized.

Kinds: local | desktop | fake -> LocalBoxes (filesystem jail, stdlib).
       cloud -> BoatBoxes when BOAT_API_KEY set, else error (Pro path).
       e2b | daytona -> error until keys wired (same message shape as Grokbot).

pick_backend(): pc_reachable -> local(free) | subscribed -> cloud(paid)
                | else offline ("turn PC on or upgrade").

ponytail: LocalBoxes runs shell with cwd=box_dir — an agent CAN `cd ..`.
So every path helper resolves + asserts inside the box. Network egress
stays host-default for MVP (local user runs own prompts); untrusted
multi-tenant needs microVM (StacyVM/pycage) — upgrade path, not this file.
"""
import os

_kind = os.environ.get("SANDBOX_PROVIDER", "local")


def create_provider(kind="", opts=None):
    """Mirror Grokbot factory errors so callers can swap backends blind."""
    opts = opts or {}
    k = (kind or _kind or "local").lower()
    if k in ("local", "desktop", "fake", "localboxes"):
        from steroids.dots import sandboxes as _sb
        return _sb.LocalBoxes(root=opts.get("root", ""))
    if k in ("cloud", "boat"):
        if not os.environ.get("BOAT_API_KEY"):
            raise RuntimeError("BOAT_API_KEY is required for the cloud sandbox provider")
        from steroids.dots import sandboxes as _sb
        return _sb.provider()
    if k == "e2b":
        raise RuntimeError("E2B_API_KEY is required for the e2b sandbox provider")
    if k == "daytona":
        raise RuntimeError("DAYTONA_API_KEY is required for the daytona sandbox provider")
    raise RuntimeError(
        'Unknown SANDBOX_PROVIDER "%s". Use local | cloud | e2b | daytona.' % k)


def box_path(root, box_id, path):
    """Resolve path inside box; raises on `..`/absolute escape. The fix."""
    base = os.path.realpath(os.path.join(root, box_id))
    dest = os.path.realpath(os.path.join(base, path or ""))
    if dest != base and not dest.startswith(base + os.sep):
        raise ValueError("path escapes box: %r" % (path,))
    return dest


def pick_backend(pc_reachable=True, subscribed=False):
    """One choke point for bridge.py:start_turn + loop.py:_execute."""
    if pc_reachable:
        return "local"
    if subscribed:
        return "cloud"
    return "offline"


def pc_full():
    """ADHD easy switch: STEROIDS_PC_FULL=1 runs turns in HOME, not the jail."""
    return os.environ.get("STEROIDS_PC_FULL", "").lower() in ("1", "true", "yes", "on")


def run_cwd(box_dir):
    """Where the agent CLI actually runs. Jail by default, HOME when opted in."""
    # ponytail: global HOME cwd, per-box dirs if isolation matters
    if pc_full():
        return os.path.expanduser("~")
    return box_dir


def demo():
    p = create_provider("local")
    box = p.create_box()
    assert box["id"].startswith("local-"), box
    # escape blocked — the load-bearing check
    try:
        box_path(p.root, box["id"], "../../etc/passwd")
        raise AssertionError("escape NOT blocked")
    except ValueError:
        pass
    assert pick_backend(True, False) == "local"
    assert pick_backend(False, True) == "cloud"
    assert pick_backend(False, False) == "offline"
    try:
        create_provider("e2b")
        raise AssertionError("e2b without key should raise")
    except RuntimeError:
        pass
    assert run_cwd(box["id"]) == box["id"] or run_cwd("/tmp/x") == "/tmp/x"
    p.delete_box(box["id"])
    print("sandbox demo ok")


if __name__ == "__main__":
    demo()
