// 夜间地图 - 夜色小镇：暗色野外 + 树 + 建筑亮窗 + 部分路灯 + 道路(车人) + 避障光线判定
import * as THREE from 'three';
import { CHUNK_SIZE, CHUNK_RES, VIEW_DIST, state } from '../config.js';
import { SimplexNoise } from '../noise.js';
import * as MapBase from './map-base.js';

// Import scene dynamically to avoid circular dependency
let sceneRef = null;
let terrainGroupRef = null;
let engineRef = null;

const noise = new SimplexNoise(8080);

// Local chunk tracking
const localChunks = new Map();

// 道路网格：每 ROAD_GRID 米一条路，ROAD_W 半宽
const ROAD_GRID = 150;
const ROAD_W = 5;

// 路灯位置表：chunkKey -> [{x,z}, ...]（供 isForwardLit 光线判定）
const lampPositions = new Map();

// Shared geometries & materials（夜间深色调）
const treeTrunkGeo = new THREE.CylinderGeometry(0.35, 0.45, 3.4, 6);
const treeTrunkMat = new THREE.MeshLambertMaterial({ color: 0x2a1d10 });
const treeCrownGeo = new THREE.SphereGeometry(2.6, 6, 5);
const treeCrownMat = new THREE.MeshLambertMaterial({ color: 0x123a12 });

export function getMapInfo() {
  return {
    name: '夜间',
    description: '夜色小镇 · 亮窗建筑 · 路灯避障 · 多机测试',
    type: 'night'
  };
}

export function initMap() {
  state.nightActive = true;
  return import('../engine.js').then(module => {
    sceneRef = module.scene;
    engineRef = module;
    module.applyNightLighting();
  }).then(() => import('../terrain.js')).then(module => {
    terrainGroupRef = module.getTerrainGroup();
  });
}

export function cleanup() {
  state.nightActive = false;
  if (engineRef) {
    engineRef.applyDayLighting();  // 同步恢复（switchMap 不 await cleanup，避免竞态）
  } else {
    import('../engine.js').then(module => { module.applyDayLighting(); });
  }
  for (const [key] of localChunks) {
    const [cx, cz] = key.split(',').map(Number);
    removeChunk(cx, cz);
  }
  localChunks.clear();
  lampPositions.clear();
}

// 缓丘地形（道路处拉平）
export function getTerrainHeight(wx, wz) {
  const axis = roadAxis(wx, wz);
  if (axis) return 0;
  return noise.fbm(wx * 0.01, wz * 0.01, 2, 2, 0.5) * 1.8;
}

// === 道路网络（让人车正常出现） ===
function roadAxis(wx, wz) {
  const rx = ((wx % ROAD_GRID) + ROAD_GRID) % ROAD_GRID;
  const rz = ((wz % ROAD_GRID) + ROAD_GRID) % ROAD_GRID;
  if (rx < ROAD_W) return 'x';
  if (rz < ROAD_W) return 'z';
  return null;
}

export function isOnRoad(wx, wz) {
  return roadAxis(wx, wz) !== null;
}

export function getRoadDirectionAt(wx, wz) {
  return roadAxis(wx, wz) === 'x' ? 0 : Math.PI / 2;
}

export function getNearestRoadPoint(wx, wz) {
  const gx = Math.round(wx / ROAD_GRID) * ROAD_GRID;
  const gz = Math.round(wz / ROAD_GRID) * ROAD_GRID;
  if (Math.abs(wx - gx) <= Math.abs(wz - gz)) return { x: gx, z: wz };
  return { x: wx, z: gz };
}

function chunkKey(cx, cz) { return cx + ',' + cz; }

function createTerrainChunk(cx, cz) {
  const key = chunkKey(cx, cz);
  if (localChunks.has(key)) return;

  const ox = cx * CHUNK_SIZE, oz = cz * CHUNK_SIZE;
  const geo = new THREE.PlaneGeometry(CHUNK_SIZE, CHUNK_SIZE, CHUNK_RES, CHUNK_RES);
  geo.rotateX(-Math.PI / 2);

  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);

  for (let i = 0; i < pos.count; i++) {
    const wx = ox + pos.getX(i), wz = oz + pos.getZ(i);
    const h = getTerrainHeight(wx, wz);
    pos.setY(i, h);

    // 夜间深色地面
    const shade = 0.09 + (noise.noise2D(wx * 0.05, wz * 0.05) * 0.03);
    colors[i * 3] = shade;
    colors[i * 3 + 1] = shade * 1.2;
    colors[i * 3 + 2] = shade * 1.4;
  }

  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }));
  mesh.position.set(ox, 0, oz);
  mesh.receiveShadow = true;
  terrainGroupRef.add(mesh);
  localChunks.set(key, mesh);

  populateChunk(cx, cz, ox, oz);
}

