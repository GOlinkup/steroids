"""Stdlib unittest for phase-2 shared learning (misses -> shared rules).

Covers: corrections rollup shape, payload assembly (corrections-only day),
sync_shared_rules() add-only merge, and router._merge_shared_rules().
No network: global_counts is stubbed; everything else is tmp files.
"""
import importlib.util
import json
import os
import sys
import tempfile
import time
import unittest

_HERE = os.path.dirname(os.path.abspath(__file__))
_SRC = os.path.normpath(os.path.join(_HERE, "..", "src", "steroids"))


def _load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


share = _load("steroids_share_under_test", os.path.join(_SRC, "share.py"))
router = _load("steroids_router_under_test", os.path.join(_SRC, "router.py"))


def _tmpdir():
    return tempfile.mkdtemp(prefix="steroids-shared-")


def _write_log(path, rows):
    with open(path, "w", encoding="utf-8") as f:
        for o in rows:
            f.write(json.dumps(o) + "\n")


class TestCorrectionsRollup(unittest.TestCase):
    def test_correction_rows_aggregate_by_trig_and_skill(self):
        d = _tmpdir()
        log = os.path.join(d, "served.jsonl")
        now = time.time()
        _write_log(log, [
            {"t": now, "q": "x", "trigs": "verify,device,lease", "skills": "", "correction": "ck-lease"},
            {"t": now, "q": "x", "trigs": "verify,device,lease", "skills": "", "correction": "ck-lease"},
            {"t": now, "q": "y", "trigs": "other", "skills": "", "correction": "ck-lease"},
        ])
        day, skills, corr = share._rollup_from_log(log, os.path.join(d, "memory.json"))
        self.assertEqual(corr, [
            {"trig_key": "verify,device,lease", "skill": "ck-lease", "hits": 2},
            {"trig_key": "other", "skill": "ck-lease", "hits": 1},
        ])
        self.assertIn("ck-lease", {s["skill"] for s in skills})

    def test_today_only_and_invalid_trig_key_skipped(self):
        d = _tmpdir()
        log = os.path.join(d, "served.jsonl")
        _write_log(log, [
            {"t": 0, "q": "old", "trigs": "old,trigs", "skills": "", "correction": "ck-old"},
            {"t": time.time(), "q": "bad", "trigs": "bad trig with spaces!", "skills": "", "correction": "ck-bad"},
        ])
        _, _, corr = share._rollup_from_log(log, os.path.join(d, "memory.json"))
        self.assertEqual(corr, [])

    def test_served_row_is_not_a_correction(self):
        d = _tmpdir()
        log = os.path.join(d, "served.jsonl")
        _write_log(log, [{"t": time.time(), "q": "x", "trigs": "a", "skills": "ck/a"}])
        _, _, corr = share._rollup_from_log(log, os.path.join(d, "memory.json"))
        self.assertEqual(corr, [])


class TestPayloadAssembly(unittest.TestCase):
    def test_normal_day_has_counters_and_corrections(self):
        p = share._build_payload("2026-09-25",
                                 [{"skill": "ck-a", "serves": 1, "accepts": 0, "misses": 0}],
                                 [{"trig_key": "a", "skill": "ck-a", "hits": 1}])
        self.assertEqual(p["skills"][0]["skill"], "ck-a")
        self.assertEqual(p["corrections"][0]["trig_key"], "a")

    def test_corrections_only_day_carries_zero_counter_rows(self):
        # Hub rejects empty skills arrays; zero-count rows keep the POST valid
        # without adding signal beyond the corrections themselves.
        p = share._build_payload("2026-09-25", [], [{"trig_key": "a", "skill": "ck-a", "hits": 1}])
        self.assertEqual(p["skills"], [{"skill": "ck-a", "serves": 0, "accepts": 0, "misses": 0}])
        self.assertEqual(p["corrections"][0]["trig_key"], "a")

    def test_plain_day_has_no_corrections_key(self):
        p = share._build_payload("2026-09-25",
                                 [{"skill": "ck-a", "serves": 1, "accepts": 0, "misses": 0}], [])
        self.assertNotIn("corrections", p)


