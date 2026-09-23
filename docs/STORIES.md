# Steroids Stories — 100-item backlog

Source: router deep search + eval numbers (149-set P@1 0.705 / P@3 0.859, 315-set P@1 0.803 / P@3 0.917, leaks 0, unit 20/20 @ `f758d09`).
Shipped already: abstention gate, short tokens, 12 synonyms, ed1 typo fix, de-hijacked overrides, learn fallback, served cap, embed deploy.

## P00. Grounded execution loop (build FIRST — unlocks the 100)
End-to-end: skill declares `needs:` → Steroids fetches evidence (MCP-first, browser-fallback) → agent builds from real data → per-step proof gates. Kills hallucination + shortcut-taking at the seam where skills load.
- [x] P00a `needs:` declarations — parse from SKILL.md frontmatter into index; close: annotated skills (pdf, notion-spec-to-implementation, deep-research, exa-search), unit test.
- [x] P00b URL fetch + attach — extract URLs from prompt, fetch (timeout + size cap, stdlib), attach text; close: `steroids --gather` demo, no-network graceful fallback.
- [x] P00c MCP-first routing — need matched to MCP server when available; close: 1 real MCP need resolved end-to-end.
- [x] P00d Browser fallback — no MCP? headless fetch of JS/logged-out pages; close: 1 catalog-style page fetched.
- [x] P00e Proof gates — skill declares `proof:`; chain blocks on red; close: 1 two-step chain golden.
- [x] P00g `propose` — abstentions logged (attempted trigs, hash-only); clusters ≥2 into draft skill proposals for humans; close: unit + live abstain row. (Generation itself stays human — G61.)
- [ ] P00f Full loop demo — "build X" goes research→build→verify unassisted; close: recorded demo.

## How to close a story
1. Implement minimal diff in `src/steroids/` (+ `skill-rules.json` if data-only).
2. Add/extend test in `tests/test_router.py` (unit) and golden rows in `tests/blind_eval_100.py` if routing changes.
3. Run: `python3 tests/test_router.py`, `python3 tests/test_eval.py`, `python3 tests/blind_eval_100.py`, `python3 tests/blind_eval_second.py` — no P@1/P@3 regression, leaks 0.
4. `bash install.sh` + live probe the story's demo query.
5. Commit (`feat|fix(scope): ...`) with before/after numbers. Tick the box here in the same commit.

Status legend: `[ ]` open · `[~]` in progress · `[x]` done. Owner + date on close.

## Scoreboard
| Date | P@1/149 | P@3/149 | P@1/315 | Leaks | Note |
|------|---------|---------|---------|-------|------|
| 2026-09-22 | 0.705 | 0.859 | 0.803 | 0 | baseline @ 6511ad2 |
| 2026-09-23 | 0.705 | 0.859 | 0.803 | 0 | P00d+P00e + free/city/character NEG, unit 20/20, live 0.875/0.750/2, uncommitted |

## A. Auto-equip — from suggesting to loading
- [ ] A01 Confidence auto-inject — top-1 above threshold injects full SKILL.md via hook; close: demo + abstain-rate unchanged.
- [ ] A02 Ordered chains — return skill sequences with handoffs, not flat top-3; close: figma→frontend→deploy golden.
- [ ] A03 Section injection — inject only relevant SKILL.md section; close: ≥50% context saved on 5 probes.
- [ ] A04 Project pre-warm — detect repo stack at session start, preload 2–3 skills; close: demo on 2 repos.
- [ ] A05 Stall rescue — looping/error-spam triggers debugger-skill inject; close: golden stall query.
- [ ] A06 Auto-unequip — drop skills on topic pivot; close: context-size metric down, precision flat.
- [ ] A07 Specialist teams — 3 skills as 3 subagents, merged output; close: one demo task end-to-end.
- [ ] A08 Skill TTL — injected skills expire after N turns; close: expiry unit test.
- [ ] A09 Pre-auth check — missing env key warns once before load; close: stripe-no-key probe.
- [ ] A10 Dry-run preview — "what I'd load + why" mode; close: flag works, default off.

## B. Auto-context — the "goes and gets it" half
- [ ] B11 `needs:` declarations — skills list required inputs in frontmatter; close: 5 skills annotated, enforced.
- [ ] B12 URL snatch-and-fetch — extract + fetch links from prompt; close: docs-URL probe attaches content.
- [ ] B13 Screenshot auto-capture — visual task triggers headless capture; close: no-upload demo.
- [ ] B14 Repo file attach — auto-attach package.json/schema when needed; close: 3 probes.
- [ ] B15 Surgical questions — missing context → exactly one question; close: golden no-link Figma query.
- [ ] B16 API schema pull — stripe skill pulls live OpenAPI; close: version-skew test.
- [ ] B17 Figma node fetch — URL → node JSON + image in context; close: demo with real URL.
- [ ] B18 DB snapshot — "slow query" attaches schema + EXPLAIN; close: golden.
- [ ] B19 Error-tail attach — stack trace pulls source lines; close: golden.
- [ ] B20 Calendar attach — meeting prep pulls doc + notes; close: demo.

