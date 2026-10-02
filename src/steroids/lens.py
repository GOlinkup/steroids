"""Steroids Lens v1 — live window into agent visual work (stdlib only).

Any harness (opencode, claude, antigravity) saves screenshots somewhere;
`steroids lens --watch <dir>` serves a local page where each new shot pops
a card on top: thumbnail, filename, time, step label from the filename.
Zero deps, works offline, nothing leaves the machine.

Pure helpers (collect_shots, shot_label, safe_name) are unit-tested;
serve() is the thin HTTP shell.
"""
import http.server
import json
import mimetypes
import os
import shutil
import subprocess
import sys
import time

SHOT_EXTS = (".png", ".jpg", ".jpeg", ".gif", ".webp")


def shot_label(filename):
    """Step label from a filename: shot-menu2.png -> 'shot menu2'."""
    base = os.path.basename(filename)
    stem, _ = os.path.splitext(base)
    return stem.replace("-", " ").replace("_", " ").strip() or base


def safe_name(watch_dir, name):
    """Resolve a shot name inside watch_dir; None on traversal/odd input."""
    if not name or "/" in name or "\\" in name or name.startswith("."):
        return None
    if not name.lower().endswith(SHOT_EXTS):
        return None
    path = os.path.join(watch_dir, name)
    if os.path.realpath(path) != os.path.realpath(
            os.path.join(os.path.realpath(watch_dir), name)):
        return None
    return path if os.path.isfile(path) else None


def collect_shots(watch_dir):
    """Newest-first shot cards for a directory. Never throws."""
    try:
        names = os.listdir(watch_dir)
    except OSError:
        return []
    shots = []
    for n in names:
        if not n.lower().endswith(SHOT_EXTS):
            continue
        p = os.path.join(watch_dir, n)
        try:
            st = os.stat(p)
        except OSError:
            continue
        if not os.path.isfile(p):
            continue
        shots.append({
            "name": n,
            "label": shot_label(n),
            "mtime": st.st_mtime,
            "time": time.strftime("%H:%M:%S", time.localtime(st.st_mtime)),
            "size": st.st_size,
        })
    shots.sort(key=lambda s: s["mtime"], reverse=True)
    return shots


