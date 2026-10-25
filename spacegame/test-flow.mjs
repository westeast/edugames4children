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

// Start free explore (launch pad directly)
await page.evaluate(() => {
  window.startFreeExplore();
});
await page.waitForTimeout(1000);

// Check phase
let phase = await page.evaluate(() => window.__phase || document.getElementById('telePhase')?.textContent);
console.log('phase after free explore:', phase);

// Click ignite
await page.evaluate(() => {
  document.getElementById('igniteBtn')?.click();
});
await page.waitForTimeout(1000);

// Wait for launch sequence to progress (assemble 2s + ignite 2.5s + ascend ~8s)
await page.waitForTimeout(12000);

phase = await page.evaluate(() => document.getElementById('telePhase')?.textContent);
console.log('phase after launch:', phase);

// Check rocket position / orbit state
const orbitState = await page.evaluate(() => {
  return {
    gamePhase: window.__gamePhase ? window.__gamePhase() : 'unknown',
    orbitActive: window.__orbitActive ? window.__orbitActive() : false,
    altitude: window.__altitude ? window.__altitude() : 0,
  };
});
console.log('orbit state:', JSON.stringify(orbitState));

console.log('errors:', errors.length ? errors : 'none');
await browser.close();

if (errors.length) {
  console.log('FAIL: JS errors found');
  process.exit(1);
} else {
  console.log('PASS: no JS errors');
}
