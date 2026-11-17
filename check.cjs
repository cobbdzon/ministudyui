const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: '/home/samsepi0l/.cache/ms-playwright/chromium-1254/chrome-linux64/chrome' });
  const page = await browser.newPage();
  const errors = [];
  page.on('console', m => { if (m.type()==='error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push(e.message));
  for (const u of ['/?mock=1','/#/grading','/#/stats']) {
    await page.goto('http://127.0.0.1:3000'+u); await page.waitForTimeout(1200);
  }
  console.log('ERRORS:', errors);
  await browser.close();
})();
