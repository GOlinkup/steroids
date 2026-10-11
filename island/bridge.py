#!/usr/bin/env python3
"""Nicki bridge: localhost HTTP so the island web UI chats with your
installed `opencode` (plain CLI, no API keys, no cloud account needed).

  GET  /health    -> {ok, opencode, claude}
  POST /chat      {message, session_id?, provider?} -> {ok, text, session, error?}
  GET  /sessions  -> recent agent sessions from the hooks event log
  GET  /events    -> live event feed (newest first) for the crew
  POST /events    -> opencode/claude hook payload in, ledger line out

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
import signal
import socket
import subprocess
import sys
import threading
import time
import urllib.request
from collections import Counter
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs, quote

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
import echo as _echo  # noqa: E402  (command-echo levels: volume+brightness)
import hive as _hive  # noqa: E402  (team floor: ledger + inbox/outbox)

HOST, PORT = "127.0.0.1", 8096
BODY_LIMIT = 64 * 1024
SEARCH_TIMEOUT = 20


def app_version():
    """Single source: pyproject.toml. Never throws (UI falls back)."""
    try:
        base = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        with open(os.path.join(base, "pyproject.toml"), encoding="utf-8") as f:
            m = re.search(r'^version\s*=\s*["\']([^"\']+)', f.read(), re.M)
        return m.group(1) if m else "?"
    except OSError:
        return "?"

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


def is_test_sid(sid):
    """Loop/self-test sessions stay out of the island unless asked."""
    return str(sid or "").startswith("e2e-")


def show_tests(parts):
    return (parse_qs(parts.query).get("showTests") or [""])[0] == "1"


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
_BOOT_ID = os.urandom(4).hex()  # persisted on first boot: stable across
# restarts so polls reattach instead of crying "restarted" (durability §)
_MODELS = {"at": 0.0, "data": []}  # `opencode models` cache (5 min)
TURN_TTL = 600  # forget finished turns after 10 min

LOOPS = {}  # lid -> team-loop job (route>plan>execute>verify, minutes long)
LOOPS_LOCK = threading.Lock()
_VERIFY_FAILS = {}  # ip -> (count, ts): PIN-guess throttle state
LOOP_TTL = 3600  # forget finished loops after an hour (cards persist in UI)
# ponytail: 2 team loops at once; each fans out to agent subprocesses,
# so unbounded starts would pile threads + model bills. Third start waits.
MAX_LOOPS = 2


def _loop_sweep():
    now = time.time()
    stale = [k for k, v in LOOPS.items()
             if v["done"] and now - v["started"] > LOOP_TTL]
    for lid in stale:
        del LOOPS[lid]
    return bool(stale)  # callers save outside the lock when True


def _pump_loop(lid, prompt, provider, crew=None):
    """Run the team loop off-thread; the shelf polls the snapshot."""
    job = LOOPS.get(lid)
    if job is None:
        return
    cancelled = job["cancel"]

    def emit(name, status, result):
        with LOOPS_LOCK:
            j = LOOPS.get(lid)
            if j is not None:
                j["activity"] = "%s: %s" % (name, status)
                # live mate checklist: pollers render progress mid-run.
                steps = j.setdefault("steps", [])
                steps[:] = [s for s in steps if s.get("name") != name]
                steps.append({"name": name, "status": status})
                del steps[:-12]
        _loop_save()  # outside the lock (it takes LOOPS_LOCK itself)

    try:
        import loop as _loop  # noqa: E402  (team loop module)
        out = _loop.run_loop(prompt, provider,
                             emit=emit, cancel=cancelled.is_set,
                             crew=job.get("crew"))
    except Exception as exc:  # noqa: BLE001 — surfaced as loop error
        out = {"ok": False, "verdict": "error",
               "detail": str(exc)[:500], "steps": []}
    with LOOPS_LOCK:
        j = LOOPS.get(lid)
        if j is not None:
            j.update(done=True, activity="finished",
                     elapsed=round(time.time() - j["started"], 1),
                     loop=out)
    _loop_save()


def start_loop(prompt, provider="opencode", crew=None):
    """Spawn a team loop in the background. Returns {ok, id}."""
    if provider not in ("opencode", "claude"):
        return {"ok": False, "error": "unknown provider %r" % provider}
    lid = os.urandom(8).hex()
    with LOOPS_LOCK:
        _loop_sweep()
        live = sum(1 for v in LOOPS.values() if not v["done"])
        if live >= MAX_LOOPS:
            return {"ok": False,
                    "error": "2 team loops already running — open the Shelf tab and Stop one, then send again"}
        LOOPS[lid] = {"done": False, "activity": "routing…",
                      "started": time.time(), "crew": crew,
                      "prompt": prompt, "provider": provider,
                      "cancel": threading.Event(), "loop": None}
    _loop_save()
    threading.Thread(target=_pump_loop,
                     args=(lid, prompt, provider, crew), daemon=True).start()
    return {"ok": True, "id": lid}


def _boot_recover():
    """Stable boot id + reattach live turns + flag dead loops. Runs once
    before serving: polls simply keep working across restarts."""
    global _BOOT_ID
    bootf = _state_file("boot.id")
    old = _json_load(bootf, "")
    if isinstance(old, str) and old:
        _BOOT_ID = old
    else:
        _json_save(bootf, _BOOT_ID)
    # turns: recent receipts stay pollable; live ones reattach to their
    # detached agent, or close honestly off the log when the agent died.
    for tid, s in _json_load(_state_file("turns.json"), {}).items():
        if not isinstance(s, dict):
            continue
        base = {"done": True, "ok": True, "activity": s.get("activity", ""),
                "partial": s.get("partial", ""), "session": s.get("session"),
                "provider": s.get("provider", "opencode"),
                "started": s.get("started", time.time()), "proc": None,
                "text": s.get("text"), "error": s.get("error")}
        if not s.get("done"):
            pid, logpath = s.get("pid"), s.get("log")
            if (pid and logpath and os.path.exists(logpath)
                    and _proc_alive(pid)):
                gen = int(s.get("gen", 0) or 0) + 1
                base.update(done=False, ok=True, pid=pid, log=logpath,
                            gen=gen)
                TURNS[tid] = base
                threading.Thread(target=_pump_turn_file,
                                 args=(tid, logpath, pid, base["provider"]),
                                 kwargs={"gen": gen},
                                 daemon=True).start()
                continue
            lines, partials, result = [], [], ""
            if logpath:
                try:
                    with open(logpath, encoding="utf-8",
                              errors="replace") as f:
                        raw = f.readlines()[-3000:]
                except OSError:
                    raw = []
                TURNS[tid] = dict(base, done=False)
                for ln in raw:
                    ln = ln.strip()
                    if ln:
                        r = _ingest_turn_line(TURNS[tid], ln, lines,
                                              partials, base["provider"])
                        if r:
                            result = r
                _finalize_turn(tid, lines, partials, result, cutoff=True)
                continue
            TURNS[tid] = dict(
                base, done=True, ok=False,
                error="cut off by a restart — send again, same session continues")
            continue
        TURNS[tid] = base
    _turn_save()
    # loops: crew children orphaned with us — flag interrupted + resumable
    # (one-tap resume reposts the same prompt; never auto-reruns).
    for lid, s in _json_load(_state_file("loops.json"), {}).items():
        if not isinstance(s, dict):
            continue
        job = {"done": True, "activity": s.get("activity", ""),
               "started": s.get("started", time.time()),
               "steps": s.get("steps", []), "crew": s.get("crew"),
               "cancel": threading.Event(), "loop": s.get("loop")}
        if not s.get("done"):
            job.update(
                activity="interrupted (bridge restarted)",
                interrupted=True,
                resumable={"prompt": s.get("prompt", ""),
                           "provider": s.get("provider", "opencode"),
                           "crew": s.get("crew")},
                loop={"ok": False, "verdict": "interrupted",
                      "detail": "bridge restarted mid-run — resume to continue the same goal"})
        LOOPS[lid] = job
    _loop_save()


def stop_loop(lid):
    """Ask a running loop to stop between steps. Returns True if known."""
    with LOOPS_LOCK:
        job = LOOPS.get(lid)
        if job is None:
            return False
        job["cancel"].set()
        job["activity"] = "stopping…"
    _loop_save()
    return True


_DOTS_UID = "island"  # single-user local: bridge rows live beside bot rows


def _dots_db():
    """Open the dots sqlite (schema ensured, idempotent). Raises on no pkg."""
    import sqlite3
    from steroids.dots import config as _dc, store as _ds
    conn = sqlite3.connect(_dc.settings.DOTS_DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.executescript(_ds.SCHEMA)
    return conn


# --- durable turns + loops: survive bridge restarts (cloud-like) ---
# Turns run detached (own session, outlive us) with stdout to per-turn
# log files; both registries persist as JSON. On boot the bridge
# reattaches to live agents and flags dead loops resumable — the UI
# poll flow is unchanged, polls simply keep working across restarts.

def _state_file(name):
    home = os.environ.get("STEROIDS_HOME") or os.path.expanduser("~")
    d = os.path.join(home, ".config", "steroids")
    try:
        os.makedirs(d, exist_ok=True)
    except OSError:
        pass
    return os.path.join(d, name)


def _json_load(path, default):
    try:
        with open(path, encoding="utf-8") as f:
            d = json.load(f)
        return d if isinstance(d, type(default)) else default
    except (OSError, ValueError):
        return default


def _json_save(path, obj):
    try:
        tmp = path + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(obj, f)
        os.replace(tmp, path)
    except OSError:
        pass


def _proc_alive(pid):
    """True while the agent process still runs. Zombie-aware: an exited
    child we never reaped (kill succeeds on zombies) reads state Z."""
    try:
        pid = int(pid)
    except (TypeError, ValueError):
        return False
    try:
        os.kill(pid, 0)
    except OSError:
        return False
    try:
        with open("/proc/%d/stat" % pid, encoding="utf-8") as f:
            state = f.read().rsplit(")", 1)[-1].split()[0]
        return state != "Z"
    except (OSError, IndexError):
        return True  # non-Linux: the kill check is all we have


def _turn_save():
    with TURNS_LOCK:
        snap = {tid: {k: v for k, v in t.items() if k != "proc"}
                for tid, t in TURNS.items()}
    _json_save(_state_file("turns.json"), snap)


def _loop_save():
    with LOOPS_LOCK:
        snap = {lid: {k: v for k, v in j.items() if k != "cancel"}
                for lid, j in LOOPS.items()}
    _json_save(_state_file("loops.json"), snap)


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
        log = TURNS[tid].get("log")
        if log:
            try:
                os.remove(log)
            except OSError:
                pass
        del TURNS[tid]
    return bool(stale)  # callers save outside the lock when True


def _ingest_turn_line(t, ln, lines, partials, provider):
    """Fold one CLI output line into the turn. Returns result text when done."""
    lines.append(ln)
    if len(lines) > 600:
        del lines[:-600]
    try:
        j = json.loads(ln)
    except ValueError:
        return None
    if not isinstance(j, dict):
        return None
    u = (agentlog.claude_line(j) if provider == "claude"
         else agentlog.opencode_line(j))
    if not u:
        return None
    with TURNS_LOCK:
        if u.get("session"):
            t["session"] = u["session"]
        if u.get("activity"):
            t["activity"] = u["activity"]
        if u.get("text"):
            partials.append(u["text"])
            t["partial"] = "\n".join(partials)[-4000:]
    return u.get("result")


def _finalize_turn(tid, lines, partials, result, cutoff=False):
    """Close the turn from collected output. cutoff=True (died with the
    bridge/machine) keeps partials as the reply with an honest note."""
    plain = "\n".join(ln for ln in lines[-12:]
                      if not ln.lstrip().startswith("{"))
    text = (result or "\n".join(partials)[-4000:]
            or plain[-4000:] or "")[:4000]
    with TURNS_LOCK:
        t = TURNS.get(tid)
        if t is None:
            return
        log = t.get("log")
        if text:
            if cutoff:
                text = (text + "\n\n[cut off by a restart — send again, "
                        "it continues the same session.]")[:4000]
            t.update(done=True, ok=True, text=text)
        elif cutoff:
            t.update(done=True, ok=False,
                     error="cut off by a restart — send again, same session continues")
        else:
            t.update(done=True, ok=False,
                     error="agent stopped silent — send again")
        if log:
            try:
                os.remove(log)
            except OSError:
                pass
    _turn_save()


def _pump_turn_file(tid, logpath, pid, provider, proc=None, gen=0):
    """Tail a detached agent log to completion. Fresh spawns and boot
    recovery share this — the only difference is who started the proc.
    gen guards double-pumps (a stale thread never clobbers a reattach)."""
    t = TURNS.get(tid)
    if t is None:
        return

    def _alive():
        if proc is not None:
            try:
                return proc.poll() is None
            except OSError:
                return False
        return _proc_alive(pid)

    lines, partials, result = [], [], ""
    try:
        with open(logpath, encoding="utf-8", errors="replace") as f:
            for ln in f.readlines()[-3000:]:
                ln = ln.strip()
                if not ln:
                    continue
                r = _ingest_turn_line(t, ln, lines, partials, provider)
                if r:
                    result = r
            while True:
                ln = f.readline()
                if ln:
                    ln = ln.strip()
                    if ln:
                        r = _ingest_turn_line(t, ln, lines, partials, provider)
                        if r:
                            result = r
                    continue
                # EOF: proc gone means finished (checked on the dead read
                # so a final flush is never missed).
                if not _alive():
                    break
                time.sleep(0.25)
    except OSError:
        pass
    if proc is not None:
        try:
            proc.wait(timeout=10)
        except Exception:
            pass
    with TURNS_LOCK:
        cur = TURNS.get(tid)
        if cur is None or cur.get("gen", 0) != gen:
            return  # reattached elsewhere; the new pump owns the close
    _finalize_turn(tid, lines, partials, result)


def _pump_turn(tid, argv, stdin_data, provider):
    """Spawn detached (survives us) to a log file, then tail it."""
    t = TURNS.get(tid)
    if t is None:
        return
    logdir = os.path.join(os.path.dirname(_state_file("turns.json")), "turns")
    try:
        os.makedirs(logdir, exist_ok=True)
    except OSError:
        pass
    logpath = os.path.join(logdir, tid + ".jsonl")
    try:
        lf = open(logpath, "w", encoding="utf-8")
    except OSError:
        with TURNS_LOCK:
            t.update(done=True, ok=False, error="no scratch space for turn log")
        _turn_save()
        return
    try:
        p = subprocess.Popen(
            argv, stdin=subprocess.PIPE if stdin_data else None,
            stdout=lf, stderr=subprocess.DEVNULL,
            text=True, bufsize=1, start_new_session=True)
    except FileNotFoundError:
        try:
            lf.close()
        except OSError:
            pass
        with TURNS_LOCK:
            t.update(done=True, ok=False,
                     error="%s CLI not installed" % provider)
        _turn_save()
        return
    with TURNS_LOCK:
        t["proc"] = p
        t["pid"] = p.pid
        t["log"] = logpath
    _turn_save()
    if stdin_data:
        try:
            assert p.stdin is not None
            p.stdin.write(stdin_data)
            p.stdin.close()
        except (BrokenPipeError, OSError):
            pass
    try:
        lf.close()  # child holds its own fd; ours is done
    except OSError:
        pass
    _pump_turn_file(tid, logpath, p.pid, provider, proc=p,
                    gen=t.get("gen", 0))


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
    # ponytail: house style (human order — the default CLI voice leans on
    # em-dashes, " - " asides, "..." trails and "---" rules in prose, and
    # opens with Driving/ask-away patter instead of working). One trailer
    # at this single choke point covers both providers; code, commands,
    # paths and lists are explicitly untouched.
    msg = "%s\n\nHouse style for prose (code, commands, paths and lists untouched): no em-dashes, no ' - ' asides, no '...' trails, no '---' dividers. Plain full sentences. No preamble announcements, no driving/ask-away patter — start with the work." % (msg,)
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
                      "provider": provider, "gen": 1,
                      "started": time.time(), "proc": None}
    _turn_save()
    th = threading.Thread(target=_pump_turn,
                           args=(tid, argv, stdin_data, provider), daemon=True)
    th.start()
    return {"ok": True, "turn": tid, "boot": _BOOT_ID}


def stop_turn(tid):
    with TURNS_LOCK:
        t = TURNS.get(tid)
        p = t.get("proc") if t else None
        pid = t.get("pid") if t else None
    if p is not None:
        try:
            p.terminate()
        except OSError:
            pass
    elif pid is not None:
        # reattached turn (no Popen handle here): signal the pid directly.
        try:
            os.kill(int(pid), signal.SIGTERM)
        except (OSError, ValueError):
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
        parts = urlparse(self.path)
        if parts.path == "/agent-sessions":
            # hides rewrite this PC's display state: owner-only.
            if not self._local():
                return self._send({"ok": False,
                                   "error": "delete from the PC itself"}, 403)
            sid = (parse_qs(parts.query).get("session") or [""])[0].strip()
            if not sid:
                return self._send({"ok": False, "error": "session id required"}, 400)
            return self._send({"ok": True, "hidden": agentlog.hide_session(sid)})
        if parts.path == "/turn":
            tid = (parse_qs(parts.query).get("id") or [""])[0]
            if not stop_turn(tid):
                return self._send({"ok": False, "error": "no such turn"}, 404)
            return self._send({"ok": True})
        if parts.path == "/loop":
            lid = (parse_qs(parts.query).get("id") or [""])[0]
            if not stop_loop(lid):
                return self._send({"ok": False, "error": "no such loop"}, 404)
            return self._send({"ok": True})
        if parts.path == "/rules":
            # Custom Rules (Dots/ChatGPT ladder): owner-only, local.
            if not self._local():
                return self._send({"ok": False,
                                   "error": "edit rules from the PC itself"}, 403)
            tool = (parse_qs(parts.query).get("tool") or [""])[0]
            kind = (parse_qs(parts.query).get("kind") or ["glob"])[0]
            if not tool:
                return self._send({"ok": False, "error": "tool required"}, 400)
            return self._send({"ok": decisions.remove_allow_rule(tool, kind)})
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
        elif parts.path == "/version":
            self._send({"version": app_version()})
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
                # loop/test sessions (e2e-*) hide unless ?showTests=1.
                show = show_tests(parts)
                merged = [s for s in merged if s["session"] not in hidden
                          and (show or not is_test_sid(s["session"]))][:12]
                self._send({"sessions": merged})
            except Exception as e:
                self._send({"sessions": [], "error": str(e)})
        elif parts.path == "/events":
            # live opencode event feed for the crew (nav Feed tab).
            try:
                n = int((parse_qs(parts.query).get("n") or ["60"])[0])
            except ValueError:
                n = 60
            n = max(1, min(n, 300))
            try:
                evs = agentlog.read_events(limit=n)
                self._send({"events": evs[::-1]})
            except Exception as e:
                self._send({"events": [], "error": str(e)})
        elif parts.path == "/session":
            # one session's live progress for the team tiles (steps + files).
            sid = (parse_qs(parts.query).get("session") or [""])[0].strip()
            if not sid:
                return self._send({"ok": False,
                                   "error": "session id required"}, 400)
            try:
                evs = agentlog.read_events(limit=300)
                self._send({"progress": agentlog.session_progress(evs, sid)})
            except Exception as e:
                self._send({"progress": None, "error": str(e)})
        elif parts.path == "/transcript":
            # one session's own turns for mate taps (user/agent items from
            # the hook ledger, oldest first, capped — the bridge holds no
            # other per-session history).
            sid = (parse_qs(parts.query).get("session") or [""])[0].strip()
            if not sid:
                return self._send({"ok": False,
                                   "error": "session id required"}, 400)
            try:
                evs = agentlog.read_events(limit=500)
                items = [it for it in agentlog.transcript(evs)
                         if it.get("session") == sid][-100:]
                self._send({"transcript": items})
            except Exception as e:
                self._send({"transcript": [], "error": str(e)})
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
        elif parts.path == "/rules":
            # Custom Rules list (allow/ask/block per tool glob).
            if not self._local():
                return self._send({"ok": False,
                                   "error": "read rules from the PC itself"}, 403)
            self._send({"rules": decisions.allow_rules()})
        elif parts.path == "/loops":
            # live team loops for the shelf (chat-started ones included),
            # plus bridge-restart interrupted ones with one-tap resume.
            with LOOPS_LOCK:
                swept = _loop_sweep()
                out = [{"id": lid,
                        "activity": v.get("activity", ""),
                        "elapsed": round(time.time() - v.get("started",
                                                             time.time()), 1),
                        "steps": list(v.get("steps", []))[-6:],
                        "interrupted": bool(v.get("interrupted")),
                        "resumable": v.get("resumable")}
                       for lid, v in LOOPS.items()
                       if not v.get("done") or v.get("interrupted")]
            if swept:
                _loop_save()
            self._send({"loops": out})
        elif parts.path == "/schedules":
            # dots automations (Manus-style): list + last runs each.
            try:
                from steroids.dots import schedules as _dsched, store as _dstore
                conn = _dots_db()
                rows = _dsched.list_schedules(conn, _DOTS_UID)
                scheds = []
                for s in rows:
                    try:
                        runs = _dsched.list_schedule_runs(conn, s["id"], _DOTS_UID)[:3]
                    except Exception:
                        runs = []
                    d = dict(s)
                    d["runs"] = [{"status": r.get("status"), "result": str(r.get("result") or "")[:200],
                                  "at": r.get("created_at") or r.get("updated_at")} for r in runs]
                    scheds.append(d)
                conn.close()
                self._send({"schedules": scheds})
            except Exception as e:
                self._send({"schedules": [], "error": "dots unavailable: %s" % e})
        elif parts.path == "/usage":
            # token totals for a Claude transcript (?path=...jsonl).
            p = (parse_qs(parts.query).get("path") or [""])[0]
            self._send({"usage": agentlog.transcript_usage(p) if p else {}})
        elif parts.path == "/soundpacks":
            self._send({"packs": soundpack.packs()})
        elif parts.path == "/soundpack/map":
            # web pack map: first installed openpeon pack as {event: url}.
            # Empty map = no packs installed, UI keeps synth. Pack identity
            # is basename-matched against discovered dirs (never a raw path).
            qs = parse_qs(parts.query)
            want = (qs.get("pack") or [""])[0]
            found = soundpack.packs()
            base = next((p for p in found
                         if os.path.basename(os.path.normpath(p)) == want),
                        found[0] if found else "")
            out = {}
            if base:
                name = os.path.basename(os.path.normpath(base))
                for ev, files in soundpack.load(base).items():
                    if files:
                        out[ev] = "/soundpack/file?pack=%s&f=%s" % (
                            quote(name), quote(os.path.basename(files[0])))
            self._send({"pack": os.path.basename(os.path.normpath(base))
                        if base else "", "map": out})
        elif parts.path == "/soundpack/file":
            # serve one pack file: basename-only + realpath containment,
            # audio extensions only. Anything else is a 404, never a read.
            qs = parse_qs(parts.query)
            name = (qs.get("pack") or [""])[0]
            fn = (qs.get("f") or [""])[0]
            base = next((p for p in soundpack.packs()
                         if os.path.basename(os.path.normpath(p)) == name), "")
            p = ""
            if base and fn and "/" not in fn and "\\" not in fn \
                    and not fn.startswith(".") \
                    and fn.endswith((".wav", ".mp3", ".ogg")):
                cand = os.path.join(os.path.realpath(base), fn)
                if os.path.realpath(cand) == cand and os.path.isfile(cand):
                    p = cand
            if not p:
                return self._send({"ok": False, "error": "nope"}, 404)
            try:
                with open(p, "rb") as f:
                    body = f.read()
                self.send_response(200)
                self.send_header("Content-Type",
                                 mimetypes.guess_type(p)[0] or "audio/wav")
                self.send_header("Content-Length", str(len(body)))
                self.send_header("Access-Control-Allow-Origin", "*")
                self.send_header("Cache-Control", "max-age=3600")
                self.end_headers()
                self.wfile.write(body)
            except OSError:
                return self._send({"ok": False, "error": "gone"}, 404)
            return
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
                show = show_tests(parts)
                sess = [s for s in agentlog.sessions(evs)
                        if s["session"] not in hidden
                        and (show or not is_test_sid(s["session"]))][:9]
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
                show = show_tests(parts)
                sess = [s for s in agentlog.sessions(evs)
                        if s["session"] not in hidden
                        and (show or not is_test_sid(s["session"]))][:12]
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
        elif parts.path == "/echo":              # command echo for the chat live-strip. volume via
            # pactl, brightness via sysfs — Nones mean "no row".
            try:
                self._send(_echo.levels())
            except Exception:
                self._send({"volume": None, "muted": False, "brightness": None})
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
                swept = _turn_sweep()
                t = TURNS.get(tid)
                if t is not None and not t["done"]:
                    # heartbeat: an actively-polled turn is by definition
                    # not abandoned — the 900s sweep must not kill it.
                    t["started"] = time.time()
                snap = _turn_snapshot(t) if t else None
            if swept:
                _turn_save()
            if snap is None:
                return self._send({"ok": False, "error": "no such turn",
                                   "boot": _BOOT_ID}, 404)
            self._send(snap)
        elif parts.path == "/loop":
            # team-loop job snapshot (polled while it runs, minutes long).
            lid = (parse_qs(parts.query).get("id") or [""])[0]
            with LOOPS_LOCK:
                swept = _loop_sweep()
                j = LOOPS.get(lid)
                snap = None if j is None else {
                    "done": j["done"], "activity": j["activity"],
                    "steps": list(j.get("steps", [])),
                    "elapsed": round(time.time() - j["started"], 1)}
                if j is not None and j["done"]:
                    snap["ok"] = (j["loop"] or {}).get("ok", False)
                    snap["loop"] = j["loop"]
            if swept:
                _loop_save()
            if snap is None:
                return self._send({"ok": False, "error": "no such loop"}, 404)
            self._send(snap)
        elif parts.path == "/hive":
            # team floor: ledger + board + roster + recent feed, one call.
            try:
                self._send({"tasks": _hive.list_tasks()[-20:],
                            "board": _hive.read_board(),
                            "roster": _hive.roster(),
                            "log": _hive.read_log(20)})
            except Exception as e:
                self._send({"tasks": [], "board": "", "roster": [],
                            "log": [], "error": str(e)})
        elif parts.path == "/hive/inbox":
            # one mate's unread mail (Stop-hook drains read the same way).
            aid = (parse_qs(parts.query).get("agent") or [""])[0].strip()[:40]
            if not aid:
                return self._send({"ok": False,
                                    "error": "agent required"}, 400)
            try:
                self._send({"messages": _hive.unread(aid)})
            except Exception as e:
                self._send({"messages": [], "error": str(e)})
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
        if parts.path == "/events":
            # HTTP clone of the hook relay (hook_relay.py stdin path):
            # opencode/claude hook payloads in, ledger lines out. Same
            # normalize → append → attention-note pipeline, so nicki and
            # the team see remote senders exactly like local hooks.
            req = self._read_json()
            if req is None:
                return self._send({"ok": False, "error": "bad json"}, 400)
            try:
                agent = str(req.pop("agent", "") or "").strip().lower() or "opencode"
                ev = agentlog.normalize(req, agent=agent)
                if ev is None:
                    return self._send({"ok": False, "error": "unknown event"}, 400)
                agentlog.append_event(ev)
                if ev.get("attention") or req.get("hook_event_name") in (
                        "PermissionRequest", "Notification"):
                    try:
                        decisions.note(ev.get("session"), ev.get("tool"),
                                       str(req.get("tool_use_id")
                                           or req.get("request_id") or ""),
                                       kind="approval",
                                       text=ev.get("text") or ev.get("tool"))
                    except Exception:
                        pass
                return self._send({"ok": True})
            except Exception as e:
                return self._send({"ok": False, "error": str(e)}, 500)
        if parts.path == "/decide":
            req = self._read_json()
            if req is None:
                return self._send({"ok": False, "error": "bad json"}, 400)
            if req.get("auto_approve") is not None:
                decisions.set_auto_approve(req.get("session") or "",
                                           bool(req.get("auto_approve")))
                return self._send({"ok": True})
            # UI vocabulary (Allow/Always/Deny) maps to hook vocabulary
            # (approve/deny); Always also writes a standing allow-rule.
            verdict = str(req.get("verdict") or "")
            if verdict == "Always":
                verdict = "approve"
            elif verdict == "Allow":
                verdict = "approve"
            elif verdict == "Deny":
                verdict = "deny"
            ok = decisions.decide(req.get("key") or "", verdict,
                                  req.get("answer") or "")
            if ok and req.get("verdict") == "Always" and req.get("tool"):
                decisions.add_allow_rule(req.get("tool"), "allow")
            return self._send({"ok": ok})
        if parts.path == "/rules":
            # add one Custom Rule {tool, action: allow|deny, kind?, workspace?}.
            if not self._local():
                return self._send({"ok": False,
                                   "error": "edit rules from the PC itself"}, 403)
            req = self._read_json()
            if req is None:
                return self._send({"ok": False, "error": "bad json"}, 400)
            rule = decisions.add_allow_rule(str(req.get("tool") or ""),
                                            str(req.get("action") or ""),
                                            str(req.get("kind") or "glob"),
                                            str(req.get("workspace") or ""))
            if rule is None:
                return self._send({"ok": False,
                                   "error": "need tool + action allow|deny"}, 400)
            return self._send({"ok": True, "rule": rule})
        if parts.path == "/schedules":
            # dots automations: {op: create|pause|resume|delete|run, ...}.
            # Rows fire when the dots runner is up (bot/serve); the island
            # owns create/edit/delete + run-cards, same as /schedule chat.
            req = self._read_json()
            if req is None:
                return self._send({"ok": False, "error": "bad json"}, 400)
            try:
                from steroids.dots import schedules as _dsched
                conn = _dots_db()
                op = str(req.get("op") or "")
                try:
                    if op == "create":
                        freq = str(req.get("freq") or "daily").lower()
                        prompt = str(req.get("prompt") or "").strip()
                        if not prompt:
                            raise ValueError("prompt required")
                        args = [freq]
                        if freq == "weekly":
                            args.append(str(req.get("day") or "mon"))
                        if freq in ("daily", "weekdays", "weekly"):
                            args.append(str(req.get("time") or "09:00"))
                        args.append(prompt)
                        from steroids.dots import bot as _dbot
                        cron, text = _dbot.parse_schedule_args(args)
                        row = _dsched.create_schedule(
                            conn, user_id=_DOTS_UID, provider="claude",
                            box_id="", prompt_text=text, cron_expression=cron)
                        out = {"ok": True, "schedule": dict(row)}
                    elif op in ("pause", "resume", "delete", "run"):
                        sid = int(req.get("id") or 0)
                        fn = {"pause": _dsched.pause_schedule,
                              "resume": _dsched.resume_schedule,
                              "delete": _dsched.delete_schedule,
                              "run": _dsched.run_schedule_now}[op]
                        res = fn(conn, sid, _DOTS_UID)
                        out = {"ok": True,
                               "schedule": dict(res) if res else None}
                    else:
                        out = {"ok": False, "error": "op create|pause|resume|delete|run"}
                finally:
                    conn.close()
            except ValueError as e:
                out = {"ok": False, "error": str(e)[:200]}
            except Exception as e:
                # ScheduleInactiveError str() is just the id — say why.
                if type(e).__name__ == "ScheduleInactiveError":
                    out = {"ok": False, "error": "schedule is paused — resume first"}
                else:
                    out = {"ok": False, "error": str(e)[:200]}
            code = 200 if out.get("ok") else 400
            return self._send(out, code)
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
                # PINs are 6 digits on a 2-min TTL: throttle blind guessing
                # per source IP (growing delay, capped; resets on success).
                ip = self.client_address[0]
                n = _VERIFY_FAILS.get(ip, (0, 0.0))[0] + 1
                _VERIFY_FAILS[ip] = (n, time.time())
                time.sleep(min(0.25 * (2 ** min(n, 4)), 4.0))
                return self._send({"ok": False, "error": "bad pin"}, 404)
            _VERIFY_FAILS.pop(self.client_address[0], None)
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
                try:  # retention: uploads older than 7 days sweep on arrival
                    now = time.time()
                    for fn in os.listdir(updir):
                        fp = os.path.join(updir, fn)
                        try:
                            if os.path.isfile(fp) and now - os.path.getmtime(fp) > 7 * 86400:
                                os.remove(fp)
                        except OSError:
                            pass
                except OSError:
                    pass
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
        if parts.path == "/handoff":
            # crew relay: mate A's latest work becomes mate B's turn.
            # {from_sid, to_text?, provider?} -> start_turn(shared brief).
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
            from_sid = str(req.get("from_sid") or "").strip()
            if not from_sid:
                return self._send({"ok": False,
                                   "error": "from_sid required"}, 400)
            try:
                evs = agentlog.read_events(limit=2000)
                brief = agentlog.build_handoff_brief(
                    evs, from_sid, str(req.get("to_text") or ""))
            except Exception:
                brief = ""
            if not brief:
                return self._send({"ok": False,
                                   "error": "no handoff data — session has "
                                            "no hook events yet"}, 404)
            out = start_turn(brief, None,
                             req.get("provider") or "opencode",
                             req.get("model"))
            self._send(out, out.pop("code", 200) if not out.get("ok") else 200)
            return
        if parts.path == "/loop":
            # team loop runs minutes — async job, shelf polls GET /loop?id=.
            req = self._read_json()
            if req is None:
                return self._send({"ok": False, "error": "bad json"}, 400)
            prompt = str(req.get("prompt") or "").strip()[:4000]
            if not prompt:
                return self._send({"ok": False, "error": "empty prompt"}, 400)
            return self._send(start_loop(
                prompt, req.get("provider") or "opencode",
                req.get("crew")))
        if parts.path == "/hive/send":
            # one mate handing work to another (or to nicki).
            req = self._read_json()
            if req is None:
                return self._send({"ok": False, "error": "bad json"}, 400)
            try:
                row = _hive.send_msg(str(req.get("from") or "")[:40],
                                     str(req.get("to") or "")[:40],
                                     str(req.get("act") or "inform"),
                                     str(req.get("subject") or "")[:200],
                                     str(req.get("body") or "")[:2000],
                                     str(req.get("conv") or "")[:60],
                                     req.get("in_reply_to"))
                delivered = _hive.drain()
            except ValueError as e:
                return self._send({"ok": False, "error": str(e)}, 400)
            return self._send({"ok": True, "id": row["id"],
                               "delivered": delivered})
        if parts.path == "/hive/ack":
            req = self._read_json()
            if req is None:
                return self._send({"ok": False, "error": "bad json"}, 400)
            ok = _hive.ack(str(req.get("agent") or "")[:40],
                           str(req.get("id") or ""))
            return self._send({"ok": ok})
        if parts.path == "/hive/task":
            # hand-written todo on the floor board (crew runs file their own).
            req = self._read_json()
            if req is None:
                return self._send({"ok": False, "error": "bad json"}, 400)
            title = str(req.get("title") or "").strip()[:200]
            if not title:
                return self._send({"ok": False, "error": "title required"},
                                  400)
            row = _hive.add_task(title, str(req.get("spec") or "")[:1000],
                                 str(req.get("assignee") or "nicki")[:40])
            return self._send({"ok": True, "task": row})
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
        try:
            # the floor keeps moving on every chat: outboxes drain first.
            _hive.drain()
            # Nicki turns (anything not already addressed as a mate lane
            # [name·role]) ride with the god brief: roster + open tasks +
            # her inbox + the escalate-if-critical policy.
            if not re.match(r"^\[[^[\]]+[·\-][^[\]]+\]", msg):
                brief = _hive.god_brief()
                if brief:
                    msg = "%s\n\n%s" % (brief, msg)
        except Exception:
            pass
        out = start_turn(msg, req.get("session_id"),
                         req.get("provider") or "opencode",
                         req.get("model"))
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

    try:
        srv = ThreadingHTTPServer((host, port), handler)
    except OSError:
        sys.exit("port %s on %s is busy — another island is already up "
                 "(or a stale one holds it: pkill -f island/bridge.py, "
                 "then retry)" % (port, host))
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
    _boot_recover()  # stable boot id + reattach turns + flag loops
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main(sys.argv[1:])
