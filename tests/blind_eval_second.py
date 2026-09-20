#!/usr/bin/env python3
"""Blind eval, SECOND set: 100+ stranger queries vs the live 366-skill index.

Labeled honestly: team-second-best, human-prompts bonus round comes later.
Style is DELIBERATELY inverted vs tests/blind_eval_100.py (which uses
paraphrase/synonyms/how-do-I): this set uses short imperatives, terse
fragments, filler-word typos (pls, teh, ur), and non-native phrasing
("please help me", "I want make"). Keywords stay intact — the inversion
is in phrasing habits, not in hiding the topic.
Each row: (query, expected, acceptable, excludes).
  P@1 = top-1 == expected (strict).
  P@3 = (expected or acceptable in top-3) AND no excluded in top-3.
  leaks = rows with an excluded skill in top-3.
  MRR = mean 1/rank of first relevant (expected or acceptable) in top-3.
  MAP = mean average-precision over relevant set {expected}+acceptable @3.
Run: python3 tests/blind_eval_second.py
"""
import importlib.util
import json
import os

_HERE = os.path.dirname(os.path.abspath(__file__))
_ROUTER_PATH = os.path.normpath(os.path.join(_HERE, "..", "src", "steroids", "router.py"))
_RULES_PATH = os.path.normpath(os.path.join(_HERE, "..", "skill-rules.json"))

_spec = importlib.util.spec_from_file_location("steroids_router_blind2", _ROUTER_PATH)
router = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(router)

