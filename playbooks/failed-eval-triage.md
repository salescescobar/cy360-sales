# Playbook: failed-eval-triage   (supervised)
Goal: every eval regression arrives triaged, not raw.
Trigger: event `evals.gate.failed` (CI webhook → N8N)
Loop:
  1. Gather: failing tests, diff of the PR, recent prompt changes
  2. Act: identify likely cause; draft fix suggestion as PR comment
  3. Verify: suggestion references the specific failing assertion
  4. Done when: comment posted on the PR
Brakes: max_iterations 5 · budget $1 · checkpoint: none (comments only, never pushes code)
Escalation: cause unclear after 5 iterations → tag the engineer on the PR.
