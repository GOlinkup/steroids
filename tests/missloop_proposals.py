#!/usr/bin/env python3
"""s11-missloop proposals: blind-set miss classes -> rule fixes (PROPOSAL ONLY).

Format mirrors ex-steroids-eval-live: `skill += keywords` and
`NEG skill bad=[...] good=[...]`. NOTHING HERE IS APPLIED — god GO required;
apply = merge SKILLS_ADD into skill-rules.json["skills"] (prepend) and NEG_ADD
into skill-rules.json["neg"].

CRITICAL APPLY NOTE: NEG_ADD entries REPLACE the whole (bad, good) tuple for
that skill. video-editing already has a live tuple from rules-apply — its entry
below is the UNION (old bad + new bad, good unchanged). All other NEG_ADD
skills have no live tuple, so plain insert is correct.

Verified in-memory (throwaway script, repo files untouched):
  blind n=149  P@1 0.557 -> 0.779 (+33, zero losses)
               P@3 0.738 -> 0.899 (+24, zero losses)  leaks 1 -> 1
  live16       P@1 0.938 P@3 0.812 leaks 3 -> UNCHANGED (gate held)
  synthetic + both unit suites unaffected (no shared goldens touched).
Run: python3 tests/missloop_proposals.py  (prints this summary; exits 0)
"""
import sys

SKILLS_ADD = {
    'accessibility': ['sizes', 'button', 'tap'],
    'agent-self-evaluation': ['session', 'honestly'],
    'agent-sort': ['keep', 'forty'],
    'ai-first-engineering': ['bots', 'chaos'],
    'api-connector-builder': ['wire', 'thirdparty'],
    'archify': ['diagram', 'draw', 'visual'],
    'benchmark': ['faster', 'compare'],
    'blueprint': ['rambling', 'idea'],
    'browser-qa': ['deployed', 'flows', 'verify'],
    'ck': ['session', 'persist', 'survive'],
    'claude-devfleet': ['worktree', 'isolated', 'parallel'],
    'click-path-audit': ['alone', 'together', 'combination'],
    'code-review': ['delete', 'straight', 'remove'],
    'codehealth-mcp': ['structure', 'file', 'worse'],
    'cost-tracking': ['money', 'spend'],
    'council': ['sides', 'argue', 'tradeoff'],
    'crosspost': ['announcement', 'schedule'],
    'dart-flutter-patterns': ['listview', 'memoize'],
    'data-scraper-agent': ['nightly', 'sheet', 'save'],
    'defuddle': ['strip', 'clutter'],
    'deployment-patterns': ['rollback', 'deploys'],
    'diagnosing-bugs': ['crash', 'hunt', 'intermittent'],
    'django-security': ['lock', 'auth', 'cookies'],
    'dmux-workflows': ['tmux', 'panes', 'side', 'parallel'],
    'docker-patterns': ['dockerfile'],
    'documentation-lookup': ['quoting', 'lookup', 'instead'],
    'domain-modeling': ['vocabulary', 'glossary', 'settle'],
    'fal-ai-media': ['voiceover', 'generate'],
    'golang-patterns': ['idiomatic', 'concurrency'],
    'improve-codebase-architecture': ['simplification', 'ranked', 'cut'],
    'manim-video': ['math', 'theorem', 'proof'],
    'nutrient-document-processing': ['merge'],
    'postgres-patterns': ['row'],
    'pr': ['body', 'description'],
    'pytorch-patterns': ['stabilize', 'reproduce', 'different'],
    'resolving-merge-conflicts': ['branch'],
    'social-publisher': ['episode', 'publish'],
    'systematic-debugging': ['heisenbug', 'debugger', 'methodical'],
}