GOLDEN2 = [
    ("make my app usable for blind users pls", "accessibility", ["frontend-a11y"], []),
    ("fix slow clickhouse query, billions rows", "clickhouse-io", [], []),
    ("optmize endpoint, try variants, measure winner", "benchmark-optimization-loop", ["benchmark"], []),
    ("is bun faster than node? measure both pls", "benchmark", ["benchmark-optimization-loop"], []),
    ("setup precommit hooks husky lint-staged now", "setup-pre-commit", [], []),
    ("teach me pagination, I am new here", "teach", [], []),
    ("grill my plan hard, find holes", "grilling", ["grill-me"], []),
    ("make flutter list stop jank on scroll", "flutter-dart-code-review", ["dart-flutter-patterns"], []),
    ("build flutter app with payments, help", "dart-flutter-patterns", [], []),
    ("fix merge conflict markers rebase branch", "resolving-merge-conflicts", [], []),
    ("review my PR, check standards", "code-review", [], []),
    ("tour me through auth code in repo", "code-tour", [], []),
    ("I just joined team, map codebase for me", "codebase-onboarding", [], []),
    ("where should seam go in this module", "codebase-design", [], []),
    ("my AI edit made file worse? check", "codehealth-mcp", [], []),
    ("be blunt about my naming habits", "coding-standards", [], []),
    ("deploy check: is prod healthy right now", "canary-watch", [], []),
    ("click my app flows, verify they work", "browser-qa", ["ui-demo"], ["e2e-testing"]),
    ("record demo video of my web app", "ui-demo", [], []),
    ("my e2e flakes in CI, fix it", "e2e-testing", [], []),
    ("write pytest tests with mocks fixtures", "python-testing", [], []),
    ("my gtest suite flakes, stabilize pls", "cpp-testing", [], []),
    ("review my C++ for safe idioms", "cpp-coding-standards", [], []),
    ("write xunit mocks integration tests dotnet", "csharp-testing", [], []),
    ("write rust tests, unit and integration", "rust-testing", [], []),
    ("review my rust ownership lifetimes", "rust-patterns", [], []),
    ("review my go code, idioms please", "golang-patterns", [], []),
    ("write go table-driven tests", "golang-testing", [], []),
    ("review my kotlin coroutines flow code", "kotlin-coroutines-flows", ["kotlin-patterns"], []),
    ("write kotest mockk tests", "kotlin-testing", [], []),
    ("fix slow postgres query, add index", "postgres-patterns", [], []),
    ("design mysql schema and indexes", "mysql-patterns", [], []),
    ("tune redis cache lock rate limit", "redis-patterns", [], []),
    ("migrate schema zero downtime, how", "database-migrations", [], []),
    ("write prisma schema query help", "prisma-patterns", [], []),
    ("design JPA entities, fix N+1", "jpa-patterns", [], []),
    ("review django ORM queries caching", "django-patterns", [], []),
    ("add celery background jobs django", "django-celery", [], []),
    ("test my django DRF api pytest", "django-tdd", [], []),
    ("check django auth security settings", "django-security", [], []),
    ("build laravel controller eloquent queue", "laravel-patterns", [], []),
    ("test laravel with pest factories", "laravel-tdd", [], []),
    ("check laravel auth csrf xss", "laravel-security", [], []),
    ("build rails controller service job", "rails-patterns", [], []),
    ("review spring boot service cache async", "springboot-patterns", [], []),
    ("test spring boot mockmvc testcontainers", "springboot-tdd", [], []),
    ("review spring security jwt csrf", "springboot-security", [], []),
    ("build quarkus camel messaging service", "quarkus-patterns", [], []),
    ("test quarkus junit rest assured", "quarkus-tdd", [], []),
    ("build nestjs module guard interceptor", "nestjs-patterns", [], []),
    ("build fastapi pydantic async auth test", "fastapi-patterns", [], []),
    ("build ktor routing auth DI", "kotlin-ktor-patterns", [], []),
    ("query exposed ORM transactions flyway", "kotlin-exposed-patterns", [], []),
    ("write DRF serializer viewset guide", "django-patterns", [], []),
    ("make react component hooks form", "react-patterns", [], []),
    ("test react component RTL msW", "react-testing", [], []),
    ("make react faster, fix rerenders", "react-performance", [], []),
    ("animate button modal toast stagger", "motion-patterns", [], []),
    ("setup motion tokens springs reduced-motion", "motion-foundations", [], []),
    ("drag drop gesture SVG animation", "motion-advanced", [], []),
    ("build vue composition pinia router", "vue-patterns", [], []),
    ("build nuxt app no hydration mismatch", "nuxt4-patterns", [], []),
    ("setup vite config HMR proxy", "vite-patterns", [], []),
    ("make nextjs turbopack build faster", "nextjs-turbopack", [], []),
    ("label my forms for screen reader", "frontend-a11y", ["accessibility"], []),
    ("audit design system visual consistency", "design-system", [], []),
    ("make interface spacing typography better", "make-interfaces-feel-better", [], []),
    ("build expo router screen tanstack list", "react-native-patterns", [], []),
    ("make swiftui observable navigation view", "swiftui-patterns", [], []),
    ("generate ios icons asset catalog", "ios-icon-gen", [], []),
    ("add liquid glass blur ios 26", "liquid-glass-design", [], []),
    ("persist data swift actor no races", "swift-actor-persistence", [], []),
    ("mock network swift testing protocol", "swift-protocol-di-testing", [], []),
    ("fix compose state navigation theme", "compose-multiplatform-patterns", [], []),
    ("structure android KMP modules usecase", "android-clean-architecture", [], []),
    ("make angular signals form validation", "angular-developer", [], []),
    ("draw system diagram explorable html", "archify", [], []),
    ("record ADR why postgres picked", "architecture-decision-records", [], []),
    ("turn idea into step plan build", "blueprint", [], []),
    ("make prototype to test state model", "prototype", [], []),
    ("break plan into tracer tickets", "to-tickets", ["to-spec"], []),
    ("turn chat into spec publish tracker", "to-spec", [], []),
    ("make questionnaire for undecided choice", "to-questionnaire", [], []),
    ("write PR body for me", "pr", [], []),
    ("triage issues verify write briefs", "triage", [], []),
    ("resolve merge rebase conflict now", "resolving-merge-conflicts", [], []),
    ("pick branching strategy team", "git-workflow", [], []),
    ("block dangerous git push reset hooks", "git-guardrails-claude-code", [], []),
    ("manage github issues PRs releases gh cli", "github-ops", [], []),
    ("setup CI docker health rollback", "deployment-patterns", [], []),
    ("write dockerfile compose network volume", "docker-patterns", [], []),
    ("debug k8s probe RBAC autoscale", "kubernetes-patterns", [], []),
    ("make flox env reproducible packages", "flox-environments", [], []),
    ("check homelab VLAN IoT guest setup", "homelab-vlan-segmentation", [], []),
    ("setup wireguard remote home network", "homelab-wireguard-vpn", [], []),
    ("install pihole blocklists DoH DHCP", "homelab-pihole-dns", [], []),
    ("plan home network gateway AP DHCP DNS", "homelab-network-setup", [], []),
    ("check network readiness VLAN DNS VPN", "homelab-network-readiness", [], []),
    ("diagnose interface CRC flapping duplex", "network-interface-health", [], []),
    ("BGP neighbor down, routes missing", "network-bgp-diagnostics", [], []),
    ("review router config before deploy", "network-config-validation", [], []),
    ("automate SSH netmiko read-only collect", "netmiko-ssh-automation", [], []),
    ("review cisco IOS ACL wildcard", "cisco-ios-patterns", [], []),
    ("send email via mailtrap sandbox test", "mailtrap-email-integration", [], []),
    ("post tweet thread X api rate limits", "x-api", [], []),
    ("publish everywhere X linkedin tiktok", "social-publisher", ["crosspost"], []),
    ("repurpose post cross-platform no dupes", "crosspost", [], []),
    ("grow X linkedin network warm outreach", "connections-optimizer", [], []),
    ("find qualify reach high-value contacts", "lead-intelligence", [], []),
    ("rank warm intros bridge scoring", "social-graph-ranker", [], []),
    ("score my session 1-5 honest", "agent-self-evaluation", [], []),
    ("debug my agent run failure reproduce", "agent-introspection-debugging", [], []),
    ("audit my agent stack 12 layers", "agent-architecture-audit", [], []),
    ("compare claude aider codex pass rate cost", "agent-eval", [], []),
    ("run agents parallel isolated worktrees", "claude-devfleet", ["dmux-workflows", "team-builder"], []),
    ("coordinate agent squad kanban gates", "team-agent-orchestration", [], []),
    ("pick parallel team agents dispatch", "team-builder", [], []),
    ("keep memory across sessions no re-explain", "ck", ["unified-memory", "knowledge-ops"], []),
    ("save session handoff resume later", "unified-memory", [], []),
    ("track claude token spend budgets", "cost-tracking", [], []),
    ("cut LLM spend route models tiers", "cost-aware-llm-pipeline", [], []),
    ("argue both sides before I decide", "council", [], []),
    ("design agent loop no spin no cheat", "loop-design-check", [], []),
    ("run agent loop self-check evals recover", "continuous-agent-loop", [], []),
    ("capture lesson instinct skill promote", "continuous-learning-v2", [], []),
    ("write growth log reusable pattern", "growth-log", [], []),
    ("verify session work before done claim", "verification-loop", [], []),
    ("block finish until checks pass hook", "delivery-gate", [], []),
    ("run eval before trusted changed", "eval-harness", [], []),
    ("optimize prompt rewrite paste-ready", "prompt-optimizer", [], []),
    ("control answer length token budget", "token-budget-advisor", [], []),
    ("research topic cited dossier file repo", "research", ["autoresearch", "research-ops"], []),
    ("deep research web cited report", "deep-research", [], []),
    ("search web exa neural code examples", "exa-search", [], []),
    ("lookup docs context7 API examples", "documentation-lookup", [], []),
    ("find pubmed biomedical papers mesh", "scientific-db-pubmed-database", [], []),
    ("check USPTO patent trademark records", "scientific-db-uspto-database", [], []),
    ("review paper methods evidence rubric", "scientific-thinking-scholar-evaluation", [], []),
    ("synthesize literature screen cite", "scientific-thinking-literature-review", [], []),
    ("query gget genomic BLAST enrichment", "scientific-pkg-gget", [], []),
    ("size market competitors fund research", "market-research", [], []),
    ("make pitch deck projections milestones", "investor-materials", [], []),
    ("draft cold email angels VCs followup", "investor-outreach", [], []),
    ("plan launch landing email social ads", "marketing-campaign", [], []),
    ("audit SEO schema sitemap keywords", "seo", [], []),
    ("make social posts threads scripts calendar", "content-engine", [], []),
    ("edit video cut footage captions ffmpeg", "video-editing", [], []),
    ("make remotion charts captions transitions", "remotion-video-creation", [], []),
    ("record UI demo walkthrough webm", "ui-demo", [], []),
    ("smoke test deployed URL console errors", "canary-watch", [], []),
    ("test windows app pywinauto E2E", "windows-desktop-e2e", [], []),
    ("write playwright page objects fix flakes", "e2e-testing", [], []),
    ("convert screenshot to vue vant batch", "ui-to-vue", [], []),
    ("manage uncloud deploy caddy ports", "uncloud", [], []),
    ("triage inbox dedupe escalate alerts", "unified-notifications-ops", [], []),
    ("operate github linear backlog PR triage", "project-flow-ops", [], []),
    ("run command repo debug CI push fix", "terminal-ops", [], []),
    ("open interactive CLI new terminal argv", "terminal-opener", [], []),
    ("drive sheets docs slides cleanup", "google-workspace-ops", [], []),
    ("triage mailbox draft verify sent", "email-ops", [], []),
    ("read texts DMs recover code thread", "messages-ops", [], []),
    ("route alerts github linear desktop hooks", "unified-notifications-ops", [], []),
    ("operate billing subs refunds churn stripe", "customer-billing-ops", ["finance-billing-ops"], []),
    ("snapshot pricing refunds duplicates code", "finance-billing-ops", [], []),
    ("fix duplicate charge from code", "customer-billing-ops", [], []),
    ("negotiate freight rates scorecard RFP", "carrier-relationship-management", [], []),
    ("handle shipment delay damage claim", "logistics-exception-management", [], []),
    ("forecast demand safety stock promo", "inventory-demand-planning", [], []),
    ("schedule line balance bottleneck TOC", "production-scheduling", [], []),
    ("investigate NCR root cause CAPA SPC", "quality-nonconformance", [], []),
    ("process returns fraud warranty grading", "returns-reverse-logistics", [], []),
    ("classify tariff HS FTA duty", "customs-trade-compliance", [], []),
    ("buy electricity tariff PPA demand", "energy-procurement", [], []),
    ("generate e-sign fields envelope draft", "esign-field-placement", [], []),
    ("draft master agreement schedule A", "master-agreement-generator", [], []),
    ("get operator approval outbound hashed", "operator-approval-loop", [], []),
    ("approve agent spend wallet budget", "agent-payment-x402", [], []),
    ("simulate tx spend limits MEV keys", "llm-trading-agent-security", [], []),
    ("lookup token decimals chain bridge", "evm-token-decimals", [], []),
    ("dont mix sha3 keccak selector bug", "nodejs-keccak256", [], []),
    ("audit AMM reentrancy oracle slippage", "defi-amm-security", [], []),
    ("review basket oracle venue risk keys", "prediction-market-risk-review", [], []),
    ("browse ito baskets compare thesis", "ito-baskets", [], []),
    ("find H100 fixed rate RFQ nodes", "ito-compute", [], []),
    ("research prediction market signal", "prediction-market-oracle-research", [], []),
    ("make pytorch training reproducible loader", "pytorch-patterns", [], []),
    ("harden ML contracts deploy rollback", "mle-workflow", [], []),
    ("add ML baseline to non-ML codebase", "ml-adoption-playbook", [], []),
    ("speed ETL backfill keep correct", "data-throughput-accelerator", [], []),
    ("build monitoring dashboard grafana", "dashboard-builder", [], []),
    ("make realtime p95 latency fresh", "latency-critical-systems", [], []),
    ("try variants benchmark latency pick best", "benchmark-optimization-loop", [], []),
    ("collect job board prices scheduled free", "data-scraper-agent", [], []),
    ("enrich notion sheets supabase free LLM", "data-scraper-agent", [], []),
    ("process PDF OCR redact sign fill", "nutrient-document-processing", [], []),
    ("translate visa docs bilingual PDF", "visa-doc-translate", [], []),
    ("index video search moments clips", "videodb", [], []),
    ("make music video taste style pack", "taste-application", ["taste", "taste-distillation"], []),
    ("capture reference look LUT rhythm", "taste-distillation", [], []),
    ("plan video offline fail-closed EDL", "tasteforge-video", [], []),
    ("animate manim explainer graphs", "manim-video", [], []),
    ("build slides animation PPTX web", "frontend-slides", [], []),
    ("make html presentation convert ppt", "frontend-slides", [], []),
    ("generate fal image video audio", "fal-ai-media", [], []),
    ("check blender rig feet ground", "blender-motion-state-inspection", [], []),
    ("make Nuitka windows installer slim", "generating-python-installer", [], []),
    ("make pythonic pep8 type hints", "python-patterns", [], []),
    ("fix perl taint DBI XSS", "perl-security", [], []),
    ("write perl Test2 prove coverage", "perl-testing", [], []),
    ("write modern perl 5.36 idioms", "perl-patterns", [], []),
    ("write java spring naming optional", "java-coding-standards", [], []),
    ("write fsharp xunit fscheck", "fsharp-testing", [], []),
    ("write csharp xunit fluent mocks", "csharp-testing", [], []),
    ("use tinystruct action routes tests", "tinystruct-patterns", [], []),
    ("make dart null-safe riverpod router", "dart-flutter-patterns", [], []),
    ("review flutter bloc riverpod perf a11y", "flutter-dart-code-review", [], []),
    ("pick flutter cherry branches tool", "flutter-cherry-pick", [], []),
    ("fix flutter rebuild tool PR checks", "flutter-pr-checks-finder", [], []),
    ("parse dart logs failure tool", "dart-log-failure-parser", [], []),
    ("update android SDK packages tool", "updating-android-sdk", [], []),
    ("upgrade browser automation tool", "upgrade-browser", [], []),
    ("find release notes tool", "find-release", [], []),
    ("shepherd PRs review merge tool", "shepherd-prs", [], []),
    ("migrate workflows codemod tool", "migrate-workflows", [], []),
    ("migrate tests shoehorn fixtures", "migrate-to-shoehorn", [], []),
    ("fix github flake analyze tool", "analyze-github-flake", [], []),
    ("scan skills changed quick stocktake", "skill-stocktake", ["skill-comply"], []),
    ("check agents follow skills rules rate", "skill-comply", [], []),
    ("find skill before building new one", "skill-scout", [], []),
    ("audit context window bloat tokens", "context-budget", [], []),
    ("clean claude config bloat confirm", "config-gc", [], []),
    ("scan claude dir injection MCP hooks", "security-scan", [], []),
    ("hunt bounty remotely reachable vulns", "security-bounty-hunter", [], []),
    ("review auth input secrets payments", "security-review", [], []),
    ("prevent destructive prod operations", "safety-guard", [], []),
    ("diagnose bug before fixing loop", "systematic-debugging", [], []),
    ("click buttons full state trace audit", "click-path-audit", [], []),
    ("run production readiness local audit", "production-audit", [], []),
    ("regress AI-written code sandbox API", "ai-regression-testing", [], []),
    ("verify django migrate lint coverage", "django-verification", [], []),
    ("verify laravel lint tests security", "laravel-verification", [], []),
    ("verify quarkus build coverage native", "quarkus-verification", [], []),
    ("verify springboot build coverage diff", "springboot-verification", [], []),
    ("run TDD red green refactor 80pct", "tdd-workflow", ["tdd"], []),
    ("build feature test-first TDD", "tdd", [], []),
    ("who can merge main, permission model github", "permissioned-github", [], []),
    ("everything claude code guide, what can it do", "everything-claude-code", [], []),
    ("hand conversation to fresh background agent", "claude-handoff", ["handoff"], []),
    ("guide ECC agents skills commands hooks", "ecc-guide", [], []),
    ("browse ECC command recipes run-order", "ecc-recipes", [], []),
    ("configure ECC install update reconfigure", "configure-ecc", [], []),
    ("extract content webpage markdown cheap", "defuddle", [], []),
    ("decide regex vs LLM parse text", "regex-vs-llm-structured-text", [], []),
    ("cache file processing sha256 content", "content-hash-cache-pattern", [], []),
    ("refine retrieval subagent passes", "iterative-retrieval", [], []),
    ("rank feed topK scorer selector", "recsys-pipeline-architect", [], []),
    ("rollouts ledger stochastic visible trail", "recursive-decision-ledger", [], []),
    ("build MCP server tools zod stdio", "mcp-server-patterns", [], []),
    ("handle typed errors retries breakers", "error-handling", [], []),
    ("design REST status paging versioning", "api-design", [], []),
    ("match repo integration pattern connector", "api-connector-builder", [], []),
    ("evolve API schema no drift contract", "contract-first", [], []),
    ("design ports adapters usecase go", "hexagonal-architecture", [], []),
    ("deepen module seams testable AI", "codebase-design", [], []),
    ("inherit legacy style no drift", "inherit-legacy-style", [], []),
    ("distill principles rules files", "rules-distill", [], []),
    ("write skills AGENTS.md agents guide", "writing-for-agents", [], []),
    ("shape article paragraph by paragraph", "writing-shape", [], []),
    ("mine fragments no structure yet", "writing-fragments", [], []),
    ("assemble beats journey terms", "writing-beats", [], []),
    ("clone canvas nodes edges groups", "json-canvas", [], []),
    ("edit obsidian base views filters", "obsidian-bases", [], []),
    ("use obsidian CLI vault search notes", "obsidian-cli", [], []),
    ("write wikilinks callouts frontmatter", "obsidian-markdown", [], []),
    ("put notes on canvas board", "canvas", ["json-canvas"], []),
    ("open plan browser annotate approve", "plan-canvas", [], []),
    ("ingest URL vault provenance ledger", "wiki-ingest", [], []),
    ("lint wiki orphans dead links", "wiki-lint", [], []),
    ("query wiki vault-scoped answer", "wiki-query", [], []),
    ("retrieve BM25 rerank vault passages", "wiki-retrieve", [], []),
    ("fold log rollup dry-run apply", "wiki-fold", [], []),
    ("set vault mode PARA LYT", "wiki-mode", [], []),
    ("setup vault scaffold second brain", "wiki", [], []),
    ("detect obsidian CLI transport read", "wiki-cli", [], []),
    ("save answer obsidian vault reviewed", "save", [], []),
    ("make text file link group edge", "canvas", [], []),
    ("decompose plan agent chain paste", "plan-orchestrate", [], []),
    ("orchestrate feature research TDD review", "orch-add-feature", [], []),
    ("orchestrate MVP slices scaffold TDD", "orch-build-mvp", [], []),
    ("orchestrate bug reproduce regression", "orch-fix-defect", [], []),
    ("orchestrate behavior change tests new", "orch-change-feature", [], []),
    ("orchestrate refactor green keep green", "orch-refine-code", [], []),
    ("run RFC DAG gates merge queue", "ralphinho-rfc-pipeline", [], []),
    ("build GAN generator evaluator loop", "gan-style-harness", [], []),
    ("two reviewers must pass ship", "santa-method", [], []),
    ("simulate PM architect dev QA panel", "dev-team", [], []),
    ("compose dispatch parallel team", "team-builder", [], []),
    ("interview sharpen plan adversarial", "grill-me", ["grilling"], []),
    ("grill with ADR glossary docs", "grill-with-docs", [], []),
    ("grill me workflows workspace loop", "loop-me", [], []),
    ("stop re-pitch that message", "wait-what", [], []),
    ("plan huge work decision tickets map", "wayfinder", [], []),
    ("hand off fresh agent pick up", "claude-handoff", [], []),
    ("compact conversation handoff doc", "handoff", [], []),
    ("retro my coding session", "retro", [], []),
    ("log growth pattern not diary", "growth-log", [], []),
    ("dispatch dmux tmux panes agents parallel", "dmux-workflows", [], []),
    ("I have ADHD next action first", "i-have-adhd", [], []),
    ("conduct retro coding session", "retro", [], []),
    ("implement spec tickets code", "implement", ["implement-spec"], []),
    ("implement spec in code", "implement-spec", [], []),
    ("research question background agent file", "research", [], []),
    ("ask which skill fits situation", "ask-matt", [], []),
    ("steroids skill router how", "steroids", [], []),
    ("route prompt skills index", "steroids", [], []),
]

