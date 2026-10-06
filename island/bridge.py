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
import base64
import mimetypes
import os
import socket
import subprocess
import sys
import threading
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


def daemon_clean(server, attr):
    """Reap a dead daemon (fist-exit counts). Returns live proc or None."""
    p = getattr(server, attr, None)
    if p is not None and p.poll() is not None:
        setattr(server, attr, None)
        return None
    return p


def daemon_stop(server, attr):
    p = daemon_clean(server, attr)
    if p is None:
        return
    p.terminate()
    try:
        p.wait(timeout=3)
    except Exception:
        try:
            p.kill()
        except Exception:
            pass
    setattr(server, attr, None)


def daemon_start(server, kind, extra=None):
    """Start the hand|gaze daemon; stops the other (one camera between them)."""
    daemon_stop(server, "gaze_proc" if kind == "hand" else "hand_proc")
    attr = kind + "_proc"
    if daemon_clean(server, attr) is not None:
        return {"ok": True, "running": True}
    script = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                          "handd.py" if kind == "hand" else "gazed.py")
    args = [sys.executable, script, "--no-preview"] + list(extra or [])
    # self-view rides the lens page (/gaze-frame) — never an OS popup.
    try:
        os.makedirs(os.path.expanduser("~/.config/steroids"), exist_ok=True)
        logo = open(os.path.expanduser("~/.config/steroids/%s.log" % kind), "a")
    except Exception:
        logo = subprocess.DEVNULL
    try:
        proc = subprocess.Popen(
            args, stdout=logo, stderr=subprocess.STDOUT,
            stdin=subprocess.DEVNULL, start_new_session=True)
    except Exception as e:
        return {"ok": False, "error": str(e)}
    setattr(server, attr, proc)
    time.sleep(1.5)  # let it grab the camera or die trying
    if proc.poll() is not None:
        setattr(server, attr, None)
        if proc.returncode == 2:
            return {"ok": False, "running": False,
                    "error": "no camera — free the webcam, then retry"}
        return {"ok": False, "running": False,
                "error": "%s exited (code %s)" % (kind, proc.returncode)}
    return {"ok": True, "running": True}


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


TURNS = {}  # tid -> live turn snapshot (the UI polls while it streams)
TURNS_LOCK = threading.Lock()
TURN_TTL = 600  # forget finished turns after 10 min


def _turn_snapshot(t):
    out = {"done": t["done"], "activity": t["activity"],
           "partial": t["partial"][-4000:], "session": t.get("session"),
           "elapsed": round(time.time() - t["started"], 1)}
    if t["done"]:
        out["ok"] = t.get("ok", True)
        if t.get("text") is not None:
            out["text"] = t["text"]
        if t.get("error") is not None:
            out["error"] = t["error"]
    return out


def _turn_sweep():
    now = time.time()
    stale = [k for k, t in TURNS.items()
             if (t["done"] and now - t["started"] > TURN_TTL)
             or (not t["done"] and now - t["started"] > 900)]
    for tid in stale:
        p = TURNS[tid].get("proc")
        if p is not None:
            try:
                p.terminate()
            except OSError:
                pass
        del TURNS[tid]


def _pump_turn(tid, argv, stdin_data, provider):
    """Read CLI JSON lines as they stream; the UI polls the snapshot."""
    t = TURNS.get(tid)
    if t is None:
        return
    try:
        p = subprocess.Popen(
            argv, stdin=subprocess.PIPE if stdin_data else None,
            stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
            text=True, bufsize=1)
    except FileNotFoundError:
        with TURNS_LOCK:
            t.update(done=True, ok=False,
                     error="%s CLI not installed" % provider)
        return
    with TURNS_LOCK:
        t["proc"] = p
    if stdin_data:
        try:
            assert p.stdin is not None
            p.stdin.write(stdin_data)
            p.stdin.close()
        except (BrokenPipeError, OSError):
            pass
    lines, partials, result = [], [], ""
    try:
        assert p.stdout is not None
        for ln in p.stdout:
            ln = ln.strip()
            if not ln:
                continue
            lines.append(ln)
            if len(lines) > 600:
                del lines[:-600]
            try:
                j = json.loads(ln)
            except ValueError:
                continue
            if not isinstance(j, dict):
                continue
            u = (agentlog.claude_line(j) if provider == "claude"
                 else agentlog.opencode_line(j))
            if not u:
                continue
            with TURNS_LOCK:
                if u.get("session"):
                    t["session"] = u["session"]
                if u.get("activity"):
                    t["activity"] = u["activity"]
                if u.get("text"):
                    partials.append(u["text"])
                    t["partial"] = "\n".join(partials)[-4000:]
                if u.get("result"):
                    result = u["result"]
        rc = p.wait()
    except Exception as e:
        with TURNS_LOCK:
            t.update(done=True, ok=False, error=str(e))
        return
    plain = "\n".join(ln for ln in lines[-12:]
                      if not ln.lstrip().startswith("{"))
    text = (result or "\n".join(partials)[-4000:]
            or plain[-4000:] or "…")[:4000]
    with TURNS_LOCK:
        if rc != 0 and not (result or partials):
            t.update(done=True, ok=False,
                     error="exit %s: %s" % (rc, text[-300:]))
        else:
            t.update(done=True, ok=True, text=text)


