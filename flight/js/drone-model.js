// Drone 3D model: realistic DJI quadcopter with detailed per-model features
import * as THREE from 'three';
import { scene } from './engine.js';
import { DRONES, state } from './config.js';

export let droneGroup = null;
export let propellers = [];
export let propBlurs = []; // Blur disks for high speed

// Interactive state (exported for game.js)
export let lidOpen = false;        // Air 3 top lid
export let moduleBayOpen = false;  // Mavic 3 Pro bottom bay
export let fourGInserted = false;  // Air 3 4G module inserted
export let lidAnimating = false;
export let bayAnimating = false;
export let zoomLevel = 0;         // Mini 4 Pro zoom (0=1x, 1=2x, 2=4x)

// References for animation
let lidMesh = null;
let bayMesh = null;
let fourGGroup = null;
let fourGSlotMesh = null;
let irLedMesh = null;
let auxLightMesh = null;
let auxLight = null;
let lensZoomMesh = null;
let avataGimbal = null;       // Avata 360 双镜头云台（起飞后竖直）
let miniGimbalPivot = null;   // Mini 4 Pro 镜头云台转轴（随 gimbalPitch 物理俯仰）

// 激光雷达红点格（Air 3S 前屏 / Mavic 4 Pro 右前机臂）扫闪动画
let lidarCells = [];
// Neo 2 左前显示屏 canvas 纹理
let neo2DisplayTex = null;
let neo2DisplayMode = 0;
const NEO2_MODES = ['渐远', '冲天', '环绕', '自由'];

export function createDroneModel(droneIdx) {
  if (droneGroup) {
    scene.remove(droneGroup);
    droneGroup.traverse(c => {
      if (c.geometry) c.geometry.dispose();
      if (c.material) { if (Array.isArray(c.material)) c.material.forEach(m => m.dispose()); else c.material.dispose(); }
    });
  }
  const spec = DRONES[droneIdx];
  const g = new THREE.Group();
  propellers = [];
  propBlurs = [];

  // Reset interactive state
  lidOpen = false; moduleBayOpen = false; fourGInserted = false;
  lidAnimating = false; bayAnimating = false; zoomLevel = 0;
  lidMesh = null; bayMesh = null; fourGGroup = null; fourGSlotMesh = null;
  irLedMesh = null; auxLightMesh = null; auxLight = null; lensZoomMesh = null;
  avataGimbal = null; miniGimbalPivot = null;
  lidarCells = [];
  if (neo2DisplayTex) { neo2DisplayTex.dispose(); neo2DisplayTex = null; }
  neo2DisplayMode = 0;

  // Dispatch to per-drone builder（按 model 键分发）
  switch (spec.model) {
    case 'air3': buildAir3(g, spec); break;
    case 'air3s': buildAir3S(g, spec); break;
    case 'mavic3pro': buildMavic3Pro(g, spec); break;
    case 'mavic4pro': buildMavic4Pro(g, spec); break;
    case 'mini4pro': buildMini4Pro(g, spec); break;
    case 'neo2': buildNeo2(g, spec); break;
    case 'avata360': buildAvata360(g, spec); break;
    default: buildAir3(g, spec);
  }

  g.position.copy(state.dronePos);
  scene.add(g); droneGroup = g;
}

