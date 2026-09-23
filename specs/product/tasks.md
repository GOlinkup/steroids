# Story S-40: Product layer (supports positioning + adoption)

Outcome: a stranger can try Steroids in 5 minutes, understand its privacy,
correct it when wrong, leave cleanly, and compare it honestly. Covers the
8 product gaps (no new architecture).

Task D-1: First-run + empty states (product gap 2)
Description: design install → first routed prompt → wow moment, including
  zero-skills, 3000-skills, missing-embed, and abstain states.
Do-not-touch: router scoring
Acceptance:
- [ ] each of the 4 edge states has specified output (text mock in file)
- [ ] first-run path demoed on clean HOME, timed (<5 min to wow)
- [ ] states documented where users look (README quickstart)
Verification: run each state, paste outputs into handover
Dependencies: R-1 (install matrix informs states)
Files likely touched: README.md, src/steroids/router.py (messages only)
RQ tag: RQ-6
Size: M

Task D-2: Privacy promise + feedback door (product gaps 3, 4)
Description: one-paragraph plain-language privacy promise (what leaves the
  machine: nothing, except X) + a one-command "that route was wrong"
  correction path feeding mine_misses input.
Do-not-touch: log schemas (appenditive)
Acceptance:
- [ ] promise text in README, readable by a non-engineer (test: read aloud)
- [ ] correction command works end-to-end into the miss pipeline
- [ ] team-pool sharing explicitly covered (opt-in stated)
Verification: run correction command; show record landed for review
Dependencies: L-1 (miss pipeline exists)
Files likely touched: README.md, src/steroids/router.py (CLI flag)
RQ tag: RQ-8
Size: M

Task D-3: Comparison table + product metrics (product gaps 6, 7)
Description: honest feature table (native skill use vs MCP vs LangChain vs
  curated CLAUDE.md vs Steroids) + product metrics definition (installs,
  week-2 retention, time-to-wow, correction rate).
Do-not-touch: positioning claims elsewhere (table is the claim now)
Acceptance:
- [ ] table published where positioning lives, with row Steroids loses
- [ ] metrics defined with collection method each (no vanity metrics)
- [ ] at least one metric instrumented (correction rate via D-2 door)
Verification: read table (find the losing row); check metric query runs
Dependencies: D-2 (correction rate source)
Files likely touched: README.md or docs/POSITIONING.md, telemetry tap
RQ tag: RQ-8
Size: S
