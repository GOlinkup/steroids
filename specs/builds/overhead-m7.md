# B-2 emission overhead (M7, RQ-4)

Method: 50 golden prompts, wall time of `route_query` plain vs +
`bus.make_event` + `otlp.to_otlp` per query (`/tmp/ov_probe.py`,
throwaway). Read-only: golden index loaded, `trial-stats.json` untouched.

Result (2026-09-23): off=2.53s on=1.89s → overhead −25.1%, bar <5%: PASS.
Negative = second-loop cache warmth, not a speedup claim; the honest
reading is "tap adds no measurable cost."

Re-run: `python3 /tmp/ov_probe.py` (recreate from this file's method;
probe intentionally not committed).
