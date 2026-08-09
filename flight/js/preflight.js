// 起飞准备流程：选择起飞点 → 背包人部署 → 遥控器/飞机开机 → 连接 → 可以起飞
import * as THREE from 'three';
import { scene, camera, renderer } from './engine.js';
import { state } from './config.js';
import { getTerrainHeight } from './terrain.js';
import { updateHomeMarker, getHomeMarker } from './rth-path.js';
import { showNotif } from './ui.js';

// 阶段：placement(选点) → deploy(自动流程) → ready(等待空格) → done
let phase = 'idle';
let stepIdx = -1;
let stepTime = 0;

// 场景物件
let personGroup = null;   // 背包的人
let backpack = null;      // 深灰色大疆背包（初始背在人身上）
let bagLid = null;        // 背包盖
let rcGroup = null;       // 遥控器
let rcScreen = null;      // 遥控器屏幕
let rcButton = null;      // 遥控器电源键
let foldedDrone = null;   // 折叠的无人机（开机动画用）
let foldedGimbal = null;  // 演示机云台（Inspire 3：从上方装入机身）
let frontArms = [];       // 前机臂 pivot
let rearArms = [];        // 后机臂 pivot
let miniProps = [];       // 小无人机桨叶
let droneButton = null;   // 飞机电池电源键
let droneLeds = [];       // 机臂LED

// 拖动状态
let dragging = false;
let raycaster = new THREE.Raycaster();
let lastDragPoint = new THREE.Vector3();

// 行走动画
let walkPhase = 0;
let personLean = 0;       // 弯腰程度
let personLeanTarget = 0;

// 音效
let actx = null;
function ensureAudio() {
  if (!actx) {
    try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { actx = null; }
  }
}
function beep(freq, dur, delay = 0, vol = 0.15, type = 'sine') {
  if (!actx) return;
  try {
    const o = actx.createOscillator(), gn = actx.createGain();
    o.connect(gn); gn.connect(actx.destination);
    o.frequency.value = freq; o.type = type;
    const t = actx.currentTime + delay;
    gn.gain.setValueAtTime(vol, t);
    gn.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.start(t); o.stop(t + dur);
  } catch (e) { /* 音频不可用 */ }
}
function clickSound() { beep(2000, 0.05, 0, 0.1, 'square'); }
function diSound() { beep(1200, 0.35, 0, 0.2); }                       // 遥控器 滴!
function droneStartupSound() {                                          // 飞机 噔噔噔噔
  [523, 659, 784, 1046].forEach((f, i) => beep(f, 0.18, i * 0.18, 0.18, 'triangle'));
}

// ============ 模型构建 ============
function buildPerson() {
  const g = new THREE.Group();
  const skin = 0xddbb88;
  const shirtMat = new THREE.MeshLambertMaterial({ color: 0xff7733 });
  const pantsMat = new THREE.MeshLambertMaterial({ color: 0x2a3a5a });

  const body = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.48, 0.2), shirtMat);
  body.position.y = 1.0; body.name = 'torso'; g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 8), new THREE.MeshLambertMaterial({ color: skin }));
  head.position.y = 1.42; g.add(head);
  // 帽子
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.06, 10), new THREE.MeshLambertMaterial({ color: 0x333333 }));
  cap.position.y = 1.52; g.add(cap);

  const armGeo = new THREE.CylinderGeometry(0.045, 0.04, 0.42, 6);
  const la = new THREE.Mesh(armGeo, shirtMat); la.position.set(-0.25, 0.96, 0); la.name = 'leftArm'; g.add(la);
  const ra = new THREE.Mesh(armGeo, shirtMat); ra.position.set(0.25, 0.96, 0); ra.name = 'rightArm'; g.add(ra);

  const legGeo = new THREE.CylinderGeometry(0.055, 0.05, 0.52, 6);
  const ll = new THREE.Mesh(legGeo, pantsMat); ll.position.set(-0.1, 0.4, 0); ll.name = 'leftLeg'; g.add(ll);
  const rl = new THREE.Mesh(legGeo, pantsMat); rl.position.set(0.1, 0.4, 0); rl.name = 'rightLeg'; g.add(rl);

  const footGeo = new THREE.BoxGeometry(0.1, 0.06, 0.18);
  const footMat = new THREE.MeshLambertMaterial({ color: 0x222222 });
  const lf = new THREE.Mesh(footGeo, footMat); lf.position.set(-0.1, 0.1, 0.02); g.add(lf);
  const rf = new THREE.Mesh(footGeo, footMat); rf.position.set(0.1, 0.1, 0.02); g.add(rf);
  return g;
}

