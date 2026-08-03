import { loadLocalEnv } from "../packages/core/env";
loadLocalEnv();

async function main() {
  const url = process.env.SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_KEY!;
  const headers = { apikey: key, Authorization: `Bearer ${key}` };

  const res = await fetch(`${url}/rest/v1/`, { headers });
  const spec = await res.json();
  const def = spec.definitions?.revenue_recognized;
  console.log("revenue_recognized columns:", JSON.stringify(def, null, 2));
}
main().catch(e => { console.error("diag failed:", e); process.exit(1); });
