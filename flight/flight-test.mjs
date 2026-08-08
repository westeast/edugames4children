// 飞行模拟 Playwright 测试：Mini 5 Pro / 竖拍 / 夜间地图 / 5机多机 / 避障规则
import { chromium } from 'playwright';

const errors = [];
const results = [];
let page;

function check(name, cond, extra = '') {
  results.push({ name, ok: !!cond });
  console.log((cond ? 'PASS' : 'FAIL') + '  ' + name + (extra ? '  [' + extra + ']' : ''));
}

async function ev(fn) { return page.evaluate(fn); }
async function waitFor(fn, timeout = 15000, label = 'wait') {
  await page.waitForFunction(fn, null, { timeout }).catch(e => {
    throw new Error(label + ' 超时: ' + e.message.split('\n')[0]);
  });
}

async function main() {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  page = await context.newPage();
  page.on('console', msg => { if (msg.type() === 'error') errors.push('[console] ' + msg.text().slice(0, 300)); });
  page.on('pageerror', err => errors.push('[pageerror] ' + err.message.slice(0, 300)));
  page.on('dialog', d => d.accept().catch(() => {}));

  // 记住原始地图选择，测试结束恢复（goto 完成后才能读 localStorage）
  let origMap = 'mountain';

  await page.goto('http://localhost:8765/flight/index.html', { waitUntil: 'domcontentloaded', timeout: 40000 });
  origMap = await page.evaluate(() => localStorage.getItem('flight-sim-map') || 'mountain');
  await waitFor(() => window.__flightDebug && window.__flightDebug.droneGroup, 25000, 'drone 模型加载');
  await page.waitForTimeout(1500);

  try {
    // ===== 1. 默认机型 Mini 5 Pro =====
    const d = await ev(() => ({
      idx: window.gameState.currentDroneIdx,
      name: window.gameState.droneSpec.name,
      hasFrontLidar: !!window.__flightDebug.droneGroup.getObjectByName('lidarScreen_front'),
      hasSideLidar: !!window.__flightDebug.droneGroup.getObjectByName('lidarScreen_side'),
      hasStaticScreen: !!window.__flightDebug.droneGroup.getObjectByName('lidarScreen_static'),
      hasDji: !!window.__flightDebug.droneGroup.getObjectByName('djiLabel'),
      noLidarClass: document.getElementById('obPanel').classList.contains('no-lidar'),
      obNoteVisible: document.getElementById('obNoLidarNote').style.display !== 'none',
    }));
    check('默认机型 = Mini 5 Pro (idx 7)', d.idx === 7, d.name);
    check('Mini5Pro 前向激光雷达屏存在', d.hasFrontLidar);
    check('Mini5Pro 右臂侧向扫闪屏存在', d.hasSideLidar);
    check('Mini5Pro 右臂常黑静态屏存在', d.hasStaticScreen);
    check('Mini5Pro DJI logo 存在', d.hasDji);
    check('Mini5Pro 有激光雷达 → 避障面板非 no-lidar', !d.noLidarClass);
    check('Mini5Pro 无激光雷达提示隐藏', !d.obNoteVisible);

    // ===== 2. 无损竖拍 =====
    await ev(() => window.togglePortrait());
    await page.waitForTimeout(300);
    const p1 = await ev(() => document.querySelector('#appCanvasWrap canvas').style.transform);
    check('竖拍开启 → 画布 rotate(90deg)', p1.includes('rotate(90deg)'), p1);
    const pp = await ev(() => {
      let p = null;
      window.__flightDebug.droneGroup.traverse(o => { if (!p && o.name === 'portraitPivot') p = o; });
      return p ? +p.rotation.z.toFixed(3) : null;
    });
    check('竖拍时云台保持正立（不倒置）', pp !== null && Math.abs(pp) < 0.1, 'rotZ=' + pp);
    await ev(() => window.togglePortrait());
    await page.waitForTimeout(300);
    const p2 = await ev(() => document.querySelector('#appCanvasWrap canvas').style.transform);
    check('竖拍关闭 → 画布复原', p2 === 'none', p2);

    // ===== 3. 切无激光雷达机型 Air 3 → 避障面板灰化 =====
    await ev(() => window.selectDrone(0));
    await page.waitForTimeout(400);
    const a3 = await ev(() => ({
      noLidarClass: document.getElementById('obPanel').classList.contains('no-lidar'),
      noteShown: document.getElementById('obNoLidarNote').style.display !== 'none',
      portraitBtnHidden: document.getElementById('portraitBtn').style.display === 'none',
      hasLidar: !!window.gameState.droneSpec.lidar,
    }));
    check('Air 3 无激光雷达 → obPanel.no-lidar', a3.noLidarClass);
    check('Air 3 显示"无激光雷达"提示', a3.noteShown);
    check('Air 3 非竖拍机型 → 竖拍按钮隐藏', a3.portraitBtnHidden);
    await ev(() => window.selectDrone(7));
    await page.waitForTimeout(400);

    // ===== 4. 夜间地图 =====
    await ev(() => window.selectMap('night'));
    await waitFor(() => window.gameState.nightActive === true, 20000, '夜间地图切换');
    await page.waitForTimeout(1500);
    const n = await ev(() => {
      const tg = window.__flightDebug.terrainGroup;
      return {
        fog: window.__flightDebug.scene.fog ? window.__flightDebug.scene.fog.color.getHex() : null,
        nightActive: window.gameState.nightActive,
        hasBuildingInTerrain: !!tg.getObjectByName('nightBuilding'),
        cars: window.__flightDebug.cars.length,
        people: window.__flightDebug.people.length,
        feedBar: !!document.getElementById('multiFeedBar'),
      };
    });
    check('夜间地图启用 (nightActive)', n.nightActive);
    check('夜间雾色 0x05050c', n.fog === 0x05050c, '0x' + (n.fog || 0).toString(16));
    check('夜间建筑加入 terrainGroup（避障可检测）', n.hasBuildingInTerrain);
    check('夜间地图有车辆', n.cars > 0, 'cars=' + n.cars);
    check('夜间地图有人', n.people > 0, 'people=' + n.people);
    check('默认单机模式 → 无多机图传栏', !n.feedBar);

    // ===== 5. 5机同时起飞模式 =====
    await ev(() => window.setTakeoffMode('multi'));
    await page.waitForTimeout(500);
    const m = await ev(() => ({
      bar: !!document.getElementById('multiFeedBar'),
      cards: document.querySelectorAll('#multiFeedBar .feed-card').length,
      mode: window.gameState.takeoffMode,
    }));
    check('切多机模式 → state.takeoffMode=multi', m.mode === 'multi');
    check('底部图传栏出现', m.bar);
    check('图传栏 5 个窗口', m.cards === 5, 'cards=' + m.cards);
    await page.waitForTimeout(2000);
    await ev(async () => {
      const THREE = await import('three');
      const lamps = [];
      window.__flightDebug.terrainGroup.traverse(o => { if (o.userData && o.userData.light) lamps.push(o); });
      window.__flightDebug.__testLamps = lamps.length;
      return lamps.length;
    }).then(cnt => check('夜间路灯生成', cnt > 0, 'lamps=' + cnt));

    // ===== 6. 避障功能：亮区绕行生效 =====
    await ev(() => {
      window.gameState.isPreflight = false; // 结束起飞准备，恢复物理
      window.gameState.obstacleMode = 'bypass';
      window.gameState.obstacleEnabled = true;
      window.gameState.takeoffMode = 'single';
      if (window.stopNightShow) window.stopNightShow();
    });
    // 找到一盏路灯，在其前方(约6m)放一个测试障碍，无人机背对灯头朝向障碍
    const lit = await ev(async () => {
      const THREE = await import('three');
      let lamp = null;
      window.__flightDebug.terrainGroup.traverse(o => { if (!lamp && o.userData && o.userData.light) lamp = o; });
      if (!lamp) return { ok: false, reason: 'no lamp' };
      // 无人机：灯前 8m，yaw=0 朝 +Z；前方点(40m)距灯 32m <35 → 亮
      window.gameState.dronePos.set(lamp.position.x, 4, lamp.position.z - 8);
      window.gameState.droneVel.set(0, 0, 0);
      window.gameState.droneYaw = 0;
      // 障碍：灯后 1m（无人机前 9m），大盒子覆盖射线高度
      const box = new THREE.Mesh(
        new THREE.BoxGeometry(3, 6, 3),
        new THREE.MeshBasicMaterial({ color: 0xff3333 })
      );
      box.position.set(lamp.position.x, 3, lamp.position.z + 1);
      window.__flightDebug.terrainGroup.add(box);
      return { ok: true, x: lamp.position.x, z: lamp.position.z };
    });
    check('避障亮区测试就绪（找到路灯）', lit.ok, lit.reason || (lit.x + ',' + lit.z));
    let litSteered = false, litDetected = false;
    if (lit.ok) {
      await page.waitForTimeout(1500);
      const s = await ev(() => {
        const tc = document.getElementById('ob-tc');
        const detected = tc && (tc.classList.contains('active-danger') || tc.classList.contains('active-warn') || tc.classList.contains('active-safe'));
        const side = window.gameState.droneVel.x; // yaw=0 → 右向量=(1,0,0)
        return { detected, side: Math.abs(side), x: window.gameState.dronePos.x, z: window.gameState.dronePos.z };
      });
      litDetected = s.detected;
      litSteered = s.side > 0.3 || Math.abs(s.z - lit.z + 8) > 4; // 侧向速度或明显位移
      check('亮区前向避障检测到障碍 (ob-tc 亮)', litDetected);
      check('亮区绕行真正侧向偏转（非刹停）', litSteered, '|vx|=' + s.side.toFixed(2));
    }

    // ===== 7. 避障功能：暗区前向失效 =====
    const dark = await ev(async () => {
      const THREE = await import('three');
      // 放到 (0,70) 道路上，前方 40m 点 (0,110) 距最近路灯(0,150)=40m >35 → 暗
      window.gameState.dronePos.set(0, 4, 70);
      window.gameState.droneVel.set(0, 0, 0);
      window.gameState.droneYaw = 0;
      const box = new THREE.Mesh(
        new THREE.BoxGeometry(3, 6, 3),
        new THREE.MeshBasicMaterial({ color: 0xff3333 })
      );
      box.position.set(0, 3, 80);
      window.__flightDebug.terrainGroup.add(box);
      return true;
    });
    await page.waitForTimeout(1500);
    const ds = await ev(() => {
      const tc = document.getElementById('ob-tc');
      const detected = tc && (tc.classList.contains('active-danger') || tc.classList.contains('active-warn') || tc.classList.contains('active-safe'));
      return { detected, side: Math.abs(window.gameState.droneVel.x) };
    });
    check('暗区前向避障失效（ob-tc 不亮）', !ds.detected);
    check('暗区无侧向绕行', ds.side < 0.3, '|vx|=' + ds.side.toFixed(2));

    // ===== 8. 切走夜间地图 → 多机清理 + 日间恢复 =====
    await ev(() => window.setTakeoffMode('multi'));
    await ev(() => window.selectMap('mountain'));
    await waitFor(() => window.gameState.nightActive === false, 20000, '切回山地');
    await page.waitForTimeout(800);
    const back = await ev(() => ({
      feedGone: !document.getElementById('multiFeedBar'),
      fog: window.__flightDebug.scene.fog.color.getHex(),
      dayFog: 0x87ceeb,
    }));
    check('切走夜间 → 图传栏移除', back.feedGone);
    check('切走夜间 → 日间雾色恢复', back.fog === back.dayFog, '0x' + back.fog.toString(16));

    // 截图
    await ev(() => window.selectMap('night'));
    await waitFor(() => window.gameState.nightActive === true, 20000, '再切夜间截图');
    await page.waitForTimeout(2000);
    await page.screenshot({ path: 'C:/Users/admin/git/edugames4children/flight/test-shots/night-map.png' });
    await ev(() => window.setTakeoffMode('multi'));
    await page.waitForTimeout(1500);
    await page.screenshot({ path: 'C:/Users/admin/git/edugames4children/flight/test-shots/night-multidrone.png' });

    // ===== 9. 炸机机身保持正立 + 云台乱甩（用户要求"一直正"） =====
    await ev(() => {
      window.gameState.isPreflight = false;
      window.gameState.takeoffMode = 'single';
      if (window.stopNightShow) window.stopNightShow();
    });
    await ev(() => { window.gameState.dronePos.set(0, 25, 0); window.gameState.droneVel.set(0, 0, 0); });
    await ev(() => window.emergencyStop());
    await page.waitForTimeout(200);
    let rollMax = 0, pitchMax = 0, gimMax = 0, bodyUpMin = 1;
    for (let i = 0; i < 8; i++) {
      const s = await ev(() => {
        const g = window.__flightDebug.droneGroup;
        const cam = window.__flightDebug.camera;
        const V3 = cam.position.constructor, Q = cam.quaternion.constructor;
        let gim = null, body = null;
        g.traverse(o => {
          if (!gim && o.name === 'mini5GimbalPivot') gim = o;
          if (!body && o.name === 'body') body = o;
        });
        let upY = 1;
        if (body) upY = new V3(0, 1, 0).applyQuaternion(body.getWorldQuaternion(new Q())).normalize().y;
        return {
          roll: Math.abs(window.gameState.droneRoll),
          pitch: Math.abs(window.gameState.dronePitch),
          gimx: gim ? Math.abs(gim.rotation.x) : 0,
          upY,
        };
      });
      rollMax = Math.max(rollMax, s.roll);
      pitchMax = Math.max(pitchMax, s.pitch);
      gimMax = Math.max(gimMax, s.gimx);
      bodyUpMin = Math.min(bodyUpMin, s.upY);
      await page.waitForTimeout(100);
    }
    check('炸机机身不倒挂（|roll| < 57°）', rollMax < 1.0, 'maxRoll=' + rollMax.toFixed(2) + 'rad');
    check('炸机机身不仰翻（|pitch| < 57°）', pitchMax < 1.0, 'maxPitch=' + pitchMax.toFixed(2) + 'rad');
    check('炸机机身始终朝天（upY > 0.7）', bodyUpMin > 0.7, 'minUpY=' + bodyUpMin.toFixed(2));
    check('炸机云台乱甩', gimMax > 0.3, 'maxGimbalX=' + gimMax.toFixed(2) + 'rad');

  } catch (err) {
    console.log('TEST-ERROR: ' + err.message);
    errors.push('[test] ' + err.message);
    try { await page.screenshot({ path: 'C:/Users/admin/git/edugames4children/flight/test-shots/error-state.png' }); } catch {}
  }

  // 恢复原地图选择 + 关闭
  await page.evaluate(m => { try { localStorage.setItem('flight-sim-map', m); } catch {} }, origMap);
  await browser.close();

  console.log('\n===== 结果汇总 =====');
  const fails = results.filter(r => !r.ok);
  results.forEach(r => { if (!r.ok) console.log('  FAIL: ' + r.name); });
  console.log('通过 ' + (results.length - fails.length) + '/' + results.length);
  console.log('\n===== 运行错误 (' + errors.length + ') =====');
  const uniq = [...new Set(errors)];
  uniq.forEach(e => console.log('  ' + e));
  if (fails.length > 0 || uniq.length > 0) process.exit(1);
  console.log('全部通过 ✔');
  process.exit(0);
}

main().catch(e => { console.error('FATAL', e); process.exit(2); });
