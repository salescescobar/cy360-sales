import { loadLocalEnv } from "../packages/core/env";
loadLocalEnv();

async function main() {
  const url = process.env.SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_KEY!;
  const headers = { apikey: key, Authorization: `Bearer ${key}` };

  const res = await fetch(`${url}/rest/v1/daily_sales?location_slug=eq.orlando&date=gte.2026-07-28&date=lte.2026-08-02&order=date.asc`, { headers });
  console.log(JSON.stringify(await res.json(), null, 2));
}
main().catch(e => { console.error("diag2 failed:", e); process.exit(1); });
