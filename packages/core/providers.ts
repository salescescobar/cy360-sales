/** Multi-provider fallback + cheap-first routing. Read models from config.yaml. */
export async function complete(_prompt: string): Promise<string> {
  // primary → on failure/timeout: retry w/ backoff → fallback model.
  throw new Error("not implemented");
}
