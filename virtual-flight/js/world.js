// 程序化世界：地形、跑道、树/草、河流、火山、航母、海面
import * as THREE from 'three';
import { MAPS, RUNWAY, CARRIER } from './config.js';

// ---------- 噪声 ----------
function hash2(x, y) {
  let n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
  return n - Math.floor(n);
}
function smooth(t) { return t * t * (3 - 2 * t); }
function noise2(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const a = hash2(xi, yi), b = hash2(xi + 1, yi);
  const c = hash2(xi, yi + 1), d = hash2(xi + 1, yi + 1);
  const u = smooth(xf), v = smooth(yf);
  return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
}
function fbm(x, y, oct = 4) {
  let v = 0, amp = 0.5, f = 1;
  for (let i = 0; i < oct; i++) {
    v += amp * noise2(x * f, y * f);
    f *= 2.03;
    amp *= 0.5;
  }
  return v;
}
function smoothstep(a, b, x) {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}
const riverX = (z) => 170 * Math.sin(z * 0.0016) + 70 * Math.sin(z * 0.0047 + 1.2);

function baseTerrain(x, z, mapId) {
  const scale = mapId === 'volcano' ? 0.0016 : 0.0013;
  let h = (fbm(x * scale + 10, z * scale - 4) - 0.35) * 72;
  h += (fbm(x * 0.006 + 2, z * 0.006 + 9) - 0.5) * 9;
  h = Math.max(-8, h);

  // 跑道周边整平
  const dx = Math.abs(x) / 150;
  const dz = Math.abs(z) / 330;
  const dRun = Math.max(dx, dz);
  const flat = smoothstep(1.0, 1.9, dRun);
  h *= flat;

  // 任务目标湖面
  const dLake = Math.hypot(x, z + 900);
  if (dLake < 150) {
    const k = smoothstep(150, 70, dLake);
    h = h * (1 - k) - 4.2 * k;
  }

  if (mapId === 'volcano') {
    const dVol = Math.hypot(x - 320, z + 1150);
    const cone = Math.max(0, 1 - dVol / 340);
    h += Math.pow(cone, 1.7) * 230;
    if (dVol < 55) h -= 45;
    h = Math.max(-8, h);
  }
  return h;
}

function islandHeight(x, z) {
  const islands = [
    { x: 780, z: -1250, r: 310, h: 85 },
    { x: -850, z: 420, r: 240, h: 55 },
    { x: 1200, z: 900, r: 200, h: 40 }
  ];
  let best = -2;
  for (const is of islands) {
    const d = Math.hypot(x - is.x, z - is.z);
    if (d < is.r) {
      const k = 1 - d / is.r;
      best = Math.max(best, Math.pow(k, 1.5) * is.h - 1);
    }
  }
  return best;
}

function isOnCarrier(x, z) {
  return Math.abs(x - CARRIER.x) < CARRIER.width * 0.5 && Math.abs(z - CARRIER.z) < CARRIER.length * 0.5;
}

export function surfaceInfo(mapId, x, z) {
  if (mapId === 'carrier') {
    if (isOnCarrier(x, z)) return { h: CARRIER.deckY, type: 'carrier', water: false };
    const ih = islandHeight(x, z);
    if (ih > 0.5) return { h: ih, type: 'island', water: false };
    return { h: 0, type: 'water', water: true };
  }
  const h = baseTerrain(x, z, mapId);
  const onLake = h < -1.2;
  return { h: Math.max(h, 0), water: onLake, rawHeight: h, type: onLake ? 'water' : 'land' };
}

// ---------- 通用工具 ----------
function makeInstanced(geo, mat, count, cast = true) {
  const mesh = new THREE.InstancedMesh(geo, mat, count);
  mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
  mesh.castShadow = cast;
  mesh.receiveShadow = true;
  return mesh;
}

