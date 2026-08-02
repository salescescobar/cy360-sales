# RUNBOOK — Build Crushyard Clips, step by step
### Framework v2.3

Follow the steps **in order**. Each step says WHERE to go, WHAT to do, and WHAT YOU GET
(how you know it worked). Don't skip the WHAT YOU GET check.

## The schedule you're working to

| When | What exists |
|---|---|
| **Day 1, by lunch** | the prototype is LIVE at a real URL (empty, but deployed, measured, gated) |
| **Day 1, by tonight** | the spec is approved and **Claude is building** — either you drive it, or the autonomous loop does |
| **Friday of week 1** | **V1 done**: every skill shipped, gates green, the night shift running supervised |
| **Weeks 2–3** | **results, not building** — the pilot measures the spec's numbers and autonomy is earned |

Steps 1–22 are day one. Steps 23–40 are the rest of week one. Steps 41–46 are afterwards.

## The 9-move SOP for day one (the short version of steps 1–24)

1. Accounts (30 min) — GitHub, Anthropic (+$50 cap), Supabase, Langfuse, Slack, Vercel (paid), Modal
2. Your machine (15 min) — **VS Code + the Claude Code extension**, then node and gh
3. The spec by voice (45 min) — testable format → issue #1 → **CEO approves** ← **the only step
   that needs a human. Everything after this is autonomous until the result.**
4. The template (5 min) — "Use this template" → Private → add the 6 secrets
5. The switches (10 min) — `config.yaml`: project, budget, skills, `autonomous_build: on`
6. Go live empty (20 min) — Vercel import → Deploy → **send the URL to your mentor**
7. Release the loop (5 min) — `claude` → *"Spec #1 is approved. Run the autonomous product loop end to end."*
8. Watch it work (evening) — Langfuse rounds/score/cost **per task class** · Slack escalations
   (answer with a decision, never with code) · a commit per round. Two escalations on the same
   check = the spec was ambiguous; sharpen the spec, don't raise the budget.
9. In parallel today (1 h) — apply for TikTok / Instagram / Facebook publishing access

Keep a notes file open. Every time you copy a key, paste it there with its name.

---

## PART 0 — FOUNDER, ONCE (5 min)

**0.** ON A MACHINE WITH `gh` LOGGED IN → unzip the kit → run `./PUSH_TO_GITHUB.sh <org>`.
**YOU GET:** `TEMPLATE_REPO_OK: https://github.com/<org>/ailabs-product-template` — the green
"Use this template" button is live. Rule zero satisfied: the framework now exists.
Then: `gh run list --repo <org>/ailabs-product-template` → a run appears → `gh run watch`
(press Enter to select it) → `security` ✓ and `e2e` ✓ in ~10 min; the two key-dependent jobs
show as *skipped* — correct, the template repo has no secrets on purpose.

> **IF SOMETHING LOOKS OFF (field-tested):**
> - **Renamed or duplicate downloads?** The filename doesn't matter — the md5 is the identity:
>   `md5 "<the file, quotes if it has spaces>"`. Keep ONE kit in Downloads; delete the rest.
>   macOS silently creates "folder 2" copies — that trap cost us an hour once.
> - **Old-kit tell:** `BUILD_GUIDE.md` at the root or no `scripts/selftest.ts` inside `vanilla/`
>   = an old version. Re-download and check the md5.
> - **`gh run watch` says "no runs to watch":** you won the race — wait 10 s, `gh run list`, retry.
> - **Node deprecation ANNOTATIONS in Actions:** informational, not failures.

## PART 1 — ACCOUNTS (steps 1–10, ~90 min, once)

**1.** GO TO **github.com** → Sign up → verify email → send your username to your mentor →
accept the org invite (check github.com/notifications).
**YOU GET:** clicking your photo (top-right) shows the AI Labs org.

**2.** GO TO **console.anthropic.com** → sign up → Settings → API Keys → **Create Key** →
name `crushyard-clips` → copy it to your notes as `ANTHROPIC_API_KEY`.
**YOU GET:** a key starting `sk-ant-`.

**3.** SAME SITE → Settings → Billing → add card → **set monthly limit: $50**.
**YOU GET:** a limit shown on the Billing page. Do not skip.

