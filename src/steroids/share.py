#!/usr/bin/env python3
"""Steroids share — daily rollup + anonymous ping to the global counters hub.

One POST per local day (marker-file gate, never per prompt). Payload is
counters only: {day, skills:[{skill, serves, accepts, misses}]} — no prompts,
no queries, no code. The hub is the Maldrive Supabase project's
`steroids-ping` edge function; GET on the same URL returns merged global
totals for everyone (shared learning) and is what the Town reads live.

Deploy note: single-file mode (router.py alone at ~/.local/bin/steroids)
degrades gracefully — share.py missing means ping silently disabled.
"""
import json
import os
import re
import time
import urllib.request

HUB_URL = os.environ.get(
    "STEROIDS_HUB_URL",
    "https://jqvpuyzawidrcwgnphqu.supabase.co/functions/v1/steroids-ping",
)

# $0 reads: static snapshot first (CDN-cached, ~zero function invocations
# at any user count). Refreshed server-side on every hub GET MISS.
STATIC_URL = (
    "https://jqvpuyzawidrcwgnphqu.supabase.co"
    "/storage/v1/object/public/steroids-public/shared.json"
)
ANON_KEY = os.environ.get(
    "STEROIDS_HUB_ANON_KEY", ""
)  # set in the environment if the hub enforces apikey
PING_EVERY = 86400  # one POST per local day

SLUG_RE = re.compile(r"^[a-z0-9][a-z0-9_-]{0,79}$")
TRIG_KEY_RE = re.compile(r"^[a-z0-9][a-z0-9_,+-]{0,159}$")
MAX_CORRECTIONS = 200  # hub cap; trims after today's rollup, never before


def _opted_out():
    # STEROIDS_NO_SHARE=1 (or 'true'/'yes') = never ping. Privacy kill switch.
    v = os.environ.get("STEROIDS_NO_SHARE", "").strip().lower()
    return v in ("1", "true", "yes", "on")


def _rollup_from_log(log_path, mem_path):
    """Aggregate served.jsonl (t, skills='a/b/c') + memory.json accepts
    into per-skill counters for TODAY (local date). Stdlib only."""
    from datetime import datetime

    today = datetime.now().strftime("%Y-%m-%d")
    day_start = datetime.strptime(today, "%Y-%m-%d").timestamp()

    serves = {}
    misses = {}
    corrections = {}  # (trig_key, skill) -> hits for today (phase 2)
    try:
        with open(log_path, encoding="utf-8") as f:
            for line in f:
                try:
                    o = json.loads(line)
                except Exception:
                    continue
                if int(o.get("t", 0)) < day_start:
                    continue
                names = o.get("skills") or ""
                correction = o.get("correction")
                if names:
                    for s in str(names).split("/"):
                        s = s.strip().lower()
                        if SLUG_RE.match(s):
                            serves[s] = serves.get(s, 0) + 1
                elif correction:
                    s = str(correction).strip().lower()
                    if SLUG_RE.match(s):
                        misses[s] = misses.get(s, 0) + 1
                        # trig_key = the attempted trigs (anonymized tokens only)
                        trig_key = str(o.get("trigs") or "").strip().lower()
                        if trig_key and TRIG_KEY_RE.match(trig_key):
                            k = (trig_key, s)
                            corrections[k] = corrections.get(k, 0) + 1
    except OSError:
        pass

    accepts = {}
    try:
        with open(mem_path, encoding="utf-8") as f:
            seen = json.load(f).get("seen", {})
        if isinstance(seen, dict):
            for s, ts in seen.items():
                s = str(s).strip().lower()
                if SLUG_RE.match(s) and float(ts or 0) >= day_start:
                    accepts[s] = accepts.get(s, 0) + 1
    except Exception:
        pass

    skills = []
    for s in sorted(set(serves) | set(accepts) | set(misses)):
        skills.append({
            "skill": s,
            "serves": serves.get(s, 0),
            "accepts": accepts.get(s, 0),
            "misses": misses.get(s, 0),
        })
    corr_list = [
        {"trig_key": k[0], "skill": k[1], "hits": v}
        for k, v in sorted(corrections.items(), key=lambda kv: -kv[1])
    ][:MAX_CORRECTIONS]
    return today, skills, corr_list


def _build_payload(day, skills, corrections):
    """Assemble the POST body. Hub requires 1..200 skill rows, so a
    corrections-only day carries zero-counter rows for its skills."""
    payload = {"day": day, "skills": skills[:200]}
    if corrections:
        payload["corrections"] = corrections
        if not payload["skills"]:
            payload["skills"] = [
                {"skill": c["skill"], "serves": 0, "accepts": 0, "misses": 0}
                for c in corrections]
    return payload


def _marker_path(base_dir):
    return os.path.join(base_dir, ".last_ping")


def should_ping(base_dir, now=None):
    """True when we haven't successfully POSTed in the last 24h."""
    try:
        with open(_marker_path(base_dir), encoding="utf-8") as f:
            return (now or time.time()) - float(f.read().strip() or 0) >= PING_EVERY
    except (OSError, ValueError):
        return True


def _mark_pinged(base_dir, now=None):
    try:
        with open(_marker_path(base_dir), "w", encoding="utf-8") as f:
            f.write(str(now or time.time()))
    except OSError:
        pass