function addStarField(scene) {
  const count = 900;
  const g = new THREE.BufferGeometry();
  const pos = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const r = 1800 + Math.random() * 900;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.random() * Math.PI * 0.48;
    pos[i * 3] = Math.cos(theta) * Math.cos(phi) * r;
    pos[i * 3 + 1] = Math.sin(phi) * r + 120;
    pos[i * 3 + 2] = Math.sin(theta) * Math.cos(phi) * r;
  }
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const m = new THREE.PointsMaterial({ color: 0xffffff, size: 2.2, transparent: true, opacity: 0.85, depthWrite: false });
  const stars = new THREE.Points(g, m);
  stars.name = 'stars';
  scene.add(stars);
  return stars;
}

function makeCloud(x, y, z, scale) {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1, transparent: true, opacity: 0.72, depthWrite: false });
  for (let i = 0; i < 5; i++) {
    const s = new THREE.Mesh(new THREE.SphereGeometry(6 + Math.random() * 7, 8, 6), mat);
    s.position.set((Math.random() - 0.5) * 24, (Math.random() - 0.5) * 4, (Math.random() - 0.5) * 12);
    s.scale.y = 0.55;
    g.add(s);
  }
  g.position.set(x, y, z);
  g.scale.setScalar(scale);
  return g;
}

function addRunway(group, mapId) {
  const rw = new THREE.Group();
  rw.position.y = RUNWAY.y;
  const base = new THREE.Mesh(
    new THREE.BoxGeometry(RUNWAY.width, 0.35, RUNWAY.length),
    new THREE.MeshStandardMaterial({ color: '#55595e', roughness: 0.92, metalness: 0.05 })
  );
  base.receiveShadow = true;
  rw.add(base);

  const yellow = new THREE.MeshStandardMaterial({ color: '#f4c531', roughness: 0.7, emissive: '#4c3a00', emissiveIntensity: 0.15 });
  // 中线（虚线）
  for (let z = -RUNWAY.length / 2 + 8; z < RUNWAY.length / 2; z += 22) {
    const dash = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.05, 11), yellow);
    dash.position.set(0, 0.2, z);
    rw.add(dash);
  }
  // 边线
  const white = new THREE.MeshStandardMaterial({ color: '#e8e8e8', roughness: 0.8 });
  for (const s of [-1, 1]) {
    const edge = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.05, RUNWAY.length - 8), white);
    edge.position.set(s * (RUNWAY.width / 2 - 2.2), 0.2, 0);
    rw.add(edge);
  }
  // 端头斑马线
  for (const s of [-1, 1]) {
    for (let i = -6; i <= 6; i++) {
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.05, 7), white);
      stripe.position.set(i * 2.1, 0.2, s * (RUNWAY.length / 2 - 7));
      rw.add(stripe);
    }
  }
  // 跑道灯
  const lightMat = new THREE.MeshBasicMaterial({ color: '#9fe8ff' });
  for (let z = -RUNWAY.length / 2 + 10; z < RUNWAY.length / 2; z += 30) {
    for (const s of [-1, 1]) {
      const l = new THREE.Mesh(new THREE.SphereGeometry(0.28, 6, 5), lightMat);
      l.position.set(s * (RUNWAY.width / 2 + 0.5), 0.5, z);
      rw.add(l);
    }
  }
  group.add(rw);

  // 停机坪 / 起飞站
  const apron = new THREE.Mesh(
    new THREE.BoxGeometry(120, 0.3, 100),
    new THREE.MeshStandardMaterial({ color: '#61666c', roughness: 0.95 })
  );
  apron.position.set(0, 0.02, 235);
  apron.receiveShadow = true;
  group.add(apron);
  const tower = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(10, 22, 10), new THREE.MeshStandardMaterial({ color: '#c9c6bd', roughness: 0.8 }));
  body.position.y = 11;
  tower.add(body);
  const cab = new THREE.Mesh(new THREE.BoxGeometry(14, 5, 14), new THREE.MeshStandardMaterial({ color: '#3d6170', roughness: 0.2, metalness: 0.4 }));
  cab.position.y = 24;
  tower.add(cab);
  tower.position.set(52, 0, 250);
  group.add(tower);
  return rw;
}

