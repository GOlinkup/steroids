#!/usr/bin/env python3
"""
Steroids — Universal AI Skill Router & Accelerator.
Supports Antigravity, Claude Code, OpenCode, and Terminal CLI.
"""
import argparse
import hashlib
import json
import math
import os
import re
import subprocess
import sys
import time

STOP = set((
    "the a an and or for with use when your you your are our can all any via into over under "
    "this that these those from what how why not but its it is be to of in on at as by s t"
).split())

def get_base_dir():
    # Prefer ~/.config/steroids if it exists or fallback to opencode plugins
    candidate = os.path.expanduser("~/.config/steroids")
    if os.path.exists(candidate):
        return candidate
    return os.path.expanduser("~/.config/opencode/plugins/steroids")

BASE_DIR = get_base_dir()
RULES_PATH = os.path.join(BASE_DIR, "skill-rules.json")
CACHE_PATH = os.path.join(BASE_DIR, "skill-index.json")
MEM_PATH = os.path.join(BASE_DIR, "memory.json")
LOG_PATH = os.path.join(BASE_DIR, "served.jsonl")
PY2D_PATH = os.path.join(BASE_DIR, "steroids2d.py")

def stem(w):
    if len(w) > 5 and w.endswith("ies"):
        return w[:-3] + "y"
    if w.endswith(("ches", "shes", "sses", "xes", "zes", "oes")) and len(w) > 5:
        return w[:-2]
    if w.endswith("ing") and len(w) > 5:
        return w[:-3]
    if w.endswith("ed") and len(w) > 4 and not w.endswith("eed"):
        return w[:-2]
    if w.endswith("s") and not w.endswith(("ss", "us", "is")) and len(w) > 3:
        return w[:-1]
    return w

# ponytail: expand, don't replace; index+query normalize identically via toks().
SYN = {
    "k8s": ("kubernetes",), "go": ("golang",), "js": ("javascript",),
    "ts": ("typescript",), "py": ("python",), "db": ("database",),
    "s3": ("aws",), "gh": ("github",), "gql": ("graphql",), "pg": ("postgres",),
    "mongo": ("mongodb",), "tf": ("terraform",),
}

def toks(text):
    # ponytail: keep 2-char tech tokens (go/js/ts/ai/db/s3/ui/api); STOP filters noise.
    out = []
    for w in re.findall(r"[a-z][a-z0-9+#]{1,}", text.lower()):
        if w in STOP:
            continue
        s = stem(w)
        out.append(s)
        for extra in SYN.get(s, ()):
            if extra not in out:
                out.append(extra)
    return out

def extract_desc(head):
    m = re.search(r"^description:\s*(?:[>|]-?)?\s*\n((?:(?:\s{2,}|\t)[^\n]+\n?)+)", head, re.M)
    if m:
        return m.group(1).strip()
    m = re.search(r"^description:\s*(.+)$", head, re.M | re.I)
    if m:
        val = m.group(1).strip()
        if val not in (">", ">-", "|", "|-"):
            return val
    return ""

def extract_list(head, field):
    # ponytail: frontmatter `field:` only; inline/flow/multiline-list; lowercase slugs.
    m = re.search(r"^---\s*\n(.*?)\n---", head, re.S)
    fm = m.group(1) if m else head[:2000]
    m = re.search(r"^" + field + r":[ \t]*\[(.*?)\]", fm, re.M | re.S)
    if m:
        raw = m.group(1)
    else:
        m = re.search(r"^" + field + r":[ \t]*(.+)$", fm, re.M)
    if m:
        raw = m.group(1).strip()
    else:
        m = re.search(r"^" + field + r":[ \t]*$", fm, re.M)
        if not m:
            return []
        lines = re.findall(r"^\s*-\s*(.+)$", fm[m.end():], re.M)
        raw = ", ".join(lines[:8])
    out = []
    for part in re.split(r"[,;]", raw):
        slug = re.sub(r"[^a-z0-9]+", "-", part.strip().lower()).strip("-")
        if slug and slug not in out:
            out.append(slug)
    return out[:8]

def extract_needs(head):
    return extract_list(head, "needs")

def extract_proof(head):
    return extract_list(head, "proof")

NEEDS_CACHE_PATH = os.path.join(os.path.dirname(CACHE_PATH), "skill-needs.json")
PROOF_CACHE_PATH = os.path.join(os.path.dirname(CACHE_PATH), "skill-proof.json")

def _with_overlay(rules, field, found_map):
    # ponytail: committed overlay covers routing-winning twins that declare nothing.
    overlay = rules.get("needs_overlay" if field == "needs" else "proof_overlay") or {}
    for name, items in overlay.items():
        if isinstance(items, list) and items and name not in found_map:
            found_map[name] = [str(i) for i in items][:8]
    return found_map


