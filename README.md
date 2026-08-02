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

- [ ] Set repo secrets: `ANTHROPIC_API_KEY`, `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `SLACK_WEBHOOK_URL`
- [ ] Edit `config.yaml`: project name, monthly budget, loop caps
- [ ] Create the GitHub Project board from the org template (columns: Spec draft → CEO approval → Building → In review → Shipped)
- [ ] Connect Vercel to `apps/web`
- [ ] Import the N8N weekly-report workflow and point it at this repo + Langfuse project
