# Story S-V11-3: Daily — briefing + music (Sprint 3)

Outcome: the island opens the day (morning briefing: breaking news,
weather, calendar, next steps) and music is contextual (now-playing aware
+ suggestions), never a static tab. Zero API keys anywhere here.

Task V11-3-1: morning briefing, zero keys (Kevin)
Description: GDELT DOC2.0 (keyless) + RSS pipe (standing free pipe) + 
  Open-Meteo (keyless, non-commercial CC-BY) + on-device CalendarProvider
  (permission only). Day-open content, honest when offline (cached + dated).
Do-not-touch: email/bills (need logins — human-gated, later)
Acceptance:
- [ ] briefing renders with zero keys configured
- [ ] offline shows cached briefing stamped with its age, never fake-fresh
- [ ] calendar items come only from on-device provider
Verification: fresh-install run with empty key store; airplane-mode stale-stamp proof
Dependencies: V11-S1 transport (queued behind Sprint 1, same hands)
Files likely touched: new briefing module
Size: M

Task V11-3-2: day-open / day-close loop (Kevin)
Description: morning briefing opens the day; evening "what moved today"
  (completed tasks, fires from outbox/drops) closes it. The habit loop that
  makes the island daily-use, not demo-use.
Do-not-touch: briefing sources (loop reads them, never refetches specially)
Acceptance:
- [ ] evening card lists the day's completed + sent items, no invention
- [ ] empty day says so honestly (no filler content)
- [ ] both cards skippable in one tap
Verification: scripted day with 2 completions → evening card matches exactly
Dependencies: V11-3-1
Files likely touched: loop/summary module
Size: S

Task V11-3-3: contextual music (Kevin)
Description: music surfaces when playing + suggestions at other times.
  WebView embed + Referer header (else err153), >=200px, no overlays;
  Data API for metadata only. Background play stays Premium-only — stated
  honestly, never worked around.
Do-not-touch: download/rip paths (streaming only, ToS-clean)
Acceptance:
- [ ] "play X" renders a working embed first try (Referer set, proven)
- [ ] suggestions appear outside listening times, dismissible
- [ ] background limit disclosed in-UI where relevant
Verification: 3 voice asks → playing embeds; overlay/invisible-player audit (none)
Dependencies: V11-3-1
Files likely touched: music module
Size: S

Checkpoint CP-V11-3: briefing + loop + music demoed on a fresh install
with empty key store before Sprint 5 builds onboarding on top.
