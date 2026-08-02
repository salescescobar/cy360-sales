import { test } from "@playwright/test";

test("judge: find hidden routes / network calls", async ({ page, request }) => {
  const netCalls: string[] = [];
  page.on("request", (req) => netCalls.push(req.method() + " " + req.url()));

  await page.goto("/");
  await page.getByRole("radio").first().check();
  await page.getByRole("button", { name: /continue/i }).first().click();
  await page.waitForLoadState("networkidle").catch(() => {});

  console.log("NET_CALLS=" + JSON.stringify(netCalls.filter(c => !c.includes("_next")), null, 1));

  const routes = ["/upload", "/import", "/admin", "/settings", "/reports", "/signup", "/register", "/dashboard/orlando/upload", "/dashboard", "/api/sales", "/nonexistent-page-xyz"];
  for (const r of routes) {
    const resp = await page.goto(r).catch(e => null);
    console.log("ROUTE " + r + " -> status=" + (resp ? resp.status() : "ERR") + " finalUrl=" + page.url());
  }
});
