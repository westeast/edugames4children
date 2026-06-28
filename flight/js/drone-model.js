// Drone 3D model: realistic DJI quadcopter with spinning propellers
import * as THREE from 'three';
import { scene } from './engine.js';
import { DRONES, state } from './config.js';

export let droneGroup = null;
export let propellers = [];
export let propBlurs = []; // Blur disks for high speed

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

  // Dispatch to per-drone builder
  if (spec.panoramic) {
    buildAvata360(g, spec);
  } else if (droneIdx === 0) {
    buildAir3(g, spec);
  } else if (droneIdx === 1) {
    buildMavic3Pro(g, spec);
  } else if (droneIdx === 2) {
    buildMini4Pro(g, spec);
  }

  g.position.copy(state.dronePos);
  scene.add(g); droneGroup = g;
}

// DJI Air 3 — 橙色顶壳 + 顶部 DJI 标志 + 无桨叶保护罩
function buildAir3(g, spec) {
  const accent = spec.color; // 0xff9500 orange

  // Central body (dark)
  g.add(new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.3, 1.0), new THREE.MeshPhongMaterial({ color: 0x1a1a1a, shininess: 80 })));
  // Top accent shell (orange)
  const shell = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.15, 0.8), new THREE.MeshPhongMaterial({ color: accent, shininess: 100 }));
  shell.position.y = 0.22; g.add(shell);

  // DJI text on top of orange shell
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
  djiLabel.position.set(0, 0.30, 0); g.add(djiLabel);

  // Camera gimbal
  const gimbal = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 8), new THREE.MeshPhongMaterial({ color: 0x111111, shininess: 120 }));
  gimbal.position.set(0, -0.2, 0.4); g.add(gimbal);
  // Camera lens
  const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.1, 8), new THREE.MeshPhongMaterial({ color: 0x2244aa, shininess: 200 }));
  lens.rotation.x = Math.PI / 2; lens.position.set(0, -0.25, 0.5); g.add(lens);

  // Arms + motors + propellers (NO prop guards)
  const armPos = [
    { x: 1.2, z: 1.2, a: Math.PI / 4 },
    { x: -1.2, z: 1.2, a: 3 * Math.PI / 4 },
    { x: 1.2, z: -1.2, a: -Math.PI / 4 },
    { x: -1.2, z: -1.2, a: -3 * Math.PI / 4 },
  ];
  armPos.forEach((ap, idx) => {
    // Arm
    const arm = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.08, 0.12), new THREE.MeshPhongMaterial({ color: 0x2a2a2a }));
    arm.position.set(ap.x * 0.5, 0, ap.z * 0.5); arm.rotation.y = ap.a; g.add(arm);
    // Motor housing
    const motor = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.18, 0.2, 8), new THREE.MeshPhongMaterial({ color: 0x333333 }));
    motor.position.set(ap.x, 0.1, ap.z); g.add(motor);
    // Propeller group (2-blade, NO guard ring)
    const propGroup = new THREE.Group(); propGroup.position.set(ap.x, 0.25, ap.z);
    const blade1 = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.02, 0.15), new THREE.MeshPhongMaterial({ color: 0x444444, transparent: true, opacity: 0.7 }));
    propGroup.add(blade1);
    const blade2 = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.02, 0.15), new THREE.MeshPhongMaterial({ color: 0x444444, transparent: true, opacity: 0.7 }));
    blade2.rotation.y = Math.PI / 2; propGroup.add(blade2);
    g.add(propGroup); propellers.push(propGroup);
    // Blur disk for high speed (initially hidden)
    const blurDisk = new THREE.Mesh(
      new THREE.CircleGeometry(1.1, 32),
      new THREE.MeshBasicMaterial({ color: 0x666666, transparent: true, opacity: 0, side: THREE.DoubleSide })
    );
    blurDisk.rotation.x = -Math.PI / 2; blurDisk.position.set(ap.x, 0.26, ap.z);
    g.add(blurDisk); propBlurs.push(blurDisk);
    // LED lights (front=green, rear=red)
    const ledColor = idx < 2 ? 0x00ff00 : 0xff0000;
    const led = new THREE.Mesh(new THREE.SphereGeometry(0.05, 4, 4), new THREE.MeshBasicMaterial({ color: ledColor }));
    led.position.set(ap.x, -0.1, ap.z); g.add(led);
  });

  // Landing gear
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