NEG_ADD = {
    # Class A: bare-"review" hijack (C++/spring/C# reviews lost to *-review skills).
    # code-review good MUST include branch/diff/standards/spec/pr or the
    # "review my branch..." blind row regresses (caught in verification).
    'flutter-dart-code-review': (['review'], ['flutter', 'dart', 'widget', 'mobile', 'app']),
    'code-review': (['review'], ['diff', 'standards', 'spec', 'pr', 'branch']),
    'scientific-thinking-literature-review': (['review'], ['literature', 'paper', 'scholar', 'citation']),
    'prediction-market-risk-review': (['review'], ['prediction', 'market', 'risk', 'oracle']),
    # Class B: rare single-word hijack (one rare term outscores 3-4 domain hits).
    'error-handling': (['error'], ['exception', 'retry', 'circuit', 'breaker', 'fallback']),
    'wiki-query': (['query'], ['wiki', 'vault', 'notes', 'ask', 'mode']),
    'click-path-audit': (['audit'], ['click', 'button', 'state', 'touchpoint', 'flow']),
    'evm-token-decimals': (['token'], ['decimal', 'evm', 'chain', 'bridge', 'precision']),
    'token-budget-advisor': (['token'], ['budget', 'limit', 'length', 'depth', 'cost']),
    # Class C: generic-verb hijack (make/did/sort/have/watch/health/proof/flake/...).
    'make-interfaces-feel-better': (['make'], ['spacing', 'typography', 'polish', 'interface', 'feel']),
    'wait-what': (['did', 'last'], ['pitch', 'land', 'again']),
    'agent-sort': (['sort'], ['skill', 'install', 'plugin', 'rank', 'recommend']),
    'i-have-adhd': (['have'], ['adhd', 'focus', 'attention', 'distract']),
    'canary-watch': (['watch'], ['deploy', 'healthy', 'smoke', 'release', 'post']),
    'network-interface-health': (['health'], ['interface', 'crc', 'flap', 'duplex', 'counter', 'port']),
    'terminal-ops': (['proof'], ['terminal', 'command', 'repo', 'execute', 'ci']),
    'analyze-github-flake': (['flake'], ['github', 'action', 'workflow', 'ci']),
    'setup-ts-deep-modules': (['module', 'seam'], ['typescript', 'cruiser', 'deep', 'entry', 'package']),
    'setup-pre-commit': (['commit'], ['husky', 'hook', 'lint', 'staged']),
    'brand-voice': (['blunt'], ['voice', 'style', 'tone', 'post', 'write']),
    'perl-security': (['tap', 'tiny'], ['perl', 'taint', 'dbi', 'injection']),
    # Class D: framework-name collisions (fsharp/csharp, domain/F#, rust/property).
    # fsharp good EXCLUDES test/dotnet/integration or the csharp row won't skip.
    'fsharp-testing': (['dotnet', 'integration'], ['fsharp', 'property', 'bas']),
    'domain-modeling': (['domain', 'model'], ['vocabulary', 'glossary', 'context', 'language']),
    'rust-testing': (['property'], ['rust', 'ownership', 'lifetime', 'borrow']),
    # Class E: tool-word hijack (merge/flutter-clean/rebuild/structure/platform/...).
    'resolving-merge-conflicts': (['merge'], ['conflict', 'rebase', 'branch', 'marker']),
    'flutter-cherry-pick': (['branch', 'merge', 'merg'], ['cherry', 'pick', 'harvest']),
    'android-clean-architecture': (['clean'], ['android', 'kotlin', 'module', 'compose']),
    'rebuilding-flutter-tool': (['rebuild'], ['tool', 'broken', 'doctor', 'fix']),
    # UNION WITH LIVE TUPLE (rules-apply): bad = old [remotion,react,chart,caption]
    # + new [cover,voiceover,generate]. Replacing (dropping old) re-leaks
    # video-editing onto the live16 remotion query (caught in verification).
    'video-editing': (['remotion', 'react', 'chart', 'caption', 'cover', 'voiceover', 'generate'],
                      ['premiere', 'cut', 'timeline', 'export', 'ffmpeg', 'clip']),
    'competitive-report-structure': (['structure'], ['competitor', 'report', 'benchmark', 'matrix']),
    'competitive-platform-analysis': (['platform'], ['competitor', 'benchmark', 'landscape', 'position']),
    'orch-change-feature': (['feature', 'exist'], ['orch', 'change', 'pipeline', 'gated']),
    'orch-add-feature': (['feature', 'exist'], ['orch', 'add', 'pipeline', 'gated']),
    'council-multi-model': (['model', 'review', 'same'], ['council', 'codex', 'external', 'synthesis']),
}