// ============================================================
// DJI Air 3 — 银灰色 + 双摄 + 可开合盖子 + 4G模块 + 红外闪烁 + 补光灯
// ============================================================
function buildAir3(g, spec) {
  const silver = 0xc0c0c0;  // 银灰色
  const darkGray = 0x2a2a2a;
  const bodyDark = 0x1a1a1a;

  // === 机身：长方形，银灰色 ===
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(1.4, 0.35, 1.1),
    new THREE.MeshPhongMaterial({ color: silver, shininess: 80 })
  );
  body.name = 'body'; g.add(body);

  // === 底部条纹 ===
  const stripeMat = new THREE.MeshPhongMaterial({ color: 0x888888 });
  for (let i = -3; i <= 3; i++) {
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.01, 0.03), stripeMat);
    stripe.position.set(0, -0.18, i * 0.12); stripe.name = 'stripe'; g.add(stripe);
  }

  // === 顶部盖子（可开合） ===
  // 盖子pivot点在前边缘，所以用Group定位
  const lidPivot = new THREE.Group();
  lidPivot.position.set(0, 0.175, -0.35); // 前边缘位置
  lidPivot.name = 'lidPivot';
  const lid = new THREE.Mesh(
    new THREE.BoxGeometry(0.9, 0.08, 0.7),
    new THREE.MeshPhongMaterial({ color: silver, shininess: 90 })
  );
  lid.position.set(0, 0.04, 0.35); // 相对pivot偏移
  lid.name = 'lid';
  lid.userData.isLid = true;
  lidPivot.add(lid);
  g.add(lidPivot);
  lidMesh = lidPivot;

  // 盖子内4G插槽
  const slot = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 0.04, 0.4),
    new THREE.MeshPhongMaterial({ color: 0x333333 })
  );
  slot.position.set(0, 0.0, 0.35); slot.name = 'fourGSlot';
  slot.userData.is4GSlot = true;
  lidPivot.add(slot);
  fourGSlotMesh = slot;

  // === 4G模块（盖子打开时出现） ===
  const fourG = new THREE.Group();
  fourG.name = 'fourGModule';
  fourG.userData.is4G = true;
  fourG.visible = false; // 盖子关闭时隐藏

  // 4G模块主体
  const fourGBody = new THREE.Mesh(
    new THREE.BoxGeometry(0.45, 0.06, 0.35),
    new THREE.MeshPhongMaterial({ color: 0x444444, shininess: 60 })
  );
  fourGBody.name = 'fourGBody'; fourG.add(fourGBody);

  // 4G模块绑带
  const strapMat = new THREE.MeshPhongMaterial({ color: 0x222222 });
  const strap1 = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.02, 0.04), strapMat);
  strap1.position.set(0, 0.04, 0.08); strap1.name = 'strap'; fourG.add(strap1);
  const strap2 = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.02, 0.04), strapMat);
  strap2.position.set(0, 0.04, -0.08); strap2.name = 'strap'; fourG.add(strap2);

  // 4G模块初始位置（盖子旁边）
  fourG.position.set(0.8, 0.2, 0);
  g.add(fourG);
  fourGGroup = fourG;

  // === DJI标志（顶部盖子上） ===
  const djiCanvas = document.createElement('canvas');
  djiCanvas.width = 256; djiCanvas.height = 128;
  const ctx = djiCanvas.getContext('2d');
  ctx.clearRect(0, 0, 256, 128);
  ctx.fillStyle = '#1a1a1a';
  ctx.font = 'bold 88px Arial, sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('DJI', 128, 70);
  const djiTex = new THREE.CanvasTexture(djiCanvas);
  const djiLabel = new THREE.Mesh(
    new THREE.PlaneGeometry(0.7, 0.35),
    new THREE.MeshBasicMaterial({ map: djiTex, transparent: true })
  );
  djiLabel.rotation.x = -Math.PI / 2;
  djiLabel.position.set(0, 0.09, 0.35); djiLabel.name = 'djiLabel';
  lidPivot.add(djiLabel);

  // === 双摄镜头（2个圆圈） ===
  const lensMat = new THREE.MeshPhongMaterial({ color: 0x111111, shininess: 200, specular: 0x444444 });
  const lensGlassMat = new THREE.MeshPhongMaterial({ color: 0x2244aa, shininess: 250, specular: 0xffffff });

  // 左镜头
  const lensL = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.12, 16), lensMat);
  lensL.rotation.x = Math.PI / 2; lensL.position.set(-0.18, -0.2, 0.5); lensL.name = 'lens_L'; g.add(lensL);
  const lensGlassL = new THREE.Mesh(new THREE.CircleGeometry(0.08, 16), lensGlassMat);
  lensGlassL.position.set(-0.18, -0.2, 0.57); lensGlassL.name = 'lensGlass_L'; g.add(lensGlassL);

  // 右镜头
  const lensR = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.12, 16), lensMat);
  lensR.rotation.x = Math.PI / 2; lensR.position.set(0.18, -0.2, 0.5); lensR.name = 'lens_R'; g.add(lensR);
  const lensGlassR = new THREE.Mesh(new THREE.CircleGeometry(0.08, 16), lensGlassMat);
  lensGlassR.position.set(0.18, -0.2, 0.57); lensGlassR.name = 'lensGlass_R'; g.add(lensGlassR);

  // 云台连接
  const gimbal = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.08, 0.15), new THREE.MeshPhongMaterial({ color: 0x111111 }));
  gimbal.position.set(0, -0.16, 0.45); gimbal.name = 'gimbal'; g.add(gimbal);

  // === 视觉传感器（2个，在边边，黑色） ===
  const vsMat = new THREE.MeshPhongMaterial({ color: 0x050505, shininess: 10 });
  const vsL = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.04, 0.12), vsMat);
  vsL.position.set(-0.7, -0.1, 0.3); vsL.name = 'visionSensor_L'; g.add(vsL);
  const vsR = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.04, 0.12), vsMat);
  vsR.position.set(0.7, -0.1, 0.3); vsR.name = 'visionSensor_R'; g.add(vsR);

  // === 红外传感器（扁椭圆形，中间分隔线） ===
  const irSensor = new THREE.Mesh(
    new THREE.SphereGeometry(0.1, 12, 6),
    new THREE.MeshPhongMaterial({ color: 0x1a1a1a, shininess: 30 })
  );
  irSensor.scale.set(1.5, 0.3, 1);
  irSensor.position.set(0, -0.18, -0.4); irSensor.name = 'irSensor'; g.add(irSensor);

  // 红外中间分隔线
  const irDivider = new THREE.Mesh(
    new THREE.BoxGeometry(0.01, 0.06, 0.2),
    new THREE.MeshPhongMaterial({ color: 0x333333 })
  );
  irDivider.position.set(0, -0.18, -0.4); irDivider.name = 'irDivider'; g.add(irDivider);

  // 红外LED（底部闪红光）
  const irLed = new THREE.Mesh(
    new THREE.SphereGeometry(0.04, 6, 6),
    new THREE.MeshBasicMaterial({ color: 0xff0000, transparent: true, opacity: 1 })
  );
  irLed.position.set(0, -0.22, -0.4); irLed.name = 'irLed'; g.add(irLed);
  irLedMesh = irLed;

  // === 补光灯（底部，像扫描仪照出一大圈光） ===
  const auxLightRing = new THREE.Mesh(
    new THREE.RingGeometry(0.3, 0.5, 32),
    new THREE.MeshBasicMaterial({ color: 0xffffcc, transparent: true, opacity: 0.15, side: THREE.DoubleSide })
  );
  auxLightRing.rotation.x = Math.PI / 2;
  auxLightRing.position.set(0, -0.5, 0.2); auxLightRing.name = 'auxLightRing'; g.add(auxLightRing);
  auxLightMesh = auxLightRing;

  // 补光灯SpotLight
  const spotL = new THREE.SpotLight(0xffffcc, 2, 8, Math.PI / 4, 0.5, 2);
  spotL.position.set(0, -0.2, 0.2);
  spotL.target.position.set(0, -3, 0.2);
  g.add(spotL); g.add(spotL.target);
  auxLight = spotL;

  // === 机臂 + 电机 + 螺旋桨（无桨叶保护罩） ===
  const armPos = [
    { x: 1.2, z: 1.2, a: Math.PI / 4 },
    { x: -1.2, z: 1.2, a: 3 * Math.PI / 4 },
    { x: 1.2, z: -1.2, a: -Math.PI / 4 },
    { x: -1.2, z: -1.2, a: -3 * Math.PI / 4 },
  ];
  armPos.forEach((ap, idx) => {
    // 长方形机臂：宽而扁的矩形截面
    const arm = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.06, 0.22), new THREE.MeshPhongMaterial({ color: darkGray }));
    arm.position.set(ap.x * 0.5, 0, ap.z * 0.5); arm.rotation.y = ap.a; arm.name = 'arm_' + idx; g.add(arm);
    const motor = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.18, 0.2, 8), new THREE.MeshPhongMaterial({ color: 0x333333 }));
    motor.position.set(ap.x, 0.1, ap.z); motor.name = 'motor_' + idx; g.add(motor);
    const propGroup = new THREE.Group(); propGroup.position.set(ap.x, 0.25, ap.z);
    const blade1 = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.02, 0.15), new THREE.MeshPhongMaterial({ color: 0x444444, transparent: true, opacity: 0.7 }));
    propGroup.add(blade1);
    const blade2 = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.02, 0.15), new THREE.MeshPhongMaterial({ color: 0x444444, transparent: true, opacity: 0.7 }));
    blade2.rotation.y = Math.PI / 2; propGroup.add(blade2);
    g.add(propGroup); propellers.push(propGroup);
    const blurDisk = new THREE.Mesh(
      new THREE.CircleGeometry(1.1, 32),
      new THREE.MeshBasicMaterial({ color: 0x666666, transparent: true, opacity: 0, side: THREE.DoubleSide })
    );
    blurDisk.rotation.x = -Math.PI / 2; blurDisk.position.set(ap.x, 0.26, ap.z); blurDisk.name = 'blurDisk_' + idx;
    g.add(blurDisk); propBlurs.push(blurDisk);
    const ledColor = idx < 2 ? 0x00ff00 : 0xff0000;
    const led = new THREE.Mesh(new THREE.SphereGeometry(0.05, 4, 4), new THREE.MeshBasicMaterial({ color: ledColor }));
    led.position.set(ap.x, -0.1, ap.z); led.name = 'led_' + idx; g.add(led);
  });

  // === 起落架 ===
  const legMat = new THREE.MeshPhongMaterial({ color: 0x333333 });
  [[-0.4, 0, 0.3], [0.4, 0, 0.3], [-0.4, 0, -0.3], [0.4, 0, -0.3]].forEach(p => {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.4, 4), legMat);
    leg.position.set(p[0], -0.35, p[2]); g.add(leg);
  });
  const skid1 = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.04, 0.06), legMat);
  skid1.position.set(0, -0.55, 0.3); g.add(skid1);
  const skid2 = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.04, 0.06), legMat);
  skid2.position.set(0, -0.55, -0.3); g.add(skid2);
}

