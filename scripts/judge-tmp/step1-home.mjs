import { chromium } from 'playwright';

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();
const errors = [];
page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
page.on('pageerror', err => errors.push('PAGEERROR: ' + err.message));

const t0 = Date.now();
const resp = await page.goto('http://localhost:3000', { waitUntil: 'networkidle', timeout: 15000 }).catch(e => ({ err: e.message }));
const loadMs = Date.now() - t0;
console.log('STATUS', resp && resp.status ? resp.status() : resp);
console.log('LOAD_MS', loadMs);
console.log('URL_AFTER', page.url());
console.log('TITLE', await page.title());
await page.screenshot({ path: 'scripts/judge-tmp/shot-home.png', fullPage: true });
console.log('CONSOLE_ERRORS', JSON.stringify(errors));

const bodyText = await page.evaluate(() => document.body.innerText.slice(0, 2000));
console.log('BODY_TEXT_START:\n' + bodyText);

await browser.close();
