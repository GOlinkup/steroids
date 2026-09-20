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

def toks(text):
    return [stem(w) for w in re.findall(r"[a-z][a-z0-9+#]{2,}", text.lower()) if w not in STOP]

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
            for s in re.findall(r'"name":\s*"Skill"[\s\S]{0,300}?"skill":\s*"([^"]+)"', chunk):
                accepts[s] = accepts.get(s, 0) + 1
            offsets[transcript_path] = size
            with open(MEM_PATH, "w", encoding="utf-8") as f:
                json.dump({"accepts": accepts, "offsets": offsets}, f)
        except OSError:
            pass
    return accepts

def route_query(prompt, rules, idx, accepts=None):
    if accepts is None:
        accepts = {}
    ptoks = set(toks(prompt))
    glue = set(rules.get("glue", []))
    ptoks = {t for t in ptoks if t not in glue}
    if not ptoks:
        return []

    df = {}
    for keys in idx.values():
        for k in set(keys) & ptoks:
            df[k] = df.get(k, 0) + 1

    scored = []
    neg = rule_neg(rules)
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
            scored.append((score, skill, hits))

    scored.sort(key=lambda t: (-t[0], -len(t[2]), t[1]))
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

    args, unknown = parser.parse_known_args()

    if args.canvas:
        open_canvas()
        return

    rules = load_rules()
    idx = get_index(rules, force_rebuild=args.reindex)

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
        if is_antigravity:
            print(json.dumps({}))
        elif args.json:
            print(json.dumps({"triggers": [], "skills": [], "hint": ""}))

if __name__ == "__main__":
    main()
