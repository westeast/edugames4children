import { chromium } from 'playwright';

const errors = [];
const url = 'http://localhost:8765/spacegame/index.html';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1360, height: 860 } });

page.on('console', msg => {
  const t = msg.text();
  if (msg.type() === 'error' && !t.includes('message channel closed') && !t.includes('inject-api')) errors.push(`[console] ${t}`);
});
page.on('pageerror', err => {
  const t = err.message;
  if (!t.includes('message channel closed') && !t.includes('inject-api')) errors.push(`[pageerror] ${t}`);
});

const st = () => page.evaluate(() => ({
  mode: window.__mode(), scale: window.__scale(), selected: window.__selected(),
  missionStage: window.__missionStage(), missionIdx: window.__missionIdx(),
  unlocked: window.__unlocked(), tourIdx: window.__tourIdx(), tourPlaying: window.__tourPlaying(),
}));

await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);

// 依次跑完 5 关，验证任务链 + 知识卡解锁
for (let m = 0; m < 5; m++) {
  await page.evaluate(() => window.__setMode('explore'));
  await page.waitForTimeout(300);
  await page.evaluate(() => window.__openMissionSelect());
  await page.waitForTimeout(600);
  await page.evaluate(() => window.__missionGo());
  // 等到达
  for (let i = 0; i < 12; i++) {
    const s = await page.evaluate(() => window.__missionStage());
    if (s === 'quiz') break;
    await page.waitForTimeout(700);
  }
  const stage = await page.evaluate(() => window.__missionStage());
  console.log(`mission ${m} stage before answer:`, stage);
  if (stage === 'quiz') {
    await page.evaluate(() => document.querySelector('.quiz-opt[data-i="1"]')?.click());
    await page.waitForTimeout(2200);
    await page.evaluate(() => document.getElementById('kc-ok')?.click());
    await page.waitForTimeout(400);
    // 若是最后一关会跳到下一关，通过 next 按钮
    const next = await page.$('#mission-next');
    if (next) { await next.click(); await page.waitForTimeout(600); }
  }
}
console.log('after all missions:', JSON.stringify(await st()));
const unlocked = await page.evaluate(() => window.__unlocked());
console.log('unlocked count:', unlocked.length);

// 导览走完 5 站
await page.evaluate(() => window.__startTour());
await page.waitForTimeout(600);
for (let i = 0; i < 5; i++) {
  await page.evaluate(() => window.__tourNext());
  await page.waitForTimeout(400);
}
console.log('tour after 5 next:', JSON.stringify(await st()));

// 探索：飞向银河系
await page.evaluate(() => window.__setMode('explore'));
await page.evaluate(() => {
  const b = [...document.querySelectorAll('.scale-nav button')].find(x => x.dataset.scale === 'galaxy');
  b && b.click();
});
await page.waitForTimeout(1500);
console.log('galaxy view:', JSON.stringify(await st()));

// 星系图鉴
await page.evaluate(() => {
  const b = [...document.querySelectorAll('.scale-nav button')].find(x => x.dataset.scale === 'local');
  b && b.click();
});
await page.waitForTimeout(1500);
await page.evaluate(() => {
  const b = [...document.querySelectorAll('.dock-item')][0];
  b && b.click();
});
await page.waitForTimeout(1000);
console.log('local view:', JSON.stringify(await st()));

// 图鉴
await page.evaluate(() => document.getElementById('library-btn')?.click());
await page.waitForTimeout(400);
const libShown = await page.evaluate(() => document.getElementById('library')?.classList.contains('show'));
console.log('library shown:', libShown);

console.log('ERRORS:', errors.length ? errors : 'none');
await browser.close();
console.log(errors.length ? 'FAIL' : 'PASS');
process.exit(errors.length ? 1 : 0);
