import { loadLocalEnv } from "../packages/core/env";
loadLocalEnv();

async function main() {
  const url = process.env.SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_KEY!;
  const res = await fetch(`${url}/rest/v1/revenue_recognized?select=location_slug,business_date&order=business_date.asc&limit=1`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  const first = await res.json();
  const res2 = await fetch(`${url}/rest/v1/revenue_recognized?select=location_slug,business_date&order=business_date.desc&limit=1`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  const last = await res2.json();
  console.log("earliest:", JSON.stringify(first));
  console.log("latest:", JSON.stringify(last));

  const res3 = await fetch(`${url}/rest/v1/revenue_recognized?select=location_slug&limit=1`, {
    headers: { apikey: key, Authorization: `Bearer ${key}`, Prefer: "count=exact" },
  });
  console.log("content-range:", res3.headers.get("content-range"));

  const res4 = await fetch(`${url}/rest/v1/revenue_recognized?select=period_month,business_date,group_name,item_name&item_name=ilike.*Evan*&limit=5`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  console.log("evan matches:", JSON.stringify(await res4.json()));

  const res5 = await fetch(`${url}/rest/v1/revenue_recognized?select=period_month,business_date,group_name,item_name&item_name=ilike.*making up for her*&limit=5`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  console.log("her matches:", JSON.stringify(await res5.json()));
}
main().catch(e => { console.error(e); process.exit(1); });
