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
import mimetypes
import os
import socket
import subprocess
import sys
import time
from collections import Counter
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import agentlog  # noqa: E402  (same CLI path as the desktop island app)
import relay  # noqa: E402  (self WS relay: /relay/ws + qr/verify/send)
import gigs  # noqa: E402  (gig adapters: native store + Remotive seed)
import profile  # noqa: E402  (island profile: mirror-only)

HOST, PORT = "127.0.0.1", 8096
BODY_LIMIT = 64 * 1024
TURN_TIMEOUT = 150  # real agent turns take a while; the UI shows thinking
SEARCH_TIMEOUT = 20

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ROUTER = os.path.join(REPO_ROOT, "src", "steroids", "router.py")
SKILLS_DIR = os.path.join(REPO_ROOT, "skills")
SHOTS_DIR = os.path.join(REPO_ROOT, "shots")

_lens_lib = None


def lens_lib():
    """lens.py pure helpers (collect_shots, safe_name). Never throws."""
    global _lens_lib
    if _lens_lib is None:
        import importlib.util
        p = os.path.join(REPO_ROOT, "src", "steroids", "lens.py")
        spec = importlib.util.spec_from_file_location("steroids_lens", p)
        m = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(m)
        _lens_lib = m
    return _lens_lib


def live_dir():
    cand = os.path.expanduser("~/.config/steroids")
    if os.path.isdir(cand):
        return cand
    return os.path.expanduser("~/.config/opencode/plugins/steroids")


