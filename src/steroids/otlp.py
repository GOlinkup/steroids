#!/usr/bin/env python3
"""Steroids OTLP export (M7): CloudEvents -> OTLP/HTTP JSON. Stdlib only.

No SDK, no collector config: raw OTLP/HTTP POST an unmodified backend
accepts. Instant bus events become zero-duration spans (+1ms floor).
"""
import datetime
import hashlib
import json
import urllib.request

OTLP_TRACES_PATH = "/v1/traces"


def _trace_id(run_id):
    return hashlib.sha256(str(run_id).encode()).hexdigest()[:32]


def _span_id(event_id):
    return hashlib.sha256(str(event_id).encode()).hexdigest()[:16]


def _nanos(ts):
    try:
        dt = datetime.datetime.fromisoformat(str(ts))
    except ValueError:
        dt = datetime.datetime.now(datetime.timezone.utc)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=datetime.timezone.utc)
    return str(int(dt.timestamp() * 1e9))


def _attr(key, value):
    if isinstance(value, bool):
        return {"key": key, "value": {"boolValue": value}}
    if isinstance(value, int):
        return {"key": key, "value": {"intValue": str(value)}}
    if isinstance(value, float):
        return {"key": key, "value": {"doubleValue": value}}
    return {"key": key, "value": {"stringValue": str(value)}}


def to_otlp(events, run_id, service="steroids"):
    events = list(events)
    spans = []
    for ev in events:
        data = ev.get("data", {}) or {}
        attrs = [_attr("gen_ai.request.model",
                       ev.get("gen_ai.request.model", data.get("model", "unknown"))),
                 _attr("event.subject", ev.get("subject", "")),
                 _attr("event.source", ev.get("source", ""))]
        for k in ("input_tokens", "output_tokens"):
            if k in data:
                attrs.append(_attr("gen_ai.usage." + k, data[k]))
        if "finish_reason" in data:
            attrs.append(_attr("gen_ai.response.finish_reasons",
                               [str(data["finish_reason"])]))
        start = _nanos(ev.get("time", ""))
        spans.append({"traceId": _trace_id(run_id),
                      "spanId": _span_id(ev.get("id", "")),
                      "name": ev.get("type", "unknown"),
                      "startTimeUnixNano": start,
                      "endTimeUnixNano": str(int(start) + 1000000),
                      "attributes": attrs, "status": {}})
    return {"resourceSpans": [{
        "resource": {"attributes": [_attr("service.name", service)]},
        "scopeSpans": [{"scope": {"name": "steroids/bus"}, "spans": spans}]}]}


def post_otlp(payload, endpoint="http://localhost:4318"):
    body = json.dumps(payload).encode()
    req = urllib.request.Request(endpoint + OTLP_TRACES_PATH, data=body,
                                 headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=10) as r:
        return r.status
