# Tasks — S-MSAAS (Lane 1 only)

Task M-1: Idea Validation live (skill §Idea Validation)
Description: run the skill's 4-question validation table on the fixed test
  idea, with real repo evidence, no servers.
Do-not-touch: skills/micro-saas-launcher/SKILL.md, src/, island-app/
Acceptance:
- [ ] 4 questions answered with repo paths/commands, not opinions
- [ ] red/green flags listed per skill
- [ ] go/no-go decision recorded in RESULT.md
Verification: cat specs/micro-saas-live/RESULT.md
Dependencies: None
Files likely touched: specs/micro-saas-live/RESULT.md
RQ tag: RQ-6
Size: S

Task M-2: MVP Speed Run scope (skill §MVP Speed Run, Week 1 only)
Description: scope 7-day core to ONE feature reusing router.py, with
  explicit skip-list from skill.
Do-not-touch: skills/micro-saas-launcher/SKILL.md, src/, island-app/
Acceptance:
- [ ] one core feature named, rest explicitly skipped
- [ ] stack choice justified vs skill default (Next.js) with reason
- [ ] day-by-day plan ≤7 lines in RESULT.md
Verification: cat specs/micro-saas-live/RESULT.md
Dependencies: M-1 (needs go decision)
Files likely touched: specs/micro-saas-live/RESULT.md
RQ tag: RQ-6
Size: S

Task M-3: Pricing live (skill §Pricing Strategy)
Description: price the test idea with the skill's alternative-cost formula.
Do-not-touch: skills/micro-saas-launcher/SKILL.md, src/
Acceptance:
- [ ] alternative cost stated, price = 20-50% of it
- [ ] tier choice + one pricing mistake avoided, named
Verification: cat specs/micro-saas-live/RESULT.md
Dependencies: M-2
Files likely touched: specs/micro-saas-live/RESULT.md
RQ tag: RQ-6
Size: S

Task M-4: Skill mistake patches (only if M-1..M-3 found real errors)
Description: patch SKILL.md mistakes proven live, one commit, nothing speculative.
Do-not-touch: src/, island-app/, specs/launch/
Acceptance:
- [ ] each patch cites RESULT.md evidence line
- [ ] 3 adversarial probes per skill-rules discipline (if triggers touched — N/A here)
Verification: git diff -- skills/micro-saas-launcher/SKILL.md
Dependencies: M-1..M-3
Files likely touched: skills/micro-saas-launcher/SKILL.md
RQ tag: RQ-6
Size: S
