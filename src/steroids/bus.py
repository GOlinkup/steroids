#!/usr/bin/env python3
"""Steroids bus (P1-3): in-process pub/sub + append-only JSONL sink. Stdlib only.

Scoring code never imports this (emit around, never inside, hot paths).
Golden output bit-identical with bus on vs off by construction.
"""
import datetime
import importlib.util
import json
import os

try:
    from . import ids as _ids
except ImportError:  # ponytail: spec-load without package (tests) falls back here
    _spec = importlib.util.spec_from_file_location(
        "st_ids", os.path.join(os.path.dirname(os.path.abspath(__file__)), "ids.py"))
    _ids = importlib.util.module_from_spec(_spec)
    _spec.loader.exec_module(_ids)

_SUBS = {}

TYPES = ("task.created task.state task.completed context.selected "
         "context.rejected skill.routed skill.accepted action.started "
         "action.finished verification.passed verification.failed "
         "failure.detected failure.classified recovery.planned recovery.retried "
         "memory.stored memory.recalled human.approval.requested "
         "human.approval.decided").split()

def subscribe(etype, fn):
    _SUBS.setdefault(etype, []).append(fn)
    return lambda: _SUBS[etype].remove(fn)

def _now():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()

def make_event(etype, subject, data=None, run_id=None):
    assert etype in TYPES, etype
    return {"id": _ids.new_id(), "source": "steroids/bus", "type": etype,
            "time": _now(), "subject": subject, "data": data or {},
            "specversion": "1.0",
            "gen_ai.request.model": (data or {}).get("model", "unknown")}

def emit(etype, subject, data=None, sink=None):
    ev = make_event(etype, subject, data)
    for fn in _SUBS.get(etype, []) + _SUBS.get("*", []):
        fn(ev)
    if sink:
        with open(sink, "a", encoding="utf-8") as f:
            f.write(json.dumps(ev) + "\n")
    return ev

def to_cloudevent(ev):
    # ponytail: translate at export (ADR-002); bus names kept, OTel attrs added.
    out = dict(ev)
    out.setdefault("datacontenttype", "application/json")
    d = out.get("data", {})
    out["gen_ai.request.model"] = ev.get("gen_ai.request.model", d.get("model", "unknown"))
    if "input_tokens" in d:
        out["gen_ai.usage.input_tokens"] = d["input_tokens"]
    if "output_tokens" in d:
        out["gen_ai.usage.output_tokens"] = d["output_tokens"]
    if "finish_reason" in d:
        out["gen_ai.response.finish_reasons"] = [d["finish_reason"]]
    return out

def replay(path):
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                yield json.loads(line)