class TestSyncSharedRules(unittest.TestCase):
    def setUp(self):
        self._orig = share.global_counts
        self._url = share.STATIC_URL
        # hermetic: static snapshot unreachable -> exercises function fallback
        share.STATIC_URL = "http://127.0.0.1:1/none.json"
        self.d = _tmpdir()

    def tearDown(self):
        share.global_counts = self._orig
        share.STATIC_URL = self._url

    def test_static_first_skips_function(self):
        import urllib.request
        static = {"generated_at": "t", "shared_rules": [
            {"trigs": ["aaa", "bbb"], "skill": "zz-static", "weight": 9}]}
        fp = os.path.join(self.d, "shared.json")
        with open(fp, "w", encoding="utf-8") as f:
            json.dump(static, f)
        share.STATIC_URL = "file://" + fp
        def boom(url, timeout=6):
            raise AssertionError("function GET must not fire when static serves")
        share.global_counts = boom
        out = share.sync_shared_rules(self.d)
        self.assertTrue(out["ok"])
        with open(os.path.join(self.d, "shared-rules.json"), encoding="utf-8") as f:
            self.assertEqual(json.load(f)["skills"]["zz-static"], ["aaa", "bbb"])

    def _hub(self, rules):
        share.global_counts = lambda url, timeout=6: {
            "generated_at": "t", "shared_rules": rules}

    def test_writes_file_and_reports_added(self):
        self._hub([{"trigs": ["verify", "device"], "skill": "ck-lease", "weight": 9}])
        r = share.sync_shared_rules(self.d, now=123.0)
        self.assertTrue(r["ok"])
        self.assertEqual(r["added"], 1)
        with open(share.shared_rules_path(self.d), encoding="utf-8") as f:
            out = json.load(f)
        self.assertEqual(out["skills"]["ck-lease"], ["verify", "device"])
        self.assertEqual(out["shared_rules_ts"], 123.0)

    def test_add_only_never_overwrites_existing_list(self):
        path = share.shared_rules_path(self.d)
        with open(path, "w", encoding="utf-8") as f:
            json.dump({"skills": {"ck-lease": ["local"]}, "shared_rules_ts": 1}, f)
        self._hub([{"trigs": ["hub"], "skill": "ck-lease", "weight": 1}])
        r = share.sync_shared_rules(self.d)
        self.assertTrue(r["ok"])
        with open(path, encoding="utf-8") as f:
            self.assertEqual(json.load(f)["skills"]["ck-lease"], ["local"])

    def test_invalid_skill_or_empty_trigs_skipped(self):
        self._hub([{"trigs": [], "skill": "ck-a"},
                   {"trigs": ["x"], "skill": "BAD SLUG"},
                   {"trigs": ["ok"], "skill": "ck-good"}])
        r = share.sync_shared_rules(self.d)
        with open(share.shared_rules_path(self.d), encoding="utf-8") as f:
            self.assertEqual(list(json.load(f)["skills"]), ["ck-good"])

    def test_no_shared_rules_key_fails_clean(self):
        share.global_counts = lambda url, timeout=6: {"totals": {}}
        self.assertEqual(share.sync_shared_rules(self.d)["ok"], False)


class TestRouterSharedMerge(unittest.TestCase):
    def setUp(self):
        self.d = _tmpdir()
        self._orig = router.SHARED_RULES_PATH
        router.SHARED_RULES_PATH = os.path.join(self.d, "shared-rules.json")

    def tearDown(self):
        router.SHARED_RULES_PATH = self._orig

    def test_shared_rules_add_skill_and_never_shrink_local(self):
        with open(router.SHARED_RULES_PATH, "w", encoding="utf-8") as f:
            json.dump({"skills": {"ck-lease": ["verify", "device"],
                                  "code-review": ["hub-only"]}}, f)
        rules = router._merge_shared_rules({"skills": {"code-review": ["review", "pr"]}})
        self.assertEqual(rules["skills"]["ck-lease"], ["verify", "device"])
        self.assertEqual(rules["skills"]["code-review"], ["review", "pr"])

    def test_missing_or_corrupt_file_is_noop(self):
        base = {"skills": {"ck-a": ["a"]}}
        self.assertEqual(router._merge_shared_rules(base)["skills"], {"ck-a": ["a"]})
        with open(router.SHARED_RULES_PATH, "w", encoding="utf-8") as f:
            f.write("not json {")
        self.assertEqual(router._merge_shared_rules(base)["skills"], {"ck-a": ["a"]})

    def test_malformed_shapes_ignored(self):
        with open(router.SHARED_RULES_PATH, "w", encoding="utf-8") as f:
            json.dump({"skills": {"ck-a": "nope", "ck-b": [], "ck-c": ["ok"]}}, f)
        rules = router._merge_shared_rules({"skills": {}})
        self.assertEqual(rules["skills"], {"ck-c": ["ok"]})


if __name__ == "__main__":
    unittest.main(verbosity=2)