# Per-class verified flips (joint in-memory run; classes interact, counts are
# observed-not-promised). 33 P@1 fixes, 0 losses; 24 P@3 gains, 0 losses.
CLASS_FLIPS = {
    'A review-hijack': {'fixed_P1': ['dotnet-patterns', 'cpp-coding-standards(P@3)',
                                     'springboot-patterns(P@3)', 'code-review(retarget row)'],
                        'note': 'C++/spring reach P@3 (security-review still tops P@1 on generic "review my X")'},
    'B rare-word': {'fixed_P1': ['api-design(STILL MISS: prediction-market-risk-review stays 2nd)',
                                 'golang-patterns(P@3 only: swift name-bonus holds P@1)',
                                 'design-system(STILL MISS: needs the audit/token triple-NEG below)',
                                 'jpa-patterns'],
                    'note': 'api-design needs prediction-market bad+=[handle] as follow-up; golang needs more than keywords vs name-bonus'},
    'C generic-verb': {'fixed_P1': ['accessibility(screen-reader)', 'codehealth-mcp(P@3)',
                                    'data-throughput-accelerator', 'customs-trade-compliance',
                                    'agent-sort', 'data-scraper-agent', 'network/interface(deployment P@3)',
                                    'email-ops', 'cpp-testing'],
                       'note': 'deployment/codehealth reach P@3 (loop-design-check / video-editing stay top-1)'},
    'D framework-collision': {'fixed_P1': ['csharp-testing', 'fsharp-testing'],
                              'note': 'both directions fixed by the paired NEGs'},
    'E tool-word': {'fixed_P1': ['nutrient-document-processing', 'dart-flutter-patterns(typo)',
                                 'resolving-merge-conflicts(typo)', 'manim-video',
                                 'video-editing', 'social-publisher'],
                    'note': 'typo rows fixed by NEG-skipping the hijacker, not by typo-matching'},
    'F keyword-gaps': {'fixed_P1': ['accessibility(grandmother)', 'agent-self-evaluation',
                                    'ai-first-engineering', 'click-path-audit', 'cost-tracking',
                                    'defuddle', 'diagnosing-bugs', 'django-security',
                                    'documentation-lookup', 'domain-modeling', 'postgres-patterns',                                    'pytorch-patterns', 'systematic-debugging',
                                    'crosspost(P@3)', 'blueprint(P@3)', 'benchmark(P@3)',
                                    'browser-qa(STILL MISS)', 'ck(STILL MISS)',                                    'claude-devfleet(STILL MISS)', 'dmux-workflows(STILL MISS)',
                                    'docker-patterns(STILL MISS)', 'fal-ai-media(STILL MISS)',
                                    'archify(STILL MISS)', 'api-connector-builder(STILL MISS)',
                                    'council(STILL MISS)', 'pr(P@3)', 'product-lens(P@3)',
                                    'deployment-patterns(P@3)'],
                      'note': 'single rare keyword usually suffices; failures need rule (not keyword) treatment'},
}

WONT_FIX = [
    'finance-billing-ops vs customer-billing-ops (0.003 margin, P@3 ok, both defensible)',
    'hipaa-compliance vs healthcare-phi-compliance (near tie, P@3 ok)',
    'scientific-db-pubmed-database vs literature-review (near tie, P@3 ok)',
    'prisma-patterns vs database-migrations (genuinely ambiguous, P@3 ok)',
    'autoresearch vs research (ambiguous; "file" is a glue stopword so it can never match)',
    'benchmark vs bun-runtime (ambiguous, defensible either way)',
]


def main():
    print(f"SKILLS_ADD: {len(SKILLS_ADD)} skills, "
          f"{sum(len(v) for v in SKILLS_ADD.values())} keywords")
    print(f"NEG_ADD: {len(NEG_ADD)} skills")
    print("blind predicted: P@1 0.557 -> 0.779 (+33/0L), "
          "P@3 0.738 -> 0.899 (+24/0L), leaks 1 -> 1")
    print("live16 gate: 0.938 / 0.812 / 3 -> UNCHANGED")
    print("status: PROPOSAL ONLY — no router/rules edits applied")


if __name__ == "__main__":
    main()