// DJI Mavic 3 Pro — 红色顶壳 + 前方2个鱼眼 + 后方1个鱼眼 + 无桨叶保护罩
function buildMavic3Pro(g, spec) {
  const accent = spec.color; // 0xff3b30 red

  // Central body
  g.add(new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.3, 1.0), new THREE.MeshPhongMaterial({ color: 0x1a1a1a, shininess: 80 })));
  // Top accent shell (red)
  const shell = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.15, 0.8), new THREE.MeshPhongMaterial({ color: accent, shininess: 100 }));
  shell.position.y = 0.22; g.add(shell);

  // Camera gimbal (main Hasselblad camera)
  const gimbal = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 8), new THREE.MeshPhongMaterial({ color: 0x111111, shininess: 120 }));
  gimbal.position.set(0, -0.2, 0.4); g.add(gimbal);
  // Camera lens
  const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.1, 8), new THREE.MeshPhongMaterial({ color: 0x2244aa, shininess: 200 }));
  lens.rotation.x = Math.PI / 2; lens.position.set(0, -0.25, 0.5); g.add(lens);

  // Fisheye lenses: 2 front + 1 rear (dark/black dots)
  const fisheyeMat = new THREE.MeshPhongMaterial({ color: 0x0a0a0a, shininess: 250, specular: 0x333333 });
  // Front-left fisheye
  const fl = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 8), fisheyeMat);
  fl.position.set(-0.35, -0.12, 0.45); g.add(fl);
  // Front-right fisheye
  const fr = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 8), fisheyeMat);
  fr.position.set(0.35, -0.12, 0.45); g.add(fr);
  // Rear fisheye
  const rr = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 8), fisheyeMat);
  rr.position.set(0, -0.12, -0.45); g.add(rr);

  // Arms + motors + propellers (NO prop guards)
  const armPos = [
    { x: 1.2, z: 1.2, a: Math.PI / 4 },
    { x: -1.2, z: 1.2, a: 3 * Math.PI / 4 },
    { x: 1.2, z: -1.2, a: -Math.PI / 4 },
    { x: -1.2, z: -1.2, a: -3 * Math.PI / 4 },
  ];
  armPos.forEach((ap, idx) => {
    // Arm
    const arm = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.08, 0.12), new THREE.MeshPhongMaterial({ color: 0x2a2a2a }));
    arm.position.set(ap.x * 0.5, 0, ap.z * 0.5); arm.rotation.y = ap.a; g.add(arm);
    // Motor housing
    const motor = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.18, 0.2, 8), new THREE.MeshPhongMaterial({ color: 0x333333 }));
    motor.position.set(ap.x, 0.1, ap.z); g.add(motor);
    // Propeller group (2-blade, NO guard ring)
    const propGroup = new THREE.Group(); propGroup.position.set(ap.x, 0.25, ap.z);
    const blade1 = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.02, 0.15), new THREE.MeshPhongMaterial({ color: 0x444444, transparent: true, opacity: 0.7 }));
    propGroup.add(blade1);
    const blade2 = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.02, 0.15), new THREE.MeshPhongMaterial({ color: 0x444444, transparent: true, opacity: 0.7 }));
    blade2.rotation.y = Math.PI / 2; propGroup.add(blade2);
    g.add(propGroup); propellers.push(propGroup);
    // Blur disk for high speed (initially hidden)
    const blurDisk = new THREE.Mesh(
      new THREE.CircleGeometry(1.1, 32),
      new THREE.MeshBasicMaterial({ color: 0x666666, transparent: true, opacity: 0, side: THREE.DoubleSide })
    );
    blurDisk.rotation.x = -Math.PI / 2; blurDisk.position.set(ap.x, 0.26, ap.z);
    g.add(blurDisk); propBlurs.push(blurDisk);
    // LED lights (front=green, rear=red)
    const ledColor = idx < 2 ? 0x00ff00 : 0xff0000;
    const led = new THREE.Mesh(new THREE.SphereGeometry(0.05, 4, 4), new THREE.MeshBasicMaterial({ color: ledColor }));
    led.position.set(ap.x, -0.1, ap.z); g.add(led);
  });

  // Landing gear
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

