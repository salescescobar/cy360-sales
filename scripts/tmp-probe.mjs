const base = "http://localhost:3000";

async function main() {
  const form = new URLSearchParams();
  form.set("email", "judge-admin@cy360-sales.test");
  form.set("password", "judge correct horse battery staple");
  const login = await fetch(`${base}/api/admin/login`, {
    method: "POST",
    body: form,
    redirect: "manual",
  });
  console.log("login status", login.status);
  const setCookie = login.headers.get("set-cookie");
  console.log("set-cookie present", !!setCookie);
  if (!setCookie) { console.log(await login.text()); return; }
  const cookie = setCookie.split(";")[0];

  const corrections = [
    { source: "courtreserve", matchGroup: "Membership Fee", matchItem: null, businessLine: "memberships", priority: 10 },
    { source: "courtreserve", matchGroup: "Event Registration", matchItem: null, businessLine: "events", priority: 10 },
    { source: "courtreserve", matchGroup: "Guest Fees - Events", matchItem: null, businessLine: "events", priority: 10 },
    { source: "courtreserve", matchGroup: "Reservation", matchItem: null, businessLine: "pickleball", priority: 10 },
    { source: "courtreserve", matchGroup: "Guest Fees - Reservations", matchItem: null, businessLine: "pickleball", priority: 10 },
    { source: "courtreserve", matchGroup: "Lesson", matchItem: null, businessLine: "lessons", priority: 10 },
    { source: "gotab", matchGroup: "uncategorized", matchItem: null, businessLine: "food_beverage", priority: 50 },
  ];
  for (const rule of corrections) {
    const r = await fetch(`${base}/api/admin/business-lines`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify(rule),
    });
    console.log("POST rule", rule.matchGroup, "->", rule.businessLine, "status", r.status);
  }

  const res = await fetch(`${base}/api/admin/business-lines?location=orlando&month=2026-07`, {
    headers: { cookie },
  });
  console.log("business-lines status", res.status);
  const data = await res.json();
  console.log("rules count", data.rules?.length);
  console.log("RULES", JSON.stringify(data.rules, null, 2));
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

  // create a throwaway manager + sign in, then check the actual growth-report for July 2026
  const mgrEmail = `tmp-probe-${Date.now()}@example.com`;
  const mgrPassword = "tmpprobe123";
  const mgrForm = new URLSearchParams();
  mgrForm.set("email", mgrEmail);
  mgrForm.set("password", mgrPassword);
  mgrForm.set("location", "orlando");
  const createMgr = await fetch(`${base}/api/admin/managers`, { method: "POST", headers: { cookie }, body: mgrForm, redirect: "manual" });
  console.log("create manager status", createMgr.status);

  const mgrLoginForm = new URLSearchParams();
  mgrLoginForm.set("email", mgrEmail);
  mgrLoginForm.set("password", mgrPassword);
  const mgrLogin = await fetch(`${base}/api/login`, { method: "POST", body: mgrLoginForm, redirect: "manual" });
  const mgrSetCookie = mgrLogin.headers.get("set-cookie");
  console.log("manager login status", mgrLogin.status, "cookie", !!mgrSetCookie);
  if (!mgrSetCookie) return;
  const mgrCookie = mgrSetCookie.split(";")[0];

  const reportRes = await fetch(`${base}/api/growth-report?location=orlando&period=month&date=2026-07`, { headers: { cookie: mgrCookie } });
  const report = await reportRes.json();
  console.log("\nJULY 2026 REPORT ROWS:");
  for (const r of report.report?.rows ?? []) console.log(r.label.padEnd(20), r.current, r.priorMonth, r.lastYear, r.vsPriorMonthPct, r.vsLastYearPct);
  console.log("missing", JSON.stringify(report.report?.missing));
  console.log("daysRow", JSON.stringify(report.report?.daysRow));
}

main().catch(e => { console.error(e); process.exit(1); });
