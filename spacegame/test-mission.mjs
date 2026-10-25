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

// Start mission 1 (first mission)
await page.evaluate(() => {
  document.querySelector('.menu-card')?.click();
});
await page.waitForTimeout(1000);
await page.evaluate(() => {
  document.querySelector('.mission-item')?.click();
});
await page.waitForTimeout(1000);

// Check mission panel + phase
let phase = await page.evaluate(() => document.getElementById('telePhase')?.textContent);
console.log('mission phase:', phase);

// Click ignite
await page.evaluate(() => {
  document.getElementById('igniteBtn')?.click();
});
await page.waitForTimeout(12000);

phase = await page.evaluate(() => document.getElementById('telePhase')?.textContent);
console.log('phase after launch:', phase);

// Accelerate to orbital velocity (hold ArrowRight + ArrowUp for tangential + radial thrust)
await page.keyboard.down('ArrowRight');
await page.keyboard.down('ArrowUp');
await page.waitForTimeout(15000);
await page.keyboard.up('ArrowRight');
await page.keyboard.up('ArrowUp');

// Check mission step progress
const missionState = await page.evaluate(() => {
  return {
    gamePhase: window.__gamePhase ? window.__gamePhase() : 'unknown',
    missionStepIdx: window.__missionStepIdx ? window.__missionStepIdx() : 'unknown',
    orbitActive: window.__orbitActive ? window.__orbitActive() : false,
    speed: window.__speed ? window.__speed() : 'unknown',
  };
});
console.log('mission state:', JSON.stringify(missionState));

// Collect survey points (click all survey buttons)
await page.waitForTimeout(1000);
const surveyCount = await page.evaluate(() => {
  const btns = document.querySelectorAll('.survey-btn');
  btns.forEach(b => b.click());
  return btns.length;
});
console.log('survey buttons clicked:', surveyCount);
await page.waitForTimeout(1000);

// Check final mission state
const finalState = await page.evaluate(() => {
  return {
    missionStepIdx: window.__missionStepIdx ? window.__missionStepIdx() : 'unknown',
    missionComplete: window.__missionComplete ? window.__missionComplete() : 'unknown',
    knowledgeUnlocked: window.__knowledgeUnlocked ? window.__knowledgeUnlocked() : 'unknown',
  };
});
console.log('final state:', JSON.stringify(finalState));

console.log('errors:', errors.length ? errors : 'none');
await browser.close();

if (errors.length) {
  console.log('FAIL: JS errors found');
  process.exit(1);
} else {
  console.log('PASS: no JS errors');
}
