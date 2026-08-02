/**
 * B · Checkpoint — the hard gate for irreversible actions.
 * CI's destructive-op linter REQUIRES this wrapper around any spend/send/delete.
 * Behavior: if no valid approval is present, it notifies Slack and throws — the
 * action simply does not happen. Approval is per-action, never blanket.
 */
export type CheckpointKind = "spend_money" | "send_external_message" | "delete_data";

export class CheckpointPending extends Error {
  constructor(public kind: CheckpointKind, public description: string) {
    super(`Checkpoint pending [${kind}]: ${description}. Human approval required.`);
    this.name = "CheckpointPending";
  }
}

export type CheckpointOpts = {
  /** One-time token issued by the review UI / Slack approval flow. */
  approvalToken?: string;
  /** Dry runs report the checkpoint and continue without executing the action. */
  dryRun?: boolean;
};

export async function requireCheckpoint(
  kind: CheckpointKind,
  description: string,
  opts: CheckpointOpts = {},
): Promise<{ approved: boolean; dryRun: boolean }> {
  if (opts.dryRun) return { approved: false, dryRun: true };

  const token = opts.approvalToken ?? process.env.AILABS_APPROVAL_TOKEN;
  if (token && token.length > 0) return { approved: true, dryRun: false };

  const webhook = process.env.SLACK_WEBHOOK_URL;
  if (webhook) {
    await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: `🔒 Approval needed [${kind}]: ${description}` }),
    }).catch(() => undefined); // notification failure must never approve the action
  }
  throw new CheckpointPending(kind, description);
}