function addTrees(group, mapId, heightAt) {
  const N = mapId === 'volcano' ? 55 : 95;
  const trunkGeo = new THREE.CylinderGeometry(0.32, 0.5, 1, 6);
  trunkGeo.translate(0, 0.5, 0);
  const branchGeo = new THREE.CylinderGeometry(0.055, 0.13, 1, 5);
  branchGeo.translate(0, 0.5, 0);
  const leafGeo = new THREE.IcosahedronGeometry(1, 1);

  const trunkMat = new THREE.MeshStandardMaterial({ color: '#65452c', roughness: 1 });
  const branchMat = new THREE.MeshStandardMaterial({ color: '#5a3d27', roughness: 1 });
  const leafMat = new THREE.MeshStandardMaterial({ color: '#3f7d2e', roughness: 1 });

  const trunkMesh = makeInstanced(trunkGeo, trunkMat, N);
  const branchMesh = makeInstanced(branchGeo, branchMat, N * 5);
  const leafMesh = makeInstanced(leafGeo, leafMat, N * 4);
  let bi = 0, li = 0;
  const dummy = new THREE.Object3D();
  const placed = [];

  for (let i = 0; i < N; i++) {
    let x, z, tries = 0;
    do {
      x = (Math.random() - 0.5) * 1400;
      z = (Math.random() - 0.5) * 1600;
      tries++;
    } while (tries < 30 && (Math.abs(x) < 80 && Math.abs(z) < 340 || (mapId === 'carrier')));
    if (mapId === 'carrier') {
      // 航母地图的树放在岛上
      const islands = [[780, -1250], [-850, 420], [1200, 900]];
      const is = islands[i % 3];
      x = is[0] + (Math.random() - 0.5) * 240;
      z = is[1] + (Math.random() - 0.5) * 240;
    }
    const h = heightAt(x, z);
    if (h < 0.8) { i--; continue; }
    if (placed.some(p => Math.hypot(p.x - x, p.z - z) < 8)) { i--; continue; }
    placed.push({ x, z });
    const scale = 0.7 + Math.random() * 0.8;
    const trunkH = (3.4 + Math.random() * 2.4) * scale;

    dummy.position.set(x, h, z);
    dummy.rotation.set(0, Math.random() * Math.PI * 2, 0);
    dummy.scale.set(scale, trunkH, scale);
    dummy.updateMatrix();
    trunkMesh.setMatrixAt(i, dummy.matrix);

    const bare = Math.random() < 0.28;
    const branches = 3 + Math.floor(Math.random() * 3);
    for (let b = 0; b < branches + 1; b++) {
      if (bi >= N * 5) break;
      const ang = Math.random() * Math.PI * 2;
      const tilt = 0.55 + Math.random() * 0.65;
      const len = (1.1 + Math.random() * 1.6) * scale;
      const baseY = h + trunkH * (0.55 + Math.random() * 0.4);
      dummy.position.set(x, baseY, z);
      dummy.rotation.set(0, -ang, tilt);
      dummy.scale.set(scale, len, scale);
      dummy.updateMatrix();
      branchMesh.setMatrixAt(bi++, dummy.matrix);

      if (!bare && li < N * 4) {
        const ex = x + Math.sin(tilt) * Math.cos(ang) * len;
        const ez = z - Math.sin(tilt) * Math.sin(ang) * len;
        const ey = baseY + Math.cos(tilt) * len;
        dummy.position.set(ex, ey, ez);
        dummy.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
        const ls = (1.3 + Math.random() * 1.4) * scale;
        dummy.scale.set(ls, ls * 0.8, ls);
        dummy.updateMatrix();
        leafMesh.setMatrixAt(li, dummy.matrix);
        leafMesh.setColorAt(li, new THREE.Color().setHSL(0.27 + Math.random() * 0.06, 0.42, 0.26 + Math.random() * 0.14));
        li++;
      }
    }
  }
  trunkMesh.count = N;
  branchMesh.count = bi;
  leafMesh.count = li;
  if (leafMesh.instanceColor) leafMesh.instanceColor.needsUpdate = true;
  group.add(trunkMesh, branchMesh, leafMesh);
}

