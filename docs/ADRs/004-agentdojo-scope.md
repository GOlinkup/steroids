# ADR 004 — AgentDojo scope (SP-4, RQ-5)

Date: 2026-09-23. Timebox: 1 day. Status: decided.

## Suites mapped to coding-agent threat model
1. Prompt-injection via tool content (untrusted MCP descriptions, web docs)
   → maps to Steroids §24.9 skill supply chain (1,265 third-party instruction
   sets; descriptions untrusted per MCP spec).
2. Indirect exfiltration via log/memory write → maps to hash-only prompts
   (J97) + content-capture opt-in.
3. Tool-scope abuse (over-broad capabilities) → maps to minimal
   non-overlapping tools + `tool_filter`-style scoping.

Out of scope V1: multi-agent collusion suites (no multi-agent in V1),
OS-level sandbox escapes (covered by sandbox ADR, not eval).

## Cost estimate
Local proxy first (free, every change): `tests/adversarial_bank.py`
(50 typo/paraphrase rows, top-3 bar) + injection micro-suite
(`tests/test_injection.py`: 12 malicious-description rows, must-abstain or
must-not-select). Full AgentDojo (97 tasks / 629 security cases) on-demand
only, capped per cycle, actuals recorded next to estimate per §8 budget
policy. No paid infra in V1.

## Defenses named (evaluated, not assumed)
- `tool_filter`-style scoping (NEG gate + domain-token requirement)
- Secondary detector (abstention on low-confidence / untrusted-only evidence)

## Permanent metric pair
Utility (blind149 P@1/P@3) + Utility-Under-Attack (adversarial top-3 +
injection refusal rate). A change raising P@1 while collapsing under
injection is a regression.
