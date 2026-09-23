# Steroids

![offline-first](https://img.shields.io/badge/offline--first-yes-7ee787) ![P@1 blind-149](https://img.shields.io/badge/P%401_0.933-1f6feb) ![telemetry](https://img.shields.io/badge/telemetry-zero-8b949e)

Universal skill router plugin for AI coding harnesses. **Steroids is not a model** — it indexes the skills already installed on your machine and recommends the relevant ones for each prompt.

[Router architecture diagram](docs/architecture.html) (interactive, explorable).

## 30-second quickstart

```bash
git clone <repo> steroids && cd steroids
python3 src/steroids/router.py --count        # live count: 1265 (~0.3s); run it, don't trust docs
python3 src/steroids/router.py "build a flutter mobile app"
# -> build,flutter -> dart-flutter-patterns/...
bash install.sh                               # deploy binary + hooks (optional)
bash scripts/demo-serve.sh                # demo on :8903, auto-closes with the CLI
```

`steroids "query"` prints a short hint like `build,flutter -> dart-flutter-patterns/...`. Load what applies, skip the rest.

### First-run edge states

Works from a clean checkout with zero install (the `install.sh` binary
copy is convenience). Four states, all demoed in [`demo/edge-states.md`](demo/edge-states.md):

- **No skills** — preflight refuses the install (exit 1) before copying anything; an empty index would be useless.
- **No embed model** — install proceeds with a loud warning; routing falls back to lexical-only.
- **Thousands of skills** — 3915 indexed in ~4s, queries sub-second; scale is linear-ish, not a cliff.
- **Pure-noise query** — prints `no confident skill — abstaining` (exit 0) and logs it hash-only for later mining; near-misses still route by design.

Note: `install.sh` runs the eval gate first, and the gate is calibrated
to the dev machine's exact index + warmed memory — a fresh machine with
a different skill set can be refused on precision grounds. Refusal lands
before any file is copied, so retrying after syncing skills is safe.

## Results (verified 2026-09-23; live index 1265 skills — re-run `steroids --count`)

| Eval | n | precision@1 | precision@3 | exclusion-leaks | MRR | MAP |
|---|---|---|---|---|---|---|
| Blind (in-script GOLDEN, `tests/blind_eval_100.py`) | 149 | 0.799 | 0.960 | 0 | — | — |
| Live probe (`tests/live_probe.py`) | 16 | 0.875 | 0.812 | 2 | — | — |
| Blind second set, stranger-style (`tests/blind_eval_second.py`) | 315 | 0.886 | 0.959 | 0 | 0.926 | 0.903 |

Re-run any time: `python3 tests/benchmark.py --live` (all three sets).

### Reproducible golden benchmark

`--live` measures against whatever is installed on your machine today.
`--golden` measures against a frozen snapshot so numbers stay comparable
across commits and machines:

```bash
python3 tests/benchmark.py --golden   # frozen 1265-skill snapshot (benchmarks/golden-1265/)
python3 tests/benchmark.py --check    # README claims match the snapshot metadata
```

`--check` fails if the README table drifts from `benchmarks/golden-1265/metadata.json`
(the class of error that once shipped 366-skill measurements under a 1265-skill header).

### Historical results

| Date | Index | blind149 P@1 / P@3 | Notes |
|---|---|---|---|
| 2026-09-20 | 366 skills | 0.933 / 0.993 | Pre-expansion index; embed rerank on. Smaller index, fewer distractors. |
| 2026-09-23 | 1265 skills | 0.799 / 0.960 | Current. Index grew 3.5×; same router beats the old one 0.799 vs 0.577 on this index. |

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

## Privacy

Steroids runs fully offline on your machine. Routine routing sends nothing anywhere: the served log (`served.jsonl`) stores only a hash of your prompt plus the trigger words it attempted — never the prompt text — and misses are mined locally into draft skill proposals a human must approve. If the router misses, one command files a correction straight into that miss pipeline: `steroids --correct what you asked --skill the-right-skill`. Sharing with a team pool is explicitly opt-in: nothing leaves your machine unless you pass `--team <pool.json>`.

## Limitations

- Keyword overlap, not semantic search — paraphrased prompts may miss.
- Only routes skills already installed and indexed; it can't fetch new ones.
- Hints are suggestions, not guarantees — the agent decides what to load.

## Demo

![Live demo: skill graph with mascot](docs/img/demo-graph.png)

Open `demo/skill-graph.html` in a browser — zero dependencies, works offline.
Regenerate its data from your live index with `steroids graph --export demo/graph.json`.
