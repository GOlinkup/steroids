# P0-5 baseline report (M4, RQ-2) — INSUFFICIENT DATA, no kill verdict possible

Source: `specs/phase-0/results.csv` rows 2–11 (5 tasks × 2 arms × 1 trial, dry-run grader-only, zero model calls).

## Per-arm means (n=1 per cell — CIs not computable)

| Arm | Grader pass | Wall mean (s) |
|---|---|---|
| model-only | 4/5 = 80% (B-05 skipped-not-allowlisted, not a fail) | 0.032 |
| model+steroids | 4/5 = 80% (same skip) | 0.028 |

Wall times measure grader overhead only (0.00–0.09s); tokens/cost columns are empty (host-side runs pending). Arms are indistinguishable on this data by construction — no model ran.

## Kill verdict: WITHHELD

Story S-00 requires 20 real tasks with CIs; we have 5 dry-run tasks, 1 trial, no model signal. Go / simplify / stop cannot be evaluated. Unblocks when: P0-4 harness runs the full bank host-side (20 tasks, ≥3 trials, tokens/cost filled).

## Human sign-off

- [ ] human sign-off: _____________ (go / simplify / stop + date)
