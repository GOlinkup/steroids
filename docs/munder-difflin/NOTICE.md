# NOTICE — Munder Difflin design study

Steroids ports **patterns** (not code) from
[HarnessMD/munder-difflin](https://github.com/HarnessMD/munder-difflin)
(MIT License, Copyright (c) Munder Difflin contributors), studied
2026-10-09 via its `HIVE.md` (multi-agent layer) and `SPEC.md`
(terminal/event plane):

- single-committer append-only log, single-writer-per-file inbox/outbox +
  router, FIPA-lite message schema with hop caps and terminal acts, task
  ledger, markdown-first memory, god-orchestrator escalation policy.

Reimplemented from scratch in stdlib Python (`island/hive.py`, wired
through `island/loop.py` and `island/bridge.py`) for our bridge stack —
their Electron/Node/tmux/SQLite code cannot run here and was **not**
copied. No vendored files, no assets, no names.

If verbatim code is ever ported, it lands here with its MIT header
intact per the license.
