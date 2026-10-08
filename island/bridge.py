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
import re
import socket
import subprocess
import sys
import threading
import time
import urllib.request
from collections import Counter
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import agentlog  # noqa: E402  (same CLI path as the desktop island app)
import relay  # noqa: E402  (self WS relay: /relay/ws + qr/verify/send)
import gigs  # noqa: E402  (gig adapters: native store + Remotive seed)
import profile  # noqa: E402  (island profile: mirror-only)
import decisions  # noqa: E402  (island approve/deny/answer)
import focus as _focus  # noqa: E402  (jump back to agent terminal)
import energy  # noqa: E402  (poll tiers + keep-awake)
import soundpack  # noqa: E402  (openpeon packs)
import display as _display  # noqa: E402  (external display-state.json)
import quota as _quota  # noqa: E402  (Claude OAuth usage)
import demo as _demo  # noqa: E402  (scripted fixtures)
import fleet as _fleet  # noqa: E402  (attention ranking + overlap)

HOST, PORT = "127.0.0.1", 8096
BODY_LIMIT = 64 * 1024
SEARCH_TIMEOUT = 20

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ROUTER = os.path.join(REPO_ROOT, "src", "steroids", "router.py")
SKILLS_DIR = os.path.join(REPO_ROOT, "skills")
SHOTS_DIR = os.path.join(REPO_ROOT, "shots")

_lens_lib = None
_daily_lib = None


def daily_lib():
    """daily.py pure helpers (load_briefing, today_events). Never throws."""
    global _daily_lib
    if _daily_lib is None:
        import importlib.util
        p = os.path.join(REPO_ROOT, "src", "steroids", "daily.py")
        spec = importlib.util.spec_from_file_location("steroids_daily", p)
        m = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(m)
        _daily_lib = m
    return _daily_lib


def daily_cache_path():
    p = os.path.expanduser("~/.cache/steroids/daily_brief.json")
    try:
        os.makedirs(os.path.dirname(p), exist_ok=True)
    except OSError:
        pass
    return p


def daily_log_path():
    return os.path.expanduser("~/.cache/steroids/daily_log.jsonl")


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


def _playerctl(*args):
    """playerctl call, None when the binary is missing. 3s cap, no hangs."""
    try:
        r = subprocess.run(["playerctl"] + list(args), capture_output=True,
                           text=True, timeout=3)
    except (OSError, subprocess.TimeoutExpired):
        return None
    if r.returncode != 0:
        return None
    return r.stdout.strip()


_HAS_PLAYERCTL = None


_MPRIS_OBJ = "/org/mpris/MediaPlayer2"
_MPRIS_IFACE = "org.mpris.MediaPlayer2.Player"


def _bus_env():
    """Session bus env; falls back to the runtime-dir socket."""
    env = dict(os.environ)
    if not env.get("DBUS_SESSION_BUS_ADDRESS"):
        try:
            uid = os.getuid()
        except AttributeError:
            uid = 1000
        env["DBUS_SESSION_BUS_ADDRESS"] = "unix:path=/run/user/%d/bus" % uid
    return env


def _busctl(*args):
    try:
        r = subprocess.run(["busctl", "--user"] + list(args),
                           capture_output=True, text=True, timeout=3,
                           env=_bus_env())
    except (OSError, subprocess.TimeoutExpired):
        return None
    if r.returncode != 0:
        return None
    return r.stdout.strip()


def _mpris_players():
    """MPRIS names on the session bus (Brave tabs, Spotify, …)."""
    out = _busctl("list", "--no-legend")
    if not out:
        return []
    return [p for p in (ln.split()[0] for ln in out.splitlines() if ln.split())
            if p.startswith("org.mpris.MediaPlayer2.")]


def _mpris_unescape(v):
    return v.replace("\\", "\x00").replace('\"', '"').replace("\x00", "\\")


def _mpris_str(meta, key):
    m = re.search(r'"%s" [so] "((?:[^"\\]|\\.)*)"' % re.escape(key), meta or "")
    return _mpris_unescape(m.group(1)) if m else None