def ping(base_dir=..., log_path=None, mem_path=None, force=False, timeout=8):
    """Rollup today's counters and POST them to the hub. Fire-and-forget:
    any failure returns {'ok': False, ...} and never raises."""
    if base_dir is ...:
        base_dir = os.path.expanduser(
            os.environ.get("STEROIDS_BASE_DIR", "~/.config/steroids"))
    if _opted_out():
        return {"ok": True, "skipped": True, "reason": "opted out (STEROIDS_NO_SHARE)"}
    try:
        from . import share as _self  # package import — always self
    except ImportError:
        _self = None
    log_path = log_path or os.path.join(base_dir, "served.jsonl")
    mem_path = mem_path or os.path.join(base_dir, "memory.json")

    if not force and not should_ping(base_dir):
        return {"ok": True, "skipped": True, "reason": "already pinged today"}

    try:
        day, skills, corrections = _rollup_from_log(log_path, mem_path)
    except Exception as e:
        return {"ok": False, "error": "rollup: %s" % e}
    if not skills and not corrections:
        # nothing learned today; mark so we retry tomorrow, not every prompt
        _mark_pinged(base_dir)
        return {"ok": True, "skipped": True, "reason": "no counters today"}

    body = json.dumps(_build_payload(day, skills, corrections)).encode()
    req = urllib.request.Request(
        HUB_URL, data=body, method="POST",
        headers={"Content-Type": "application/json",
                 "User-Agent": "Steroids-share/1.0"})
    if ANON_KEY:
        req.add_header("apikey", ANON_KEY)
        req.add_header("Authorization", "Bearer " + ANON_KEY)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as res:
            ok = 200 <= res.status < 300
            res.read()
        if ok:
            _mark_pinged(base_dir)
            # Phase 2: pull learned clusters back down (3+ distinct days only).
            # Best-effort — a sync failure never fails the ping.
            try:
                sync_shared_rules(base_dir)
            except Exception:
                pass
            return {"ok": True, "day": day, "skills": len(skills)}
        return {"ok": False, "error": "http %s" % getattr(res, "status", "?")}
    except Exception as e:
        return {"ok": False, "error": str(e)}


def shared_rules_path(base_dir):
    # Separate file on purpose: skill-rules.json is owned by --self-update;
    # shared overrides merge in router.load_rules() and never touch it.
    return os.path.join(base_dir, "shared-rules.json")


def sync_shared_rules(base_dir=None, url=HUB_URL, timeout=6, now=None):
    """GET the hub's shared_rules and merge them into shared-rules.json.

    Add-only: a rule never removes or overwrites local trigs for a skill;
    it can only add trigger lists (stored as {skill: [trigs...]}).
    Returns {'ok': True, 'added': n, 'total': n} or {'ok': False, ...}.
    """
    if base_dir is None:
        base_dir = os.path.expanduser(
            os.environ.get("STEROIDS_BASE_DIR", "~/.config/steroids"))
    # ponytail: opt-out governs SENDING (ping) only. Receiving is an
    # anonymous aggregate read with zero privacy cost — everyone syncs.
    try:
        req = urllib.request.Request(
            STATIC_URL, headers={"User-Agent": "Steroids-share/1.0"})
        with urllib.request.urlopen(req, timeout=timeout) as res:
            data = json.loads(res.read().decode("utf-8"))
        if not isinstance(data, dict) or not isinstance(
                data.get("shared_rules"), list):
            raise ValueError("bad static shape")
    except Exception:
        data = global_counts(url, timeout=timeout)
    rules_out = data.get("shared_rules") if isinstance(data, dict) else None
    if not isinstance(rules_out, list):
        return {"ok": False, "error": "no shared_rules in hub response"}

    path = shared_rules_path(base_dir)
    merged = {}
    try:
        with open(path, encoding="utf-8") as f:
            old = json.load(f)
        if isinstance(old, dict):
            merged = old.get("skills", {}) if isinstance(old.get("skills"), dict) else {}
    except Exception:
        pass

    added = 0
    for r in rules_out:
        skill = str(r.get("skill") or "").strip().lower()
        trigs = [str(t).strip().lower() for t in (r.get("trigs") or []) if str(t).strip()]
        if not SLUG_RE.match(skill) or not trigs:
            continue
        cur = merged.get(skill)
        if cur is None:
            merged[skill] = trigs
            added += 1
        else:
            merged[skill] = list(cur)  # never overwrite an existing local list

    out = {"skills": merged,
           "shared_rules_ts": (now or time.time()),
           "hub_generated_at": data.get("generated_at", "")}
    try:
        os.makedirs(base_dir, exist_ok=True)
        with open(path, "w", encoding="utf-8") as f:
            json.dump(out, f)
    except OSError as e:
        return {"ok": False, "error": str(e)}
    return {"ok": True, "added": added, "total": len(merged)}


def global_counts(url=HUB_URL, timeout=6):
    """GET merged global totals (what the Town + routers read)."""
    req = urllib.request.Request(url, headers={"User-Agent": "Steroids-share/1.0"})
    if ANON_KEY:
        req.add_header("apikey", ANON_KEY)
        req.add_header("Authorization", "Bearer " + ANON_KEY)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as res:
            return json.loads(res.read().decode("utf-8", "replace"))
    except Exception as e:
        return {"ok": False, "error": str(e)}