// 飞机的虚拟飞行 — Playwright 冒烟测试
// 运行：node virtual-flight/test.mjs
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.BASE_URL || 'http://localhost:8765/virtual-flight/index.html';
const SHOTS = new URL('./test-shots/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
mkdirSync(SHOTS, { recursive: true });

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitPhase(page, phase, timeout = 15000) {
  await page.waitForFunction(
    (p) => window.__flightSimDebug && window.__flightSimDebug.phase === p,
    phase,
    { timeout }
  );
}
async function snap(page) {
  return page.evaluate(() => window.__flightSimDebug.snapshot);
}

const browser = await chromium.launch({
  headless: true,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('console', (m) => {
  if (m.type() === 'error') {
    const t = m.text();
    if (/message channel closed|inject-api|ERR_|favicon/i.test(t)) return;
    errors.push(t);
  }
});
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));

try {
  await page.goto(BASE + '?test', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__flightSimDebug?.ready, null, { timeout: 60000 });
  await waitPhase(page, 'menu');
  await page.waitForSelector('#menu:not(.hidden)');
  check('模型加载完成', true, await page.evaluate(() => JSON.stringify(window.__flightSimDebug.assets)));
  check('首页菜单可见', await page.isVisible('#startBtn'));

  const assets = await page.evaluate(() => window.__flightSimDebug.assets);
  check('F-35B 使用真实模型', assets.f35b.loaded);
  check('歼-20 替身模型已加载', assets.j20.loaded);
  check('歼-16 替身模型已加载', assets.j16.loaded);
  check('螺旋桨/民航/敌舰模型已加载', assets.prop.loaded && assets.airliner.loaded && assets.ship.loaded);

  await page.screenshot({ path: SHOTS + '01-menu.png' });

  // 球形地球
  const menuSnap = await snap(page);
  check('菜单世界是球形地球', menuSnap.planetRadius === 20000 && menuSnap.earthVisible, `R=${menuSnap.planetRadius}, earth=${menuSnap.earthVisible}`);
  check('出生点在陆地上', menuSnap.spawnOnLand && menuSnap.spawnType === 'land', `lat=${menuSnap.spawnLat.toFixed(1)}, lon=${menuSnap.spawnLon.toFixed(1)}, type=${menuSnap.spawnType}`);
  check('出生点经纬度正确', Math.abs(menuSnap.spawnLat - 27.5) < 0.2 && Math.abs(menuSnap.spawnLon - 111.5) < 0.2, `${menuSnap.spawnLat.toFixed(1)}, ${menuSnap.spawnLon.toFixed(1)}`);

  // 机型切换
  for (const key of ['prop', 'airliner', 'j20', 'j16', 'f35b']) {
    await page.evaluate((k) => window.__flightSimDebug.setAircraft(k), key);
    await sleep(120);
  }
  const picked = await page.textContent('#pickedName');
  check('机型切换正常', /F-35B/i.test(picked), picked);
  check('机型切换无报错', errors.length === 0, errors.join(' | '));

  // 开始飞行
  await page.click('#startBtn');
  await waitPhase(page, 'flying', 20000);
  await sleep(800);
  let s = await snap(page);
  check('进入飞行阶段', s.phase === 'flying');
  check('HUD 高度/速度/燃油显示', await page.isVisible('#altValue') && await page.isVisible('#speedValue') && await page.isVisible('#fuelPct'));
  check('默认任务目标存在', s.targetsAlive >= 3, `targets=${s.targetsAlive}`);
  check('默认有 4 枚导弹', s.ammo === 4, `ammo=${s.ammo}`);
  await page.screenshot({ path: SHOTS + '02-flight.png' });

  // 起飞
  await page.evaluate(() => window.__flightSimDebug.takeoff());
  await page.waitForFunction(
    () => window.__flightSimDebug.snapshot.altitude > 1.5,
    null,
    { timeout: 12000 }
  ).catch(() => {});
  s = await snap(page);
  check('自动起飞后离地', s.altitude > 1.5, `alt=${s.altitude.toFixed(1)}, phase=${s.phase}`);
  await page.screenshot({ path: SHOTS + '03-takeoff.png' });

  // 飞机滚转时镜头不滚转
  await page.keyboard.down('ArrowLeft');
  await sleep(1600);
  s = await snap(page);
  check('飞机已大幅滚转', Math.abs(s.aircraftRollDeg) > 45, `roll=${s.aircraftRollDeg.toFixed(1)}°`);
  check('滚转时镜头保持水平', s.cameraUpDotLocalUp > 0.98, `upDot=${s.cameraUpDotLocalUp.toFixed(3)}`);
  check('转弯时镜头跟到飞机后方', s.camBehindDot > 0.8, `behind=${s.camBehindDot.toFixed(3)}`);
  await page.screenshot({ path: SHOTS + '03a-bank-no-roll.png' });
  await page.keyboard.up('ArrowLeft');
  await sleep(500);

  // 地球没有边界：绕球面移动后仍在球面上
  await page.evaluate(() => window.__flightSimDebug.warpForward(12000));
  await sleep(300);
  s = await snap(page);
  check('地球地图无边界', s.phase === 'flying' && s.distanceTravelled >= 12000, `travelled=${s.distanceTravelled.toFixed(0)}, r=${s.planetDistance.toFixed(1)}`);
  await page.evaluate(() => window.__flightSimDebug.warpForward(12000));
  await sleep(300);
  s = await snap(page);
  check('绕地球飞行不会飞出地图', s.phase === 'flying' && s.distanceTravelled >= 24000 && s.planetDistance > 20000, `travelled=${s.distanceTravelled.toFixed(0)}, r=${s.planetDistance.toFixed(1)}`);

  // 视角循环 + 摇杆②同步动画
  const view0 = (await snap(page)).view;
  await page.click('#viewBtn');
  await sleep(300);
  const view1 = (await snap(page)).view;
  check('视角切换', view0 !== view1, `${view0} → ${view1}`);
  const pressedSync = await page.evaluate(() => {
    document.getElementById('viewBtn').click();
    return document.getElementById('joyBtn2').classList.contains('pressed');
  });
  check('点视角按钮时摇杆 ② 同步按下', pressedSync);
  await sleep(500);
  check('座舱视角激活', (await snap(page)).view === 'cockpit');
  await page.screenshot({ path: SHOTS + '03b-cockpit.png' });
  await page.evaluate(() => {
    window.__flightSimDebug.cycleView();
    window.__flightSimDebug.cycleView();
  });
  await sleep(300);

  // 开火
  const ammoBefore = (await snap(page)).ammo;
  await page.evaluate(() => window.__flightSimDebug.fireMissile());
  await sleep(250);
  s = await snap(page);
  check('发射导弹后弹药减少', s.ammo === ammoBefore - 1 && s.missileCount >= 1, `ammo=${s.ammo}, flying=${s.missileCount}`);

  // 任务 1：击毁敌舰通关 + 小红花
  await page.evaluate(() => window.__flightSimDebug.forceMissionWin());
  await page.waitForSelector('#victoryOverlay:not(.hidden)', { timeout: 8000 });
  await sleep(600);
  const flowerVisible = await page.isVisible('#redFlower');
  check('任务完成显示小红花', flowerVisible);
  check('胜利阶段正确', (await snap(page)).phase === 'victory');
  await page.screenshot({ path: SHOTS + '04-victory-flower.png' });

  // 再飞一次 → 坠机 → 自动重开
  await page.click('#victoryAgain');
  await waitPhase(page, 'flying');
  await sleep(400);
  await page.evaluate(() => window.__flightSimDebug.crashNow());
  await sleep(500);
  check('坠机浮层出现', await page.isVisible('#crashOverlay:not(.hidden)'));
  const parts = (await snap(page)).partsDetached;
  check('坠机后有零部件脱落', parts > 0, `parts=${parts}`);
  await page.screenshot({ path: SHOTS + '05-crash.png' });
  await waitPhase(page, 'flying', 8000);
  check('坠机后自动重新开始', true);

  // VTOL
  await page.evaluate(() => window.__flightSimDebug.exit());
  await waitPhase(page, 'menu');
  await page.evaluate(() => window.__flightSimDebug.setAircraft('f35b'));
  await page.click('#startBtn');
  await waitPhase(page, 'flying');
  await page.evaluate(() => window.__flightSimDebug.enterVTOL());
  await page.waitForFunction(
    () => window.__flightSimDebug.snapshot.nozzleAngle > 1.2,
    null,
    { timeout: 8000 }
  ).catch(() => {});
  s = await snap(page);
  check('F-35B 进入 VTOL', s.vtol === true && s.vtolBlend > 0.5, `blend=${s.vtolBlend.toFixed(2)}`);
  check('VTOL 升力风扇可见', s.liftFanVisible);
  check('VTOL 尾喷管向下旋转', s.nozzleAngle > 1.2, `nozzle=${s.nozzleAngle.toFixed(2)}`);
  await page.screenshot({ path: SHOTS + '06-vtol.png' });
  await page.evaluate(() => window.__flightSimDebug.exitVTOL());
  await sleep(400);
  check('短按退出 VTOL', (await snap(page)).vtol === false);

  // 其他地图
  await page.evaluate(() => window.__flightSimDebug.exit());
  await waitPhase(page, 'menu');
  await page.evaluate(() => window.__flightSimDebug.setMap('carrier'));
  await sleep(800);
  await page.screenshot({ path: SHOTS + '07-carrier-menu.png' });
  await page.click('#startBtn');
  await waitPhase(page, 'flying');
  await sleep(1000);
  s = await snap(page);
  check('航母地图可进入', s.map === 'carrier' && s.phase === 'flying', s.map);
  check('航母出生在甲板上', s.spawnType === 'carrier', `type=${s.spawnType}`);
  await page.screenshot({ path: SHOTS + '08-carrier-flight.png' });

  await page.evaluate(() => window.__flightSimDebug.exit());
  await waitPhase(page, 'menu');
  await page.evaluate(() => window.__flightSimDebug.setMap('volcano'));
  await sleep(800);
  s = await snap(page);
  check('火山地图位于日本陆地', s.spawnOnLand === true, `lat=${s.spawnLat?.toFixed(1)}, lon=${s.spawnLon?.toFixed(1)}`);
  await page.screenshot({ path: SHOTS + '09-volcano-menu.png' });

  // 夜间 + 雨
  await page.evaluate(() => window.__flightSimDebug.setWeather('night', true, 55));
  await sleep(400);
  await page.click('#startBtn');
  await waitPhase(page, 'flying');
  await sleep(1500);
  await page.screenshot({ path: SHOTS + '10-night-rain.png' });
  check('雨夜地图无报错', errors.length === 0, errors.join(' | '));

  // 手机视口
  const mobile = await browser.newPage({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2
  });
  const mErrors = [];
  mobile.on('pageerror', (e) => mErrors.push(e.message));
  await mobile.goto(BASE + '?test', { waitUntil: 'domcontentloaded' });
  await mobile.waitForFunction(() => window.__flightSimDebug?.ready, null, { timeout: 60000 });
  await waitPhase(mobile, 'menu');
  await sleep(400);
  await mobile.screenshot({ path: SHOTS + '11-mobile-menu.png' });
  const menuOverflow = await mobile.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2);
  check('手机菜单无横向溢出', !menuOverflow);
  await mobile.evaluate(() => window.__flightSimDebug.start());
  await waitPhase(mobile, 'flying');
  await sleep(900);
  const mobileHud = await mobile.evaluate(() => {
    const ids = ['altValue', 'speedValue', 'joystick', 'throttle', 'btnFire'];
    const out = {};
    for (const id of ids) {
      const el = document.getElementById(id);
      const r = el.getBoundingClientRect();
      out[id] = { x: r.x, y: r.y, w: r.width, h: r.height, visible: !!el.offsetParent };
    }
    return { out, w: window.innerWidth, h: window.innerHeight, scrollW: document.documentElement.scrollWidth };
  });
  check('手机 HUD 与控制可见', mobileHud.out.altValue.visible && mobileHud.out.joystick.visible && mobileHud.out.throttle.visible);
  check('手机摇杆在屏幕内', mobileHud.out.joystick.x >= 0 && mobileHud.out.joystick.x + mobileHud.out.joystick.w <= mobileHud.w + 1);
  check('手机无横向滚动', mobileHud.scrollW <= mobileHud.w + 2, `scrollW=${mobileHud.scrollW}`);
  await mobile.screenshot({ path: SHOTS + '12-mobile-flight.png' });
  check('手机端无 JS 报错', mErrors.length === 0, mErrors.join(' | '));
  await mobile.close();

  check('全流程无 JS 错误', errors.length === 0, errors.join(' | '));
} catch (err) {
  check('测试执行', false, err.message);
  try { await page.screenshot({ path: SHOTS + '99-failure.png' }); } catch { /* ignore */ }
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} 通过`);
if (failed.length) {
  console.log('失败项：');
  for (const f of failed) console.log(' -', f.name, f.detail);
  process.exit(1);
}
