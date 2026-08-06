// 大风地图 - 狂风草原：草地 + 树 + 记者（无建筑/道路/水域），风级 1-8 可调
import * as THREE from 'three';
import { CHUNK_SIZE, CHUNK_RES, VIEW_DIST, state } from '../config.js';
import { SimplexNoise } from '../noise.js';
import * as MapBase from './map-base.js';

// Import scene dynamically to avoid circular dependency
let sceneRef = null;
let terrainGroupRef = null;

const noise = new SimplexNoise(4242);

// Local chunk tracking
const localChunks = new Map();

// Shared geometries & materials
const treeTrunkGeo = new THREE.CylinderGeometry(0.35, 0.45, 3.4, 6);
const treeTrunkMat = new THREE.MeshLambertMaterial({ color: 0x5c3a1e });
const treeCrownGeo = new THREE.SphereGeometry(2.6, 6, 5);
const treeCrownMat = new THREE.MeshLambertMaterial({ color: 0x2d8a2d });

export function getMapInfo() {
  return {
    name: '大风',
    description: '狂风草原 · 大树摇曳 · 记者播报',
    type: 'wind'
  };
}

export function initMap() {
  state.windActive = true;
  // Import scene dynamically to avoid circular dependency
  return import('../engine.js').then(module => {
    sceneRef = module.scene;
  }).then(() => import('../terrain.js')).then(module => {
    terrainGroupRef = module.getTerrainGroup();
  });
}

export function cleanup() {
  state.windActive = false;
  for (const [key] of localChunks) {
    const [cx, cz] = key.split(',').map(Number);
    removeChunk(cx, cz);
  }
  localChunks.clear();
}

// 草地地形：低幅起伏的绿色草原
export function getTerrainHeight(wx, wz) {
  return noise.fbm(wx * 0.008, wz * 0.008, 2, 2, 0.5) * 5;
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

    // 草绿色，带轻微噪声变化
    const g = 0.5 + (noise.noise2D(wx * 0.05, wz * 0.05) * 0.12);
    colors[i * 3] = 0.22;
    colors[i * 3 + 1] = g;
    colors[i * 3 + 2] = 0.18;
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
      sceneRef.remove(o);
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        if (Array.isArray(o.material)) o.material.forEach(m => m.dispose());
        else o.material.dispose();
      }
    });
    MapBase.chunkObjects.delete(key);
  }
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
}

function populateChunk(cx, cz, ox, oz) {
  const key = chunkKey(cx, cz);
  const objs = [];
  let s = cx * 73856093 ^ cz * 19349663;
  const rng = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };

  // 只种树：每块约 30 棵（加上一点草丛点缀）
  for (let i = 0; i < 30; i++) {
    const tx = ox + rng() * CHUNK_SIZE;
    const tz = oz + rng() * CHUNK_SIZE;
    const tree = createTree(tx, getTerrainHeight(tx, tz), tz, 0.9 + rng() * 0.8);
    sceneRef.add(tree);
    objs.push(tree);
  }

  // 草丛点缀（小圆球/细柱）
  const grassMat = new THREE.MeshLambertMaterial({ color: 0x4caf3a });
  for (let i = 0; i < 40; i++) {
    const gx = ox + rng() * CHUNK_SIZE;
    const gz = oz + rng() * CHUNK_SIZE;
    const grass = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.5 + rng() * 0.5, 5), grassMat);
    grass.position.set(gx, getTerrainHeight(gx, gz) + 0.3, gz);
    grass.rotation.y = rng() * Math.PI;
    sceneRef.add(grass);
    objs.push(grass);
  }

  MapBase.chunkObjects.set(key, objs);
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
