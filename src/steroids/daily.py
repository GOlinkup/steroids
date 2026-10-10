#!/usr/bin/env python3
"""Steroids daily — morning briefing + day loop + music, zero keys.

Keyless supply: GDELT DOC artlist + BBC RSS + Open-Meteo + a JSONL day
log on disk. Every source softens to empty on failure (Sprint 3
fail-fast lesson); offline serves the stamped cache, cold start serves
an honest empty bundle. Stdlib only (urllib + xml.etree + sqlite-free
JSON files).

Pure helpers (fetchers with injected getters, briefing assembly, day
summary) are unit-tested; the thin _Handler only serves them on :8906
with a CORS wildcard (the :8905 static page fetches cross-origin).
"""
import http.server
import json
import os
import time
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from concurrent.futures import ThreadPoolExecutor

PORT = 8906
GDELT_QUERY = "south africa"
# Google News SA edition (reliable server-side, names SA outlets).
# Publisher feeds (News24/EWN/M&G/IOL) all bot-wall datacenter fetches.
RSS_FEED = ("https://news.google.com/rss/search"
            "?q=south%20africa&hl=en-ZA&gl=ZA&ceid=ZA%3Aen")
# Malamulele, Limpopo (approx) — Open-Meteo needs coords, label is honest.
WX_LAT, WX_LON, WX_LABEL = -22.99, 30.68, "Malamulele"


def _outlet(url):
    """Registrable name for a pin chip: businesslive.co.za -> BUSINESSLIVE."""
    try:
        host = urllib.parse.urlsplit(url).hostname or ""
        host = host[4:] if host.startswith("www.") else host
        parts = host.split(".")
        core = parts[-2] if len(parts) >= 2 and parts[-1] in (
            "za", "uk", "com", "org", "net", "io") else parts[-1]
        if len(parts) >= 3 and parts[-1] in ("za", "uk") \
                and parts[-2] in ("co", "ac", "org", "gov"):
            core = parts[-3]
        return core.upper() if core else "NEWS"
    except Exception:
        return "NEWS"


def _clean_title(raw):
    """Strip video prefixes, split Google News 'Headline - Outlet'."""
    t = (raw or "").strip()
    for pre in ("Watch: ", "Listen: ", "WATCH: ", "LISTEN: "):
        if t.startswith(pre):
            t = t[len(pre):].strip()
            break
    outlet = None
    if " - " in t:
        head, tail = t.rsplit(" - ", 1)
        head, tail = head.strip(), tail.strip()
        # outlet-like: short, and either spaceless (eNCA) or Title Case
        if head and tail and len(tail) <= 30 and (
                " " not in tail or tail[0].isupper()):
            t, outlet = head, tail.upper()
    return t, outlet


