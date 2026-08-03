import { loadLocalEnv } from "../packages/core/env";
loadLocalEnv();

async function main() {
  const url = process.env.SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_KEY!;
  const headers = { apikey: key, Authorization: `Bearer ${key}` };

  const res = await fetch(`${url}/rest/v1/sales_transactions?select=*&external_id=eq.49151068%230`, { headers });
  console.log("existing rows with that external_id:", JSON.stringify(await res.json(), null, 2));

  const jan = await fetch(`${url}/rest/v1/sales_transactions?select=id&location_slug=eq.orlando&business_date=gte.2025-01-01&business_date=lte.2025-01-31&limit=1`, { headers: { ...headers, Prefer: "count=exact" } });
  console.log("Jan 2025 sales_transactions count now:", jan.headers.get("content-range"));
}
main().catch(e => { console.error("diag failed:", e); process.exit(1); });
