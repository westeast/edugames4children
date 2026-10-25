import { chromium } from 'playwright';

const errors = [];
const url = 'http://localhost:8765/spacegame/index.html';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

page.on('console', msg => {
  const t = msg.text();
  if (msg.type() === 'error' && !t.includes('message channel closed') && !t.includes('inject-api')) {
    errors.push(`[console] ${msg.type()}: ${t}`);
  }
});
page.on('pageerror', err => {
  const t = err.message;
  if (!t.includes('message channel closed') && !t.includes('inject-api')) {
    errors.push(`[pageerror] ${t}`);
  }
});

await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForTimeout(3000);

// Start game
await page.click('#startBtn');
await page.waitForTimeout(2000);

// Start tour (third menu card)
await page.evaluate(() => {
  document.querySelectorAll('.menu-card')[2]?.click();
});
await page.waitForTimeout(1000);

// Check tour panel
const tourVisible = await page.evaluate(() => {
  const el = document.getElementById('tourPanel');
  return el && el.style.display !== 'none';
});
console.log('tour panel visible:', tourVisible);

// Wait for tour to advance (8s per stop)
await page.waitForTimeout(10000);

const tourState = await page.evaluate(() => {
  return {
    counter: document.getElementById('tourCounter')?.textContent,
    title: document.getElementById('tourTitle')?.textContent,
    targetPlanetIdx: window.__targetPlanetIdx ? window.__targetPlanetIdx() : 'unknown',
  };
});
console.log('tour state after advance:', JSON.stringify(tourState));

// Test next/prev buttons
await page.evaluate(() => window.nextStop());
await page.waitForTimeout(500);
const afterNext = await page.evaluate(() => document.getElementById('tourCounter')?.textContent);
console.log('counter after next:', afterNext);

await page.evaluate(() => window.previousStop());
await page.waitForTimeout(500);
const afterPrev = await page.evaluate(() => document.getElementById('tourCounter')?.textContent);
console.log('counter after prev:', afterPrev);

console.log('errors:', errors.length ? errors : 'none');
await browser.close();

if (errors.length) {
  console.log('FAIL: JS errors found');
  process.exit(1);
} else {
  console.log('PASS: no JS errors');
}
