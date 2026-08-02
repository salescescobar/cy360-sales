/**
 * B · Model Router — the mechanism, not just the policy.
 * No file outside this one names a model. Callers say the TASK CLASS; the router
 * picks the cheapest capable rung from config.yaml, escalates one rung per failed
 * attempt, and logs an auditable cost estimate per call.
 */
import { readFileSync, mkdirSync, appendFileSync } from "node:fs";
import { parse } from "yaml";
import { z } from "zod";

export const TaskClass = z.enum(["classify","extract","format","summarize","reason","code","judge","architect"]);
export type TaskClass = z.infer<typeof TaskClass>;

type Rung = "cheap" | "mid" | "top" | "frontier";
const ORDER: Rung[] = ["cheap", "mid", "top", "frontier"];

type ModelsCfg = {
  cheap: string; mid: string; top: string; frontier?: string;
  classes: Record<string, { start: Rung; max: Rung; different_family_than?: string }>;
  max_cost_per_call_usd?: number;
};

let _cfg: ModelsCfg | null = null;
function cfg(): ModelsCfg {
  if (!_cfg) _cfg = (parse(readFileSync("config.yaml", "utf8")) as { models: ModelsCfg }).models;
  return _cfg;
}

/** USD per million tokens (input, output). ESTIMATES — verify against the live price list. */
const PRICES: Record<string, [number, number]> = {
  "claude-haiku-4-5": [1, 5],
  "claude-sonnet-4-6": [3, 15],
  "claude-opus-4-8": [15, 75],
  "claude-fable-5": [15, 75],   // TODO verify — frontier pricing not confirmed; estimate only
};

export type Route = { model: string; rung: Rung; reason: string; warnings: string[] };

export function route(task: TaskClass, opts: { attempt?: number; avoidFamilyOf?: string } = {}): Route {
  const c = cfg();
  const cls = c.classes[task];
  if (!cls) throw new Error(`Unknown task class: ${task}`);
  const startIdx = ORDER.indexOf(cls.start);
  const maxIdx = ORDER.indexOf(cls.max);
  const idx = Math.min(startIdx + Math.max(0, (opts.attempt ?? 1) - 1), maxIdx);
  const rung = ORDER[idx];
  const model = (c[rung] ?? c.top) as string;
  const warnings: string[] = [];
  if (opts.avoidFamilyOf && family(model) === family(opts.avoidFamilyOf))
    warnings.push("judge/builder family constraint unmet — configure an alternate family for the judge in config.yaml");
  return { model, rung, reason: `${task} · attempt ${opts.attempt ?? 1} → ${rung}`, warnings };
}
const family = (m: string) => m.split("-")[0];

export function estimateCostUsd(model: string, inputTokens: number, outputTokens: number): number {
  const [pin, pout] = PRICES[model] ?? [3, 15];
  return (inputTokens * pin + outputTokens * pout) / 1_000_000;
}

function logCost(entry: object) {
  mkdirSync(".loop", { recursive: true });
  appendFileSync(".loop/costs.jsonl", JSON.stringify({ at: new Date().toISOString(), ...entry }) + "\n");
}

/** Execute a task at the routed rung. Requires ANTHROPIC_API_KEY; cost is logged either way. */
export async function runTask(task: TaskClass, prompt: string, opts: { attempt?: number; system?: string; avoidFamilyOf?: string; maxTokens?: number } = {}): Promise<string> {
  const r = route(task, opts);
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error(`runTask(${task}) needs ANTHROPIC_API_KEY — routed to ${r.model} (${r.reason})`);
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: r.model, max_tokens: opts.maxTokens ?? 1024, system: opts.system, messages: [{ role: "user", content: prompt }] }),
  });
  if (!res.ok) throw new Error(`model call failed (${res.status}): ${await res.text()}`);
  const data = (await res.json()) as { content: Array<{ type: string; text?: string }>; usage: { input_tokens: number; output_tokens: number } };
  const cost = estimateCostUsd(r.model, data.usage.input_tokens, data.usage.output_tokens);
  const max = cfg().max_cost_per_call_usd ?? Infinity;
  logCost({ task, model: r.model, rung: r.rung, in: data.usage.input_tokens, out: data.usage.output_tokens, usd: +cost.toFixed(5) });
  if (cost > max) throw new Error(`call cost $${cost.toFixed(3)} exceeded max_cost_per_call_usd (${max})`);
  return data.content.filter(b => b.type === "text").map(b => b.text ?? "").join("\n");
}
