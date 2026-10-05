#!/usr/bin/env python3
"""Nicki bridge: localhost HTTP so the island web UI chats with your
installed `opencode` (plain CLI, no API keys, no cloud account needed).

  GET  /health    -> {ok, opencode, claude}
  POST /chat      {message, session_id?, provider?} -> {ok, text, session, error?}
  GET  /sessions  -> recent agent sessions from the hooks event log

With --serve it also serves ../island-ui/dist, so one process is the
whole thing: `python3 island/bridge.py --serve`, open the printed URL,
just chat to it. Binds 127.0.0.1 only. If the CLI is missing, /chat
answers 503 and the web UI silently falls back to its mock replies.
"""

import json
import os
import subprocess
import sys
import time
from collections import Counter
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import agentlog  # noqa: E402  (same CLI path as the desktop island app)
import relay  # noqa: E402  (self WS relay: /relay/ws + qr/verify/send)

HOST, PORT = "127.0.0.1", 8096
BODY_LIMIT = 64 * 1024
TURN_TIMEOUT = 150  # real agent turns take a while; the UI shows thinking
SEARCH_TIMEOUT = 20

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ROUTER = os.path.join(REPO_ROOT, "src", "steroids", "router.py")
SKILLS_DIR = os.path.join(REPO_ROOT, "skills")


def live_dir():
    cand = os.path.expanduser("~/.config/steroids")
    if os.path.isdir(cand):
        return cand
    return os.path.expanduser("~/.config/opencode/plugins/steroids")


_DESCS = None


def descs():
    """{skill: description} — frozen dump, plus lazy SKILL.md for misses."""
    global _DESCS
    if _DESCS is None:
        _DESCS = {}
        try:
            with open(os.path.join(REPO_ROOT, "benchmarks", "golden-1265",
                                   "descs.json"), encoding="utf-8") as f:
                _DESCS.update(json.load(f))
        except (OSError, ValueError):
            pass
    return _DESCS


def skill_desc(name):
    d = descs().get(name)
    if d:
        return d
    try:  # backfill from frontmatter
        with open(os.path.join(SKILLS_DIR, name, "SKILL.md"),
                  encoding="utf-8") as f:
            lines = [next(f) for _ in range(30)]
    except (OSError, StopIteration):
        return ""
    if not lines or lines[0].strip() != "---":
        return ""
    vals, key = [], None
    for ln in lines[1:]:
        s = ln.rstrip("\n")
        if s.strip() == "---":
            break
        if s and not s[0].isspace() and ":" in s:
            key = s.split(":", 1)[0].strip()
            vals = [s.split(":", 1)[1]] if key == "description" else []
        elif key == "description" and s.startswith((" ", "\t")):
            vals.append(s)
    d = " ".join(vals).strip().strip("'\"").strip()
    d = " ".join(d.split())
    if d:
        descs()[name] = d
    return d[:200]


def search_skills(q, n=8):
    """Rank via the live router. --dry-run: no served.jsonl pollution."""
    try:
        p = subprocess.run([sys.executable, ROUTER, "--json", "--dry-run", q],
                           capture_output=True, text=True, timeout=SEARCH_TIMEOUT)
    except (OSError, subprocess.TimeoutExpired):
        return []
    try:
        j = json.loads(p.stdout or "{}")
    except ValueError:
        return []
    names = (j.get("skills") or [])[:max(1, min(n, 20))]
    return [{"name": s, "description": skill_desc(s)} for s in names]


def trending(limit_rows=500):
    """Windowed Counter over the live served log + last routes."""
    try:
        with open(os.path.join(live_dir(), "served.jsonl"),
                  encoding="utf-8") as f:
            rows = f.readlines()[-limit_rows:]
    except OSError:
        return {"trending": [], "recent": []}
    evs = []
    for ln in rows:
        try:
            e = json.loads(ln)
        except ValueError:
            continue
        if e.get("skills"):
            evs.append(e)
    c = Counter(s for e in evs for s in e["skills"].split("/") if s)
    recent = [{"skills": e["skills"].split("/"), "ts": e.get("t", 0)}
              for e in evs[-8:]][::-1]
    return {"trending": [{"skill": s, "n": n} for s, n in c.most_common(8)],
            "recent": recent}


def run_turn(msg, session_id=None, provider="opencode"):
    """One agent turn via local CLI. argv list, no shell. Returns dict."""
    if provider not in ("opencode", "claude"):
        return {"ok": False, "error": "unknown provider %r" % provider}
    if not agentlog.provider_available(provider):
        return {"ok": False, "error": "%s CLI not installed" % provider,
                "code": 503}
    try:
        argv, stdin_data = agentlog.describe_command(provider, msg, session_id)
        p = subprocess.run(argv, input=stdin_data, capture_output=True,
                           text=True, timeout=TURN_TIMEOUT)
    except FileNotFoundError:
        return {"ok": False, "error": "%s CLI not installed" % provider,
                "code": 503}
    except subprocess.TimeoutExpired:
        return {"ok": False, "error": "turn timed out after %ss" % TURN_TIMEOUT,
                "code": 504}
    session, partial, result_text, ok, plain = "", "", "", True, []
    for ln in (p.stdout or "").splitlines():
        ln = ln.strip()
        if not ln:
            continue
        plain.append(ln)
        try:
            j = json.loads(ln)
        except ValueError:
            continue
        if provider == "claude":
            u = agentlog.claude_line(j)
            if not u:
                continue
            session = u.get("session") or session
            if u.get("assistant_text"):
                partial = u["assistant_text"]
            if "result" in u:
                result_text = u.get("result") or partial
                ok = bool(u.get("ok", True))
        else:  # opencode run --format json
            u = agentlog.opencode_line(j)
            if not u:
                continue
            session = u.get("session") or session
            if u.get("activity"):
                activity = u["activity"]
            if u.get("text"):
                partial = u["text"]
            if u.get("result"):
                result_text = u["result"]
    text = (result_text or partial or "\n".join(plain)[-4000:] or "…")[:4000]
    if p.returncode != 0 and not (result_text or partial):
        return {"ok": False, "error": "exit %s: %s" % (p.returncode, text[-300:])}
    return {"ok": True, "text": text, "session": session or session_id or None}


