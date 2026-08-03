import { loadLocalEnv } from "../packages/core/env";
loadLocalEnv();

async function main() {
  const url = process.env.SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_KEY!;
  const headers = { apikey: key, Authorization: `Bearer ${key}` };

  const st = await fetch(`${url}/rest/v1/sales_transactions?select=id&location_slug=eq.orlando&business_date=gte.2025-01-01&business_date=lte.2025-01-31&limit=1`, { headers: { ...headers, Prefer: "count=exact" } });
  console.log("Jan 2025 sales_transactions count:", st.headers.get("content-range"));

  const cr = await fetch(`${url}/rest/v1/court_reservations?select=id&location_slug=eq.orlando&business_date=gte.2025-01-01&business_date=lte.2025-01-31&limit=1`, { headers: { ...headers, Prefer: "count=exact" } });
  console.log("Jan 2025 court_reservations count:", cr.headers.get("content-range"));

  const total = await fetch(`${url}/rest/v1/sales_transactions?select=id&limit=1`, { headers: { ...headers, Prefer: "count=exact" } });
  console.log("total sales_transactions now:", total.headers.get("content-range"));
}
main().catch(e => { console.error("diag failed:", e); process.exit(1); });
