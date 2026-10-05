#!/usr/bin/env python3
"""Gig adapters: native JSON store first, Remotive keyless seed.

Money invariant (same doctrine as the Flutter island): integer cents
end to end, never a float. Seed salary text is served verbatim, never
parsed into cents. Native rows are operator-curated local gigs
(island/gigs_native.json); Remotive rows carry attribution + freshness
stamp + the ~24h delay disclosure.
"""
import json
import os
import time
import urllib.request

NATIVE_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                           "gigs_native.json")
ATTRIBUTION = "Remotive (seed)"
SEED_NOTICE = ("Seed listings refresh daily and may lag the source "
               "by ~24h.")
REMOTIVE_URL = ("https://remotive.com/api/remote-jobs?limit=%d")


def money_cents(cents):
    """R 1 234,56 — pure int math. Negative renders -R prefix."""
    neg = cents < 0
    a = abs(cents)
    digits = str(a // 100)
    out = ""
    for i, ch in enumerate(digits):
        if i and (len(digits) - i) % 3 == 0:
            out += " "
        out += ch
    return "%sR %s,%02d" % ("-" if neg else "", out, a % 100)


def native_rows(path=NATIVE_FILE):
    """Operator gigs. Missing/corrupt file reads as empty, never throws."""
    try:
        with open(path, encoding="utf-8") as f:
            rows = json.load(f)
    except (OSError, ValueError):
        return []
    if not isinstance(rows, list):
        return []
    out = []
    for r in rows:
        if not isinstance(r, dict):
            continue
        title = str(r.get("title") or "").strip()
        cents = r.get("pay_cents")
        if not title or not isinstance(cents, int):
            continue
        out.append({"id": "native-%s" % str(r.get("id") or title),
                    "title": title, "origin": "native",
                    "pay_cents": cents, "money": money_cents(cents),
                    "category": str(r.get("category") or "general"),
                    "location": str(r.get("location") or ""),
                    "remote": bool(r.get("remote", False))})
    return out


def add_native(title, pay_cents, category="general", location="",
               remote=False, path=NATIVE_FILE):
    """Operator curates a gig. Types enforced: title str, cents int."""
    if not isinstance(title, str) or not title.strip():
        return None
    if not isinstance(pay_cents, int):
        return None
    rows = []
    try:
        with open(path, encoding="utf-8") as f:
            rows = json.load(f)
    except (OSError, ValueError):
        rows = []
    if not isinstance(rows, list):
        rows = []
    row = {"id": "n%d" % int(time.time()), "title": title.strip(),
           "pay_cents": pay_cents, "category": str(category),
           "location": str(location), "remote": bool(remote)}
    rows.append(row)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(rows, f)
    return row["id"]


def remotive_rows(limit=10, opener=None, now=None):
    """Keyless seed. Attribution + freshness on every row; outage -> []."""
    at = now if now is not None else int(time.time())
    try:
        resp = (opener or urllib.request.urlopen)(
            REMOTIVE_URL % limit, timeout=15)
        body = json.loads(resp.read().decode())
    except Exception:
        return []
    jobs = body.get("jobs") if isinstance(body, dict) else None
    if not isinstance(jobs, list):
        return []
    out = []
    for j in jobs:
        if not isinstance(j, dict):
            continue
        title = str(j.get("title") or "").strip()
        if not title:
            continue
        company = str(j.get("company_name") or "").strip()
        salary = str(j.get("salary") or "").strip()
        out.append({"id": "remotive-%s" % str(j.get("id") or title),
                    "title": title if not company else "%s @ %s" % (
                        title, company),
                    "origin": "remotiveSeed",
                    "pay_cents": None, "pay_text": salary or None,
                    "attribution": ATTRIBUTION, "seeded_at": at,
                    "category": str(j.get("job_type") or "remote"),
                    "location": str(j.get("candidate_required_location")
                                    or "Remote"),
                    "remote": True})
        if len(out) >= limit:
            break
    return out


def load(limit=10, native_path=NATIVE_FILE, opener=None, now=None):
    """Native first (landable today), seed after. Dead seed keeps native."""
    rows = native_rows(native_path)
    rows.extend(remotive_rows(limit, opener, now))
    return {"gigs": rows, "seed_notice": SEED_NOTICE}
