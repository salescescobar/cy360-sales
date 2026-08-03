import { test } from "@playwright/test";

test("probe cron/alert endpoints", async ({ page }) => {
  for (const p of [
    "/api/cron/alerts",
    "/api/cron/refresh",
    "/api/cron/gotab-refresh",
    "/api/cron/watchdog",
    "/api/cron/daily",
    "/api/alerts",
  ]) {
    const resp = await page.request.get(`http://localhost:3000${p}`).catch((e) => null);
    console.log(p, "STATUS", resp?.status());
    if (resp) console.log("BODY", (await resp.text()).slice(0, 300));
  }
});
