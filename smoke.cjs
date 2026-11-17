const { chromium } = require('playwright');
const fs = require('fs');

const BASE = 'http://127.0.0.1:3000';
const EXEC = '/home/samsepi0l/.cache/ms-playwright/chromium-1254/chrome-linux64/chrome';
const OUT = '/tmp/opencode/shots';
fs.mkdirSync(OUT, { recursive: true });

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: EXEC });
  const errors = [];
  const failed = [];
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('requestfailed', (r) => failed.push(`${r.url()} ${r.failure()?.errorText}`));

  async function shot(name, hash, { theme, width, settle = 700 } = {}) {
    await page.setViewportSize({ width: width || 1280, height: 900 });
    await page.goto(`${BASE}/?mock=1${hash}`, { waitUntil: 'networkidle' });
    if (theme) {
      await page.evaluate((t) => localStorage.setItem('ministudy.theme', t), theme);
      await page.reload({ waitUntil: 'networkidle' });
    }
    await page.waitForTimeout(settle);
    await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
    console.log('shot', name, '->', hash);
  }

  const views = ['', '#/quizzes', '#/grading', '#/stats', '#/deck/1', '#/quiz/1', '#/attempt/1', '#/attempt/2', '#/review/1'];
  for (const hash of views) {
    const name = hash ? hash.replace(/[#/]/g, '_').replace(/^_/, '') : 'home';
    await shot(`light-${name}`, hash, { theme: 'light' });
  }
  await shot('dark-home', '', { theme: 'dark' });
  await shot('dark-stats', '#/stats', { theme: 'dark' });
  await shot('dark-review', '#/review/1', { theme: 'dark' });
  await shot('mobile-home', '', { theme: 'light', width: 390 });
  await shot('mobile-review', '#/review/1', { theme: 'light', width: 390 });
  await shot('mobile-stats', '#/stats', { theme: 'light', width: 390 });
  await shot('mobile-quiz', '#/quiz/1', { theme: 'light', width: 390 });

  console.log('CONSOLE ERRORS:', JSON.stringify(errors, null, 2));
  console.log('FAILED REQUESTS:', JSON.stringify(failed, null, 2));
  await browser.close();
})();
