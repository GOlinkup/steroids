#!/usr/bin/env python3
"""Steroids durability (RQ-3): DBOS-shaped journal, SQLite variant. Stdlib only.

A workflow is an ordered list of steps. Each step runs once: its completion
and its side-effect receipts persist in the journal. Re-running the same
workflow after a crash (incl. kill -9) skips completed steps and never
re-issues recorded effects. Router/benchmark untouched.
"""
import json
import sqlite3

SCHEMA = """
CREATE TABLE IF NOT EXISTS steps (name TEXT PRIMARY KEY, status TEXT, result TEXT);
CREATE TABLE IF NOT EXISTS effects (key TEXT PRIMARY KEY, receipt TEXT);
"""


def open_journal(path):
    db = sqlite3.connect(path)
    db.executescript(SCHEMA)
    return db


def _effect(db, key, fn):
    row = db.execute("SELECT receipt FROM effects WHERE key = ?", (key,)).fetchone()
    if row:
        return row[0], True
    receipt = fn()
    db.execute("INSERT INTO effects (key, receipt) VALUES (?, ?)", (key, json.dumps(receipt)))
    db.commit()
    return receipt, False


def run_workflow(db, steps, emit=None):
    """steps: [(name, fn)]. fn(ctx) may call ctx.effect(key, fn) exactly-once."""
    done, skipped, replayed = [], [], []

    class Ctx:
        def effect(self, key, fn):
            receipt, was_replayed = _effect(db, key, fn)
            if was_replayed:
                replayed.append(key)
            return receipt

    for name, fn in steps:
        row = db.execute("SELECT status, result FROM steps WHERE name = ?", (name,)).fetchone()
        if row and row[0] == "completed":
            skipped.append(name)
            if emit:
                emit("task.state", name, {"from": "killed", "to": "skipped"})
            continue
        result = fn(Ctx())
        db.execute("INSERT OR REPLACE INTO steps (name, status, result) VALUES (?, ?, ?)",
                   (name, "completed", json.dumps(result)))
        db.commit()
        done.append(name)
        if emit:
            emit("task.state", name, {"from": "running", "to": "completed"})
    return {"done": done, "skipped": skipped, "replayed_effects": replayed}