**4.** INSTALL **VS Code** (code.visualstudio.com) → open it → Extensions (left sidebar,
the squares icon) → search **"Claude Code"** → Install → sign in.
This is where you'll work: your files on the left, Claude on the right, and its changes shown
side by side — which is what makes the 6-point review (step 26) quick and visual.
Then open VS Code's built-in terminal (**View → Terminal**) and run:
```bash
node --version || brew install node
npm install -g @anthropic-ai/claude-code
claude
```
**YOU GET:** the Claude Code panel in VS Code, and `claude` answering in the terminal.
*(Setup screens change — if the extension looks different, check docs.claude.com.)*

**5.** GO TO **app.supabase.com** → New project → org: AI Labs → name `crushyard-clips` →
region: closest → save the DB password in your notes.
**YOU GET:** a project dashboard (takes ~2 min to provision).

**6.** SAME SITE → left menu **Storage** → New bucket → name `clips` → keep **Private** → Save.
**YOU GET:** `clips` listed under buckets.

**7.** SAME SITE → **Database → Extensions** → search `vector` → toggle ON.
**YOU GET:** "vector" shows as enabled.

**8.** SAME SITE → **Settings → API Keys** → copy to your notes: the **Project URL** as
`SUPABASE_URL` and the **secret key** (`sb_secret_…`) as `SUPABASE_SERVICE_KEY`.
**YOU GET:** both in your notes. (Old tutorials show `service_role` keys — same job, old format.)

**9.** GO TO **cloud.langfuse.com** → sign up → New Organization → New Project
`crushyard-clips` → Settings → API Keys → Create → copy `pk-lf-…` as `LANGFUSE_PUBLIC_KEY`,
`sk-lf-…` as `LANGFUSE_SECRET_KEY`, and the host shown as `LANGFUSE_HOST`.
**YOU GET:** three lines in your notes.

**10.** GO TO **api.slack.com/apps** → Create New App → From scratch → workspace: AI Labs →
Incoming Webhooks → toggle ON → Add New Webhook → channel `#ops-crushyard-clips` → Allow →
copy the URL as `SLACK_WEBHOOK_URL`. Test:
```bash
curl -X POST -d '{"text":"hello from the runbook"}' <paste-the-url>
```
**YOU GET:** the message appears in Slack.

> **Also today, in parallel (blocks the FINAL step only, takes weeks):**
> **10b.** GO TO **developers.tiktok.com** → register an app → request `video.publish`.
> **10c.** GO TO **business.facebook.com** → Settings → start **Business Verification** (company docs).
> **10d.** ASK THE CLIENT: confirm their Instagram is **Business/Creator** type.
> Until these approve, publishing is manual (a human posts the approved clips). Everything else works.

---

## PART 2 — THE SPEC (steps 11–14, ~1 h)

**11.** GO TO **Claude** (claude.ai or the app) → press the **microphone** → say:

> "I need a spec for a client called Crushyard. They're a pickleball club with cameras on
> four courts. The cameras record all day and nobody has time to watch or edit. They want
> the best moments posted to TikTok, Instagram and Facebook — five to seven short vertical
> clips a day, with subtitles and their logo. Max ten minutes a day of their time. Never a
> close-up of a kid's face. **Write it in the AI Labs spec format: numbered acceptance
> criteria in the form 'WHEN <trigger> THE SYSTEM SHALL <observable response>', invariants
> in the form 'THE SYSTEM SHALL NEVER ...' including at least one security rule, success
> metrics with numbers, one automated acceptance test per skill, sensitive/irreversible
> actions, and out of scope.**"

**YOU GET:** a structured spec in ~20 seconds.

**12.** READ IT against these three tests — this is the most important step in the whole
runbook, because **the build loop constructs EXACTLY what the spec says**:
- Can a stranger verify each criterion by *using* the product? If not, rewrite it.
- Does every "SHALL NEVER" line have a test that could catch it?
- Does each skill have one named automated acceptance test?
If a metric has no number, reply: *"give me numbers we could measure next week."*
Reference spec (same shape):

