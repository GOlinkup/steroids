# 100 hard capability tasks (non-Maldrive, stdlib-only, each independently verifiable)

Rules for every task: work in your own scratch dir, stdlib only unless stated, no network.
WITHOUT and WITH columns take PASS/FAIL + tries. Pilot 2026-09-29 (P1 limiter fix, P2 LRU+TTL build, P3 gaps-and-islands): WITHOUT 3/3 (tries 2,2,1), WITH 3/3 (tries 3,2,1, routed systematic-debugging/python-pro/clickhouse-io+ponytail). No separation; note: harness_p2 shipped with a syntax error both sides had to work around.

| ID | Task | Verify |
|---|---|---|
| A-01 | Median of two sorted arrays, O(log(min(m,n))), empty-array + single-element edges | harness 12 asserts green |
| A-02 | Sliding-window maximum O(n) deque, k=1, k=n, k>n edges | harness 10 asserts green |
| A-03 | Serialize/deserialize binary tree, preserve None-shape, 1M-node depth safety (no recursion limit crash) | roundtrip + deep-tree OK |
| A-04 | Regex matcher (. and *) DP, catastrophic patterns like a*a*a*b on 30-char strings finish <1s | result correct + time<1s |
| A-05 | LRU cache with TTL + hit/miss/eviction stats, O(1) ops, expiry on read and write | harness 15 asserts green |
| A-06 | Merge k sorted iterators lazily (generators, infinite-stream safe), no full materialize | memory-flat + order correct |
| A-07 | In-place next-permutation incl. duplicates + fully-descending wrap | 10 asserts green |
| A-08 | Longest substring without repeat, unicode + emoji grapheme edges | 8 asserts incl. emoji green |
| A-09 | Interval scheduler with priorities + preemption log, overlapping equal-priority tie-break by id | exact schedule output |
| A-10 | Consistent-hash ring with virtual nodes, <5% imbalance on 10k keys, minimal remap on node add | imbalance + remap numbers |
| A-11 | Topological sort that RETURNS the cycle path (not just error) on cyclic input | cycle path exact |
| A-12 | Big-int multiply (Karatsuba or FFT) beating naive on 2000-digit inputs, exact | correct + faster than naive |
| B-01 | PILOT P1: fix /tmp/cap-fixtures/buggy_limiter.py (token bucket, 3 planted bugs) so harness passes | /tmp/cap-fixtures/harness_p1.py green |
| B-02 | Fix closure late-binding in loop-created callbacks + mutable-default-arg cache leak in one file | both behaviors correct |
| B-03 | Fix naive-vs-aware datetime comparison crash + DST fold ambiguity in scheduler | no-crash + fold-correct output |
| B-04 | Fix shared-mutable-class-attribute state leaking between instances | independent instances proven |
| B-05 | Fix float-money rounding (0.1+0.2 style) by integer-cents refactor, totals exact | totals to the cent |
| B-06 | Fix off-by-one in binary search that only fails on even-length lists | failing case now passes |
| B-07 | Fix regex that ReDoSes on nested parens input; keep matches identical | same matches, <100ms |
| B-08 | Fix SQL string-interpolation injection without breaking LIKE-wildcard search | injection blocked, search works |
| B-09 | Fix lost-update race in file-based counter (no db); 50 parallel writers exact | final count exact |
| B-10 | Fix silent data loss: JSON roundtrip drops tuples/sets/datetime — preserve types | roundtrip type-exact |
| B-11 | Fix pagination that duplicates/skips rows under concurrent inserts (keyset, no OFFSET) | stable pages under churn |
| B-12 | Fix retry storm: exponential backoff + jitter + circuit breaker, thundering herd test | herd stays flat |
| C-01 | Gaps-and-islands: longest consecutive login streak per user incl. ties + single-day | exact rows |
| C-02 | Funnel conversion with 7-day attribution window, first-touch, NULL handling | exact percentages |
| C-03 | Dedupe events keeping earliest per (user,day) with microsecond ties broken by source rank | exact survivor set |
| C-04 | Running totals that reset on zero-crossing, partitioned by account | exact series |
| C-05 | Unicode-normalize + casefold email dedupe (ß, İ, composed vs decomposed) | exact unique set |
| C-06 | CSV parser for quoted multiline fields + escaped quotes + mixed line endings, no csv module | byte-exact parse |
| C-07 | Log parser: 1GB access log, top-10 IPs + p95 latency, <100MB RAM streaming | correct + RAM cap |
| C-08 | Timezone report: per-region daily active users across DST switch day (23/25h days) | exact counts |
| C-09 | Money ledger: double-entry, debits==credits invariant checker + violator report | violators exact |
| C-10 | Fuzzy join two 100k-row CSVs on names (typos), precision/recall vs provided labels | F1 >= 0.90 |
| D-01 | Thread-safe sliding-window rate limiter, 100 threads, exact allow counts | counts exact, no crash |
| D-02 | Producer/consumer with backpressure + graceful shutdown, zero message loss | loss=0, shutdown<5s |
| D-03 | Parallel map with per-task timeout + first-error-wins cancellation | semantics exact |
| D-04 | Readers-writer lock from primitives, writer-starvation-free, stress test | no deadlock, no starvation |
| D-05 | Async pipeline (3 stages) preserving order with out-of-order completion | order exact, speedup shown |
| D-06 | Fork-join recursive directory hasher, symlink-cycle safe, worker pool | hashes exact, no hang |
| D-07 | Dining-philosophers-style deadlock demo + fix, lock-ordering proof | fixed run 1000 cycles clean |
| D-08 | Token-bucket shared across processes (file lock), rate holds ±10% | measured rate in band |
| E-01 | PILOT P3: gaps-and-islands sessions query on /tmp/cap-fixtures/sessions.sql | exact expected rows in task file |
| E-02 | Self-join employee-manager hierarchy depth + cycle detection in SQL | depth + cycle rows exact |
| E-03 | Pivot rows-to-columns dynamically for unknown category set (SQL only) | pivot exact |
| E-04 | Delete duplicates keeping MIN(rowid) per group, single statement, verify count | counts exact |
| E-05 | Window-function sessionization: events into sessions on 30-min inactivity gaps | session ids exact |
| E-06 | Recursive CTE bill-of-materials explosion with quantities multiplied down | totals exact |
| E-07 | Upsert + audit trail trigger: history table captures old/new + actor | audit rows exact |
| E-08 | Full-text-ish search with trigram table + ranked LIKE fallback, no FTS ext | ranking order exact |
| E-09 | Schema migration that backfills + adds NOT NULL + index with zero downtime steps | steps run clean in order |
| E-10 | Slow-query fix: rewrite N+1-style correlated subquery to join, 100x rows, faster | faster + same results |
| F-01 | Tiny HTTP JSON API (stdlib http.server): CRUD + validation errors as RFC7807, 404/409 shapes | status codes + bodies exact |
| F-02 | Webhook receiver with HMAC verify + idempotency keys + replay log | forged rejected, replays deduped |
| F-03 | Auth: salted scrypt passwords + timing-safe compare + lockout after 5 fails | all attack cases behave |
| F-04 | Paginated API with cursor (not offset) + stable sort under inserts | no dup/skip under churn |
| F-05 | File-upload endpoint: size cap + magic-byte type check + virus-scan stub hook | evil files rejected |
| F-06 | Background job queue over sqlite: claim/timeout/retry/dead-letter | no job lost, poison quarantined |
| F-07 | Feature-flag service with targeting rules + audit log + instant rollback | flag eval matrix exact |
| F-08 | Health/readiness endpoints that reflect real dep checks (db file, disk) | statuses flip on fault |
| G-01 | Single-file dashboard: canvas line chart from pasted CSV, zoom + hover values | interactions work offline |
| G-02 | Accessible modal: focus trap + Esc + return-focus + aria, keyboard-only test path | scripted key walk passes |
| G-03 | Virtualized list: 100k rows scroll at 60fps feel, correct rows at scroll offsets | row-at-offset exact |
| G-04 | Offline-first form: localStorage draft + conflict banner on version mismatch | draft survives reload |
| G-05 | CSS-only (no JS) tabs + accordion + dark-mode toggle that persists | all states reachable |
| G-06 | Canvas game: snake with fixed-timestep loop, pause, high-score persist | playable + scored |
| G-07 | Markdown preview with sanitized HTML (no script execution, keep code blocks) | xss payloads inert |
| G-08 | Responsive email-style layout that also prints cleanly (print stylesheet) | print CSS verified |
| H-01 | PILOT P2: LRU+TTL+stats per /tmp/cap-fixtures/harness_p2.py (15 asserts) | harness green |
| H-02 | iCal parser: recurring events expanded 90 days incl. EXDATE + DST | occurrence list exact |
| H-03 | Diff two JSON configs, human-readable path-based report, array moves detected | report matches expected |
| H-04 | Config loader: env > file > defaults precedence + type coercion + missing-key error | precedence matrix exact |
| H-05 | Template engine: variables + loops + conditionals + escaping, no eval() | outputs + no-code-exec proof |
| H-06 | CLI: subcommands + --help + stdin/pipe support + exit codes per failure class | help + codes exact |
| H-07 | Migration runner: ordered .sql files + checksum log + rollback-on-failure | rerun idempotent |
| H-08 | Sitemap crawler of local HTML dir: internal links graph + orphans + broken | graph exact |
| I-01 | Login hardened: rate-limit + constant-time compare + generic error messages | attack script fails all |
| I-02 | Path-traversal-proof file server (.., symlinks, encoded slashes) | all escapes blocked |
| I-03 | JWT from scratch (HMAC-SHA256): exp/nbf/iat checks + alg-confusion reject | forged/expired rejected |
| I-04 | Secrets scanner: entropy + keyword rules over repo fixture, 0 false negatives | planted secrets all found |
| I-05 | CSP + headers demo page that blocks inline-script and exfiltration attempts | headers + blocks verified |
| I-06 | Password-reset token flow: single-use + expiry + no user-enumeration | all abuse cases safe |
| I-07 | Sandbox a plugin loader: import only allow-listed stdlib, resource cap | escapes blocked |
| I-08 | Audit logger: append-only hash-chained log, tamper-evident verify command | tamper detected |
| J-01 | Speed up provided slow script 10x measured (profile first, report hotspot) | time ratio + same output |
| J-02 | JSON parse 500MB file under RAM cap via streaming, exact aggregate | exact + RAM cap |
| J-03 | Replace O(n²) dedupe with hashing on 1M rows, same output, timed | same out + faster |
| J-04 | Cache-memoize recursive function, call-count proof of work saved | counts prove savings |
| J-05 | Zero-copy file transform (mmap) vs read/write, benchmark both | mmap wins + bytes equal |
| J-06 | Batch sqlite inserts: 100k rows <2s with transactions, correctness kept | time + count exact |
| J-07 | Lazy pipeline beats eager on memory for 10M-record transform | RAM measured both ways |
| J-08 | String-builder join vs += in loop, 1M lines, timed + identical | identical + timed |
| K-01 | Design URL shortener: API + storage + scale notes + abuse limits (graded rubric) | rubric >= 8/10 |
| K-02 | Design notification fan-out (10M users): push/email/sms routing + retries | rubric >= 8/10 |
| K-03 | Design multi-tenant schema: isolation choice + RLS-equivalent + migration plan | rubric >= 8/10 |
| K-04 | Postmortem: given outage timeline, 5-whys + fix list prioritized | rubric >= 8/10 |
| L-01 | Generative art (stdlib only, PNG via struct/zlib): seeded, deterministic | same seed = same bytes |
| L-02 | Text adventure engine: rooms/items/NPC dialogue trees from data file | walkthrough script wins |
| L-03 | Music: generate valid MIDI file (struct) playing a 12-bar blues | file parses + plays |
| L-04 | Esolang interpreter (Brainfuck + 2 extensions) with step debugger | programs + debug exact |