assert len(GOLDEN2) >= 100, f"need 100+ queries, have {len(GOLDEN2)}"


def build_live_idx():
    """In-memory live index + repo overrides (mirrors get_index, no cache)."""
    with open(_RULES_PATH, encoding="utf-8") as f:
        rules = json.load(f)
    files = router.skill_files(rules.get("index_dirs", []))
    idx, _ = router.build_index(files)
    for skill, extra in rules.get("skills", {}).items():
        if skill in idx:
            es = [router.stem(w) for w in extra]
            idx[skill] = es + [k for k in idx[skill] if k not in es]
    return rules, idx


def reciprocal_rank(ranked, relevant):
    for i, s in enumerate(ranked[:3]):
        if s in relevant:
            return 1.0 / (i + 1)
    return 0.0


def avg_precision(ranked, relevant):
    hits = prec_sum = 0
    for i, s in enumerate(ranked[:3]):
        if s in relevant:
            hits += 1
            prec_sum += hits / (i + 1)
    return prec_sum / len(relevant) if relevant else 0.0


def main():
    rules, idx = build_live_idx()
    print(f"live skills: {len(idx)}  second-set queries: {len(GOLDEN2)}")
    missing = sorted({exp for _, exp, _, _ in GOLDEN2 if exp not in idx})
    if missing:
        print(f"MISSING FROM INDEX: {missing}")
        return
    p1 = p3 = leaks = rr = ap = 0.0
    misses = []
    for query, exp, acc, exc in GOLDEN2:
        top = router.route_query(query, rules, idx)
        ranked = [s for _, s, _ in top]
        relevant = {exp} | set(acc)
        ok1 = ranked[:1] == [exp]
        ok3 = bool(relevant & set(ranked[:3])) and not (set(ranked[:3]) & set(exc))
        leak = bool(set(ranked[:3]) & set(exc))
        p1 += ok1
        p3 += ok3
        leaks += leak
        rr += reciprocal_rank(ranked, relevant)
        ap += avg_precision(ranked, relevant)
        if not ok1 or not ok3:
            misses.append((query, exp, ranked))
    n = len(GOLDEN2)
    print(f"n={n}  precision@1={p1/n:.3f}  precision@3={p3/n:.3f}  "
          f"exclusion-leaks={leaks}  MRR={rr/n:.3f}  MAP={ap/n:.3f}")
    print(f"--- misses ({len(misses)}) ---")
    for query, exp, ranked in misses:
        print(f"Q: {query[:70]}")
        print(f"   exp={exp} got={'/'.join(ranked[:3]) if ranked else '-'}")


if __name__ == "__main__":
    main()
