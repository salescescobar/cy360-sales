# Architecture — Framework v2.1 (this diagram IS the architecture)

  user ──► apps/web ──► B core.run() ──► A knowledge.query() ──► Supabase pgvector
                              │                    └─► skills/web-research (opt-in)
                              ├─► guardrails · permissions · checkpoints
  N8N triggers ──► E loop.run() ──► (uses B and A) ──► outcome + audit trail
  ────────────────────────────────────────────────────────────────────────
  C control plane: config.yaml + Langfuse traces/dashboards + evals gate + E2E (CI)
  D dev agent: .github/workflows/ci.yml (Claude review + standards)
  ────────────────────────────────────────────────────────────────────────
  skills (packages/skills): web-research · video-moments · ocr · pii · chunk-embed
                            hybrid-search | video-edit · brand-guardrails · publish
                            | evaluator-optimizer · n8n-triggers
  Paid skills are declared in config.yaml so their cost is visible on the dashboard.

Anchors: #knowledge #core #loops — extend sections as the pilot implements them.