def _mpris_strv(meta, key):
    m = re.search(r'"%s" as (\d+)((?: "(?:[^"\\]|\\.)*")*)' % re.escape(key), meta or "")
    if not m:
        return []
    n = int(m.group(1))
    return [_mpris_unescape(x) for x in re.findall(r'"((?:[^"\\]|\\.)*)"', m.group(2))][:n]


def _mpris_int(meta, key):
    m = re.search(r'"%s" [xo] "?(\d+)"?' % re.escape(key), meta or "")
    try:
        return int(m.group(1)) if m else None
    except (TypeError, ValueError):
        return None


def _mpris_scalar(out, typ):
    m = re.match(r'^%s "(.*)"$' % typ, out or "", re.DOTALL)
    if m:
        return _mpris_unescape(m.group(1))
    m = re.match(r"^x (\d+)$", out or "")
    return int(m.group(1)) if m else None


def _native_now_playing():
    """Now-playing straight off D-Bus. None when the bus is unreachable."""
    players = _mpris_players()
    if not players:
        return None
    ordered = sorted(players, key=lambda p: 0 if _mpris_scalar(
        _busctl("get-property", p, _MPRIS_OBJ, _MPRIS_IFACE, "PlaybackStatus"),
        "s") == "Playing" else 1)
    name = ordered[0]
    meta = _busctl("get-property", name, _MPRIS_OBJ, _MPRIS_IFACE, "Metadata") or ""
    parts = name.split(".")
    short = parts[-2] if parts[-1].startswith("instance") and len(parts) > 1 else parts[-1]
    status = _mpris_scalar(_busctl(
        "get-property", name, _MPRIS_OBJ, _MPRIS_IFACE, "PlaybackStatus"), "s")
    pos = _mpris_scalar(_busctl(
        "get-property", name, _MPRIS_OBJ, _MPRIS_IFACE, "Position"), "x")
    artists = _mpris_strv(meta, "xesam:artist")
    length = _mpris_int(meta, "mpris:length")
    return {"playing": status == "Playing", "player": short,
            "title": _mpris_str(meta, "xesam:title"),
            "artist": ", ".join(artists) if artists else None,
            "album": _mpris_str(meta, "xesam:album") or None,
            "art": _mpris_str(meta, "mpris:artUrl"),
            "status": status,
            "playing": status == "Playing",
            "pos": pos // 1_000_000 if isinstance(pos, int) else None,
            "len": length // 1_000_000 if isinstance(length, int) else None,
            "has_playerctl": True}


def _native_player_cmd(action, player, position):
    players = _mpris_players()
    if not players:
        return {"ok": False, "error": "no players on the session bus"}
    svc = next((q for q in players
                if q == player or q.split(".")[-1] == player or
                (len(q.split(".")) > 1 and q.split(".")[-2] == player)),
               None) if player else None
    if svc is None:
        svc = sorted(
        players, key=lambda p: 0 if _mpris_scalar(
            _busctl("get-property", p, _MPRIS_OBJ, _MPRIS_IFACE, "PlaybackStatus"),
            "s") == "Playing" else 1)[0]
    if action in ("play-pause", "next", "previous"):
        method = {"play-pause": "PlayPause", "next": "Next",
                  "previous": "Previous"}[action]
        ok = _busctl("call", svc, _MPRIS_OBJ, _MPRIS_IFACE, method) is not None
        return {"ok": ok} if ok else {"ok": False, "error": "player refused"}
    if action == "seek" and position is not None:
        try:
            us = int(float(position) * 1_000_000)
        except (TypeError, ValueError):
            return {"ok": False, "error": "position must be seconds"}
        meta = _busctl("get-property", svc, _MPRIS_OBJ, _MPRIS_IFACE, "Metadata") or ""
        trackid = _mpris_str(meta, "mpris:trackid")
        if not trackid:
            return {"ok": False, "error": "no track id (player busy?)"}
        ok = _busctl("call", svc, _MPRIS_OBJ, _MPRIS_IFACE, "SetPosition",
                     "ox", trackid, str(us)) is not None
        return {"ok": ok} if ok else {"ok": False, "error": "player refused"}
    return {"ok": False, "error": "play-pause | next | previous | seek"}


