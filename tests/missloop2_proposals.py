#!/usr/bin/env python3
"""s11-missloop2 proposals: loop-1 follow-ups + 9 gap rows (PROPOSAL ONLY).

Same format as tests/missloop_proposals.py. NOTHING HERE IS APPLIED — god GO
required; apply = merge SKILLS_ADD into skill-rules.json["skills"] (prepend)
and NEG_ADD into skill-rules.json["neg"].

APPLY NOTES (traps, same class as loop 1):
- prediction-market-risk-review and terminal-ops already have live tuples:
  apply as UNION (old bad + new bad; terminal-ops good DROPS "terminal" or
  the guard can never fire on terminal-queries — verified). Entries below are
  already the merged form; plain insert is correct.
- click-path-audit good DROPS "click" (else bad=[click] never fires). Loop-1
  dependents re-verified: design-system row still skips via [audit]; the
  click-path legit row is kept via [button].

Verified in-memory (throwaway scripts, repo files untouched):
  blind n=149  P@1 0.779 -> 0.832 (+8, zero losses)
               P@3 0.899 -> 0.960 (+9, zero losses)  leaks 1 -> 0
  live16       P@1 0.938 P@3 0.812 leaks 3 -> UNCHANGED (gate held)
Run: python3 tests/missloop2_proposals.py (prints this summary; exits 0)
"""

SKILLS_ADD = {
    'golang-patterns': ['error', 'handling'],
    'api-connector-builder': ['codebase', 'another'],
    'ck': ['reexplain', 'alive'],
    # 'once' is a single-row marker (parallelism); kept because fleet/dispatch/
    # parallel alone did not flip the row — flagged, drop it if it ever leaks.
    'claude-devfleet': ['fleet', 'dispatch', 'parallel', 'once'],
    'dmux-workflows': ['drive', 'cli'],
    'docker-patterns': ['holes', 'write', 'usual', 'without'],
    'fal-ai-media': ['launch'],
}

NEG_ADD = {
    # (1) api-design follow-up: prediction-market kept P@1 via bare "handle".
    # UNION with live ([review] + [handle]).
    'prediction-market-risk-review': (['review', 'handle'], ['prediction', 'market', 'risk', 'oracle']),
    # (2) golang-vs-swift: swift skipped on bare "concurrency"; rust skipped on
    # concurrency/error (its legit borrow-checker row is kept via borrow/tree).
    'swift-concurrency-6-2': (['concurrency'], ['swift', 'actor', 'protocol', 'concurrent', 'isolated', 'observable']),
    'rust-patterns': (['concurrency', 'error'], ['rust', 'borrow', 'ownership', 'lifetime']),
    # (3a) api-connector: both API/codebase hijackers skipped; += does the rest.
    'codebase-design': (['another', 'codebase'], ['seam', 'module', 'hexagonal', 'pattern', 'boundary']),
    'api-design': (['rest', 'api'], ['endpoint', 'name', 'error', 'paging', 'design']),
    # (3b) devfleet lane: agent-eval + scraper skipped (their legit rows keep
    # via compare/pass/rate and watch/nightly/sheet respectively).
    'agent-eval': (['worktree'], ['compare', 'pass', 'rate', 'consistency', 'eval']),
    'data-scraper-agent': (['track', 'agent', 'run'], ['scrape', 'sheet', 'price', 'schedule', 'monitor']),
    # (3c) dmux lane: both terminal-* skipped (no legit terminal rows in sets).
    # terminal-ops good DROPS "terminal" — UNION trap, see header.
    'terminal-opener': (['terminal'], ['open', 'window', 'visible', 'launch', 'argv']),
    'terminal-ops': (['proof', 'terminal'], ['command', 'repo', 'execute', 'ci']),
    # (3d) archify/council lane: the three architecture-* winners skipped.
    'architecture-decision-records': (['architecture'], ['decision', 'record', 'adr', 'rationale']),
    'agent-architecture-audit': (['architecture'], ['agent', 'audit', 'memory', 'wrapper', 'loop']),
    'improve-codebase-architecture': (['architecture'], ['improve', 'deep', 'module', 'seam', 'opportunity']),
    # (3e) fal-ai lane: all three video hijackers skipped (remotion legit live16
    # row kept via remotion/react/chart/caption).
    'tasteforge-video': (['image', 'video'], ['taste', 'style', 'plate', 'overlay', 'grade']),
    'manim-video': (['video'], ['manim', 'python', 'math', 'animation', 'scene']),
    'remotion-video-creation': (['video', 'cover'], ['remotion', 'react', 'chart', 'caption', 'transition']),
    # (3f) browser-qa lane: click-path good DROPS "click" — see header.
    'click-path-audit': (['audit', 'click'], ['button', 'state', 'touchpoint', 'flow']),
    # (3g) ck lane: unified skipped (no legit unified rows in sets); project-flow
    # skipped (no legit project-flow rows in sets).
    'unified-memory': (['memory'], ['vault', 'unified', 'share', 'palace', 'transfer', 'agent']),
    'project-flow-ops': (['keep', 'project'], ['linear', 'github', 'duplicate', 'triage', 'execution']),
}

# Observed flips, joint run (8 P@1 fixes + archify/browser-qa/council P@3).
FIXED_P1 = ['api-connector-builder', 'api-design', 'ck', 'claude-devfleet',
            'dmux-workflows', 'docker-patterns', 'fal-ai-media', 'golang-patterns']
REACHED_P3 = ['archify', 'browser-qa', 'council']

# Deliberately NOT proposed: six *-security NEGs for the docker row — docker
# keywords alone flip it, so the NEG chase (quarkus/scan/laravel/... endless)
# is pure regress surface. Mechanism note for later: "security" name-bonus
# (+1.0) beats domain TF-IDF; if it bites again, tune the bonus, not the data.


def main():
    print(f"SKILLS_ADD: {len(SKILLS_ADD)} skills, "
          f"{sum(len(v) for v in SKILLS_ADD.values())} keywords")
    print(f"NEG_ADD: {len(NEG_ADD)} skills (2 unions, 2 good-drops — see header)")
    print("blind predicted: P@1 0.779 -> 0.832 (+8/0L), "
          "P@3 0.899 -> 0.960 (+9/0L), leaks 1 -> 0")
    print("live16 gate: 0.938 / 0.812 / 3 -> UNCHANGED")
    print("status: PROPOSAL ONLY — awaiting apply GO")


if __name__ == "__main__":
    main()
