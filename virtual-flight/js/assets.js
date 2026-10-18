// GLB 模型加载、归一化、附加细节与程序化回退
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { AIRCRAFT } from './config.js';

const MODEL_FILES = {
  c172: 'assets/models/c172.glb',
  airplane: 'assets/models/airplane.glb',
  ship: 'assets/models/ship.glb',
  f35: 'assets/models/f35.glb',
  su57: 'assets/models/su57.glb',
  su35: 'assets/models/su35.glb'
};

const rawCache = new Map();
const loader = new GLTFLoader();
let shipModel = null;

export async function preloadModels(onProgress = () => {}) {
  const entries = Object.entries(MODEL_FILES);
  let done = 0;
  await Promise.all(entries.map(async ([name, url]) => {
    try {
      const gltf = await loader.loadAsync(url);
      rawCache.set(name, gltf.scene);
    } catch (err) {
      console.warn('[virtual-flight] model load failed:', name, err?.message || err);
      rawCache.set(name, null);
    } finally {
      done++;
      onProgress(done / entries.length, name);
    }
  }));
  shipModel = rawCache.get('ship') || null;
}

export function hasModel(name) {
  return !!rawCache.get(name);
}

function cloneMaterials(root) {
  root.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
      if (Array.isArray(o.material)) {
        o.material = o.material.map((m) => m.clone());
      } else if (o.material) {
        o.material = o.material.clone();
      }
    }
  });
}

function darkenMaterials(root, factor = 0.6, metalness = 0.45) {
  root.traverse((o) => {
    if (!o.isMesh) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) {
      if (!m) continue;
      if (m.color) m.color.multiplyScalar(factor);
      if ('metalness' in m) m.metalness = metalness;
      if ('roughness' in m) m.roughness = 0.42;
      m.needsUpdate = true;
    }
  });
}

function starTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, 128, 128);
  ctx.fillStyle = '#c8281e';
  ctx.beginPath();
  ctx.arc(64, 64, 52, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffd84a';
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? 40 : 17;
    const a = -Math.PI / 2 + i * Math.PI / 5;
    const x = 64 + Math.cos(a) * r;
    const y = 64 + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

let sharedStarTex = null;

function addStarDecal(parent, x, y, z, size, rotateY = 0) {
  if (!sharedStarTex) sharedStarTex = starTexture();
  const mat = new THREE.MeshBasicMaterial({
    map: sharedStarTex, transparent: true, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -2
  });
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(size, size), mat);
  plane.rotation.x = -Math.PI / 2;
  plane.rotation.z = rotateY;
  plane.position.set(x, y, z);
  parent.add(plane);
  return plane;
}

export function makeMissile() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(0.11, 0.11, 1.5, 10),
    new THREE.MeshStandardMaterial({ color: '#e8e8e8', roughness: 0.5, metalness: 0.35 })
  );
  body.rotation.x = Math.PI / 2;
  g.add(body);
  const nose = new THREE.Mesh(
    new THREE.ConeGeometry(0.11, 0.32, 10),
    new THREE.MeshStandardMaterial({ color: '#d9d9d9', roughness: 0.4, metalness: 0.5 })
  );
  nose.rotation.x = -Math.PI / 2;
  nose.position.z = -0.91;
  g.add(nose);
  const finMat = new THREE.MeshStandardMaterial({ color: '#b9bcc0', roughness: 0.7 });
  for (let i = 0; i < 4; i++) {
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.03, 0.38), finMat);
    fin.position.z = 0.55;
    fin.rotation.z = (i * Math.PI) / 2;
    g.add(fin);
  }
  return g;
}