function buildBackpack() {
  const g = new THREE.Group();
  const darkGray = new THREE.MeshPhongMaterial({ color: 0x3a3a3a, shininess: 25 }); // 深灰色
  // 包主体
  const bagBody = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.75, 0.32), darkGray);
  bagBody.position.y = 0.375; g.add(bagBody);
  // 包盖（翻盖，pivot 在顶部后沿）
  const lidPivot = new THREE.Group();
  lidPivot.position.set(0, 0.75, -0.16);
  const lid = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.06, 0.34), new THREE.MeshPhongMaterial({ color: 0x2f2f2f, shininess: 30 }));
  lid.position.set(0, 0.03, 0.17);
  lidPivot.add(lid);
  g.add(lidPivot);
  bagLid = lidPivot;
  // 背带
  const strapMat = new THREE.MeshLambertMaterial({ color: 0x222222 });
  const s1 = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.6, 0.03), strapMat);
  s1.position.set(-0.15, 0.4, 0.18); g.add(s1);
  const s2 = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.6, 0.03), strapMat);
  s2.position.set(0.15, 0.4, 0.18); g.add(s2);
  // DJI 标志
  const c = document.createElement('canvas'); c.width = 128; c.height = 64;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#cccccc'; ctx.font = 'bold 40px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('DJI', 64, 34);
  const label = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.15), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true }));
  label.position.set(0, 0.5, -0.165); label.rotation.y = Math.PI; g.add(label);
  return g;
}

function buildRC() {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshPhongMaterial({ color: 0x4a4a4a, shininess: 40 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.1, 0.3), bodyMat);
  body.position.y = 0.05; g.add(body);
  // 屏幕（开机前黑，开机后亮）
  rcScreen = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.18),
    new THREE.MeshBasicMaterial({ color: 0x0a0a0a }));
  rcScreen.rotation.x = -Math.PI / 2; rcScreen.position.set(0, 0.101, -0.02); g.add(rcScreen);
  // 摇杆
  const stickMat = new THREE.MeshPhongMaterial({ color: 0x222222 });
  [-0.13, 0.13].forEach(x => {
    const st = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.02, 0.06, 8), stickMat);
    st.position.set(x, 0.13, 0.09); g.add(st);
    const cap2 = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 6), stickMat);
    cap2.position.set(x, 0.16, 0.09); g.add(cap2);
  });
  // 电源键（会发光）
  rcButton = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.02, 10),
    new THREE.MeshBasicMaterial({ color: 0x555555 }));
  rcButton.position.set(0, 0.11, 0.12); g.add(rcButton);
  // 天线
  [-0.15, 0.15].forEach(x => {
    const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.2, 6), stickMat);
    ant.position.set(x, 0.12, -0.16); ant.rotation.x = 0.6; g.add(ant);
  });
  return g;
}