// ============================================================
// DJI Air 3S — 同 Air 3 正面 + 前方黑色激光雷达屏（红点扫闪）
// ============================================================
function addLidarPanel(g, opts) {
  const { pos, panelSize, cellW, cellH, count, startX, gap, cellZ } = opts;
  const panel = new THREE.Mesh(
    new THREE.BoxGeometry(panelSize[0], panelSize[1], panelSize[2]),
    new THREE.MeshBasicMaterial({ color: 0x000000 })
  );
  panel.position.set(pos[0], pos[1], pos[2]);
  panel.name = 'lidarScreen';
  g.add(panel);
  for (let i = 0; i < count; i++) {
    const cell = new THREE.Mesh(
      new THREE.PlaneGeometry(cellW, cellH),
      new THREE.MeshBasicMaterial({ color: 0xff2200, transparent: true, opacity: 0.15 })
    );
    cell.position.set(startX + i * gap, pos[1], cellZ);
    cell.name = 'lidarCell_' + i;
    g.add(cell);
    lidarCells.push(cell);
  }
}

function buildAir3S(g, spec) {
  buildAir3(g, spec);
  // 前方黑色激光雷达屏：8 个红色小格排成一条灯带（扫闪 → 看似连续亮带）
  addLidarPanel(g, {
    pos: [0, 0.03, 0.56], panelSize: [0.95, 0.12, 0.02],
    cellW: 0.09, cellH: 0.07, count: 8, startX: -0.42, gap: 0.12, cellZ: 0.575,
  });
}

