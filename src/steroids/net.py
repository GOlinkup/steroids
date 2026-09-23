#!/usr/bin/env python3
"""Steroids net helpers — URL extraction + stdlib HTTP fetch.

First thin slice of the router monolith split (router.py ~2.5k lines).
Canonical home for evidence-fetch networking; router.py delegates via
file-path load (same pattern as embed.py) so the single-file deploy
(~/.local/bin/steroids + net.py alongside) keeps working.
"""
import re


SHELL_MARKERS = ("loading", "enable javascript", "just a moment",
                 "checking your browser", "cloudflare", "nreum", "__next_f")


def extract_urls(prompt):
    # ponytail: http(s) only; bare domains stay out (precision over recall).
    found = re.findall(r"https?://[^\s) '\"<>]+", prompt)
    return list(dict.fromkeys(u.rstrip(".,;:!?") for u in found))[:5]


def looks_like_shell(text):
    # ponytail: >=2 JS-shell markers in the head = bot-wall/SPA shell, not content.
    head = (text or "")[:2000].lower()
    return sum(1 for m in SHELL_MARKERS if m in head) >= 2


def fetch_text(url, timeout=10, max_bytes=20000):
    # ponytail: stdlib urllib; any failure (DNS, TLS, timeout, huge) = None, never raise.
    try:
        import urllib.request
        req = urllib.request.Request(url, headers={"User-Agent": "Steroids-gather/1.0"})
        with urllib.request.urlopen(req, timeout=timeout) as res:
            raw = res.read(max_bytes + 1)
        text = raw[:max_bytes].decode("utf-8", "replace")
        text = re.sub(r"<script[\s\S]*?</script>|<style[\s\S]*?</style>|<!--[\s\S]*?-->", " ", text)
        text = re.sub(r"<[^>]+>", " ", text)
        text = re.sub(r"\s+", " ", text).strip()
        return text[:max_bytes] or None
    except Exception as e:
        # ponytail: HTTPError is file-like; close to avoid ResourceWarning.
        try:
            e.close()
        except Exception:
            pass
        return None


def _fetch_bytes(url, timeout=15, max_bytes=1000000):
    # ponytail: raw bytes, not fetch_text (that strips tags/whitespace meant for evidence HTML).
    try:
        import urllib.request
        req = urllib.request.Request(url, headers={"User-Agent": "Steroids-self-update/1.0"})
        with urllib.request.urlopen(req, timeout=timeout) as res:
            raw = res.read(max_bytes + 1)
        return raw if len(raw) <= max_bytes else None
    except Exception as e:
        try:
            e.close()
        except Exception:
            pass
        return None
