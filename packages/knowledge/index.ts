/**
 * A · Knowledge Agent — the memory of the product.
 * All retrieval flows through here. Every answer carries citations.
 */
import { z } from "zod";

export const Citation = z.object({
  sourceId: z.string(),
  title: z.string(),
  url: z.string().optional(),
  snippet: z.string(),
});
export const Answer = z.object({
  text: z.string(),
  citations: z.array(Citation).min(1), // no citations = invalid answer
  confidence: z.number().min(0).max(1),
});
export type Answer = z.infer<typeof Answer>;

export type Source =
  | { kind: "document"; path: string }
  | { kind: "url"; url: string }
  | { kind: "database"; table: string }
  | { kind: "video"; url: string };            // vision extension
export type QueryOpts = {
  user: { id: string; role: string };
  webResearch?: boolean;   // skill: search + Firecrawl extraction (opt-in per spec)
  video?: boolean;         // skill: video-moments (opt-in per spec)
};

/** Ingest a source: connectors → OCR/dedup → PII scrub → chunk → embed → pgvector. */
export async function ingest(source: Source): Promise<{ sourceId: string; chunks: number }> {
  // TODO(pilot): wire Supabase pgvector + skills in packages/skills
  throw new Error("not implemented — see docs/architecture.md#knowledge");
}

/** Query with hybrid search + reranking. Returns text + mandatory citations. */
export async function query(question: string, opts: QueryOpts): Promise<Answer> {
  // TODO(pilot): hybrid search (bm25 + vector) → rerank → answer with citations.
  // If opts.webResearch, call skills/web-research (Anthropic web search or Tavily),
  // vet sources, and cite them like any other source.
  throw new Error("not implemented");
}