def _scan_field(rules, field, cache_path, force_rebuild=False):
    # ponytail: shadowed names prefer the copy that declares the field.
    try:
        if not force_rebuild:
            with open(cache_path, encoding="utf-8") as f:
                cache = json.load(f)
            if isinstance(cache.get(field), dict):
                return _with_overlay(rules, field, cache[field])
    except Exception:
        pass
    parse = extract_proof if field == "proof" else extract_needs
    by_name = {}
    for name, md in skill_files_all(rules.get("index_dirs", [])):
        by_name.setdefault(name, []).append(md)
    found_map = {}
    for name, paths in by_name.items():
        for md in paths:
            try:
                with open(md, encoding="utf-8", errors="replace") as f:
                    head = f.read(8000)
            except OSError:
                continue
            found = parse(head)
            if found:
                found_map[name] = found
                break
    found_map = _with_overlay(rules, field, found_map)
    try:
        os.makedirs(os.path.dirname(cache_path), exist_ok=True)
        with open(cache_path, "w", encoding="utf-8") as f:
            json.dump({field: found_map}, f)
    except OSError:
        pass
    return found_map

def get_needs(rules, force_rebuild=False):
    # ponytail: sidecar cache; never touches the routing index.
    return _scan_field(rules, "needs", NEEDS_CACHE_PATH, force_rebuild)

def get_proof(rules, force_rebuild=False):
    return _scan_field(rules, "proof", PROOF_CACHE_PATH, force_rebuild)

def load_rules():
    default_rules = {
        "verified_only": True,
        "min_stars": 1000,
        "max_recommendations": 3,
        "index_dirs": [
            "~/.agents/skills",
            "~/.claude/skills",
            "~/.claude/.agents/skills",
            "~/.config/opencode/skills",
            "~/.gemini/antigravity-cli/builtin/skills",
            "~/.codex/skills",
            "~/claude-obsidian/skills",
            "~/flutter/.agents/skills",
            "./.agents/skills",
            "./.claude/skills",
            "./skills"
        ],
        "glue": ["onto", "main", "file", "files", "folder", "folders", "repo", "code", "thing", "stuff"],
        "skills": {
            "design-system": ["tokens", "palette", "typography", "spacing", "audit"],
            "frontend-patterns": ["ui", "layout", "theme", "component"],
            "dart-flutter-patterns": ["flutter", "dart", "widget"],
            "browser-qa": ["screenshot", "visual", "e2e"],
            "frontend-design-direction": ["hero", "landing", "branding"],
            "canvas": ["canvas", "obsidian", "mindmap", "spatial"],
            "code-review": ["review", "pr", "diff", "standards", "spec"],
            "resolving-merge-conflicts": ["merge", "conflict", "rebase"],
            "agy-customizations": ["antigravity", "agy", "customization", "hook", "rule", "plugin"],
            "antigravity-guide": ["antigravity", "agy", "guide", "cli"]
        }
    }
    if os.path.isfile(RULES_PATH):
        try:
            with open(RULES_PATH, encoding="utf-8") as f:
                rules = json.load(f)
                for k, v in default_rules.items():
                    if k not in rules:
                        rules[k] = v
                return rules
        except Exception:
            pass
    return default_rules

def skill_files_all(dirs):
    # ponytail: skill_files dedups by name; this keeps every copy for needs precedence.
    out = []
    for d in dirs:
        d = os.path.expanduser(d)
        if not os.path.isdir(d):
            continue
        try:
            for name in sorted(os.listdir(d)):
                md = os.path.join(d, name, "SKILL.md")
                if os.path.isfile(md):
                    out.append((name, md))
        except OSError:
            continue
    return out

def skill_files(dirs):
    out = []
    seen = set()
    for d in dirs:
        d = os.path.expanduser(d)
        if not os.path.isdir(d):
            continue
        try:
            for name in sorted(os.listdir(d)):
                md = os.path.join(d, name, "SKILL.md")
                if os.path.isfile(md):
                    if name not in seen:
                        seen.add(name)
                        out.append((name, md))
        except OSError:
            continue
    return out

def build_index(files):
    idx, mtimes, full = {}, {}, {}
    for name, md in files:
        try:
            mt = os.path.getmtime(md)
            with open(md, encoding="utf-8", errors="replace") as f:
                head = f.read(8000)
        except OSError:
            continue
        mtimes[md] = mt
        desc = extract_desc(head)
        full[name] = (toks(name.replace("-", " ").replace("_", " ")), toks(desc), toks(head))
    df = {}
    for nt, dt, ht in full.values():
        for k in set(nt + dt + ht):
            df[k] = df.get(k, 0) + 1
    for name, (nt, dt, ht) in full.items():
        keep, seen = [], set()
        for k in nt + dt + [t for t in ht if df.get(t, 0) <= 8]:
            if k not in seen:
                seen.add(k)
                keep.append(k)
        idx[name] = keep[:150]
    return idx, mtimes

