# Contributing to Steroids

Process authority: `docs/TASK_SYSTEM.md` — task hierarchy (§1), task file
format (§2), Definition of Ready (§3) and Definition of Done (§4),
execution protocol (§5). A task missing any required field is not ready;
do not start it.

## Ground rules

- Scoped runs, concurrency 1. The repo makes no model calls and holds no
  keys — host-side runs bill to the operator's own CLI account.
- Golden snapshot (`benchmarks/golden-1265/`) is never touched.
- Stdlib first; new dependencies need a stated reason.
- Commit locally; **do not push** — the maintainer integrates.

## Workflow

1. Pick a deps-met card with all DoR fields true.
2. Resume checks first: `git log --oneline -6`, baseline tests green.
3. Smallest diff that closes the card; nothing speculative.
4. Verify: `python3 -m unittest discover -s tests -p "test_*.py"`
   (full suite ~5 min) or the scoped test file for the lane you touched.
5. Commit message: `<type>(<scope>): <what> (<RQ-tag>)`,
   e.g. `feat(privacy): D-2 correction command (RQ-6)`.
   Types seen in history: `feat docs fix ci data`.

## What good looks like

- One card = one commit, files limited to the card's stated surface.
- Reports carry paths + live proof, not summaries of intent.
- Limitations written honestly (variance reported, not hidden).

## skill-rules.json formatting discipline

- Never reserialize the whole file: semantic edits keep the existing style
  (compact inline tables); format-only changes go in their own commit.
- Overrides must use pre-stemmed spellings (`slipping` not `slip`,
  `spinning` not `spin`) or they silently never match — see router `stem()`.
- Hyphenated overrides are dead tokens: the tokenizer splits on hyphens,
  so `poly-pizza` never matches query tokens `poly`+`pizza`. Write the
  split forms (`poly`, `pizza`) in triggers and NEG sets.
- Every new trigger batch needs 3 adversarial probes (trigger + unrelated
  domain); any hijack = NEG entry before merge.

## Sheet freeze (human order 2026-10-11 — standing until human says "unfreeze")

Top-center positioning + sheet geometry are locked. The island sits
top-center (compositor-owned via `island-app/kwin-pin.js`), one fixed
window (panel/strip + per-view heights, all constants in
`island-app/main.js`), renderer reports state only. It is verified
working — do not "improve", retune, or re-measure it.

- PERMISSION: only the human unlocks. No agent infers, assumes, or
  grants itself permission — when in doubt, LOOK at frozen code but do
  not touch it. An unlock happens only when the human explicitly tells
  an agent to unlock, in so many words. Until then the freeze holds no
  matter what the task seems to require; route around it or ask.

- Hash-enforced (fail the build on touch): `island-app/main.js`,
  `island-app/kwin-pin.js`, `island-app/preload.js`, `island-app/run.sh`,
  `island-ui/src/fsm.ts`. Gate: `python3 tests/test_sheet_freeze.py`.
- Hands-off zones (no gate, still frozen): `App.tsx` footprint/cover/shell
  regions, `index.css` `#island` / `.stage.app` / `.navbar.pc` / body-cap
  rules, `Island.tsx` shell markup (`#island` attrs, `jacked-body` wrap).
- Content inside the sheet (views, chat, approvals, mascot art) is NOT
  frozen — work there freely.
- Human-ordered change to frozen code: regenerate the manifest with the
  command printed by the failing test, then re-run it green.
