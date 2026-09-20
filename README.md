# Steroids

![offline-first](https://img.shields.io/badge/offline--first-yes-7ee787) ![P@1 blind-149](https://img.shields.io/badge/P%401_0.933-1f6feb) ![telemetry](https://img.shields.io/badge/telemetry-zero-8b949e)

Universal skill router plugin for AI coding harnesses. **Steroids is not a model** — it indexes the skills already installed on your machine and recommends the relevant ones for each prompt.

[Router architecture diagram](docs/architecture.html) (interactive, explorable).

## 30-second quickstart

```bash
git clone <repo> steroids && cd steroids
python3 src/steroids/router.py --count        # Indexed skills: 366 (~0.3s)
python3 src/steroids/router.py "build a flutter mobile app"
# -> build,flutter -> dart-flutter-patterns/...
bash install.sh                               # deploy binary + hooks (optional)
```

`steroids "query"` prints a short hint like `build,flutter -> dart-flutter-patterns/...`. Load what applies, skip the rest.

## Results (verified 2026-09-20, 366 skills)

| Eval | n | precision@1 | precision@3 | exclusion-leaks | MRR | MAP |
|---|---|---|---|---|---|---|
| Blind (in-script GOLDEN, `tests/blind_eval_100.py`) | 149 | 0.933 | 0.993 | 0 | — | — |
| Live probe (`tests/live_probe.py`) | 16 | 0.938 | 0.812 | 3 | — | — |
| Blind second set, stranger-style (`tests/blind_eval_second.py`) | 315 | 0.886 | 0.962 | 0 | 0.927 | 0.912 |

Re-run any time: `python3 tests/blind_eval_100.py`, `python3 tests/live_probe.py`, `python3 tests/blind_eval_second.py`.

## Multi-harness support

| Harness | How it hooks in |
|---|---|
| Terminal CLI | `~/.local/bin/steroids` binary; pipe via stdin or `--json` |
| Antigravity | `PreInvocation` hook in `~/.gemini/antigravity-cli/hooks.json` via `--antigravity-hook` |
| Claude Code | `UserPromptSubmit` hook in `~/.claude/settings.json` |
| OpenCode | `steroids-plugin.ts`; index symlinked under `~/.config/steroids/` |

## How routing works

- **TF-IDF scoring** over indexed skill names, descriptions, and keywords.
- **Stemming** so `testing`/`tests` match the same skills.
- **NEG blocklist** filters out noise terms before scoring.
- **Name bonus** for direct skill-name mentions in the prompt.
- **Closed-loop memory + log** records which suggestions were useful and biases future routing.

## Limitations

- Keyword overlap, not semantic search — paraphrased prompts may miss.
- Only routes skills already installed and indexed; it can't fetch new ones.
- Hints are suggestions, not guarantees — the agent decides what to load.

## Demo

![Live demo: 366-skill graph with mascot](docs/img/demo-graph.png)

Open `demo/skill-graph.html` in a browser — zero dependencies, works offline.
Regenerate its data from your live index with `steroids graph --export demo/graph.json`.