function addFighterExtras(holder, spec) {
  const L = spec.targetLength;
  const userData = holder.userData;

  // 翼下挂弹：左右各 2 枚
  if (spec.missiles > 0) {
    const mounts = [];
    const missileGroup = new THREE.Group();
    missileGroup.name = 'missiles';
    const xs = [-L * 0.19, L * 0.19];
    const zs = [-L * 0.02, L * 0.10];
    for (const x of xs) {
      for (const z of zs) {
        const m = makeMissile();
        m.position.set(x, -0.72, z);
        m.scale.setScalar(0.9);
        missileGroup.add(m);
        mounts.push(new THREE.Vector3(x, -0.72, z));
      }
    }
    holder.add(missileGroup);
    userData.missileGroup = missileGroup;
    userData.missileMounts = mounts;
  }

  // 水平尾翼/升降舵（随俯仰动作）
  const elevatorMat = new THREE.MeshStandardMaterial({ color: '#7d848a', roughness: 0.62, metalness: 0.35 });
  const elevators = [];
  for (const s of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(s * L * 0.145, 0.28, L * 0.37);
    const surf = new THREE.Mesh(new THREE.BoxGeometry(L * 0.13, 0.06, L * 0.1), elevatorMat);
    surf.position.x = s * L * 0.055;
    pivot.add(surf);
    holder.add(pivot);
    elevators.push(pivot);
  }
  userData.elevators = elevators;

  // 尾焰
  const flameMat = new THREE.MeshBasicMaterial({
    color: '#ff9a3c', transparent: true, opacity: 0.0,
    blending: THREE.AdditiveBlending, depthWrite: false
  });
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.35, 2.4, 12), flameMat);
  flame.rotation.x = -Math.PI / 2;
  flame.position.set(0, 0, L * 0.51);
  holder.add(flame);
  userData.afterburner = flame;

  if (spec.id === 'f35b') addF35BExtras(holder, spec);
  if (spec.id === 'j20') {
    if (holder.userData.modelRoot) darkenMaterials(holder.userData.modelRoot, 0.62, 0.5);
    const canardMat = new THREE.MeshStandardMaterial({ color: '#4b5055', roughness: 0.5, metalness: 0.45 });
    for (const s of [-1, 1]) {
      const c = new THREE.Mesh(new THREE.BoxGeometry(L * 0.12, 0.06, L * 0.075), canardMat);
      c.position.set(s * L * 0.16, 0.1, -L * 0.26);
      c.rotation.z = s * 0.09;
      holder.add(c);
    }
    addStarDecal(holder, -L * 0.21, 0.52, L * 0.1, L * 0.075);
    addStarDecal(holder, L * 0.21, 0.52, L * 0.1, L * 0.075);
  }
  if (spec.id === 'j16') {
    addStarDecal(holder, -L * 0.2, 0.48, L * 0.08, L * 0.07);
    addStarDecal(holder, L * 0.2, 0.48, L * 0.08, L * 0.07);
  }
}

function addF35BExtras(holder, spec) {
  const L = spec.targetLength;
  const ud = holder.userData;

  // 顶部锯齿升力风扇
  const fan = new THREE.Group();
  fan.position.set(0, spec.halfHeight * 0.72, -L * 0.12);
  const well = new THREE.Mesh(
    new THREE.CylinderGeometry(1.55, 1.55, 0.16, 40),
    new THREE.MeshStandardMaterial({ color: '#2b2f33', roughness: 0.75, metalness: 0.4 })
  );
  fan.add(well);
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(1.62, 0.16, 5, 36),
    new THREE.MeshStandardMaterial({ color: '#4f565c', roughness: 0.5, metalness: 0.6 })
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.1;
  fan.add(ring);
  // 锯齿
  const toothMat = new THREE.MeshStandardMaterial({ color: '#3c4247', roughness: 0.6, metalness: 0.5 });
  for (let i = 0; i < 30; i++) {
    const a = (i / 30) * Math.PI * 2;
    const tooth = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.3, 3), toothMat);
    tooth.position.set(Math.cos(a) * 1.72, 0.12, Math.sin(a) * 1.72);
    tooth.rotation.z = Math.PI / 2;
    tooth.rotation.y = -a;
    fan.add(tooth);
  }
  const blades = new THREE.Group();
  const bladeMat = new THREE.MeshStandardMaterial({ color: '#7d858c', roughness: 0.4, metalness: 0.7 });
  for (let i = 0; i < 9; i++) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(1.32, 0.035, 0.2), bladeMat);
    b.position.x = 0.68;
    const arm = new THREE.Group();
    arm.rotation.y = (i / 9) * Math.PI * 2;
    arm.add(b);
    blades.add(arm);
  }
  blades.position.y = 0.06;
  fan.add(blades);
  holder.add(fan);
  ud.liftFan = fan;
  ud.liftFanBlades = blades;

  // 尾喷管（可向下旋转）
  const pivot = new THREE.Group();
  pivot.position.set(0, 0, L * 0.46);
  const nozzle = new THREE.Mesh(
    new THREE.CylinderGeometry(0.55, 0.62, 1.7, 20),
    new THREE.MeshStandardMaterial({ color: '#454b50', roughness: 0.4, metalness: 0.75 })
  );
  nozzle.rotation.x = Math.PI / 2;
  nozzle.position.z = 0.85;
  pivot.add(nozzle);
  const nozzleRing = new THREE.Mesh(
    new THREE.TorusGeometry(0.56, 0.09, 8, 20),
    new THREE.MeshStandardMaterial({ color: '#2f3438', roughness: 0.5, metalness: 0.8 })
  );
  nozzleRing.position.z = 1.72;
  pivot.add(nozzleRing);
  holder.add(pivot);
  ud.nozzlePivot = pivot;
  ud.nozzleAngle = 0;

  // 机翼升力风扇
  const wingFans = [];
  for (const s of [-1, 1]) {
    const wf = new THREE.Group();
    wf.position.set(s * L * 0.16, -0.25, L * 0.02);
    const disc = new THREE.Mesh(
      new THREE.CylinderGeometry(0.62, 0.62, 0.08, 22),
      new THREE.MeshStandardMaterial({ color: '#30353a', roughness: 0.7 })
    );
    wf.add(disc);
    const spin = new THREE.Group();
    for (let i = 0; i < 5; i++) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.025, 0.1),
        new THREE.MeshStandardMaterial({ color: '#8b9299', roughness: 0.4, metalness: 0.6 }));
      b.position.x = 0.28;
      const arm = new THREE.Group();
      arm.rotation.y = (i / 5) * Math.PI * 2;
      arm.add(b);
      spin.add(arm);
    }
    wf.add(spin);
    holder.add(wf);
    wingFans.push(spin);
  }
  ud.wingFans = wingFans;

  // 升力模式提示灯
  const glow = new THREE.Mesh(
    new THREE.TorusGeometry(1.5, 0.06, 6, 40),
    new THREE.MeshBasicMaterial({ color: '#5fe7ff', transparent: true, opacity: 0 })
  );
  glow.rotation.x = Math.PI / 2;
  glow.position.copy(fan.position);
  holder.add(glow);
  ud.vtolGlow = glow;
}

