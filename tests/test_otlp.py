"""Stdlib unittest for OTLP export (M7). No backend needed."""
import importlib.util
import os
import re
import unittest

_HERE = os.path.dirname(os.path.abspath(__file__))
_SRC = os.path.normpath(os.path.join(_HERE, "..", "src", "steroids"))


def _load(name):
    spec = importlib.util.spec_from_file_location("st_" + name,
                                                  os.path.join(_SRC, name + ".py"))
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


bus = _load("bus")
otlp = _load("otlp")


def _evs():
    return [bus.make_event(t, "run-1/task-1", {"model": "m"}) for t in bus.TYPES]


class TestOtlp(unittest.TestCase):
    def test_all_types_convert(self):
        p = otlp.to_otlp(_evs(), "run-1")
        spans = p["resourceSpans"][0]["scopeSpans"][0]["spans"]
        self.assertEqual(len(spans), len(bus.TYPES))
        self.assertEqual({s["name"] for s in spans}, set(bus.TYPES))

    def test_field_shapes(self):
        (s,) = otlp.to_otlp(_evs()[:1], "run-1")["resourceSpans"][0]["scopeSpans"][0]["spans"]
        self.assertRegex(s["traceId"], r"^[0-9a-f]{32}$")
        self.assertRegex(s["spanId"], r"^[0-9a-f]{16}$")
        self.assertRegex(s["startTimeUnixNano"], r"^\d+$")
        keys = {a["key"] for a in s["attributes"]}
        self.assertIn("gen_ai.request.model", keys)

    def test_run_trace_stable_spans_unique(self):
        a = otlp.to_otlp(_evs(), "run-1")
        b = otlp.to_otlp(_evs(), "run-1")
        sa = a["resourceSpans"][0]["scopeSpans"][0]["spans"]
        sb = b["resourceSpans"][0]["scopeSpans"][0]["spans"]
        self.assertEqual(sa[0]["traceId"], sb[0]["traceId"])
        self.assertEqual(len({s["spanId"] for s in sa}), len(sa))


if __name__ == "__main__":
    unittest.main()
