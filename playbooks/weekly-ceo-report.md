# Playbook: weekly-ceo-report   (first supervised loop — low risk, high learning)
Goal: CEO gets one message with the 5 numbers, no meetings.
Trigger: cron `0 8 * * MON` (N8N)
Loop:
  1. Gather: Langfuse (cost, p95 latency, eval score, usage, automation rate) + GitHub (shipped PRs, open specs)
  2. Act: draft the report (template below)
  3. Verify: all 5 numbers present and within sane ranges; else retry (max 3)
  4. Done when: report posted to Slack #ceo-weekly
Brakes: max_iterations 3 · budget $0.50 · checkpoint: none (read-only + internal message)
Escalation: missing data source → notify #ops with which integration failed.

Template:
  📊 {{project}} — week {{week}}
  💰 Cost: ${{cost}} / ${{budget}} · ⚡ p95: {{latency}}ms · ✓ Evals: {{score}}
  📈 Usage: {{requests}} req · ↺ Automation: {{automation_pct}}% of tasks zero-touch
  🚢 Shipped: {{prs}} · 📋 Specs awaiting approval: {{specs}}
