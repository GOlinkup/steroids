# Session handoff — 2026-09-25 · Steroids v1.1 backlog (STORY 3 of 3)

## Context
Buffy rated the current finetune 8/10 and completed its 3 landmines (see
STORY 1). This story is the **remaining backlog** — the ideas surfaced during
the duel reviews that no session has picked up yet, ranked by leverage.

## Backlog (ranked)

### 1. Attempts-to-PASS telemetry in the served log (medium effort, high value)
The v2.1 duel proved attempts-to-PASS is the metric that shows steroids'
real edge (better first attempts, faster convergence). The served log
(`~/.config/steroids/served.jsonl`) records impressions but nothing about
downstream rework. Add: after each accept, hash-linked follow-up serve
within N minutes counts as a rework signal. Then nightly reports can show
"hint→pass rate" per skill, not just serves.

### 2. Propagate the NEG-guard review to every new trigger batch (small, high value)
Landmine #1 happened because new triggers (`car`, `cinematic`, `render`)
landed with no NEG check. Add a step to the missloop apply ritual: for every
new trigger, run 3 adversarial queries (trigger word + unrelated domain);
any hijack = NEG entry required before merge. Could live in
`scripts/lint_skills.py` as a --neg-check pass over SKILLS_ADD diffs.

### 3. Stale live-rules guard (small, medium value)
Buffy hit this mid-session: repo `skill-rules.json` was edited while
`~/.config/steroids/skill-rules.json` (what the router actually reads) stayed
stale — routing tests silently tested old rules. Fix: `install.sh` should
print the sha8 of both files; `eval_gate.sh` should WARN when repo != live.
One-line compare in `scripts/preflight_check.py`.

### 4. Formatting discipline for skill-rules.json (tiny, hygiene)
The half-done finetune reserialized the whole file (1,086-line diff, ~90%
re-indent). House rule going forward: format-only changes in their own
commit; semantic edits keep existing indent style. Add a note to
CONTRIBUTING.md.

### 5. Miss-golden TTL (small)
`reports/miss-goldens-*.md` accumulate with TBD rows no human ever disposed.
Nightly report should list goldens older than 7 days still TBD, so the G61
queue drains or rows expire.

## Next actor instructions (fresh session, cold)
1. Verify STORY 1 landed (git log shows the two commits; golden bench PASS).
2. Pick item 1 (or 2 if you want a quick win).
3. House rules apply: stdlib only, no network in routing, don't touch
   benchmarks/golden-1265/* or router.py scoring core, run
   `python3 tests/benchmark.py --golden` before/after.
4. Every change needs: blind-set verification numbers in the commit message
   (the repo's own convention — see tests/missloop2_proposals.py header).
