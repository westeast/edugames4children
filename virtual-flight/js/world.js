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
    } while (tries < 30 && ((Math.abs(x) < 80 && Math.abs(z) < 340) || Math.hypot(x, z) > 600));
    if (Math.hypot(x, z) > 620) { i--; continue; }
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
    } while (tries < 12 && ((Math.abs(x) < 26 && Math.abs(z) < 280) || Math.hypot(x, z) > 380));
    if (Math.hypot(x, z) > 390) { i--; continue; }
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
      return { h: R + RUNWAY.y, type: 'land', water: false, rawHeight: RUNWAY.y };
    }
    const dir = p.clone().normalize();
    const { lat, lon } = latLonFromDir(dir);
    if (!isLandAt(lat, lon)) return { h: R, type: 'water', water: true, rawHeight: 0 };
    let elev = elevationAt(lat, lon);
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

  if (mapId === 'carrier') {
    addCarrier(localRoot, options.makeParkedAircraft);
    addPeopleAndRobots(localRoot, () => CARRIER.deckY);
    addClouds(localRoot);
  } else {
    addRunway(localRoot, mapId);
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
    update: (dt, t) => {
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