def lan_base(port):
    """This machine's LAN URL, so a phone browser can reach the bridge."""
    ip = "127.0.0.1"
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))  # no traffic sent; reveals the route IP
        ip = s.getsockname()[0]
        s.close()
    except OSError:
        pass
    return "http://%s:%s" % (ip, port)


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

    def _local(self):
        return self.client_address[0] in ("127.0.0.1", "::1")

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
        elif parts.path == "/relay/pending":
            try:
                lan = lan_base(self.server.server_address[1])
            except (AttributeError, IndexError):
                lan = ""
            self._send({"pending": relay.pending_links(), "lan": lan})
        elif parts.path == "/relay/link-status":
            tok = (parse_qs(parts.query).get("token") or [""])[0]
            self._send(relay.link_status(tok))
        elif parts.path == "/relay/local-key":
            # this PC joining its own hub: localhost only, never LAN.
            if not self._local():
                return self._send({"ok": False,
                                   "error": "localhost only"}, 403)
            self._send({"ok": True, "key": relay.local_key()})
        elif parts.path == "/relay/qr":
            out = relay.qr_pair(include_key=self._local())
            try:
                out["lan"] = lan_base(self.server.server_address[1])
            except (AttributeError, IndexError):
                pass
            self._send(out)
        elif parts.path == "/gigs":
            try:
                limit = int((parse_qs(parts.query).get("limit") or ["10"])[0])
            except ValueError:
                limit = 10
            self._send(gigs.load(max(1, min(limit, 50))))
        elif parts.path == "/profile":
            self._send({"ok": True, "profile": profile.mirror()})
        elif parts.path == "/shots":
            # live lens feed: newest-first shot cards from the watch dir.
            try:
                lib = lens_lib()
                watch = getattr(self.server, "lens_watch", SHOTS_DIR)
                cards = lib.collect_shots(watch, limit=lib.PAGE_SCOPE_N)
                self._send({"shots": [{
                    "name": s["name"], "label": s["label"], "time": s["time"],
                    "url": "/shots-file/" + s["name"],
                } for s in cards]})
            except Exception as e:
                self._send({"shots": [], "error": str(e)})
        elif parts.path.startswith("/shots-file/"):
            try:
                lib = lens_lib()
                watch = getattr(self.server, "lens_watch", SHOTS_DIR)
                p = lib.safe_name(watch, parts.path[len("/shots-file/"):])
                if not p:
                    return self._send({"ok": False, "error": "nope"}, 404)
                with open(p, "rb") as f:
                    body = f.read()
                self.send_response(200)
                self.send_header("Content-Type",
                                 mimetypes.guess_type(p)[0] or "image/png")
                self.send_header("Content-Length", str(len(body)))
                self.send_header("Access-Control-Allow-Origin", "*")
                self.send_header("Cache-Control", "max-age=5")
                self.end_headers()
                self.wfile.write(body)
            except OSError:
                return self._send({"ok": False, "error": "gone"}, 404)
            return
        elif getattr(self.server, "serve_dir", None):
            super().do_GET()
        else:
            self._send({"ok": True, "usage": "GET /health, /sessions, "
                                             "/skills?q=, /trending, /gigs, "
                                             "/profile, /relay/qr | POST "
                                             "/chat, /gigs/add, "
                                             "/profile/unlink, /relay/verify, "
                                             "/relay/send"},
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
        if parts.path == "/gigs/add":
            req = self._read_json()
            if req is None:
                return self._send({"ok": False, "error": "bad json"}, 400)
            gid = gigs.add_native(req.get("title"), req.get("pay_cents"),
                                  req.get("category") or "general",
                                  req.get("location") or "",
                                  bool(req.get("remote", False)))
            if gid is None:
                return self._send({"ok": False,
                                   "error": "title str + pay_cents int"}, 400)
            return self._send({"ok": True, "id": gid})
        if parts.path == "/profile/unlink":
            return self._send({"ok": True,
                               "profile": profile.unlink()})
        if parts.path == "/relay/verify":
            req = self._read_json()
            if req is None:
                return self._send({"ok": False, "error": "bad json"}, 400)
            hit = relay.verify_pin(req.get("pin"))
            if hit is None:
                return self._send({"ok": False, "error": "bad pin"}, 404)
            return self._send({"ok": True, **hit})
        if parts.path == "/relay/link-request":
            req = self._read_json()
            if req is None:
                return self._send({"ok": False, "error": "bad json"}, 400)
            return self._send({"ok": True,
                               "token": relay.request_link(req.get("label"))})
        if parts.path == "/relay/link-approve":
            # only the PC owner taps Allow: localhost only, never LAN.
            if not self._local():
                return self._send({"ok": False,
                                   "error": "approve on the PC itself"}, 403)
            req = self._read_json()
            if req is None:
                return self._send({"ok": False, "error": "bad json"}, 400)
            key = relay.approve_link(req.get("token"),
                                     req.get("key") or None)
            if key is None:
                return self._send({"ok": False,
                                   "error": "stale request"}, 404)
            return self._send({"ok": True, "key": key})
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
    host = HOST
    serve_dir = None
    lens_watch = SHOTS_DIR
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
    if "--host" in args:
        i = args.index("--host")
        try:
            host = args[i + 1]
            del args[i:i + 2]
        except IndexError:
            sys.exit("--host needs an address, e.g. --host 0.0.0.0")
    if "--watch" in args:
        i = args.index("--watch")
        try:
            lens_watch = os.path.abspath(args[i + 1])
            del args[i:i + 2]
        except IndexError:
            sys.exit("--watch needs a dir, e.g. --watch ~/shots")
    rest = [a for a in args if not a.startswith("-")]
    if rest:
        port = int(rest[0])
    # NOTE: directory must ride the constructor (instance attr). Setting
    # Handler.directory on the class is silently shadowed by __init__'s
    # directory=None default — that bug served the repo root instead of dist.
    def handler(*a, **k):
        return Handler(*a, directory=serve_dir, **k)

    srv = ThreadingHTTPServer((host, port), handler)
    srv.serve_dir = serve_dir
    srv.lens_watch = lens_watch
    if serve_dir:
        print("nicki: http://%s:%s  (UI + opencode bridge)" % (host, port))
        if host in ("0.0.0.0", "::"):
            print("nicki phone: %s  (same WiFi, pair in Settings)" %
                  lan_base(port))
    else:
        print("nicki bridge: http://%s:%s  (API only)" % (host, port))
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main(sys.argv[1:])