def get_index(rules, force_rebuild=False):
    files = skill_files(rules.get("index_dirs", []))
    cur_mt = {}
    for _, md in files:
        try:
            cur_mt[md] = os.path.getmtime(md)
        except OSError:
            pass

    idx = None
    if not force_rebuild:
        try:
            with open(CACHE_PATH, encoding="utf-8") as f:
                cache = json.load(f)
            if cache.get("mtimes") == cur_mt:
                idx = cache.get("index")
        except Exception:
            idx = None

    if idx is None:
        idx, mtimes = build_index(files)
        try:
            os.makedirs(os.path.dirname(CACHE_PATH), exist_ok=True)
            with open(CACHE_PATH, "w", encoding="utf-8") as f:
                json.dump({"mtimes": mtimes, "index": idx}, f)
        except OSError:
            pass

    # Apply manual overrides from rules
    for skill, extra in rules.get("skills", {}).items():
        if skill in idx:
            extra_stemmed = [stem(w) for w in extra]
            idx[skill] = extra_stemmed + [k for k in idx[skill] if k not in extra_stemmed]

    return idx

# Skills where generic triggers must NOT win without a domain token.
# ponytail: kill the wireguard-on-mobile class of false positive with zero deps.
NEG = {
    "homelab-wireguard-vpn": ({"mobile", "app", "flutter", "payment", "build"}, {"vpn", "wireguard", "homelab", "vlan", "pihole"}),
    "homelab-network-setup": ({"mobile", "app", "flutter"}, {"homelab", "network", "vlan", "router", "switch"}),
    "homelab-vlan-segmentation": ({"mobile", "app"}, {"vlan", "segment"}),
    "homelab-pihole-dns": ({"mobile", "app"}, {"pihole", "dns", "blocklist"}),
}


from collections import Counter

_SEM_CACHE = {}


_EMB_MOD = None
_EMB_TRIED = False


def _emb():
    """File-path load of embed.py — works as repo module AND deployed binary."""
    global _EMB_MOD, _EMB_TRIED
    if _EMB_MOD is not None or _EMB_TRIED:
        return _EMB_MOD
    _EMB_TRIED = True
    try:
        import importlib.util
        _ep = os.path.join(os.path.dirname(os.path.abspath(__file__)), "embed.py")
        if not os.path.isfile(_ep):
            return None
        _spec = importlib.util.spec_from_file_location("steroids_embed", _ep)
        _EMB_MOD = importlib.util.module_from_spec(_spec)
        _spec.loader.exec_module(_EMB_MOD)
    except Exception:
        _EMB_MOD = None
    return _EMB_MOD


def _trigrams(tok):
    # ponytail: stdlib typo-robust signal; padded char-3-grams over one token.
    t = "#" + tok + "#"
    return [t[i:i + 3] for i in range(len(t) - 2)]


def _sem_profiles(idx):
    """Trigram Counters per skill, cached per index object (offline, stdlib)."""
    key = id(idx)
    hit = _SEM_CACHE.get(key)
    if hit is not None and hit[0] == len(idx):
        return hit[1]
    profs = {}
    for skill, keys in idx.items():
        c = Counter()
        for tok in keys:
            for tri in _trigrams(tok):
                c[tri] += 1
        profs[skill] = (c, sum(n * n for n in c.values()) ** 0.5)
    _SEM_CACHE.clear()
    _SEM_CACHE[key] = (len(idx), profs)
    return profs


def _trigram_cosine(qcounter, qnorm, sprof):
    scounter, snorm = sprof
    if not qnorm or not snorm:
        return 0.0
    dot = 0
    for tri, n in qcounter.items():
        m = scounter.get(tri)
        if m:
            dot += n * m
    return dot / (qnorm * snorm) if dot else 0.0


def rule_neg(rules):
    """Hardcoded NEG defaults + skill-rules.json overrides (stemmed)."""
    neg = {s: (set(b), set(g)) for s, (b, g) in NEG.items()}
    for skill, pair in (rules.get("neg") or {}).items():
        try:
            bad, good = pair
            neg[skill] = (set(stem(w) for w in bad), set(stem(w) for w in good))
        except (TypeError, ValueError):
            continue
    return neg


