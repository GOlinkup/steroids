# Story S-60: Launch readiness (post-M10, pre-public)

Outcome: repository passes OSS launch audits and OSPS baseline items;
CI gates every push; secrets hygienic; launch-day ops rehearsed. Nothing
here changes V1 scope — it certifies it.

Task LCH-1: CI workflow (launch gap 1)
Description: add .github/workflows/ running unit evals (test_router,
  test_eval, goldens), benchmark --check, and lint on every push/PR.
Do-not-touch: eval semantics (wire existing gates, invent none)
Acceptance:
- [ ] green run visible on the branch before merge
- [ ] failing --check blocks merge (stale-claim protection live)
- [ ] installer path (eval_gate.sh) still passes locally
Verification: open the Actions run URL; force-push a stale README to a
  scratch branch and watch it go red
Dependencies: Task 2 (benchmark --check exists)
Files likely touched: .github/workflows/ci.yml (new)
RQ tag: RQ-6
Size: S

Task LCH-2: Governance docs (launch gap 2)
Description: add CONTRIBUTING.md (OSPS-GV-03.01 contribution process),
  SECURITY.md (OSPS-VM-02.01 security contacts), CHANGELOG.md,
  CODE_OF_CONDUCT.md.
Do-not-touch: LICENSE (MIT stays)
Acceptance:
- [ ] all four files exist with real contacts and process (no placeholders)
- [ ] contribution path references the task system (docs/TASK_SYSTEM.md)
- [ ] security contact is a monitored address, verified by test mail
Verification: read each file; send test mail to security contact
Dependencies: None
Files likely touched: CONTRIBUTING.md, SECURITY.md, CHANGELOG.md,
  CODE_OF_CONDUCT.md (all new)
RQ tag: RQ-6
Size: S

Task LCH-3: Secret hygiene (launch gap 3)
Description: remove plaintext PAT from origin remote URL; move to git
  credential helper; scope-check token; rotate it (it appeared in tool
  outputs); secure or remove ~/.github_pat handling.
Do-not-touch: repo access for collaborators (coordinate rotation)
Acceptance:
- [x] `git remote get-url origin` shows no credentials
- [ ] push/pull work via helper on a fresh shell
- [ ] old token revoked/rotated; new token minimal scopes, recorded where
Verification: print remote URL; git ls-remote origin; show helper config
Dependencies: None (do first — live exposure)
Files likely touched: local git config only (no repo files)
RQ tag: RQ-6
Size: S

Task LCH-4: README launch sections (launch gap 4)
Description: add comparison, roadmap pointer, contributing pointer,
  license sections to README (repo-launch-check shape).
Do-not-touch: measured numbers (no claim changes)
Acceptance:
- [ ] comparison table includes one row Steroids loses (honesty rule)
- [ ] roadmap links V1_PLANNING milestones; contributing links the new file
- [ ] license section states MIT + what it permits
Verification: --check still green; read new sections aloud (plain language)
Dependencies: LCH-2 (files to link must exist)
Files likely touched: README.md
RQ tag: RQ-6
Size: S

Task LCH-5: Launch-day ops (launch gap 5)
Description: code freeze procedure, T+0–72h smoke checks, rollback
  rehearsal with measured time-to-rollback, support channel named.
Do-not-touch: release scope (ops only)
Acceptance:
- [ ] rollback rehearsed with timed result recorded (minutes, not hours)
- [ ] smoke-check list scheduled for launch window
- [ ] support channel named with a monitored owner
Verification: run rehearsal, paste timing; show schedule + owner
Dependencies: R-1 (install/uninstall baseline exists)
Files likely touched: specs/launch/ops-record.md (new)
RQ tag: RQ-6
Size: M

Task LCH-6: Scale number (launch gap 6)
Description: publish one documented load figure (pool size × latency p50/p99
  + harness), with method, on current hardware.
Do-not-touch: golden snapshot
Acceptance:
- [ ] figure published with method + hardware + commit hash
- [ ] p99 latency stated (not just mean)
- [ ] limitations section references it honestly
Verification: rerun load command from handover, same figure ±noise
Dependencies: Task 2 (bench runner exists)
Files likely touched: specs/launch/scale-record.md (new)
RQ tag: RQ-6
Size: S
