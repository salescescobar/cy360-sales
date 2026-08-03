const { chromium } = require('playwright');

(async () => {
  const results = {};
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
  page.on('pageerror', err => consoleErrors.push('pageerror: ' + err.message));

  const t0 = Date.now();
  try {
    await page.goto('http://localhost:3000', { waitUntil: 'networkidle', timeout: 15000 });
  } catch (e) {
    results.gotoError = e.message;
  }
  const loadTime = Date.now() - t0;
  results.loadTime = loadTime;
  results.consoleErrors = consoleErrors;
  results.title = await page.title();
  results.url = page.url();
  results.bodyText = (await page.textContent('body')).slice(0, 3000);

  await page.screenshot({ path: '/Users/jvasqu21/ailabs/cy360-sales/.judge_scratch/01_home.png', fullPage: true });

  console.log(JSON.stringify(results, null, 2));
  await browser.close();
})();