function addPropeller(holder, spec) {
  const L = spec.targetLength;
  const prop = new THREE.Group();
  prop.position.set(0, 0, -L * 0.5 + 0.15);
  const bladeMat = new THREE.MeshStandardMaterial({ color: '#2c2f33', roughness: 0.65, metalness: 0.3 });
  for (let i = 0; i < 3; i++) {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.13, 2.1, 0.06), bladeMat);
    blade.position.y = 1.0;
    const arm = new THREE.Group();
    arm.rotation.z = (i / 3) * Math.PI * 2;
    arm.add(blade);
    prop.add(arm);
  }
  const spinner = new THREE.Mesh(
    new THREE.ConeGeometry(0.24, 0.6, 12),
    new THREE.MeshStandardMaterial({ color: '#d8d8d8', roughness: 0.35, metalness: 0.7 })
  );
  spinner.rotation.x = -Math.PI / 2;
  spinner.position.z = -0.2;
  prop.add(spinner);
  holder.add(prop);
  holder.userData.propeller = prop;
}

export function createAircraftInstance(spec) {
  const raw = rawCache.get(spec.model);
  if (!raw) return makeFallbackAircraft(spec);

  const root = raw.clone(true);
  cloneMaterials(root);
  const holder = new THREE.Group();
  holder.add(root);
  holder.name = 'aircraft-' + spec.id;
  holder.userData.modelRoot = root;

  root.rotation.y = spec.rotY;
  root.updateMatrixWorld(true);
  let box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3());
  const scale = spec.targetLength / Math.max(size.z, 0.001);
  root.scale.multiplyScalar(scale);
  root.updateMatrixWorld(true);
  box.setFromObject(root);
  const center = box.getCenter(new THREE.Vector3());
  root.position.sub(center);
  root.updateMatrixWorld(true);
  box.setFromObject(root);
  holder.userData.halfHeight = (box.max.y - box.min.y) * 0.5;
  holder.userData.length = spec.targetLength;

  if (spec.category === 'prop') addPropeller(holder, spec);
  if (spec.category === 'fighter') addFighterExtras(holder, spec);
  holder.userData.spec = spec;
  return holder;
}

export function buildShipInstance(targetLength = 120) {
  if (!shipModel) return makeFallbackShip(targetLength);
  const root = shipModel.clone(true);
  cloneMaterials(root);
  const holder = new THREE.Group();
  holder.add(root);
  root.rotation.y = -Math.PI / 2;
  root.updateMatrixWorld(true);
  let box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3());
  const scale = targetLength / Math.max(size.x, size.y, size.z);
  root.scale.multiplyScalar(scale);
  root.updateMatrixWorld(true);
  box.setFromObject(root);
  const center = box.getCenter(new THREE.Vector3());
  root.position.sub(center);
  root.updateMatrixWorld(true);
  box.setFromObject(root);
  holder.userData.halfHeight = (box.max.y - box.min.y) * 0.5;
  holder.userData.length = box.max.z - box.min.z;
  return holder;
}

// ---------- 程序化回退模型 ----------