## C. Learning — ranking that compounds
- [ ] C21 Real accept tracking — per-harness skill-invocation parsing; close: accepts ≫1/week.
- [ ] C22 Outcome tracking — rank by task success post-load; close: metric defined + 1 consumer.
- [ ] C23 Per-project profiles — repo-local ranking overlay; close: same query ranks differently per repo.
- [ ] C24 Time decay — accepts fade; close: unit test with fake clocks.
- [ ] C25 Downvotes — loaded-but-unused demotes; close: golden.
- [ ] C26 Auto-retirement — 90-day zero-outcome quarantine; close: dry-run report first.
- [ ] C27 Ranking A/B — 10% traffic to ranker v2; close: harness + 1 experiment run.
- [ ] C28 Taste profile — user pick bias (Tailwind>MUI); close: golden pair.
- [ ] C29 Team learning — shared org accept pool; close: design doc + opt-in flag.
- [ ] C30 Drift alerts — silent-star skill pings author; close: report script.

## D. Eval & quality — trust machinery
- [ ] D31 Per-skill goldens — each skill ships 5 queries, CI enforced; close: 20 skills covered.
- [x] D32 Install gate — install.sh refuses deploy on eval regression; close: forced-fail demo. (Kevin 2026-09-23, r338)
- [ ] D33 Adversarial bank — typos/paraphrase per skill; close: 50 rows.
- [ ] D34 Golden rotation — monthly held-out swap; close: rotation script + log.
- [x] D35 Live dashboard — nightly P@1/P@3/leaks from served.jsonl; close: first report committed. (Kevin 2026-09-23, r332)
- [ ] D36 Miss mining — abstention clusters → proposed goldens; close: run on current served log.
- [ ] D37 Thumb votes — 👍/👎 on hints wired to accepts; close: end-to-end vote flow.
- [ ] D38 Token cost per skill — context cost ledger; close: top-10 hogs listed.
- [ ] D39 Latency SLO — route p99 <100ms @5000 skills; close: bench script + number.
- [ ] D40 Canary routing — 5% traffic, auto-rollback; close: design + flag.

## E. Multi-agent & orchestration
- [x] E41 Dispatcher mode — subtasks to subagents with skills; close: 1 demo task. (Kevin 2026-09-23, r343)
- [x] E42 Skill-pinned agents — agent never drops its skill; close: golden. (Kevin 2026-09-23, r343)
- [x] E43 Skill council — 3 skills debate, judge picks; close: 1 hard-call demo. (Kevin 2026-09-23, r343)
- [x] E44 Typed handoffs — A-output validated vs B-input; close: schema + 1 chain. (Kevin 2026-09-23, r343)
- [x] E45 Skill wallets — 2-skill cap per subagent; close: enforcement test. (Kevin 2026-09-23, r343)
- [x] E46 One index, every harness — shared rank + learning; close: 2 harnesses same result. (Kevin 2026-09-23, r336)
- [x] E47 Sandboxed skills — restricted tools for untrusted; close: policy + 1 demo. (Kevin 2026-09-23, r343)
- [x] E48 Token budgets — per-skill session cap; close: cap triggers in test. (Kevin 2026-09-23, r343)
- [x] E49 Priority lanes — P0 skills bypass abstention; close: golden + abuse test. (Kevin 2026-09-23, r343)
- [x] E50 Fallback chains — A fails → B with error attached; close: golden. (Kevin 2026-09-23, r343)

## F. Canvas & UX — make it visible
- [ ] F51 Live fire display — blobs ignite on route; close: demo gif.
- [x] F52 Click-to-inject — click blob loads skill; close: works against live index. (Kevin 2026-09-23, r344)
- [x] F53 Drag-a-prompt — drop text, watch ripple; close: demo. (Kevin 2026-09-23, r344)
- [x] F54 Graph explorer — 1265 nodes zoom/pan/search; close: loads <2s. (Kevin 2026-09-23, r344)
- [x] F55 Fire heatmap — hot glow, dead dim; close: served-driven colors. (Kevin 2026-09-23, r344)
- [x] F56 Session replay — scrub routing history; close: 1 session replayed. (Kevin 2026-09-23, r344)
- [x] F57 Voice in — speak → equipped; close: demo. (Kevin 2026-09-23, r344)
- [x] F58 Phone approver — approve injects remotely; close: design only. (Kevin 2026-09-23, r344)
- [x] F59 Menubar widget — fire-rate + top skills; close: running widget. (Kevin 2026-09-23, r344)
- [x] F60 Stack tour — new-user top-skills brief; close: 2 stacks demoed. (Kevin 2026-09-23, r344)

