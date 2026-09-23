# Story S-50: Ship readiness (M10, RQ-6)

Outcome: install/uninstall verified clean on all 4 harnesses; M10 gate
reviewed against RQ-1..8 disposition (met/cut/deferred in writing).

Task R-1: Install matrix verification (M10, RQ-6)
Description: install.sh + verify-hooks.sh pass on fresh HOME for
  terminal, Antigravity, Claude Code, OpenCode; then full uninstall
  leaves zero traces (60-second off-ramp per product requirement).
Do-not-touch: live user config (use throwaway HOME)
Acceptance:
- [x] install green on all 4 harnesses from clean state
- [x] uninstall script removes binary, hooks, index, plugin (verified absent)
- [x] eval gate passes as part of install (existing behavior preserved)
Verification: HOME=/tmp/fakehome bash install.sh; uninstall; ls checks;
  bash scripts/eval_gate.sh
Dependencies: Task 2 (gate must be green to mean anything)
Files likely touched: scripts/uninstall.sh (new), install.sh (if gaps found)
RQ tag: RQ-6
Size: M

Task R-2: M10 gate review (M10, all RQs)
Description: walk RQ-1..8 disposition (met/cut/deferred), acceptance
  criteria ship-iff list, closeout record.
Do-not-touch: code and results (review only)
Acceptance:
- [ ] every RQ has a one-line verdict with evidence pointer
- [ ] deferred items carry evidence forward, assumptions struck
- [ ] sign-off line with date
Verification: read specs/release/gate-record.md end to end
Dependencies: all stories' retros
Files likely touched: specs/release/gate-record.md
RQ tag: RQ-6
Size: S
