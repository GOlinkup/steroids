#!/usr/bin/env python3
"""st-10 data-wire: served-log counts -> steroids-town/snapshot.json.

One command:  python3 export-snapshot.py [served-log-path]
Reads the served log (default: live LOG_PATH — pass a /tmp copy for probes),
the live 1265-skill index, and memory.json accepts; writes snapshot.json
beside this script. Stdlib only. Sael pattern: the page reads live counts
first, dated snapshot is the baked fallback (see "fallback" key).
"""
import importlib.util
import json
import os
import subprocess
import sys
from datetime import datetime

_HERE = os.path.dirname(os.path.abspath(__file__))
_STEROIDS = "/home/TWIG/steroids"
_ROUTER = os.path.join(_STEROIDS, "src", "steroids", "router.py")

_spec = importlib.util.spec_from_file_location("steroids_router_snap", _ROUTER)
router = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(router)

# 12 domains, first-match wins on whole hyphen/underscore tokens.
DOMAINS = [
    ("frontend", {"react", "vue", "angular", "svelte", "nextjs", "nuxt",
                  "frontend", "tailwind", "mui", "shadcn", "css", "vite",
                  "pwa", "uidesign", "webdesign", "web", "accessibility",
                  "browser", "chrome", "extension", "astro", "components",
                  "avalonia", "ui", "typescript", "javascript"}),
    ("mobile", {"mobile", "ios", "android", "flutter", "dart", "expo",
                "swift", "kotlin", "xcode", "playstore", "appstore"}),
    ("backend", {"backend", "django", "fastapi", "flask", "rails", "laravel",
                 "spring", "quarkus", "nestjs", "nodejs", "express", "hono",
                 "ktor", "dotnet", "golang", "rust", "java", "python",
                 "php", "ruby", "elixir", "scala", "csharp", "fsharp",
                 "celery", "prisma", "drizzle", "sqlalchemy", "jpa",
                 "microservices", "serverless", "graphql", "rest", "api",
                 "integration", "architecture", "architect",
                 "development", "code", "best", "practices", "standards",
                 "bullmq", "bun", "convex", "runtime", "contract", "domain",
                 "feature", "pb", "pocketbase"}),
    ("data", {"data", "database", "sql", "postgres", "mysql", "redis",
              "clickhouse", "neon", "bigquery", "alloydb", "etl", "dbt",
              "airflow", "spark", "pandas", "polars", "warehouse", "migrations",
              "search", "analysis", "crawl", "scraper", "scraping", "pdf",
              "pptx", "docx", "doc"}),
    ("ai-ml", {"ai", "llm", "rag", "agent", "agents", "prompt", "embedding",
               "vector", "ml", "mlops", "pytorch", "tensorflow", "sklearn",
               "scikit", "training", "transformer", "diffusion", "whisper",
               "openai", "anthropic", "gemini", "deepseek", "qwen", "mistral",
               "tokenizer", "onnx", "cuda", "vllm", "sglang", "finetune",
               "lora", "rlhf", "dpo", "benchmark", "research", "evaluation",
               "emerging", "techniques", "model", "context", "agentic",
               "autonomous", "autoresearch", "memory", "conversation",
               "learning", "multimodal", "optimization", "optimizer",
               "tuning", "fine", "eval", "interpretability", "mechanistic",
               "safety", "alignment", "orch", "harness", "loop"}),
    ("devops", {"devops", "docker", "kubernetes", "k8s", "terraform", "helm",
                "argocd", "gitops", "cicd", "actions", "deploy", "vercel",
                "netlify", "railway", "cloudflare", "aws", "gcp", "azure",
                "cloud", "linux", "bash", "ssh", "nginx", "sre", "incident",
                "monitoring", "observability", "opentofu", "pulumi", "ops",
                "automation", "workflow", "n8n", "github", "git", "commit",
                "mcp", "network", "canary", "watch", "config", "configure",
                "windows", "homelab", "infrastructure", "pr", "plugin"}),
    ("security", {"security", "auth", "pentest", "exploit", "vulnerability",
                  "hack", "threat", "owasp", "csrf", "xss", "injection",
                  "secrets", "soc2", "iso27001", "hipaa", "compliance",
                  "redteam", "burp", "metasploit", "nmap", "wireshark",
                  "attacks", "authentication"}),
    ("testing", {"testing", "test", "tests", "e2e", "playwright", "cypress",
                 "jest", "vitest", "pytest", "tdd", "qa", "coverage",
                 "mock", "mockk", "kotest", "xctest", "espresso", "detox",
                 "review", "quality", "performance"}),
    ("design-media", {"design", "figma", "brand", "theme", "art", "canvas",
                      "video", "image", "audio", "game", "games", "meme",
                      "slide", "marp", "portfolio", "three", "blender",
                      "motion", "animation", "svg", "d3"}),
    ("business", {"business", "marketing", "sales", "product", "startup",
                  "mvp", "launch", "investor", "pitch", "seo", "ads",
                  "analytics",                   "finance", "billing", "stripe", "pricing",
                  "career", "resume", "interview", "freelance", "agency",
                  "cro", "content", "curviate", "email", "management",
                  "planning", "doordash", "app", "ceo", "advisor", "officer",
                  "competitive", "competitor", "connections", "copy",
                  "copywriting", "letter", "cost", "counterparty", "team",
                  "meeting", "communication", "slack", "plans", "spec"}),
    ("docs-writing", {"writing", "docs", "documentation", "readme", "blog",
                      "academic", "paper", "latex", "citation", "writing",
                      "wiki", "guide", "skill", "claude", "codex", "cursor",
                      "opencode", "antigravity", "changelog", "command",
                      "notion", "obsidian", "builder", "creator", "official"}),
    ("science", {"scientific", "bio", "chem", "physic", "quantum", "gene",
                 "genomic", "protein", "drug", "clinic", "trial", "lab",
                 "fda", "astropy", "biopython", "rdkit", "pymol", "catalyst",
                 "biomni", "bioservices", "anndata", "brenda", "chembl",
                 "pubchem", "clinvar", "cellxgene", "arboreto", "adaptyv",
                 "benchling", "opentrons", "neuro"}),
]
CATCHALL = "general"

