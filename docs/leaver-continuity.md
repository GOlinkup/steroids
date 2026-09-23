# H78 Leaver continuity — policy (no code)

Custom skills survive their authors leaving. Policy only; nothing here runs.

## Rule
Skills are repo assets, not personal property. When an author leaves:
1. Their custom skills STAY indexed and routable — no auto-removal.
2. Ownership transfers to the team lead (or the repo's CODEOWNERS analogue);
   the skill frontmatter gains `maintainer: <new owner>` within 30 days.
3. Orphaned skills (no maintainer, zero fires in 90 days) enter quarantine
   per C26 auto-retirement — dry-run report first, never silent delete.

## Why this shape
- Deleting on departure breaks dependents silently (G64 overlap shows how much institutional knowledge hides in near-twin skills).
- The audit trail (H73) records who loaded what, so orphan risk is visible
  before it bites; author analytics (G68) shows which orphans still fire.

## Non-goals
- No HR integration (no feed of who left — lead declares it).
- No license transfer mechanics (assumes employer-owned work product).