// 折叠的小无人机（开机动画演示用，机臂可展开）
function buildFoldedDrone() {
  const g = new THREE.Group();
  frontArms = []; rearArms = []; miniProps = []; droneLeds = [];
  const silver = new THREE.MeshPhongMaterial({ color: 0xc0c0c0, shininess: 80 });
  const dark = new THREE.MeshPhongMaterial({ color: 0x2a2a2a });

  // 机身
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.2, 0.55), silver);
  body.position.y = 0.18; g.add(body);
  // 云台相机（Inspire 3：初始悬在上方待装入；其他机型直接装好）
  foldedGimbal = new THREE.Group();
  foldedGimbal.name = 'foldedGimbal';
  const cam2 = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.12, 0.12), new THREE.MeshPhongMaterial({ color: 0x111111 }));
  foldedGimbal.add(cam2);
  const lens = new THREE.Mesh(new THREE.CircleGeometry(0.04, 12), new THREE.MeshPhongMaterial({ color: 0x2244aa, shininess: 200 }));
  lens.position.set(0, 0, 0.065); foldedGimbal.add(lens);
  foldedGimbal.position.set(0, 0.12, 0.32);
  if (state.droneSpec && state.droneSpec.inspire3) {
    foldedGimbal.position.set(0, 0.62, 0.32); // 悬在机身上方，等待装入
  }
  g.add(foldedGimbal);
  // 电池（后部凸起）+ 电源键
  const bat = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.1, 0.2), dark);
  bat.position.set(0, 0.3, -0.15); g.add(bat);
  droneButton = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.02, 10),
    new THREE.MeshBasicMaterial({ color: 0x555555 }));
  droneButton.position.set(0, 0.36, -0.15); g.add(droneButton);

  // 机臂：pivot 在机身四角。前臂折叠时贴着机身指向后方，展开时旋转到斜前方（侧向旋转展开）
  //       后臂折叠时垂在下方，展开时从下往上旋转展开
  const armDefs = [
    { x: 0.3, z: 0.22, deployY: Math.PI / 4, front: true },     // 右前
    { x: -0.3, z: 0.22, deployY: -Math.PI / 4, front: true },   // 左前
    { x: 0.3, z: -0.22, deployY: 3 * Math.PI / 4, front: false },  // 右后
    { x: -0.3, z: -0.22, deployY: -3 * Math.PI / 4, front: false },// 左后
  ];
  armDefs.forEach((d, i) => {
    const pivot = new THREE.Group();
    pivot.position.set(d.x, 0.18, d.z);
    // 臂沿 pivot 本地 +Z 方向伸出
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.05, 0.5), dark);
    arm.position.set(0, 0, 0.25);
    pivot.add(arm);
    const motor = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.06, 8), new THREE.MeshPhongMaterial({ color: 0x333333 }));
    motor.position.set(0, 0.05, 0.5); pivot.add(motor);
    // 桨叶
    const propG = new THREE.Group(); propG.position.set(0, 0.09, 0.5);
    const bladeMat = new THREE.MeshPhongMaterial({ color: 0x444444, transparent: true, opacity: 0.8 });
    const b1 = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.01, 0.04), bladeMat); propG.add(b1);
    const b2 = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.01, 0.04), bladeMat); b2.rotation.y = Math.PI / 2; propG.add(b2);
    pivot.add(propG); miniProps.push(propG);
    // LED
    const led = new THREE.Mesh(new THREE.SphereGeometry(0.025, 6, 6),
      new THREE.MeshBasicMaterial({ color: 0x222222 }));
    led.position.set(0, -0.03, 0.5); pivot.add(led); droneLeds.push({ mesh: led, color: d.front ? 0x00ff00 : 0xff0000 });

    if (d.front) {
      // 前臂折叠：转向机身后方（贴着机身）
      pivot.rotation.y = d.deployY + (d.deployY > 0 ? 1 : -1) * 2.0;
      pivot.userData = { deployY: d.deployY, foldedY: pivot.rotation.y };
      // 无需展开机翼的机型（Neo 2 / Avata 360）：初始即展开，无折叠动画
      if (state.droneSpec && state.droneSpec.needsArmUnfold === false) {
        pivot.rotation.y = d.deployY;
        pivot.userData.foldedY = d.deployY;
      }
      frontArms.push(pivot);
    } else {
      // 后臂折叠：垂在下面（绕本地X轴下垂）
      pivot.rotation.y = d.deployY;
      pivot.rotation.x = 1.35;
      pivot.userData = { deployX: 0, foldedX: 1.35 };
      // 无需展开机翼的机型：后臂初始即水平
      if (state.droneSpec && state.droneSpec.needsArmUnfold === false) {
        pivot.rotation.x = 0;
        pivot.userData.foldedX = 0;
      }
      rearArms.push(pivot);
    }
    g.add(pivot);
  });
  return g;
}

// ============ UI ============
function hintEl() { return document.getElementById('preflightHint'); }
function linkEl() { return document.getElementById('linkPanel'); }

function setHint(html, show = true) {
  const el = hintEl();
  if (!el) return;
  el.innerHTML = html;
  el.style.display = show ? '' : 'none';
}

