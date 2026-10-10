# orbs audit — v0.1.1 orbs/lens-live surface (read-only, 2026-10-10, jim-mv1tlrtz)

Scope: real tree `/home/TWIG/steroids`. Zero edits. Foreign WIP live (103+ files) — reads only.
No live run needed; all findings static.

## Component/state map

- `island-ui/src/orb_state.ts` — pure mappers, no React. `orbFor(activity)` priority
  mic > turn > wire > queue > search > idle (`:22-29`); `chatOrbFor()` per-signal bubble
  design, bridge-down honesty first (`:35-47`). Imports `OrbState` type from `thinking-orbs`.
- `island-ui/src/orb.tsx` — `SafeOrb` (OrbGuard WebGL-failure fallback → CSS pulse, `:23-29`)
  + `ActivityOrb` (`:31-45`).
- Sole render site: `island-ui/src/components/Cards.tsx:412-417` (`chatOrbFor` select) →
  `:719` `<SafeOrb state={chatOrb} size={20}/>` in the `.reply.working` bubble.
- Audio: `island-ui/src/sound.ts` (synth blips + pack-file mode), `island-ui/src/music.ts`
  (bridge `/nowplaying` fetch/normalize/cache/merge/history, pure + tested).
- Voice: `island-ui/src/voicePlay.ts` (r-daily-voice-hook `a82cbe2`, T3-3 mirror).
- Tests: `island-ui/test/orb.test.ts` (69 lines, both mappers + priorities),
  `island-ui/test/music.test.ts` (145 lines, 17/17 at voice-hook time).
- Dep: `thinking-orbs ^0.3.2` (`island-ui/package.json:22`).

## Ranked bugs/gaps

1. **`ActivityOrb` dead export.** `orb.tsx:31` exported, zero imports tree-wide (grep clean).
   Only `SafeOrb` renders. Remove or wire — dead surface invites drift.
2. **`listening` state unreachable.** `IslandActivity.listening` + `orbFor` branch
   (`orb_state.ts:8,23`) + test (`orb.test.ts:29`) exist, but no producer anywhere sets
   `listening:true`. The listening orb design never shows user-visible.
3. **Sound-pack mode unfed.** `setPack` (`sound.ts:11`) has no caller (App imports only
   `Sound/setMuted/setVolume`); `pack` is always `{}` so `playFile` always misses and
   synth always plays. openpeon-compat path is dead code until something feeds it.
4. **Huddle cues silent.** `huddleConnect/huddlePop/huddleChime` (`sound.ts:50-52`) defined,
   zero callers. Huddle renders with no audio.
5. **`voicePlay.ts` unwired (known, by design).** Zero imports — Daily wiring gated on
   foreign WIP since `a82cbe2`. Revisit after Kevin's round-3 lands; not a regression.
6. **`chatOrbFor` regex false-positives (minor, user-visible).** `orb_state.ts:42`
   `/search|read|glob|grep|fetch|web|look|find|scout/i` matches ordinary prose
   ("looking", "find out", "web view") → wrong `searching` design on non-tool activity.
   Anchor to tool-verb prefixes or match the engine's activity taxonomy.
7. **No test-vs-tree drift.** `orb.test.ts` covers both mappers and the exact priority
   orders in-tree; `music.test.ts` covers normalize/merge/trackKey/cache. Nothing asserts
   `ActivityOrb`, `setPack`, or huddle cues — matches the dead paths above (tests honest).

## What's solid (no action)

Priority orders sane (scarcest attention wins; idle breathes). Bridge-down honesty.
OrbGuard fallback for no-GPU. Sound cues that matter all fire
(`send` App:1262, `pop` ×6, `approve` ×3, `deny` App:1941). Music poll guards
(no-store, sticky track, jitter freeze, private-mode-safe cache). `md()` XSS-safe.
