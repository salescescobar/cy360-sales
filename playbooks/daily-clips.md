# Playbook: daily-clips   (the worked example — Crushyard Clips)

Goal: 5–7 publishable vertical clips per day, 80%+ approved with no edits.

Trigger: cron `0 2 * * *` (N8N) — after the cameras finish uploading the day.

Loop:
  1. Gather → knowledge.query("today's moments, courts 1-4") using the video-moments skill
  2. Act   → pick top 5–7 by score; for each: video-edit (cut, 9:16, subtitles, logo) + write caption
  3. Verify→ brand-guardrails on every clip + caption. Failures go back to step 2 (same clip only)
  4. Done when → all approved clips sit in the review queue and the human has been notified

Brakes: max_iterations 8 · budget_per_run $2 · checkpoint: send_external_message (publishing)
Escalation: fewer than 3 clips pass after 8 attempts → notify #ops with the reasons.

Autonomy: starts supervised (human approves each clip).
  → Level 2 after 2 weeks at ≥80% approved unedited: approve the day's batch in one click.
  → Level 3 when quality holds: publishes itself, human reads the weekly summary.
  → Auto-demote one level if approval rate drops below 80% for 3 days.
