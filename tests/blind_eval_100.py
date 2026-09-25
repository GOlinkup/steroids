#!/usr/bin/env python3
"""Blind eval: 100+ stranger-standard queries vs the live 366-skill index.

Style: paraphrase, synonyms, typos, indirect asks (how-do-I), NOT keyword
dumps. Each row: (query, expected, acceptable, excludes).
  P@1 = top-1 == expected (strict).
  P@3 = (expected or acceptable in top-3) AND no excluded in top-3.
  leaks = rows with an excluded skill in top-3.
Run: python3 tests/blind_eval_100.py
"""
import importlib.util
import json
import os

_HERE = os.path.dirname(os.path.abspath(__file__))
_ROUTER_PATH = os.path.normpath(os.path.join(_HERE, "..", "src", "steroids", "router.py"))
_RULES_PATH = os.path.normpath(os.path.join(_HERE, "..", "skill-rules.json"))

_spec = importlib.util.spec_from_file_location("steroids_router_blind", _ROUTER_PATH)
router = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(router)

GOLDEN = [
    ("how do I make my checkout usable with a screen reader and keyboard only", "accessibility", ["frontend-a11y"], []),
    ("my grandmother can't tap these tiny buttons, what sizes should I use", "accessibility", [], []),
    ("compare claude code aider and codex on my own repo tasks with real numbers", "agent-eval", [], []),
    ("my agent loop keeps stalling halfway through, help me debug the failure", "continuous-agent-loop", ["agent-introspection-debugging"], []),
    ("let my bot pay for its own API calls with a per-task budget", "agent-payment-x402", [], []),
    ("pay my drivers out in stablecoin each night within a spending cap", "agent-payment-x402", [], []),
    ("rate my last task output on accuracy and clarity with concrete evidence", "agent-self-evaluation", [], []),
    ("my toolbox is bloated, decide daily drivers versus library buckets", "agent-sort", [], []),
    ("set review gates and ownership rules for an agent-written codebase", "ai-first-engineering", ["agentic-engineering"], []),
    ("the same model wrote and reviewed this code, catch what it missed", "ai-regression-testing", [], []),
    ("split my android app into clean modules with use cases and repos", "android-clean-architecture", [], []),
    ("help me build an angular form with signals and validation", "angular", ["angular-developer"], []),
    ("wire up another REST API the same way our codebase already does it", "api-connector-builder", [], []),
    ("how should I name endpoints and handle paging and errors", "api-design", ["backend-patterns"], []),
    ("draw the architecture of this repo as a diagram I can explore", "mermaid-diagrams", ["archify"], []),
    ("record why we picked postgres so future devs stop asking", "architecture-decision-records", [], []),
    ("write my launch post so it sounds like me, not a template", "article-writing", ["brand-voice"], []),
    ("I'm lost in the skill list, which one fits my task", "ask-matt", [], []),
    ("list every automation I have and flag the overlaps", "automation-audit-ops", [], []),
    ("keep an agent running overnight with memory and scheduled jobs", "agentic-os", ["autonomous-agent-harness"], []),
    ("research this topic and file a cited dossier I can trust", "autoresearch", ["deep-research", "research-ops"], []),
    ("is bun actually faster than node here, measure both", "bun-runtime", ["benchmark"], []),
    ("this endpoint is slow, try variants and pick the winner by measurement", "benchmark-optimization-loop", ["benchmark"], []),
    ("inspect my blender rig pose and check the feet touch the ground", "blender-motion-state-inspection", [], []),
    ("turn this rambling idea into a build plan with ordered steps", "blueprint", [], []),
    ("interview me until my brand positioning is sharp", "grill-me", ["brand-discovery"], []),
    ("learn how I write so my newsletter stays in my voice", "brand-voice", ["article-writing"], []),
    ("click through my deployed app and verify the key flows work", "browser-qa", ["ui-demo"], ["e2e-testing"]),
    ("should the team switch its runtime to bun", "bun-runtime", [], []),
    ("we just deployed, is production still healthy right now", "canary-watch", [], []),
    ("lay my notes out on a visual canvas I can rearrange spatially", "canvas", ["plan-canvas"], ["json-canvas"]),
    ("get my freight rates down and rank my carriers properly", "carrier-relationship-management", [], []),
    ("sanity-check my cisco switch config before tonight's change window", "cisco-ios-patterns", ["network-config-validation"], []),
    ("keep project memory alive between sessions without re-explaining", "ck", ["unified-memory", "knowledge-ops"], []),
    ("run four coding agents at once in isolated worktrees and track them", "claude-devfleet", ["dmux-workflows", "team-builder"], []),
    ("each button works alone but together they break the page, find the clash", "click-path-audit", [], []),
    ("my clickhouse aggregation over billions of rows crawls, tune it", "clickhouse-io", [], []),
    ("review my branch against what the issue actually asked for", "code-review", [], []),
    ("give me a guided tour of how auth works in this repo", "code-tour", [], []),
    ("this module has no clear boundary, where should the seam go", "codebase-design", [], []),
    ("I just joined, map this codebase for me", "codebase-onboarding", [], []),
    ("did my last AI edit make this file's structure better or worse", "codehealth-mcp", [], []),
    ("be blunt about my naming and readability habits", "coding-standards", [], []),
    ("who really competes with us and where are the gaps", "competitive-platform-analysis", ["market-research"], []),
    ("score each competitor one to five on nine dimensions", "benchmark-methodology", [], []),
    ("turn these competitor scores into a report my team can act on", "competitive-report-structure", [], []),
    ("state and navigation in my compose multiplatform app feel messy", "compose-multiplatform-patterns", [], []),
    ("my config folder is bloated with stuff I never use, audit it", "config-gc", [], []),
    ("where did all my API money go this month, break it down", "cost-tracking", [], []),
    ("argue both sides of this architecture call before I commit", "council", [], []),
    ("review my C++ for modern safe idioms", "cpp-coding-standards", [], []),
    ("my googletest suite flakes in CI, stabilize it", "cpp-testing", [], []),
    ("post this announcement to X and linkedin without duplicate text", "crosspost", ["social-publisher", "content-engine"], []),
    ("help with xunit mocks and integration tests in dotnet", "csharp-testing", [], []),
    ("a customer got charged twice, find the duplicate from the code", "customer-billing-ops", ["finance-billing-ops"], []),
    ("sort out customs paperwork and stop overpaying duty", "customs-trade-compliance", [], []),
    ("my flutter list janks and rebuilds everything on scroll", "flutter-dart-code-review", ["dart-flutter-patterns"], []),
    ("build a dashboard that tells me what broke, not vanity graphs", "dashboard-builder", [], []),
    ("watch these prices nightly and save them to a sheet, free only", "data-scraper-agent", [], []),
    ("this backfill takes all weekend, make it fast without corrupting rows", "data-throughput-accelerator", [], []),
    ("migrate my schema with zero downtime and a safe rollback", "database-migrations", [], []),
    ("deep-dive this topic with real sources and citations", "deep-research", ["autoresearch"], []),
    ("audit my swap contract for reentrancy and oracle games", "defi-amm-security", [], []),
    ("strip the clutter from this article and give me clean markdown", "defuddle", [], []),
    ("stop the release pipeline until the quality gates pass", "delivery-gate", [], []),
    ("set up deploys with health checks and one-command rollback", "deployment-patterns", [], []),
    ("my screens look inconsistent, audit the tokens and spacing", "design-system", [], []),
    ("I want PM architect dev and QA arguing in one room about this feature", "dev-team", [], []),
    ("this crash only happens on tuesdays, help me hunt it", "diagnosing-bugs", ["systematic-debugging"], []),
    ("schedule background jobs with beat, retries and monitoring in django", "django-celery", [], []),
    ("my django ORM does a hundred queries per page, fix it", "django-patterns", [], []),
    ("lock down my django auth, forms and cookies properly", "django-security", [], []),
    ("drive my django API test-first with pytest", "django-tdd", [], []),
    ("drive two different AI CLIs side by side in terminal panes", "dmux-workflows", [], []),
    ("write a dockerfile without the usual security holes", "docker-patterns", [], []),
    ("look up the current docs instead of quoting the API from memory", "documentation-lookup", [], []),
    ("we call the same thing three names, settle our vocabulary", "domain-modeling", [], []),
    ("review my C# dependency injection and async usage", "dotnet-patterns", [], []),
    ("my agent games its own verifier, redesign the loop so it can't cheat", "loop-design-check", ["eval-harness"], []),
    ("my transfer shows the wrong amount by a factor of a million on base", "evm-token-decimals", [], []),
    ("search the live web and real code for how others solved this", "exa-search", [], []),
    ("generate a cover image and a voiceover for the launch video", "fal-ai-media", [], []),
    ("pydantic schemas and dependency injection for my fastapi service", "fastapi-patterns", [], []),
    ("prove from the code whether anyone is being billed twice", "customer-billing-ops", ["finance-billing-ops"], []),
    ("one command dev environment so onboarding stops hurting", "flox-environments", [], []),
    ("tell me straight what to delete from this overbuilt module", "code-review", ["improve-codebase-architecture"], []),
    ("full-repo scan for simplification wins, ranked cut list", "improve-codebase-architecture", ["code-review"], []),
    ("my row-level security policies made every query slow", "postgres-patterns", [], []),
    ("write the PR body so reviewers actually understand it", "pr", [], []),
    ("can prediction markets forecast demand for my product", "prediction-market-oracle-research", [], []),
    ("prisma migrate wiped my database, explain and prevent it", "database-migrations", ["prisma-patterns"], []),
    ("pressure-test whether this feature deserves to exist at all", "product-lens", ["intent-driven-development"], []),
    ("what will break when we launch, audit us before users do", "production-audit", [], []),
    ("triage my github backlog and mirror it into linear", "project-flow-ops", ["github-ops"], []),
    ("rewrite this prompt so a fresh agent can run it cold", "prompt-optimizer", [], []),
    ("throwaway prototype to feel whether this state shape works", "prototype", [], []),
    ("find the pubmed literature on this interaction", "scientific-db-pubmed-database", [], []),
    ("is this python idiomatic or am I writing java in disguise", "python-patterns", [], []),
    ("teach me pytest fixtures parametrization and mocks properly", "python-testing", ["tdd-workflow"], []),
    ("my pytorch run gives different numbers every time, stabilize it", "pytorch-patterns", ["mle-workflow"], []),
    ("root-cause this line defect and draft the corrective action", "quality-nonconformance", [], []),
    ("review my quarkus camel event service", "quarkus-patterns", [], []),
    ("skinny controllers service objects and hotwire for rails 8", "rails-patterns", [], []),
    ("my react routes waterfall and the bundle is huge", "react-best-practices--web-development", ["react-performance"], []),
    ("test my react hook with server mocks and a11y checks", "react-testing", [], []),
    ("design my feed as source hydrator filter scorer selector", "recsys-pipeline-architect", [], []),
    ("add caching locks and rate limits with redis, done right", "redis-patterns", [], []),
    ("regex or LLM for parsing these logs, decide with reasons", "regex-vs-llm-structured-text", [], []),
    ("animate this modal with springs and respect reduced motion", "motion-patterns", ["motion-foundations"], []),
    ("captions charts and transitions for my react video project", "remotion-video-creation", [], ["video-editing", "manim-video"]),
    ("trim my vlog and structure it like a story, not a dump", "video-editing", [], ["remotion-video-creation"]),
    ("animate the proof of this theorem with clean math visuals", "manim-video", [], ["remotion-video-creation"]),
    ("my mysql replica lags behind, tune the indexes", "mysql-patterns", [], []),
    ("publish this episode to every platform from one place", "social-publisher", ["crosspost"], []),
    ("review my spring boot service layers and caching", "springboot-patterns", [], []),
    ("offload work without breaking swift 6.2 isolation rules", "swift-concurrency-6-2", [], []),
    ("observable state and navigation perf in my swiftui app", "swiftui-patterns", [], []),
    ("heisenbug that vanishes under the debugger, hunt it methodically", "systematic-debugging", ["diagnosing-bugs"], []),
    ("red green refactor my next feature, no code before tests", "tdd", ["tdd-workflow"], []),
    ("page objects and CI setup for my checkout e2e suite", "e2e-testing", ["browser-qa"], []),
    ("my laravel queues keep dying silently, harden them", "laravel-patterns", [], []),
    ("my kotlin flows leak on rotation, fix the scope", "kotlin-coroutines-flows", [], []),
    ("review my ktor routing plugins and auth", "kotlin-ktor-patterns", [], []),
    ("my k8s probes fail and RBAC denies everything, untangle it", "kubernetes-patterns", [], []),
    ("bgp session down and prefixes missing, diagnose read-only", "network-bgp-diagnostics", [], []),
    ("vite dev is sluggish and HMR takes forever", "vite-patterns", [], []),
    ("composition API and pinia patterns for my vue app", "vue-patterns", [], []),
    ("my nuxt page flashes wrong content then fixes itself", "nuxt4-patterns", [], []),
    ("review my nestjs modules guards and DTOs", "nestjs-patterns", [], []),
    ("make my health app HIPAA-clean with proper PHI handling", "hipaa-compliance", ["healthcare-phi-compliance"], []),
    ("tune my drug interaction alerts so doctors stop ignoring them", "healthcare-cdss-patterns", [], []),
    ("draft our vendor agreement from the template with the right clauses", "master-agreement-generator", [], []),
    ("build an MCP server exposing tools and resources over stdio", "mcp-server-patterns", [], []),
    ("dig my verification code out of this message flood", "messages-ops", [], []),
    ("tame my inbox and show proof of what actually sent", "email-ops", [], []),
    ("pull the jira ticket, read the requirements, move it along", "jira-integration", [], []),
    ("my hibernate queries N+1 on every page load", "jpa-patterns", [], []),
    ("the borrow checker hates my tree, restructure it idiomatically", "rust-patterns", [], []),
    ("table-driven tests with subtests for my go service", "golang-testing", [], []),
    ("is my go error handling and concurrency idiomatic", "golang-patterns", [], []),
    ("harden my perl CGI against taint and injection", "perl-security", [], []),
    ("property-based tests for my F# domain model", "fsharp-testing", [], []),
    ("resovle the merg confilct in my branch, nothing is clean", "resolving-merge-conflicts", ["git-workflow"], []),
    ("fluter listview keeps rebuilding, memoize the rows dammit", "flutter-dart-code-review", ["dart-flutter-patterns"],
     ["homelab-wireguard-vpn", "homelab-network-setup", "homelab-vlan-segmentation", "homelab-pihole-dns"]),
    ("hepl me with docker compose netwroking between services", "docker-patterns", [], []),
    ("this signup screen feels cheap and I can't say why", "signup-flow-cro", ["make-interfaces-feel-better"], []),
    ("turn my standup notes into tickets with blocked-by links", "to-tickets", ["to-spec"], []),
    ("merge two PDFs and OCR the scanned pages", "pdf-processing", ["nutrient-document-processing"], []),
    ("convert this slide deck into a stakeholder update", "frontend-slides", [], []),
]

