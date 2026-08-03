import { loadLocalEnv } from "../packages/core/env";
loadLocalEnv();

async function main() {
  const user = process.env.COURTRESERVE_API_USER!;
  const pass = process.env.COURTRESERVE_API_PASS!;
  const auth = Buffer.from(`${user}:${pass}`).toString("base64");
  const res = await fetch("https://api.courtreserve.com/api/v1/transactions/salessummarydetailed?paymentStartDate=2025-01-01&paymentEndDate=2025-01-31", {
    headers: { Authorization: `Basic ${auth}`, Accept: "application/json" },
  });
  const body = await res.json();
  console.log("top-level keys:", Object.keys(body));
  console.log("Data keys:", Object.keys(body.Data));
  console.log("DetailedRows length:", body.Data.DetailedRows.length);
}
main().catch(e => { console.error("diag failed:", e); process.exit(1); });
