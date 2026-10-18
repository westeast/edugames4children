// 地球世界：20,000 单位半径的球体、五大洲四大洋、跑道、树/草、火山、航母
import * as THREE from 'three';
import { MAPS, RUNWAY, CARRIER } from './config.js';
import {
  EARTH_RADIUS, SPAWNS, dirFromLatLon, latLonFromDir, isLandAt, isLandDir,
  makeElevation, getEarthTexture
} from './earth.js';

const R = EARTH_RADIUS;
const WORLD_Y = new THREE.Vector3(0, 1, 0);
const LOCAL_UP = new THREE.Vector3(0, 1, 0);

// ---------- 工具 ----------
function smoothstep(a, b, x) {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

function makeInstanced(geo, mat, count, cast = true) {
  const mesh = new THREE.InstancedMesh(geo, mat, count);
  mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
  mesh.castShadow = cast;
  mesh.receiveShadow = true;
  return mesh;
}

// 把切平面局部坐标 (x 东, z 南) 映射到球面上（局部原点在地表）
function globeLocal(x, z, y = 0) {
  const p = Math.hypot(x, z);
  if (p < 1e-6) return new THREE.Vector3(0, y, 0);
  const a = p / R;
  const k = (R * Math.sin(a)) / p;
  return new THREE.Vector3(x * k, R * (Math.cos(a) - 1) + y, z * k);
}

function localGroundY(x, z) {
  return R * (Math.cos(Math.hypot(x, z) / R) - 1) + 0.12;
}

// ---------- 湖泊、河流、岛屿与山脉（局部切平面坐标，单位≈米） ----------
const LAKE = { x: -300, z: 170, r: 120 };
const ISLAND = { x: -300, z: 170, r: 42 };
const RIVER = [
  new THREE.Vector2(-312, 252),
  new THREE.Vector2(-262, 340),
  new THREE.Vector2(-202, 420),
  new THREE.Vector2(-118, 468)
];
const RIVER_WIDTH = 13;
const ISLAND_Y = RUNWAY.y + 0.52;

// 跑道上可看见的群山：主峰 + 山肩，带雪顶
const MOUNTAINS = [
  { x: -900, z: -820, h: 300, r: 360 },
  { x: 960, z: -980, h: 340, r: 400 },
  { x: 1240, z: 340, h: 230, r: 280 },
  { x: -1220, z: 520, h: 280, r: 340 },
  { x: -1280, z: -260, h: 210, r: 260 },
  { x: 620, z: 1220, h: 250, r: 300 }
];

function inLake(x, z) {
  return Math.hypot(x - LAKE.x, z - LAKE.z) < LAKE.r;
}
function onIsland(x, z) {
  return Math.hypot(x - ISLAND.x, z - ISLAND.z) < ISLAND.r;
}
function distToSegment(px, pz, ax, az, bx, bz) {
  const dx = bx - ax;
  const dz = bz - az;
  const len2 = dx * dx + dz * dz;
  let t = len2 > 1e-6 ? ((px - ax) * dx + (pz - az) * dz) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + dx * t), pz - (az + dz * t));
}
function inRiver(x, z) {
  for (let i = 0; i < RIVER.length - 1; i++) {
    if (distToSegment(x, z, RIVER[i].x, RIVER[i].y, RIVER[i + 1].x, RIVER[i + 1].y) < RIVER_WIDTH / 2) return true;
  }
  return false;
}
function inWaterLocal(x, z) {
  return !onIsland(x, z) && (inLake(x, z) || inRiver(x, z));
}

// 让物体的 +Y 对齐球面法线，并可绕法线旋转
function placeTangent(obj, x, z, y = 0, yaw = 0) {
  const local = globeLocal(x, z, y);
  obj.position.copy(local);
  const up = new THREE.Vector3(local.x, local.y + R, local.z).normalize();
  obj.quaternion.setFromUnitVectors(LOCAL_UP, up);
  if (yaw) obj.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(LOCAL_UP, yaw));
  return obj;
}

function surfaceQuad(x1, z1, x2, z2, y, material) {
  const pts = [
    globeLocal(x1, z1, y), globeLocal(x2, z1, y),
    globeLocal(x2, z2, y), globeLocal(x1, z2, y)
  ];
  const g = new THREE.BufferGeometry();
  const pos = new Float32Array(pts.length * 3);
  pts.forEach((p, i) => { pos[i * 3] = p.x; pos[i * 3 + 1] = p.y; pos[i * 3 + 2] = p.z; });
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setIndex([0, 2, 1, 0, 3, 2]);
  g.computeVertexNormals();
  const mesh = new THREE.Mesh(g, material);
  mesh.receiveShadow = true;
  return mesh;
}