function addGrass(group, heightAt, mapId) {
  const count = mapId === 'carrier' ? 0 : 1200;
  if (!count) return;
  const geo = new THREE.ConeGeometry(0.13, 0.62, 4);
  geo.translate(0, 0.31, 0);
  const mat = new THREE.MeshStandardMaterial({ color: '#4f8a34', roughness: 1 });
  const mesh = makeInstanced(geo, mat, count, false);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < count; i++) {
    let x, z, h;
    let tries = 0;
    do {
      x = (Math.random() - 0.5) * 520;
      z = (Math.random() - 0.5) * 620;
      h = heightAt(x, z);
      tries++;
    } while (tries < 12 && (h < 0.4 || (Math.abs(x) < 26 && Math.abs(z) < 280)));
    dummy.position.set(x, h, z);
    dummy.rotation.set(0, Math.random() * Math.PI, (Math.random() - 0.5) * 0.2);
    dummy.scale.setScalar(0.6 + Math.random() * 1.2);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
    mesh.setColorAt(i, new THREE.Color().setHSL(0.25 + Math.random() * 0.08, 0.45, 0.24 + Math.random() * 0.16));
  }
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  group.add(mesh);
}

function addWater(group, mapId) {
  if (mapId === 'carrier') {
    const water = new THREE.Mesh(
      new THREE.PlaneGeometry(6000, 6000, 1, 1),
      new THREE.MeshStandardMaterial({ color: '#1d5f86', roughness: 0.22, metalness: 0.25, transparent: true, opacity: 0.94 })
    );
    water.rotation.x = -Math.PI / 2;
    water.position.y = 0;
    water.name = 'water';
    group.add(water);
    return water;
  }
  // 河流缎带
  const seg = 90;
  const verts = [];
  const idx = [];
  for (let i = 0; i <= seg; i++) {
    const z = -2100 + (4200 * i) / seg;
    const cx = riverX(z);
    const w = 42 + 12 * Math.sin(z * 0.003);
    verts.push(cx - w, -0.9, z, cx + w, -0.9, z);
    if (i < seg) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const rg = new THREE.BufferGeometry();
  rg.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  rg.setIndex(idx);
  rg.computeVertexNormals();
  const river = new THREE.Mesh(rg, new THREE.MeshStandardMaterial({
    color: '#2a7fa7', roughness: 0.2, metalness: 0.3, transparent: true, opacity: 0.88, side: THREE.DoubleSide
  }));
  river.name = 'water';
  group.add(river);

  // 任务湖
  const lake = new THREE.Mesh(
    new THREE.CircleGeometry(142, 40),
    new THREE.MeshStandardMaterial({ color: '#2a7fa7', roughness: 0.2, metalness: 0.3, transparent: true, opacity: 0.9 })
  );
  lake.rotation.x = -Math.PI / 2;
  lake.position.set(0, -1.1, -900);
  group.add(lake);
  return river;
}

function addVolcano(group) {
  const vg = new THREE.Group();
  const rock = new THREE.MeshStandardMaterial({ color: '#3b322f', roughness: 1 });
  const lava = new THREE.MeshStandardMaterial({ color: '#ff6a1a', emissive: '#ff4d00', emissiveIntensity: 1.5, roughness: 0.6 });
  const cone = new THREE.Mesh(new THREE.ConeGeometry(310, 220, 36, 1, true), rock);
  cone.position.set(320, 0, -1150);
  vg.add(cone);
  const crater = new THREE.Mesh(new THREE.CylinderGeometry(48, 60, 8, 24), lava);
  crater.position.set(320, 206, -1150);
  vg.add(crater);
  const glow = new THREE.PointLight('#ff5a10', 5, 900, 2);
  glow.position.set(320, 220, -1150);
  vg.add(glow);
  // 岩浆流
  for (const [sx, sz, len, rot] of [[300, 900, 480, 0.25], [355, 880, 400, -0.45]]) {
    const flow = new THREE.Mesh(new THREE.BoxGeometry(12, 0.8, len), lava);
    flow.position.set(sx, 3, -1150 + sz * 0.55);
    flow.rotation.y = rot;
    flow.rotation.x = -0.12;
    vg.add(flow);
  }
  vg.userData.lava = lava;
  vg.userData.glow = glow;
  group.add(vg);
  return vg;
}

function addCarrier(group, makeParkedAircraft) {
  const cg = new THREE.Group();
  cg.name = 'carrier';
  const hullMat = new THREE.MeshStandardMaterial({ color: '#4a5159', roughness: 0.8, metalness: 0.35 });
  const deckMat = new THREE.MeshStandardMaterial({ color: '#393d42', roughness: 0.92 });
  const lineMat = new THREE.MeshStandardMaterial({ color: '#e3c02e', roughness: 0.7, emissive: '#3f3300', emissiveIntensity: 0.2 });
  const whiteMat = new THREE.MeshStandardMaterial({ color: '#d9dde0', roughness: 0.8 });

  const hull = new THREE.Mesh(new THREE.BoxGeometry(CARRIER.width * 0.72, 12, CARRIER.length * 0.92), hullMat);
  hull.position.y = 6;
  cg.add(hull);

  // 舰艏
  const bow = new THREE.Mesh(new THREE.CylinderGeometry(CARRIER.width * 0.36, CARRIER.width * 0.12, 12, 4, 1, false, 0, Math.PI), hullMat);
  bow.rotation.x = Math.PI / 2;
  bow.rotation.y = Math.PI / 4;
  bow.position.set(0, 6, -CARRIER.length * 0.47);
  cg.add(bow);

  const deck = new THREE.Mesh(new THREE.BoxGeometry(CARRIER.width, 1.6, CARRIER.length), deckMat);
  deck.position.y = CARRIER.deckY - 0.8;
  deck.receiveShadow = true;
  cg.add(deck);

  // 甲板黄线
  for (let z = -CARRIER.length / 2 + 12; z < CARRIER.length / 2; z += 24) {
    const dash = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.06, 13), lineMat);
    dash.position.set(0, CARRIER.deckY + 0.04, z);
    cg.add(dash);
  }
  for (const s of [-1, 1]) {
    const edge = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.06, CARRIER.length - 10), whiteMat);
    edge.position.set(s * (CARRIER.width / 2 - 2), CARRIER.deckY + 0.04, 0);
    cg.add(edge);
  }
  // 舰岛
  const island = new THREE.Group();
  const isl1 = new THREE.Mesh(new THREE.BoxGeometry(13, 22, 36), hullMat);
  isl1.position.y = 11;
  island.add(isl1);
  const isl2 = new THREE.Mesh(new THREE.BoxGeometry(9, 10, 22), new THREE.MeshStandardMaterial({ color: '#6e777f', roughness: 0.7 }));
  isl2.position.set(0, 26, -4);
  island.add(isl2);
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.7, 30, 6), hullMat);
  mast.position.set(0, 45, -6);
  island.add(mast);
  island.position.set(CARRIER.width * 0.36, CARRIER.deckY, -30);
  cg.add(island);

  // 停放战机
  if (makeParkedAircraft) {
    const spots = [
      [-18, -110, 0.12], [-18, -70, 0.12], [18, -105, -0.1], [18, 85, 0.08], [-18, 78, 0.08]
    ];
    for (const [x, z, ry] of spots) {
      try {
        const m = makeParkedAircraft();
        if (!m) continue;
        m.position.set(x, CARRIER.deckY + 1.2, z);
        m.rotation.y = ry;
        m.scale.setScalar(0.82);
        cg.add(m);
      } catch (e) { /* ignore */ }
    }
  }
  // 拦阻网/升降机
  for (const z of [-CARRIER.length * 0.32, CARRIER.length * 0.3]) {
    const lift = new THREE.Mesh(new THREE.BoxGeometry(18, 0.5, 22), new THREE.MeshStandardMaterial({ color: '#555d64', roughness: 0.9 }));
    lift.position.set(CARRIER.width * 0.34, CARRIER.deckY + 0.1, z);
    cg.add(lift);
  }
  group.add(cg);
  return cg;
}

