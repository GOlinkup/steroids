# HANDOFF — shared learning phases 2 + 3 LANDED, 2026-09-25

Phase 2 (misses → shared rules) and phase 3 (GET cache + town visual) are
deployed and verified E2E end to end. Resume checks:
`python3 -m py_compile src/steroids/router.py src/steroids/share.py` (expect clean),
`curl -s "https://jqvpuyzawidrcwgnphqu.supabase.co/functions/v1/steroids-ping?fresh=1" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d['shared_rules'], [x['shared'] for x in d['domains']])"` (expect the ck cluster + a 1 in the shared list).

## Phase 2 state (all verified working)
- Migration `20260925010000_steroids_corr_daily.sql` — PUSHED to prod.
- `steroids-ping` — DEPLOYED (v2). POST accepts `corrections:[{trig_key,skill,hits}]`; GET returns `shared_rules` = clusters with ≥3 distinct days (MIN_USERS=3), top 100 by hits.
- `share.py` — `_rollup_from_log` returns `(day, skills, corrections)`; corrections roll up from today's log rows where `correction` is set (trig_key = row trigs, hits aggregated). `_build_payload` guarantees valid POST even on corrections-only days (zero-counter skill rows). After a successful ping, `sync_shared_rules()` pulls `shared_rules` into `<base_dir>/shared-rules.json` (ADD-only, timestamps under `shared_rules_ts`). Rides the daily ping; no new marker logic.
- `router.py` — `_merge_shared_rules()` unions `shared-rules.json` into `rules["skills"]` in `load_rules()` (never shrinks/overwrites local trigs); `--sync-shared` CLI flag for manual runs.
- Tests: `tests/test_shared_learning.py` (13 cases, no network). Full suite green (202 tests).
- E2E verified: seeded ck cluster on 3 distinct days (23/24/25 Sep) → hub `shared_rules` shows `{trigs:[memory,vault,persist], skill:ck, weight:3}` → synced → `router.py "my memory vault ..."` now hits `ck` (memory was NOT a local ck trig before).
- install.sh gate passed; hooks live; deployed binary has --sync-shared.
- First live cluster in prod = ck (memory/vault/persist). 

## Where this thread started
Steroids Town shows live global learning counts. Landed earlier this thread
(all verified working, deployed to production Supabase project
`jqvpuyzawidrcwgnphqu` = Maldrive's):

- `Maldrive/supabase/migrations/20260925000000_steroids_learn_daily.sql` — PUSHED to prod.
  Table `steroids_learn_daily` (PK day+skill, CHECK caps, RLS insert-only for
  anon) + RPC `steroids_learn_add(jsonb)` (upsert-ADD, service-role only).
- `Maldrive/supabase/functions/steroids-ping/index.ts` — DEPLOYED (v1 of it).
  POST rollup `{day, skills:[{skill,serves,accepts,misses}]}` → atomic add.
  GET → merged totals + 12-domain aggregation + 28-day daily (no auth, CORS *).
- `steroids/src/steroids/share.py` — NEW. Daily rollup from served.jsonl +
  memory.json `seen`; once/day marker gate (`.last_ping`); POST to hub;
  `global_counts()` GET helper. Opt-out: `STEROIDS_NO_SHARE=1/true/yes/on`.
- `steroids/src/steroids/router.py` — `--ping`/`--force`/`--global-counts`
  CLI flags; `_maybe_daily_ping()` daemon thread fired from `log_impression()`
  after each impression (best-effort, never raises).
- `steroids/install.sh` — ships `share.py` to `~/.local/bin/` (and uninstalls it).
  Log cap raised 5,000→50,000 rows (10MB) for heavy users (miss-mining history).
- `steroids-town/step01-evolution.html` + `town-data.js` — page fetches hub GET
  (`TownData.hubUrl`), adds hub domain serves on top of baked FALLBACK, shows
  green "LEARNS WORLDWIDE" ticker (ease-out count-up; respects reduced motion).
- Deployed + verified E2E: seeded counters via curl, real `--ping` from live
  install returned `{ok:true, day:2026-09-25, skills:6}`, hub totals showed
  11 serves/2 accepts/1 misses, town page 200 with hub wiring.
- Anon key is hardcoded as default in share.py + town-data.js (public by
  design; RLS blocks raw reads). If rotated, update both.



## Rules earned (don't re-learn)
- Never make the plugin ping per prompt — daily marker gate is the cost model.
- Anonymous only: no prompts, no query text, no ids — trig tokens + counters.
- Hub writes via RPC only (REVOKE from public/anon; service_role executes).
- Town page: hub counts ADD on top of baked FALLBACK; never replace.
- Deploy = db push + functions deploy; check `supabase projects list` works
  first (CLI auth) — it was already linked this session.
- install.sh runs an eval gate — if it fails, deploy is refused; fix code.
- User has ADHD: keep answers short, one decision at a time.

## Phase 3 state (GET cache + town shared visual, verified)
- `steroids-ping` — DEPLOYED (v3). GET caches successes in-module for 60s
  (`CACHE_TTL_MS`), `?fresh=1` bypasses, responses carry `x-cache: HIT|MISS`,
  `x-isolate-reqs` (module-liveness probe) and `Cache-Control: public,
  max-age=60`. Honest note: at current near-zero traffic the platform serves
  every request from a fresh isolate (verified: 15/15 concurrent MISS,
  `x-isolate-reqs` always 1), so the in-memory layer only helps if the
  runtime starts reusing warm isolates under load; the browser-facing
  `Cache-Control` header is what actually saves calls today (Town fetches).
- GET `domains[]` rows now carry `shared` = per-domain count of hub-earned
  shared rules (derived server-side via the same `domainOf()` the page
  trusts — page and hub can never disagree).
- Town `step01-evolution.html`: hub merge sets `d.shared` per domain;
  info-card meta line shows "shared rules N"; info panel table has a shared
  column + total-prose line; ticker gained a "N SHARED RULES LEARNED
  WORLDWIDE" chip (hidden while 0). Verified: node dataflow sim against live
  hub (chip==table total==hub sum) + `node --check` on the module script.

## Open (phases 2+3 landed; next candidates)
- Watch first multi-user shared rules for noisy clusters before touching
  MIN_USERS (single-user data today — see phase 2 note).
- `--drift`/`--propose` reports feeding off the 50k log (already exist).
- Town: per-domain shared-rule count as a new visual (optional).
