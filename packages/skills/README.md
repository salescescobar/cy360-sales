# Skills catalog

A new capability is a **skill**, never a new agent. One folder per skill, registered in
its agent's index. Each skill: one job, typed input/output, traced, independently testable.

| Skill | Agent | What it does | Built on |
|---|---|---|---|
| web-research | A | Search the web, vet sources, return cited text | Anthropic web search or Tavily + Firecrawl |
| video-moments | A | Watch footage, return timestamped moments | vision model + cloud GPU |
| ocr-dedup | A | Read messy files (PDFs, scans, photos) | OCR |
| pii-gdpr | A | Strip personal data before storing | rules + model |
| chunk-embed | A | Chunk, embed, store for meaning-search | Supabase pgvector |
| hybrid-search | A | Keyword + meaning search with reranking | pgvector + reranker |
| brand-guardrails | B | Enforce client brand/safety rules on output | JSON Schema + rules |
| video-edit | B | Cut, 9:16, subtitles, logo | ffmpeg + cloud GPU |
| publish | B | Post to social / send email / update sheets | platform APIs, Playwright fallback |
| role-permissions | B | Who can ask for what | config + core |
| evaluator-optimizer | E | Self-check before finishing | core |
| n8n-triggers | E | Schedules, webhooks, events, thresholds | N8N |

**Rule:** if a skill needs a paid tool, it goes in `config.yaml` under `skills:` so the
Control Plane can see its cost. No hidden spend.