## G. Authoring & ecosystem
- [x] G61 Skill generator — task description → SKILL.md + goldens; close: 1 generated skill passes D31. (`draft` writes template + nearby refs to drafts/ (never indexed); goldens per generated skill still open.)
- [x] G62 Skill linter — frontmatter/freshness/collisions; close: lints all 1265, report committed. (Kevin 2026-09-23, r334)
- [x] G63 Skill doctor — "why won't mine fire?" analyzer; close: 3 diagnosed cases. (Kevin 2026-09-23, r345)
- [x] G64 Duplicate detector — overlap → merge proposal; close: top-10 dup pairs listed. (Kevin 2026-09-23, r345)
- [x] G65 Versioning + pins — per-project pins; close: pin respected in test. (Kevin 2026-09-23, r345)
- [x] G66 Marketplace — publish/subscribe one command; close: design doc. (Kevin 2026-09-23, r345)
- [x] G67 Ratings — outcome-backed stars; close: metric defined. (Kevin 2026-09-23, r345)
- [x] G68 Author analytics — fires/accepts/outcomes per skill; close: first report. (Kevin 2026-09-23, r345)
- [x] G69 Auto-changelog — index-diff digest; close: generated from last reindex. (Kevin 2026-09-23, r345)
- [x] G70 Translation — inject-time language render; close: 1 skill × 2 languages. (Kevin 2026-09-23, r345)

## H. Team & enterprise
- [x] H71 Role packs — designer/backend bundles; close: 2 packs defined. (Kevin 2026-09-23, r346)
- [x] H72 Clearance gating — restricted skills hidden; close: policy test. (Kevin 2026-09-23, r346)
- [x] H73 Audit trail — who loaded what/when; close: log format + 1 query. (Kevin 2026-09-23, r346)
- [x] H74 PII guard — customer-data prompts block analytics skills; close: golden red-team pair. (Kevin 2026-09-23, r346)
- [x] H75 Cost allocation — tokens per team/skill; close: first report from D38 data. (Kevin 2026-09-23, r346)
- [x] H76 Policy skills — security-review auto on auth diffs; close: golden. (Kevin 2026-09-23, r346)
- [ ] H77 Incident packs — outage bundle; close: 1 pack defined + drill.
- [ ] H78 Leaver continuity — custom skills retained; close: policy doc.
- [ ] H79 Federated indexes — N repos, one brain; close: 2-repo demo.
- [ ] H80 Air-gap mode — full offline box; close: offline install test.

## I. Proactive & ambient — skills before you ask
- [ ] I81 Watch mode — file events surface skills; close: Dockerfile demo.
- [ ] I82 Calendar-aware — meeting preload; close: demo.
- [ ] I83 Paste-to-route — stack-trace offered fix skill; close: golden.
- [ ] I84 Pre-commit hook — auth diffs get review comment; close: demo repo.
- [ ] I85 CI triage — red build → fix skill + logs; close: 1 real red build.
- [ ] I86 Dep upgrade — breaking-change summary skill; close: golden stripe-v16 style.
- [ ] I87 Clone-and-equip — new repo equipped pre-README; close: timed demo.
- [ ] I88 Idle reindex — background refresh; close: never-blocks proof.
- [ ] I89 Weekly digest — new/better skills for your stack; close: first digest generated.
- [ ] I90 Neglected nudge — unused-skill reminder; close: golden.

## J. Wild lab
- [ ] J91 Skill fusion — ephemeral 2-skill hybrid; close: 1 fusion demo.
- [ ] J92 Dream routing — offline precompute; close: cache-hit demo.
- [x] J93 Self-explaining — "picked X because tokens…"; close: hint format shipped. (Kevin 2026-09-23, r330)
- [ ] J94 Counterfactuals — "without X you'd miss Y"; close: 3 examples.
- [ ] J95 Time travel — replay past routing; close: CLI flag works.
- [ ] J96 Router-as-skill — self-indexed meta loop; close: "improve routing" routes inward.
- [ ] J97 Federated private learning — shared gradients, no prompts; close: design doc.
- [ ] J98 Skill bounties — market for expertise; close: design doc.
- [x] J99 Trust report — public abstention/precision page; close: first edition from D35. (Kevin 2026-09-23, r339)
- [ ] J100 Off-switch demo — refusing nonsense live; close: recorded demo.

## Closed this session (reference)
- [x] Abstention gate · short tokens · 12 synonyms · ed1 typo fix · de-hijacked overrides · learn fallback · served cap · embed deploy — `4e6f843` + `6511ad2`.