// ============================================================
// DJI Mavic 3 Pro — 深灰色 + 三摄+人字形哈苏 + 可动光圈 + 底部模块仓
// ============================================================
function buildMavic3Pro(g, spec, bodyColor = 0x3a3a3a) {
  const darkGray = bodyColor;  // 深灰色
  const bodyDark = 0x1a1a1a;

  // === 机身：深灰色长方形 ===
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(1.4, 0.35, 1.1),
    new THREE.MeshPhongMaterial({ color: darkGray, shininess: 80 })
  );
  body.name = 'body'; g.add(body);

  // === 顶部壳 ===
  const shell = new THREE.Mesh(
    new THREE.BoxGeometry(1.2, 0.1, 0.9),
    new THREE.MeshPhongMaterial({ color: darkGray, shininess: 90 })
  );
  shell.position.y = 0.22; shell.name = 'shell'; g.add(shell);

  // === 三摄镜头 + 人字形哈苏标志 ===
  // 镜头底座（长方形，在前方底部）
  const lensBase = new THREE.Mesh(
    new THREE.BoxGeometry(0.6, 0.15, 0.2),
    new THREE.MeshPhongMaterial({ color: 0x111111, shininess: 100 })
  );
  lensBase.position.set(0, -0.2, 0.5); lensBase.name = 'lensBase'; g.add(lensBase);

  // 人字形（Λ形哈苏标志）- 2条斜线
  const hasselbladMat = new THREE.MeshPhongMaterial({ color: 0xccaa00, shininess: 150 }); // 金色哈苏标志
  // 左斜线
  const hLine1 = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.02, 0.35), hasselbladMat);
  hLine1.position.set(-0.12, -0.12, 0.35); hLine1.rotation.x = -0.4; hLine1.name = 'hasselblad_L'; g.add(hLine1);
  // 右斜线
  const hLine2 = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.02, 0.35), hasselbladMat);
  hLine2.position.set(0.12, -0.12, 0.35); hLine2.rotation.x = 0.4; hLine2.name = 'hasselblad_R'; g.add(hLine2);

  // 3个镜头圆圈（在人字形洞里面）
  const lensMat = new THREE.MeshPhongMaterial({ color: 0x111111, shininess: 200, specular: 0x444444 });
  const lensGlassMat = new THREE.MeshPhongMaterial({ color: 0x2244aa, shininess: 250, specular: 0xffffff });
  const apertureMat = new THREE.MeshPhongMaterial({ color: 0x222222, shininess: 100 });

  const lensPositions = [
    { x: -0.2, name: 'lens_L' },   // 左镜头
    { x: 0, name: 'lens_C' },       // 中镜头（主摄，最大）
    { x: 0.2, name: 'lens_R' },     // 右镜头
  ];

  lensPositions.forEach((lp, i) => {
    const r = i === 1 ? 0.12 : 0.09; // 主摄更大
    // 镜头外圈
    const lens = new THREE.Mesh(new THREE.CylinderGeometry(r, r + 0.02, 0.12, 16), lensMat);
    lens.rotation.x = Math.PI / 2; lens.position.set(lp.x, -0.2, 0.58); lens.name = lp.name; g.add(lens);
    // 镜头玻璃
    const glass = new THREE.Mesh(new THREE.CircleGeometry(r * 0.8, 16), lensGlassMat);
    glass.position.set(lp.x, -0.2, 0.65); glass.name = lp.name + 'Glass'; g.add(glass);
    // 可动光圈环
    const aperture = new THREE.Mesh(
      new THREE.TorusGeometry(r * 0.6, 0.015, 8, 24),
      apertureMat
    );
    aperture.position.set(lp.x, -0.2, 0.64); aperture.name = lp.name + 'Aperture'; g.add(aperture);
  });

  // 云台连接
  const gimbal = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.08, 0.15), new THREE.MeshPhongMaterial({ color: 0x111111 }));
  gimbal.position.set(0, -0.16, 0.45); gimbal.name = 'gimbal'; g.add(gimbal);

  // === 底部模块仓（可开合盖子） ===
  const bayPivot = new THREE.Group();
  bayPivot.position.set(0, -0.175, 0.35); // 前边缘
  bayPivot.name = 'bayPivot';
  const bay = new THREE.Mesh(
    new THREE.BoxGeometry(0.7, 0.06, 0.5),
    new THREE.MeshPhongMaterial({ color: darkGray, shininess: 80 })
  );
  bay.position.set(0, -0.03, -0.25);
  bay.name = 'bayLid';
  bay.userData.isModuleBay = true;
  bayPivot.add(bay);
  g.add(bayPivot);
  bayMesh = bayPivot;

  // 模块仓内部模块
  const moduleInside = new THREE.Mesh(
    new THREE.BoxGeometry(0.4, 0.03, 0.3),
    new THREE.MeshPhongMaterial({ color: 0x444444 })
  );
  moduleInside.position.set(0, -0.01, -0.25); moduleInside.name = 'bayModule'; g.add(moduleInside);

  // === DJI标志 ===
  const djiCanvas = document.createElement('canvas');
  djiCanvas.width = 256; djiCanvas.height = 128;
  const ctx = djiCanvas.getContext('2d');
  ctx.clearRect(0, 0, 256, 128);
  ctx.fillStyle = '#888888';
  ctx.font = 'bold 88px Arial, sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('DJI', 128, 70);
  const djiTex = new THREE.CanvasTexture(djiCanvas);
  const djiLabel = new THREE.Mesh(
    new THREE.PlaneGeometry(0.7, 0.35),
    new THREE.MeshBasicMaterial({ map: djiTex, transparent: true })
  );
  djiLabel.rotation.x = -Math.PI / 2;
  djiLabel.position.set(0, 0.28, 0); djiLabel.name = 'djiLabel'; g.add(djiLabel);

  // === 机臂 + 电机 + 螺旋桨（无桨叶保护罩） ===
  const armPos = [
    { x: 1.2, z: 1.2, a: Math.PI / 4 },
    { x: -1.2, z: 1.2, a: 3 * Math.PI / 4 },
    { x: 1.2, z: -1.2, a: -Math.PI / 4 },
    { x: -1.2, z: -1.2, a: -3 * Math.PI / 4 },
  ];
  armPos.forEach((ap, idx) => {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.08, 0.12), new THREE.MeshPhongMaterial({ color: 0x2a2a2a }));
    arm.position.set(ap.x * 0.5, 0, ap.z * 0.5); arm.rotation.y = ap.a; arm.name = 'arm_' + idx; g.add(arm);
    const motor = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.18, 0.2, 8), new THREE.MeshPhongMaterial({ color: 0x333333 }));
    motor.position.set(ap.x, 0.1, ap.z); motor.name = 'motor_' + idx; g.add(motor);
    const propGroup = new THREE.Group(); propGroup.position.set(ap.x, 0.25, ap.z);
    const blade1 = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.02, 0.15), new THREE.MeshPhongMaterial({ color: 0x444444, transparent: true, opacity: 0.7 }));
    propGroup.add(blade1);
    const blade2 = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.02, 0.15), new THREE.MeshPhongMaterial({ color: 0x444444, transparent: true, opacity: 0.7 }));
    blade2.rotation.y = Math.PI / 2; propGroup.add(blade2);
    g.add(propGroup); propellers.push(propGroup);
    const blurDisk = new THREE.Mesh(
      new THREE.CircleGeometry(1.1, 32),
      new THREE.MeshBasicMaterial({ color: 0x666666, transparent: true, opacity: 0, side: THREE.DoubleSide })
    );
    blurDisk.rotation.x = -Math.PI / 2; blurDisk.position.set(ap.x, 0.26, ap.z); blurDisk.name = 'blurDisk_' + idx;
    g.add(blurDisk); propBlurs.push(blurDisk);
    const ledColor = idx < 2 ? 0x00ff00 : 0xff0000;
    const led = new THREE.Mesh(new THREE.SphereGeometry(0.05, 4, 4), new THREE.MeshBasicMaterial({ color: ledColor }));
    led.position.set(ap.x, -0.1, ap.z); led.name = 'led_' + idx; g.add(led);
  });

  // === 起落架 ===
  const legMat = new THREE.MeshPhongMaterial({ color: 0x333333 });
  [[-0.4, 0, 0.3], [0.4, 0, 0.3], [-0.4, 0, -0.3], [0.4, 0, -0.3]].forEach(p => {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.4, 4), legMat);
    leg.position.set(p[0], -0.35, p[2]); g.add(leg);
  });
  const skid1 = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.04, 0.06), legMat);
  skid1.position.set(0, -0.55, 0.3); g.add(skid1);
  const skid2 = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.04, 0.06), legMat);
  skid2.position.set(0, -0.55, -0.3); g.add(skid2);
}

