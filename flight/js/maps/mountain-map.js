// Mountain map - procedural terrain with trees, buildings, roads
import * as THREE from 'three';
import { CHUNK_SIZE, CHUNK_RES, VIEW_DIST, TERRAIN_SCALE, TERRAIN_HEIGHT, state } from '../config.js';
import { SimplexNoise } from '../noise.js';
import * as MapBase from './map-base.js';

// Import scene dynamically to avoid circular dependency
let sceneRef = null;
let terrainGroupRef = null;

const noise = new SimplexNoise(42);
const roadNoise = new SimplexNoise(123);

// Local chunk tracking
const localChunks = new Map();

// Shared geometries & materials for world objects
const treeTrunkGeo = new THREE.CylinderGeometry(0.3, 0.5, 4, 6);
const treeTrunkMat = new THREE.MeshLambertMaterial({ color: 0x5c3a1e });
const treeCrownGeo1 = new THREE.ConeGeometry(3, 6, 6);
const treeCrownGeo2 = new THREE.SphereGeometry(3, 6, 5);
const treeCrownMat1 = new THREE.MeshLambertMaterial({ color: 0x2d6b2d });
const treeCrownMat2 = new THREE.MeshLambertMaterial({ color: 0x3a8a3a });
const buildingGeo = new THREE.BoxGeometry(1, 1, 1);
const buildingMat = new THREE.MeshLambertMaterial({ color: 0x888899 });
const towerGeo = new THREE.CylinderGeometry(0.3, 0.5, 30, 6);
const towerMat = new THREE.MeshLambertMaterial({ color: 0x999999 });

// Road constants
const CAR_WIDTH = 2;
export const ROAD_WIDTH = CAR_WIDTH * 3;

export function getMapInfo() {
  return {
    name: '山地',
    description: '无限山地 · 盘山公路 · 自然风貌',
    type: 'mountain'
  };
}

export function initMap() {
  // Import scene dynamically to avoid circular dependency
  return import('../engine.js').then(module => {
    sceneRef = module.scene;
  }).then(() => import('../terrain.js')).then(module => {
    terrainGroupRef = module.getTerrainGroup();
  });
}

export function cleanup() {
  // Remove all chunks
  for (const [key] of localChunks) {
    const [cx, cz] = key.split(',').map(Number);
    removeChunk(cx, cz);
  }
  localChunks.clear();
}

export function getTerrainHeight(wx, wz) {
  const nx = wx / TERRAIN_SCALE, nz = wz / TERRAIN_SCALE;
  let h = noise.fbm(nx * 0.8, nz * 0.8, 6, 2, 0.5) * TERRAIN_HEIGHT;
  h += noise.fbm(nx * 0.15, nz * 0.15, 3, 2, 0.6) * TERRAIN_HEIGHT * 2;
  const d = Math.sqrt(wx * wx + wz * wz);
  if (d < 80) { const b = 1 - d / 80; h = h * (1 - b) + 2 * b; }
  return h;
}

function chunkKey(cx, cz) { return cx + ',' + cz; }

function isOnRoadInternal(wx, wz) {
  const h = getTerrainHeight(wx, wz);
  if (h < 5 || h > 80) return false;

  const delta = 5;
  const h_dx = getTerrainHeight(wx + delta, wz) - h;
  const h_dz = getTerrainHeight(wx, wz + delta) - h;
  const slope = Math.sqrt(h_dx * h_dx + h_dz * h_dz) / delta;
  if (slope > 0.8) return false;

  const elevationBands = [
    { base: 15, range: 8 },
    { base: 30, range: 8 },
    { base: 50, range: 8 },
  ];

  for (const band of elevationBands) {
    const heightDiff = Math.abs(h - band.base);
    if (heightDiff < band.range) {
      const nx = wx / 100, nz = wz / 100;
      const winding = roadNoise.noise2D(nx * 0.5, nz * 0.5);
      const spiralFactor = Math.sin(wx * 0.02 + winding * 5) * Math.cos(wz * 0.02 + winding * 5);
      if (Math.abs(spiralFactor + winding * 0.3) < 0.25) {
        return true;
      }
    }
  }
  return false;
}

export function isOnRoad(wx, wz) {
  return isOnRoadInternal(wx, wz);
}

export function getRoadDirectionAt(x, z) {
  const delta = 2;
  const h = getTerrainHeight(x, z);
  const h_dx = getTerrainHeight(x + delta, z) - h;
  const h_dz = getTerrainHeight(x, z + delta) - h;
  const gradAngle = Math.atan2(h_dx, h_dz);
  const winding = roadNoise.noise2D(x / 100 * 0.5, z / 100 * 0.5);
  return gradAngle + Math.PI / 2 + winding * 0.3;
}