def _get(url, timeout=10):
    req = urllib.request.Request(url, headers={"User-Agent": "steroids-daily/1.0"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read().decode("utf-8", "replace")


def fetch_gdelt(limit=5, get=None, query=GDELT_QUERY):
    """GDELT DOC artlist rows: [{title, url}]. Dead source -> []."""
    get = get or _get
    try:
        q = urllib.parse.urlencode(
            {"query": query, "mode": "artlist", "format": "json",
             "maxrecords": str(limit), "sort": "datedesc"})
        body = json.loads(get(
            "https://api.gdeltproject.org/api/v2/doc/doc?" + q))
        out = []
        for a in (body.get("articles") or [])[:limit]:
            t = (a.get("title") or "").strip()
            u = (a.get("url") or "").strip()
            if t and u.startswith("http"):
                t, _ = _clean_title(t)
                out.append({"title": t, "url": u,
                            "source": _outlet(u)})
        return out
    except Exception:
        return []


def fetch_rss(limit=5, get=None, feed=RSS_FEED):
    """RSS pipe rows: [{title, url}]. Dead pipe -> []."""
    get = get or _get
    try:
        root = ET.fromstring(get(feed))
        out = []
        for item in root.iter("item"):
            t = (item.findtext("title") or "").strip()
            u = (item.findtext("link") or "").strip()
            if t and u.startswith("http"):
                t, outlet = _clean_title(t)
                out.append({"title": t, "url": u,
                            "source": outlet or _outlet(u)})
            if len(out) >= limit:
                break
        return out
    except Exception:
        return []


def fetch_weather(get=None):
    """Open-Meteo current temp: {'line', 'observedUtc'} or None."""
    get = get or _get
    try:
        q = urllib.parse.urlencode({
            "latitude": str(WX_LAT), "longitude": str(WX_LON),
            "current": "temperature_2m", "timezone": "UTC"})
        body = json.loads(get(
            "https://api.open-meteo.com/v1/forecast?" + q))
        cur = body.get("current") or {}
        if "temperature_2m" not in cur:
            return None
        return {"line": "%s now: %s°C" % (WX_LABEL, cur["temperature_2m"]),
                "observedUtc": cur.get("time")}
    except Exception:
        return None


def load_briefing(cache_path, now=None, gdelt=None, rss=None, weather=None):
    """Live bundle (cached on any success) or stamped cache or honest empty.

    Injectables return row lists / weather dict; defaults hit the network.
    """
    now = now or time.time()
    # Concurrent (stdlib threads): three 10s pipes overlap instead of
    # stacking to 30s. Injectables stay plain callables for tests.
    with ThreadPoolExecutor(max_workers=3) as ex:
        fw = ex.submit(weather or fetch_weather)
        fg = ex.submit(gdelt or (lambda: fetch_gdelt()))
        fr = ex.submit(rss or (lambda: fetch_rss()))
        w = fw.result()
        heads = []
        for fut in (fg, fr):
            try:
                heads.extend(fut.result() or [])
            except Exception:
                pass
    heads = heads[:12]
    if w is None and not heads:
        cached = read_cache(cache_path)
        if cached is not None:
            cached["offline"] = True
            return cached
        return {"weatherLine": "", "weatherObservedUtc": None,
                "headlines": [], "fetchedAt": now, "offline": True}
    bundle = {"weatherLine": w["line"] if w else "",
              "weatherObservedUtc": w.get("observedUtc") if w else None,
              "headlines": heads, "fetchedAt": now, "offline": False}
    try:
        with open(cache_path, "w") as f:
            json.dump(bundle, f)
    except OSError:
        pass
    return bundle


def read_cache(cache_path):
    try:
        with open(cache_path) as f:
            b = json.load(f)
        if not isinstance(b, dict) or "fetchedAt" not in b:
            return None
        return b
    except (OSError, ValueError):
        return None


def age_label(fetched_at, now=None):
    """Honest age stamp. Never 'just now' unless true."""
    age = (now or time.time()) - fetched_at
    if age < 60:
        return "just now"
    if age < 3600:
        return "%dm ago" % int(age // 60)
    if age < 86400:
        return "%dh ago" % int(age // 3600)
    return "%dd ago" % int(age // 86400)


def log_event(log_path, etype, label, at=None):
    """Append-only day log (fires, plays, completions). Never throws."""
    try:
        with open(log_path, "a") as f:
            f.write(json.dumps({"type": etype, "label": label,
                                "at": at or time.time()}) + "\n")
    except OSError:
        pass


def today_events(log_path, now=None):
    """Today's events (local day). Missing log -> [] (honest empty)."""
    now = now or time.time()
    day = time.strftime("%Y-%m-%d", time.localtime(now))
    out = []
    try:
        with open(log_path) as f:
            for line in f:
                try:
                    e = json.loads(line)
                except ValueError:
                    continue
                t = e.get("at")
                if t and time.strftime("%Y-%m-%d",
                                      time.localtime(t)) == day:
                    out.append(e)
    except OSError:
        pass
    return out


def _search_post(query):
    payload = json.dumps({"context": {"client": {
        "clientName": "WEB", "clientVersion": "2.20241001"}},
        "query": query}).encode()
    req = urllib.request.Request(
        "https://www.youtube.com/youtubei/v1/search", data=payload,
        headers={"Content-Type": "application/json",
                 "User-Agent": "steroids-daily/1.0"})
    with urllib.request.urlopen(req, timeout=12) as r:
        return json.loads(r.read().decode("utf-8", "replace"))


def resolve_track(query, get=None, post=None):
    """youtubei search + oEmbed confirm: {videoId,title,author} or None."""
    get = get or _get
    post = post or _search_post
    try:
        vid = _first_video_id(post(query))
        if not vid:
            return None
        meta = _oembed(vid, get)
        return {"videoId": vid,
                "title": meta.get("title") or query,
                "author": meta.get("author") or ""}
    except Exception:
        return None


def _first_video_id(body):
    try:
        sections = body["contents"]["twoColumnSearchResultsRenderer"] \
            ["primaryContents"]["sectionListRenderer"]["contents"]
        for s in sections:
            items = (s.get("itemSectionRenderer") or {}).get("contents") or []
            for it in items:
                vr = it.get("videoRenderer") or {}
                if isinstance(vr.get("videoId"), str):
                    return vr["videoId"]
    except (KeyError, TypeError, AttributeError):
        pass
    return None


def _oembed(video_id, get):
    try:
        q = urllib.parse.urlencode(
            {"url": "https://www.youtube.com/watch?v=" + video_id,
             "format": "json"})
        body = json.loads(get("https://www.youtube.com/oembed?" + q))
        if not isinstance(body, dict):
            return {}
        return {"title": str(body.get("title") or ""),
                "author": str(body.get("author_name") or "")}
    except Exception:
        return {}


class _Handler(http.server.BaseHTTPRequestHandler):
    cache_path = os.path.expanduser("~/.cache/steroids/daily_brief.json")
    log_path = os.path.expanduser("~/.cache/steroids/daily_log.jsonl")

    def log_message(self, *a):
        pass

    def _send(self, code, obj):
        data = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(data)

    def _send_page(self):
        body = PAGE.encode()
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        part = urllib.parse.urlsplit(self.path)
        qs = urllib.parse.parse_qs(part.query)
        if part.path in ("/", "/index.html"):
            self._send_page()
        elif part.path == "/api/daily/briefing":
            self._send(200, load_briefing(self.cache_path))
        elif part.path == "/api/daily/today":
            self._send(200, {"events": today_events(self.log_path)})
        elif part.path == "/api/daily/music":
            q = (qs.get("q") or [""])[0].strip()
            if not q:
                self._send(400, {"error": "q required"})
            else:
                track = resolve_track(q)
                self._send(200, {"track": track})
        else:
            self._send(404, {"error": "not found"})

    def do_POST(self):
        if urllib.parse.urlsplit(self.path).path == "/api/daily/log":
            try:
                n = int(self.headers.get("Content-Length") or 0)
                e = json.loads(self.rfile.read(n) or b"{}")
                log_event(self.log_path, str(e.get("type") or ""),
                          str(e.get("label") or ""))
                self._send(200, {"ok": True})
            except (ValueError, OSError):
                self._send(400, {"error": "bad event"})
        else:
            self._send(404, {"error": "not found"})

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()


# ponytail: one self-contained page, no assets — the :8906 root has to
# just run. Same-origin fetch, stdlib-styled dark.
PAGE = """<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title> Steroids daily</title>
<style>
*{box-sizing:border-box}body{margin:0;background:#000;color:#fff;
font-family:ui-sans-serif,system-ui,sans-serif;padding:1.2rem;max-width:44rem}
h1{font-size:1.3rem;margin:.2rem 0 .6rem}.wx{opacity:.65;font-size:.9rem}
h2{font-size:.75rem;text-transform:uppercase;letter-spacing:.08em;
opacity:.5;margin:1.4rem 0 .5rem}ul{list-style:none;margin:0;padding:0}
li{padding:.55rem .7rem;border:1px solid rgba(255,255,255,.1);
border-radius:12px;margin-bottom:.45rem;font-size:.9rem}
li a{color:#fff;text-decoration:none}li small{display:block;opacity:.5;
font-size:.68rem;margin-top:.15rem}.row{display:flex;gap:.45rem;flex-wrap:wrap}
button{background:#1c1d22;color:#fff;border:1px solid rgba(255,255,255,.14);
border-radius:99px;padding:.45rem .9rem;font-size:.8rem;cursor:pointer}
button:active{transform:scale(.96)}.ok{color:#34d399;font-size:.8rem;opacity:0}
</style></head><body>
<h1>Today</h1><div class="wx" id="wx">loading…</div>
<h2>Headlines</h2><ul id="news"></ul>
<h2>Log the day</h2><div class="row" id="logrow"></div>
<span class="ok" id="ok">✓</span>
<h2>Today</h2><ul id="today"></ul>
<script>
const $=id=>document.getElementById(id);
fetch("api/daily/briefing").then(r=>r.json()).then(j=>{
  $("wx").textContent=j.weatherLine||"offline — cached";
  $("news").innerHTML=(j.headlines||[]).map(h=>
    `<li><a href="${h.url}">${h.title}</a><small>${h.outlet||""}</small></li>`
  ).join("")||"<li>no headlines</li>";
}).catch(()=>{$("wx").textContent="briefing unreachable";});
const pull=()=>fetch("api/daily/today").then(r=>r.json()).then(j=>{
  $("today").innerHTML=(j.events||[]).map(e=>`<li>${e.label}<small>${e.type}</small></li>`).join("")||"<li>nothing logged yet</li>";
});pull();
[["work","Did work"],["gym","Gym"],["read","Read"],["ship","Shipped"],["rest","Rest"]].forEach(([t,l])=>{
  const b=document.createElement("button");b.textContent=l;
  b.onclick=()=>fetch("api/daily/log",{method:"POST",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({type:t,label:l})}).then(()=>{pull();
    const o=$("ok");o.style.opacity=1;setTimeout(()=>o.style.opacity=0,900);});
  $("logrow").appendChild(b);
});
</script></body></html>"""


def ensure(port=PORT):
    """Singleton daily server (lens pattern): reuse live or daemonize."""
    import socket
    s = socket.socket()
    try:
        s.bind(("127.0.0.1", port))
    except OSError:
        s.close()
        return ("http://127.0.0.1:%d" % port, False)
    s.close()
    pid = os.fork()
    if pid > 0:
        time.sleep(0.5)
        return ("http://127.0.0.1:%d" % port, True)
    try:
        os.setsid()
        srv = http.server.HTTPServer(("127.0.0.1", port), _Handler)
        srv.serve_forever()
    finally:
        os._exit(0)


if __name__ == "__main__":
    url, _ = ensure()
    print(url, flush=True)
    # ponytail: foreground in __main__ keeps the human's terminal honest
    import threading
    threading.Event().wait()
