"""Live audio energy for the dancing mascot (stdlib only).

Taps the default sink monitor (what you hear, any player) via parec,
folds 200 ms windows into RMS energy + hop triggers (peak-pick onsets).
The island polls GET /audio-energy ~8 Hz and scales the dance.

Never throws, never blocks the bridge: sampler runs in a daemon thread,
auto-starts on first read, reports live:false when capture is missing.
"""
import math
import struct
import subprocess
import threading
import time

_lock = threading.Lock()
_thread = None
_last_use = 0.0
_state = {"energy": 0.0, "hop": False, "ts": 0.0, "live": False}


def _monitor():
    """Default sink monitor, else first monitor source. '' when none."""
    try:
        sink = subprocess.run(
            ["pactl", "get-default-sink"], capture_output=True,
            text=True, timeout=3).stdout.strip().split("\n")[0]
        if sink:
            return sink + ".monitor"
    except Exception:
        pass
    try:
        out = subprocess.run(
            ["pactl", "list", "short", "sources"], capture_output=True,
            text=True, timeout=3).stdout
        mons = [ln for ln in out.splitlines() if "monitor" in ln]
        if not mons:
            return ""
        run = [ln for ln in mons if "RUNNING" in ln]
        pick = run[0] if run else mons[0]
        parts = pick.split("\t")
        return parts[1] if len(parts) > 1 else ""
    except Exception:
        return ""


def _spawn(mon):
    """pw-record pipe (works under PipeWire; parec is dry there).
    Returns (proc, endian) or (None, None). .au header skipped."""
    for argv in (
            ["pw-record", "--target", mon, "--rate=22050",
             "--channels=1", "--format=s16", "-"],
            ["parec", "-d", mon, "--rate=22050",
             "--format=s16le", "--channels=1"]):
        try:
            proc = subprocess.Popen(
                argv, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
            break
        except Exception:
            continue
    else:
        return None, None, b""
    endian = ">"
    if argv[0] == "parec":
        return proc, "<", b""
    # pw-record wraps raw s16 in a 24-byte .au header — but PipeWire
    # writes the words little-endian (64 6e 73 2e), so accept both.
    pre = b""
    try:
        hdr = proc.stdout.read(24)
        if len(hdr) == 24 and hdr[:4] == b".snd":
            off = struct.unpack(">I", hdr[4:8])[0]
        elif len(hdr) == 24 and hdr[:4] == bytes((0x64, 0x6e, 0x73, 0x2e)):
            off = struct.unpack("<I", hdr[4:8])[0]
            endian = "<"
        else:
            # unknown preamble: treat the stream as raw, keep the bytes.
            return proc, "<", hdr
        while off > 24:
            skip = proc.stdout.read(min(off - 24, 4096))
            if not skip:
                break
            off -= len(skip)
    except Exception:
        proc.kill()
        return None, None, b""
    return proc, endian, pre


def _loop(mon):
    rate, secs = 22050, 0.2
    per = int(rate * secs)
    want = per * 2
    proc, endian, pre = _spawn(mon)
    if proc is None:
        return
    ema, slow = 0.0, 0.02
    last_hop = 0.0
    buf = pre
    try:
        while True:
            with _lock:
                idle = time.time() - _last_use > 120
            if idle:
                break
            try:
                chunk = proc.stdout.read(want - len(buf))
            except Exception:
                break
            if not chunk:
                time.sleep(0.05)
                continue
            buf += chunk
            if len(buf) < want:
                continue
            buf, window = b"", buf[:want]
            try:
                ss = struct.unpack("%s%dh" % (endian, per), window)
            except struct.error:
                continue
            s = 0.0
            for v in ss[::4]:  # every 4th sample: plenty for energy
                s += v * v
            rms = math.sqrt(s / (len(ss) // 4)) / 32768.0
            ema += 0.35 * (rms - ema)
            slow += 0.03 * (rms - slow)
            now = time.time()
            hop = ema > max(0.12, slow * 1.8) and now - last_hop > 0.3
            if hop:
                last_hop = now
            with _lock:
                _state.update(energy=min(1.0, ema * 2.2),
                              ts=now, live=True)
                if hop:
                    _state["hop"] = True
    finally:
        try:
            proc.kill()
        except Exception:
            pass
        with _lock:
            _state.update(live=False, energy=0.0)


def read():
    """Latest {energy 0..1, hop edge-once, ts, live}. Never throws."""
    global _thread, _last_use
    try:
        with _lock:
            _last_use = time.time()
            hop = _state["hop"]
            _state["hop"] = False
            out = dict(_state)
            out["hop"] = hop
            running = _thread is not None and _thread.is_alive()
        if not running:
            mon = _monitor()
            if mon:
                _thread = threading.Thread(target=_loop, args=(mon,),
                                            daemon=True)
                _thread.start()
        return out
    except Exception:
        return {"energy": 0.0, "hop": False, "ts": 0.0, "live": False}
