# Model routing — the cheapest model that can do the job

## The rule
No file outside `packages/core/router.ts` names a model. Code says *what kind of task*
this is; the router says *which model runs it*. Change the policy in `config.yaml`, once,
and every product follows.

## Why it matters
Most work in an AI product is cheap work — labelling, extracting, formatting, summarizing.
Sending that to a frontier model is the single most common way an AI product's margin
disappears. Routing by task class typically cuts model spend substantially at identical
output quality, because quality was never the binding constraint on those tasks.

## The ladder (per task class, defined in config.yaml)
| Task class | What it is | Starts at |
|---|---|---|
| classify / extract | labels, yes-no, pull fields | cheapest |
| format / summarize | captions, rewrites, condensing with citations | cheap |
| reason / code | planning, decisions, writing product code | mid |
| judge | adversarial acceptance testing | mid, **different family than the builder** |
| architect | hard design calls, rescuing a stuck loop | top |

## Escalation (the only direction that costs money)
Attempt 1 uses the cheapest capable rung. A failed verification climbs one rung, up to that
class's ceiling. Escalation is never automatic-by-default and never permanent: the next task
starts cheap again.

## Two free savings, always on
- **Prompt caching** for stable prefixes (system prompt, brand rules, playbook text).
- **Batch API** for anything not interactive (nightly clip captions, bulk re-processing).

## What the dashboard must show
Cost per task class, escalation rate per class, and cost per outcome (per clip, per answer).
**A class that escalates often is a spec/prompt problem, not a budget problem.** Fix the
input before raising the ceiling.

## In the autonomous build loop
- **Builder:** `code` class. After 2 failed rounds on the same check it may climb to
  `architect` for one round, then must come back down.
- **Judge:** `judge` class, and **must be a different model family than the builder** —
  a model grading its own family's output is a documented bias.
- **Routine gate checks** (does it load, is the logo present) run at the cheapest rung.

## Adopting a new model (the only sanctioned path)
1. `npm run models:check` — the model must appear in the live `/v1/models` list for OUR key.
   Announcements, gateways and third-party catalogs do not count.
2. Verify its price on anthropic.com/pricing and update PRICES in `packages/core/router.ts`.
3. Edit the one rung in `config.yaml → models`, commit, PR. The router never switches
   models silently: a model swap changes cost and quality, so it ships like any change —
   reviewed, committed, and visible on the dashboard.