// ============================================================
// DJI Mini 4 Pro — 白色 + 单摄变焦 + 前有支撑点后无支撑点
// ============================================================
function buildMini4Pro(g, spec) {
  const white = 0xf0f0f0;  // 白色
  const darkGray = 0x2a2a2a;

  // === 机身：白色长方形 ===
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(1.2, 0.28, 0.9),
    new THREE.MeshPhongMaterial({ color: white, shininess: 80 })
  );
  body.name = 'body'; g.add(body);

  // === 顶部壳 ===
  const shell = new THREE.Mesh(
    new THREE.BoxGeometry(1.0, 0.1, 0.7),
    new THREE.MeshPhongMaterial({ color: white, shininess: 90 })
  );
  shell.position.y = 0.19; shell.name = 'shell'; g.add(shell);

  // === 单摄镜头（可变焦，镜头随云台物理俯仰：向下俯仰明显下转、回中复位） ===
  const lensMat = new THREE.MeshPhongMaterial({ color: 0x111111, shininess: 200, specular: 0x444444 });
  const lensGlassMat = new THREE.MeshPhongMaterial({ color: 0x2244aa, shininess: 250, specular: 0xffffff });

  // 云台转轴（镜头 + 玻璃 + 变焦 + 云台臂都挂在这里，随 gimbalPitch 一起转）
  const gimbalPivot = new THREE.Group();
  gimbalPivot.position.set(0, -0.18, 0.42); gimbalPivot.name = 'gimbalPivot';
  g.add(gimbalPivot);
  miniGimbalPivot = gimbalPivot;

  // 镜头外圈
  const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.13, 0.12, 16), lensMat);
  lens.rotation.x = Math.PI / 2; lens.position.set(0, 0, 0); lens.name = 'lens'; gimbalPivot.add(lens);

  // 镜头玻璃
  const lensGlass = new THREE.Mesh(new THREE.CircleGeometry(0.08, 16), lensGlassMat);
  lensGlass.position.set(0, 0, 0.07); lensGlass.name = 'lensGlass'; gimbalPivot.add(lensGlass);

  // 变焦镜头（可伸缩部分）
  const zoomLens = new THREE.Mesh(
    new THREE.CylinderGeometry(0.07, 0.09, 0.08, 16),
    new THREE.MeshPhongMaterial({ color: 0x222222, shininess: 150 })
  );
  zoomLens.rotation.x = Math.PI / 2; zoomLens.position.set(0, 0, 0.08); zoomLens.name = 'zoomLens'; gimbalPivot.add(zoomLens);
  lensZoomMesh = zoomLens;

  // 云台连接臂
  const gimbal = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.06, 0.12), new THREE.MeshPhongMaterial({ color: 0x111111 }));
  gimbal.position.set(0, 0.05, -0.04); gimbal.name = 'gimbal'; gimbalPivot.add(gimbal);

  // === 鱼眼避障（前2、侧2、后1；名字 fisheye_* 供 crash-debris 兼容） ===
  const fisheyeMat = new THREE.MeshPhongMaterial({ color: 0x050505, shininess: 80, specular: 0x222222 });
  const fisheyePos = [
    { x: 0.45, z: 0.42, n: 'fisheye_frontR' },   // 前右
    { x: -0.45, z: 0.42, n: 'fisheye_frontL' },  // 前左
    { x: -0.58, z: 0, n: 'fisheye_left' },       // 左侧
    { x: 0.58, z: 0, n: 'fisheye_right' },       // 右侧
    { x: 0, z: -0.42, n: 'fisheye_back' },       // 后
  ];
  fisheyePos.forEach(fp => {
    const fe = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), fisheyeMat);
    fe.scale.set(1, 0.35, 1);
    fe.position.set(fp.x, 0.05, fp.z); fe.name = fp.n; g.add(fe);
  });

  // === DJI标志（后部） ===
  const djiCanvas = document.createElement('canvas');
  djiCanvas.width = 256; djiCanvas.height = 128;
  const ctx = djiCanvas.getContext('2d');
  ctx.clearRect(0, 0, 256, 128);
  ctx.fillStyle = '#888888';
  ctx.font = 'bold 64px Arial, sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('DJI', 128, 70);
  const djiTex = new THREE.CanvasTexture(djiCanvas);
  const djiLabel = new THREE.Mesh(
    new THREE.PlaneGeometry(0.5, 0.25),
    new THREE.MeshBasicMaterial({ map: djiTex, transparent: true })
  );
  djiLabel.position.set(0, 0.0, -0.46);
  djiLabel.rotation.y = Math.PI; djiLabel.name = 'djiLabel'; g.add(djiLabel);

  // === 机臂 + 电机 + 螺旋桨（无桨叶保护罩） ===
  const armPos = [
    { x: 1.0, z: 1.0, a: Math.PI / 4, front: true },
    { x: -1.0, z: 1.0, a: 3 * Math.PI / 4, front: true },
    { x: 1.0, z: -1.0, a: -Math.PI / 4, front: false },
    { x: -1.0, z: -1.0, a: -3 * Math.PI / 4, front: false },
  ];
  armPos.forEach((ap, idx) => {
    // 前面机臂在下面可以看出在中间
    const armY = ap.front ? -0.05 : 0.05;
    const arm = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.06, 0.1), new THREE.MeshPhongMaterial({ color: darkGray }));
    arm.position.set(ap.x * 0.5, armY, ap.z * 0.5); arm.rotation.y = ap.a; arm.name = 'arm_' + idx; g.add(arm);
    const motor = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.15, 0.16, 8), new THREE.MeshPhongMaterial({ color: 0x333333 }));
    motor.position.set(ap.x, armY + 0.1, ap.z); motor.name = 'motor_' + idx; g.add(motor);
    const propGroup = new THREE.Group(); propGroup.position.set(ap.x, armY + 0.2, ap.z);
    const blade1 = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.02, 0.12), new THREE.MeshPhongMaterial({ color: 0x444444, transparent: true, opacity: 0.7 }));
    propGroup.add(blade1);
    const blade2 = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.02, 0.12), new THREE.MeshPhongMaterial({ color: 0x444444, transparent: true, opacity: 0.7 }));
    blade2.rotation.y = Math.PI / 2; propGroup.add(blade2);
    g.add(propGroup); propellers.push(propGroup);
    const blurDisk = new THREE.Mesh(
      new THREE.CircleGeometry(0.9, 32),
      new THREE.MeshBasicMaterial({ color: 0x666666, transparent: true, opacity: 0, side: THREE.DoubleSide })
    );
    blurDisk.rotation.x = -Math.PI / 2; blurDisk.position.set(ap.x, armY + 0.21, ap.z); blurDisk.name = 'blurDisk_' + idx;
    g.add(blurDisk); propBlurs.push(blurDisk);
    const ledColor = idx < 2 ? 0x00ff00 : 0xff0000;
    const led = new THREE.Mesh(new THREE.SphereGeometry(0.04, 4, 4), new THREE.MeshBasicMaterial({ color: ledColor }));
    led.position.set(ap.x, armY - 0.08, ap.z); led.name = 'led_' + idx; g.add(led);
  });

  // === 起落架：前面有支撑点，后面没有 ===
  const legMat = new THREE.MeshPhongMaterial({ color: 0x333333 });
  // 前面两条腿（有支撑点）
  [[-0.3, 0, 0.25], [0.3, 0, 0.25]].forEach(p => {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.35, 4), legMat);
    leg.position.set(p[0], -0.3, p[2]); g.add(leg);
  });
  // 前面滑橇
  const frontSkid = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.03, 0.05), legMat);
  frontSkid.position.set(0, -0.48, 0.25); g.add(frontSkid);
  // 后面：无支撑点，电池直接在机臂上（用一个小方块表示电池）
  const battery = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 0.12, 0.3),
    new THREE.MeshPhongMaterial({ color: 0x333333, shininess: 40 })
  );
  battery.position.set(0, -0.2, -0.2); battery.name = 'battery'; g.add(battery);
}

