const base = "http://localhost:3000";

async function main() {
  const login = await fetch(`${base}/api/admin/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "judge-admin@cy360-sales.test", password: "judge correct horse battery staple" }),
  });
  console.log("login status", login.status);
  const setCookie = login.headers.get("set-cookie");
  console.log("set-cookie present", !!setCookie);
  if (!setCookie) { console.log(await login.text()); return; }
  const cookie = setCookie.split(";")[0];

  const res = await fetch(`${base}/api/admin/business-lines?location=orlando&month=2026-07`, {
    headers: { cookie },
  });
  console.log("business-lines status", res.status);
  const data = await res.json();
  console.log("rules count", data.rules?.length);
  const unmapped = data.unmapped ?? [];
  console.log("unmapped entries", unmapped.length);
  const byGroup = {};
  for (const u of unmapped) {
    const key = `${u.source}::${u.group}`;
    byGroup[key] = (byGroup[key] ?? 0) + u.amountCents;
  }
  const sorted = Object.entries(byGroup).sort((a, b) => b[1] - a[1]);
  console.log("TOP UNMAPPED GROUPS (cents):");
  for (const [k, v] of sorted.slice(0, 30)) console.log(k, v);

  console.log("\nSAMPLE ITEM NAMES (first 40 unmapped rows):");
  for (const u of unmapped.slice(0, 40)) console.log(u.source, "|", u.group, "|", u.item, "|", u.amountCents);
}

main().catch(e => { console.error(e); process.exit(1); });