def learn(transcript_path):
    try:
        with open(MEM_PATH, encoding="utf-8") as f:
            mem = json.load(f)
    except Exception:
        mem = {}
    accepts, offsets = mem.get("accepts", {}), mem.get("offsets", {})
    if transcript_path and os.path.isfile(transcript_path):
        try:
            size = os.path.getsize(transcript_path)
            frm = offsets.get(transcript_path, 0)
            if frm > size:
                frm = 0
            start = max(frm, size - 200000)
            with open(transcript_path, "rb") as f:
                f.seek(start)
                chunk = f.read().decode("utf-8", "replace")
            found = re.findall(r'"name":\s*"Skill"[\s\S]{0,300}?"skill":\s*"([^"]+)"', chunk)
            # ponytail: fallback for tool-loop shapes without the Skill wrapper.
            if not found:
                found = re.findall(r'"skill":\s*"([a-z0-9][a-z0-9_-]{2,60})"', chunk)
            for s in found:
                accepts[s] = accepts.get(s, 0) + 1
            offsets[transcript_path] = size
            with open(MEM_PATH, "w", encoding="utf-8") as f:
                json.dump({"accepts": accepts, "offsets": offsets}, f)
        except OSError:
            pass
    return accepts

def _ed1_variants(tok):
    # ponytail: edit-distance-1 set for typo fix; len>=4 only, stdlib.
    v = set()
    for i in range(len(tok)):
        v.add(tok[:i] + tok[i+1:])  # delete
        if i < len(tok) - 1:
            v.add(tok[:i] + tok[i+1] + tok[i] + tok[i+2:])  # transpose
        for c in "abcdefghijklmnopqrstuvwxyz":
            v.add(tok[:i] + c + tok[i+1:])  # substitute
    for i in range(len(tok) + 1):
        for c in "abcdefghijklmnopqrstuvwxyz":
            v.add(tok[:i] + c + tok[i:])  # insert
    v.discard(tok)
    return v

def _typo_fix(ptoks, idx):
    # ponytail: fix only no-hit tokens len>=4 with exactly one vocab neighbor; else skip.
    vocab = set()
    for keys in idx.values():
        vocab.update(keys)
    fixed = set(ptoks)
    for t in ptoks:
        if len(t) < 4 or t in vocab:
            continue
        cands = sorted(_ed1_variants(t) & vocab)
        if len(cands) == 1:
            fixed.add(cands[0])
    return fixed

