#!/usr/bin/env python3
"""D36 miss mining: abstention clusters -> proposed goldens.

Runs propose() on the live served log (clusters of >=2 unmet queries by
trigger set), then emits one PROPOSED golden row per cluster: the query is
rebuilt from trigger tokens, expected is TBD for a human (same gate as
G61 generation — the machine proposes, humans dispose).
Writes reports/miss-goldens-YYYY-MM-DD.md.
Usage:  python3 scripts/mine_misses.py
Stdlib only.
"""
import importlib.util
import os
import re
from datetime import datetime

_HERE = os.path.dirname(os.path.abspath(__file__))
_ROOT = os.path.normpath(os.path.join(_HERE, ".."))
_ROUTER = os.path.join(_ROOT, "src", "steroids", "router.py")

# D37 noise gate: keyboard-mash / glyph-salad queries poison the human G61 queue
# (2026-09-25 miss-goldens had 'asdf jkl qwer zxcv' and 'blorp bluorp snorp'
# among only 3 clusters). A cluster is noise if >= HALF its trigger tokens
# (min 2) are mash-like: no-vowel runs, 4+ identical-char runs, doubled
# bigrams (blu/orp), or pure repeats. Real queries keep their vowels and
# variety; mash never does. TBD rows that look like this never reach a human.
_MASH_NO_VOWEL = re.compile(r"^[bcdfghjklmnpqrstvwxz]{4,}$", re.IGNORECASE)
_MASH_CHAR_RUN = re.compile(r"(.)\1{3,}")
_MASH_CODA = re.compile(r"(orp|uio|asdf|jkl|qwer|zxcv)", re.IGNORECASE)
_KEYBOARD_WALK = ("qw", "as", "zx", "jk", "ui", "op", "mn", "io", "gh")


def _mash_token(tok):
    if len(tok) < 4:
        return False
    if _MASH_NO_VOWEL.match(tok):
        return True
    if _MASH_CHAR_RUN.search(tok):
        return True
    # home-row keyboard walks: asdf/jkl/qwer/zxcv/yuio — 2+ non-adjacent
    # letter pairs (qw, as, zx, jk, ui...) = finger-walking, not language.
    if sum(1 for p in _KEYBOARD_WALK if p in tok) >= 2:
        return True
    # consonant-only coda stack: blorp/snorp/bluorp share '-orp' shell; real
    # words rarely end in 2 consonants + 1 consonant (rp/lt ok, rk/ft ok —
    # so gate on the mash triple only)
    if _MASH_CODA.match(tok):
        return True
    letters = [c for c in tok.lower() if c.isalpha()]
    if len(letters) >= 6 and not any(c in "aeiouy" for c in letters):
        return True
    return False


def is_noise_query(query):
    """True for keyboard-mash/gibberish queries that must not reach humans."""
    toks = [t for t in re.split(r"[^a-z0-9]+", query.lower()) if t]
    if not toks:
        return True
    mash = sum(1 for t in toks if _mash_token(t))
    if mash >= 2 and mash >= len(toks) / 2:
        return True
    if len(set(toks)) == 1 and len(toks) >= 2:
        return True
    # shared coda family: blorp/bluorp/snorp all end '-orp' — pseudo-word
    # shells repeat; real English codas vary (python/flutter deploy don't).
    # mash>=1 required so legit repeated codas (nightly-, -sheet variants)
    # with one real token don't trip; pure pseudo-word shells have >=2 mashy
    # tokens OR 3+ tokens sharing a coda (blorp family has 3).
    codas = [t[-3:] for t in toks if len(t) >= 5]
    if len(codas) >= 2 and len(set(codas)) < len(codas):
        if mash >= 1 or len(codas) >= 3:
            return True
    return False

_spec = importlib.util.spec_from_file_location("steroids_router_misses", _ROUTER)
router = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(router)


def propose_goldens(clusters):
    """Cluster dicts -> proposed golden rows (query from trigs, expected TBD)."""
    rows = []
    noise = 0
    for c in clusters:
        trigs = c.get("trigs", [])
        q = " ".join(trigs)
        if is_noise_query(q):
            noise += 1
            continue  # mash never reaches the human queue (D37)
        rows.append({"query": q, "expected": "TBD (human assigns)",
                     "count": c.get("count", 0)})
    return rows, noise


def main():
    clusters = router.propose()
    rows, noise = propose_goldens(clusters)
    date = datetime.now().date().isoformat()
    path = os.path.join(_ROOT, "reports", f"miss-goldens-{date}.md")
    L = [f"# Miss-mined golden proposals — {date}", "",
         f"_From {len(clusters)} abstention clusters in the live served log "
         f"({noise} mash/noise clusters filtered by the D37 noise gate). "
         "Expected skill is TBD: a human assigns it (G61 gate)._", ""]
    for r in rows:
        L.append(f"- `{r['query']}` -> {r['expected']} (x{r['count']})")
    if not rows:
        L.append("- none (no repeated abstentions — log is clean)")
    with open(path, "w", encoding="utf-8") as f:
        f.write("\n".join(L) + "\n")
    print(f"clusters={len(clusters)} proposals={len(rows)}")
    print(f"wrote {path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
