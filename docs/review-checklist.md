# The 6-point diff review (print this)

Applies to every change, human- or AI-written, manual path or autonomous loop.

1. **Secrets** — nothing key-shaped in the diff, the logs, or the tests.
2. **Irreversible** — delete / overwrite / spend / send-to-outside is inside `requireCheckpoint()`.
3. **Right door** — knowledge / core / loops. Nothing bypasses them.
4. **Spec match** — implements the numbered criteria, invents nothing extra.
5. **Prompts & caps** — prompts in `/prompts`, limits from `config.yaml`.
6. **Test** — the spec's acceptance test for this skill exists and passes.

Any "no" → request changes. Reviewing takes 15 minutes; a leaked key or a deleted
production table takes weeks.

**Why this exists:** in July 2025 an AI coding agent at a well-known platform deleted a
production database during an explicit code freeze. Independent security research in 2025
found a large share of AI-generated code samples shipped with vulnerabilities. The agent is
fast and useful; the review is what makes it safe.
