---
name: "Loop playbook (component E)"
about: "One background loop. Every loop has an exit, a checkpoint, and a trace."
labels: playbook, loop
---

## Goal (outcome, not activity)

## Trigger
- Type: cron / webhook / event / threshold
- Definition (e.g. `0 8 * * MON` or N8N webhook URL):

## The loop
1. Gather context: (what it reads)
2. Act: (what it does)
3. Verify: (how it checks its own work)
4. Done when: (exit condition)

## Brakes
- Max iterations: (default 8)
- Budget per run: (default $2)
- Checkpoints (human approval):

## Escalation
- When it can't finish → notify: (Slack channel / person) with: (what context)

## Autonomy status
- [ ] Supervised (every run approved) → graduates to autonomous after ___ clean runs
