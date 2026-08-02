/**
 * B · Product Core — the live brain. Every user-facing action flows through core.run().
 * Routing (workflow first) → guardrails → permissions → sandboxed execution.
 */
import { z } from "zod";

export const User = z.object({ id: z.string(), role: z.enum(["admin", "staff", "customer"]) });
export type User = z.infer<typeof User>;

export type CoreResult =
  | { status: "ok"; output: unknown; trace: string }
  | { status: "needs_human"; reason: string; checkpoint: string }
  | { status: "blocked"; rule: string };

export async function run(request: string, user: User): Promise<CoreResult> {
  // 1. Route: is there a fixed workflow for this? (workflow first, agent second)
  // 2. Plan + delegate to subagents/skills as needed
  // 3. Guardrails: validate output against JSON Schema, filter, hallucination check
  // 4. Permissions: user.role gates tools and data scope
  // 5. Sensitive action? → return needs_human (checkpoint from config.yaml)
  // Every step traced to Langfuse (tags: project, component:"B").
  throw new Error("not implemented — see docs/architecture.md#core");
}
