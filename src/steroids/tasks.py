#!/usr/bin/env python3
"""Steroids tasks (P2-2): hierarchy + status machine. Stdlib only.

Never imports router/benchmark (do-not-touch). Operates on plain dicts
matching specs/phase-2/task.schema.json (statuses lowercase).
"""
STATUSES = ("pending", "discovering", "planned", "ready", "running",
            "verifying", "blocked", "failed", "recovering", "completed",
            "cancelled")

# ponytail: single table is the whole machine; terminal states map to ().
TRANSITIONS = {
    "pending": ("discovering", "cancelled"),
    "discovering": ("planned", "cancelled"),
    "planned": ("ready", "blocked", "cancelled"),
    "ready": ("running", "blocked", "cancelled"),
    "running": ("verifying", "failed", "blocked"),
    "verifying": ("completed", "failed"),
    "blocked": ("ready", "cancelled"),
    "failed": ("recovering", "cancelled"),
    "recovering": ("verifying", "failed"),
    "completed": (),
    "cancelled": (),
}


def can(old, new):
    return old in TRANSITIONS and new in TRANSITIONS[old]


def transition(task, new, emit=None):
    old = task.get("status")
    if not can(old, new):
        raise ValueError(f"illegal {old} -> {new}")
    task["status"] = new
    if emit:
        emit("task.state", task.get("id", "?"), {"from": old, "to": new})
    return task


def block(task, missing, emit=None):
    if not missing or not str(missing).strip():
        raise ValueError("blocked requires the missing input, never waits silently")
    old = task.get("status")
    if not can(old, "blocked"):
        raise ValueError(f"illegal {old} -> blocked")
    task.setdefault("unknowns", []).append(str(missing).strip())
    task["status"] = "blocked"
    if emit:
        emit("task.state", task.get("id", "?"),
             {"from": old, "to": "blocked", "missing": str(missing).strip()})
    return task


def children(parent_id, tasks):
    # ponytail: O(n) scan; index by parent if task lists grow large
    return [t["id"] for t in tasks if t.get("parent") == parent_id]


def check_cycles(tasks):
    # ponytail: recursion; iterative DFS if graphs ever go deep
    deps = {t["id"]: list(t.get("dependencies", [])) for t in tasks}
    for tid in deps:
        for d in deps[tid]:
            if d not in deps:
                raise ValueError(f"{tid} depends on unknown {d}")
    visiting, done = set(), set()

    def visit(tid, stack):
        if tid in done:
            return
        if tid in visiting:
            raise ValueError(f"cycle: {' -> '.join(stack + [tid])}")
        visiting.add(tid)
        for d in deps[tid]:
            visit(d, stack + [tid])
        visiting.discard(tid)
        done.add(tid)

    for tid in deps:
        visit(tid, [])