def start_turn(msg, session_id=None, provider="opencode"):
    """Spawn an agent turn in the background. Returns {ok, turn}."""
    if provider == "auto":
        provider = "opencode"  # router-pick default: local opencode, no keys
    if provider not in ("opencode", "claude"):
        return {"ok": False, "error": "unknown provider %r" % provider}
    if not agentlog.provider_available(provider):
        return {"ok": False, "error": "%s CLI not installed" % provider,
                "code": 503}
    try:
        argv, stdin_data = agentlog.describe_command(provider, msg, session_id)
    except ValueError as e:
        return {"ok": False, "error": str(e)}
    tid = os.urandom(8).hex()
    with TURNS_LOCK:
        _turn_sweep()
        TURNS[tid] = {"done": False, "ok": True, "activity": "starting…",
                      "partial": "", "session": session_id,
                      "started": time.time(), "proc": None}
    th = threading.Thread(target=_pump_turn,
                          args=(tid, argv, stdin_data, provider), daemon=True)
    th.start()
    return {"ok": True, "turn": tid}


def stop_turn(tid):
    with TURNS_LOCK:
        t = TURNS.get(tid)
        p = t.get("proc") if t else None
    if p is not None:
        try:
            p.terminate()
        except OSError:
            pass
    return t is not None


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

    def do_DELETE(self):
        # agent-session hides: the island history panel gets a delete affordance
        # for terminal sessions too (opencode/claude rows). Hide, don't rm —
        # the provider's own store stays intact.
        if not self._local():
            return self._send({"ok": False,
                               "error": "delete from the PC itself"}, 403)
        parts = urlparse(self.path)
        if parts.path == "/agent-sessions":
            sid = (parse_qs(parts.query).get("session") or [""])[0].strip()
            if not sid:
                return self._send({"ok": False, "error": "session id required"}, 400)
            return self._send({"ok": True, "hidden": agentlog.hide_session(sid)})
        return self._send({"ok": False, "error": "unknown endpoint"}, 404)

    def do_OPTIONS(self):  # browser preflight for POST /chat
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
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
                hidden = agentlog.hidden_sessions()
                evs = agentlog.read_events(limit=300)
                hooked = agentlog.sessions(evs)
                # plus every terminal chat from opencode's own db (pickup).
                seen = {s["session"] for s in hooked}
                extra = [s for s in agentlog.opencode_db_sessions()
                         if s["session"] not in seen]
                seen.update(s["session"] for s in extra)
                # plus claude code's own transcripts when they exist.
                extra += [s for s in agentlog.claude_projects_sessions()
                          if s["session"] not in seen]
                merged = sorted(hooked + extra,
                                key=lambda s: s["ts"] or 0,
                                reverse=True)
                # respect UI hides: deleted from the island stays deleted.
                merged = [s for s in merged if s["session"] not in hidden][:12]
                self._send({"sessions": merged})
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
        elif parts.path == "/relay/dl-qr":
            # scan-to-get-the-app: QR of the plain LAN island URL.
            try:
                base = lan_base(self.server.server_address[1])
            except (AttributeError, IndexError):
                base = ""
            if not base:
                return self._send({"ok": False, "error": "no LAN url"}, 404)
            self._send({"ok": True, **relay.dl_qr(base + "/?app=1")})
        elif parts.path == "/gigs":
            try:
                limit = int((parse_qs(parts.query).get("limit") or ["10"])[0])
            except ValueError:
                limit = 10
            self._send(gigs.load(max(1, min(limit, 50))))
        elif parts.path == "/profile":
            self._send({"ok": True, "profile": profile.mirror()})
        elif parts.path in ("/hand", "/gaze"):
            # cursor-daemon status — moves the real OS cursor (localhost reads).
            kind = parts.path[1:]
            self._send({"running": daemon_clean(self.server, kind + "_proc") is not None})
        elif parts.path == "/turn":
            # live agent turn snapshot (polled while it streams).
            tid = (parse_qs(parts.query).get("id") or [""])[0]
            with TURNS_LOCK:
                _turn_sweep()
                t = TURNS.get(tid)
                snap = _turn_snapshot(t) if t else None
            if snap is None:
                return self._send({"ok": False, "error": "no such turn"}, 404)
            self._send(snap)
        elif parts.path == "/gaze-frame":
            # live self-view for the lens page (daemon drops it, no popup).
            try:
                with open(os.path.expanduser("~/.config/steroids/gaze_frame.jpg"), "rb") as f:
                    body = f.read()
                self.send_response(200)
                self.send_header("Content-Type", "image/jpeg")
                self.send_header("Content-Length", str(len(body)))
                self.send_header("Cache-Control", "no-store")
                self.end_headers()
                self.wfile.write(body)
            except OSError:
                return self._send({"ok": False, "error": "no frame yet"}, 404)
            return
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
                                             "/relay/send | DELETE "
                                             "/agent-sessions"},
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
        if parts.path in ("/hand", "/gaze"):
            # cursor daemons: only the PC owner may start/stop them.
            if not self._local():
                return self._send({"ok": False,
                                    "error": "cursor daemons run on the PC itself"}, 403)
            kind = parts.path[1:]
            req = self._read_json() or {}
            action = req.get("action") or "status"
            if action == "stop":
                daemon_stop(self.server, kind + "_proc")
                return self._send({"ok": True, "running": False})
            if action == "start":
                return self._send(daemon_start(self.server, kind))
            if action == "calibrate":
                # 9-dot absolute fit (~1 min, stare each dot). Precision path.
                return self._send(daemon_start(self.server, kind, ["--recalibrate"]))
            return self._send({"running": daemon_clean(self.server, kind + "_proc") is not None})
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
        if parts.path == "/upload":
            # file landing for agent turns (chat carries @paths, opencode
            # opens them). Own 30MB cap — BODY_LIMIT is for chat JSON.
            try:
                n = int(self.headers.get("Content-Length") or 0)
            except ValueError:
                n = 0
            if n <= 0 or n > 30 * 1024 * 1024:
                return self._send({"ok": False, "error": "bad size"}, 400)
            try:
                req = json.loads(self.rfile.read(n) or b"{}")
            except ValueError:
                return self._send({"ok": False, "error": "bad json"}, 400)
            # sanitized landing name: no spaces/specials, so the @path the
            # client appends survives opencode's @file expansion verbatim.
            raw_name = os.path.basename(str(req.get("name") or "file"))[:80] or "file"
            name = "".join(c if c.isalnum() or c in "._-" else "_"
                           for c in raw_name).strip("._") or "file"
            data = str(req.get("data") or "")
            if data.startswith("data:") and "," in data:
                data = data.split(",", 1)[1]
            try:
                raw = base64.b64decode(data)
            except Exception:
                return self._send({"ok": False, "error": "bad base64"}, 400)
            if not raw:
                return self._send({"ok": False, "error": "empty file"}, 400)
            updir = os.path.join(live_dir(), "uploads")
            try:
                os.makedirs(updir, exist_ok=True)
                stamp = "%d-%s-%s" % (int(time.time()),
                                      os.urandom(4).hex(), name)
                p = os.path.join(updir, stamp)
                with open(p, "wb") as f:
                    f.write(raw)
            except OSError as e:
                return self._send({"ok": False, "error": str(e)}, 500)
            return self._send({"ok": True, "path": p})
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
        out = start_turn(msg, req.get("session_id"),
                         req.get("provider") or "opencode")
        self._send(out, out.pop("code", 200) if not out.get("ok") else 200)

    def do_DELETE(self):
        parts = urlparse(self.path)
        if parts.path == "/turn":
            tid = (parse_qs(parts.query).get("id") or [""])[0]
            if not stop_turn(tid):
                return self._send({"ok": False, "error": "no such turn"}, 404)
            return self._send({"ok": True})
        return self._send({"ok": False, "error": "nope"}, 404)

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
    srv.hand_proc = None
    srv.gaze_proc = None
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