// ============================================================
// DJI Mavic 4 Pro — 深灰 Mavic 3 Pro 壳 + 右前机臂激光雷达 + 横滚旋转
// ============================================================
function buildMavic4Pro(g, spec) {
  buildMavic3Pro(g, spec, 0x1e1e24);   // 更深的暗灰机身
  // 右前机臂激光雷达：面板平放机臂根部，4 个红点朝上（扫闪 → 看似连续亮带）
  const armPivot = new THREE.Group();
  armPivot.position.set(0.5, 0.07, 0.5);
  armPivot.rotation.y = Math.PI / 4;   // 对齐右前臂方向（+X+Z 斜前方）
  g.add(armPivot);
  const panel = new THREE.Mesh(
    new THREE.BoxGeometry(0.3, 0.02, 0.08),
    new THREE.MeshBasicMaterial({ color: 0x000000 })
  );
  panel.position.set(0, 0.01, 0);
  panel.name = 'lidarScreen';
  armPivot.add(panel);
  for (let i = 0; i < 4; i++) {
    const cell = new THREE.Mesh(
      new THREE.PlaneGeometry(0.055, 0.035),
      new THREE.MeshBasicMaterial({ color: 0xff2200, transparent: true, opacity: 0.15 })
    );
    cell.rotation.x = -Math.PI / 2;   // 朝上
    cell.position.set(-0.12 + i * 0.08, 0.03, 0);
    cell.name = 'lidarCell_' + i;
    armPivot.add(cell);
    lidarCells.push(cell);
  }
}

// ============================================================
// DJI Neo 2 — 小巧白色跟拍机 + 左前显示屏（跟拍模式）+ 无折叠机臂
// ============================================================
function buildNeo2(g, spec) {
  const white = 0xfafafa;
  const darkGray = 0x2a2a2a;

  // === 机身 ===
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.9, 0.22, 0.7),
    new THREE.MeshPhongMaterial({ color: white, shininess: 80 })
  );
  body.name = 'body'; g.add(body);
  const shell = new THREE.Mesh(
    new THREE.BoxGeometry(0.74, 0.08, 0.55),
    new THREE.MeshPhongMaterial({ color: white, shininess: 90 })
  );
  shell.position.y = 0.15; shell.name = 'shell'; g.add(shell);

  // === 前置单镜头 ===
  const lensMat = new THREE.MeshPhongMaterial({ color: 0x111111, shininess: 200, specular: 0x444444 });
  const lensGlassMat = new THREE.MeshPhongMaterial({ color: 0x2244aa, shininess: 250, specular: 0xffffff });
  const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.1, 16), lensMat);
  lens.rotation.x = Math.PI / 2; lens.position.set(0, -0.05, 0.36); lens.name = 'lens'; g.add(lens);
  const lensGlass = new THREE.Mesh(new THREE.CircleGeometry(0.055, 16), lensGlassMat);
  lensGlass.position.set(0, -0.05, 0.42); lensGlass.name = 'lensGlass'; g.add(lensGlass);

  // === 左前显示屏（跟拍模式轮换，非激光雷达） ===
  const c = document.createElement('canvas');
  c.width = 256; c.height = 144;
  const ctx = c.getContext('2d');
  neo2DisplayTex = new THREE.CanvasTexture(c);
  const disp = new THREE.Mesh(
    new THREE.PlaneGeometry(0.34, 0.2),
    new THREE.MeshBasicMaterial({ map: neo2DisplayTex })
  );
  disp.position.set(-0.42, 0.02, 0.32);
  disp.name = 'neo2Display';
  g.add(disp);
  neo2DisplayMode = 0;
  drawNeo2Display(ctx, 0);

  // === DJI 标志（后部） ===
  const djiCanvas = document.createElement('canvas');
  djiCanvas.width = 256; djiCanvas.height = 128;
  const dctx = djiCanvas.getContext('2d');
  dctx.clearRect(0, 0, 256, 128);
  dctx.fillStyle = '#888888';
  dctx.font = 'bold 64px Arial, sans-serif';
  dctx.textAlign = 'center'; dctx.textBaseline = 'middle';
  dctx.fillText('DJI', 128, 70);
  const djiTex = new THREE.CanvasTexture(djiCanvas);
  const djiLabel = new THREE.Mesh(
    new THREE.PlaneGeometry(0.4, 0.2),
    new THREE.MeshBasicMaterial({ map: djiTex, transparent: true })
  );
  djiLabel.position.set(0, 0, -0.36);
  djiLabel.rotation.y = Math.PI; djiLabel.name = 'djiLabel'; g.add(djiLabel);

  // === 机臂（紧凑，无折叠结构，4 桨 + 4 blurDisk + LED） ===
  const armPos = [
    { x: 1.0, z: 1.0, a: Math.PI / 4, front: true },
    { x: -1.0, z: 1.0, a: 3 * Math.PI / 4, front: true },
    { x: 1.0, z: -1.0, a: -Math.PI / 4, front: false },
    { x: -1.0, z: -1.0, a: -3 * Math.PI / 4, front: false },
  ];
  armPos.forEach((ap, idx) => {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.05, 0.1), new THREE.MeshPhongMaterial({ color: darkGray }));
    arm.position.set(ap.x * 0.5, 0, ap.z * 0.5); arm.rotation.y = ap.a; arm.name = 'arm_' + idx; g.add(arm);
    const motor = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 0.12, 8), new THREE.MeshPhongMaterial({ color: 0x333333 }));
    motor.position.set(ap.x, 0.07, ap.z); motor.name = 'motor_' + idx; g.add(motor);
    const propGroup = new THREE.Group(); propGroup.position.set(ap.x, 0.16, ap.z);
    const blade1 = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.02, 0.1), new THREE.MeshPhongMaterial({ color: 0x444444, transparent: true, opacity: 0.7 }));
    propGroup.add(blade1);
    const blade2 = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.02, 0.1), new THREE.MeshPhongMaterial({ color: 0x444444, transparent: true, opacity: 0.7 }));
    blade2.rotation.y = Math.PI / 2; propGroup.add(blade2);
    g.add(propGroup); propellers.push(propGroup);
    const blurDisk = new THREE.Mesh(
      new THREE.CircleGeometry(0.7, 32),
      new THREE.MeshBasicMaterial({ color: 0x666666, transparent: true, opacity: 0, side: THREE.DoubleSide })
    );
    blurDisk.rotation.x = -Math.PI / 2; blurDisk.position.set(ap.x, 0.17, ap.z); blurDisk.name = 'blurDisk_' + idx;
    g.add(blurDisk); propBlurs.push(blurDisk);
    const ledColor = idx < 2 ? 0x00ff00 : 0xff0000;
    const led = new THREE.Mesh(new THREE.SphereGeometry(0.035, 4, 4), new THREE.MeshBasicMaterial({ color: ledColor }));
    led.position.set(ap.x, -0.06, ap.z); led.name = 'led_' + idx; g.add(led);
  });

  // === 4 根小起落架 ===
  const legMat = new THREE.MeshPhongMaterial({ color: 0x333333 });
  [[-0.28, 0.24], [0.28, 0.24], [-0.28, -0.24], [0.28, -0.24]].forEach(p => {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.22, 4), legMat);
    leg.position.set(p[0], -0.22, p[1]); g.add(leg);
  });
}

