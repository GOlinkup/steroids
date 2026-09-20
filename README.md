# Steroids

Universal skill router plugin for AI coding harnesses. **Steroids is not a model** — it indexes the skills already installed on your machine and recommends the relevant ones for each prompt.

## 30-second quickstart

```bash
bash install.sh
steroids --count
steroids "build a flutter mobile app"
```

`steroids "query"` prints a short hint like `build,flutter -> dart-flutter-patterns/...`. Load what applies, skip the rest.

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

Open `demo/skill-graph.html` in a browser — zero dependencies, works offline.
Regenerate its data from your live index with `steroids graph --export demo/graph.json`.
