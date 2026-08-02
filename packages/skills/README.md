# Skills catalog

A new capability is a **skill**, never a new agent. One folder per skill, registered in
its agent's index. Each skill: one job, typed input/output, traced, independently testable.

| Skill | Agent | What it does | Built on |
|---|---|---|---|
| gotab-ingest | A | Normalize a day of GoTab (F&B) sales | CSV today, GoTab API when GOTAB_API_KEY arrives |
| courtreserve-ingest | A | Normalize a day of CourtReserve court activity | CSV today, CourtReserve API when COURTRESERVE_API_KEY arrives |
| metrics | B | Daily + monthly aggregates, comparatives | pure functions over normalized rows |
| web-research | A | Search the web, vet sources, return cited text | Anthropic web search or Tavily + Firecrawl |
| role-permissions | B | Who can ask for what | config + core |
| evaluator-optimizer | E | Self-check before finishing | core |
| n8n-triggers | E | Schedules, webhooks, events, thresholds | N8N / Vercel Cron |

**Rule:** if a skill needs a paid tool, it goes in `config.yaml` under `skills:` so the
Control Plane can see its cost. No hidden spend.

CY360 Sales has no sensitive/irreversible actions (spec #1, section 6) — read-only
ingestion and internal Slack notifications only — so no skill here calls
`requireCheckpoint()`. The demo skills from the template's Crushyard Clips assignment
(video-moments, video-edit, brand-guardrails, publish) are unused by this product; their
folders remain on disk but are not wired into selftest, run-loop, or this catalog.
