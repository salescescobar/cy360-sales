---
name: "Spec (Golden Path step 1)"
about: "No approved spec, no code. Specs are testable, not prose."
labels: spec, needs-ceo-approval
---

## 1. What we're building (3 sentences max, plain English)

## 2. Acceptance criteria — THE SYSTEM SHALL (numbered, testable)
> Format: `WHEN <trigger> THE SYSTEM SHALL <observable response>`.
> Rule: if a judge (or a stranger) can't verify it by *using* the product, rewrite it.

1. WHEN … THE SYSTEM SHALL …
2. WHEN … THE SYSTEM SHALL …
3. WHEN … THE SYSTEM SHALL …

## 3. Invariants — THE SYSTEM SHALL NEVER (these become blocking tests)
1. THE SYSTEM SHALL NEVER …
2. THE SYSTEM SHALL NEVER …
3. THE SYSTEM SHALL NEVER … *(always include at least one security/data rule)*

## 4. Success metrics (numbers, measurable next week)
| Metric | Today | Target |
|---|---|---|
|  |  |  |

## 5. Acceptance test per skill (one line each — the automated proof)
| Skill | Automated test that proves it works |
|---|---|
|  |  |

## 6. Sensitive / irreversible actions (hard human checkpoints, every autonomy level)
- [ ] Spends money  - [ ] Sends external messages  - [ ] Deletes or overwrites data  - [ ] None

## 7. Which agents/skills does it touch?
- [ ] A · Knowledge (skills: ___)  - [ ] B · Core (skills: ___)  - [ ] E · Loop (playbook: ___)

## 8. Out of scope (explicit)

## 9. Research trail
Claude discovery: ___ · NotebookLM: ___ · Key sources: ___

## CEO approval
- [ ] Approved by CEO — date: ______
> Reviewer checklist before ticking: every criterion in §2 is observable · §3 has a security
> rule · §4 has numbers · §5 names a test per skill · §6 marked honestly.
