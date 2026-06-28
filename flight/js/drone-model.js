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
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.3, 1.0), new THREE.MeshPhongMaterial({ color: 0x1a1a1a, shininess: 80 }));
  body.name = 'body'; g.add(body);
  // Top accent shell (orange)
  const shell = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.15, 0.8), new THREE.MeshPhongMaterial({ color: accent, shininess: 100 }));
  shell.position.y = 0.22; shell.name = 'shell'; g.add(shell);

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
  djiLabel.position.set(0, 0.30, 0); djiLabel.name = 'djiLabel'; g.add(djiLabel);

  // Camera gimbal
  const gimbal = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 8), new THREE.MeshPhongMaterial({ color: 0x111111, shininess: 120 }));
  gimbal.position.set(0, -0.2, 0.4); gimbal.name = 'gimbal'; g.add(gimbal);
  // Camera lens
  const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.1, 8), new THREE.MeshPhongMaterial({ color: 0x2244aa, shininess: 200 }));
  lens.rotation.x = Math.PI / 2; lens.position.set(0, -0.25, 0.5); lens.name = 'lens'; g.add(lens);

  // Arms + motors + propellers (NO prop guards)
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

  const body = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.3, 1.0), new THREE.MeshPhongMaterial({ color: 0x1a1a1a, shininess: 80 }));
  body.name = 'body'; g.add(body);
  const shell = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.15, 0.8), new THREE.MeshPhongMaterial({ color: accent, shininess: 100 }));
  shell.position.y = 0.22; shell.name = 'shell'; g.add(shell);

  const gimbal = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 8), new THREE.MeshPhongMaterial({ color: 0x111111, shininess: 120 }));
  gimbal.position.set(0, -0.2, 0.4); gimbal.name = 'gimbal'; g.add(gimbal);
  const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.1, 8), new THREE.MeshPhongMaterial({ color: 0x2244aa, shininess: 200 }));
  lens.rotation.x = Math.PI / 2; lens.position.set(0, -0.25, 0.5); lens.name = 'lens'; g.add(lens);

  // Fisheye lenses: 2 front + 1 rear (dark/black dots)
  const fisheyeMat = new THREE.MeshPhongMaterial({ color: 0x0a0a0a, shininess: 250, specular: 0x333333 });
  const fl = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 8), fisheyeMat);
  fl.position.set(-0.35, -0.12, 0.45); fl.name = 'fisheye_frontL'; g.add(fl);
  const fr = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 8), fisheyeMat);
  fr.position.set(0.35, -0.12, 0.45); fr.name = 'fisheye_frontR'; g.add(fr);
  const rr = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 8), fisheyeMat);
  rr.position.set(0, -0.12, -0.45); rr.name = 'fisheye_rear'; g.add(rr);

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

  const body = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.3, 1.0), new THREE.MeshPhongMaterial({ color: 0x1a1a1a, shininess: 80 }));
  body.name = 'body'; g.add(body);
  const shell = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.15, 0.8), new THREE.MeshPhongMaterial({ color: accent, shininess: 100 }));
  shell.position.y = 0.22; shell.name = 'shell'; g.add(shell);

  // DJI text on the REAR of the drone
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
  djiLabel.position.set(0, 0.0, -0.51);
  djiLabel.rotation.y = Math.PI; djiLabel.name = 'djiLabel'; g.add(djiLabel);

  const gimbal = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 8), new THREE.MeshPhongMaterial({ color: 0x111111, shininess: 120 }));
  gimbal.position.set(0, -0.2, 0.4); gimbal.name = 'gimbal'; g.add(gimbal);
  const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.1, 8), new THREE.MeshPhongMaterial({ color: 0x2244aa, shininess: 200 }));
  lens.rotation.x = Math.PI / 2; lens.position.set(0, -0.25, 0.5); lens.name = 'lens'; g.add(lens);

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

  const lensHousing = new THREE.Mesh(
    new THREE.CylinderGeometry(0.22, 0.24, 0.3, 16),
    new THREE.MeshPhongMaterial({ color: 0x222222, shininess: 90 })
  );
  lensHousing.rotation.x = Math.PI / 2;
  lensHousing.position.set(0, 0.05, 0.78); lensHousing.name = 'gimbal'; g.add(lensHousing);
  const lensGlass = new THREE.Mesh(
    new THREE.SphereGeometry(0.18, 16, 16),
    new THREE.MeshPhongMaterial({ color: 0x1133bb, shininess: 220, specular: 0xffffff })
  );
  lensGlass.position.set(0, 0.05, 0.92); lensGlass.name = 'lens'; g.add(lensGlass);

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