```markdown
**Title:** Crushyard Clips — daily social clips from court cameras

## What we're building
Each day's court footage → best moments → 5–7 vertical clips with subtitles, logo, captions
→ review queue. Human approves; approved clips publish to TikTok/Instagram/Facebook.
Runs nightly, unprompted.

## Acceptance criteria (numbered, testable)
1. WHEN the day's footage finishes uploading THE SYSTEM SHALL produce 5–7 candidate clips
   within 90 minutes.
2. WHEN a clip is produced THE SYSTEM SHALL render it 9:16 with subtitles and the club logo.
3. WHEN clips are ready THE SYSTEM SHALL place them in the review queue and notify Slack.
4. WHEN a human approves a clip THE SYSTEM SHALL publish it to the three platforms.

## Invariants
1. THE SYSTEM SHALL NEVER publish a clip containing a close-up of a minor's face.
2. THE SYSTEM SHALL NEVER publish anything without human approval (until Level 3).
3. THE SYSTEM SHALL NEVER log or store credentials, or delete source footage.

## Acceptance test per skill
| Skill | Automated test |
|---|---|
| video-moments | returns >=3 scored moments from the sample video |
| video-edit | output is 9:16, has burned subtitles, logo present |
| brand-guardrails | the minor-face sample clip is BLOCKED with a reason |
| publish | refuses to run without an approval token |

## Success metrics
| Metric | Today | Target |
|---|---|---|
| Publishable clips per day | 0 | 5–7 |
| Approved with no edits | n/a | >= 80% |
| Cost per published clip | n/a | <= $1.50 |
| Human minutes per day | ~120 | <= 10 |
| Camera upload -> review queue | n/a | <= 90 min |

## Agents & skills
A: video-moments · B: video-edit, brand-guardrails, publish · E: playbook daily-clips

## Sensitive actions
[x] Sends external messages (publishing) — checkpoint required

## Must never happen (become evals)
1. A close-up of a minor's face is published.
2. Anything publishes without human approval (until Level 3).
3. A caption breaks the club's brand voice.
4. The logo is missing or obscured.

## Out of scope
Live streaming · manual editing tools · analytics dashboards · other platforms.

## CEO approval
- [ ] Approved by CEO — date: ______
```

**13.** GO TO **github.com/<org>/crushyard-clips** (you'll create it in step 15 — or do this
after 15) → tab **Issues** → **New issue** → template **Spec** → paste → Submit.
**YOU GET:** Spec is issue **#1**.

**14.** TAG THE CEO on the issue. **STOP until the checkbox is ticked.** Go do step 15–22
meanwhile — they don't need the spec.

---

## PART 3 — GO LIVE (steps 15–22, ~1 h, day one)

**15.** GO TO **github.com/<org>/ailabs-product-template** → green **"Use this template"** →
Create a new repository → Owner: org → Name `crushyard-clips` → **Private** → Create.
**YOU GET:** your repo exists, full of files.

**16.** IN YOUR REPO → **Settings → Secrets and variables → Actions** → **New repository
secret** → add all six from your notes: `ANTHROPIC_API_KEY`, `SUPABASE_URL`,
`SUPABASE_SERVICE_KEY`, `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`, `SLACK_WEBHOOK_URL`.
**YOU GET:** six secrets listed. Names EXACT — a typo = red CI later.

**17.** ON YOUR MAC:
```bash
git clone https://github.com/<org>/crushyard-clips.git && cd crushyard-clips
cp .env.example .env.local
open .env.local
```
Paste the same six values. Save.
**YOU GET:** the project on your machine with keys in place.

**18.** OPEN `config.yaml` in any editor. Leave the `models:` block exactly as shipped —
that's the **router**, and it already starts every task at the cheapest capable model and
only climbs one rung when a check fails. Once your key is in `.env.local`, run
`npm run models:check` — it verifies the ladder against Anthropic's live model list and
shows any newer models available to evaluate (that's also how a future model gets adopted:
one verified line, never a rumor). Never name a model anywhere else in the code
(see `docs/model-routing.md`). Set `footage.input` to the client's video path and `footage.logo` to their logo file (without a logo, guardrails will correctly BLOCK every clip — fail closed). Then make the rest say:
```yaml
project: crushyard-clips
budget: { monthly_usd: 300, alert_at_pct: 80 }
skills:
  vision: { enabled: true, gpu: modal }
loops: { enabled: true, supervised: true }
alerts: { slack_channel: "#ops-crushyard-clips" }
```
**19.** IN TERMINAL:
```bash
npm install && npm run selftest
git add -A && git commit -m "chore: configure project (Spec #1)" && git push
```
**YOU GET (selftest):** `15 passed · 0 failed` — the template just proved itself on your
machine: checkpoints fail closed, guardrails refuse, the router escalates correctly, and a
real 1080×1920 clip rendered from synthetic footage.
**YOU GET:** GitHub tab **Actions** shows a run → wait → **green check**. Red X? Click it —
it's a mistyped secret from step 16, fix and re-run.