export function getNearestRoadPoint(x, z) {
  for (let r = 0; r <= 60; r += 8) {
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 8) {
      const testX = x + Math.cos(a) * r;
      const testZ = z + Math.sin(a) * r;
      if (isOnRoadInternal(testX, testZ)) {
        return { x: testX, z: testZ };
      }
    }
  }
  return null;
}

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

    let r, g, b;
    if (isOnRoadInternal(wx, wz)) {
      r = 0.35; g = 0.35; b = 0.38;
    } else if (h < -5) { r = 0.15; g = 0.3; b = 0.55; }
    else if (h < 2) { r = 0.65; g = 0.6; b = 0.4; }
    else if (h < 30) { const n = (h + TERRAIN_HEIGHT) / (TERRAIN_HEIGHT * 3); r = 0.2 + n * 0.1; g = 0.45 + n * 0.15; b = 0.15; }
    else if (h < 60) { r = 0.35; g = 0.3; b = 0.2; }
    else { r = 0.85; g = 0.88; b = 0.92; }

    colors[i * 3] = r; colors[i * 3 + 1] = g; colors[i * 3 + 2] = b;
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
  if (mesh) { terrainGroupRef.remove(mesh); mesh.geometry.dispose(); mesh.material.dispose(); localChunks.delete(key); }

  // Also remove chunk objects
  const objs = MapBase.chunkObjects.get(key);
  if (objs) {
    objs.forEach(o => {
      sceneRef.remove(o);
      if (o.geometry) o.geometry.dispose();
      if (o.material) { if (Array.isArray(o.material)) o.material.forEach(m => m.dispose()); else o.material.dispose(); }
    });
    MapBase.chunkObjects.delete(key);
  }
}

export function updateChunks(dronePos) {
  const cx = Math.floor(dronePos.x / CHUNK_SIZE), cz = Math.floor(dronePos.z / CHUNK_SIZE);
  const needed = new Set();
  for (let dx = -VIEW_DIST; dx <= VIEW_DIST; dx++)
    for (let dz = -VIEW_DIST; dz <= VIEW_DIST; dz++) {
      const k = chunkKey(cx + dx, cz + dz);
      needed.add(k);
      if (!localChunks.has(k)) createTerrainChunk(cx + dx, cz + dz);
    }
  for (const [key] of localChunks)
    if (!needed.has(key)) { const [x, z] = key.split(',').map(Number); removeChunk(x, z); }
}

function populateChunk(cx, cz, ox, oz) {
  const key = chunkKey(cx, cz);
  const objs = [];
  let s = cx * 73856093 ^ cz * 19349663;
  const rng = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };

  // Trees
  for (let i = 0; i < 25; i++) {
    const tx = ox + (rng() - 0.5) * CHUNK_SIZE, tz = oz + (rng() - 0.5) * CHUNK_SIZE;
    const th = getTerrainHeight(tx, tz);
    if (th < 3 || th > 55) continue;
    const tt = rng() > 0.5 ? 0 : 1, sc = 0.8 + rng() * 1.5;
    const g = new THREE.Group();
    const trunk = new THREE.Mesh(treeTrunkGeo, treeTrunkMat);
    trunk.scale.set(sc, sc, sc); trunk.position.y = 2 * sc; g.add(trunk);
    const crown = new THREE.Mesh(tt === 0 ? treeCrownGeo1 : treeCrownGeo2, tt === 0 ? treeCrownMat1 : treeCrownMat2);
    crown.scale.set(sc, sc * (tt === 0 ? 1.2 : 1), sc); crown.position.y = (tt === 0 ? 7 : 6) * sc; g.add(crown);
    g.position.set(tx, th, tz); g.castShadow = true; sceneRef.add(g); objs.push(g);
  }

  // Buildings
  for (let i = 0; i < 5; i++) {
    const bx = ox + (rng() - 0.5) * CHUNK_SIZE * 0.6, bz = oz + (rng() - 0.5) * CHUNK_SIZE * 0.6;
    const bh = getTerrainHeight(bx, bz);
    if (bh < 2 || bh > 30) continue;
    const h = 8 + rng() * 25, w = 5 + rng() * 10, d = 5 + rng() * 10;
    const bldg = new THREE.Mesh(buildingGeo, buildingMat.clone());
    bldg.material.color.setHSL(rng() * 0.1 + 0.55, 0.1, 0.5 + rng() * 0.3);
    bldg.scale.set(w, h, d); bldg.position.set(bx, bh + h / 2, bz);
    bldg.castShadow = true; bldg.receiveShadow = true; sceneRef.add(bldg); objs.push(bldg);
  }

  // Power line towers
  if (rng() > 0.7) {
    const tx = ox + (rng() - 0.5) * CHUNK_SIZE * 0.5, tz = oz + (rng() - 0.5) * CHUNK_SIZE * 0.5;
    const th = getTerrainHeight(tx, tz);
    const tw = new THREE.Mesh(towerGeo, towerMat);
    tw.position.set(tx, th + 15, tz); tw.castShadow = true; sceneRef.add(tw); objs.push(tw);
  }

  // Water lakes
  if (rng() > 0.6) {
    const lx = ox + (rng() - 0.5) * CHUNK_SIZE * 0.4, lz = oz + (rng() - 0.5) * CHUNK_SIZE * 0.4;
    if (getTerrainHeight(lx, lz) < 5) {
      const wg = new THREE.CircleGeometry(20 + rng() * 30, 16); wg.rotateX(-Math.PI / 2);
      const water = new THREE.Mesh(wg, new THREE.MeshPhongMaterial({ color: 0x2266aa, transparent: true, opacity: 0.7, shininess: 100, specular: 0x88bbff }));
      water.position.set(lx, 1.5, lz); sceneRef.add(water); objs.push(water);
    }
  }

  MapBase.chunkObjects.set(key, objs);
}