function addLaunchers(group) {
  const launchers = new THREE.Group();
  for (let i = 0; i < 5; i++) {
    const x = -120 + i * 55;
    const z = -620 - (i % 2) * 70;
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(6, 3, 11), new THREE.MeshStandardMaterial({ color: '#4b5442', roughness: 0.9 }));
    body.position.y = 1.8;
    g.add(body);
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(4.2, 2.4, 3.4), new THREE.MeshStandardMaterial({ color: '#333b30', roughness: 0.8 }));
    cabin.position.set(0, 3.6, -3);
    g.add(cabin);
    for (let k = 0; k < 4; k++) {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 10), new THREE.MeshStandardMaterial({ color: '#1c1e1c', roughness: 1 }));
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(k % 2 ? 3.2 : -3.2, 0.9, k < 2 ? -3.3 : 3.3);
      g.add(wheel);
    }
    const tubeMat = new THREE.MeshStandardMaterial({ color: '#6a7162', roughness: 0.7 });
    for (let k = 0; k < 3; k++) {
      const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 7, 8), tubeMat);
      tube.rotation.x = -0.5;
      tube.position.set(-1.4 + k * 1.4, 5.2, -1);
      g.add(tube);
    }
    g.position.set(x, 0, z);
    g.rotation.y = Math.random() * Math.PI;
    launchers.add(g);
  }
  group.add(launchers);
  return launchers;
}