function surfaceStrip(xa, xb, z1, z2, y, material, segments = 28) {
  const positions = [];
  const indices = [];
  for (let i = 0; i <= segments; i++) {
    const z = z1 + ((z2 - z1) * i) / segments;
    const a = globeLocal(xa, z, y);
    const b = globeLocal(xb, z, y);
    positions.push(a.x, a.y, a.z, b.x, b.y, b.z);
    if (i < segments) {
      const n = i * 2;
      indices.push(n, n + 2, n + 1, n + 1, n + 2, n + 3);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setIndex(indices);
  g.computeVertexNormals();
  const mesh = new THREE.Mesh(g, material);
  mesh.receiveShadow = true;
  return mesh;
}

// ---------- 地球 ----------
function addEarth(group) {
  const tex = getEarthTexture();
  const geo = new THREE.SphereGeometry(R, 160, 96);
  const spawn = dirFromLatLon(SPAWNS.mountain.lat, SPAWNS.mountain.lon);
  const elevationAt = makeElevation(spawn, 'mountain');
  const pos = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.set(pos.getX(i), pos.getY(i), pos.getZ(i)).normalize();
    const { lat, lon } = latLonFromDir(v);
    const e = elevationAt(lat, lon);
    if (e > 0) pos.setXYZ(i, v.x * (R + e), v.y * (R + e), v.z * (R + e));
  }
  geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({
    map: tex,
    roughness: 0.94,
    metalness: 0.02
  });
  const earth = new THREE.Mesh(geo, mat);
  earth.name = 'earth';
  earth.receiveShadow = true;
  group.add(earth);

  // 大气层薄辉
  const atmo = new THREE.Mesh(
    new THREE.SphereGeometry(R + 180, 96, 64),
    new THREE.ShaderMaterial({
      transparent: true,
      side: THREE.BackSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: `
        varying vec3 vNormal;
        void main() {
          vNormal = normalize(normalMatrix * normal);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `
        varying vec3 vNormal;
        void main() {
          float rim = pow(1.0 - abs(dot(vNormal, vec3(0.0, 0.0, 1.0))), 2.4);
          gl_FragColor = vec4(0.36, 0.64, 1.0, rim * 0.28);
        }`
    })
  );
  atmo.name = 'atmosphere';
  group.add(atmo);
  return earth;
}

// ---------- 跑道 ----------
function addRunway(group, mapId) {
  const rw = new THREE.Group();
  const y = RUNWAY.y;
  const roadMat = new THREE.MeshStandardMaterial({ color: '#55595e', roughness: 0.92, metalness: 0.05 });
  const yellow = new THREE.MeshStandardMaterial({ color: '#f4c531', roughness: 0.7, emissive: '#4c3a00', emissiveIntensity: 0.15 });
  const white = new THREE.MeshStandardMaterial({ color: '#e8e8e8', roughness: 0.8 });

  // 主跑道：沿球面弯曲
  rw.add(surfaceStrip(-RUNWAY.width / 2, RUNWAY.width / 2, -RUNWAY.length / 2, RUNWAY.length / 2, y, roadMat, 34));
  // 中线虚线
  for (let z = -RUNWAY.length / 2 + 8; z < RUNWAY.length / 2 - 4; z += 22) {
    rw.add(surfaceQuad(-0.35, z, 0.35, z + 11, y + 0.02, yellow));
  }
  // 边线
  for (const s of [-1, 1]) {
    rw.add(surfaceStrip(
      s * (RUNWAY.width / 2 - 2.45), s * (RUNWAY.width / 2 - 1.95),
      -RUNWAY.length / 2 + 4, RUNWAY.length / 2 - 4, y + 0.02, white, 30
    ));
  }
  // 端头斑马线
  for (const s of [-1, 1]) {
    for (let i = -6; i <= 6; i++) {
      const z0 = s * (RUNWAY.length / 2 - 10.5);
      const z1 = s * (RUNWAY.length / 2 - 3.5);
      rw.add(surfaceQuad(i * 2.1 - 0.7, Math.min(z0, z1), i * 2.1 + 0.7, Math.max(z0, z1), y + 0.02, white));
    }
  }
  // 跑道灯
  const lightMat = new THREE.MeshBasicMaterial({ color: '#9fe8ff' });
  for (let z = -RUNWAY.length / 2 + 10; z < RUNWAY.length / 2; z += 30) {
    for (const s of [-1, 1]) {
      const p = globeLocal(s * (RUNWAY.width / 2 + 0.7), z, y + 0.45);
      const l = new THREE.Mesh(new THREE.SphereGeometry(0.28, 6, 5), lightMat);
      l.position.copy(p);
      rw.add(l);
    }
  }
  group.add(rw);

  // 停机坪
  const apron = surfaceQuad(-60, 185, 60, 285, y + 0.01, new THREE.MeshStandardMaterial({ color: '#61666c', roughness: 0.95 }));
  group.add(apron);

  // 塔台
  const tower = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(10, 22, 10), new THREE.MeshStandardMaterial({ color: '#c9c6bd', roughness: 0.8 }));
  body.position.y = 11;
  tower.add(body);
  const cab = new THREE.Mesh(new THREE.BoxGeometry(14, 5, 14), new THREE.MeshStandardMaterial({ color: '#3d6170', roughness: 0.2, metalness: 0.4 }));
  cab.position.y = 24;
  tower.add(cab);
  placeTangent(tower, 52, 248, y);
  group.add(tower);

  // 机库
  const hangarMat = new THREE.MeshStandardMaterial({ color: '#8a9298', roughness: 0.8, metalness: 0.15 });
  for (const [x, z] of [[-72, 235], [-72, 275]]) {
    const h = new THREE.Mesh(new THREE.BoxGeometry(26, 11, 30), hangarMat);
    h.position.y = 5.5;
    const g = new THREE.Group();
    g.add(h);
    placeTangent(g, x, z, y);
    group.add(g);
  }
  return rw;
}

// ---------- 树/草/人物 ----------
function addTrees(group, mapId, heightAt) {
  if (mapId === 'carrier') return;
  const N = mapId === 'volcano' ? 70 : 120;
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
      x = (Math.random() - 0.5) * 900;
      z = (Math.random() - 0.5) * 1000;
      tries++;
    } while (tries < 30 && ((Math.abs(x) < 80 && Math.abs(z) < 340) || Math.hypot(x, z) > 600 || inWaterLocal(x, z)));
    if (Math.hypot(x, z) > 620 || inWaterLocal(x, z)) { i--; continue; }
    const h = heightAt(x, z);
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
  const count = mapId === 'carrier' ? 0 : 1500;
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
      x = (Math.random() - 0.5) * 560;
      z = (Math.random() - 0.5) * 660;
      h = heightAt(x, z);
      tries++;
    } while (tries < 12 && ((Math.abs(x) < 26 && Math.abs(z) < 280) || Math.hypot(x, z) > 380 || inWaterLocal(x, z)));
    if (Math.hypot(x, z) > 390 || inWaterLocal(x, z)) { i--; continue; }
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

function addClouds(group) {
  const clouds = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1, transparent: true, opacity: 0.72, depthWrite: false });
  for (let i = 0; i < 16; i++) {
    const g = new THREE.Group();
    for (let k = 0; k < 5; k++) {
      const s = new THREE.Mesh(new THREE.SphereGeometry(6 + Math.random() * 7, 8, 6), mat);
      s.position.set((Math.random() - 0.5) * 24, (Math.random() - 0.5) * 4, (Math.random() - 0.5) * 12);
      s.scale.y = 0.55;
      g.add(s);
    }
    const x = (Math.random() - 0.5) * 1200;
    const z = (Math.random() - 0.5) * 1400;
    const drop = R * (Math.cos(Math.hypot(x, z) / R) - 1);
    g.position.set(x, drop + 150 + Math.random() * 130, z);
    g.scale.setScalar(1.4 + Math.random() * 2.1);
    clouds.add(g);
  }
  group.add(clouds);
  return clouds;
}

const VOLCANO = { x: 260, z: -560, r: 210, h: 160 };

function addVolcano(group) {
  const vg = new THREE.Group();
  const rock = new THREE.MeshStandardMaterial({ color: '#3b322f', roughness: 1 });
  const lava = new THREE.MeshStandardMaterial({ color: '#ff6a1a', emissive: '#ff4d00', emissiveIntensity: 1.5, roughness: 0.6 });
  const cone = new THREE.Mesh(new THREE.ConeGeometry(VOLCANO.r, VOLCANO.h, 36, 1, true), rock);
  cone.position.y = VOLCANO.h / 2;
  vg.add(cone);
  const crater = new THREE.Mesh(new THREE.CylinderGeometry(34, 44, 7, 24), lava);
  crater.position.y = VOLCANO.h - 4;
  vg.add(crater);
  const glow = new THREE.PointLight('#ff5a10', 5, 900, 2);
  glow.position.y = VOLCANO.h + 14;
  vg.add(glow);
  // 岩浆流
  for (const [ox, oz, len, rot] of [[-10, 90, 240, 0.25], [26, 70, 200, -0.45]]) {
    const flow = new THREE.Mesh(new THREE.BoxGeometry(10, 0.8, len), lava);
    flow.position.set(ox, 3, oz);
    flow.rotation.y = rot;
    vg.add(flow);
  }
  placeTangent(vg, VOLCANO.x, VOLCANO.z, 0.1);
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

  const bow = new THREE.Mesh(new THREE.CylinderGeometry(CARRIER.width * 0.36, CARRIER.width * 0.12, 12, 4, 1, false, 0, Math.PI), hullMat);
  bow.rotation.x = Math.PI / 2;
  bow.rotation.y = Math.PI / 4;
  bow.position.set(0, 6, -CARRIER.length * 0.47);
  cg.add(bow);

  const deck = new THREE.Mesh(new THREE.BoxGeometry(CARRIER.width, 1.6, CARRIER.length), deckMat);
  deck.position.y = CARRIER.deckY - 0.8;
  deck.receiveShadow = true;
  cg.add(deck);

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
  for (const z of [-CARRIER.length * 0.32, CARRIER.length * 0.3]) {
    const lift = new THREE.Mesh(new THREE.BoxGeometry(18, 0.5, 22), new THREE.MeshStandardMaterial({ color: '#555d64', roughness: 0.9 }));
    lift.position.set(CARRIER.width * 0.34, CARRIER.deckY + 0.1, z);
    cg.add(lift);
  }
  group.add(cg);
  return cg;
}

function addLaunchers(group, heightAt) {
  const launchers = new THREE.Group();
  for (let i = 0; i < 5; i++) {
    const x = -120 + i * 55;
    const z = -420 - (i % 2) * 60;
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
    placeTangent(g, x, z, heightAt(x, z) + 0.1, Math.random() * Math.PI);
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
    placeTangent(g, x, z, y + 0.12, Math.random() * Math.PI * 2);
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
    placeTangent(g, x, z, y + 0.12, Math.PI);
    people.add(g);
  }
  group.add(people);
  return people;
}

// ---------- 山、水、村落 ----------
function curvedDisc(cx, cz, radius, yOffset, segments, material, name) {
  const geo = new THREE.CircleGeometry(radius, segments);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) + cx;
    const z = pos.getZ(i) + cz;
    pos.setXYZ(i, x, localGroundY(x, z) + yOffset, z);
  }
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, material);
  mesh.receiveShadow = true;
  if (name) mesh.name = name;
  return mesh;
}

function makeRiverRibbon(points, width, yOffset, material) {
  const positions = [];
  const indices = [];
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const prev = points[Math.max(0, i - 1)];
    const next = points[Math.min(points.length - 1, i + 1)];
    const dx = next.x - prev.x;
    const dz = next.y - prev.y;
    const len = Math.hypot(dx, dz) || 1;
    const nx = -dz / len;
    const nz = dx / len;
    const ax = p.x + nx * width / 2;
    const az = p.y + nz * width / 2;
    const bx = p.x - nx * width / 2;
    const bz = p.y - nz * width / 2;
    positions.push(ax, localGroundY(ax, az) + yOffset, az, bx, localGroundY(bx, bz) + yOffset, bz);
    if (i < points.length - 1) {
      const n = i * 2;
      indices.push(n, n + 2, n + 1, n + 1, n + 2, n + 3);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, material);
  mesh.receiveShadow = true;
  return mesh;
}

function addMountains(group, groundYAt) {
  const root = new THREE.Group();
  root.name = 'mountains';
  const rock = new THREE.MeshStandardMaterial({ color: '#69735f', roughness: 1, flatShading: true });
  const rockDark = new THREE.MeshStandardMaterial({ color: '#556049', roughness: 1, flatShading: true });
  const snow = new THREE.MeshStandardMaterial({ color: '#eef6fa', roughness: 0.9, flatShading: true });

  for (const m of MOUNTAINS) {
    const g = new THREE.Group();
    const main = new THREE.Mesh(new THREE.ConeGeometry(m.r, m.h, 9), rock);
    main.position.y = m.h / 2;
    main.rotation.y = Math.random() * Math.PI;
    main.castShadow = true;
    main.receiveShadow = true;
    g.add(main);

    const cap = new THREE.Mesh(new THREE.ConeGeometry(m.r * 0.36, m.h * 0.3, 9), snow);
    cap.position.y = m.h * 0.85;
    cap.castShadow = true;
    g.add(cap);

    for (let k = 0; k < 3; k++) {
      const fr = m.r * (0.3 + Math.random() * 0.24);
      const fh = m.h * (0.3 + Math.random() * 0.34);
      const a = Math.random() * Math.PI * 2;
      const d = m.r * (0.55 + Math.random() * 0.4);
      const foot = new THREE.Mesh(new THREE.ConeGeometry(fr, fh, 7), k % 2 ? rockDark : rock);
      foot.position.set(Math.cos(a) * d, fh / 2, Math.sin(a) * d);
      foot.rotation.y = Math.random() * Math.PI;
      foot.castShadow = true;
      foot.receiveShadow = true;
      g.add(foot);
    }
    placeTangent(g, m.x, m.z, groundYAt(m.x, m.z), 0);
    root.add(g);
  }
  group.add(root);
  return root;
}

function addWaterAndIsland(group) {
  const root = new THREE.Group();
  root.name = 'waters';
  const waterMat = new THREE.MeshStandardMaterial({
    color: '#1f74a2', roughness: 0.22, metalness: 0.28,
    transparent: true, opacity: 0.88, side: THREE.DoubleSide, depthWrite: false
  });
  const shoreMat = new THREE.MeshStandardMaterial({ color: '#cdbd8e', roughness: 1 });
  const islandMat = new THREE.MeshStandardMaterial({ color: '#b8a878', roughness: 1 });

  root.add(curvedDisc(LAKE.x, LAKE.z, LAKE.r + 11, 0.03, 64, shoreMat));
  root.add(curvedDisc(LAKE.x, LAKE.z, LAKE.r, 0.07, 72, waterMat, 'water'));
  root.add(makeRiverRibbon(RIVER, RIVER_WIDTH + 8, 0.04, shoreMat));
  const river = makeRiverRibbon(RIVER, RIVER_WIDTH, 0.075, waterMat);
  river.name = 'water';
  root.add(river);
  root.add(curvedDisc(ISLAND.x, ISLAND.z, ISLAND.r + 3, 0.5, 48, islandMat));
  group.add(root);
  return root;
}

function makeVillager(color, scale = 1) {
  const g = new THREE.Group();
  const cloth = new THREE.MeshStandardMaterial({ color, roughness: 0.92 });
  const skin = new THREE.MeshStandardMaterial({ color: '#e3b78c', roughness: 0.9 });
  const legMat = new THREE.MeshStandardMaterial({ color: '#3d4658', roughness: 1 });

  const legGeo = new THREE.CapsuleGeometry(0.09 * scale, 0.42 * scale, 3, 6);
  legGeo.translate(0, -0.29 * scale, 0);
  const legs = [];
  for (const s of [-1, 1]) {
    const leg = new THREE.Mesh(legGeo, legMat);
    leg.position.set(s * 0.12 * scale, 0.62 * scale, 0);
    g.add(leg);
    legs.push(leg);
  }
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.21 * scale, 0.46 * scale, 4, 8), cloth);
  body.position.y = 0.96 * scale;
  body.castShadow = true;
  g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.17 * scale, 8, 6), skin);
  head.position.y = 1.36 * scale;
  g.add(head);
  const hat = new THREE.Mesh(new THREE.SphereGeometry(0.185 * scale, 8, 6, 0, Math.PI * 2, 0, Math.PI * 0.55), cloth);
  hat.position.y = 1.4 * scale;
  g.add(hat);
  g.userData.legs = legs;
  return g;
}

function makeHouse(x, z, yaw) {
  const h = new THREE.Group();
  const wallMat = new THREE.MeshStandardMaterial({ color: '#e7dcc2', roughness: 0.95 });
  const roofMat = new THREE.MeshStandardMaterial({ color: '#a14f3a', roughness: 0.9 });
  const darkMat = new THREE.MeshStandardMaterial({ color: '#5c4a3a', roughness: 0.9 });
  const glassMat = new THREE.MeshStandardMaterial({ color: '#9fd2e8', emissive: '#2a4a55', emissiveIntensity: 0.35, roughness: 0.4 });

  const body = new THREE.Mesh(new THREE.BoxGeometry(8, 4.6, 7), wallMat);
  body.position.y = 2.3;
  body.castShadow = true;
  body.receiveShadow = true;
  h.add(body);
  const roof = new THREE.Mesh(new THREE.ConeGeometry(6.7, 3.1, 4), roofMat);
  roof.position.y = 6.15;
  roof.rotation.y = Math.PI / 4;
  roof.castShadow = true;
  h.add(roof);
  const door = new THREE.Mesh(new THREE.BoxGeometry(1.3, 2.2, 0.16), darkMat);
  door.position.set(0, 1.1, 3.55);
  h.add(door);
  for (const s of [-1, 1]) {
    const win = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.2, 0.14), glassMat);
    win.position.set(s * 2.4, 2.7, 3.56);
    h.add(win);
  }
  placeTangent(h, x, z, localGroundY(x, z), yaw);
  return h;
}

function addVillage(group) {
  const root = new THREE.Group();
  root.name = 'village';
  const houses = [
    [-168, 48, 0.25], [-148, 116, -0.4], [-176, 236, 0.7], [-128, 306, 0.1],
    [-206, 340, -0.2]
  ];
  for (const [x, z, yaw] of houses) root.add(makeHouse(x, z, yaw));

  const walkers = [];
  const colors = ['#e07a5f', '#3d8bcd', '#f2cc5b', '#6fb26b', '#c46bb0', '#e89b3c', '#5fb7b0'];
  const centers = [
    [-150, 90, 18], [-140, 190, 15], [-165, 290, 20], [-70, 155, 12],
    [-95, 330, 16], [70, 210, 14]
  ];
  let idx = 0;
  for (const [cx, cz, r] of centers) {
    for (let k = 0; k < 4; k++) {
      const kid = idx % 5 === 4;
      const g = makeVillager(colors[idx % colors.length], kid ? 0.72 : 1);
      const phase = Math.random() * Math.PI * 2;
      const rad = r * (0.5 + Math.random() * 0.5);
      const speed = (0.12 + Math.random() * 0.16) * (kid ? 1.5 : 1);
      const baseQ = new THREE.Quaternion();
      {
        const x = cx + Math.cos(phase) * rad;
        const z = cz + Math.sin(phase) * rad;
        placeTangent(g, x, z, localGroundY(x, z), 0);
        baseQ.copy(g.quaternion);
      }
      root.add(g);
      walkers.push({ group: g, legs: g.userData.legs, cx, cz, r: rad, speed, phase, baseQ });
      idx++;
    }
  }
  group.add(root);
  return walkers;
}

// ---------- 军事化守军 ----------
function limb(a, b, radius, mat) {
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = dir.length();
  const geo = new THREE.CylinderGeometry(radius, radius * 0.9, len, 5);
  geo.translate(0, len / 2, 0);
  const m = new THREE.Mesh(geo, mat);
  m.position.copy(a);
  m.quaternion.setFromUnitVectors(LOCAL_UP, dir.normalize());
  return m;
}

function makeSoldier(rocket = false) {
  const g = new THREE.Group();
  const uniform = new THREE.MeshStandardMaterial({ color: '#56603f', roughness: 0.95 });
  const vestMat = new THREE.MeshStandardMaterial({ color: '#3b442c', roughness: 0.95 });
  const skin = new THREE.MeshStandardMaterial({ color: '#dfb086', roughness: 0.9 });
  const helmetMat = new THREE.MeshStandardMaterial({ color: '#39422c', roughness: 0.8 });
  const gunMat = new THREE.MeshStandardMaterial({ color: '#26292b', roughness: 0.45, metalness: 0.65 });

  const legGeo = new THREE.CapsuleGeometry(0.15, 0.6, 3, 6);
  legGeo.translate(0, -0.38, 0);
  const legs = [];
  for (const s of [-1, 1]) {
    const leg = new THREE.Mesh(legGeo, uniform);
    leg.position.set(s * 0.18, 0.86, 0);
    g.add(leg);
    legs.push(leg);
  }
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.3, 0.6, 4, 8), uniform);
  torso.position.y = 1.32;
  torso.castShadow = true;
  g.add(torso);
  const vest = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.6, 0.4), vestMat);
  vest.position.y = 1.34;
  g.add(vest);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.23, 8, 6), skin);
  head.position.y = 1.88;
  g.add(head);
  const helmet = new THREE.Mesh(
    new THREE.SphereGeometry(0.285, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.62),
    helmetMat
  );
  helmet.position.y = 1.92;
  g.add(helmet);

  const upper = new THREE.Group();
  upper.position.y = 1.5;
  upper.rotation.x = 0.28;
  g.add(upper);

  let muzzleZ;
  if (rocket) {
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 1.5, 8), gunMat);
    tube.rotation.x = Math.PI / 2;
    tube.position.set(0.3, 0.12, -0.55);
    upper.add(tube);
    const warhead = new THREE.Mesh(
      new THREE.ConeGeometry(0.2, 0.5, 8),
      new THREE.MeshStandardMaterial({ color: '#8c2b1f', roughness: 0.7 })
    );
    warhead.rotation.x = -Math.PI / 2;
    warhead.position.set(0.3, 0.12, -1.5);
    upper.add(warhead);
    upper.add(limb(new THREE.Vector3(0.34, 0.3, 0), new THREE.Vector3(0.46, 0.12, -0.3), 0.085, uniform));
    upper.add(limb(new THREE.Vector3(0.34, 0.3, 0), new THREE.Vector3(0.2, 0.12, -0.75), 0.085, uniform));
    muzzleZ = -1.78;
  } else {
    const rifle = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.12, 0.95), gunMat);
    rifle.position.set(0.22, 0.03, -0.5);
    upper.add(rifle);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.5, 6), gunMat);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0.22, 0.04, -1.1);
    upper.add(barrel);
    upper.add(limb(new THREE.Vector3(0.34, 0.3, 0), new THREE.Vector3(0.3, 0.03, -0.55), 0.085, uniform));
    upper.add(limb(new THREE.Vector3(0.34, 0.3, 0), new THREE.Vector3(0.37, 0.02, -0.15), 0.085, uniform));
    muzzleZ = -1.38;
  }

  const muzzle = new THREE.Mesh(
    new THREE.SphereGeometry(rocket ? 0.16 : 0.12, 6, 5),
    new THREE.MeshBasicMaterial({ color: '#ffdf7a' })
  );
  muzzle.position.set(rocket ? 0.3 : 0.22, rocket ? 0.12 : 0.04, muzzleZ);
  muzzle.visible = false;
  upper.add(muzzle);

  g.userData.upper = upper;
  g.userData.muzzle = muzzle;
  g.userData.legs = legs;
  return g;
}

function addOutpost(group) {
  const root = new THREE.Group();
  root.name = 'outpost';
  const sandMat = new THREE.MeshStandardMaterial({ color: '#a89568', roughness: 1 });
  const tentMat = new THREE.MeshStandardMaterial({ color: '#5b6444', roughness: 0.95 });
  const flagMat = new THREE.MeshStandardMaterial({ color: '#b3261e', roughness: 0.8, side: THREE.DoubleSide });
  const poleMat = new THREE.MeshStandardMaterial({ color: '#8b8f92', metalness: 0.5, roughness: 0.5 });

  for (const [dx, dz, rot] of [[14, -16, 0.6], [-10, -22, -0.4], [19, 10, 1.4]]) {
    const tent = new THREE.Mesh(new THREE.ConeGeometry(7, 5, 4), tentMat);
    const gy = localGroundY(ISLAND.x + dx, ISLAND.z + dz) + 0.5;
    tent.position.set(ISLAND.x + dx, gy + 2.5, ISLAND.z + dz);
    tent.rotation.y = rot;
    tent.castShadow = true;
    root.add(tent);
  }
  for (let i = 0; i < 11; i++) {
    const a = -0.5 + i * 0.17;
    const bx = ISLAND.x + Math.cos(a) * 37;
    const bz = ISLAND.z + Math.sin(a) * 37;
    const bag = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.2, 0.55, 8), sandMat);
    bag.rotation.z = Math.PI / 2;
    bag.position.set(bx, localGroundY(bx, bz) + 0.5 + 0.35, bz);
    root.add(bag);
  }
  const islandGround = localGroundY(ISLAND.x, ISLAND.z) + 0.5;
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 10, 6), poleMat);
  pole.position.set(ISLAND.x, islandGround + 5, ISLAND.z);
  root.add(pole);
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 2.5), flagMat);
  flag.position.set(ISLAND.x + 2.2, islandGround + 9, ISLAND.z);
  flag.rotation.y = 0.35;
  root.add(flag);

  const soldiers = [];
  const makeEntry = (s, rocket) => ({
    group: s,
    rocket,
    upper: s.userData.upper,
    muzzle: s.userData.muzzle,
    legs: s.userData.legs,
    worldPos: new THREE.Vector3(),
    muzzleWorld: new THREE.Vector3(),
    nextShot: 0.4 + Math.random() * 1.6,
    nextRocket: 10 + Math.random() * 8,
    flash: 0,
    t: 0
  });
  const defs = [
    [0.15, false], [0.62, false], [1.05, false], [1.55, true], [2.05, false],
    [2.5, false], [3.0, true], [3.5, false], [4.0, false], [4.6, false]
  ];
  for (const [ang, rocket] of defs) {
    const sx = ISLAND.x + Math.cos(ang) * 29;
    const sz = ISLAND.z + Math.sin(ang) * 29;
    const s = makeSoldier(rocket);
    s.scale.setScalar(1.3);
    const yaw = Math.atan2(sx, sz - 120); // 面向跑道上的我们
    placeTangent(s, sx, sz, ISLAND_Y, yaw);
    root.add(s);
    soldiers.push(makeEntry(s, rocket));
  }

  // 湖东岸的哨所：更靠近跑道，抬头就能看见
  for (let i = 0; i < 6; i++) {
    const bz = 118 + i * 20;
    const bag = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.2, 0.55, 8), sandMat);
    bag.rotation.z = Math.PI / 2;
    bag.position.set(-177, localGroundY(-177, bz) + 0.35, bz);
    root.add(bag);
  }
  for (const [sx, sz, rocket] of [[-170, 126, false], [-172, 158, false], [-174, 190, true], [-171, 222, false]]) {
    const s = makeSoldier(rocket);
    s.scale.setScalar(1.3);
    const yaw = Math.atan2(sx, 0);
    placeTangent(s, sx, sz, localGroundY(sx, sz) + 0.12, yaw);
    root.add(s);
    soldiers.push(makeEntry(s, rocket));
  }
  group.add(root);
  return { soldiers, group: root, y: ISLAND_Y };
}

function makeTracers(group, count = 26) {
  const tracers = [];
  // 用细圆柱代替 Line：WebGL 的线宽恒为 1px，远距离几乎看不见
  const geo = new THREE.CylinderGeometry(1, 1, 1, 6, 1, true);
  for (let i = 0; i < count; i++) {
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffe08a, transparent: true, opacity: 0, depthWrite: false,
      side: THREE.DoubleSide, toneMapped: false
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.visible = false;
    mesh.frustumCulled = false;
    group.add(mesh);
    tracers.push({ line: mesh, active: false, t: 0, life: 0.14 });
  }
  return tracers;
}

// ---------- 主入口 ----------
export function buildWorld(mapId, options = {}) {
  const group = new THREE.Group();
  group.name = 'world-' + mapId;

  const spawnLL = SPAWNS[mapId] || SPAWNS.mountain;
  const spawnDir = dirFromLatLon(spawnLL.lat, spawnLL.lon);
  const origin = spawnDir.clone().multiplyScalar(R);
  const up = spawnDir.clone();
  let north = WORLD_Y.clone().addScaledVector(up, -WORLD_Y.dot(up));
  if (north.lengthSq() < 1e-6) north = new THREE.Vector3(1, 0, 0).addScaledVector(up, -up.x);
  north.normalize();
  const east = new THREE.Vector3().crossVectors(north, up).normalize();
  const south = north.clone().negate();
  const frameQ = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(east, up, south));

  const elevationAt = makeElevation(spawnDir, mapId);
  const terrainLocalY = (x, z) => {
    const { lat, lon } = latLonFromDir(toWorld(x, 0, z).normalize());
    return localGroundY(x, z) + elevationAt(lat, lon);
  };

  const toWorld = (x, y, z) => origin.clone()
    .addScaledVector(east, x)
    .addScaledVector(up, y)
    .addScaledVector(south, z);
  const localToWorld = (v) => toWorld(v.x, v.y, v.z);
  const worldToLocal = (p) => {
    const d = p.clone().sub(origin);
    return new THREE.Vector3(d.dot(east), d.dot(up), d.dot(south));
  };

  function basisAt(pos) {
    const u = pos.clone().normalize();
    let n = WORLD_Y.clone().addScaledVector(u, -WORLD_Y.dot(u));
    if (n.lengthSq() < 1e-6) n = east.clone().addScaledVector(u, -east.dot(u));
    n.normalize();
    const e = new THREE.Vector3().crossVectors(n, u).normalize();
    return { up: u, north: n, east: e };
  }

  function orientAt(pos, yaw = 0) {
    const b = basisAt(pos);
    const q = new THREE.Quaternion().setFromRotationMatrix(
      new THREE.Matrix4().makeBasis(b.east, b.up, b.north.clone().negate())
    );
    if (yaw) q.multiply(new THREE.Quaternion().setFromAxisAngle(LOCAL_UP, yaw));
    return q;
  }

  function orientToward(pos, dir) {
    const b = basisAt(pos);
    let f = dir.clone().addScaledVector(b.up, -dir.dot(b.up));
    if (f.lengthSq() < 1e-6) f = b.north.clone();
    f.normalize();
    const right = new THREE.Vector3().crossVectors(f, b.up).normalize();
    return new THREE.Quaternion().setFromRotationMatrix(
      new THREE.Matrix4().makeBasis(right, b.up, f.clone().negate())
    );
  }

  function offsetAt(pos, x, y, z) {
    const b = basisAt(pos);
    return pos.clone().addScaledVector(b.east, x).addScaledVector(b.up, y).addScaledVector(b.north, z);
  }

  function surfaceAtPosition(p) {
    const local = worldToLocal(p);
    const dist = Math.hypot(local.x, local.z);
    if (mapId === 'carrier') {
      if (Math.abs(local.x) <= CARRIER.width / 2 && Math.abs(local.z) <= CARRIER.length / 2) {
        return { h: R + CARRIER.deckY, type: 'carrier', water: false, rawHeight: CARRIER.deckY };
      }
      return { h: R, type: 'water', water: true, rawHeight: 0 };
    }
    if (dist < 520) {
      if (mapId === 'mountain') {
        if (onIsland(local.x, local.z)) {
          return { h: R + ISLAND_Y, type: 'land', water: false, rawHeight: ISLAND_Y };
        }
        if (inWaterLocal(local.x, local.z)) {
          return { h: R + RUNWAY.y + 0.07, type: 'water', water: true, rawHeight: RUNWAY.y + 0.07 };
        }
      }
      return { h: R + RUNWAY.y, type: 'land', water: false, rawHeight: RUNWAY.y };
    }
    const dir = p.clone().normalize();
    const { lat, lon } = latLonFromDir(dir);
    if (!isLandAt(lat, lon)) return { h: R, type: 'water', water: true, rawHeight: 0 };
    let elev = elevationAt(lat, lon);
    if (mapId === 'mountain') {
      for (const m of MOUNTAINS) {
        const d = Math.hypot(local.x - m.x, local.z - m.z);
        if (d < m.r) elev = Math.max(elev, m.h * (1 - d / m.r));
      }
    }
    if (mapId === 'volcano') {
      const d = Math.hypot(local.x - VOLCANO.x, local.z - VOLCANO.z);
      if (d < VOLCANO.r) elev = Math.max(elev, VOLCANO.h * (1 - d / VOLCANO.r));
    }
    return { h: R + elev, type: 'land', water: false, rawHeight: elev };
  }

  const heightAtLocal = (x, z) => localGroundY(x, z);

  // 地球本体
  addEarth(group);

  // 本地场景（出生点切平面，挂在球面上）
  const localRoot = new THREE.Group();
  localRoot.name = 'airfield';
  localRoot.position.copy(origin);
  localRoot.quaternion.copy(frameQ);
  group.add(localRoot);

  let walkers = [];
  let outpost = null;
  let tracers = [];

  if (mapId === 'carrier') {
    addCarrier(localRoot, options.makeParkedAircraft);
    addPeopleAndRobots(localRoot, () => CARRIER.deckY);
    addClouds(localRoot);
  } else {
    addRunway(localRoot, mapId);
    if (mapId === 'mountain') {
      addWaterAndIsland(localRoot);
      addMountains(localRoot, terrainLocalY);
      walkers = addVillage(localRoot);
      outpost = addOutpost(localRoot);
      tracers = makeTracers(group);
    }
    addTrees(localRoot, mapId, heightAtLocal);
    addGrass(localRoot, heightAtLocal, mapId);
    if (mapId === 'volcano') {
      const v = addVolcano(localRoot);
      addLaunchers(localRoot, heightAtLocal);
      group.userData.volcano = v;
    }
    addPeopleAndRobots(localRoot, heightAtLocal);
    addClouds(localRoot);
  }

  // 在海面附近寻找敌舰位置
  let shipWorld = null;
  for (let dist = 900; dist <= 4200 && !shipWorld; dist += 150) {
    for (let k = 0; k < 24; k++) {
      const a = (k / 24) * Math.PI * 2;
      const lx = Math.sin(a) * dist;
      const lz = -Math.cos(a) * dist;
      const wp = toWorld(lx, 0, lz);
      const { lat, lon } = latLonFromDir(wp);
      if (!isLandAt(lat, lon)) { shipWorld = wp.setLength(R); break; }
    }
  }
  if (!shipWorld) shipWorld = toWorld(0, 0, -1500).setLength(R);
  const shipLocal = worldToLocal(shipWorld);

  const startZ = mapId === 'carrier' ? CARRIER.length * 0.35 : RUNWAY.startZ;
  const startY = mapId === 'carrier' ? CARRIER.deckY : RUNWAY.y;
  const spawn = toWorld(0, startY, startZ);

  const tmpVec = new THREE.Vector3();
  const tmpEnd = new THREE.Vector3();
  const tmpQ = new THREE.Quaternion();

  function fireTracer(from, to) {
    let tr = tracers.find((o) => !o.active);
    if (!tr) tr = tracers[0];
    if (!tr) return;
    tr.active = true;
    tr.t = 0;
    tr.life = 0.12 + Math.random() * 0.08;
    tr.line.visible = true;
    tr.line.material.opacity = 0.95;
    const dir = to.clone().sub(from);
    const len = Math.max(1, dir.length());
    dir.normalize();
    const mid = from.clone().addScaledVector(dir, len * 0.5);
    tr.line.position.copy(mid);
    tr.line.quaternion.setFromUnitVectors(LOCAL_UP, dir);
    // 距离越远越粗，否则在追尾镜头里只有一根像素；上限避免近处变成光柱
    const width = Math.max(0.05, Math.min(0.28, len * 0.0016));
    tr.line.scale.set(width, len, width);
  }

  const world = {
    mapId,
    radius: R,
    group,
    spawn,
    spawnQuat: frameQ,
    spawnDir,
    frame: { origin, up, east, north, south },
    runway: mapId === 'carrier'
      ? { x: 0, z: 0, width: CARRIER.width, length: CARRIER.length, y: CARRIER.deckY, carrier: true }
      : { x: 0, z: 0, width: RUNWAY.width, length: RUNWAY.length, y: RUNWAY.y, carrier: false },
    shipSpawn: shipWorld,
    shipLocal,
    localToWorld,
    worldToLocal,
    toWorld,
    basisAt,
    orientAt,
    orientToward,
    offsetAt,
    surfaceAtPosition,
    heightAt: (x, z) => surfaceAtPosition(toWorld(x, 0, z)).h,
    outpost,
    mountainCount: mapId === 'mountain' ? MOUNTAINS.length : 0,
    waterCount: mapId === 'mountain' ? 2 : mapId === 'carrier' ? 1 : 0,
    villagerCount: walkers.length,
    update: (dt, t, player = null, hooks = null) => {
      if (group.userData.volcano) {
        const v = group.userData.volcano;
        v.userData.glow.intensity = 4 + Math.sin(t * 3.1) * 1.3;
        v.userData.lava.emissiveIntensity = 1.25 + Math.sin(t * 2.4) * 0.35;
      }
      localRoot.traverse((o) => {
        if (o.isMesh && o.name === 'water' && o.material) {
          o.material.opacity = 0.86 + Math.sin(t * 1.2) * 0.04;
        }
      });

      // 村民走动
      for (const w of walkers) {
        const a = w.phase + t * w.speed;
        const x = w.cx + Math.cos(a) * w.r;
        const z = w.cz + Math.sin(a) * w.r;
        w.group.position.copy(globeLocal(x, z, 0.13));
        tmpQ.setFromAxisAngle(LOCAL_UP, Math.atan2(Math.sin(a), -Math.cos(a)));
        w.group.quaternion.copy(w.baseQ).multiply(tmpQ);
        if (w.legs) {
          const sw = Math.sin(t * 7 + w.phase) * 0.55;
          w.legs[0].rotation.x = sw;
          w.legs[1].rotation.x = -sw;
        }
      }

      // 岛上穿军装的守军：瞄准、曳光弹，火箭兵会朝我们发射火箭弹
      if (outpost) {
        const pPos = player && !player.crashed ? player.object.position : null;
        const airborne = pPos && !player.onGround;
        for (const s of outpost.soldiers) {
          if (!s.group.visible) continue;
          s.t += dt;
          if (s.flash > 0) {
            s.flash -= dt;
            if (s.flash <= 0) s.muzzle.visible = false;
          }
          if (!pPos) {
            s.upper.rotation.x = 0.28;
            continue;
          }
          s.group.getWorldPosition(s.worldPos);
          const dist = s.worldPos.distanceTo(pPos);
          if (dist < 950) {
            const pitch = Math.atan2(Math.max(0, player.altitude) + 1.2, Math.max(18, dist));
            s.upper.rotation.x = Math.min(1.05, Math.max(0.18, pitch));
          }
          if (!airborne || dist > 850 || player.altitude > 330) continue;
          s.nextShot -= dt;
          if (s.nextShot <= 0) {
            s.nextShot = 0.7 + Math.random() * 1.7;
            s.flash = 0.075;
            s.muzzle.visible = true;
            s.muzzle.getWorldPosition(s.muzzleWorld);
            tmpEnd.copy(pPos).add(tmpVec.set(
              (Math.random() - 0.5) * 44,
              (Math.random() - 0.5) * 30,
              (Math.random() - 0.5) * 44
            ));
            fireTracer(s.muzzleWorld, tmpEnd);
          }
          if (s.rocket && dist < 800 && player.distanceTravelled > 900 &&
              player.altitude > 25 && player.altitude < 520) {
            s.nextRocket -= dt;
            if (s.nextRocket <= 0) {
              s.nextRocket = 12 + Math.random() * 7;
              s.muzzle.getWorldPosition(s.muzzleWorld);
              s.flash = 0.13;
              s.muzzle.visible = true;
              hooks?.onGroundRocket?.(s.muzzleWorld.clone());
            }
          }
        }
      }

      // 曳光弹淡出
      for (const tr of tracers) {
        if (!tr.active) continue;
        tr.t += dt;
        if (tr.t >= tr.life) {
          tr.active = false;
          tr.line.visible = false;
        } else {
          tr.line.material.opacity = 0.95 * (1 - tr.t / tr.life);
        }
      }
    }
  };
  return world;
}

export function makeStars(scene) {
  const count = 1400;
  const g = new THREE.BufferGeometry();
  const pos = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const r = 9000 + Math.random() * 2500;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(Math.random() * 2 - 1);
    pos[i * 3] = Math.cos(theta) * Math.sin(phi) * r;
    pos[i * 3 + 1] = Math.cos(phi) * r;
    pos[i * 3 + 2] = Math.sin(theta) * Math.sin(phi) * r;
  }
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const m = new THREE.PointsMaterial({ color: 0xffffff, size: 2.4, transparent: true, opacity: 0.85, depthWrite: false });
  const stars = new THREE.Points(g, m);
  stars.name = 'stars';
  stars.frustumCulled = false;
  scene.add(stars);
  return stars;
}
