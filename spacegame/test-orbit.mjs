import { chromium } from 'playwright';

const errors = [];
const url = 'http://localhost:8765/spacegame/index.html';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1360, height: 860 } });

page.on('console', msg => {
  const t = msg.text();
  if (msg.type() === 'error' && !t.includes('message channel closed') && !t.includes('inject-api')) {
    errors.push(`[console] ${t}`);
  }
});
page.on('pageerror', err => {
  const t = err.message;
  if (!t.includes('message channel closed') && !t.includes('inject-api')) {
    errors.push(`[pageerror] ${t}`);
  }
});

async function state() {
  return page.evaluate(() => ({
    mode: window.__mode(),
    scale: window.__scale(),
    selected: window.__selected(),
    missionStage: window.__missionStage(),
    missionIdx: window.__missionIdx(),
    unlocked: window.__unlocked(),
    tourIdx: window.__tourIdx(),
    tourPlaying: window.__tourPlaying(),
  }));
}

await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);

const loadingHidden = await page.evaluate(() => {
  const el = document.getElementById('loading');
  return !el || el.classList.contains('hide');
});
console.log('loading hidden:', loadingHidden);
console.log('boot:', JSON.stringify(await state()));

// 信息面板
const infoName = await page.evaluate(() => document.getElementById('info-name')?.textContent);
console.log('info name:', infoName);

// 切换尺度 solar
await page.evaluate(() => window.__stepScale(1));
await page.waitForTimeout(1200);
console.log('after stepScale+1:', JSON.stringify(await state()));

// 点击一个天体（dock）
await page.evaluate(() => {
  const b = [...document.querySelectorAll('.dock-item')].find(x => x.dataset.id === 'saturn');
  b && b.click();
});
await page.waitForTimeout(1200);
console.log('after select saturn:', JSON.stringify(await state()));
const saturnInfo = await page.evaluate(() => document.getElementById('info-name')?.textContent);
console.log('saturn info name:', saturnInfo);

// 图层开关
await page.evaluate(() => window.__toggleLayer('orbits'));
await page.waitForTimeout(300);
console.log('orbit layer toggled');

// 任务模式
await page.evaluate(() => window.__openMissionSelect());
await page.waitForTimeout(800);
console.log('mission started:', JSON.stringify(await state()));

// 前往目标
await page.evaluate(() => window.__missionGo());
await page.waitForTimeout(6000);
console.log('after missionGo:', JSON.stringify(await state()));

// 若到答题阶段，答对
for (let i = 0; i < 3; i++) {
  const stage = await page.evaluate(() => window.__missionStage());
  if (stage === 'quiz') {
    await page.evaluate(() => {
      const b = document.querySelector('.quiz-opt[data-i="1"]');
      b && b.click();
    });
    await page.waitForTimeout(2000);
  } else {
    await page.waitForTimeout(4000);
  }
}
console.log('mission final:', JSON.stringify(await state()));
const kcVisible = await page.evaluate(() => document.getElementById('knowledge-card')?.classList.contains('show'));
console.log('knowledge card shown:', kcVisible);

// 导览
await page.evaluate(() => window.__startTour());
await page.waitForTimeout(1200);
console.log('tour started:', JSON.stringify(await state()));
await page.evaluate(() => window.__tourNext());
await page.waitForTimeout(800);
console.log('tour after next:', JSON.stringify(await state()));
await page.evaluate(() => window.__tourToggle());
await page.waitForTimeout(400);
console.log('tour after toggle:', JSON.stringify(await state()));

console.log('ERRORS:', errors.length ? errors : 'none');
await browser.close();
console.log(errors.length ? 'FAIL' : 'PASS');
process.exit(errors.length ? 1 : 0);
