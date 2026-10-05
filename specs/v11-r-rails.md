# Story S-V11-R-RAILS: Explore category rails as React (rails re-draft)

Outcome: zero-skill browse on the React island — open Explore → see
categories → land content, no query typed. Rails group the existing
topic field (port of the proven Flutter reference:
explore_category_rail.dart + search_home wiring, kept as port
reference, +29/-0, 5/5 green). YT-style rail headers, TikTok
block-rail pattern, Spotify card grid — same recon refs.

Task V11-R-1: topic rails in ExploreView (Kevin)
Description: group feed rows by the existing topic field (first-seen
  order, loners stay in Latest) and render one horizontal rail per
  topic with a header (`Sports • 3`). Reuse existing cards per row
  type (video/article/image/score pin); rail adds no navigation of its
  own — taps land through the cards' own handlers. Rails sit between
  the Watch rail and Latest, same as the reference.
Do-not-touch: card components (rails compose them, never restyle them)
Acceptance:
- [ ] every topic with ≥2 rows renders a headed rail; loners only in Latest
- [ ] headers read `Topic • n`, first-seen topic order
- [ ] tap on any rail card lands its content (no dead tiles)
- [ ] empty feed renders zero rails, Latest logic untouched
Verification: zero-skill browse path test (headers render → tap lands); grouping unit tests
Dependencies: ExploreView + cards (exist in island-ui/src/components/)
Files likely touched: island-ui ExploreView rails (new section file), rail tests
Size: S

Checkpoint CP-V11-R-RAILS: open-Explore → category → content demoed
with no query typed, before any new-widget work is discussed (reuse
existing cards; no new widget unless recon-named).