def _np_art_bytes():
    """Current player art file (Chromium drops file:// thumbs in /tmp)."""
    players = _mpris_players()
    if not players:
        return None, None
    meta = _busctl("get-property", players[0], _MPRIS_OBJ, _MPRIS_IFACE,
                   "Metadata") or ""
    art = _mpris_str(meta, "mpris:artUrl") or ""
    if not art.startswith("file:///tmp/"):
        return None, None
    path = art[len("file://"):]
    try:
        with open(path, "rb") as f:
            head = f.read(12)
            f.seek(0)
            body = f.read(512 * 1024)
    except OSError:
        return None, None
    if head.startswith(b"\x89PNG"):
        mime = "image/png"
    elif head.startswith(b"\xff\xd8"):
        mime = "image/jpeg"
    elif head.startswith(b"RIFF") and head[8:12] == b"WEBP":
        mime = "image/webp"
    elif head.startswith(b"GIF8"):
        mime = "image/gif"
    else:
        return None, None
    return body, mime


def now_playing():
    """First playing player, else first listed. Empty dict shape always."""
    global _HAS_PLAYERCTL
    if _HAS_PLAYERCTL is None:
        _HAS_PLAYERCTL = _playerctl("--version") is not None
    if not _HAS_PLAYERCTL:
        # No playerctl (this box): straight off the session bus instead.
        native = _native_now_playing()
        if native is None:
            return {"playing": False, "player": None, "title": None,
                    "artist": None, "album": None, "art": None,
                    "status": None, "pos": None, "len": None,
                    "has_playerctl": False}
        return native
    empty = {"playing": False, "player": None, "title": None, "artist": None,
             "album": None, "art": None, "status": None, "pos": None, "len": None,
             "has_playerctl": _HAS_PLAYERCTL}
    players = (_playerctl("-l") or "").split()
    if not players:
        return empty
    ordered = sorted(players, key=lambda p: 0 if (
        _playerctl("status", "-p", p) or "").strip() == "Playing" else 1)
    name = ordered[0]

    def meta(key):
        return _playerctl("metadata", "--format", "{{%s}}" % key, "-p", name)

    def num(key):
        try:
            v = _playerctl("metadata", "--format", "{{%s}}" % key, "-p", name)
            return int(float(v)) if v else None
        except (TypeError, ValueError):
            return None

    status = (_playerctl("status", "-p", name) or "").strip() or None
    out = dict(empty)
    out.update(player=name, title=meta("title") or None,
               artist=meta("artist") or None, album=meta("album") or None,
               art=meta("mpris:artUrl") or None, status=status,
               playing=status == "Playing",
               pos=num("position") and num("position") // 1_000_000,
               len=num("mpris:length") and num("mpris:length") // 1_000_000)
    return out


def player_cmd(action, player=None, position=None):
    """play-pause | next | previous | seek. Returns ok dict, never raises."""
    if action == "seek" and position is not None:
        try:
            args = ["position", "%s" % float(position)]
        except (TypeError, ValueError):
            return {"ok": False, "error": "position must be seconds"}
    elif action in ("play-pause", "next", "previous"):
        args = [action]
    else:
        return {"ok": False, "error": "play-pause | next | previous | seek"}
    if _playerctl("--version") is None:
        return _native_player_cmd(action,
                                  str(player)[:80] if player else None,
                                  position)
    if player:
        args += ["-p", str(player)[:80]]
    if _playerctl(*args) is None:
        return {"ok": False, "error": "playerctl missing or no players"}
    return {"ok": True}


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
    """Start the hand cursor daemon."""
    daemon_stop(server, "hand_proc")
    attr = kind + "_proc"
    if daemon_clean(server, attr) is not None:
        return {"ok": True, "running": True}
    script = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                          "handd.py")
    args = [sys.executable, script, "--no-preview"] + list(extra or [])
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
_MODELS = {"at": 0.0, "data": []}  # `opencode models` cache (5 min)
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