// DJI Mini 4 Pro — 浅灰顶壳 + 后部 DJI 标志 + 无桨叶保护罩
function buildMini4Pro(g, spec) {
  const accent = spec.color; // 0xd0d0d0 light gray

  // Central body
  g.add(new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.3, 1.0), new THREE.MeshPhongMaterial({ color: 0x1a1a1a, shininess: 80 })));
  // Top accent shell (light gray)
  const shell = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.15, 0.8), new THREE.MeshPhongMaterial({ color: accent, shininess: 100 }));
  shell.position.y = 0.22; g.add(shell);

  // DJI text on the REAR of the drone (back face, -z direction)
  const djiCanvas = document.createElement('canvas');
  djiCanvas.width = 256; djiCanvas.height = 128;
  const ctx = djiCanvas.getContext('2d');
  ctx.clearRect(0, 0, 256, 128);
  ctx.fillStyle = '#1a1a1a';
  ctx.font = 'bold 64px Arial, sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('DJI', 128, 70);
  const djiTex = new THREE.CanvasTexture(djiCanvas);
  const djiLabel = new THREE.Mesh(
    new THREE.PlaneGeometry(0.6, 0.3),
    new THREE.MeshBasicMaterial({ map: djiTex, transparent: true })
  );
  // Position on the back face: facing -z direction (rear)
  djiLabel.position.set(0, 0.0, -0.51);
  djiLabel.rotation.y = Math.PI; // Face outward from the back
  g.add(djiLabel);

  // Camera gimbal
  const gimbal = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 8), new THREE.MeshPhongMaterial({ color: 0x111111, shininess: 120 }));
  gimbal.position.set(0, -0.2, 0.4); g.add(gimbal);
  // Camera lens
  const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.1, 8), new THREE.MeshPhongMaterial({ color: 0x2244aa, shininess: 200 }));
  lens.rotation.x = Math.PI / 2; lens.position.set(0, -0.25, 0.5); g.add(lens);

  // Arms + motors + propellers (NO prop guards)
  const armPos = [
    { x: 1.2, z: 1.2, a: Math.PI / 4 },
    { x: -1.2, z: 1.2, a: 3 * Math.PI / 4 },
    { x: 1.2, z: -1.2, a: -Math.PI / 4 },
    { x: -1.2, z: -1.2, a: -3 * Math.PI / 4 },
  ];
  armPos.forEach((ap, idx) => {
    // Arm
    const arm = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.08, 0.12), new THREE.MeshPhongMaterial({ color: 0x2a2a2a }));
    arm.position.set(ap.x * 0.5, 0, ap.z * 0.5); arm.rotation.y = ap.a; g.add(arm);
    // Motor housing
    const motor = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.18, 0.2, 8), new THREE.MeshPhongMaterial({ color: 0x333333 }));
    motor.position.set(ap.x, 0.1, ap.z); g.add(motor);
    // Propeller group (2-blade, NO guard ring)
    const propGroup = new THREE.Group(); propGroup.position.set(ap.x, 0.25, ap.z);
    const blade1 = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.02, 0.15), new THREE.MeshPhongMaterial({ color: 0x444444, transparent: true, opacity: 0.7 }));
    propGroup.add(blade1);
    const blade2 = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.02, 0.15), new THREE.MeshPhongMaterial({ color: 0x444444, transparent: true, opacity: 0.7 }));
    blade2.rotation.y = Math.PI / 2; propGroup.add(blade2);
    g.add(propGroup); propellers.push(propGroup);
    // Blur disk for high speed (initially hidden)
    const blurDisk = new THREE.Mesh(
      new THREE.CircleGeometry(1.1, 32),
      new THREE.MeshBasicMaterial({ color: 0x666666, transparent: true, opacity: 0, side: THREE.DoubleSide })
    );
    blurDisk.rotation.x = -Math.PI / 2; blurDisk.position.set(ap.x, 0.26, ap.z);
    g.add(blurDisk); propBlurs.push(blurDisk);
    // LED lights (front=green, rear=red)
    const ledColor = idx < 2 ? 0x00ff00 : 0xff0000;
    const led = new THREE.Mesh(new THREE.SphereGeometry(0.05, 4, 4), new THREE.MeshBasicMaterial({ color: ledColor }));
    led.position.set(ap.x, -0.1, ap.z); g.add(led);
  });

  // Landing gear
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

