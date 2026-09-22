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
                body = b"<html><head><title>t</title></head><body><p>Hello PDF world</p></body></html>"
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


if __name__ == "__main__":
    unittest.main()