# Exact-name overrides for first-match collisions (documented, review on change).
EXCEPTIONS = {
    "claude-api": "ai-ml",  # 'api' would pull it to backend; it's the Anthropic API
}


def domain_of(name):
    if name in EXCEPTIONS:
        return EXCEPTIONS[name]
    toks = set(name.lower().replace("_", "-").split("-"))
    for dom, keys in DOMAINS:
        if toks & keys:
            return dom
    return CATCHALL


def main(argv):
    log_path = argv[0] if argv else router.LOG_PATH
    with open(log_path, encoding="utf-8") as f:
        rows = [json.loads(l) for l in f if l.strip()]
    with open(os.path.join(_STEROIDS, "skill-rules.json"), encoding="utf-8") as f:
        rules = json.load(f)
    files = router.skill_files(rules.get("index_dirs", []))
    idx, _ = router.build_index(files)
    sizes = {}
    for sname, md in files:
        if sname in idx and sname not in sizes:
            try:
                sizes[sname] = os.path.getsize(md) // 4
            except OSError:
                sizes[sname] = 0
    index_tokens = sum(sizes.values())
    try:
        mem = json.load(open(os.path.expanduser("~/.config/steroids/memory.json"),
                             encoding="utf-8"))
    except OSError:
        mem = {}
    accepts = mem.get("accepts", {}) if isinstance(mem, dict) else {}

    doms = {d[0]: {"skills": 0, "routes": 0, "tokens_saved": 0,
                   "learns": 0, "corrections": 0}
            for d in DOMAINS}
    doms[CATCHALL] = {"skills": 0, "routes": 0, "tokens_saved": 0,
                      "learns": 0, "corrections": 0}
    skill_domain = {}
    for s in idx:
        d = domain_of(s)
        skill_domain[s] = d
        doms[d]["skills"] += 1
    for skill, n in accepts.items():
        if isinstance(skill, str) and isinstance(n, int):
            doms[domain_of(skill)]["learns"] += n
    totals = {"routes": 0, "hits": 0, "abstentions": 0, "tokens_saved": 0,
              "corrections": 0}
    per_day = {}  # iso-day -> {domain -> routed rows} (st-20 trend series)
    for r in rows:
        totals["routes"] += 1
        try:
            day = datetime.fromtimestamp(r.get("t", 0)).date().isoformat()
        except (TypeError, ValueError, OSError):
            day = None
        top = (r.get("skills") or "").split("/")[0]
        if r.get("correction"):
            totals["corrections"] += 1
            if top:
                d = skill_domain.get(top)
                if d:
                    doms[d]["corrections"] += 1
        if not top:
            totals["abstentions"] += 1
            continue
        totals["hits"] += 1
        saved = max(index_tokens - sizes.get(top, 0), 0)
        totals["tokens_saved"] += saved
        d = skill_domain.get(top)
        if d:
            doms[d]["routes"] += 1
            doms[d]["tokens_saved"] += saved
            if day:
                per_day.setdefault(day, {}).setdefault(d, 0)
                per_day[day][d] += 1
    try:
        commit = subprocess.run(["git", "rev-parse", "HEAD"], cwd=_STEROIDS,
                                capture_output=True, text=True).stdout.strip()
    except Exception:
        commit = "unknown"
    for v in doms.values():
        v["depth"] = v["routes"] + 3 * v["learns"] + 2 * v["corrections"]
    snap = {
        "generated_at": datetime.now().date().isoformat(),
        "commit": commit,
        "index_size": len(idx),
        "fallback": "live-then-snapshot",
        "depth_formula": ("depth = routes + 3*learns + 2*corrections: routed "
                          "volume plus learning weight (accepts map to domains "
                          "via domain_of; correction rows likewise). "
                          "fails-fixed excluded: no per-domain origin data."),
        "fails_fixed": None,
        "fails_fixed_source": ("unmeasured, not zero: STORIES.md ticks are "
                               "lane-shared prose with no per-domain fail "
                               "attribution, and the served log carries no "
                               "fail rows."),
        "usage": ("Page reads live served counts first; this dated file is "
                  "the baked fallback when live is unreachable (Sael pattern). "
                  "Regenerate: python3 export-snapshot.py [served-log-path]."),
        "totals": {**totals,
                   "learned_skills": len(accepts),
                   "learned_accepts": sum(accepts.values()) if accepts else 0,
                   "misses_turned_skills": 0},
        "notes": ("misses_turned_skills=0: the only mined proposals to date "
                  "were both REJECTed (keyboard mash, gibberish); no G61 "
                  "adoption yet. learned_* from closed-loop accepts in "
                  "memory.json."),
        "domains": [{"name": n, **v} for n, v in doms.items()],
    }
    out = os.path.join(_HERE, "snapshot.json")
    with open(out, "w", encoding="utf-8") as f:
        json.dump(snap, f, indent=1)
    print(f"routes={totals['routes']} hits={totals['hits']} "
          f"abst={totals['abstentions']} saved={totals['tokens_saved']} "
          f"corr={totals['corrections']} learned={len(accepts)}")
    print(f"general-bucket skills={doms[CATCHALL]['skills']}")
    print(f"wrote {out}")
    days = sorted(per_day)
    trends = {
        "generated_at": snap["generated_at"],
        "days": days,
        "usage": ("daily[i] = routed-skill rows for that domain on days[i]; "
                  "feeds the card sparkline via town-data.js."),
        "domains": [{"name": n, "daily": [per_day[d].get(n, 0) for d in days]}
                    for n, _ in list(DOMAINS) + [(CATCHALL, None)]],
    }
    tout = os.path.join(_HERE, "trends.json")
    with open(tout, "w", encoding="utf-8") as f:
        json.dump(trends, f, indent=1)
    print(f"wrote {tout} days={len(days)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