def route_query(prompt, rules, idx, accepts=None):
    if accepts is None:
        accepts = {}
    ptoks = set(toks(prompt))
    glue = set(rules.get("glue", []))
    ptoks = {t for t in ptoks if t not in glue}
    if not ptoks:
        return []
    ptoks = _typo_fix(ptoks, idx)

    df = {}
    for keys in idx.values():
        for k in set(keys) & ptoks:
            df[k] = df.get(k, 0) + 1

    scored = []
    neg = rule_neg(rules)
    sem_w = rules.get("semantic_weight", 0.0) or 0.0
    sprofiles = _sem_profiles(idx) if sem_w else None
    qcounter = qnorm = None
    if sprofiles:
        qcounter = Counter()
        for tok in ptoks:
            for tri in _trigrams(tok):
                qcounter[tri] += 1
        qnorm = sum(n * n for n in qcounter.values()) ** 0.5
    # ponytail: ONNX semantic signal; silent lexical fallback when unavailable.
    emb_w = rules.get("embed_weight", 0.0) or 0.0
    emb_vecs = qvec = None
    emb = _emb() if emb_w else None
    if emb is not None:
        try:
            # ponytail: descriptions read once per index; keyword fallback inside.
            global _DESC_MEM
            try:
                _DESC_MEM
            except NameError:
                _DESC_MEM = {}
            if _DESC_MEM.get("key") != id(idx):
                desc = {}
                for sname, md in skill_files(rules.get("index_dirs", [])):
                    if sname in idx and sname not in desc:
                        try:
                            with open(md, encoding="utf-8", errors="replace") as f:
                                desc[sname] = extract_desc(f.read(8000))
                        except OSError:
                            desc[sname] = ""
                _DESC_MEM.clear()
                _DESC_MEM["key"] = id(idx)
                _DESC_MEM["map"] = desc
            emb_vecs = emb.get_vectors(idx, emb.build_docs(rules, idx, _DESC_MEM["map"])) or None
            if emb_vecs:
                qvec = (emb.embed_texts([prompt]) or [None])[0]
        except Exception:
            emb_vecs = qvec = None
    emb_on = bool(emb_w and emb_vecs and qvec)
    if emb_on and rules.get("embed_defer_above"):
        # ponytail: when keywords speak clearly (strong top hit = keyword
        # dump), skip semantics for this query; consult them only when
        # lexical evidence is uncertain. Protects excludes on dense rows.
        top_hit = 0.0
        for skill, keys in idx.items():
            hits = sorted(set(keys) & ptoks)
            if not hits:
                continue
            if skill in neg:
                bad, good = neg[skill]
                if not (set(hits) & good) and (set(hits) & bad):
                    continue
            namehits = len(set(toks(skill.replace("-", " ").replace("_", " "))) & ptoks)
            s = round(sum(1.0 / df[h] for h in hits) + min(1.5, 1.0 * namehits)
                      + min(1.0, 0.2 * accepts.get(skill, 0)), 3)
            if s > top_hit:
                top_hit = s
        if top_hit >= rules["embed_defer_above"]:
            emb_on = False
    for skill, keys in idx.items():
        hits = sorted(set(keys) & ptoks)
        if hits:
            # ponytail: generic trigger without domain token = skip (kills vpn-on-mobile).
            if skill in neg:
                bad, good = neg[skill]
                if not (set(hits) & good) and (set(hits) & bad):
                    continue
            namehits = len(set(toks(skill.replace("-", " ").replace("_", " "))) & ptoks)
            bonus = min(1.5, 1.0 * namehits) + min(1.0, 0.2 * accepts.get(skill, 0))
            score = round(sum(1.0 / df[h] for h in hits) + bonus, 3)
        elif sem_w or emb_on:
            score = 0.0
        else:
            continue
        if sem_w:
            score = round(score + sem_w * _trigram_cosine(qcounter, qnorm, sprofiles[skill]), 3)
        if emb_on:
            vec = emb_vecs.get(skill)
            # ponytail: rerank hit skills only. Measured: no-hit emb never
            # cracks top-3 on 165 eval queries (trigram stays the no-hit
            # path); gating to hits kills a whole failure class for free.
            if hits and vec is not None:
                score = round(score + emb_w * emb.cosine(qvec, vec), 3)
        if (sem_w or emb_on) and score <= 0:
            continue
        if hits or sem_w or emb_on:
            scored.append((score, skill, hits))

    scored.sort(key=lambda t: (-t[0], -len(t[2]), t[1]))
    # ponytail: abstain on pure-trigram noise; no lexical hit = no recommendation.
    if scored and not any(h for _, _, h in scored):
        return []
    top = scored[:rules.get("max_recommendations", 3)]
    return top

def log_impression(prompt, trigs, skills):
    try:
        os.makedirs(os.path.dirname(LOG_PATH), exist_ok=True)
        q = hashlib.sha1(prompt.encode()).hexdigest()[:12]
        now = int(time.time())
        # ponytail: dedup double-fire; same query within 10s = skip.
        try:
            with open(LOG_PATH, "rb") as f:
                f.seek(max(0, os.path.getsize(LOG_PATH) - 4096))
                tail = f.read().decode("utf-8", "replace")
                for line in reversed(tail.strip().split("\n")):
                    try:
                        o = json.loads(line)
                        if o.get("q") == q and now - int(o.get("t", 0)) < 10:
                            return
                        break
                    except Exception:
                        continue
        except OSError:
            pass
        with open(LOG_PATH, "a", encoding="utf-8") as f:
            f.write(json.dumps({
                "t": now,
                "q": q,
                "trigs": trigs,
                "skills": skills
            }) + "\n")
        # ponytail: cap log at 5000 rows; size-gated so the check is ~free.
        try:
            if os.path.getsize(LOG_PATH) > 512000:
                with open(LOG_PATH, encoding="utf-8") as f:
                    rows = f.readlines()
                if len(rows) > 5000:
                    with open(LOG_PATH, "w", encoding="utf-8") as f:
                        f.writelines(rows[-5000:])
        except OSError:
            pass
    except Exception:
        pass

def extract_prompt_from_transcript(tp):
    if not tp or not os.path.isfile(tp):
        return None
    last_prompt = None
    try:
        with open(tp, "r", encoding="utf-8", errors="replace") as f:
            for line in f:
                if "USER_INPUT" in line:
                    try:
                        obj = json.loads(line)
                        if obj.get("type") == "USER_INPUT":
                            c = obj.get("content", "")
                            m = re.search(r"<USER_REQUEST>\s*(.*?)\s*</USER_REQUEST>", c, re.DOTALL)
                            last_prompt = m.group(1).strip() if m else c.strip()
                    except Exception:
                        pass
    except Exception:
        pass
    return last_prompt

def extract_urls(prompt):
    # ponytail: http(s) only; bare domains stay out (precision over recall).
    found = re.findall(r"https?://[^\s) '\"<>]+", prompt)
    return list(dict.fromkeys(u.rstrip(".,;:!?") for u in found))[:5]

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
    except Exception:
        return None