function addPeopleAndRobots(group, heightAt) {
  const people = new THREE.Group();
  for (let i = 0; i < 16; i++) {
    const x = (Math.random() - 0.5) * 180;
    const z = 170 + Math.random() * 120;
    const y = heightAt(x, z);
    if (y < 0) continue;
    const g = new THREE.Group();
    const col = new THREE.Color().setHSL(Math.random(), 0.5, 0.5);
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.32, 0.9, 4, 8), new THREE.MeshStandardMaterial({ color: col, roughness: 0.9 }));
    body.position.y = 0.9;
    g.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 6), new THREE.MeshStandardMaterial({ color: '#e0b48b', roughness: 0.9 }));
    head.position.y = 1.7;
    g.add(head);
    g.position.set(x, y, z);
    g.rotation.y = Math.random() * Math.PI * 2;
    people.add(g);
  }
  for (let i = 0; i < 8; i++) {
    const x = -90 + i * 26;
    const z = 300 + (i % 2) * 24;
    const y = heightAt(x, z);
    if (y < 0) continue;
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: '#9aa3a8', roughness: 0.5, metalness: 0.4 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.5, 2.2, 1.1), mat);
    body.position.y = 1.5;
    g.add(body);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.8, 0.9), mat);
    head.position.y = 3;
    g.add(head);
    const eye = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, 0.05), new THREE.MeshBasicMaterial({ color: '#68e6ff' }));
    eye.position.set(0, 3.05, -0.48);
    g.add(eye);
    for (const s of [-1, 1]) {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.3, 1.7, 0.3), mat);
      arm.position.set(s * 1.0, 1.5, 0);
      arm.rotation.z = s * 0.15;
      g.add(arm);
    }
    g.position.set(x, y, z);
    g.rotation.y = Math.PI;
    people.add(g);
  }
  group.add(people);
  return people;
}

function addClouds(group) {
  const clouds = new THREE.Group();
  for (let i = 0; i < 14; i++) {
    const c = makeCloud((Math.random() - 0.5) * 2600, 140 + Math.random() * 160, (Math.random() - 0.5) * 2600, 1.5 + Math.random() * 2.4);
    clouds.add(c);
  }
  group.add(clouds);
  return clouds;
}

