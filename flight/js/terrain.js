// Terrain system: infinite procedural terrain with chunk loading
import * as THREE from 'three';
import { scene } from './engine.js';
import { SimplexNoise } from './noise.js';
import { CHUNK_SIZE, CHUNK_RES, VIEW_DIST, TERRAIN_SCALE, TERRAIN_HEIGHT, state } from './config.js';
import { populateChunk } from './world.js';

const noise = new SimplexNoise(42);
// Road noise - same seed as entities.js for consistency
const roadNoise = new SimplexNoise(123);
export const terrainChunks = new Map();
export const terrainGroup = new THREE.Group();
export const chunkObjects = new Map();
scene.add(terrainGroup);

export function getTerrainHeight(wx, wz) {
  const nx = wx / TERRAIN_SCALE, nz = wz / TERRAIN_SCALE;
  let h = noise.fbm(nx * 0.8, nz * 0.8, 6, 2, 0.5) * TERRAIN_HEIGHT;
  h += noise.fbm(nx * 0.15, nz * 0.15, 3, 2, 0.6) * TERRAIN_HEIGHT * 2;
  const d = Math.sqrt(wx * wx + wz * wz);
  if (d < 80) { const b = 1 - d / 80; h = h * (1 - b) + 2 * b; }
  return h;
}

export function chunkKey(cx, cz) { return cx + ',' + cz; }

// Road width: 2 cars width (car is ~2m wide, so road is ~6m minimum)
const CAR_WIDTH = 2;
const ROAD_WIDTH = CAR_WIDTH * 3; // 6 meters - allows 2 cars to pass

// Check if position is on road (same logic as entities.js)
// Roads follow terrain contours, avoiding steep slopes
function isOnRoad(wx, wz) {
  const nx = wx / 200, nz = wz / 200;

  // Get terrain height and slope at this position
  const h = getTerrainHeight(wx, wz);
  const delta = 5;
  const h_dx = getTerrainHeight(wx + delta, wz) - h;
  const h_dz = getTerrainHeight(wx, wz + delta) - h;
  const slope = Math.sqrt(h_dx * h_dx + h_dz * h_dz) / delta;

  // Roads avoid very steep areas (slope > 0.6)
  if (slope > 0.6) return false;

  // Create winding road network using noise
  // Increased threshold for more visible roads
  const n1 = roadNoise.fbm(nx * 0.3, nz * 0.3, 2, 2, 0.5);
  const n2 = roadNoise.fbm(nx * 0.2 + 100, nz * 0.2 + 100, 2, 2, 0.5);

  // Add elevation-based bias - roads prefer certain elevation bands
  const elevBias = Math.sin(h * 0.03) * 0.05;

  // Wider roads (threshold 0.15 instead of 0.07)
  return Math.abs(n1 + elevBias) < 0.15 || Math.abs(n2 - elevBias) < 0.15;
}

// Export road width for entities.js
export { ROAD_WIDTH };

export function createTerrainChunk(cx, cz) {
  const key = chunkKey(cx, cz);
  if (terrainChunks.has(key)) return;
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
    
    // Check if on road first
    if (isOnRoad(wx, wz)) {
      // Road color - gray asphalt
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
  terrainGroup.add(mesh);
  terrainChunks.set(key, mesh);
  populateChunk(cx, cz, ox, oz);
}

export function removeTerrainChunk(cx, cz) {
  const key = chunkKey(cx, cz);
  const mesh = terrainChunks.get(key);
  if (mesh) { terrainGroup.remove(mesh); mesh.geometry.dispose(); mesh.material.dispose(); terrainChunks.delete(key); }
  if (chunkObjects.has(key)) {
    chunkObjects.get(key).forEach(o => {
      scene.remove(o);
      if (o.geometry) o.geometry.dispose();
      if (o.material) { if (Array.isArray(o.material)) o.material.forEach(m => m.dispose()); else o.material.dispose(); }
    });
    chunkObjects.delete(key);
  }
}

export function updateTerrainChunks() {
  const { dronePos } = state;
  const cx = Math.floor(dronePos.x / CHUNK_SIZE), cz = Math.floor(dronePos.z / CHUNK_SIZE);
  const needed = new Set();
  for (let dx = -VIEW_DIST; dx <= VIEW_DIST; dx++)
    for (let dz = -VIEW_DIST; dz <= VIEW_DIST; dz++) {
      const k = chunkKey(cx + dx, cz + dz);
      needed.add(k);
      if (!terrainChunks.has(k)) createTerrainChunk(cx + dx, cz + dz);
    }
  for (const [key] of terrainChunks)
    if (!needed.has(key)) { const [x, z] = key.split(',').map(Number); removeTerrainChunk(x, z); }
}