// Neo 2 显示屏绘制（跟拍模式）
function drawNeo2Display(ctx, idx) {
  const mode = NEO2_MODES[idx % NEO2_MODES.length];
  ctx.fillStyle = '#0a2a5a';
  ctx.fillRect(0, 0, 256, 144);
  ctx.fillStyle = '#2ad24a';
  ctx.beginPath(); ctx.arc(230, 18, 6, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.font = '22px Arial, sans-serif';
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.fillText('REC', 20, 18);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 44px Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(mode, 128, 78);
  ctx.fillStyle = '#7fd0ff';
  ctx.font = '26px Arial, sans-serif';
  ctx.fillText('跟拍', 128, 122);
}

// ============================================================
// DJI Avata 360 全景无人机模型（保持不变）
// ============================================================
function buildAvata360(g, spec) {
  const bodyColor = spec.color;

  const body = new THREE.Mesh(
    new THREE.BoxGeometry(1.3, 0.45, 1.5),
    new THREE.MeshPhongMaterial({ color: bodyColor, shininess: 60 })
  );
  body.name = 'body'; g.add(body);
  const topShell = new THREE.Mesh(
    new THREE.BoxGeometry(1.0, 0.18, 1.1),
    new THREE.MeshPhongMaterial({ color: 0x808080, shininess: 70 })
  );
  topShell.position.y = 0.3; topShell.name = 'shell'; g.add(topShell);

  const djiCanvas = document.createElement('canvas');
  djiCanvas.width = 256; djiCanvas.height = 128;
  const ctx = djiCanvas.getContext('2d');
  ctx.clearRect(0, 0, 256, 128);
  ctx.fillStyle = '#1a1a1a';
  ctx.font = 'bold 88px Arial, sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('DJI', 128, 70);
  const djiTex = new THREE.CanvasTexture(djiCanvas);
  const djiLabel = new THREE.Mesh(
    new THREE.PlaneGeometry(0.8, 0.4),
    new THREE.MeshBasicMaterial({ map: djiTex, transparent: true })
  );
  djiLabel.rotation.x = -Math.PI / 2;
  djiLabel.position.set(0, 0.4, 0); djiLabel.name = 'djiLabel'; g.add(djiLabel);

  // === 双镜头云台：上面一个镜头、下面一个镜头 ===
  // 起飞前云台水平（镜头正着向前）；升空后云台竖直（上镜朝上、下镜朝下 → 360° 全景双摄）
  avataGimbal = new THREE.Group();
  avataGimbal.name = 'gimbal'; // crash-debris 兼容
  avataGimbal.position.set(0, 0.05, 0.7);
  g.add(avataGimbal);

  // 云台外壳（水平圆柱，内部连接上下两颗镜头）
  const housingMat = new THREE.MeshPhongMaterial({ color: 0x222222, shininess: 90 });
  const housing = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.24, 0.34, 16), housingMat);
  housing.rotation.x = Math.PI / 2; // 轴线沿 Z（水平）
  avataGimbal.add(housing);

  // 360° 双镜头玻璃：云台竖直后，+Z 镜头朝上、-Z 镜头朝下
  const lensGlassMat2 = new THREE.MeshPhongMaterial({ color: 0x2244aa, shininess: 220, specular: 0xffffff });
  const lensTop = new THREE.Mesh(new THREE.CircleGeometry(0.17, 20), lensGlassMat2);
  lensTop.position.set(0, 0, 0.18); lensTop.name = 'lens_top'; avataGimbal.add(lensTop);
  const lensBottom = new THREE.Mesh(new THREE.CircleGeometry(0.17, 20), lensGlassMat2);
  lensBottom.position.set(0, 0, -0.18); lensBottom.name = 'lens_bottom'; avataGimbal.add(lensBottom);

  // 云台连接杆
  const gimbalRod = new THREE.Mesh(
    new THREE.BoxGeometry(0.12, 0.12, 0.18),
    new THREE.MeshPhongMaterial({ color: 0x111111 })
  );
  gimbalRod.position.set(0, 0, -0.28); gimbalRod.name = 'gimbalRod'; avataGimbal.add(gimbalRod);

  const armPos = [
    { x: 1.0, z: 1.0, front: true },
    { x: -1.0, z: 1.0, front: true },
    { x: 1.0, z: -1.0, front: false },
    { x: -1.0, z: -1.0, front: false },
  ];
  armPos.forEach((ap, idx) => {
    const arm = new THREE.Mesh(
      new THREE.BoxGeometry(0.9, 0.1, 0.16),
      new THREE.MeshPhongMaterial({ color: 0x707070 })
    );
    arm.position.set(ap.x * 0.55, 0, ap.z * 0.55);
    arm.rotation.y = Math.atan2(ap.x, ap.z); arm.name = 'arm_' + idx; g.add(arm);
    const motor = new THREE.Mesh(
      new THREE.CylinderGeometry(0.14, 0.16, 0.18, 10),
      new THREE.MeshPhongMaterial({ color: 0x3a3a3a })
    );
    motor.position.set(ap.x, 0.06, ap.z); motor.name = 'motor_' + idx; g.add(motor);

    const propGroup = new THREE.Group();
    propGroup.position.set(ap.x, 0.18, ap.z);
    const bladeMat = new THREE.MeshPhongMaterial({ color: 0x2a2a2a, transparent: true, opacity: 0.85 });
    for (let b = 0; b < 4; b++) {
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.02, 0.14), bladeMat);
      blade.position.x = 0.33;
      const bladePivot = new THREE.Group();
      bladePivot.rotation.y = b * Math.PI / 2;
      bladePivot.add(blade);
      propGroup.add(bladePivot);
    }
    g.add(propGroup); propellers.push(propGroup);

    const duct = new THREE.Mesh(
      new THREE.TorusGeometry(0.66, 0.05, 6, 20),
      new THREE.MeshPhongMaterial({ color: 0x606060 })
    );
    duct.rotation.x = Math.PI / 2;
    duct.position.set(ap.x, 0.18, ap.z); duct.name = 'duct_' + idx; g.add(duct);

    const blurDisk = new THREE.Mesh(
      new THREE.CircleGeometry(0.6, 32),
      new THREE.MeshBasicMaterial({ color: 0x777777, transparent: true, opacity: 0, side: THREE.DoubleSide })
    );
    blurDisk.rotation.x = -Math.PI / 2; blurDisk.position.set(ap.x, 0.19, ap.z); blurDisk.name = 'blurDisk_' + idx;
    g.add(blurDisk); propBlurs.push(blurDisk);
    const blurRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.66, 0.05, 6, 20),
      new THREE.MeshPhongMaterial({ color: 0x606060 })
    );
    blurRing.rotation.x = Math.PI / 2; blurRing.position.set(ap.x, 0.2, ap.z);
    blurRing.visible = false; blurRing.name = 'blurRing_' + idx; g.add(blurRing); propBlurs.push(blurRing);

    const led = new THREE.Mesh(
      new THREE.SphereGeometry(0.05, 4, 4),
      new THREE.MeshBasicMaterial({ color: ap.front ? 0x00ff00 : 0xff0000 })
    );
    led.position.set(ap.x, -0.12, ap.z); led.name = 'led_' + idx; g.add(led);
  });
}

