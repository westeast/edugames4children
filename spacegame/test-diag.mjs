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

// Click start button
await page.click('#startBtn');
await page.waitForTimeout(2000);

// Check main menu visible
const menuVisible = await page.evaluate(() => {
  const el = document.getElementById('mainMenu');
  return el && el.style.display !== 'none';
});

// Click mission mode (first menu card)
await page.evaluate(() => {
  document.querySelector('.menu-card')?.click();
});
await page.waitForTimeout(1000);

// Click first mission
await page.evaluate(() => {
  document.querySelector('.mission-item')?.click();
});
await page.waitForTimeout(1000);

const missionPanelVisible = await page.evaluate(() => {
  const el = document.getElementById('missionPanel');
  return el && el.style.display !== 'none';
});

// Switch to tour mode
await page.evaluate(() => {
  document.getElementById('mainMenu').style.display = '';
  document.getElementById('missionSelect').style.display = 'none';
  document.getElementById('missionPanel').style.display = 'none';
  document.querySelectorAll('.menu-card')[2]?.click();
});
await page.waitForTimeout(1000);

const tourPanelVisible = await page.evaluate(() => {
  const el = document.getElementById('tourPanel');
  return el && el.style.display !== 'none';
});

console.log('=== DIAG RESULTS ===');
console.log('menuVisible:', menuVisible);
console.log('missionPanelVisible:', missionPanelVisible);
console.log('tourPanelVisible:', tourPanelVisible);
console.log('errors:', errors.length ? errors : 'none');

await browser.close();

if (errors.length) {
  console.log('FAIL: JS errors found');
  process.exit(1);
} else {
  console.log('PASS: no JS errors');
}