// DJI Avata 360 全景无人机模型
function buildAvata360(g, spec) {
  const bodyColor = spec.color; // 灰色机身

  // 主机身 — 灰色、略厚（cinewhoop 造型）
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(1.3, 0.45, 1.5),
    new THREE.MeshPhongMaterial({ color: bodyColor, shininess: 60 })
  );
  g.add(body);
  // 机身上方倒角壳
  const topShell = new THREE.Mesh(
    new THREE.BoxGeometry(1.0, 0.18, 1.1),
    new THREE.MeshPhongMaterial({ color: 0x808080, shininess: 70 })
  );
  topShell.position.y = 0.3; g.add(topShell);

  // 机顶 "DJI" 字样（canvas 贴图）
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
  djiLabel.position.set(0, 0.4, 0); g.add(djiLabel);

  // 前置全景镜头（朝前 +z）
  const lensHousing = new THREE.Mesh(
    new THREE.CylinderGeometry(0.22, 0.24, 0.3, 16),
    new THREE.MeshPhongMaterial({ color: 0x222222, shininess: 90 })
  );
  lensHousing.rotation.x = Math.PI / 2;
  lensHousing.position.set(0, 0.05, 0.78); g.add(lensHousing);
  // 镜头玻璃（360 全景球面镜头）
  const lensGlass = new THREE.Mesh(
    new THREE.SphereGeometry(0.18, 16, 16),
    new THREE.MeshPhongMaterial({ color: 0x1133bb, shininess: 220, specular: 0xffffff })
  );
  lensGlass.position.set(0, 0.05, 0.92); g.add(lensGlass);

  // 四个机臂 + 涵道 + 四叶桨
  const armPos = [
    { x: 1.0, z: 1.0, front: true },
    { x: -1.0, z: 1.0, front: true },
    { x: 1.0, z: -1.0, front: false },
    { x: -1.0, z: -1.0, front: false },
  ];
  armPos.forEach((ap, idx) => {
    // 机臂
    const arm = new THREE.Mesh(
      new THREE.BoxGeometry(0.9, 0.1, 0.16),
      new THREE.MeshPhongMaterial({ color: 0x707070 })
    );
    arm.position.set(ap.x * 0.55, 0, ap.z * 0.55);
    arm.rotation.y = Math.atan2(ap.x, ap.z); g.add(arm);
    // 电机
    const motor = new THREE.Mesh(
      new THREE.CylinderGeometry(0.14, 0.16, 0.18, 10),
      new THREE.MeshPhongMaterial({ color: 0x3a3a3a })
    );
    motor.position.set(ap.x, 0.06, ap.z); g.add(motor);

    // 四叶桨（4 个独立桨叶，呈 90° 分布，明显可见为四叶）
    const propGroup = new THREE.Group();
    propGroup.position.set(ap.x, 0.18, ap.z);
    const bladeMat = new THREE.MeshPhongMaterial({ color: 0x2a2a2a, transparent: true, opacity: 0.85 });
    for (let b = 0; b < 4; b++) {
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.02, 0.14), bladeMat);
      // 桨叶从中心向外伸出
      blade.position.x = 0.33;
      const bladePivot = new THREE.Group();
      bladePivot.rotation.y = b * Math.PI / 2;
      bladePivot.add(blade);
      propGroup.add(bladePivot);
    }
    g.add(propGroup); propellers.push(propGroup);

    // 涵道保护圈（cinewhoop 特征）
    const duct = new THREE.Mesh(
      new THREE.TorusGeometry(0.66, 0.05, 6, 20),
      new THREE.MeshPhongMaterial({ color: 0x606060 })
    );
    duct.rotation.x = Math.PI / 2;
    duct.position.set(ap.x, 0.18, ap.z); g.add(duct);

    // 高速旋转模糊盘
    const blurDisk = new THREE.Mesh(
      new THREE.CircleGeometry(0.6, 32),
      new THREE.MeshBasicMaterial({ color: 0x777777, transparent: true, opacity: 0, side: THREE.DoubleSide })
    );
    blurDisk.rotation.x = -Math.PI / 2; blurDisk.position.set(ap.x, 0.19, ap.z);
    g.add(blurDisk); propBlurs.push(blurDisk);
    const blurRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.66, 0.05, 6, 20),
      new THREE.MeshPhongMaterial({ color: 0x606060 })
    );
    blurRing.rotation.x = Math.PI / 2; blurRing.position.set(ap.x, 0.2, ap.z);
    blurRing.visible = false; g.add(blurRing); propBlurs.push(blurRing);

    // LED 指示灯（前绿后红）
    const led = new THREE.Mesh(
      new THREE.SphereGeometry(0.05, 4, 4),
      new THREE.MeshBasicMaterial({ color: ap.front ? 0x00ff00 : 0xff0000 })
    );
    led.position.set(ap.x, -0.12, ap.z); g.add(led);
  });
}
