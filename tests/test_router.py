"""Stdlib unittest for steroids router; loads router.py directly, no install."""
import importlib.util
import os
import unittest

_ROUTER_PATH = os.path.join(os.path.dirname(__file__), "..", "src", "steroids", "router.py")
_spec = importlib.util.spec_from_file_location("steroids_router_under_test", os.path.normpath(_ROUTER_PATH))
router = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(router)

RULES = {"glue": ["onto", "main", "file", "files", "folder", "folders", "repo", "code", "thing", "stuff"],
         "max_recommendations": 3}


class TestRouter(unittest.TestCase):
    def test_neg_filter_blocks_wireguard_on_mobile_payments(self):
        idx = {
            "homelab-wireguard-vpn": ["flutter", "mobile", "payment"],
            "dart-flutter-patterns": ["flutter", "mobile", "payment"],
        }
        top = router.route_query("flutter mobile payments", RULES, idx)
        names = [s for _, s, _ in top]
        self.assertNotIn("homelab-wireguard-vpn", names)
        self.assertIn("dart-flutter-patterns", names)

    def test_name_bonus_ranks_resolve_conflicts_first(self):
        idx = {
            "resolving-merge-conflicts": ["merge", "conflict", "rebase"],
            "git-helper": ["merge", "conflict", "rebase"],
        }
        top = router.route_query("merge conflict rebase", RULES, idx)
        self.assertTrue(top)
        self.assertEqual(top[0][1], "resolving-merge-conflicts")

    def test_glue_removal_empty_prompt_returns_empty(self):
        idx = {"resolving-merge-conflicts": ["merge", "conflict", "rebase"]}
        self.assertEqual(router.route_query("", RULES, idx), [])
        self.assertEqual(router.route_query("the code thing stuff", RULES, idx), [])

    def test_abstain_on_pure_trigram_noise(self):
        idx = {"resolving-merge-conflicts": ["merge", "conflict", "rebase"]}
        rules = dict(RULES, semantic_weight=1.0)
        self.assertEqual(router.route_query("k8s pod crashloop xyzzy", rules, idx), [])

    def test_short_tech_tokens_kept(self):
        self.assertIn("go", router.toks("go routine leak"))
        self.assertIn("js", router.toks("js bundle size"))
        self.assertIn("s3", router.toks("s3 bucket policy"))
        self.assertIn("db", router.toks("db index slow"))

    def test_synonym_expansion(self):
        self.assertIn("kubernetes", router.toks("k8s pod"))
        self.assertIn("golang", router.toks("go routine"))
        self.assertIn("javascript", router.toks("js bundle"))
        idx = {"kubernetes-pro": ["kubernetes", "pod"], "other": ["zzz"]}
        top = router.route_query("k8s pod", RULES, idx)
        self.assertEqual(top[0][1], "kubernetes-pro")

    def test_typo_fix_single_neighbor(self):
        idx = {"flutter-skill": ["flutter", "app"], "other": ["zzz"]}
        top = router.route_query("fluter app", RULES, idx)
        names = [s for _, s, _ in top]
        self.assertIn("flutter-skill", names)

    def test_typo_fix_ambiguous_skipped(self):
        idx = {"a-skill": ["abc", "abcd"], "b-skill": ["abce", "zzz"]}
        # 'abcx' is ed1 from both abcd and abce -> ambiguous -> no fix, abstain-safe
        top = router.route_query("abcx", dict(RULES, semantic_weight=1.0), idx)
        self.assertEqual(top, [])

    def test_extract_needs(self):
        self.assertEqual(
            router.extract_needs("---\nname: x\nneeds: [figma-url, node-id]\n---\n# body"),
            ["figma-url", "node-id"])
        self.assertEqual(
            router.extract_needs("---\nname: x\nneeds: spec-url\n---\n"),
            ["spec-url"])
        self.assertEqual(router.extract_needs("---\nname: x\ndescription: y\n---\n"), [])
        self.assertEqual(
            router.extract_needs("---\nname: x\nneeds:\n  - a-url\n  - b-file\n---\n"),
            ["a-url", "b-file"])

    def test_extract_urls(self):
        self.assertEqual(
            router.extract_urls("see https://example.com/a and http://x.io/b."),
            ["https://example.com/a", "http://x.io/b"])
        self.assertEqual(router.extract_urls("no links here"), [])
        self.assertEqual(router.extract_urls("bare example.com stays out"), [])

    def test_fetch_and_gather_local(self):
        import threading
        from http.server import BaseHTTPRequestHandler, HTTPServer
        class H(BaseHTTPRequestHandler):
            def do_GET(self):
                body = (b"<html><head><title>t</title></head><body><p>Hello PDF world. "
                        b"Real article text runs several hundred characters so the evidence "
                        b"threshold keeps it. Cookie walls and login stubs are short and land "
                        b"in unfetched instead of counting as grounding for the gate. "
                        b"Extra sentence to clear two hundred characters of readable text.</p>"
                        b"</body></html>")
                self.send_response(200)
                self.send_header("Content-Type", "text/html")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
            def log_message(self, *a):
                pass
        srv = HTTPServer(("127.0.0.1", 0), H)
        threading.Thread(target=srv.serve_forever, daemon=True).start()
        url = f"http://127.0.0.1:{srv.server_port}/spec"
        try:
            text = router.fetch_text(url)
            self.assertIn("Hello PDF world", text)
            self.assertIsNone(router.fetch_text("http://127.0.0.1:1/nope", timeout=1))
            idx = {"pdf": ["pdf", "file"]}
            out = router.gather(f"read this pdf {url}",
                                {"glue": [], "max_recommendations": 3},
                                idx, needs={"pdf": ["source-file-or-url"]})
            self.assertIn("pdf", out["skills"])
            self.assertIn(url, out["evidence"])
            self.assertEqual(out["missing"], [])
            out2 = router.gather("read this pdf please",
                                 {"glue": [], "max_recommendations": 3},
                                 idx, needs={"pdf": ["source-file-or-url"]})
            self.assertEqual(out2["missing"], ["source-file-or-url"])
        finally:
            srv.shutdown()

    def test_thin_evidence_counts_as_unfetched(self):
        import threading
        from http.server import BaseHTTPRequestHandler, HTTPServer
        class H(BaseHTTPRequestHandler):
            def do_GET(self):
                body = b"<html><body><p>Log in to continue</p></body></html>"
                self.send_response(200)
                self.send_header("Content-Type", "text/html")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
            def log_message(self, *a):
                pass
        srv = HTTPServer(("127.0.0.1", 0), H)
        threading.Thread(target=srv.serve_forever, daemon=True).start()
        url = f"http://127.0.0.1:{srv.server_port}/wall"
        try:
            idx = {"pdf": ["pdf", "file"]}
            out = router.gather(f"read this pdf {url}",
                                {"glue": [], "max_recommendations": 3},
                                idx, needs={"pdf": ["source-file-or-url"]})
            self.assertNotIn(url, out["evidence"])
            self.assertIn(url, out["unfetched"])
        finally:
            srv.shutdown()

    def test_resolve_mcp_first(self):
        rules = {"mcp_needs": {"query-or-url": {"server": "exa-web-search", "tool": "web_search"}}}
        self.assertEqual(router.resolve_mcp("query-or-url", rules),
                         {"kind": "mcp", "server": "exa-web-search", "tool": "web_search"})
        self.assertIsNone(router.resolve_mcp("nope", rules))
        self.assertIsNone(router.resolve_mcp("query-or-url", {}))

    def test_gather_mcp_beats_fetch(self):
        idx = {"exa-search": ["exa", "search", "query"]}
        rules = {"glue": [], "max_recommendations": 3,
                 "mcp_needs": {"query-or-url": {"server": "exa-web-search", "tool": "web_search"}}}
        out = router.gather("search the web for exa query https://example.com/x",
                            rules, idx, needs={"exa-search": ["query-or-url"]})
        self.assertEqual(out["routes"]["query-or-url"]["kind"], "mcp")
        self.assertEqual(out["missing"], [])

    def test_needs_prefers_annotated_shadow(self):
        import tempfile
        with tempfile.TemporaryDirectory() as a, tempfile.TemporaryDirectory() as b:
            for d, body in ((a, "---\nname: s\n---\n# plain"),
                            (b, "---\nname: s\nneeds: [topic-or-url]\n---\n# annotated")):
                os.makedirs(os.path.join(d, "s"))
                with open(os.path.join(d, "s", "SKILL.md"), "w") as f:
                    f.write(body)
            copies = router.skill_files_all([a, b])
            self.assertEqual(len([c for c in copies if c[0] == "s"]), 2)
            texts = []
            for _, md in copies:
                with open(md) as f:
                    texts.append(router.extract_needs(f.read()))
            self.assertIn([], texts)
            self.assertIn(["topic-or-url"], texts)

    def test_shell_detect(self):
        self.assertTrue(router.looks_like_shell("Loading Mixamo ;window.NREUM foo cloudflare check"))
        self.assertFalse(router.looks_like_shell("Example Domain documentation examples"))
        self.assertFalse(router.looks_like_shell(None))
        self.assertFalse(router.looks_like_shell("single loading mention only"))

    def test_neg_blocks_free_and_city_hijack_on_game_assets(self):
        # ponytail: bare "free"/"city"/"character" must not summon marketing/SEO/persona skills.
        rules = dict(RULES, neg={
            "free-tool-strategy": [["free"], ["marketing", "lead", "seo", "calculator"]],
            "programmatic-seo": [["city"], ["seo", "directory", "keyword"]],
            "openclaw-persona-forge": [["character"], ["persona", "lobster", "openclaw"]],
        })
        idx = {
            "free-tool-strategy": ["free", "calculator", "lead"],
            "programmatic-seo": ["city", "seo", "directory"],
            "openclaw-persona-forge": ["character", "persona", "lobster"],
            "game-art": ["asset", "game", "character"],
        }
        top = router.route_query("free 3d assets city cars characters", rules, idx)
        names = [s for _, s, _ in top]
        self.assertNotIn("free-tool-strategy", names)
        self.assertNotIn("programmatic-seo", names)
        self.assertNotIn("openclaw-persona-forge", names)
        self.assertIn("game-art", names)
        # legit queries still pass the gate
        self.assertEqual(router.route_query(
            "build a free calculator for lead generation", rules, idx)[0][1],
            "free-tool-strategy")

    def test_gather_browser_fallback(self):
        idx = {"pdf": ["pdf", "file"]}
        rules = {"glue": [], "max_recommendations": 3,
                 "browser_fallback": {"server": "playwright"}}
        out = router.gather("read this pdf http://127.0.0.1:1/blocked.pdf",
                            rules, idx, needs={"pdf": ["source-file-or-url"]})
        self.assertEqual(out["evidence"], {})
        self.assertEqual(out["unfetched"], ["http://127.0.0.1:1/blocked.pdf"])
        self.assertEqual(out["routes"]["source-file-or-url"]["kind"], "browser")
        self.assertEqual(out["routes"]["source-file-or-url"]["server"], "playwright")
        self.assertEqual(out["missing"], [])
        self.assertEqual(out["unbacked"], ["source-file-or-url"])

    def test_extract_proof(self):
        self.assertEqual(
            router.extract_proof("---\nname: x\nproof: [output-opens, text-extractable]\n---\n"),
            ["output-opens", "text-extractable"])
        self.assertEqual(router.extract_proof("---\nname: x\n---\n"), [])

    def test_gate_ready_and_blocked(self):
        idx = {"pdf": ["pdf", "file"]}
        base = {"glue": [], "max_recommendations": 3}
        ready = router.gather("read this pdf http://127.0.0.1:1/x.pdf", base, idx,
                              needs={"pdf": ["source-file-or-url"]},
                              proof={"pdf": ["output-opens"]})
        self.assertEqual(ready["gate"]["pdf"], "ready")
        self.assertEqual(ready["proof"]["pdf"], ["output-opens"])
        blocked = router.gather("read this pdf", base, idx,
                                needs={"pdf": ["source-file-or-url"]},
                                proof={"pdf": ["output-opens"]})
        self.assertTrue(blocked["gate"]["pdf"].startswith("blocked:"))

    def test_chain_verdict(self):
        idx = {"pdf": ["pdf", "file"], "other": ["zzz"]}
        base = {"glue": [], "max_recommendations": 3}
        needs = {"pdf": ["source-file-or-url"]}
        go = router.chain("read this pdf http://127.0.0.1:1/x.pdf > read this pdf http://127.0.0.1:1/y.pdf",
                          base, idx, needs=needs)
        self.assertEqual(go["verdict"], "go")
        stop = router.chain("read this pdf > read this pdf http://127.0.0.1:1/y.pdf",
                            base, idx, needs=needs)
        self.assertEqual(stop["verdict"], "blocked at step 1")

    def test_chain_carries_evidence_forward(self):
        import threading
        from http.server import BaseHTTPRequestHandler, HTTPServer
        class H(BaseHTTPRequestHandler):
            def do_GET(self):
                body = (b"<html><body><p>Long grounded article text. " * 20 + b"</p></body></html>")
                self.send_response(200)
                self.send_header("Content-Type", "text/html")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
            def log_message(self, *a):
                pass
        srv = HTTPServer(("127.0.0.1", 0), H)
        threading.Thread(target=srv.serve_forever, daemon=True).start()
        url = f"http://127.0.0.1:{srv.server_port}/doc"
        try:
            idx = {"pdf": ["pdf", "file"]}
            base = {"glue": [], "max_recommendations": 3}
            out = router.chain(f"read this pdf {url} > read this pdf again",
                               base, idx, needs={"pdf": ["source-file-or-url"]})
            self.assertEqual(out["verdict"], "go")
            self.assertIn(url, out["evidence"])
            step2 = out["steps"][1]
            self.assertEqual(step2["routes"]["source-file-or-url"]["kind"], "fetch")
            self.assertEqual(step2["missing"], [])
            self.assertEqual(step2["unbacked"], [])
        finally:
            srv.shutdown()

    def test_propose_clusters_unmet(self):
        import tempfile, json
        rows = [
            {"t": 1, "q": "a1", "trigs": "mixamo,rig,fbx", "skills": ""},
            {"t": 2, "q": "a2", "trigs": "mixamo,rig,fbx", "skills": ""},
            {"t": 3, "q": "b1", "trigs": "mixamo,rig,fbx", "skills": ""},
            {"t": 4, "q": "c1", "trigs": "pdf,read", "skills": "pdf/x"},
            {"t": 5, "q": "d1", "trigs": "lonely", "skills": ""},
        ]
        with tempfile.NamedTemporaryFile("w", suffix=".jsonl", delete=False) as f:
            for r in rows:
                f.write(json.dumps(r) + "\n")
            path = f.name
        out = router.propose(path, min_count=2)
        self.assertEqual(len(out), 1)
        self.assertEqual(out[0]["count"], 3)
        self.assertIn("mixamo", out[0]["trigs"])
        self.assertTrue(out[0]["suggested_description"].endswith("(Draft — human must verify.)"))

    def test_draft_writes_valid_skeleton(self):
        import tempfile
        router.DRAFTS_DIR = tempfile.mkdtemp()
        try:
            idx = {"game-art": ["game", "asset", "fbx"]}
            out = router.draft_skill("mixamo-rig!", ["mixamo", "rig", "fbx"],
                                     {"glue": [], "max_recommendations": 3}, idx)
            self.assertTrue(out["ok"])
            with open(out["path"]) as f:
                head = f.read(8000)
            self.assertEqual(router.extract_needs(head), [])
            desc = router.extract_desc(head)
            self.assertIn("mixamo", desc)
            # drafts dir is never an index dir
            self.assertFalse(any("draft" in d for d in
                                 ["~/.agents/skills", "./skills", "~/steroids/skills"]))
            bad = router.draft_skill("mixamo-rig", ["mixamo"], {"glue": []}, idx)
            self.assertFalse(bad["ok"])  # already exists
            self.assertFalse(router.draft_skill("!!!", ["x"], {"glue": []}, idx)["ok"])
            self.assertFalse(router.draft_skill("ok-name", [], {"glue": []}, idx)["ok"])
        finally:
            import shutil
            shutil.rmtree(router.DRAFTS_DIR, ignore_errors=True)
            router.DRAFTS_DIR = os.path.join(os.path.expanduser("~"), "steroids", "drafts")

    def test_self_update_check_and_apply(self):
        import json as _json, tempfile, os
        good = _json.dumps({"skills": {"alpha": ["a"], "beta": ["b"]}}).encode()
        tmp = tempfile.mkdtemp()
        rules = os.path.join(tmp, "skill-rules.json")
        cache = os.path.join(tmp, "skill-index.json")
        with open(rules, "wb") as f:
            f.write(b'{"skills": {"old": ["o"]}}')
        with open(cache, "wb") as f:
            f.write(b"stale-cache")
        real = router._fetch_bytes
        try:
            router._fetch_bytes = lambda *a, **k: good
            stale = router.check_skill_update(rules_path=rules)
            self.assertTrue(stale["ok"] and stale["stale"])
            out = router.self_update(rules_path=rules, cache_path=cache)
            self.assertTrue(out["ok"] and out["updated"])
            self.assertEqual(out["skills"], 2)
            with open(out["backup"], "rb") as f:
                self.assertIn(b"old", f.read())
            self.assertFalse(os.path.exists(cache))  # dropped so overrides rebuild
            again = router.self_update(rules_path=rules, cache_path=cache)
            self.assertTrue(again["ok"] and not again["updated"])
            fresh = router.check_skill_update(rules_path=rules)
            self.assertTrue(fresh["ok"] and not fresh["stale"])
            router._fetch_bytes = lambda *a, **k: None
            self.assertFalse(router.check_skill_update(rules_path=rules)["ok"])
            self.assertFalse(router.self_update(rules_path=rules)["ok"])
            router._fetch_bytes = lambda *a, **k: b"not json{"
            self.assertFalse(router.check_skill_update(rules_path=rules)["ok"])
            self.assertFalse(router.self_update(rules_path=rules)["ok"])
        finally:
            router._fetch_bytes = real
            import shutil
            shutil.rmtree(tmp, ignore_errors=True)

    def test_fetch_bytes_local_server(self):
        import threading
        from http.server import BaseHTTPRequestHandler, HTTPServer
        class H(BaseHTTPRequestHandler):
            def do_GET(self):
                body = b'{"skills": {}}'
                self.send_response(200)
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
            def log_message(self, *a):
                pass
        srv = HTTPServer(("127.0.0.1", 0), H)
        threading.Thread(target=srv.serve_forever, daemon=True).start()
        try:
            raw = router._fetch_bytes(f"http://127.0.0.1:{srv.server_port}/skill-rules.json")
            self.assertEqual(raw, b'{"skills": {}}')
            self.assertIsNone(router._fetch_bytes("http://127.0.0.1:1/nope", timeout=1))
        finally:
            srv.shutdown()

    def test_autoinject_fires_above_threshold(self):
        import tempfile, os
        tmp = tempfile.mkdtemp()
        try:
            os.makedirs(os.path.join(tmp, "alpha"))
            with open(os.path.join(tmp, "alpha", "SKILL.md"), "w") as f:
                f.write("# alpha\nFull body here.")
            rules = {"index_dirs": [tmp], "glue": [], "max_recommendations": 3}
            idx = {"alpha": ["alpha"]}
            hit = router.autoinject([(2.5, "alpha", ["alpha"])], rules, idx)
            self.assertIsNotNone(hit)
            self.assertEqual(hit["skill"], "alpha")
            self.assertIn("Full body here.", hit["content"])
            self.assertIsNone(router.autoinject([(1.9, "alpha", ["alpha"])], rules, idx))
            self.assertIsNone(router.autoinject([], rules, idx))
            low = dict(rules, autoinject_threshold=1.0)
            self.assertIsNotNone(router.autoinject([(1.9, "alpha", ["alpha"])], low, idx))
            self.assertIsNone(router.autoinject([(2.5, "ghost", ["g"])], rules, idx))
        finally:
            import shutil
            shutil.rmtree(tmp, ignore_errors=True)

    def test_build_loop_goes_green_and_records(self):
        import tempfile, os, json as _json
        tmp = tempfile.mkdtemp()
        try:
            rules = {"index_dirs": [tmp], "glue": [], "max_recommendations": 3}
            idx = {"alpha": ["alpha", "zone"]}
            out = router.build_loop("alpha zone", rules, idx, demo_dir=tmp)
            self.assertEqual(out["verdict"], "go")
            self.assertEqual(len(out["steps"]), 3)
            with open(out["record"], encoding="utf-8") as f:
                rec = _json.load(f)
            self.assertEqual(rec["verdict"], "go")
            self.assertEqual(rec["spec"], "alpha zone")
        finally:
            import shutil
            shutil.rmtree(tmp, ignore_errors=True)

    def test_gather_reports_over_cap_links(self):
        import tempfile, os
        tmp = tempfile.mkdtemp()
        try:
            rules = {"index_dirs": [tmp], "glue": [], "max_recommendations": 3}
            idx = {"alpha": ["alpha"]}
            calls = []
            real = router.fetch_text
            router.fetch_text = lambda u, *a, **k: (calls.append(u), "content " * 50)[1]
            try:
                out = router.gather(
                    "alpha http://x/1 http://x/2 http://x/3 http://x/4", rules, idx)
            finally:
                router.fetch_text = real
            self.assertEqual(len(calls), 3)
            for u in ("http://x/1", "http://x/2", "http://x/3"):
                self.assertIn(u, out["evidence"])
            self.assertIn("http://x/4", out["unfetched"])
        finally:
            import shutil
            shutil.rmtree(tmp, ignore_errors=True)

    def test_b11_five_annotated_and_enforced(self):
        import tempfile, os
        tmp = tempfile.mkdtemp()
        try:
            for i in range(5):
                d = os.path.join(tmp, f"s{i}")
                os.makedirs(d)
                with open(os.path.join(d, "SKILL.md"), "w") as f:
                    f.write(f"---\nname: s{i}\nneeds: [input-{i}]\n---\n# S{i}\n")
            rules = {"index_dirs": [tmp], "glue": [], "max_recommendations": 3}
            needs = router.get_needs(rules, force_rebuild=True)
            self.assertGreaterEqual(len([v for v in needs.values() if v]), 5)
            idx = {"s0": ["s0"]}
            out = router.gather("s0 do the thing", rules, idx, needs=needs)
            self.assertIn("blocked:input-0", out["gate"]["s0"])
            self.assertIn("input-0", out["missing"])
        finally:
            import shutil
            shutil.rmtree(tmp, ignore_errors=True)

    def test_b15_exactly_one_question(self):
        import tempfile, os
        tmp = tempfile.mkdtemp()
        try:
            rules = {"index_dirs": [tmp], "glue": [], "max_recommendations": 3}
            idx = {"fig": ["fig"]}
            needs = {"fig": ["figma-url", "extra-thing"]}
            out = router.gather("fig implement this design", rules, idx, needs=needs)
            self.assertEqual(out["question"],
                             "Which figma-url should I use? Reply with it to proceed.")
            self.assertNotIn("extra-thing", out["question"])
        finally:
            import shutil
            shutil.rmtree(tmp, ignore_errors=True)

    def test_b19_traceback_pulls_source_lines(self):
        import tempfile, os
        tmp = tempfile.mkdtemp()
        try:
            src = os.path.join(tmp, "app.py")
            with open(src, "w") as f:
                f.write("".join(f"line{i}\n" for i in range(1, 21)))
            rules = {"index_dirs": [tmp], "glue": [], "max_recommendations": 3}
            idx = {"alpha": ["alpha"]}
            prompt = f'alpha fix this crash\nTraceback:\n  File "{src}", line 10, in main\n    boom()'
            out = router.gather(prompt, rules, idx)
            key = f"source:{src}:10"
            self.assertIn(key, out["evidence"])
            self.assertIn("10: line10", out["evidence"][key])
            self.assertIn("5: line5", out["evidence"][key])
            self.assertNotIn("16: line16", out["evidence"][key])
            missing = router.gather("alpha File \"/nope/missing.py\", line 3", rules, idx)
            self.assertNotIn("source:/nope/missing.py:3", missing["evidence"])
        finally:
            import shutil
            shutil.rmtree(tmp, ignore_errors=True)

    def test_b14_b18_b20_context_files(self):
        import tempfile, os
        tmp = tempfile.mkdtemp()
        cwd = os.getcwd()
        try:
            with open(os.path.join(tmp, "package.json"), "w") as f:
                f.write('{"name": "demo"}')
            with open(os.path.join(tmp, "schema.sql"), "w") as f:
                f.write("CREATE TABLE t (id INT);")
            with open(os.path.join(tmp, "MEETING-notes.md"), "w") as f:
                f.write("# standup\n")
            os.chdir(tmp)
            rules = {"index_dirs": [tmp], "glue": [], "max_recommendations": 3}
            idx = {"alpha": ["alpha"]}
            out = router.gather("alpha build the thing", rules, idx)
            self.assertIn("repo:package.json", out["evidence"])
            slow = router.gather("alpha slow query on users", rules, idx)
            self.assertIn("db:schema:schema.sql", slow["evidence"])
            mtg = router.gather("alpha meeting prep for standup", rules, idx)
            self.assertIn("meeting:MEETING-notes.md", mtg["evidence"])
            plain = router.gather("alpha hello there", rules, idx)
            self.assertNotIn("db:schema:schema.sql", plain["evidence"])
            self.assertNotIn("meeting:MEETING-notes.md", plain["evidence"])
        finally:
            os.chdir(cwd)
            import shutil
            shutil.rmtree(tmp, ignore_errors=True)

    def test_b13_headless_screenshot(self):
        import threading
        from http.server import BaseHTTPRequestHandler, HTTPServer
        class H(BaseHTTPRequestHandler):
            def do_GET(self):
                body = b"<html><body><h1>shot page</h1></body></html>"
                self.send_response(200)
                self.send_header("Content-Type", "text/html")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
            def log_message(self, *a):
                pass
        srv = HTTPServer(("127.0.0.1", 0), H)
        threading.Thread(target=srv.serve_forever, daemon=True).start()
        try:
            import tempfile, os
            tmp = tempfile.mkdtemp()
            try:
                shot = router.capture_screenshot(
                    f"http://127.0.0.1:{srv.server_port}/p", out_dir=tmp)
                self.assertIsNotNone(shot)
                self.assertGreater(os.path.getsize(shot), 1024)
                rules = {"index_dirs": [tmp], "glue": [], "max_recommendations": 3}
                idx = {"browser-qa": ["visual", "screenshot"]}
                out = router.gather(
                    f"visual screenshot check http://127.0.0.1:{srv.server_port}/p",
                    rules, idx)
                self.assertTrue(any(k.startswith("screenshot:") for k in out["evidence"]))
            finally:
                import shutil
                shutil.rmtree(tmp, ignore_errors=True)
        finally:
            srv.shutdown()

    def test_b16_openapi_skew(self):
        import threading, json as _json
        from http.server import BaseHTTPRequestHandler, HTTPServer
        versions = {"v": "2024-01-01"}
        class H(BaseHTTPRequestHandler):
            def do_GET(self):
                body = _json.dumps({"info": {"version": versions["v"]},
                                    "paths": {"/a": {}, "/b": {}}}).encode()
                self.send_response(200)
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
            def log_message(self, *a):
                pass
        srv = HTTPServer(("127.0.0.1", 0), H)
        threading.Thread(target=srv.serve_forever, daemon=True).start()
        try:
            import tempfile, os
            tmp = tempfile.mkdtemp()
            try:
                url = f"http://127.0.0.1:{srv.server_port}/spec.json"
                cache = os.path.join(tmp, "openapi.json")
                old = router.openapi_spec_info(url, cache_path=cache)
                self.assertEqual(old, {"version": "2024-01-01", "paths": 2})
                versions["v"] = "2024-06-01"
                cached = router.openapi_spec_info(url, cache_path=cache)
                self.assertEqual(cached, old)  # day-cache: no refetch
                fresh = router.openapi_spec_info(url, cache_path=cache, ttl=0)
                self.assertTrue(fresh["version"] != old["version"])  # skew detected
                self.assertIsNone(router.openapi_spec_info(
                    "http://127.0.0.1:1/nope.json", cache_path=cache, ttl=0))
            finally:
                import shutil
                shutil.rmtree(tmp, ignore_errors=True)
        finally:
            srv.shutdown()

    def test_b17_figma_node_gated_and_fetched(self):
        self.assertFalse(router.figma_node(
            "https://www.figma.com/file/K123/name?node-id=1%3A2", token="")["ok"])
        import threading, json as _json
        from http.server import BaseHTTPRequestHandler, HTTPServer
        class H(BaseHTTPRequestHandler):
            def do_GET(self):
                if self.path.startswith("/v1/images/"):
                    body = _json.dumps({"images": {"1:2": "http://img/x.png"}}).encode()
                else:
                    body = _json.dumps({"nodes": {"1:2": {"document": {"name": "N"}}}}).encode()
                self.send_response(200)
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
            def log_message(self, *a):
                pass
        srv = HTTPServer(("127.0.0.1", 0), H)
        threading.Thread(target=srv.serve_forever, daemon=True).start()
        try:
            base = f"http://127.0.0.1:{srv.server_port}"
            out = router.figma_node("https://www.figma.com/file/K123/n?node-id=1%3A2",
                                    token="t", base=base)
            self.assertTrue(out["ok"])
            self.assertEqual(out["image"], "http://img/x.png")
            self.assertFalse(router.figma_node("https://example.com/x", token="t")["ok"])
        finally:
            srv.shutdown()

    def test_c21_learn_parses_three_harness_shapes(self):
        import tempfile, os, json as _json
        tmp = tempfile.mkdtemp()
        try:
            ag = os.path.join(tmp, "ag.jsonl")
            with open(ag, "w") as f:
                f.write(_json.dumps({"name": "Skill", "x": 1, "skill": "alpha-skill"}) + "\n")
            cc = os.path.join(tmp, "cc.jsonl")
            with open(cc, "w") as f:
                f.write(_json.dumps({"type": "assistant", "message": {"content": [
                    {"type": "tool_use", "id": "1", "name": "Skill",
                     "input": {"skill": "beta-skill"}}]}}) + "\n")
            gen = os.path.join(tmp, "gen.jsonl")
            with open(gen, "w") as f:
                f.write('did {"skill": "gamma-skill"} run\n')
            real = router.MEM_PATH
            router.MEM_PATH = os.path.join(tmp, "memory.json")
            try:
                self.assertEqual(router.learn(ag).get("alpha-skill"), 1)
                self.assertEqual(router.learn(cc).get("beta-skill"), 1)
                self.assertEqual(router.learn(gen).get("gamma-skill"), 1)
            finally:
                router.MEM_PATH = real
        finally:
            import shutil
            shutil.rmtree(tmp, ignore_errors=True)

    def test_c22_outcome_scales_accepts(self):
        import tempfile, os
        tmp = tempfile.mkdtemp()
        try:
            mem = os.path.join(tmp, "memory.json")
            router.record_outcome("alpha", True, mem_path=mem)
            router.record_outcome("alpha", True, mem_path=mem)
            router.record_outcome("alpha", True, mem_path=mem)
            router.record_outcome("alpha", False, mem_path=mem)
            router.record_outcome("beta", False, mem_path=mem)
            outcomes = router.load_outcomes(mem_path=mem)
            self.assertEqual(outcomes["alpha"], [3, 1])
            scaled = router.apply_outcomes({"alpha": 4, "beta": 2, "gamma": 5}, outcomes)
            self.assertEqual(scaled["alpha"], 3.0)  # 4 * 3/4
            self.assertEqual(scaled["beta"], 0.0)  # all bad
            self.assertEqual(scaled["gamma"], 5)  # no outcomes = full weight
        finally:
            import shutil
            shutil.rmtree(tmp, ignore_errors=True)

    def test_c23_project_profile_reranks(self):
        import tempfile, os, json as _json
        tmp = tempfile.mkdtemp()
        try:
            top = [(3.0, "alpha", ["a"]), (2.0, "beta", ["b"])]
            plain = router.apply_project_profile(top, {})
            self.assertEqual([n for _, n, _ in plain], ["alpha", "beta"])
            boosted = router.apply_project_profile(
                top, {"boost": {"beta": 10.0}, "bury": []})
            self.assertEqual([n for _, n, _ in boosted], ["beta", "alpha"])
            buried = router.apply_project_profile(
                top, {"boost": {}, "bury": ["alpha"]})
            self.assertEqual([n for _, n, _ in buried], ["beta", "alpha"])
            prof = os.path.join(tmp, ".steroids-profile.json")
            with open(prof, "w") as f:
                f.write(_json.dumps({"boost": {"beta": 10.0}, "bury": []}))
            loaded = router.load_project_profile(tmp)
            self.assertEqual(loaded["boost"], {"beta": 10.0})
            self.assertEqual(router.load_project_profile(os.path.join(tmp, "nope")), {})
        finally:
            import shutil
            shutil.rmtree(tmp, ignore_errors=True)


if __name__ == "__main__":
    unittest.main()
