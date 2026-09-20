# Steroids Architecture

## Components

- **Router** (`src/steroids/router.py`, deployed as `~/.local/bin/steroids`): tokenize + stem (`toks`/`stem`), stopword + `glue` filter, keyword-overlap score `sum(1/df)` per hit + name bonus (`min(1.5, 1.0 * namehits)`) + memory bonus (`min(1.0, 0.2 * accepts)`). `NEG` gate blocks generic-trigger wins without a domain token (e.g. homelab-wireguard-vpn). Returns top `max_recommendations` (3, from `skill-rules.json`).
- **OpenCode plugin** (`plugins/opencode/steroids-plugin.ts`): `chat.message` hook extracts text parts (first 2000 chars), dedups identical prompt within 5s (`lastQ`/`lastT`), shells to `hook.sh` with `{prompt}`, prints hint via `console.log`. Also `session.created` (logs count) and `experimental.session.compacting` (preserves router note).
- **Log dedup** (`log_impression` in router.py): appends `{t, q, trigs, skills}` to `served.jsonl`; skips if same SHA12 query logged within 10s (checks last 4KB tail).
- **Canvas (retired)**: the tkinter surface was removed; `demo/skill-graph.html` is the single visual.
- **Stores** (all under `~/.config/opencode/plugins/steroids/`, see layout): `skill-index.json` (mtime-keyed cache `{mtimes, index}`), `skill-rules.json` (index_dirs, glue, manual keyword overrides, max_recommendations), `memory.json` (`{accepts, offsets}` from transcript `Skill` invocations), `served.jsonl` (impression log).

## Data flow per prompt

1. User prompt -> `chat.message` (OpenCode) or hook stdin JSON (`--antigravity-hook` / `--claude-hook` / `{prompt}`).
2. Antigravity path: `extract_prompt_from_transcript` reads `<USER_REQUEST>`; skips `invocationNum > 1`.
3. `learn(transcript_path)` updates `memory.json` accepts/offsets (last 200KB scan).
4. `get_index` rebuilds if mtimes changed; applies `skill-rules.json` keyword overrides.
5. `route_query` scores, applies `NEG`, takes top 3 -> hint `trigs -> names`.
6. Output: `console.log` hint (OpenCode), `injectSteps.ephemeralMessage` (Antigravity), or stdout / `--json` (CLI). Impression logged with 10s dedup.

## Symlink / install layout

- `~/.config/steroids -> ~/.config/opencode/plugins/steroids` (symlink; single live dir for index, rules, memory, log).
- `~/.config/opencode/plugins/steroids/hook.sh` forwards: `exec ~/.local/bin/steroids "$@"`.
- `~/.local/bin/steroids` = copy of `src/steroids/router.py`. Canonical source is this repo (`src/steroids/`); deployed copies are byte-identical at time of writing.
- Skill entry: `skills/steroids/SKILL.md` (CLI usage + integration points).

## Known ceilings

- Keyword overlap, not semantic: no embeddings; synonyms outside index/rules do not match.
- Canvas retired (see above).
