/**
 * E · Loop Agent — background automation with brakes.
 * Trigger (N8N) → gather context → act → verify → repeat → done | escalate.
 * Caps (max iterations, budget) come from config.yaml. Every run leaves an audit trail.
 */
export type Trigger =
  | { kind: "cron"; expr: string }
  | { kind: "webhook"; id: string }
  | { kind: "event"; name: string }
  | { kind: "threshold"; metric: string; above: number };

export type LoopOutcome =
  | { status: "done"; iterations: number; costUsd: number; auditTrailUrl: string }
  | { status: "escalated"; reason: string; auditTrailUrl: string }
  | { status: "capped"; cap: "iterations" | "budget"; auditTrailUrl: string };

export async function run(trigger: Trigger, playbook: string): Promise<LoopOutcome> {
  // 1. Load /playbooks/<playbook>.md (versioned = code)
  // 2. Loop: gather → act → verify (evaluator-optimizer) → repeat
  // 3. Enforce caps from config.yaml; checkpoints pause for human approval
  // 4. supervised: true → every run requires approval before acting
  // 5. Trace everything to Langfuse (tags: component:"E", playbook)
  throw new Error("not implemented — see docs/architecture.md#loops");
}