function makeFallbackAircraft(spec) {
  const holder = new THREE.Group();
  holder.name = 'fallback-' + spec.id;
  holder.userData.fallback = true;
  const L = spec.targetLength;
  const mat = new THREE.MeshStandardMaterial({ color: spec.color || '#8aa0b0', roughness: 0.55, metalness: 0.3 });
  const dark = new THREE.MeshStandardMaterial({ color: '#3e474e', roughness: 0.6, metalness: 0.4 });
  const glass = new THREE.MeshStandardMaterial({ color: '#203a4a', roughness: 0.1, metalness: 0.2, transparent: true, opacity: 0.7 });

  const fuselage = new THREE.Mesh(new THREE.CylinderGeometry(L * 0.055, L * 0.085, L * 0.9, 12), mat);
  fuselage.rotation.x = Math.PI / 2;
  holder.add(fuselage);

  const nose = new THREE.Mesh(new THREE.ConeGeometry(L * 0.06, L * 0.18, 12), mat);
  nose.rotation.x = -Math.PI / 2;
  nose.position.z = -L * 0.54;
  holder.add(nose);

  if (spec.category === 'prop') {
    const wing = new THREE.Mesh(new THREE.BoxGeometry(L * 0.95, 0.12, L * 0.16), mat);
    wing.position.y = L * 0.06;
    holder.add(wing);
    addPropeller(holder, spec);
  } else if (spec.category === 'airliner') {
    const wing = new THREE.Mesh(new THREE.BoxGeometry(L * 0.9, 0.16, L * 0.2), mat);
    wing.position.y = -L * 0.02;
    holder.add(wing);
    for (const s of [-1, 1]) {
      const eng = new THREE.Mesh(new THREE.CylinderGeometry(L * 0.035, L * 0.035, L * 0.12, 12), dark);
      eng.rotation.x = Math.PI / 2;
      eng.position.set(s * L * 0.16, -L * 0.05, -L * 0.02);
      holder.add(eng);
    }
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.3, L * 0.15, L * 0.12), mat);
    fin.position.set(0, L * 0.1, L * 0.38);
    holder.add(fin);
  } else {
    // 三角翼 + 双垂尾
    const wing = new THREE.Mesh(new THREE.BoxGeometry(L * 0.75, 0.1, L * 0.3), mat);
    wing.position.set(0, 0, L * 0.03);
    holder.add(wing);
    const wing2 = new THREE.Mesh(new THREE.BoxGeometry(L * 0.46, 0.08, L * 0.18), mat);
    wing2.position.set(0, 0, L * 0.2);
    holder.add(wing2);
    for (const s of [-1, 1]) {
      const fin = new THREE.Mesh(new THREE.BoxGeometry(0.08, L * 0.16, L * 0.13), dark);
      fin.position.set(s * L * 0.1, L * 0.08, L * 0.36);
      fin.rotation.z = s * 0.18;
      holder.add(fin);
    }
    const canopy = new THREE.Mesh(new THREE.SphereGeometry(L * 0.05, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), glass);
    canopy.position.set(0, L * 0.045, -L * 0.18);
    canopy.scale.set(0.9, 0.7, 2.2);
    holder.add(canopy);
    addFighterExtras(holder, spec);
  }

  const tail = new THREE.Mesh(new THREE.BoxGeometry(L * 0.28, 0.07, L * 0.1), mat);
  tail.position.set(0, 0.03, L * 0.42);
  holder.add(tail);

  holder.userData.halfHeight = Math.max(1, L * 0.09);
  holder.userData.length = L;
  holder.userData.spec = spec;
  return holder;
}

function makeFallbackShip(targetLength) {
  const g = new THREE.Group();
  const hullMat = new THREE.MeshStandardMaterial({ color: '#5d6670', roughness: 0.7, metalness: 0.3 });
  const deckMat = new THREE.MeshStandardMaterial({ color: '#6e3f34', roughness: 0.8 });
  const hull = new THREE.Mesh(new THREE.BoxGeometry(targetLength * 0.18, targetLength * 0.05, targetLength), hullMat);
  g.add(hull);
  const deck = new THREE.Mesh(new THREE.BoxGeometry(targetLength * 0.2, 0.4, targetLength * 0.98), deckMat);
  deck.position.y = targetLength * 0.035;
  g.add(deck);
  const island = new THREE.Mesh(new THREE.BoxGeometry(targetLength * 0.06, targetLength * 0.08, targetLength * 0.16), hullMat);
  island.position.set(targetLength * 0.07, targetLength * 0.08, targetLength * 0.3);
  g.add(island);
  g.userData.halfHeight = targetLength * 0.06;
  g.userData.length = targetLength;
  return g;
}

export function createFallbackShip(targetLength) {
  return makeFallbackShip(targetLength);
}