SHELL_MARKERS = ("loading", "enable javascript", "just a moment",
                 "checking your browser", "cloudflare", "nreum", "__next_f")

def looks_like_shell(text):
    # ponytail: >=2 JS-shell markers in the head = bot-wall/SPA shell, not content.
    head = (text or "")[:2000].lower()
    return sum(1 for m in SHELL_MARKERS if m in head) >= 2

def resolve_mcp(need, rules):
    # ponytail: static map only; execution stays agent-side (no MCP client in stdlib).
    entry = (rules.get("mcp_needs") or {}).get(need)
    if isinstance(entry, dict) and entry.get("server"):
        return {"kind": "mcp", "server": entry["server"], "tool": entry.get("tool", "")}
    return None

def gather(prompt, rules, idx, needs=None, proof=None, accepts=None, seen_evidence=None):
    # ponytail: route -> needs -> MCP-first, fetch-second, browser-third, ask-last.
    top = route_query(prompt, rules, idx, accepts)
    needs = get_needs(rules) if needs is None else needs
    proof = get_proof(rules) if proof is None else proof
    urls = extract_urls(prompt)
    evidence, unfetched, seen = {}, [], 0
    min_chars = rules.get("min_evidence_chars", 200)
    for u in urls:
        text = fetch_text(u)
        if text and len(text) >= min_chars and not looks_like_shell(text):
            evidence[u] = text
            seen += 1
        else:
            unfetched.append(u)
        if seen >= 3:
            break
    browser = (rules.get("browser_fallback") or {}).get("server", "playwright")
    out_needs = {}
    out_proof = {}
    gate = {}
    routes = {}
    missing = []
    for _, skill, _ in top:
        checks = proof.get(skill, [])
        if checks:
            out_proof[skill] = checks
        reqs = needs.get(skill, [])
        if reqs:
            out_needs[skill] = reqs
            red = []
            for r in reqs:
                if r in routes:
                    if routes[r]["kind"] == "ask" and r not in red:
                        red.append(r)
                    continue
                hit = resolve_mcp(r, rules)
                if hit:
                    routes[r] = hit
                elif evidence or seen_evidence:
                    routes[r] = {"kind": "fetch", "server": "", "tool": ""}
                elif urls:
                    routes[r] = {"kind": "browser", "server": browser, "tool": ""}
                else:
                    routes[r] = {"kind": "ask", "server": "", "tool": ""}
                    red.append(r)
                    if r not in missing:
                        missing.append(r)
            gate[skill] = ("blocked:" + ",".join(red)) if red else "ready"
        else:
            gate[skill] = "ready"
    # ponytail: fetch/browser routes with zero evidence are actionable but ungrounded.
    grounded = evidence or seen_evidence
    unbacked = sorted(r for r, h in routes.items()
                      if h["kind"] in ("fetch", "browser") and not grounded)
    return {
        "skills": [s for _, s, _ in top],
        "needs": out_needs,
        "proof": out_proof,
        "gate": gate,
        "routes": routes,
        "evidence": evidence,
        "unfetched": unfetched,
        "missing": missing[:5],
        "unbacked": unbacked[:5],
    }

def chain(plan, rules, idx, needs=None, proof=None, accepts=None):
    # ponytail: "step one > step two"; later steps inherit earlier evidence; go only when every step ready.
    steps = [s.strip() for s in plan.split(">")]
    out, carried, cum_missing, cum_unbacked = [], {}, [], []
    for s in steps:
        if not s:
            continue
        g = gather(s, rules, idx, needs, proof, accepts, seen_evidence=carried) | {"step": s}
        out.append(g)
        carried = {**carried, **g["evidence"]}
        for m in g["missing"]:
            if m not in cum_missing:
                cum_missing.append(m)
        for u in g.get("unbacked", []):
            if u not in cum_unbacked:
                cum_unbacked.append(u)
    blocked = next((i for i, g in enumerate(out)
                    if any(v != "ready" for v in g["gate"].values())), None)
    return {"steps": out, "evidence": carried, "missing": cum_missing[:5],
            "unbacked": cum_unbacked[:5],
            "verdict": "go" if blocked is None else f"blocked at step {blocked + 1}"}

DRAFTS_DIR = os.path.join(os.path.expanduser("~"), "steroids", "drafts")

