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


EVIDENCE_KINDS = ("fact", "assumption", "inference", "unknown", "verified-fact")
CONFIDENCES = ("low", "medium", "high")


def seed_queries(task):
    # ponytail: title is the baseline; unknowns + open questions are the lift
    out = [task.get("title", "")]
    out += list(task.get("unknowns", []) or [])
    for q in task.get("questions", []) or []:
        if isinstance(q, dict) and not q.get("answer"):
            out.append(q.get("question", ""))
    seen, queries = set(), []
    for s in out:
        s = str(s or "").strip()
        if s and s not in seen:
            seen.add(s)
            queries.append(s)
    return queries


def assume(task, statement, confidence="medium"):
    s = str(statement or "").strip()
    if not s:
        raise ValueError("empty assumption")
    if confidence not in CONFIDENCES:
        raise ValueError(f"bad confidence {confidence}")
    if any(a.get("statement") == s for a in task.get("assumptions", []) or []):
        raise ValueError(f"duplicate assumption: {s}")
    a = {"statement": s, "confidence": confidence, "status": "unverified"}
    task.setdefault("assumptions", []).append(a)
    return a


def resolve_assumption(task, statement, ok, source):
    if not str(source or "").strip():
        raise ValueError("resolution needs a source, never resolves silently")
    for a in task.get("assumptions", []) or []:
        if a.get("statement") == statement:
            if a.get("status") != "unverified":
                raise ValueError(f"already resolved: {statement}")
            a["status"] = "verified" if ok else "invalidated"
            ev = {"claim": statement if ok else "INVALIDATED: " + statement,
                  "source": str(source).strip(),
                  "kind": "verified-fact" if ok else "fact"}
            task.setdefault("evidence", []).append(ev)
            return a
    raise ValueError(f"unknown assumption: {statement}")


def add_evidence(task, claim, source, kind="fact"):
    if kind not in EVIDENCE_KINDS:
        raise ValueError(f"bad kind {kind}")
    if not str(claim or "").strip() or not str(source or "").strip():
        raise ValueError("evidence needs claim + source")
    ev = {"claim": str(claim).strip(), "source": str(source).strip(), "kind": kind}
    task.setdefault("evidence", []).append(ev)
    return ev


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
