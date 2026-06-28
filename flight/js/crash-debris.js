// Crash Debris System - 炸机碎片掉落效果
import * as THREE from 'three';
import { scene } from './engine.js';
import { state } from './config.js';
import { getTerrainHeight } from './terrain.js';

const DEBRIS_LIFETIME = 4;   // 秒后开始淡出
const DEBRIS_FADE_TIME = 1;  // 淡出持续时间
const GRAVITY = 15;          // 碎片重力 (比主炸机稍轻)
const BOUNCE_RESTITUTION = 0.2;
const MAX_BOUNCES = 2;

let activeDebris = [];

// === 导出函数 ===

export function spawnDebris(impactSpeed, dronePos, droneYaw, accentColor, droneIdx) {
  const severity = impactSpeed < 8 ? 'light' : impactSpeed < 15 ? 'medium' : 'heavy';
  const isAvata = droneIdx === 3;

  // 无人机螺旋桨位置 (非全景 vs 全景)
  const propPositions = isAvata
    ? [{ x: 1.0, z: 1.0 }, { x: -1.0, z: 1.0 }, { x: 1.0, z: -1.0 }, { x: -1.0, z: -1.0 }]
    : [{ x: 1.2, z: 1.2 }, { x: -1.2, z: 1.2 }, { x: 1.2, z: -1.2 }, { x: -1.2, z: -1.2 }];

  const propY = isAvata ? 0.18 : 0.25;
  const baseVel = new THREE.Vector3(state.droneVel.x * 0.5, 2, state.droneVel.z * 0.5);

  // === 轻度炸机：1-2 个桨叶碎片 ===
  if (severity === 'light') {
    const num = 1 + Math.floor(Math.random() * 2);
    for (let i = 0; i < num; i++) {
      const pIdx = Math.floor(Math.random() * 4);
      const pp = propPositions[pIdx];
      const worldPos = localToWorld(pp.x, propY, pp.z, dronePos, droneYaw);
      const vel = baseVel.clone().add(randomKick(3, 2, 3));
      addDebris(createBladeMesh(isAvata), worldPos, vel, 'blade');
    }
  }

  // === 中度炸机：全部桨叶 + 外壳碎片 ===
  if (severity === 'medium') {
    for (let i = 0; i < 4; i++) {
      const pp = propPositions[i];
      const worldPos = localToWorld(pp.x, propY, pp.z, dronePos, droneYaw);
      const vel = baseVel.clone().add(randomKick(5, 3, 5));
      addDebris(createBladeMesh(isAvata), worldPos, vel, 'blade');
    }
    const shellCount = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < shellCount; i++) {
      const worldPos = localToWorld((Math.random() - 0.5) * 0.8, 0.22, (Math.random() - 0.5) * 0.6, dronePos, droneYaw);
      const vel = baseVel.clone().add(randomKick(4, 2, 4));
      addDebris(createShellFragmentMesh(accentColor), worldPos, vel, 'shell');
    }
  }

  // === 重度炸机：全部零件脱落 ===
  if (severity === 'heavy') {
    // 4个桨叶
    for (let i = 0; i < 4; i++) {
      const pp = propPositions[i];
      const worldPos = localToWorld(pp.x, propY, pp.z, dronePos, droneYaw);
      const vel = baseVel.clone().add(randomKick(8, 5, 8));
      addDebris(createBladeMesh(isAvata), worldPos, vel, 'blade');
    }

    // 4个机臂
    const armScale = isAvata ? 0.55 : 0.5;
    const armXZ = isAvata ? 1.0 : 1.2;
    for (let i = 0; i < 4; i++) {
      const signX = (i % 2 === 0) ? 1 : -1;
      const signZ = (i < 2) ? 1 : -1;
      const worldPos = localToWorld(signX * armXZ * armScale, 0, signZ * armXZ * armScale, dronePos, droneYaw);
      const vel = baseVel.clone().add(randomKick(6, 4, 6));
      addDebris(createArmMesh(isAvata), worldPos, vel, 'arm');
    }

    // 镜头脱落
    const lensLocalZ = isAvata ? 0.92 : 0.5;
    const lensLocalY = isAvata ? 0.05 : -0.25;
    const lensWorldPos = localToWorld(0, lensLocalY, lensLocalZ, dronePos, droneYaw);
    addDebris(createLensMesh(isAvata), lensWorldPos, baseVel.clone().add(randomKick(3, 2, 3)), 'lens');

    // 设置镜头脱落标志 (FPV晃动)
    state.cameraDetached = true;
    state.cameraWobbleDir = Math.random() > 0.5 ? 1 : -1;
    state.cameraWobblePhase = 0;
    state.cameraWobbleDecay = 0.8;

    // 外壳碎片
    const shellCount = 4 + Math.floor(Math.random() * 3);
    for (let i = 0; i < shellCount; i++) {
      const worldPos = localToWorld((Math.random() - 0.5) * 0.8, 0.22, (Math.random() - 0.5) * 0.6, dronePos, droneYaw);
      const vel = baseVel.clone().add(randomKick(6, 3, 6));
      addDebris(createShellFragmentMesh(accentColor), worldPos, vel, 'shell');
    }

    // 芯片 (绿色小矩形)
    const chipCount = 3 + Math.floor(Math.random() * 3);
    for (let i = 0; i < chipCount; i++) {
      const worldPos = localToWorld((Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 0.15, (Math.random() - 0.5) * 0.4, dronePos, droneYaw);
      const vel = baseVel.clone().add(randomKick(4, 2, 4));
      addDebris(createChipMesh(), worldPos, vel, 'chip');
    }

    // 电路管 (细圆柱)
    const tubeCount = 2 + Math.floor(Math.random() * 2);
    for (let i = 0; i < tubeCount; i++) {
      const worldPos = localToWorld((Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * 0.1, (Math.random() - 0.5) * 0.3, dronePos, droneYaw);
      const vel = baseVel.clone().add(randomKick(3, 2, 3));
      addDebris(createTubeMesh(), worldPos, vel, 'tube');
    }
  }
}

export function detachDroneParts(droneGroup, propellers, propBlurs, severity, droneIdx) {
  if (!droneGroup) return;

  const toRemove = [];

  droneGroup.traverse(child => {
    if (!child.name) return;

    if (severity === 'light') {
      // 隐藏1-2个桨叶组
      if (child.name.startsWith('blurDisk_')) {
        const idx = parseInt(child.name.split('_')[1]);
        if (idx < 1 + Math.floor(Math.random() * 2)) {
          child.visible = false;
        }
      }
    }

    if (severity === 'medium') {
      // 隐藏桨叶组 + 顶壳
      if (child.name === 'shell' || child.name.startsWith('blurDisk_')) {
        child.visible = false;
      }
    }

    if (severity === 'heavy') {
      // 移除机臂、电机、桨叶、镜头、外壳、DJI标志、LED
      if (child.name.startsWith('arm_') ||
          child.name.startsWith('motor_') ||
          child.name.startsWith('blurDisk_') ||
          child.name.startsWith('blurRing_') ||
          child.name.startsWith('led_') ||
          child.name === 'shell' ||
          child.name === 'gimbal' ||
          child.name === 'lens' ||
          child.name === 'djiLabel' ||
          child.name.startsWith('fisheye_') ||
          child.name.startsWith('duct_')) {
        toRemove.push(child);
      }
    }
  });

  // 隐藏桨叶组 (medium和heavy)
  if (severity === 'medium' || severity === 'heavy') {
    propellers.forEach(p => { p.visible = false; });
  }
  if (severity === 'light') {
    const hideCount = 1 + Math.floor(Math.random() * 2);
    for (let i = 0; i < hideCount && i < propellers.length; i++) {
      propellers[i].visible = false;
    }
  }

  // 执行移除
  toRemove.forEach(child => {
    if (child.parent) child.parent.remove(child);
    if (child.geometry) child.geometry.dispose();
    if (child.material) {
      if (Array.isArray(child.material)) child.material.forEach(m => m.dispose());
      else child.material.dispose();
    }
  });
}

export function updateDebris(dt) {
  // 更新 FPV 镜头晃动状态
  if (state.cameraDetached) {
    state.cameraWobblePhase += dt * 5;
    state.cameraWobbleDecay *= (1 - dt * 0.5);
    if (state.cameraWobbleDecay < 0.01) {
      state.cameraWobbleDecay = 0;
    }
  }

  if (activeDebris.length === 0) return;

  for (let i = activeDebris.length - 1; i >= 0; i--) {
    const d = activeDebris[i];
    d.age += dt;

    // 重力
    d.velocity.y -= GRAVITY * dt;

    // 水平阻力
    d.velocity.x *= 0.99;
    d.velocity.z *= 0.99;

    // 更新位置
    d.mesh.position.add(d.velocity.clone().multiplyScalar(dt));

    // 翻滚旋转
    d.mesh.rotation.x += d.angVel.x * dt;
    d.mesh.rotation.y += d.angVel.y * dt;
    d.mesh.rotation.z += d.angVel.z * dt;

    // 地面碰撞
    const groundH = getTerrainHeight(d.mesh.position.x, d.mesh.position.z) + 0.5;
    if (d.mesh.position.y <= groundH) {
      d.mesh.position.y = groundH;
      d.bounceCount++;
      if (d.bounceCount >= MAX_BOUNCES) {
        d.velocity.y = 0;
        d.velocity.x *= 0.5;
        d.velocity.z *= 0.5;
        d.angVel.multiplyScalar(0.2);
      } else {
        d.velocity.y = -d.velocity.y * BOUNCE_RESTITUTION;
        d.angVel.multiplyScalar(0.5);
      }
    }

    // 淡出
    if (d.age > DEBRIS_LIFETIME) {
      const fadeProgress = (d.age - DEBRIS_LIFETIME) / DEBRIS_FADE_TIME;
      const opacity = Math.max(0, 1 - fadeProgress);
      if (d.mesh.material && d.mesh.material.opacity !== undefined) {
        d.mesh.material.opacity = opacity * d.baseOpacity;
        d.mesh.material.transparent = true;
      }
      if (opacity <= 0) {
        scene.remove(d.mesh);
        if (d.mesh.geometry) d.mesh.geometry.dispose();
        if (d.mesh.material) {
          if (Array.isArray(d.mesh.material)) d.mesh.material.forEach(m => m.dispose());
          else d.mesh.material.dispose();
        }
        activeDebris.splice(i, 1);
        continue;
      }
    }
  }
}

export function cleanupAllDebris() {
  for (const d of activeDebris) {
    scene.remove(d.mesh);
    if (d.mesh.geometry) d.mesh.geometry.dispose();
    if (d.mesh.material) {
      if (Array.isArray(d.mesh.material)) d.mesh.material.forEach(m => m.dispose());
      else d.mesh.material.dispose();
    }
  }
  activeDebris = [];

  // 重置镜头晃动状态
  state.cameraDetached = false;
  state.cameraWobbleDir = 0;
  state.cameraWobblePhase = 0;
  state.cameraWobbleDecay = 0;
}

export function isCameraDetached() {
  return state.cameraDetached;
}

// === 内部辅助函数 ===

function localToWorld(lx, ly, lz, dronePos, droneYaw) {
  const offset = new THREE.Vector3(lx, ly, lz);
  offset.applyAxisAngle(new THREE.Vector3(0, 1, 0), droneYaw);
  return dronePos.clone().add(offset);
}

function randomKick(maxHoriz, maxUp, maxHorizZ) {
  return new THREE.Vector3(
    (Math.random() - 0.5) * maxHoriz * 2,
    Math.random() * maxUp,
    (Math.random() - 0.5) * maxHorizZ * 2
  );
}

function addDebris(mesh, position, velocity, type) {
  mesh.position.copy(position);
  scene.add(mesh);
  activeDebris.push({
    mesh,
    velocity: velocity.clone(),
    angVel: new THREE.Vector3(
      (Math.random() - 0.5) * 10,
      (Math.random() - 0.5) * 10,
      (Math.random() - 0.5) * 10
    ),
    age: 0,
    bounceCount: 0,
    type,
    baseOpacity: mesh.material.opacity !== undefined ? mesh.material.opacity : 1,
  });
}

// === 碎片网格创建 ===

function createBladeMesh(isAvata) {
  const size = isAvata ? 0.62 : 2.2;
  return new THREE.Mesh(
    new THREE.BoxGeometry(size, 0.02, 0.1),
    new THREE.MeshPhongMaterial({ color: 0x444444, transparent: true, opacity: 0.85 })
  );
}

function createArmMesh(isAvata) {
  const w = isAvata ? 0.9 : 1.4;
  return new THREE.Mesh(
    new THREE.BoxGeometry(w, 0.08, 0.12),
    new THREE.MeshPhongMaterial({ color: isAvata ? 0x707070 : 0x2a2a2a, transparent: true, opacity: 1 })
  );
}

function createShellFragmentMesh(accentColor) {
  const sx = 0.1 + Math.random() * 0.2;
  const sy = 0.02 + Math.random() * 0.03;
  const sz = 0.1 + Math.random() * 0.15;
  return new THREE.Mesh(
    new THREE.BoxGeometry(sx, sy, sz),
    new THREE.MeshPhongMaterial({ color: accentColor, transparent: true, opacity: 1 })
  );
}

function createLensMesh(isAvata) {
  if (isAvata) {
    return new THREE.Mesh(
      new THREE.SphereGeometry(0.18, 12, 12),
      new THREE.MeshPhongMaterial({ color: 0x1133bb, shininess: 220, specular: 0xffffff, transparent: true, opacity: 1 })
    );
  }
  return new THREE.Mesh(
    new THREE.CylinderGeometry(0.08, 0.1, 0.1, 8),
    new THREE.MeshPhongMaterial({ color: 0x2244aa, shininess: 200, transparent: true, opacity: 1 })
  );
}

function createChipMesh() {
  return new THREE.Mesh(
    new THREE.BoxGeometry(0.15, 0.02, 0.1),
    new THREE.MeshPhongMaterial({ color: 0x22cc44, transparent: true, opacity: 1 })
  );
}

function createTubeMesh() {
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(0.02, 0.02, 0.3, 6),
    new THREE.MeshPhongMaterial({ color: 0x228833, transparent: true, opacity: 1 })
  );
  mesh.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
  return mesh;
}
