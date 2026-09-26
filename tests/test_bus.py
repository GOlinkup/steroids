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
router = _load("router")

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
        schema_path = os.path.join(_HERE, "..", "specs", "phase-1", "events.schema.json")
        with open(schema_path, encoding="utf-8") as f:
            schema = json.load(f)
        ev = bus.to_cloudevent(bus.make_event("skill.routed", "r/t", {"model": "m"}))
        for k in schema["required"]:
            self.assertIn(k, ev)
        self.assertIn(ev["type"], schema["properties"]["type"]["enum"])
        self.assertEqual(ev["gen_ai.request.model"], "m")

    def test_impression_carries_ids(self):
        # P1-2: served.jsonl rows carry run/task IDs; old readers unaffected.
        p = "/tmp/steroids-ids-test.jsonl"
        if os.path.exists(p):
            os.remove(p)
        old, router.LOG_PATH = router.LOG_PATH, p
        try:
            router._RUN_ID = None
            tid = ids.task_id()
            router.log_impression("id probe prompt", "a,b", "x/y", task_id=tid)
            router.log_impression("id probe prompt", "a,b", "x/y", task_id=tid)  # dedup: skip
            rows = [json.loads(l) for l in open(p, encoding="utf-8")]
            self.assertEqual(len(rows), 1)
            self.assertTrue(rows[0]["run"].startswith("run-") and ids.valid(rows[0]["run"]))
            self.assertEqual(rows[0]["task"], tid)
            self.assertEqual(router.load_served_counts(p), {"x": 1, "y": 1})
        finally:
            router.LOG_PATH = old
            os.remove(p)

    def test_golden_identical_bus_on_off(self):
        # P1-3: scoring output bit-identical whether the bus tap emits or not.
        # Read-only (never touches trial-stats.json); 20-prompt sample.
        root = os.path.normpath(os.path.join(_HERE, ".."))
        gdir = os.path.join(root, "benchmarks", "golden-1265")
        idx = json.load(open(os.path.join(gdir, "index.json")))
        rules = json.load(open(os.path.join(gdir, "rules.json")))
        goldens = json.load(open(os.path.join(gdir, "prompts.json")))[:20]
        descs = json.load(open(os.path.join(gdir, "descs.json")))
        router._DESC_MEM = {"key": id(idx), "map": {s: descs.get(s, "") for s in idx}}
        sink = "/tmp/steroids-bus-identical.jsonl"
        if os.path.exists(sink):
            os.remove(sink)
        off = [[s for _, s, _ in router.route_query(q, rules, idx)] for q, *_ in goldens]
        on = []
        for q, *_ in goldens:
            ranked = [s for _, s, _ in router.route_query(q, rules, idx)]
            bus.emit("skill.routed", "test/run", {"skills": "/".join(ranked[:3])}, sink=sink)
            on.append(ranked)
        self.assertEqual(on, off)
        os.remove(sink)

if __name__ == "__main__":
    unittest.main()
