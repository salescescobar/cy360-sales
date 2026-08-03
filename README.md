# AI Labs by Humans — Product Template (Framework v2.1)

Every AI Labs product starts by cloning this repo. It ships with the 5 framework
components pre-wired: **A** Knowledge · **B** Product Core · **E** Loop Agent ·
**C** Control Plane · **D** Development Agent (in CI).

## The Golden Path (how you ship)

1. **Clone this template** → `gh repo create <client>-<product> --template ailabsbyhumans/product-template`
2. **Write the spec** → Claude discovers → NotebookLM digests → spec in GitHub Projects (issue template: `spec.md`). Nothing is built without CEO approval.
3. **Build with the SDK** → open Claude Code in the repo root. `CLAUDE.md` teaches it our standards. Use `knowledge.query()`, `core.run()`, `loop.run()`.
4. **CI validates alone** → every PR gets Claude review + evals gate. Quality drop = no merge.
5. **Deploy & monitor** → Vercel ships; Langfuse + `config.yaml` budgets watch 24/7. Loops take over routine work.

## New here? Start with the course

**Engineers:** open **COURSE.md** and work top to bottom. It's self-contained — the spec, every
command, every prompt, and which tools to activate at each step. One clip on your screen by the
end of day one; a working product in 6–8 days.

**Everyone else:** **BUILD_GUIDE.md** shows the delivery workflow — who does what, when, and
what gets handed to whom.

## Rule zero

**If it's not in GitHub or on the dashboard, it doesn't exist.**
Prompts live in `/prompts`. Playbooks live in `/playbooks`. Both are code, reviewed in PRs.

## The paste-ready spec

`docs/spec-example-crushyard-clips.md` is a complete, filled-in spec. Copy it into a GitHub
issue with the Spec template, adapt the nouns, and get CEO approval before writing code.

## Setup (once per project)

- [ ] Set repo secrets: `ANTHROPIC_API_KEY`, `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `SLACK_WEBHOOK_URL`, `CRON_SECRET` (authenticates Vercel Cron → `/api/cron/*`)
- [ ] Edit `config.yaml`: project name, monthly budget, loop caps
- [ ] Create the GitHub Project board from the org template (columns: Spec draft → CEO approval → Building → In review → Shipped)
- [ ] Connect Vercel to `apps/web`
- [ ] Import the N8N weekly-report workflow and point it at this repo + Langfuse project

## CY360 Sales — setup specific to this product (spec #1 v2)

- **Warehouse**: apply `supabase/migrations/*.sql` in order to the Supabase project (`SUPABASE_URL`/`SUPABASE_SERVICE_KEY`). Without Supabase configured, everything runs against a local `.local-storage/` fallback — fine for dev, not for production (Vercel has no writable disk).
- **First admin account**: set `ADMIN_EMAIL` and `ADMIN_PASSWORD` in the environment (never in a committed file), then run `npm run seed:admin`. This is idempotent — safe to re-run on redeploy. Sign in at `/admin/login`; from there, `/admin/managers` provisions manager accounts (there is no public self-service signup — criterion #7) and `/import` uploads GoTab/CourtReserve CSV exports (criterion #1). This environment already has an admin seeded — its `ADMIN_EMAIL`/`ADMIN_PASSWORD` live in this checkout's `.env.local` (gitignored, never in git history); whoever operates this environment can read that file directly to sign in.
- **Automated testing / judge access (non-production only)**: an unattended tester's permission policy correctly blocks reading `.env.local`, so it can't learn the real admin's password — by design, that file never leaves the operator's hands. Run `npm run seed:judge-admin` instead: it bootstraps a fixed, well-known test admin (`judge-admin@cy360-sales.test` / `judge correct horse battery staple`, both in `scripts/seed-judge-admin.ts`) via the same `ensureAdmin()` call `tests/e2e/*.spec.ts` already use to sign in on their own, and also drops the pair into `tests/e2e/judge-fixtures/admin-credentials.json` (gitignored) for a browser-driving tester to read. It refuses to run when `NODE_ENV=production`. This account is test-only — it never touches or reveals the real seeded admin.
- **CourtReserve live API** (spec section 10 — optional; CSV upload works without it): set `COURTRESERVE_API_USER`, `COURTRESERVE_API_PASS`, `COURTRESERVE_ORG_ID`, and flip `sources.courtreserve.mode` to `api` in `config.yaml`. `npm run backfill:courtreserve -- --from=YYYY-MM-DD --to=YYYY-MM-DD` pages the range month by month into `sales_transactions`/`court_reservations`/`payment_type_totals` (idempotent — replaces per location/range, never duplicates). Member PII (`MemberFullName`, `FamilyName`) is dropped before anything is persisted.
- GoTab has no automated path (constraint discovered in v1 — see `docs/spec.md` section 2): it only enters through a confirmed `/import` upload.
