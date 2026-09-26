# Story S-31: Learning loop operations (RQ-8, continuous)

Outcome: nightly automation + morning review run as routine; benchmark
trends up on flat review load (the §25 success metric).

Task L-1: Cron wiring (RQ-8)
Description: schedule nightly_report.py + mine_misses.py + trust_report.py
  via cron; reports land in reports/ dated; failures notify (log line, not
  silence).
Do-not-touch: report contents logic (wiring only)
Acceptance:
- [ ] three consecutive nights produce dated reports unattended
- [x] a failed night leaves an explicit error marker (never silent absence)
- [x] scheduling documented (crontab line committed as docs snippet)
Verification: ls reports/nightly-*.md (3 dates); simulate failure → marker
Dependencies: none (scripts exist)
Files likely touched: docs/V1_PLANNING.md (cron snippet), crontab (local)
RQ tag: RQ-8
Size: S

Task L-2: Morning review practice (RQ-8)
Description: establish the 5-minute review: read nightly report,
  approve/reject/edit proposals, record one decision line.
Do-not-touch: proposals themselves (review, don't rewrite inline)
Acceptance:
- [ ] one week of dated decision lines (approve/reject + why, one line each)
- [ ] review time logged (must stay ~5 min or loop redesign triggers)
- [ ] approved items applied through backup-and-rebenchmark pattern only
Verification: grep decision log for 7 dated entries; check time log
Dependencies: L-1
Files likely touched: reports/decisions.md (new, append-only)
RQ tag: RQ-8
Size: S (practice, not code)

Task L-3: Trend audit (RQ-8)
Description: after 4 weeks, verify benchmark trends up AND review load flat;
  otherwise simplify per §25 rule.
Do-not-touch: historical reports (read-only input)
Acceptance:
- [ ] trend chart/table: golden P@1/P@3 + review minutes per week, 4 points
- [ ] verdict written (loop works / simplify X)
- [ ] simplification executed if verdict demands it
Verification: read trend record; check numbers trace to reports
Dependencies: L-2 (needs 4 weeks of practice)
Files likely touched: reports/learning-trend.md
RQ tag: RQ-8
Size: S
