"""Stdlib unittest for bus/ids/schema (P1-1..P1-3). No install."""
import importlib.util
import json
import os
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
ids = _load("ids")

class TestBus(unittest.TestCase):
    def test_ids_unique_format(self):
        seen = {ids.new_id() for _ in range(1000)}
        self.assertEqual(len(seen), 1000)
        self.assertTrue(all(ids.valid(s) for s in seen))

    def test_emit_subscribe_replay(self):
        got = []
        bus.subscribe("skill.routed", got.append)
        ev = bus.emit("skill.routed", "run-1/task-1", {"skills": "a/b"})
        self.assertEqual(ev["source"], "steroids/bus")
        self.assertEqual(got[-1]["id"], ev["id"])
        p = "/tmp/steroids-bus-test.jsonl"
        if os.path.exists(p):
            os.remove(p)
        bus.emit("task.created", "run-1", {"goal": "x"}, sink=p)
        rows = list(bus.replay(p))
        self.assertEqual(len(rows), 1)
        os.remove(p)

    def test_cloudevent_validates(self):
        schema = json.load(open(os.path.join(_HERE, "..", "specs", "phase-1", "events.schema.json")))
        ev = bus.to_cloudevent(bus.make_event("skill.routed", "r/t", {"model": "m"}))
        for k in schema["required"]:
            self.assertIn(k, ev)
        self.assertIn(ev["type"], schema["properties"]["type"]["enum"])
        self.assertEqual(ev["gen_ai.request.model"], "m")

if __name__ == "__main__":
    unittest.main()