function setLinkPanel(mode) {
  const el = linkEl();
  if (!el) return;
  if (mode === 'hide') { el.style.display = 'none'; return; }
  el.style.display = '';
  const name = state.droneSpec.name;
  const droneSvg = `<svg width="72" height="48" viewBox="0 0 72 48"><g fill="#ddd"><circle cx="12" cy="10" r="7" fill="none" stroke="#aaa" stroke-width="2"/><circle cx="60" cy="10" r="7" fill="none" stroke="#aaa" stroke-width="2"/><circle cx="12" cy="38" r="7" fill="none" stroke="#aaa" stroke-width="2"/><circle cx="60" cy="38" r="7" fill="none" stroke="#aaa" stroke-width="2"/><line x1="12" y1="10" x2="30" y2="22" stroke="#888" stroke-width="3"/><line x1="60" y1="10" x2="42" y2="22" stroke="#888" stroke-width="3"/><line x1="12" y1="38" x2="30" y2="26" stroke="#888" stroke-width="3"/><line x1="60" y1="38" x2="42" y2="26" stroke="#888" stroke-width="3"/><rect x="28" y="17" width="16" height="14" rx="4" fill="#c0c0c0"/><circle cx="36" cy="31" r="3" fill="#2244aa"/></g></svg>`;
  if (mode === 'linking') {
    el.innerHTML = `<div class="link-drone">${droneSvg}</div><div class="link-info"><div class="link-name">DJI ${name}</div><div class="link-status"><span class="link-spinner"></span> 连接中...</div></div>`;
  } else if (mode === 'linked') {
    el.innerHTML = `<div class="link-drone">${droneSvg}</div><div class="link-info"><div class="link-name">DJI ${name}</div><div class="link-status ok">✅ 已连接</div></div>`;
  } else if (mode === 'ready') {
    el.innerHTML = `<div class="link-drone">${droneSvg}</div><div class="link-info"><div class="link-name">DJI ${name}</div><div class="link-status ok">✅ 可以起飞</div><div class="link-tip">按 空格键 起飞</div></div>`;
  }
}

function showFlightHUD() {
  ['topBar', 'leftPanel', 'rightPanel', 'bottomPanel', 'joystickLeft', 'joystickRight'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = '';
  });
}

// ============ 流程控制 ============
export function isPreflightActive() { return state.isPreflight; }
export function getPreflightPhase() { return phase; }

export function startPreflight() {
  state.isPreflight = true;
  phase = 'placement';
  stepIdx = -1; stepTime = 0;

  // 隐藏飞行HUD
  ['topBar', 'leftPanel', 'rightPanel', 'bottomPanel', 'joystickLeft', 'joystickRight'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });

  // 创建人 + 背包
  personGroup = buildPerson();
  personGroup.rotation.order = 'YXZ'; // 先转向再弯腰，保证向前弯腰
  backpack = buildBackpack();
  // 背包背在背上
  backpack.position.set(0, 0.65, -0.22);
  backpack.scale.setScalar(0.9);
  personGroup.add(backpack);

  const gy = getTerrainHeight(state.homePos.x, state.homePos.z);
  personGroup.position.set(state.homePos.x + 3, gy, state.homePos.z + 3);
  scene.add(personGroup);

  // 相机初始
  state.preflightCamPos.set(state.homePos.x, gy + 10, state.homePos.z + 14);
  state.preflightLookAt.set(state.homePos.x, gy, state.homePos.z);

  setHint('🖱️ 按住鼠标拖动，移动起飞点（H标记） · 按 <b>回车</b> 放下背包开始部署');

  window.addEventListener('keydown', onPreflightKey);
}

function onPreflightKey(e) {
  if (e.key === 'Enter' && phase === 'placement') {
    ensureAudio();
    phase = 'deploy';
    stepIdx = -1; stepTime = 0;
    dragging = false;
    setHint('', false);
    // 特写镜头时缩小H标记，避免挡住部署画面
    const marker = getHomeMarker();
    if (marker) marker.scale.setScalar(0.3);
  } else if (e.key === ' ' && phase === 'ready') {
    // 起飞由 physics.js isLanded 分支处理，这里只收尾UI
    phase = 'done';
    setLinkPanel('hide');
    const marker = getHomeMarker();
    if (marker) marker.scale.setScalar(1);
    window.removeEventListener('keydown', onPreflightKey);
  }
}