PAGE = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Steroids Lens</title>
<style>
*{box-sizing:border-box}
body{margin:0;background:#0b0e14;color:#fff;font-family:system-ui,sans-serif}
header{position:sticky;top:0;background:#11141b;border-bottom:1px solid rgba(255,255,255,.08);padding:.7rem 1rem;display:flex;gap:.6rem;align-items:center;z-index:5}
.dot{width:.6rem;height:.6rem;border-radius:50%;background:#7dffb0;box-shadow:0 0 8px #7dffb0}
#grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:1rem;padding:1rem}
.card{background:#171b24;border:1px solid rgba(255,255,255,.09);border-radius:14px;overflow:hidden;animation:pop .25s ease}
@keyframes pop{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
.card img{width:100%;display:block;background:#000}
.meta{padding:.6rem .8rem}
.meta b{display:block;font-size:.85rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.meta span{color:rgba(255,255,255,.55);font-size:.72rem;font-family:ui-monospace,monospace}
#empty{color:rgba(255,255,255,.5);padding:3rem 1rem;text-align:center}
#bell{margin-left:auto;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.12);color:#fff;font:inherit;font-size:.72rem;padding:.3rem .7rem;border-radius:99em;cursor:pointer;transition:background .15s ease,border-color .15s ease}
#bell:hover{background:rgba(255,255,255,.14)}
#bell.on{background:rgba(125,255,176,.15);border-color:rgba(125,255,176,.4);color:#7dffb0}
#toast{position:fixed;right:1rem;bottom:1rem;z-index:20;display:flex;gap:.7rem;align-items:center;background:#171b24;border:1px solid rgba(255,255,255,.14);border-radius:12px;padding:.5rem;box-shadow:0 8px 30px rgba(0,0,0,.5);max-width:320px;cursor:pointer;opacity:0;transform:translateY(10px);visibility:hidden;transition:opacity .2s ease,transform .25s ease,visibility 0s linear .25s}
#toast.on{opacity:1;transform:none;visibility:visible;transition:opacity .2s ease,transform .25s ease}
#toast img{width:84px;height:52px;object-fit:cover;border-radius:8px;background:#000;flex:none}
#toast b{display:block;font-size:.78rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#toast span{color:rgba(255,255,255,.5);font-size:.68rem}
@media (prefers-reduced-motion:reduce){.card{animation:none}#toast{transition:none}}
</style>
</head>
<body>
<header><span class="dot"></span><b>Steroids Lens</b><span id="dir"></span><span id="count"></span><button id="bell" title="Desktop notifications when a new shot lands">🔔 off</button></header>
<div id="grid"></div>
<div id="empty">drop screenshots in the watched folder — new shots pop here</div>
<div id="toast"><img alt=""><div><b></b><span></span></div></div>
<script>
(function(){
var seen={},grid=document.getElementById('grid'),empty=document.getElementById('empty'),
    dir=document.getElementById('dir'),count=document.getElementById('count'),
    bell=document.getElementById('bell'),toast=document.getElementById('toast'),
    tTitle=document.title,first=true,timer=null,notifyOn=
    ('Notification' in window&&Notification.permission==='granted');
function setBell(){bell.textContent=notifyOn?'🔔 on':'🔔 off';bell.className=notifyOn?'on':'';}
setBell();
bell.onclick=function(){
  if(!('Notification' in window)){bell.textContent='🔔 n/a';return;}
  if(notifyOn){notifyOn=false;setBell();return;}
  if(Notification.permission==='granted'){notifyOn=true;setBell();return;}
  Notification.requestPermission().then(function(p){notifyOn=(p==='granted');setBell();});
};
function popToast(s){
  toast.querySelector('img').src='/shot/'+encodeURIComponent(s.name);
  toast.querySelector('b').textContent=s.label;
  toast.querySelector('span').textContent=s.time;
  toast.classList.add('on');
  clearTimeout(timer);timer=setTimeout(function(){toast.classList.remove('on')},4500);
  toast.onclick=function(){
    var c=document.getElementById('c-'+s.name);
    if(c)c.scrollIntoView({behavior:'smooth',block:'start'});
    toast.classList.remove('on');
  };
}
function ping(s){
  popToast(s);
  if(!document.hidden)return;
  document.title='● new shot — Steroids Lens';
  if(notifyOn&&'Notification' in window){
    try{
      var n=new Notification('Steroids Lens — new shot',{
        body:s.label,icon:'/shot/'+encodeURIComponent(s.name)});
      n.onclick=function(){window.focus();document.title=tTitle;n.close();};
    }catch(e){}
  }
}
document.addEventListener('visibilitychange',
  function(){if(!document.hidden)document.title=tTitle;});
function card(s){
  var d=document.createElement('div');d.className='card';d.id='c-'+s.name;
  var img=document.createElement('img');img.src='/shot/'+encodeURIComponent(s.name);img.loading='lazy';img.alt=s.label;
  var m=document.createElement('div');m.className='meta';
  var b=document.createElement('b');b.textContent=s.label;
  var sp=document.createElement('span');sp.textContent=s.name+' · '+s.time;
  m.appendChild(b);m.appendChild(sp);d.appendChild(img);d.appendChild(m);return d;
}
function poll(){
  fetch('/api/shots').then(function(r){return r.json();}).then(function(list){
    dir.textContent=list.dir||'';count.textContent=list.shots.length+' shots';
    empty.style.display=list.shots.length?'none':'block';
    var fresh=[];
    list.shots.forEach(function(s){if(!seen[s.name+':'+s.mtime])fresh.push(s);});
    fresh.reverse().forEach(function(s){
      seen[s.name+':'+s.mtime]=1;
      grid.insertBefore(card(s),grid.firstChild);
      if(!first)ping(s);
    });
    first=false;
  }).catch(function(){});
}
poll();setInterval(poll,2000);
})();
</script>
</body>
</html>
"""


class _Handler(http.server.BaseHTTPRequestHandler):
    watch_dir = "."

    def log_message(self, *a):
        pass

    def _send(self, code, body, ctype):
        data = body.encode("utf-8") if isinstance(body, str) else body
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        if self.path == "/" or self.path.startswith("/?"):
            self._send(200, PAGE, "text/html; charset=utf-8")
        elif self.path == "/api/shots":
            payload = json.dumps({
                "dir": os.path.abspath(self.watch_dir),
                "shots": collect_shots(self.watch_dir),
            })
            self._send(200, payload, "application/json")
        elif self.path.startswith("/shot/"):
            name = self.path[len("/shot/"):]
            try:
                from urllib.parse import unquote
                name = unquote(name)
            except Exception:
                pass
            path = safe_name(self.watch_dir, name)
            if path is None:
                self._send(404, "no such shot", "text/plain")
                return
            ctype, _ = mimetypes.guess_type(path)
            try:
                with open(path, "rb") as f:
                    self._send(200, f.read(), ctype or "image/png")
            except OSError:
                self._send(404, "no such shot", "text/plain")
        else:
            self._send(404, "not found", "text/plain")


def _alive(pid):
    try:
        os.kill(pid, 0)
        return True
    except OSError:
        return False


def ensure(watch_dir=".", port=8904):
    """Singleton: reuse the live server or daemonize one. Returns (url, started).

    Never throws; pidfile lives in the watch dir so each folder owns one.
    """
    watch_dir = os.path.abspath(watch_dir)
    url = "http://127.0.0.1:%d" % port
    try:
        os.makedirs(watch_dir, exist_ok=True)
        pidfile = os.path.join(watch_dir, ".lens.pid")
        try:
            with open(pidfile) as f:
                pid = int(f.read().strip())
            if _alive(pid):
                return url, False
        except (OSError, ValueError):
            pass
        # ponytail: entry point that serves --lens. Repo dev: sibling
        # router.py (argv[0] may be a test runner). Installed: argv[0]
        # itself (the deployed router copy; no sibling router.py there).
        sibling = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                               "router.py")
        entry = sibling if os.path.isfile(sibling) else os.path.abspath(sys.argv[0])
        proc = subprocess.Popen(
            [sys.executable, entry, "--lens",
             "--watch", watch_dir, "--port", str(port)],
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
            stdin=subprocess.DEVNULL, start_new_session=True)
        with open(pidfile, "w") as f:
            f.write(str(proc.pid))
        return url, True
    except Exception:
        return url, False


def open_browser(url):
    """Best-effort detached browser open. Never throws."""
    try:
        if sys.platform == "darwin":
            subprocess.Popen(["open", url], stdout=subprocess.DEVNULL,
                             stderr=subprocess.DEVNULL, start_new_session=True)
        elif sys.platform == "win32":
            os.startfile(url)  # noqa: PGH003 (windows-only call)
        elif shutil.which("xdg-open"):
            subprocess.Popen(["xdg-open", url], stdout=subprocess.DEVNULL,
                             stderr=subprocess.DEVNULL, start_new_session=True)
    except Exception:
        pass


def serve(watch_dir=".", port=8904):
    """Serve the Lens page until Ctrl-C. Returns exit code."""
    os.makedirs(watch_dir, exist_ok=True)
    # ponytail: per-server subclass so two servers never share a watch dir.
    cls = type("LensHandler", (_Handler,),
               {"watch_dir": os.path.abspath(watch_dir)})
    srv = http.server.HTTPServer(("127.0.0.1", port), cls)
    print("Steroids Lens on http://127.0.0.1:%d watching %s" % (
        port, cls.watch_dir), flush=True)
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass
    return 0
