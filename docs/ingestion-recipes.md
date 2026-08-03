# Ingestion recipes — CY360 Sales

## Screen-scraped data is guilty until proven innocent

### The incident (confirmed root cause)

GoTab's `manager/sales` page renders its figures with client-side JavaScript — the HTML that
comes back on navigation is mostly empty; the numbers arrive a beat later once the page's own
app has fetched and rendered them.

The original backfill script navigated day by day and waited for exactly one condition before
parsing: the text `"Gross Sales"` present somewhere in `main.innerText`. That label is *always*
on screen once the page has rendered anything at all — including the PREVIOUS day's render,
still sitting there while the new day's data was still loading. On a slow load, the script
parsed those stale numbers and stored them under the new day's date.

The result: 13 of 583 days ended up more than 4x their trailing 90-day median, totalling
$432,682 — 17% of the $2.57M loaded. The worst, 2025-07-09, showed $83,070 against neighbours
of $2,700–$7,400. Outlier detection alone cannot fully repair this after the fact: a stale
read of a *similarly-sized* neighbouring day produces a number that looks completely
unremarkable — invisible to any threshold check. The only real fix is to go back and
re-verify every single day against the live page, which is what `scripts/gotab-verify.ts` does.

### The guard

**Never parse a scraped page without first asserting the page's own context matches what you
requested.** "A label is present" proves the page rendered *something*, not that it rendered
*your* something. Concretely, for any page whose content depends on a URL parameter (a date,
an ID, a filter):

1. Read back what the page itself displays as its current context — here, GoTab's period
   label (`"Aug 1, 2026 - Aug 1, 2026"`), not the URL you sent it.
2. Poll for that context to equal what you asked for, with a timeout. If it never matches,
   record the fetch as failed (`status: 'unreadable'`) and **parse nothing** — never fall back
   to whatever happens to be on screen.
3. Once it matches, re-read the content again a short beat later (300ms) and require the two
   reads to be byte-identical before trusting either one. A page can update its date label
   and its figures in separate renders — reading immediately after the label changes can still
   catch the figures mid-transition. Two stable reads in a row is the cheapest way to rule
   that out without needing to know the page's internal render sequence.

`packages/skills/gotab-ingest/verify.ts` implements this as three pure, unit-testable
functions (`gotabDateLabel`, `pageShowsRequestedDate`, `parseGotabPeriodLabel`) with no
Playwright dependency — `scripts/gotab-verify.ts` is the only thing that drives a real
browser, connecting over CDP to a human's already-authenticated Chrome (GoTab blocks
automated browsers) rather than launching its own.

### The rule

> Never parse a scraped page without asserting the page's own displayed context matches what
> you requested. A label being present on screen is not evidence of anything except that the
> page has rendered *some* state — possibly the previous request's.

This applies to every screen-scraped source this product ingests from, present or future —
not just GoTab. Any new browser-driven ingestion skill must show, in its own tests, a fixture
where the page's displayed context does NOT match the request (guard refuses to parse) and one
where it does (guard parses normally) — see `scripts/selftest.ts`, section "gotab-ingest/verify:
the stale-page guard."

### The guardrails this incident also produced

Because outlier detection alone missed this class of bug, `packages/core/dataQuality.ts` now
runs two independent checks after every ingestion write, and a rollup on top of both:

- `outlier_day` (warn) — a day's gross exceeds 4x its trailing 90-day median for that source.
- `unverified_day` (error) — `scripts/gotab-verify.ts` marked the day `unreadable` or
  `mismatch` (the guard above failed, or the re-check literally never happened yet).
- `month_unreliable` (error) — the day's month contains any unresolved error-severity flag.

Every unresolved error-severity flag is visible at `/admin/data-quality` and blocks the
report from presenting that period as final — see the honesty banner on the manager dashboard.
Nothing resolves itself; an admin has to look at the day and clear it deliberately.
