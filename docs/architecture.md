# Architecture — CY360 Sales (Framework v2.1 template, product per Spec #1)

  manager ──► apps/web (login → /dashboard/[location]) ──► /api/metrics
                                                                 │
                                                                 ▼
              A knowledge.{writeDay,readDay,readMonth,traceRefresh} ──► Supabase (RLS)
                                                                 │        or local JSON fallback
                                                                 ▼
  Vercel Cron (apps/web/vercel.json, ~6:00 ET) ──► GET /api/cron/refresh ──► loop.run() ──►
                                      playbooks/daily-sales-refresh.md
                                      │
                                      ├─► skills/gotab-ingest (F&B, CSV/API)
                                      └─► skills/courtreserve-ingest (courts, CSV/API)
                                      └─► skills/metrics (daily + monthly aggregates)
  Vercel Cron (~6:30 ET) ──► GET /api/cron/watchdog ──► Slack #ops if the 6:00 run never fired
    (Vercel Cron schedules are UTC-only, so apps/web/vercel.json pins 10:00/10:30 UTC —
    the EDT wall-clock target; it drifts an hour during EST. scripts/watchdog.ts runs the
    same check by hand/CI outside Vercel.)
  ──────────────────────────────────────────────────────────────────────────
  C control plane: config.yaml (locations, sources, refresh cron/backfill) + Langfuse + E2E (CI)
  D dev agent: .github/workflows/ci.yml (Claude review + standards)
  ──────────────────────────────────────────────────────────────────────────
  skills (packages/skills): gotab-ingest · courtreserve-ingest · metrics · web-research
  This product has no user-facing model calls (pure ingestion + aggregation + dashboard) —
  packages/core/router.ts and checkpoint.ts remain wired for future features that need them.

Invariants enforced in code, not just docs:
  #1 location isolation  → supabase/migrations/0001_init.sql RLS + apps/web cookie gate
  #2 no creds outside env → gotab-ingest/courtreserve-ingest read GOTAB_API_KEY/COURTRESERVE_API_KEY
                             from process.env only, never logged
  #3 read-only vs sources → ingest skills only ever GET/read CSV, never write back
  #4 every run traced     → knowledge.traceRefresh() called for every location/date, pass or fail

Anchors: #knowledge #core #loops — extend sections as the pilot implements them.