// ============ 鼠标拖动选点 ============
function ndcFromEvent(event) {
  const rect = renderer.domElement.getBoundingClientRect();
  return new THREE.Vector2(
    ((event.clientX - rect.left) / rect.width) * 2 - 1,
    -((event.clientY - rect.top) / rect.height) * 2 + 1
  );
}
function groundIntersect(event) {
  raycaster.setFromCamera(ndcFromEvent(event), camera);
  const gy = getTerrainHeight(state.homePos.x, state.homePos.z);
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -gy);
  const pt = new THREE.Vector3();
  raycaster.ray.intersectPlane(plane, pt);
  return (pt && Number.isFinite(pt.x)) ? pt : null;
}

export function preflightPointerDown(event) {
  if (phase !== 'placement') return;
  const pt = groundIntersect(event);
  if (pt) { dragging = true; lastDragPoint.copy(pt); }
}
export function preflightPointerMove(event) {
  if (phase !== 'placement' || !dragging) return;
  const pt = groundIntersect(event);
  if (!pt) return;
  // 鼠标拖多少，起飞点走多少
  state.homePos.x += pt.x - lastDragPoint.x;
  state.homePos.z += pt.z - lastDragPoint.z;
  lastDragPoint.copy(pt);
  updateHomeMarker();
}
export function preflightPointerUp() {
  if (dragging) { dragging = false; showNotif('✅ 起飞点已更新'); }
}

