import { test } from "@playwright/test";

const log = (k: string, v: any) => console.log("RESULT " + k + " " + JSON.stringify(v));

async function loginManager(page: any) {
  await page.goto("/login");
  await page.locator('input[type="email"]').first().fill("finaljudge-mgr-1785735838008@example.com");
  await page.locator('input[type="password"]').first().fill("JudgeTempPass!2026");
  await page.locator('button[type="submit"]').first().click();
  await page.waitForLoadState("networkidle").catch(() => {});
}

test("clickable elements probe", async ({ page }) => {
  test.setTimeout(120_000);
  await loginManager(page);
  await page.goto("/dashboard/orlando/day/2026-08-01");
  await page.waitForTimeout(800);

  const clickableInfo = await page.evaluate(() => {
    const all = Array.from(document.querySelectorAll("*"));
    const results: any[] = [];
    for (const el of all) {
      const text = el.textContent?.trim() || "";
      if (text.startsWith("Food & Beverage") || text === "Food & Beverage") {
        const style = window.getComputedStyle(el);
        results.push({
          tag: el.tagName,
          cursor: style.cursor,
          onclick: (el as any).onclick != null,
          role: el.getAttribute("role"),
          textLen: text.length,
          text: text.slice(0, 50),
        });
      }
    }
    return results.slice(0, 20);
  });
  log("clickable_probe", clickableInfo);

  // try clicking the deepest/smallest matching element
  const target = page.locator("text=Food & Beverage").last();
  const box = await target.boundingBox();
  log("target_box", box);
  await target.click({ force: true }).catch((e:any) => log("click_err", String(e)));
  await page.waitForTimeout(600);
  log("url_after_force_click", page.url());
  const body = (await page.textContent("body")) ?? "";
  log("body_after_force_click", body.slice(0, 1000));
});
