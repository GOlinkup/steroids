# L-1 cron wiring (RQ-8)

One line, installed with `crontab -`:

```cron
30 2 * * * /home/TWIG/steroids/scripts/nightly.sh
```

What it does: `scripts/nightly.sh` runs `nightly_report.py` →
`mine_misses.py` → `trust_report.py`, appending to
`reports/cron-YYYY-MM-DD.log`. Any step failing writes
`reports/nightly-YYYY-MM-DD-ERROR.md` and exits 1 (drill-verified
2026-09-23 with a failing interpreter shim). Reports land dated in
`reports/`; `docs/TRUST.md` refreshes in place.
