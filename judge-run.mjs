import { chromium } from "playwright";
import fs from "node:fs";

const BASE = "http://localhost:3000";
const OUT = [];
function log(label, data) {
  const line = `\n=== ${label} ===\n${typeof data === "string" ? data : JSON.stringify(data, null, 2)}`;
  OUT.push(line);
  console.log(line);
}

const creds = JSON.parse(fs.readFileSync("tests/e2e/judge-fixtures/admin-credentials.json", "utf8"));

const browser = await chromium.launch();

async function newCtx() {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const consoleErrors = [];
  page.on("console", (msg) => { if (msg.type() === "error") consoleErrors.push(msg.text()); });
  page.on("pageerror", (err) => consoleErrors.push(String(err)));
  return { ctx, page, consoleErrors };
}

function rnd(tag) { return `${tag}-${Math.floor(Math.random() * 1e9)}@example.com`; }

try {
  // ---------- 0. /login page: no public signup ----------
  {
    const { ctx, page } = await newCtx();
    await page.goto(`${BASE}/login`);
    const bodyText = await page.locator("body").innerText();
    const html = await page.content();
    log("login page body", bodyText.slice(0, 1000));
    const hasSignup = /sign\s*up|create an account|register/i.test(bodyText);
    log("login page has signup link?", hasSignup);
    await ctx.close();
  }

  // ---------- 1. admin login with seeded creds ----------
  const { ctx: adminCtx, page: admin } = await newCtx();
  await admin.goto(`${BASE}/admin/login`);
  await admin.getByLabel(/email/i).fill(creds.email);
  await admin.getByLabel(/password/i).fill(creds.password);
  await admin.getByRole("button", { name: /sign in/i }).click();
  await admin.waitForLoadState("networkidle");
  log("admin login result url", admin.url());
  log("admin login result body", (await admin.locator("body").innerText()).slice(0, 800));

  // ---------- discover manager creation form (locations) ----------
  await admin.goto(`${BASE}/admin/managers`);
  const managersBody = await admin.locator("body").innerText();
  log("admin/managers page body", managersBody.slice(0, 1500));
  const radios = await admin.getByRole("radio").all();
  const radioLabels = [];
  for (const r of radios) {
    const val = await r.getAttribute("value").catch(() => null);
    radioLabels.push(val);
  }
  log("location radio values", radioLabels);

  await browser.close();
} catch (e) {
  log("FATAL ERROR", String(e && e.stack || e));
  try { await browser.close(); } catch {}
}

fs.writeFileSync("judge-run-output.txt", OUT.join("\n"));