**20.** GO TO **vercel.com** → sign in with GitHub → Add New → Project → Import
`crushyard-clips` → paste the same env vars → **Deploy**.
⚠️ Client work must be on a **paid Vercel plan** (free Hobby is non-commercial).
**YOU GET:** a URL like `crushyard-clips.vercel.app`.

**21.** OPEN THE URL.
**YOU GET:** the empty review queue page. **Your product is LIVE.** Send the URL to your
mentor right now.
From here: **every merge auto-deploys to a preview URL**; promoting to the production URL
needs CI green (tests + evals + **security scan**) plus one human click. That gate is not
bureaucracy — an AI agent deleting a production database during a code freeze is a documented
2025 incident, and roughly half of AI-generated code samples in 2025 security studies shipped
with vulnerabilities. The gate is what makes the speed safe.

**22.** IN TERMINAL: `pip install modal && modal setup` (browser opens, approve).
**YOU GET:** "token stored". GPU ready.

---

## PART 4 — THE BUILD LOOP (steps 23–29, days 1–6)

Two ways to run it. **Option A** (recommended for your FIRST product — you learn the
framework by driving): repeat the cycle five times, once per prompt below. **Option B**
(once you trust the spec): hand the whole build to the autonomous loop — see step 23-B.

**23-B. OPTION B — LET THE LOOP BUILD IT.** The engine ships in the template:
```bash
npm run loop:auto -- --simulate        # watch the engine's control flow first (30 s)
npm run loop:auto -- --executor=claude-code    # the real thing (Claude Code signed in)
npm run cost:report                    # cost per task class after any run
```
**Exit codes — what the engine is telling you:** `0` gate passed → clips/build in PREVIEW,
your 6-point review promotes · `2` escalated (stuck or max iterations) → read the Slack
report, sharpen the spec · `3` **paused past budget, awaiting YOU** → it alerted at 80%,
stopped spending at 100%; approve with `touch .loop/budget-approved` (or set
`AILABS_APPROVAL_TOKEN`) and re-run the same command — nothing was lost, every iteration
is a commit, and each approval is consumed and logged.
The `loop-autonomo-producto` skill takes over: a **Builder** agent builds, deploys a preview,
and an independent **Judge** agent uses the product in a real browser — clicks, fills forms,
tries to break it — and scores it against a 10-check gate. Score ≥ 90 with zero blockers →
it merges and deploys to production. Below → the Builder gets the concrete failure list and
tries again. Hard stop at 15 rounds or the budget in `config.yaml → autonomous_build`; then
it escalates to you in Slack with an honest report — it never declares false victory.
**YOU GET:** iterations appearing in Langfuse (score + cost per round), and a Slack message
when it ships or escalates. **THIS is why step 12 matters so much: the loop builds EXACTLY
what the spec says.** A vague spec becomes a perfectly built wrong product.
While it runs, your job is: watch the dashboard, answer escalations. Nothing else.

**23.** IN VS CODE, with the project open: the Claude Code panel (or `claude` in the built-in terminal)
**24.** PASTE the next unshipped prompt from this list:

