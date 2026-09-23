#!/usr/bin/env python3
"""M7 demo: Steroids run -> OTLP/HTTP -> unmodified Jaeger -> trace found.

Needs Jaeger all-in-one on :4318/:16686 (stock binary, zero config).
Verdict comes from Jaeger's own HTTP API, not our code. Stdlib only.
"""
import importlib.util
import json
import os
import sys
import urllib.request

_HERE = os.path.dirname(os.path.abspath(__file__))
JAEGER = "http://localhost:16686"
OTLP = "http://localhost:4318"


def _load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


def main():
    src = os.path.join(_HERE, "..", "..", "src", "steroids")
    bus = _load("st_bus_m7", os.path.join(src, "bus.py"))
    ids = _load("st_ids_m7", os.path.join(src, "ids.py"))
    otlp = _load("st_otlp_m7", os.path.join(src, "otlp.py"))
    run = ids.run_id()
    task = "task-" + ids.new_id()
    evs = [bus.make_event("task.created", f"{run}/{task}", {"model": "m7-demo"}),
           bus.make_event("skill.routed", f"{run}/{task}", {"model": "m7-demo"}),
           bus.make_event("task.completed", f"{run}/{task}", {"model": "m7-demo"})]
    payload = otlp.to_otlp(evs, run)
    trace = payload["resourceSpans"][0]["scopeSpans"][0]["spans"][0]["traceId"]
    st = otlp.post_otlp(payload, OTLP)
    with urllib.request.urlopen(f"{JAEGER}/api/traces/{trace}", timeout=10) as r:
        found = json.load(r)
    n = len(found.get("data", [{}])[0].get("spans", []))
    print(f"post: {st}, trace {trace}: {n} spans in Jaeger")
    print(f"view: {JAEGER}/trace/{trace}")
    if st not in (200, 204) or n != 3:
        print("M7 FAIL: trace not rendered")
        return 1
    print("M7 OK: Steroids run renders in unmodified Jaeger, no bespoke exporter")
    return 0


if __name__ == "__main__":
    sys.exit(main())