class Handler(SimpleHTTPRequestHandler):
    server_version = "NickiBridge/0.1"

    def _send(self, obj, code=200):
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):  # browser preflight for POST /chat
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self):
        parts = urlparse(self.path)
        if parts.path == "/health":
            self._send({"ok": True,
                        "opencode": agentlog.opencode_available(),
                        "claude": agentlog.claude_available()})
        elif parts.path == "/sessions":
            try:
                evs = agentlog.read_events(limit=300)
                self._send({"sessions": agentlog.sessions(evs)})
            except Exception as e:
                self._send({"sessions": [], "error": str(e)})
        elif parts.path == "/skills":
            q = (parse_qs(parts.query).get("q") or [""])[0].strip()[:200]
            if not q:
                return self._send({"hits": []})
            try:
                n = int((parse_qs(parts.query).get("n") or ["8"])[0])
            except ValueError:
                n = 8
            self._send({"hits": search_skills(q, n)})
        elif parts.path == "/trending":
            self._send(trending())
        elif parts.path == "/relay/ws":
            key = (parse_qs(parts.query).get("key") or [""])[0]
            relay.handle_ws(self, key)
            return
        elif parts.path == "/relay/qr":
            self._send(relay.qr_pair())
        elif getattr(self.server, "serve_dir", None):
            super().do_GET()
        else:
            self._send({"ok": True, "usage": "GET /health, /sessions, "
                                             "/skills?q=, /trending | POST /chat"},
                       404)

    def _read_json(self):
        try:
            n = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            n = 0
        if n <= 0 or n > BODY_LIMIT:
            return None
        try:
            return json.loads(self.rfile.read(n) or b"{}")
        except ValueError:
            return None

    def do_POST(self):
        parts = urlparse(self.path)
        if parts.path == "/relay/verify":
            req = self._read_json()
            if req is None:
                return self._send({"ok": False, "error": "bad json"}, 400)
            hit = relay.verify_pin(req.get("pin"))
            if hit is None:
                return self._send({"ok": False, "error": "bad pin"}, 404)
            return self._send({"ok": True, **hit})
        if parts.path == "/relay/send":
            req = self._read_json()
            if req is None or not req.get("key"):
                return self._send({"ok": False, "error": "bad json"}, 400)
            relay.hub_send(req["key"], json.dumps(req.get("frame", {})))
            return self._send({"ok": True})
        if parts.path != "/chat":
            return self._send({"ok": False, "error": "use POST /chat"}, 404)
        try:
            n = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            n = 0
        if n <= 0 or n > BODY_LIMIT:
            return self._send({"ok": False, "error": "bad body"}, 400)
        try:
            req = json.loads(self.rfile.read(n) or b"{}")
        except ValueError:
            return self._send({"ok": False, "error": "bad json"}, 400)
        msg = str(req.get("message") or "").strip()[:4000]
        if not msg:
            return self._send({"ok": False, "error": "empty message"}, 400)
        out = run_turn(msg, req.get("session_id"),
                       req.get("provider") or "opencode")
        self._send(out, out.pop("code", 200) if not out.get("ok") else 200)

    def log_message(self, *a):  # quiet unless asked
        if os.environ.get("BRIDGE_VERBOSE"):
            super().log_message(*a)


def main(argv):
    port = PORT
    serve_dir = None
    args = list(argv)
    if "--check" in args:
        print(json.dumps({"opencode": agentlog.opencode_available(),
                          "claude": agentlog.claude_available()}))
        return
    if "--serve" in args:
        args.remove("--serve")
        serve_dir = os.path.join(os.path.dirname(
            os.path.dirname(os.path.abspath(__file__))), "island-ui", "dist")
        if not os.path.isdir(serve_dir):
            sys.exit("build the UI first: (cd island-ui && npm run build)")
    rest = [a for a in args if not a.startswith("-")]
    if rest:
        port = int(rest[0])
    srv = ThreadingHTTPServer((HOST, port), Handler)
    srv.serve_dir = serve_dir
    if serve_dir:
        Handler.directory = serve_dir  # type: ignore[attr-defined]
        print("nicki: http://%s:%s  (UI + opencode bridge)" % (HOST, port))
    else:
        print("nicki bridge: http://%s:%s  (API only)" % (HOST, port))
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main(sys.argv[1:])