OPENCODE_INSTALL_URL = "https://opencode.ai/install"
OPENCODE_INSTALL_CMD = "curl -fsSL https://opencode.ai/install | bash"
_install_state = {"running": False}


def install_opencode_bg():
    """Fetch the official installer and run it (daemon thread, no shell).
    The UI polls /health for completion — no status channel needed."""
    try:
        req = urllib.request.Request(OPENCODE_INSTALL_URL,
                                     headers={"User-Agent": "steroids-island"})
        with urllib.request.urlopen(req, timeout=60) as r:
            script = r.read()
        if len(script) < 500 or b"opencode" not in script[:2000]:
            raise ValueError("unexpected install payload")
        p = subprocess.run(["bash", "-s"], input=script,
                           capture_output=True, timeout=300)
        if p.returncode != 0:
            tail = (p.stderr or p.stdout or b"install failed")[-300:]
            raise ValueError(tail.decode("utf-8", "replace"))
    except Exception as e:  # noqa: BLE001 — surfaced as install hint
        _install_state["error"] = str(e)[:200]
    finally:
        _install_state["running"] = False


def start_turn(msg, session_id=None, provider="opencode", model=None):
    """Spawn an agent turn in the background. Returns {ok, turn}."""
    if provider == "auto":
        provider = "opencode"  # router-pick default: local opencode, no keys
    if provider not in ("opencode", "claude"):
        return {"ok": False, "error": "unknown provider %r" % provider}
    if not agentlog.provider_available(provider):
        return {"ok": False, "error": "%s CLI not installed" % provider,
                "code": 503}
    try:
        argv, stdin_data = agentlog.describe_command(provider, msg, session_id, model=model)
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
        # live data only: Chromium heuristically caches GETs without this,
        # so the 3s /nowplaying poll kept replaying the previous song.
        self.send_header("Cache-Control", "no-store")
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
                seen.update(s["session"] for s in extra)
                # plus hook-free readers (cursor/grok/copilot stores).
                try:
                    import discovery as _discovery
                    extra += [s for s in _discovery.all_extra()
                              if s["session"] not in seen]
                except Exception:
                    pass
                merged = sorted(hooked + extra,
                                key=lambda s: s["ts"] or 0,
                                reverse=True)
                # respect UI hides: deleted from the island stays deleted.
                merged = [s for s in merged if s["session"] not in hidden][:12]
                self._send({"sessions": merged})
            except Exception as e:
                self._send({"sessions": [], "error": str(e)})
        elif parts.path == "/session":
            # one session's live progress for the team tiles (steps + files).
            sid = (parse_qs(parts.query).get("session") or [""])[0].strip()
            try:
                evs = agentlog.read_events(limit=300)
                self._send({"progress": agentlog.session_progress(evs, sid)})
            except Exception as e:
                self._send({"progress": None, "error": str(e)})
        elif parts.path == "/models":
            # live `opencode models` ids so the picker never goes stale
            # when they ship a new model. Cached 5 min, [] on failure.
            try:
                now = time.time()
                if now - _MODELS["at"] > 300:
                    _MODELS["data"] = agentlog.list_models()
                    _MODELS["at"] = now
                self._send({"models": _MODELS["data"]})
            except Exception as e:
                self._send({"models": [], "error": str(e)})
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
        elif parts.path == "/pending":
            # island approvals/questions awaiting a tap (act-from-island).
            sid = (parse_qs(parts.query).get("session") or [""])[0]
            self._send({"pending": decisions.pending(sid or None)})
        elif parts.path == "/usage":
            # token totals for a Claude transcript (?path=...jsonl).
            p = (parse_qs(parts.query).get("path") or [""])[0]
            self._send({"usage": agentlog.transcript_usage(p) if p else {}})
        elif parts.path == "/soundpacks":
            self._send({"packs": soundpack.packs()})
        elif parts.path == "/energy":
            now = time.time()
            evs = agentlog.read_events(limit=30)
            work = any((e.get("ts") or 0) > now - 120 and e.get("event")
                       in ("PreToolUse", "UserPromptSubmit") for e in evs)
            self._send({"tier": energy.tier(work),
                        "interval": energy.poll_interval(work)})
        elif parts.path == "/display":
            # frozen navigate slots + published display-state.json.
            try:
                hidden = agentlog.hidden_sessions()
                evs = agentlog.read_events(limit=300)
                sess = [s for s in agentlog.sessions(evs)
                        if s["session"] not in hidden][:9]
                states = {}
                for e in evs:
                    sid = e.get("session")
                    if sid and e.get("event") in (
                            "PreToolUse", "UserPromptSubmit", "Stop"):
                        states[sid] = (
                            "working" if e["event"] == "PreToolUse" else
                            ("thinking" if e["event"] == "UserPromptSubmit"
                             else "finished"), "")
                for s in sess:
                    if agentlog.needs_attention(
                            next((x for x in evs
                                  if x.get("session") == s["session"]), {})):
                        s["attention"] = True
                st = _display.build_state(sess, states)
                path = _display.publish(st)
                self._send({"display": st, "path": path})
            except Exception as e:
                self._send({"display": {"sessions": []}, "error": str(e)})
        elif parts.path == "/quota":
            self._send({"quota": _quota.cached()})
        elif parts.path == "/demo":
            self._send({"demo": _demo.demo_sessions()})
        elif parts.path == "/fleet":
            # attention-ranked sessions + worktree overlap warnings.
            try:
                hidden = agentlog.hidden_sessions()
                evs = agentlog.read_events(limit=300)
                sess = [s for s in agentlog.sessions(evs)
                        if s["session"] not in hidden][:12]
                over = _fleet.overlap(
                    [dict(s, cwd=(next(
                        (x.get("cwd", "") for x in evs
                         if x.get("session") == s["session"]
                         and x.get("cwd")), ""))) for s in sess])
                self._send({"sessions": _fleet.rank(sess, over),
                            "overlap": over})
            except Exception as e:
                self._send({"sessions": [], "error": str(e)})
        elif parts.path == "/hand":
            # hand cursor-daemon status — moves the real OS cursor (localhost reads).
            self._send({"running": daemon_clean(self.server, "hand_proc") is not None})
        elif parts.path == "/battery":            # laptop power for the chat live-strip. sysfs on Linux, none on
            # desktop/VM — callers treat has_battery False as "no row".
            info = {"has_battery": False, "pct": None, "charging": False}
            try:
                base = "/sys/class/power_supply"
                for name in sorted(os.listdir(base)):
                    p = os.path.join(base, name)
                    try:
                        with open(os.path.join(p, "type")) as f:
                            if f.read().strip() != "Battery":
                                continue
                        with open(os.path.join(p, "capacity")) as f:
                            pct = int(f.read().strip())
                        with open(os.path.join(p, "status")) as f:
                            status = f.read().strip()
                        info = {"has_battery": True, "pct": max(0, min(100, pct)),
                                "charging": status in ("Charging", "Full")}
                        break
                    except (OSError, ValueError):
                        continue
            except OSError:
                pass
            self._send(info)
        elif parts.path == "/np-art":
            # Chromium-family art thumbs (file:///tmp/…). Served so the
            # island can <img> them; nothing outside /tmp ever reads.
            body, mime = _np_art_bytes()
            if body is None:
                return self._send({"ok": False, "error": "no art"}, 404)
            self.send_response(200)
            self.send_header("Content-Type", mime)
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(body)
            return
        elif parts.path == "/nowplaying":
            # system now-playing via playerctl (MPRIS). No binary or no
            # players → playing False; the island shows no strip at all.
            self._send(now_playing())
        elif parts.path == "/audio-energy":
            # live loudness for the dancing mascot: {energy 0..1, hop
            # edge-once, ts, live}. Auto-starts the parec sampler.
            try:
                import audio_energy as _ae
                self._send(_ae.read())
            except Exception:
                self._send({"energy": 0.0, "hop": False,
                            "ts": 0.0, "live": False})
        elif parts.path == "/api/daily/briefing":
            # morning briefing, same-origin: no second daemon to keep alive.
            try:
                self._send(daily_lib().load_briefing(daily_cache_path()))
            except Exception as e:
                self._send({"weatherLine": "", "headlines": [],
                            "fetchedAt": 0, "offline": True,
                            "error": str(e)})
        elif parts.path == "/api/daily/today":
            try:
                self._send({"events": daily_lib().today_events(
                    daily_log_path())})
            except Exception:
                self._send({"events": []})
        elif parts.path == "/api/daily/work":
            # live work snapshot: what/where/%/left, off the event ledger.
            try:
                self._send(agentlog.work_today())
            except Exception:
                self._send(agentlog.work_today([]))
        elif parts.path == "/api/daily/usage":
            # token/cost snapshot off opencode's own db (read-only).
            try:
                self._send(agentlog.opencode_usage())
            except Exception:
                self._send({"provider": "opencode", "model": "",
                            "today": {"in": 0, "out": 0, "cached": 0,
                                      "cost": 0.0, "sessions": 0},
                            "current": {"title": "", "model": "", "in": 0,
                                        "out": 0, "cost": 0.0}})
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
        if parts.path == "/hand":
            # hand cursor daemon: only the PC owner may start/stop it.
            if not self._local():
                return self._send({"ok": False,
                                    "error": "cursor daemon runs on the PC itself"}, 403)
            kind = "hand"
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
        if parts.path == "/playercmd":
            # music transport: only the PC owner drives local players.
            if not self._local():
                return self._send({"ok": False,
                                    "error": "players run on the PC itself"}, 403)
            req = self._read_json() or {}
            return self._send(player_cmd(req.get("action"),
                                         req.get("player"),
                                         req.get("position")))
        if parts.path == "/api/daily/log":
            req = self._read_json()
            if req is None:
                return self._send({"ok": False, "error": "bad json"}, 400)
            try:
                daily_lib().log_event(daily_log_path(),
                                      str(req.get("type") or ""),
                                      str(req.get("label") or ""))
            except Exception:
                pass
            return self._send({"ok": True})
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
        if parts.path == "/decide":
            req = self._read_json()
            if req is None:
                return self._send({"ok": False, "error": "bad json"}, 400)
            if req.get("auto_approve") is not None:
                decisions.set_auto_approve(req.get("session") or "",
                                           bool(req.get("auto_approve")))
                return self._send({"ok": True})
            ok = decisions.decide(req.get("key") or "",
                                  req.get("verdict") or "",
                                  req.get("answer") or "")
            return self._send({"ok": ok})
        if parts.path == "/focus":
            req = self._read_json()
            if req is None:
                return self._send({"ok": False, "error": "bad json"}, 400)
            sid = str(req.get("session") or "")
            ev = None
            for e in agentlog.read_events(limit=300):
                if e.get("session") == sid:
                    ev = e
            if ev is None:
                return self._send({"ok": False, "error": "unknown session"}, 404)
            return self._send(_focus.focus(ev))
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
        if parts.path == "/install":
            # one-click agent setup: allowlist of one (opencode — keyless
            # per contract). Runs the official installer in a daemon
            # thread; the UI polls /health until the CLI appears.
            req = self._read_json()
            if not req or req.get("provider") != "opencode":
                return self._send({"ok": False, "error": "only opencode"}, 400)
            if agentlog.opencode_available():
                return self._send({"ok": True, "already": True})
            if _install_state["running"]:
                return self._send({"ok": True, "started": True})
            _install_state.pop("error", None)
            _install_state["running"] = True
            threading.Thread(target=install_opencode_bg, daemon=True).start()
            return self._send({"ok": True, "started": True,
                               "manual": OPENCODE_INSTALL_CMD})
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
                         req.get("provider") or "opencode",
                         req.get("model"))
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
    # warm the models cache off-thread so the first picker open already
    # lists live `opencode models` instead of the static fallback.
    def _warm_models():
        try:
            _MODELS["data"] = agentlog.list_models()
            _MODELS["at"] = time.time()
        except Exception:
            pass
    threading.Thread(target=_warm_models, daemon=True).start()
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