// ============================================================
// 动画更新函数（由game.js每帧调用）
// ============================================================
export function updateDroneAnimations(time) {
  // === Air 3: 红外LED闪烁 ===
  if (irLedMesh && irLedMesh.material) {
    const blink = Math.sin(time * 8) > 0 ? 1 : 0.1;
    irLedMesh.material.opacity = blink;
  }

  // === Air 3: 盖子动画 ===
  if (lidMesh) {
    const targetAngle = lidOpen ? -2.1 : 0; // -120° = -2.1 rad
    lidMesh.rotation.x += (targetAngle - lidMesh.rotation.x) * 0.1;

    // 4G模块可见性
    if (fourGGroup) {
      fourGGroup.visible = lidOpen || lidMesh.rotation.x < -0.5;
    }
  }

  // === Mavic 3 Pro: 模块仓盖子动画 ===
  if (bayMesh) {
    const targetAngle = moduleBayOpen ? 2.1 : 0;
    bayMesh.rotation.x += (targetAngle - bayMesh.rotation.x) * 0.1;
  }

  // === Mavic 3 Pro: 光圈环旋转 ===
  if (droneGroup) {
    droneGroup.traverse(child => {
      if (child.name && child.name.includes('Aperture')) {
        child.rotation.z = time * 0.5;
      }
    });
  }

  // === Mini 4 Pro: 变焦镜头伸缩 ===
  if (lensZoomMesh) {
    const targetZ = 0.08 + zoomLevel * 0.06; // 伸缩距离（云台局部坐标）
    const targetHeight = 0.08 + zoomLevel * 0.04; // 变长
    lensZoomMesh.position.z += (targetZ - lensZoomMesh.position.z) * 0.1;
    // 重建geometry来改变高度（简单方式：scale）
    const targetScale = 1 + zoomLevel * 0.5;
    lensZoomMesh.scale.y += (targetScale - lensZoomMesh.scale.y) * 0.1;
  }

  // === Mini 4 Pro: 镜头物理俯仰（与相机视角同步，向下俯仰时镜头明显下转、回中复位） ===
  if (miniGimbalPivot) {
    miniGimbalPivot.rotation.x = -state.gimbalPitch * Math.PI / 180;
  }

  // === Avata 360: 双镜头云台竖直（升空后 → 上面一个镜头、下面一个镜头的全景模式） ===
  if (avataGimbal) {
    const airborne = state.gameStarted && !state.isPreflight && !state.isLanded;
    const targetRot = airborne ? -Math.PI / 2 : 0;
    avataGimbal.rotation.x += (targetRot - avataGimbal.rotation.x) * 0.08;
  }

  // === Air 3: 补光灯光圈呼吸 ===
  if (auxLightMesh && auxLightMesh.material) {
    const pulse = 0.1 + Math.sin(time * 3) * 0.05;
    auxLightMesh.material.opacity = pulse;
  }

  // === 激光雷达扫闪（Air 3S 前屏 / Mavic 4 Pro 右前臂）：一排红点快速扫过 → 看似连续亮带 ===
  if (lidarCells.length) {
    const n = lidarCells.length;
    const sweep = Math.floor(time * 24) % n;          // 每秒 24 格快速扫过
    lidarCells.forEach((cell, i) => {
      let d = Math.abs(i - sweep);
      if (d > n / 2) d = n - d;
      const on = d <= 1;                               // 3 格高亮带 → 看似连续亮带
      const target = on ? 1 : 0.12;
      cell.material.opacity += (target - cell.material.opacity) * 0.85;
      cell.material.color.setHex(on ? 0xff3300 : 0xaa1100);
    });
  }

  // === Neo 2: 显示屏轮换跟拍模式 ===
  if (neo2DisplayTex && neo2DisplayTex.image) {
    const idx = Math.floor(time / 1.5) % NEO2_MODES.length;
    if (idx !== neo2DisplayMode) {
      neo2DisplayMode = idx;
      const ctx = neo2DisplayTex.image.getContext('2d');
      drawNeo2Display(ctx, idx);
      neo2DisplayTex.needsUpdate = true;
    }
  }
}

// === 交互：切换盖子状态 ===
export function toggleLid() {
  if (!lidMesh) return;
  lidOpen = !lidOpen;
  if (!lidOpen && fourGInserted) {
    // 盖子关闭时4G模块隐藏
    if (fourGGroup) fourGGroup.visible = false;
  }
}

export function toggleModuleBay() {
  if (!bayMesh) return;
  moduleBayOpen = !moduleBayOpen;
}

export function toggleZoom() {
  zoomLevel = (zoomLevel + 1) % 3; // 0→1→2→0
}

// === 4G模块拖拽 ===
let isDragging4G = false;
let dragOffset = new THREE.Vector3();

export function startDrag4G(point) {
  if (!fourGGroup || !fourGGroup.visible) return false;
  isDragging4G = true;
  dragOffset.subVectors(fourGGroup.position, point);
  return true;
}

export function updateDrag4G(point) {
  if (!isDragging4G || !fourGGroup) return;
  fourGGroup.position.copy(point).add(dragOffset);
}

export function endDrag4G() {
  if (!isDragging4G || !fourGGroup) return;
  isDragging4G = false;

  // 检查是否拖入盖子区域（简单距离检测）
  if (fourGSlotMesh) {
    const slotWorldPos = new THREE.Vector3();
    fourGSlotMesh.getWorldPosition(slotWorldPos);
    const moduleWorldPos = new THREE.Vector3();
    fourGGroup.getWorldPosition(moduleWorldPos);
    const dist = slotWorldPos.distanceTo(moduleWorldPos);

    if (dist < 0.5) {
      // 吸附到位
      fourGInserted = true;
      fourGGroup.position.set(0, 0.02, 0.35); // 放入盖子内
      // 重新parent到lidPivot
      if (lidMesh) {
        const worldPos = new THREE.Vector3();
        fourGGroup.getWorldPosition(worldPos);
        droneGroup.remove(fourGGroup);
        lidMesh.add(fourGGroup);
        // 转换到lidPivot本地坐标
        const localPos = lidMesh.worldToLocal(worldPos);
        fourGGroup.position.copy(localPos);
      }
    }
  }
}

export function isDragging4GModule() {
  return isDragging4G;
}