def draft_skill(name, trigs, rules, idx, accepts=None):
    # ponytail: template + nearest-skills references; writes drafts/ which no index_dir covers.
    slug = re.sub(r"[^a-z0-9]+", "-", name.strip().lower()).strip("-")
    if not slug or len(slug) > 60:
        return {"ok": False, "error": "bad name"}
    clean = [re.sub(r"[^a-z0-9+#]+", "", t.strip().lower()) for t in trigs]
    clean = [t for t in clean if t][:6]
    if not clean:
        return {"ok": False, "error": "no trigger words"}
    near = [s for _, s, _ in route_query(" ".join(clean), rules, idx, accepts)][:3]
    title = " ".join(w.capitalize() for w in slug.split("-"))
    body = (
        "---\n"
        f"name: {slug}\n"
        f"description: Handle tasks about {', '.join(clean)}. (Draft — human must verify.)\n"
        "needs: []\n"
        "proof: []\n"
        "status: draft\n"
        "---\n\n"
        f"# {title}\n\n"
        f"Draft proposed from {len(clean)} repeated unmet trigger(s): {', '.join(clean)}.\n\n"
        "## When to use\n\n"
        f"Use when the task involves {', '.join(clean)} and no indexed skill fires.\n\n"
        "## References\n\n"
        + ("".join(f"- See also: `{s}`\n" for s in near) or "- (no nearby skills found)\n")
        + "\n## Approve\n\n"
        "Human: verify, fill needs/proof, move to `skills/` and commit. Drafts never index.\n"
    )
    dest = os.path.join(DRAFTS_DIR, slug, "SKILL.md")
    try:
        os.makedirs(os.path.dirname(dest), exist_ok=True)
        if os.path.exists(dest):
            return {"ok": False, "error": "draft exists", "path": dest}
        with open(dest, "w", encoding="utf-8") as f:
            f.write(body)
    except OSError as e:
        return {"ok": False, "error": str(e)}
    return {"ok": True, "path": dest, "nearby": near}

