/** Skill: web-research (Agent A). Tavily/Anthropic search finds; Firecrawl extracts. */
export type ResearchResult = { url: string; title: string; text: string; fetchedAt: string };
export async function research(_query: string, _opts?: { maxSources?: number }): Promise<ResearchResult[]> {
  // 1. search (Anthropic web search or Tavily) -> candidate URLs
  // 2. vet: drop low-quality domains, dedupe
  // 3. extract clean text per URL (Firecrawl)
  // 4. return with fetchedAt so citations can show recency
  throw new Error("not implemented");
}
