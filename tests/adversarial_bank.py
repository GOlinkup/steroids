#!/usr/bin/env python3
"""D33 adversarial bank: 50 typo/paraphrase rows (query, expected skill).

Bar: expected in top-3 (adversarial inputs; top-1 rate reported info-only).
Derived from D31 goldens: one typo variant + one paraphrase variant each.
Run: python3 tests/adversarial_bank.py. Exit 1 on any top-3 miss.
"""
import importlib.util
import json
import os
import sys

_HERE = os.path.dirname(os.path.abspath(__file__))
_ROUTER_PATH = os.path.normpath(os.path.join(_HERE, "..", "src", "steroids", "router.py"))
_RULES_PATH = os.path.normpath(os.path.join(_HERE, "..", "skill-rules.json"))

_spec = importlib.util.spec_from_file_location("steroids_router_adv", _ROUTER_PATH)
router = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(router)

BANK = [
    ("pytest fixtres parametrize", "python-testing"),
    ("how do I test with mocks pytest", "python-testing"),
    ("harder container network volume", "docker-patterns"),
    ("mutli container security", "docker-patterns"),
    ("golang benchmak table test", "golang-testing"),
    ("how fast is my golang benchmark", "golang-testing"),
    ("idiomatic rust ownrship", "rust-patterns"),
    ("safe concurrent rust", "rust-patterns"),
    ("code reveiw branch commit", "code-review"),
    ("who changed what in this review branch", "code-review"),
    ("wcag keybaord aa", "accessibility"),
    ("is my ui usable blind", "accessibility"),
    ("postgres suplabase query", "postgres-patterns"),
    ("which index for big tables", "postgres-patterns"),
    ("reslov rebase hunk", "resolving-merge-conflicts"),
    ("untangle my git rebase mess", "resolving-merge-conflicts"),
    ("e2e playwight flaky", "e2e-testing"),
    ("e2e page flow configuration", "e2e-testing"),
    ("rest paginaton design version", "api-design"),
    ("how to version rest endpoints", "api-design"),
    ("kubernete worklod probe", "kubernetes-patterns"),
    ("why is my kubernete pod crashlooping", "kubernetes-patterns"),
    ("obsidian json baord", "canvas"),
    ("arrange my notes json board", "canvas"),
    ("prompt intent anlysis", "prompt-optimizer"),
    ("identify the intent gap in my prompt", "prompt-optimizer"),
    ("fastapi pydantic scema", "fastapi-patterns"),
    ("async python fastapi handler", "fastapi-patterns"),
    ("rust unit integraton", "rust-testing"),
    ("test my rust crate", "rust-testing"),
    ("c++ gtest flakey", "cpp-testing"),
    ("native code tests", "cpp-testing"),
    ("kotest mock verfy", "kotlin-testing"),
    ("android unit tests", "kotlin-testing"),
    ("csharp xnut theory", "csharp-testing"),
    ("dotnet test project", "csharp-testing"),
    ("django orm cachnig", "django-patterns"),
    ("slow django queries", "django-patterns"),
    ("celery beat schedul", "django-celery"),
    ("background work django", "django-celery"),
    ("canvas json baord create", "canvas"),
    ("pytest coverge tdd", "python-testing"),
    ("docker patern local cli", "docker-patterns"),
    ("golang fuzz subtets", "golang-testing"),
    ("rust trait ownershp", "rust-patterns"),
    ("code reveiw branch tag base", "code-review"),
    ("aria wcag level aa audit", "accessibility"),
    ("postgres indx brin", "postgres-patterns"),
    ("merge hunk resolv rebase", "resolving-merge-conflicts"),
    ("e2e page objet ci", "e2e-testing"),
]

assert len(BANK) == 50, len(BANK)


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
    missing = sorted({e for _, e in BANK if e not in idx})
    if missing:
        print(f"MISSING FROM INDEX: {missing}")
        return 1
    bad, p1 = [], 0
    for q, exp in BANK:
        ranked = [s for _, s, _ in router.route_query(q, rules, idx)]
        p1 += ranked[:1] == [exp]
        if exp not in ranked[:3]:
            bad.append((q, exp, ranked[:3]))
    n = len(BANK)
    print(f"n={n} top3-misses={len(bad)} top1-rate={p1/n:.3f}")
    for q, exp, got in bad:
        print(f"  MISS exp={exp} got={'/'.join(got) if got else '-'} :: {q[:60]}")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