// ---------- 主入口 ----------
export function buildWorld(mapId, options = {}) {
  const group = new THREE.Group();
  group.name = 'world-' + mapId;
  const heightAt = (x, z) => (mapId === 'carrier' ? Math.max(0, islandHeight(x, z)) : baseTerrain(x, z, mapId));

  if (mapId !== 'carrier') {
    const size = 4600;
    const seg = 150;
    const geo = new THREE.PlaneGeometry(size, size, seg, seg);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const colors = [];
    const cLow = new THREE.Color(mapId === 'volcano' ? '#4a3b32' : '#4b8a36');
    const cMid = new THREE.Color(mapId === 'volcano' ? '#5b4a3c' : '#36702b');
    const cHigh = new THREE.Color(mapId === 'volcano' ? '#7a6a5a' : '#8a8f72');
    const cRock = new THREE.Color('#6f6c63');
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const h = heightAt(x, z);
      pos.setY(i, h);
      const t = Math.min(1, Math.max(0, (h + 4) / 75));
      const c = cLow.clone().lerp(cMid, Math.min(1, t * 1.6)).lerp(cHigh, Math.max(0, (t - 0.55) * 1.8));
      if (h > 75) c.lerp(cRock, Math.min(0.7, (h - 75) / 100));
      if (h < -1) c.set('#5a6b72');
      colors.push(c.r, c.g, c.b);
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    const terrain = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.96, metalness: 0.02 }));
    terrain.receiveShadow = true;
    terrain.name = 'terrain';
    group.add(terrain);

    addRunway(group, mapId);
    addWater(group, mapId);
    addTrees(group, mapId, heightAt);
    addGrass(group, heightAt, mapId);
    if (mapId === 'volcano') {
      const v = addVolcano(group);
      addLaunchers(group);
      group.userData.volcano = v;
    }
    addPeopleAndRobots(group, heightAt);
    addClouds(group);
  } else {
    addWater(group, mapId);
    // 岛屿
    for (const is of [
      { x: 780, z: -1250, r: 310, h: 85 },
      { x: -850, z: 420, r: 240, h: 55 },
      { x: 1200, z: 900, r: 200, h: 40 }
    ]) {
      const island = new THREE.Mesh(
        new THREE.ConeGeometry(is.r, is.h, 24, 3),
        new THREE.MeshStandardMaterial({ color: '#4b7a3a', roughness: 1 })
      );
      island.position.set(is.x, is.h / 2 - 3, is.z);
      island.scale.y = 0.9;
      group.add(island);
    }
    addCarrier(group, options.makeParkedAircraft);
    addClouds(group);
    addPeopleAndRobots(group, () => isOnCarrier(0, 0) ? CARRIER.deckY : 0);
  }

  const spawn = new THREE.Vector3(0, 0, mapId === 'carrier' ? CARRIER.length * 0.35 : RUNWAY.startZ);
  const surface = surfaceInfo(mapId, spawn.x, spawn.z);
  spawn.y = surface.h;

  const world = {
    mapId,
    group,
    heightAt: (x, z) => surfaceInfo(mapId, x, z).h,
    surfaceAt: (x, z) => surfaceInfo(mapId, x, z),
    spawn,
    runway: mapId === 'carrier'
      ? { x: 0, z: 0, width: CARRIER.width, length: CARRIER.length, y: CARRIER.deckY, carrier: true }
      : { x: 0, z: 0, width: RUNWAY.width, length: RUNWAY.length, y: RUNWAY.y, carrier: false },
    shipSpawn: new THREE.Vector3(mapId === 'carrier' ? 320 : 0, 0, mapId === 'carrier' ? -850 : -900),
    update: (dt, t) => {
      if (group.userData.volcano) {
        const v = group.userData.volcano;
        v.userData.glow.intensity = 4 + Math.sin(t * 3.1) * 1.3;
        v.userData.lava.emissiveIntensity = 1.25 + Math.sin(t * 2.4) * 0.35;
      }
      const water = group.getObjectByName('water');
      if (water && water.material) water.material.opacity = 0.86 + Math.sin(t * 1.2) * 0.04;
    }
  };
  return world;
}

export function makeStars(scene) {
  return addStarField(scene);
}
