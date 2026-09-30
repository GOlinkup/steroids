#!/usr/bin/env python3
"""D31 per-skill goldens: 20 skills x 5 queries, CI enforced (top-1 bar).

Each row: (query, expected skill). Run: python3 tests/goldens_per_skill.py
Also importable: GOLDEN list. Exit 1 on any top-1 miss (with miss list).
"""
import importlib.util
import json
import os
import sys

_HERE = os.path.dirname(os.path.abspath(__file__))
_ROUTER_PATH = os.path.normpath(os.path.join(_HERE, "..", "src", "steroids", "router.py"))
_RULES_PATH = os.path.normpath(os.path.join(_HERE, "..", "skill-rules.json"))

_spec = importlib.util.spec_from_file_location("steroids_router_goldens", _ROUTER_PATH)
router = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(router)

GOLDEN = [
    # python-testing
    ("pytest fixture parametrization tdd", "python-testing"),
    ("pytest mock fixture methodology", "python-testing"),
    ("parametrize my test cases", "python-testing"),
    ("pytest coverage requirement tdd", "python-testing"),
    ("pytest parametrization strategy requirement", "python-testing"),
    # docker-patterns
    ("write a dockerfile", "docker-patterns"),
    ("harden container network volume", "docker-patterns"),
    ("docker pattern local development cli", "docker-patterns"),
    ("docker volume mounts", "docker-patterns"),
    ("debug container cli harness", "docker-patterns"),
    # golang-testing
    ("table driven go tests", "golang-testing"),
    ("go subtests t.Run", "golang-testing"),
    ("golang benchmark table subtest", "golang-testing"),
    ("golang fuzz subtest tdd", "golang-testing"),
    ("test coverage for golang package", "golang-testing"),
    # rust-patterns
    ("idiomatic rust ownership trait", "rust-patterns"),
    ("rust concurrency safe performant", "rust-patterns"),
    ("idiomatic rust error handling", "rust-patterns"),
    ("ownership move semantics rust", "rust-patterns"),
    ("rust trait bounds generics", "rust-patterns"),
    # code-review
    ("code review branch commit merge", "code-review"),
    ("review change commit branch", "code-review"),
    ("review change clump base branch", "code-review"),
    ("review change axe base branch", "code-review"),
    ("code review branch tag merge", "code-review"),
    # accessibility
    ("screen reader labels", "accessibility"),
    ("wcag keyboard aa level", "accessibility"),
    ("color contrast audit", "accessibility"),
    ("wcag aa inclusive ui", "accessibility"),
    ("wcag aa build ui", "accessibility"),
    # postgres-patterns
    ("brin index for large tables", "postgres-patterns"),
    ("slow postgres query index", "postgres-patterns"),
    ("attname attnum catalog index", "postgres-patterns"),
    ("postgres index indkey brin", "postgres-patterns"),
    ("pg catalog index contype", "postgres-patterns"),
    # django-celery
    ("celery beat schedule", "django-celery"),
    ("django background tasks", "django-celery"),
    ("celery retry backoff", "django-celery"),
    ("periodic django job", "django-celery"),
    ("celery canvas workflow", "django-celery"),
    # resolving-merge-conflicts
    ("merge conflict markers", "resolving-merge-conflicts"),
    ("rebase conflict resolve", "resolving-merge-conflicts"),
    ("resolv rebase hunk broke", "resolving-merge-conflicts"),
    ("resolve hunk incompatible rebase", "resolving-merge-conflicts"),
    ("rebase broke hunk need", "resolving-merge-conflicts"),
    # e2e-testing
    ("e2e playwright flaky ci", "e2e-testing"),
    ("e2e integration artifact ci", "e2e-testing"),
    ("e2e page object configuration", "e2e-testing"),
    ("e2e page object flaky", "e2e-testing"),
    ("e2e page object model ci", "e2e-testing"),
    # api-design
    ("rest endpoint naming", "api-design"),
    ("pagination cursor rules", "api-design"),
    ("api design includ nam code", "api-design"),
    ("http status codes guide", "api-design"),
    ("rest design error response", "api-design"),
    # kubernetes-patterns
    ("kubernetes liveness probe", "kubernetes-patterns"),
    ("kubernete workload rbac probe", "kubernetes-patterns"),
    ("kubernete kubectl debugg production", "kubernetes-patterns"),
    ("kubernete workload production debugg", "kubernetes-patterns"),
    ("kubernete configmap kubectl", "kubernetes-patterns"),
    # canvas
    ("obsidian canvas layout", "canvas"),
    ("spatial notes board", "canvas"),
    ("mindmap my notes", "canvas"),
    ("visual canvas rearrange", "canvas"),
    ("obsidian json board create", "canvas"),
    # prompt-optimizer
    ("prompt analyze intent gap", "prompt-optimizer"),
    ("optimize my system prompt", "prompt-optimizer"),
    ("prompt optimizer ecc identify", "prompt-optimizer"),
    ("prompt optimizer identify gap", "prompt-optimizer"),
    ("optimizer gap ecc component", "prompt-optimizer"),
    # fastapi-patterns
    ("fastapi pydantic v2 schema", "fastapi-patterns"),
    ("fastapi dependency injection", "fastapi-patterns"),
    ("fastapi async handler dependency", "fastapi-patterns"),
    ("fastapi project structure handler", "fastapi-patterns"),
    ("httpx test client", "fastapi-patterns"),
    # rust-testing
    ("rust unit tests", "rust-testing"),
    ("rust unit integration property", "rust-testing"),
    ("mock in rust tests", "rust-testing"),
    ("rust test coverage", "rust-testing"),
    ("async rust tests", "rust-testing"),
    # cpp-testing
    ("gtest flaky suite", "cpp-testing"),
    ("googletest mocks", "cpp-testing"),
    ("ctest parallel run", "cpp-testing"),
    ("c++ googletest ctest flaky", "cpp-testing"),
    ("gmock expectations", "cpp-testing"),
    # kotlin-testing
    ("kotest behavior spec", "kotlin-testing"),
    ("mockk verify calls", "kotlin-testing"),
    ("kotest mockk coroutine coverage", "kotlin-testing"),
    ("kover coverage kotlin kotest", "kotlin-testing"),
    ("kotlin kotest mockk idiomatic", "kotlin-testing"),
    # csharp-testing
    ("csharp test pattern organization", "csharp-testing"),
    ("moq mock interface dotnet", "csharp-testing"),
    ("csharp fluentassertion mock net", "csharp-testing"),
    ("arrange bogus data befalse", "csharp-testing"),
    ("fluentassertions arrange moq", "csharp-testing"),  # B-12: was bare "fluentassertions should" (1 trigger, 0.008 margin coin-flip vs csharp-pro); 3 real triggers now
    # django-patterns
    ("django orm n plus one", "django-patterns"),
    ("django drf orm cach", "django-patterns"),
    ("django middleware order", "django-patterns"),
    ("django signal middleware architecture", "django-patterns"),
    ("django drf rest api design", "django-patterns"),
]

assert len(GOLDEN) == 100, len(GOLDEN)
assert len({e for _, e in GOLDEN}) == 20, len({e for _, e in GOLDEN})


def build_live_idx():
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
    missing = sorted({e for _, e in GOLDEN if e not in idx})
    if missing:
        print(f"MISSING FROM INDEX: {missing}")
        return 1
    bad = []
    for q, exp in GOLDEN:
        top = router.route_query(q, rules, idx)
        got = [s for _, s, _ in top]
        if got[:1] != [exp]:
            bad.append((q, exp, got[:3]))
    print(f"n={len(GOLDEN)} skills={len({e for _, e in GOLDEN})} misses={len(bad)}")
    for q, exp, got in bad:
        print(f"  MISS exp={exp} got={'/'.join(got) if got else '-'} :: {q[:60]}")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