export function removeChunk(cx, cz) {
  const key = chunkKey(cx, cz);
  const mesh = localChunks.get(key);
  if (mesh) {
    terrainGroupRef.remove(mesh);
    mesh.geometry.dispose();
    mesh.material.dispose();
    localChunks.delete(key);
  }

  const objs = MapBase.chunkObjects.get(key);
  if (objs) {
    objs.forEach(o => {
      // 障碍物加入的是 terrainGroup（避障 Raycaster 才能扫到）
      terrainGroupRef.remove(o);
      o.traverse(c => {
        if (c.geometry) c.geometry.dispose();
        if (c.material) {
          if (Array.isArray(c.material)) c.material.forEach(m => m.dispose());
          else c.material.dispose();
        }
      });
    });
    MapBase.chunkObjects.delete(key);
  }

  lampPositions.delete(key);
}

export function updateChunks(dronePos) {
  const cx = Math.floor(dronePos.x / CHUNK_SIZE);
  const cz = Math.floor(dronePos.z / CHUNK_SIZE);
  const needed = new Set();

  for (let dx = -VIEW_DIST; dx <= VIEW_DIST; dx++) {
    for (let dz = -VIEW_DIST; dz <= VIEW_DIST; dz++) {
      const k = chunkKey(cx + dx, cz + dz);
      needed.add(k);
      if (!localChunks.has(k)) {
        createTerrainChunk(cx + dx, cz + dz);
      }
    }
  }

  for (const [key] of localChunks) {
    if (!needed.has(key)) {
      const [x, z] = key.split(',').map(Number);
      removeChunk(x, z);
    }
  }

  // 动态点光源剔除：只亮起无人机附近 ~90m 内的路灯，其余灯头仅剩自发光
  for (const pts of lampPositions.values()) {
    for (const lp of pts) {
      if (lp.light) {
        const dx = lp.x - dronePos.x, dz = lp.z - dronePos.z;
        lp.light.visible = dx * dx + dz * dz < 90 * 90;
      }
    }
  }
}

function populateChunk(cx, cz, ox, oz) {
  const key = chunkKey(cx, cz);
  const objs = [];
  const lamps = [];
  let s = cx * 73856093 ^ cz * 19349663;
  const rng = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };

  // 树：每块约 15 棵（避开道路）
  for (let i = 0; i < 15; i++) {
    const tx = ox + rng() * CHUNK_SIZE;
    const tz = oz + rng() * CHUNK_SIZE;
    if (roadAxis(tx, tz)) continue;
    const tree = createTree(tx, getTerrainHeight(tx, tz), tz, 0.9 + rng() * 0.8);
    terrainGroupRef.add(tree);
    objs.push(tree);
  }

  // 建筑：每块 3-5 座（避开道路）
  const nBuild = 3 + Math.floor(rng() * 3);
  for (let i = 0; i < nBuild; i++) {
    const bx = ox + 30 + rng() * (CHUNK_SIZE - 60);
    const bz = oz + 30 + rng() * (CHUNK_SIZE - 60);
    if (roadAxis(bx, bz)) continue;
    const b = createNightBuilding(bx, bz, 1 + rng() * 1.2, rng);
    terrainGroupRef.add(b);
    objs.push(b);
  }

  // 路灯：沿道路网格，每块最多 2 盏（PointLight 节制）
  let lampCount = 0;
  for (let i = 0; i < 8 && lampCount < 2; i++) {
    const lx = Math.round((ox + rng() * CHUNK_SIZE) / ROAD_GRID) * ROAD_GRID;
    const lz = Math.round((oz + rng() * CHUNK_SIZE) / ROAD_GRID) * ROAD_GRID;
    // 只放落在本块内的路线上（略偏到路肩）
    if (lx < ox || lx > ox + CHUNK_SIZE || lz < oz || lz > oz + CHUNK_SIZE) continue;
    if (!roadAxis(lx, lz)) continue;
    const lamp = createNightLamp(lx, lz);
    terrainGroupRef.add(lamp);
    objs.push(lamp);
    // 记录位置 + 光源引用（updateChunks 里按距离开/关，避免上百盏 PointLight 拖慢渲染）
    lamps.push({ x: lx, z: lz, light: lamp.userData.light });
    lampCount++;
  }

  MapBase.chunkObjects.set(key, objs);
  if (lamps.length) lampPositions.set(key, lamps);
}