// ============ 部署步骤（时间轴） ============
// 每步：dur 秒；start() 开始时调用一次；update(k) k=0..1 每帧调用
const steps = [
  { // 0 放下背包
    dur: 1.2,
    start() { showNotif('🎒 放下背包...'); personLeanTarget = 0.32; },
    update(k) {
      if (!backpack.parent) return;
      if (k > 0.5 && backpack.parent === personGroup) {
        // 从背上取下，放到人面前的地上（世界坐标）
        scene.attach(backpack);
        const dir = new THREE.Vector3(Math.sin(personGroup.rotation.y), 0, Math.cos(personGroup.rotation.y));
        const gp = personGroup.position.clone().add(dir.multiplyScalar(0.9));
        backpack.userData.target = new THREE.Vector3(gp.x, getTerrainHeight(gp.x, gp.z), gp.z);
      }
      if (backpack.userData.target) {
        backpack.position.lerp(backpack.userData.target, 0.15);
        backpack.rotation.x += (0 - backpack.rotation.x) * 0.15;
        backpack.rotation.z += (0 - backpack.rotation.z) * 0.15;
        backpack.rotation.y = personGroup.rotation.y + Math.PI;
      }
    },
  },
  { // 1 打开背包盖
    dur: 0.9,
    start() { showNotif('📂 打开背包'); personLeanTarget = 0.3; },
    update(k) { if (bagLid) bagLid.rotation.x = -2.0 * k; },
  },
  { // 2 取出遥控器和飞机
    dur: 1.2,
    start() {
      showNotif('📦 取出遥控器和飞行器');
      // 遥控器和折叠飞机从包里出现
      rcGroup = buildRC();
      foldedDrone = buildFoldedDrone();
      rcGroup.position.copy(backpack.position).add(new THREE.Vector3(0, 0.5, 0));
      foldedDrone.position.copy(backpack.position).add(new THREE.Vector3(0, 0.6, 0));
      scene.add(rcGroup); scene.add(foldedDrone);
      // 目标位置：飞机放在H标记中心，遥控器放在旁边
      const gy = getTerrainHeight(state.homePos.x, state.homePos.z);
      foldedDrone.userData.target = new THREE.Vector3(state.homePos.x, gy, state.homePos.z);
      const side = new THREE.Vector3(state.homePos.x + 1.1, 0, state.homePos.z + 0.8);
      rcGroup.userData.target = new THREE.Vector3(side.x, getTerrainHeight(side.x, side.z), side.z);
    },
    update(k) {
      rcGroup.position.lerp(rcGroup.userData.target, 0.12);
      foldedDrone.position.lerp(foldedDrone.userData.target, 0.12);
      foldedDrone.rotation.y = personGroup.rotation.y + Math.PI;
      if (k > 0.8) personLeanTarget = 0.22;
    },
  },
  { // 3 遥控器：短按
    dur: 0.5,
    start() { showNotif('🎮 遥控器开机：短按一下'); clickSound(); rcButton.material.color.setHex(0xffffff); },
    update(k) { if (k > 0.5) rcButton.material.color.setHex(0x555555); },
  },
  { dur: 0.4, start() {}, update() {} }, // 4 停顿
  { // 5 遥控器：长按2秒 → 滴!
    dur: 2.0,
    start() { showNotif('🎮 再长按约2秒...'); rcButton.material.color.setHex(0x00ff88); },
    update(k) {
      const blink = Math.sin(k * 25) > 0;
      rcButton.material.color.setHex(blink ? 0x00ff88 : 0x226644);
      if (k >= 1) {
        diSound();
        rcButton.material.color.setHex(0x00ff88);
        rcScreen.material.color.setHex(0x1a6adf); // 屏幕点亮
        showNotif('🔊 滴！遥控器已开机');
      }
    },
  },
  { // 6 前机臂往侧向旋转展开
    dur: state.droneSpec.needsArmUnfold === false ? 0.05 : 1.0,
    start() { if (state.droneSpec.needsArmUnfold !== false) { showNotif('🚁 展开前机臂（侧向旋转）'); personLeanTarget = 0.28; } },
    update(k) {
      frontArms.forEach(p => {
        p.rotation.y = p.userData.foldedY + (p.userData.deployY - p.userData.foldedY) * easeOut(k);
      });
    },
  },
  { // 7 后机臂从下旋转展开
    dur: state.droneSpec.needsArmUnfold === false ? 0.05 : 1.0,
    start() { if (state.droneSpec.needsArmUnfold !== false) { showNotif('🚁 展开后机臂（从下旋转）'); } },
    update(k) {
      rearArms.forEach(p => {
        p.rotation.x = p.userData.foldedX + (p.userData.deployX - p.userData.foldedX) * easeOut(k);
      });
    },
  },
  { // 7b Inspire 3：装上云台（云台从上方装入前下方云台位）
    dur: state.droneSpec && state.droneSpec.inspire3 ? 1.2 : 0.05,
    start() { if (state.droneSpec && state.droneSpec.inspire3) showNotif('📷 装上云台（X9 全画幅云台）'); },
    update(k) {
      if (!foldedGimbal) return;
      if (state.droneSpec && state.droneSpec.inspire3) {
        const t = easeOut(k);
        foldedGimbal.position.y = 0.62 + (0.12 - 0.62) * t;   // 下移到位
        foldedGimbal.rotation.x = 0.0;                         // 保持水平
      }
    },
  },
  { // 8 飞机电池：短按
    dur: 0.5,
    start() { showNotif('🔋 飞行器开机：短按一下'); clickSound(); droneButton.material.color.setHex(0xffffff); },
    update(k) { if (k > 0.5) droneButton.material.color.setHex(0x555555); },
  },
  { dur: 0.4, start() {}, update() {} }, // 9 停顿
  { // 10 飞机电池：长按2秒 → 噔噔噔噔 + 桨叶动
    dur: 2.0,
    start() { showNotif('🔋 再长按约2秒...'); droneButton.material.color.setHex(0x00ff88); },
    update(k) {
      const blink = Math.sin(k * 25) > 0;
      droneButton.material.color.setHex(blink ? 0x00ff88 : 0x226644);
      if (k >= 1) {
        droneStartupSound();
        droneLeds.forEach(l => l.mesh.material.color.setHex(l.color)); // LED亮
        showNotif('🎵 噔噔噔噔！飞行器已开机');
      }
    },
  },
  { // 11 桨叶抖动
    dur: 1.5,
    start() { personLeanTarget = 0; },
    update(k) {
      // 桨叶快速抖一下再停
      const spin = k < 0.5 ? (0.5 - k) * 60 : 0;
      miniProps.forEach((p, i) => { p.rotation.y += spin * 0.016 * (i % 2 === 0 ? 1 : -1); });
    },
  },
  { // 12 遥控器出现飞行界面 → 切换HUD + 连接动画
    dur: 2.2,
    start() {
      showNotif('📱 遥控器进入飞行界面');
      showFlightHUD();
      setLinkPanel('linking');
    },
    update() {},
  },
  { // 13 打勾：已连接
    dur: 1.2,
    start() { setLinkPanel('linked'); beep(1500, 0.15, 0, 0.15); beep(2000, 0.2, 0.15, 0.15); },
    update() {},
  },
];

function easeOut(k) { return 1 - Math.pow(1 - k, 3); }

