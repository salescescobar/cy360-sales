import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newPage();
const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', e => errors.push(String(e)));

const t0 = Date.now();
await page.goto('http://localhost:3000/', { waitUntil: 'load' });
console.log('LOAD_MS', Date.now() - t0, 'URL', page.url());
console.log('ERRORS', JSON.stringify(errors));
console.log('BODY', (await page.textContent('body'))?.slice(0, 1000));

await page.goto('http://localhost:3000/login').catch(e => console.log('login nav err', e.message));
console.log('LOGIN_URL', page.url());
console.log('LOGIN_BODY', (await page.textContent('body'))?.slice(0, 1000));

await page.goto('http://localhost:3000/admin/login').catch(e => console.log('admin login nav err', e.message));
console.log('ADMIN_LOGIN_URL', page.url());
console.log('ADMIN_LOGIN_BODY', (await page.textContent('body'))?.slice(0, 1500));
console.log('ADMIN_LOGIN_HTML', await page.content());

await browser.close();