assert len(GOLDEN) >= 100, f"need 100+ queries, have {len(GOLDEN)}"


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


def main():
    rules, idx = build_live_idx()
    print(f"live skills: {len(idx)}  blind queries: {len(GOLDEN)}")
    missing = sorted({exp for _, exp, _, _ in GOLDEN if exp not in idx})
    if missing:
        print(f"MISSING FROM INDEX: {missing}")
        return
    p1 = p3 = leaks = 0
    misses = []
    for query, exp, acc, exc in GOLDEN:
        top = router.route_query(query, rules, idx)
        ranked = [s for _, s, _ in top]
        ok1 = ranked[:1] == [exp]
        ok3 = bool(exp in ranked[:3] or set(ranked[:3]) & set(acc)) and not (set(ranked[:3]) & set(exc))
        leak = bool(set(ranked[:3]) & set(exc))
        p1 += ok1
        p3 += ok3
        leaks += leak
        if not ok1 or not ok3:
            misses.append((query, exp, ranked))
    n = len(GOLDEN)
    print(f"n={n}  precision@1={p1/n:.3f}  precision@3={p3/n:.3f}  exclusion-leaks={leaks}")
    print(f"--- misses ({len(misses)}) ---")
    for query, exp, ranked in misses:
        print(f"Q: {query[:70]}")
        print(f"   exp={exp} got={'/'.join(ranked[:3]) if ranked else '-'}")


if __name__ == "__main__":
    main()
