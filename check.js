const { chromium } = require('./node_modules/playwright');
(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: '/home/samsepi0l/.cache/ms-playwright/chromium-1254/chrome-linux/chrome' });
  const page = await browser.newPage();
  const errors = [];
  page.on('console', m => { if (m.type()==='error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('http://127.0.0.1:3000/?mock=1');
  await page.waitForTimeout(2000);
  await page.screenshot({ path: '/tmp/opencode/home.png' });
  console.log('ERRORS:', errors);
  await browser.close();
})();