**PROMPT 1 — see:** "Implement packages/skills/video-moments per Spec #1: given a video path
or URL, sample frames, use the vision model on Modal, return timestamped moments with a score
and a reason. Wire into knowledge.ingest() so knowledge.query('today's moments') returns them
with timestamps as citations. Follow CLAUDE.md. No loop, no UI yet."

**PROMPT 2 — produce:** "Implement packages/skills/video-edit per Spec #1: cut a moment,
convert to 9:16, burn subtitles, overlay the logo, upload to the Supabase 'clips' bucket,
return URL + duration. Use ffmpeg. Then add caption generation in the club's brand voice —
prompt lives in /prompts."

**PROMPT 3 — refuse:** "Implement packages/skills/brand-guardrails per Spec #1. Enforce the
four 'must never happen' rules. Fail closed: unverifiable = blocked, with the specific
violations listed. Rules live in /prompts."

**PROMPT 4 — one door:** "Expose the pipeline through core.run(request, user): moments →
edit → guardrails. Blocked clips are never returned as ready. Trace everything to Langfuse."

**PROMPT 5 — the screen:** "Build the review queue in apps/web: today's clips with preview
and caption, Approve/Reject per clip, Approve All, blocked clips with reasons. API route
only — never call the model from the frontend. Add a Playwright test in tests/e2e/."

**25.** WAIT 20–40 min. Answer its questions with decisions, not code.
**26.** READ the changes using `docs/review-checklist.md` — six points, ~15 min:
secrets · irreversible ops behind `requireCheckpoint()` · right door (knowledge/core/loops) ·
matches the spec's numbered criteria · prompts in /prompts and caps from config.yaml ·
the spec's acceptance test exists and passes. **Any "no" = don't merge.**
**27.** RUN it on a real client video (put one at `/tmp/court2.mp4` first).
**YOU GET (per prompt):** 1→ a list like `10:31:04→10:31:46, score 0.87, "long rally"` ·
2→ a vertical clip you can watch · 3→ a bad clip gets BLOCKED with reasons · 4→ one call
returns ready + blocked lists, and the run shows in Langfuse · 5→ the queue works and
`npm run e2e` passes.
Wrong? Tell claude exactly what failed and let it fix. Never fix silently.

**28.** SHIP IT:
```bash
git add -A && git commit -m "feat: <skill> (Spec #1)" && git push
```
Open the PR on GitHub → wait for green (inspector + evals + e2e) → **Merge**.
**YOU GET:** the live URL updates itself within minutes.

**29.** GO BACK TO STEP 23 with the next prompt. **All five merged? Continue to Part 5.**

---

## PART 5 — THE NIGHT SHIFT (steps 30–40, day 6–7)

**30.** OPEN `playbooks/daily-clips.md` → adjust by hand: trigger time, clip count (5–7),
escalation channel. This file you write yourself — it's your thinking.
**31.** IN `claude`: "Make loop.run() execute playbooks/daily-clips.md: gather → produce →
verify → retry only failures → stop at the send_external_message checkpoint, put results in
the review queue. Caps from config.yaml, never hardcoded."
**32.** RUN: `npm run loop:dry`
**YOU GET:** a summary — clips made, attempts, cost, "stopped at checkpoint".
**33.** COMMIT + push + merge (same as step 28).

**34.** GET AN ALWAYS-ON HOST for n8n (a ~$5–7/mo VPS or container — ask ops; serverless
won't work, it must be awake at 2am). Run the `n8nio/n8n` Docker image with a persistent
volume and your public HTTPS `WEBHOOK_URL`.
**35.** IN N8N → New workflow → node **Schedule Trigger** → Cron `0 2 * * *` → connect to
node **HTTP Request** → POST to your loop's webhook URL → **Activate**.
**YOU GET:** tomorrow morning, a 2:00 run in Langfuse that nobody started.

**36.** OPEN `evals/promptfooconfig.yaml` → confirm the four "never" rules from the spec are
tests → `npm run evals` passes → commit + merge.
**YOU GET:** from now on, a change that worsens quality **cannot merge**. Never lower
`baseline_score` to force green.

**37.** MORNING ROUTINE (yours during the pilot, the client's after): open the live URL at
8:30 → approve/reject each clip → done in under 10 minutes.
**38.** REJECTIONS: each one is information. Fix the **playbook or the guardrails**, not the
individual clip.
**39.** WATCH: Langfuse daily — cost per clip, approval rate. Escalations arrive in Slack.
**40.** **V1 IS DONE** when: all 5 prompts merged · evals green · the 2:00 run happens
nightly · approval takes ≤10 min. Now the 2-week pilot measures the spec's numbers.

---

## PART 6 — AFTERWARD (the short version)

**41.** AUTONOMY, by the numbers in `config.yaml → autonomy`: **≥95% approved-unedited over
10 working days** → Level 2 (batch approval). Holds again → Level 3 (`loops.supervised:
false`, human reads the weekly summary). **Any Sev-1, or 2 days below 80% → automatic
demotion.** Irreversible actions (spend, external messages, deletes) stay human-approved at
**every** level, forever.
**42.** Platform approvals landed (10b–d)? → enable the publish skill behind the checkpoint.
Until then, a human posts the approved clips manually.
**43.** PAUSE the product: `loops.enabled: false` + commit. Never by deleting the n8n schedule.
**44.** Something the template can't express? Open a `framework-change` issue. Don't work around it.
**45.** Stuck > half a day? Say so in Slack. Blocked-and-quiet is the only real failure.
**46.** NEXT PRODUCT: new spec (step 11 with different nouns), same 46 steps. That's the framework.

---

*Why each step exists → `BUILD_GUIDE.md`. The rules the inspector enforces → `CLAUDE.md`.*
