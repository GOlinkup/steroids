# M10 gate review — RQ-1..8 disposition (R-2)

Date: 2026-09-23. Status: NO-GO (RQ-2 blocking). Evidence pointers inline;
every claim re-verifiable with the command next to it.

## Verdicts

- RQ-1 frozen golden green with trials + CIs: MET. `trial-stats.json`
  trials:3 deterministic, P@1 0.799 [0.732,0.859], P@3 0.960 [0.926,0.987];
   `bash scripts/eval_gate.sh` PASS. Closed 2026-09-24: `tests/test_benchmark.py`
   green (synthetic CI math), wired into `eval_gate.sh`.
- RQ-2 Host with/without-plugin separation: OPEN / BLOCKING. Bank 10/20
  (`specs/phase-0/task-bank.md`); grader recorder green
  (`scripts/phase0_harness.py --arm host+steroids`, no model calls); no P0-5 report.
  Kill criterion cannot be evaluated before the bank fills with real
  failures — never synthetic (P0-3 rule). Host-side runs bill to the
  operator's own CLI account, never the repo.
- RQ-3 kill-9 resume: MET. `python3 specs/phase-2/demo_durable.py` twice,
  same outcome, zero duplicate effects (`s1,s2,s3`, dupes none).
- RQ-4 run renders in unmodified dashboard: MET. `demo_m7.py` → 3 spans
   in stock Jaeger 1.62.0 via own HTTP API verdict. Closed 2026-09-24:
   `specs/builds/overhead-m7.md` PASS (tap adds no measurable cost, bar <5%).
- RQ-5 Utility-Under-Attack: PARTIAL. Local proxy green per ADR-004
  (`adversarial_bank.py` 50/50 top-3, `test_injection.py` 12/12).
  Full 97-task AgentDojo run deferred to V-next on the operator's bill.
- RQ-6 install/uninstall clean on 4 harnesses: PARTIAL. Uninstall in
  `install.sh` sandbox-proven (`610482a`); gate green. Live reinstall +
  full matrix unverified (R-1 boxes unticked).
- RQ-7 body-text decision: MET. ADR-003 KEEP desc-level / DEFER full-body
  with Δ numbers + near-dup audit; `--check` green.
- RQ-8 learning loop: NOT STARTED. One night of reports; no 3-night cron
  proof, no decision log (L-1..L-3 unticked).

## Ship-iff (planning §1) checklist

- [x] frozen golden green with trials + CIs
- [ ] Host with/without-plugin separation on 20 real tasks ← ship blocker
- [x] kill-9 resume demonstrated
- [x] run renders in unmodified OTel dashboard
- [ ] Utility-Under-Attack full run (proxy green, full capped/pending)
- [ ] install/uninstall clean on all 4 harnesses (sandbox only)
- [x] body-text decision recorded

## Deferred (evidence forward, assumptions struck)
- Full-bank P0-4/P0-5 waits on B-11..B-20 from real sessions; recorder
  proves the grader shape on B-02 (1 row, frozen clean).
- Full AgentDojo waits on a V-next operator-billed run; proxy pair is the standing metric.
- Live reinstall waits on a maintenance window (throwaway-HOME run).
- Paid evals SKIPPED for V1 (owner decision 2026-09-23): full 97-task
  AgentDojo + host-side task runs move to V-next on the operator's bill.
  V1 ships (if it ships) on proxy metrics + bank evidence, never on paid runs.

## V-next hold (user decision 2026-09-23: free-branch done, rest deferred)

- Router emits run/task IDs into served.jsonl (P1-2 box 2): needs a
  router-logging code change — held for next version, not V1.
- CP-1 schema+bus review record (P1-3 box 3): needs human review line.
- P1-4 live-run overhead: unmeasured, held (fixture + 80-col verified).
- PAT hygiene (LCH-3): DONE 2026-09-23 — all old tokens revoked, remote
  clean, helper=store, ~/.github_pat shredded, history scrubbed, new
  repo-scoped token verified via passwordless `git ls-remote`.
- install.sh has no Python-deps step (R-1 finding 2026-09-23): onnxruntime
  lives in HOME-dependent user site, so a fresh machine hits silent
  lexical fallback until `pip install onnxruntime numpy`. Fresh-HOME runs
  need that step documented or automated — held for next version.

Sign-off: GOlinkup, 2026-09-23.
