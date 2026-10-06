# NOTICE — vendored Coucou study snapshot

This directory is a **read-only study snapshot** of
[Louis-CFM/coucou](https://github.com/Louis-CFM/coucou), taken 2026-10-04
from the local checkout `/tmp/opencode/coucou-study` (rescued into the
Steroids repo so the v0.1.1 island study survives reboots).

- **Source code**: MIT License — see `LICENSE` (Copyright (c) 2026
  Louis Raillé).
- **NOT included / excluded**: the Mochi character, app icons,
  `Assets.xcassets/`, sounds, `docs/media/` and `design/` imagery. Those
  are reserved by `LICENSE-ASSETS.md` (all-rights-reserved except stated
  uses) and were stripped before vendoring — verified 0 binary media
  files at copy time. The names "Coucou" and "Mochi" appear only as
  attribution inside this snapshot; Steroids itself ships its own mascot
  art (`island/mascot.js`, `docs/img/logo.svg`).

Steroids references Coucou's motion values and FSM transitions in
`island/fsm.js`, `island/mascot.js` and `island/app.py` under the MIT
license, with states renamed (hidden | flex | jacked | pump).

To re-sync: copy a fresh Coucou checkout here again, excluding the same
asset globs (see the vendoring command in `docs/HANDOFF-2026-09-25-backlog.md`
or re-run: rsync with `--exclude` for `.git`, media, `Assets.xcassets`,
`sounds`, `design`).
