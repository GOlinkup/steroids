# money audit — v0.1.1 money chain (read-only, adversarial, 2026-10-10, jim-mv1tlrtz)

Scope: real tree `/home/TWIG/steroids`. Zero edits. Foreign WIP live (104 files) — reads only.
Trust-boundary paths — no glossing. No live run (per tools ban): live behavior marked UNVERIFIED.

## Chain map

- **Subunit strings:** `island-ui/src/money.ts:3-14` `moneyCents` (int-only, throws on
  float/NaN, space-grouped, `R `/`-R `) — byte-parity with `island/gigs.py:23-33`
  (same space, same prefix, same `%02d`). Server sets both fields (`gigs.py:55`);
  native path int-enforces (`:44-48`, `add_native` rejects non-int).
  Render: `island-ui/src/gigs.tsx:36` `<em>{moneyLine(g)}</em>` (React text node — XSS-safe).
- **No-writes mirror:** `island-ui/src/mirror.ts` — pure `assembleMirror`, null → honest
  empty, `isEmptyProfile` on `user_id === ""`. No IO in module.
- **Unlink-empty:** `island-ui/src/App.tsx:735-743` `handleSignOut` clears
  account/avatar/name/msg; sync key deliberately survives (`:744-747` comment — device
  secret, not session). Holds.
- **Zero-network learn:** `island-ui/src/learn.ts` — zero imports (verified, none),
  localStorage-only, wired into `island-ui/src/firstrun.tsx:4` (Q8 observe-only default).
- **Fresh-install:** `firstrun.tsx` owns first-run; learn/test quarantine via injected
  store+clock. Live first-run flow UNVERIFIED (no serves).
- **Tests match tree:** `money.test.ts` (exact strings + shape + throws),
  `mirror.test.ts` (null-empty, assemble, no-invent), `learn.test.ts` (round-trip,
  skip, fresh-honest, week-sim rank). No drift found.

## Gap list (rating 9/10 → loops back)

1. **`LearnLog.observe()` unbounded, writes throw unguarded** (`learn.ts:38-43`).
   Every event appends forever; `setItem` throws on QuotaExceeded (or private-mode
   denial) straight into the UI caller — `read()` is try/caught, writes are not.
   Same family: `answer()` (`:61-68`) stores caller-sized values unvalidated.
   Fix: cap rows (e.g. keep last 500), wrap both writes in try/catch (memory-only fallback).
2. **`mirror.ts` is dead code** — zero imports tree-wide (only `mirror` hits are prose
   comments). No-writes holds vacuously; the live profile surface (`Account.tsx`,
   `sync.ts:profileIdentity`) never touches it. Wire it or delete it; tested dead code
   rots into drift.
3. **`assembleMirror` weak coercion** (`mirror.ts:39-46`): `avatar_url`/`bio` cast without
   `str()` check — non-string backend values pass through to `<img src>`; `gigs_done` /
   `gigs_saved` accept NaN/floats. Apply `str()` + finite-int guard.
4. **`moneyLine` prefers `money` verbatim** (`money.ts:34`): a bridge row with `money` set
   but `pay_cents` mismatched renders `money` unchecked. Server-computed in practice
   (`gigs.py:55`), same-origin bridge — low risk, but prefer recompute-from-cents when
   `pay_cents` is a valid int, verbatim only otherwise.
5. **Seed `pay_text` is third-party verbatim** (`gigs.py:96-104` → `moneyLine:38`).
   Documented by design ("seed text verbatim"), XSS-safe via text node — no action,
   recorded for the trust log.
6. **UNVERIFIED live:** fresh-install first-run, quota-full behavior, Remotive outage
   path (`remotive_rows` → `[]` read-only, looks right). Needs a served pass, not this audit.

## Rating: 9/10

One real fix family (#1, user-facing crash path on full storage) + one hygiene item (#2).
Everything else holds: subunit parity exact, no-float enforcement at both layers,
unlink clears, learn is network-free, tests honest.