// === 夜间建筑：深色墙体 + 亮窗（MeshBasicMaterial 夜里也亮） ===
function createNightBuilding(x, z, scale, rng) {
  const group = new THREE.Group();
  const w = 8 * scale, d = 8 * scale, h = 10 + rng() * 18 * scale;
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshLambertMaterial({ color: 0x181820 })
  );
  body.position.y = h / 2;
  body.name = 'nightBuilding';
  group.add(body);

  // 窗格：正面亮窗约 40%
  const winMatOn = new THREE.MeshBasicMaterial({ color: 0xffdd88 });
  const winMatOff = new THREE.MeshLambertMaterial({ color: 0x0a0a14, transparent: true, opacity: 0.7 });
  const cols = Math.floor(w / 1.2) - 1;
  const rows = Math.floor(h / 1.2) - 1;
  const winW = 0.8, winH = 0.9;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const on = rng() < 0.4;
      const win = new THREE.Mesh(
        new THREE.PlaneGeometry(winW, winH),
        on ? winMatOn : winMatOff
      );
      const wx = (c - (cols - 1) / 2) * 1.2;
      const wy = (r + 1) * 1.2;
      win.position.set(wx, wy, w / 2 + 0.02);
      group.add(win);
      // 背面也做一列亮窗
      const winB = win.clone();
      winB.rotation.y = Math.PI;
      winB.position.z = -w / 2 - 0.02;
      group.add(winB);
    }
  }

  group.position.set(x, 0, z);
  group.castShadow = true;
  return group;
}

// === 路灯：灯柱 + 灯头(emissive) + PointLight + 光锥 ===
function createNightLamp(x, z) {
  const group = new THREE.Group();
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.15, 0.2, 7, 8),
    new THREE.MeshLambertMaterial({ color: 0x222222 })
  );
  pole.position.y = 3.5;
  group.add(pole);

  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.5, 8, 6),
    new THREE.MeshBasicMaterial({ color: 0xffddaa })
  );
  head.position.y = 7.2;
  group.add(head);

  // 真实点光源照亮地面（路灯下地面亮、远处暗）
  const light = new THREE.PointLight(0xffddaa, 1.0, 45, 1.8);
  light.position.set(0, 7, 0);
  group.add(light);
  group.userData.light = light; // 供 updateChunks 动态剔除

  // 光锥（半透明，视觉上照亮地面）
  const cone = new THREE.Mesh(
    new THREE.ConeGeometry(4, 6, 16, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffcc88, transparent: true, opacity: 0.12, side: THREE.DoubleSide })
  );
  cone.position.y = 4;
  group.add(cone);

  group.position.set(x, 0, z);
  return group;
}

function createTree(x, y, z, scale) {
  const group = new THREE.Group();

  const trunk = new THREE.Mesh(treeTrunkGeo, treeTrunkMat);
  trunk.scale.set(scale, scale, scale);
  trunk.position.y = 1.7 * scale;
  group.add(trunk);

  const crown = new THREE.Mesh(treeCrownGeo, treeCrownMat);
  crown.scale.set(scale, scale * 0.8, scale);
  crown.position.y = 4.2 * scale;
  group.add(crown);

  group.position.set(x, y, z);
  group.castShadow = true;
  return group;
}

// === 光线判定：前方 far 米处是否有路灯照亮（< 35m） ===
export function isForwardLit(x, z, yaw, far = 40) {
  const fx = x + Math.sin(yaw) * far;
  const fz = z + Math.cos(yaw) * far;
  let best = Infinity;
  for (const pts of lampPositions.values()) {
    for (const lp of pts) {
      const d2 = (lp.x - fx) * (lp.x - fx) + (lp.z - fz) * (lp.z - fz);
      if (d2 < best) best = d2;
    }
  }
  if (!Number.isFinite(best)) return false;
  return Math.sqrt(best) < 35;
}