def open_canvas():
    if os.path.isfile(PY2D_PATH):
        try:
            subprocess.Popen(["python3", PY2D_PATH], start_new_session=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            print("[Steroids] Floating 2D canvas launched.")
        except Exception as e:
            print(f"[Steroids] Failed to launch 2D canvas: {e}", file=sys.stderr)
    else:
        print(f"[Steroids] Canvas script not found at {PY2D_PATH}", file=sys.stderr)

def main():
    parser = argparse.ArgumentParser(
        description="Steroids — Universal AI Skill Router & Accelerator for Antigravity, Claude Code, OpenCode, and CLI."
    )
    parser.add_argument("prompt", nargs="*", help="Task prompt or query keywords to match skills for")
    parser.add_argument("-u", "--ui", "--canvas", dest="canvas", action="store_true", help="Launch floating 2D Steroids canvas")
    parser.add_argument("-c", "--count", action="store_true", help="Show total number of indexed skills")
    parser.add_argument("-l", "--list", action="store_true", help="List all indexed skill names")
    parser.add_argument("-i", "--reindex", action="store_true", help="Force re-indexing of all skill directories")
    parser.add_argument("--json", action="store_true", help="Output recommendation in JSON format")
    parser.add_argument("--antigravity-hook", action="store_true", help="Run in Antigravity PreInvocation hook mode")
    parser.add_argument("--claude-hook", action="store_true", help="Run in Claude Code UserPromptSubmit hook mode")
    parser.add_argument("--export", default=None, help="Output path for `graph --export out.json`")
    parser.add_argument("--gather", action="store_true", help="Route plus fetch linked evidence and report unmet needs as JSON")
    parser.add_argument("--propose", action="store_true", help="Mine abstained prompts (hash-only) into draft skill proposals for humans")
    parser.add_argument("--chain", default=None, help='Two-step plan "step one > step two": gather each, verdict go or blocked-at-N')

    args, unknown = parser.parse_known_args()

    if args.canvas:
        open_canvas()
        return

    rules = load_rules()
    idx = get_index(rules, force_rebuild=args.reindex)

    if args.chain:
        print(json.dumps(chain(args.chain, rules, idx)))
        return

    if args.propose:
        print(json.dumps(propose()))
        return

    if args.prompt and args.prompt[0] == "draft":
        # ponytail: `steroids draft <slug> <trig>...`; human gate stays shut by default.
        if len(args.prompt) < 3:
            print(json.dumps({"ok": False, "error": "usage: steroids draft <slug> <trig>..."}))
            return
        print(json.dumps(draft_skill(args.prompt[1], args.prompt[2:], rules, idx)))
        return

    if args.count:
        print(f"Indexed skills: {len(idx)}")
        return

    if args.list:
        print(f"Indexed skills ({len(idx)} total):")
        for s in sorted(idx.keys()):
            print(f"  - {s}")
        return

    if args.prompt and args.prompt[0] == "graph":
        # ponytail: file-path load — works as repo module AND deployed binary.
        import importlib.util
        _gx = os.path.join(os.path.dirname(os.path.abspath(__file__)), "graph_export.py")
        _spec = importlib.util.spec_from_file_location("steroids_graph_export", _gx)
        _mod = importlib.util.module_from_spec(_spec)
        _spec.loader.exec_module(_mod)
        g = _mod.build_graph(idx)
        if args.export:
            d = os.path.dirname(args.export)
            if d:
                os.makedirs(d, exist_ok=True)
            with open(args.export, "w", encoding="utf-8") as f:
                json.dump(g, f)
            print(f"{args.export}: {len(g['nodes'])} nodes, {len(g['links'])} links")
        else:
            print(f"{len(g['nodes'])} nodes, {len(g['links'])} links")
        return

    # Check for stdin input if prompt args were not provided or if hook flag passed
    stdin_data = ""
    if not sys.stdin.isatty():
        try:
            stdin_data = sys.stdin.read()
        except Exception:
            stdin_data = ""

    parsed_json = None
    if stdin_data.strip().startswith("{"):
        try:
            parsed_json = json.loads(stdin_data)
        except Exception:
            parsed_json = None

    is_antigravity = args.antigravity_hook or (
        isinstance(parsed_json, dict) and ("transcriptPath" in parsed_json or "conversationId" in parsed_json) and ("prompt" not in parsed_json)
    )

    prompt = ""
    tp = None
    if args.prompt:
        prompt = " ".join(args.prompt)
    elif isinstance(parsed_json, dict):
        if is_antigravity:
            tp = parsed_json.get("transcriptPath")
            # Only suggest skills on the initial invocation for a user turn
            inv_num = parsed_json.get("invocationNum", 1)
            if inv_num > 1:
                # Subsequent tool-loop turns: do not repeat suggestions
                print(json.dumps({}))
                return
            prompt = extract_prompt_from_transcript(tp) or ""
        else:
            prompt = parsed_json.get("prompt", "")
            tp = parsed_json.get("transcript_path")
    elif stdin_data:
        prompt = stdin_data.strip()

    if not prompt:
        if is_antigravity:
            print(json.dumps({}))
            return
        if sys.stdin.isatty() and not args.reindex:
            parser.print_help()
        return

    accepts = learn(tp)
    if args.chain:
        print(json.dumps(chain(args.chain, rules, idx, accepts=accepts)))
        return
    if args.gather:
        print(json.dumps(gather(prompt, rules, idx, accepts=accepts)))
        return
    top = route_query(prompt, rules, idx, accepts)

    if top:
        names = "/".join(s for _, s, _ in top)
        trigs = ",".join(sorted({h for _, _, hs in top for h in hs})[:4])
        log_impression(prompt, trigs, names)

        hint = f"Possibly relevant skills (load what applies, skip rest): {trigs} -> {names}"
        if is_antigravity:
            print(json.dumps({
                "injectSteps": [
                    {
                        "ephemeralMessage": f"[Steroids] {hint}"
                    }
                ]
            }))
        elif args.json:
            print(json.dumps({
                "triggers": trigs.split(","),
                "skills": [s for _, s, _ in top],
                "hint": hint
            }))
        else:
            print(hint)
    else:
        # ponytail: log abstentions too (attempted trigs, hash only) — propose mines these.
        attempted = ",".join(sorted(set(toks(prompt)) - set(rules.get("glue", [])))[:6])
        log_impression(prompt, attempted, "")
        if is_antigravity:
            print(json.dumps({}))
        elif args.json:
            print(json.dumps({"triggers": [], "skills": [], "hint": ""}))

def propose(log_path=None, min_count=2):
    # ponytail: hash-only input; clusters share >=2 attempted trigs; output is a draft for humans.
    log_path = log_path or LOG_PATH
    try:
        with open(log_path, encoding="utf-8") as f:
            rows = [json.loads(l) for l in f if l.strip()]
    except OSError:
        return []
    unmet = [r for r in rows if not r.get("skills")]
    groups = {}
    for r in unmet:
        key = frozenset(t for t in (r.get("trigs") or "").split(",") if t)
        if len(key) < 2:
            continue
        groups.setdefault(key, []).append(r["q"])
    out = []
    for trigs, hashes in groups.items():
        if len(hashes) < min_count:
            continue
        names = sorted(trigs)
        out.append({
            "count": len(hashes),
            "trigs": names,
            "suggested_name": "-".join(names[:3]),
            "suggested_description": "Handle tasks about " + ", ".join(names) + ". (Draft — human must verify.)",
        })
    out.sort(key=lambda p: -p["count"])
    return out[:10]

if __name__ == "__main__":
    main()
