# CLAUDE.md — AI Labs by Humans engineering standards

You are pair-programming inside an AI Labs product built on Framework v2.1.
Follow these rules on every task. When a rule conflicts with a shortcut, the rule wins.

## Architecture (never bypass it)

- All retrieval goes through `packages/knowledge` (`knowledge.ingest()`, `knowledge.query()`). Never query the vector DB or call web search directly from app code. Every answer surfaced to a user must carry citations.
- All model calls that reach users go through `packages/core` (`core.run(request, user)`). It applies guardrails (JSON Schema), role permissions and sandboxing. No raw `fetch` to model APIs from `apps/`.
- All background automation goes through `packages/loops` (`loop.run(trigger, playbook)`). Loops read their caps (max iterations, budget) from `config.yaml`. A loop without an exit condition is a bug, not a feature.
- Prompts are code: they live in `/prompts`, versioned, referenced by path — never inline strings longer than one sentence.
- Playbooks are code: `/playbooks/*.md`, one file per loop, PR-reviewed.

## Autonomous build

- With an approved spec, the `loop-autonomo-producto` skill (.claude/skills/) can build,
  test and fix end to end: a Builder agent and an independent Tester/judge agent iterate
  against a 10-check functional gate (score >= 90, zero blockers, evidence required).
  Caps come from `config.yaml -> autonomous_build`. It escalates honestly when the budget
  runs out — it never declares false victory. The engineer's job: the spec, the config,
  and the escalations.

## Model selection

- **Never name a model outside `packages/core/router.ts`.** Call `runTask(taskClass, input)`
  and let the router pick the cheapest capable rung from `config.yaml -> models`.
- Task classes: classify · extract · format · summarize · reason · code · judge · architect.
- Escalation happens only after a failed verification, one rung at a time, and resets next task.
- Long stable prefixes (brand rules, playbooks) must use prompt caching; non-interactive bulk
  work must use the Batch API. See `docs/model-routing.md`.

## Budget behavior (notify → pause → approve → resume)

- At `budget_alert_pct` (default 80%) the loop notifies Slack and KEEPS working.
- Past 100% it PAUSES (exit 3), notifies, and waits: nothing is lost (every iteration is a
  commit). A human approves continuing with `touch .loop/budget-approved` (one-shot,
  consumed and logged) or `AILABS_APPROVAL_TOKEN`, then re-runs the same command.
- The loop never silently stops past-budget work, and never silently keeps spending.
- Exit codes: 0 = gate passed (preview) · 2 = escalated (stuck/max iterations) · 3 = paused
  awaiting budget approval.

## Reviewing AI-written code (mandatory — do not skip)

Treat every AI diff like a new hire's PR. Before you merge, check in this order:
1. **Secrets** — no keys, tokens or credentials in the diff or the logs.
2. **Destructive/irreversible ops** — deletes, overwrites, spend, external messages must be
   wrapped in `requireCheckpoint()`. CI fails otherwise.
3. **Right door** — retrieval via `packages/knowledge`, model calls via `packages/core`,
   background work via `packages/loops`. No shortcuts around them.
4. **Spec match** — it implements the numbered criteria; it did NOT invent extra scope.
5. **Prompts and caps** — prompts in `/prompts`, limits read from `config.yaml`.
6. **Tests** — the acceptance test named in the spec exists and passes.
An unreviewed AI diff reaching production is our #1 risk. The manual and autonomous paths get
the same scrutiny; the autonomous loop does not exempt anyone from this list.

## Deploying

Every merge deploys to **preview** automatically. **Production is gated**: tests + evals +
security scan green, plus a human promotion. Never wire auto-deploy straight to production.

## Workflow

- No spec, no code. Every feature references a spec issue (`Spec: #NN`) in its PR description.
- Small PRs. One concern per PR. CI runs Claude review + evals gate; if evals drop, fix quality, don't lower the bar.
- New capability for the Knowledge/Core/Loop agents = a **skill** in `packages/skills`, registered in its agent's index — never a new agent.
- Secrets only via environment variables. Never commit keys, never log payloads containing PII.

## Tooling

- Editors: Claude Code (agent) and/or Cursor (human-driven). Cursor reads `.cursor/rules/ailabs.mdc`, a mirror of this file — update both in the same PR.
- Web research: use the `web-research` skill (search + Firecrawl extraction), never ad-hoc scraping.
- Browser automation and E2E tests: Playwright. Publishing to a platform without a usable API goes through Playwright behind a checkpoint.
- Heavy video/vision work runs on cloud GPU via a skill, never inline in a request handler.

## Style

- TypeScript strict. Zod for runtime validation at every boundary.
- Errors: retries with exponential backoff on provider calls; multi-provider fallback is configured in `packages/core/providers.ts` — use it, don't reimplement.
- Every provider call is traced to Langfuse with `project`, `component` (A/B/E), and `skill` tags.

## When unsure

Prefer the boring solution that fits the template. If the template genuinely can't express what the spec needs, open a `framework-change` issue instead of working around it.
