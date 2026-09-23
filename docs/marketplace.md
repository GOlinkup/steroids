# G66 Marketplace — design (no code)

Publish/subscribe skills in one command. Design only; nothing here runs.

## Commands (proposed)
- `steroids publish <skill-dir>` — validate (G62 lint clean), pack
  SKILL.md + version pin, push to the registry, print the share URL.
- `steroids subscribe <url-or-name>` — fetch, lint-gate, install into the
  user skills dir, reindex, report rank impact on the golden sets.

## Registry
- Content-addressed blobs (sha256 of SKILL.md); index maps name → blob +
  version + author + signature. Mirrorable as static files (same shape as
  the graph export), so no server is strictly required for v1.
- Trust: author signatures required; installs warn on unsigned packs.
  Ratings (G67) and outcomes feed the default-sort later.

## Safety rails
- `subscribe` runs the eval gate slice (goldens involving the skill's
  keywords) before activating; regression → staged inactive with report.
- Namespace rule: `<author>/<skill>`; bare names resolve to local first,
  never shadow silently (G64 overlap report runs on subscribe).
- Uninstall = remove dir + reindex; no hooks into other skills' files.

## Open at build
- Registry host vs pure-static mirror; payment for paid skills (out of
  scope v1); update cadence (pin vs floating per G65).
