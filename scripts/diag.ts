import { loadLocalEnv } from "../packages/core/env";
loadLocalEnv();

async function main() {
  const url = process.env.SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_KEY!;
  const headers = { apikey: key, Authorization: `Bearer ${key}` };

  const res = await fetch(`${url}/rest/v1/sales_transactions?select=*&limit=1`, { headers });
  console.log("sales_transactions full sample:", JSON.stringify(await res.json(), null, 2));

  // find which months are now missing entirely (gap check) for sales_transactions
  const months = ["2025-01","2025-02","2025-03","2025-04","2025-05","2025-06","2025-07","2025-08","2025-09","2025-10","2025-11","2025-12","2026-01","2026-02","2026-03","2026-04","2026-05","2026-06","2026-07","2026-08"];
  for (const m of months) {
    const from = `${m}-01`;
    const [y, mm] = m.split("-").map(Number);
    const to = new Date(Date.UTC(y, mm, 0)).toISOString().slice(0, 10);
    const r = await fetch(`${url}/rest/v1/sales_transactions?select=id&location_slug=eq.orlando&business_date=gte.${from}&business_date=lte.${to}&limit=1`, { headers: { ...headers, Prefer: "count=exact" } });
    console.log(m, "sales_transactions range:", r.headers.get("content-range"));
  }
}
main().catch(e => { console.error("diag failed:", e); process.exit(1); });