function finishDeploy() {
  phase = 'ready';
  setLinkPanel('ready');
  showNotif('✅ 可以起飞！按空格键起飞', 6);

  // 撤掉演示用折叠飞机，把真机放到起飞点地面
  if (foldedDrone) { scene.remove(foldedDrone); foldedDrone = null; }
  foldedGimbal = null;
  const gy = getTerrainHeight(state.homePos.x, state.homePos.z);
  state.dronePos.set(state.homePos.x, gy + 0.6, state.homePos.z);
  state.droneVel.set(0, 0, 0);
  state.droneYaw = personGroup ? personGroup.rotation.y + Math.PI : 0;
  state.dronePitch = 0; state.droneRoll = 0;
  state.isLanded = true;     // 空格 → physics.js 处理起飞
  state.isPreflight = false; // 恢复正常物理和相机
}

// ============ 每帧更新 ============
export function updatePreflight(dt) {
  if (!state.isPreflight) return;
  const gy = getTerrainHeight(state.homePos.x, state.homePos.z);

  if (phase === 'placement') {
    // 人背着包走向起飞点旁
    const target = new THREE.Vector3(state.homePos.x + 1.6, 0, state.homePos.z + 1.6);
    walkPersonTo(target, dt, 2.2);
    // 相机跟随起飞点（拖动中冻结相机，避免相机移动抵消拖动位移）
    if (!dragging) {
      state.preflightCamPos.set(state.homePos.x, gy + 10, state.homePos.z + 14);
      state.preflightLookAt.set(state.homePos.x, gy + 1, state.homePos.z);
    }
  } else if (phase === 'deploy') {
    // 时间轴步骤
    if (stepIdx < 0) {
      // 先走到起飞点旁
      const target = new THREE.Vector3(state.homePos.x + 1.6, 0, state.homePos.z + 1.6);
      if (walkPersonTo(target, dt, 2.6)) {
        // 面向起飞点
        personGroup.rotation.y = Math.atan2(state.homePos.x - personGroup.position.x, state.homePos.z - personGroup.position.z);
        stepIdx = 0; stepTime = 0;
        steps[0].start();
      }
    } else {
      const step = steps[stepIdx];
      stepTime += dt;
      const k = Math.min(stepTime / step.dur, 1);
      step.update(k);
      if (stepTime >= step.dur) {
        stepIdx++;
        stepTime = 0;
        if (stepIdx >= steps.length) { finishDeploy(); return; }
        steps[stepIdx].start();
      }
    }
    // 弯腰动画
    personLean += (personLeanTarget - personLean) * Math.min(dt * 6, 1);
    if (personGroup) personGroup.rotation.x = personLean;
    // 相机拉近看部署
    state.preflightCamPos.set(state.homePos.x + 3.5, gy + 2.6, state.homePos.z + 5);
    state.preflightLookAt.set(state.homePos.x, gy + 0.6, state.homePos.z);
  }
}

// 人走向目标点，返回是否已到达
function walkPersonTo(target, dt, speed) {
  if (!personGroup) return true;
  const dx = target.x - personGroup.position.x;
  const dz = target.z - personGroup.position.z;
  const dist = Math.sqrt(dx * dx + dz * dz);
  if (dist < 0.15) {
    animateLimbs(0);
    return true;
  }
  const step = Math.min(speed * dt, dist);
  personGroup.position.x += (dx / dist) * step;
  personGroup.position.z += (dz / dist) * step;
  personGroup.position.y = getTerrainHeight(personGroup.position.x, personGroup.position.z);
  personGroup.rotation.y = Math.atan2(dx, dz);
  walkPhase += 9 * dt;
  animateLimbs(Math.sin(walkPhase));
  return false;
}

function animateLimbs(swing) {
  if (!personGroup) return;
  const la = personGroup.getObjectByName('leftArm');
  const ra = personGroup.getObjectByName('rightArm');
  const ll = personGroup.getObjectByName('leftLeg');
  const rl = personGroup.getObjectByName('rightLeg');
  if (la) la.rotation.x = swing * 0.5;
  if (ra) ra.rotation.x = -swing * 0.5;
  if (ll) ll.rotation.x = swing * 0.45;
  if (rl) rl.rotation.x = -swing * 0.45;
}

// 测试钩子
window.preflightDebug = {
  getPhase: () => phase,
  getStep: () => stepIdx,
  pressEnter: () => onPreflightKey({ key: 'Enter' }),
};
