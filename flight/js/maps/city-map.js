// City map - urban environment with buildings, roads, parks
import * as THREE from 'three';
import { CHUNK_SIZE, CHUNK_RES, VIEW_DIST, state } from '../config.js';
import { SimplexNoise } from '../noise.js';
import * as MapBase from './map-base.js';

// Import scene dynamically to avoid circular dependency
let sceneRef = null;
let terrainGroupRef = null;

const noise = new SimplexNoise(999);
const cityNoise = new SimplexNoise(777);

// City layout constants
const BLOCK_SIZE = 100;      // Size of a city block
const ROAD_WIDTH_MAIN = 12;   // Main road width
const ROAD_WIDTH_SIDE = 8;    // Side road width
const ROAD_WIDTH_ALLEY = 4;   // Alley width
const SIDEWALK_WIDTH = 3;     // Sidewalk width
const BUILDING_MARGIN = 2;    // Margin between buildings and sidewalk

// Local chunk tracking
const localChunks = new Map();

// Shared geometries & materials
const treeTrunkGeo = new THREE.CylinderGeometry(0.3, 0.4, 3, 6);
const treeTrunkMat = new THREE.MeshLambertMaterial({ color: 0x5c3a1e });
const treeCrownGeo = new THREE.SphereGeometry(2.5, 6, 5);
const treeCrownMat = new THREE.MeshLambertMaterial({ color: 0x2d8a2d });
const lampPostGeo = new THREE.CylinderGeometry(0.08, 0.1, 6, 6);
const lampPostMat = new THREE.MeshLambertMaterial({ color: 0x444444 });
const lampHeadGeo = new THREE.SphereGeometry(0.3, 6, 4);
const lampHeadMat = new THREE.MeshLambertMaterial({ color: 0xffffcc, emissive: 0xffffaa, emissiveIntensity: 0.3 });

// Building colors
const buildingColors = [
  0xcccccc, 0xb8b8b8, 0xa0a0a8, 0x8899aa, 0x778899,
  0x8a8a8a, 0x999999, 0xaaaaaa, 0x9090a0, 0x858585
];
const glassColors = [
  0x4488bb, 0x5599cc, 0x3377aa, 0x6699bb, 0x4477aa
];

// Store building bounds for collision detection
export const buildingBounds = [];
// Store power lines for collision detection
export const powerLines = [];

export function getMapInfo() {
  return {
    name: '城市',
    description: '现代都市 · 摩天大楼 · 街道网络',
    type: 'city'
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
  for (const [key] of localChunks) {
    const [cx, cz] = key.split(',').map(Number);
    removeChunk(cx, cz);
  }
  localChunks.clear();
  buildingBounds.length = 0;
  powerLines.length = 0;
  bridges.length = 0;
}

// City terrain: mostly flat with slight variations
export function getTerrainHeight(wx, wz) {
  // Base flat ground at y=0
  let h = noise.fbm(wx * 0.005, wz * 0.005, 2, 2, 0.5) * 1.5;

  // River running through the city (diagonal)
  const riverDist = Math.abs(wx * 0.3 - wz);
  if (riverDist < 25) {
    // River bed is lower
    const depth = (25 - riverDist) / 25;
    h -= depth * 4;
  }

  // Roads are perfectly flat
  if (isOnRoadInternal(wx, wz)) {
    h = 0;
  }

  // Sidewalks slightly elevated
  if (isOnSidewalk(wx, wz)) {
    h = 0.3;
  }

  return Math.max(h, -5);
}

function chunkKey(cx, cz) { return cx + ',' + cz; }

// Get the block coordinates for a world position
function getBlockCoords(wx, wz) {
  const bx = Math.floor(wx / BLOCK_SIZE);
  const bz = Math.floor(wz / BLOCK_SIZE);
  return { bx, bz, localX: wx - bx * BLOCK_SIZE, localZ: wz - bz * BLOCK_SIZE };
}

// Check if position is on a main road (grid lines every 2 blocks)
function isOnMainRoad(wx, wz) {
  const { localX, localZ } = getBlockCoords(wx, wz);
  const halfRoad = ROAD_WIDTH_MAIN / 2;
  // Main roads every 2 blocks (200m apart)
  const blockInGroupX = (Math.floor(wx / BLOCK_SIZE) % 2 + 2) % 2;
  const blockInGroupZ = (Math.floor(wz / BLOCK_SIZE) % 2 + 2) % 2;

  // Roads at block boundaries
  const nearXEdge = localX < halfRoad || localX > BLOCK_SIZE - halfRoad;
  const nearZEdge = localZ < halfRoad || localZ > BLOCK_SIZE - halfRoad;

  // Main roads every 2nd block boundary
  const isMainX = nearXEdge && blockInGroupX === 0;
  const isMainZ = nearZEdge && blockInGroupZ === 0;

  return isMainX || isMainZ;
}

// Check if on side road (every block boundary that's not main)
function isOnSideRoad(wx, wz) {
  const { localX, localZ } = getBlockCoords(wx, wz);
  const halfMain = ROAD_WIDTH_MAIN / 2;
  const halfSide = ROAD_WIDTH_SIDE / 2;

  const nearXEdge = localX < halfSide || localX > BLOCK_SIZE - halfSide;
  const nearZEdge = localZ < halfSide || localZ > BLOCK_SIZE - halfSide;

  // Not on main road but on a block boundary
  const notMainX = !(localX < halfMain || localX > BLOCK_SIZE - halfMain);
  const notMainZ = !(localZ < halfMain || localZ > BLOCK_SIZE - halfMain);

  return (nearXEdge && notMainX) || (nearZEdge && notMainZ);
}

function isOnRoadInternal(wx, wz) {
  // Grid roads
  if (isOnMainRoad(wx, wz) || isOnSideRoad(wx, wz)) return true;

  // Roundabout at block center - adds curved roads
  const { localX, localZ } = getBlockCoords(wx, wz);
  const centerDist = Math.sqrt((localX - BLOCK_SIZE / 2) ** 2 + (localZ - BLOCK_SIZE / 2) ** 2);
  if (centerDist < ROAD_WIDTH_MAIN * 1.2 && centerDist > ROAD_WIDTH_MAIN * 0.4) {
    return true;
  }

  // === NEW: Diagonal connecting roads (Y-junctions) ===
  // Add diagonal roads connecting some intersections
  const blockSeed = Math.floor(wx / BLOCK_SIZE) * 10000 + Math.floor(wz / BLOCK_SIZE);
  const diagNoise = cityNoise.noise2D(blockSeed * 0.1, 0);

  // Only add diagonal roads for some blocks (deterministic based on noise)
  if (Math.abs(diagNoise) > 0.5) {
    // Check if near a diagonal road
    const { localX: lx, localZ: lz } = getBlockCoords(wx, wz);

    // Diagonal from corner to corner
    const diagDist = Math.abs(lx - lz);
    if (diagDist < ROAD_WIDTH_SIDE / 2) {
      return true;
    }

    // Anti-diagonal
    const antiDiagDist = Math.abs(lx - (BLOCK_SIZE - lz));
    if (antiDiagDist < ROAD_WIDTH_SIDE / 2) {
      return true;
    }
  }

  // === NEW: T-junction approach roads ===
  // Additional roads leading into T-junctions
  const tJunctionNoise = cityNoise.noise2D(blockSeed * 0.05 + 500, 0);
  if (Math.abs(tJunctionNoise) > 0.6) {
    const { localX: lx, localZ: lz } = getBlockCoords(wx, wz);

    // Horizontal approach
    if (lz < ROAD_WIDTH_SIDE && Math.abs(lx - BLOCK_SIZE / 3) < ROAD_WIDTH_SIDE / 2) {
      return true;
    }
    if (lz > BLOCK_SIZE - ROAD_WIDTH_SIDE && Math.abs(lx - BLOCK_SIZE * 2 / 3) < ROAD_WIDTH_SIDE / 2) {
      return true;
    }

    // Vertical approach
    if (lx < ROAD_WIDTH_SIDE && Math.abs(lz - BLOCK_SIZE / 3) < ROAD_WIDTH_SIDE / 2) {
      return true;
    }
    if (lx > BLOCK_SIZE - ROAD_WIDTH_SIDE && Math.abs(lz - BLOCK_SIZE * 2 / 3) < ROAD_WIDTH_SIDE / 2) {
      return true;
    }
  }

  return false;
}

export function isOnRoad(wx, wz) {
  return isOnRoadInternal(wx, wz);
}

function isOnSidewalk(wx, wz) {
  const { localX, localZ } = getBlockCoords(wx, wz);
  const roadHalf = ROAD_WIDTH_MAIN / 2 + 0.5;
  const sidewalkHalf = roadHalf + SIDEWALK_WIDTH;

  const nearXEdge = localX < sidewalkHalf || localX > BLOCK_SIZE - sidewalkHalf;
  const nearZEdge = localZ < sidewalkHalf || localZ > BLOCK_SIZE - sidewalkHalf;

  // On edge but not on road
  return (nearXEdge && !isOnRoadInternal(wx, wz)) || (nearZEdge && !isOnRoadInternal(wx, wz));
}

// Get road direction (for entity movement)
export function getRoadDirectionAt(x, z) {
  const { localX, localZ, bx, bz } = getBlockCoords(x, z);
  const halfMain = ROAD_WIDTH_MAIN / 2;

  // Check if in roundabout
  const centerDist = Math.sqrt((localX - BLOCK_SIZE / 2) ** 2 + (localZ - BLOCK_SIZE / 2) ** 2);
  if (centerDist < ROAD_WIDTH_MAIN * 1.2 && centerDist > ROAD_WIDTH_MAIN * 0.4) {
    // In roundabout - return tangent direction for curved movement
    const angle = Math.atan2(localZ - BLOCK_SIZE / 2, localX - BLOCK_SIZE / 2);
    return angle + Math.PI / 2;
  }

  // === NEW: Check diagonal roads ===
  const blockSeed = bx * 10000 + bz;
  const diagNoise = cityNoise.noise2D(blockSeed * 0.1, 0);

  if (Math.abs(diagNoise) > 0.5) {
    // Check if on diagonal (main diagonal: x = z)
    const diagDist = Math.abs(localX - localZ);
    if (diagDist < ROAD_WIDTH_SIDE) {
      // Diagonal road direction (45 degrees)
      return Math.PI / 4; // Northeast
    }

    // Check if on anti-diagonal (x + z = BLOCK_SIZE)
    const antiDiagDist = Math.abs(localX - (BLOCK_SIZE - localZ));
    if (antiDiagDist < ROAD_WIDTH_SIDE) {
      // Anti-diagonal road direction (-45 degrees)
      return -Math.PI / 4; // Southeast
    }
  }

  // === NEW: Check T-junction approach roads ===
  const tJunctionNoise = cityNoise.noise2D(blockSeed * 0.05 + 500, 0);
  if (Math.abs(tJunctionNoise) > 0.6) {
    // Horizontal approaches
    if (localZ < ROAD_WIDTH_SIDE) {
      if (Math.abs(localX - BLOCK_SIZE / 3) < ROAD_WIDTH_SIDE) {
        return 0; // Going +Z
      }
      if (Math.abs(localX - BLOCK_SIZE * 2 / 3) < ROAD_WIDTH_SIDE) {
        return Math.PI; // Going -Z
      }
    }
    if (localZ > BLOCK_SIZE - ROAD_WIDTH_SIDE) {
      if (Math.abs(localX - BLOCK_SIZE / 3) < ROAD_WIDTH_SIDE) {
        return 0; // Going +Z
      }
      if (Math.abs(localX - BLOCK_SIZE * 2 / 3) < ROAD_WIDTH_SIDE) {
        return Math.PI; // Going -Z
      }
    }

    // Vertical approaches
    if (localX < ROAD_WIDTH_SIDE) {
      if (Math.abs(localZ - BLOCK_SIZE / 3) < ROAD_WIDTH_SIDE) {
        return Math.PI / 2; // Going +X
      }
      if (Math.abs(localZ - BLOCK_SIZE * 2 / 3) < ROAD_WIDTH_SIDE) {
        return -Math.PI / 2; // Going -X
      }
    }
    if (localX > BLOCK_SIZE - ROAD_WIDTH_SIDE) {
      if (Math.abs(localZ - BLOCK_SIZE / 3) < ROAD_WIDTH_SIDE) {
        return Math.PI / 2; // Going +X
      }
      if (Math.abs(localZ - BLOCK_SIZE * 2 / 3) < ROAD_WIDTH_SIDE) {
        return -Math.PI / 2; // Going -X
      }
    }
  }

  // Default: Determine if we're closer to an X-aligned road or Z-aligned road
  const distToXEdge = Math.min(localX, BLOCK_SIZE - localX);
  const distToZEdge = Math.min(localZ, BLOCK_SIZE - localZ);

  if (distToXEdge < distToZEdge) {
    // On X-aligned road (runs along Z axis)
    return Math.PI / 2; // Facing +X
  } else {
    // On Z-aligned road (runs along X axis)
    return 0; // Facing +Z
  }
}

export function getNearestRoadPoint(x, z) {
  const { bx, bz, localX, localZ } = getBlockCoords(x, z);

  // Check if in roundabout first
  const centerDist = Math.sqrt((localX - BLOCK_SIZE / 2) ** 2 + (localZ - BLOCK_SIZE / 2) ** 2);
  if (centerDist < ROAD_WIDTH_MAIN * 1.2) {
    // Place on roundabout ring
    const angle = Math.atan2(localZ - BLOCK_SIZE / 2, localX - BLOCK_SIZE / 2);
    const ringRadius = ROAD_WIDTH_MAIN * 0.8;
    return {
      x: bx * BLOCK_SIZE + BLOCK_SIZE / 2 + Math.cos(angle) * ringRadius,
      z: bz * BLOCK_SIZE + BLOCK_SIZE / 2 + Math.sin(angle) * ringRadius
    };
  }

  // Find nearest road edge
  const distToLeft = localX;
  const distToRight = BLOCK_SIZE - localX;
  const distToBottom = localZ;
  const distToTop = BLOCK_SIZE - localZ;

  let rx = x, rz = z;

  // Snap to nearest road
  if (distToLeft < distToRight && distToLeft < distToBottom && distToLeft < distToTop) {
    rx = bx * BLOCK_SIZE + ROAD_WIDTH_MAIN / 2;
  } else if (distToRight < distToBottom && distToRight < distToTop) {
    rx = (bx + 1) * BLOCK_SIZE - ROAD_WIDTH_MAIN / 2;
  } else if (distToBottom < distToTop) {
    rz = bz * BLOCK_SIZE + ROAD_WIDTH_MAIN / 2;
  } else {
    rz = (bz + 1) * BLOCK_SIZE - ROAD_WIDTH_MAIN / 2;
  }

  return { x: rx, z: rz };
}

// Check if a block is a park
function isParkBlock(bx, bz) {
  // Use noise to deterministically decide park blocks
  const n = cityNoise.noise2D(bx * 0.1, bz * 0.1);
  return n > 0.6;
}

// Check if a block is a parking lot
function isParkingBlock(bx, bz) {
  const n = cityNoise.noise2D(bx * 0.1 + 100, bz * 0.1 + 100);
  return n > 0.7 && !isParkBlock(bx, bz);
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
      // Asphalt road
      r = 0.32; g = 0.32; b = 0.34;
    } else if (isOnSidewalk(wx, wz)) {
      // Concrete sidewalk
      r = 0.7; g = 0.7; b = 0.68;
    } else {
      const { bx, bz } = getBlockCoords(wx, wz);
      if (isParkBlock(bx, bz)) {
        // Park grass
        r = 0.25; g = 0.55; b = 0.2;
      } else if (isParkingBlock(bx, bz)) {
        // Parking lot asphalt
        r = 0.35; g = 0.35; b = 0.37;
      } else {
        // Building area (will be covered by buildings)
        r = 0.5; g = 0.5; b = 0.52;
      }
    }

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

  // Determine which blocks this chunk covers
  const startBx = Math.floor(ox / BLOCK_SIZE);
  const endBx = Math.floor((ox + CHUNK_SIZE) / BLOCK_SIZE);
  const startBz = Math.floor(oz / BLOCK_SIZE);
  const endBz = Math.floor((oz + CHUNK_SIZE) / BLOCK_SIZE);

  for (let bx = startBx; bx <= endBx; bx++) {
    for (let bz = startBz; bz <= endBz; bz++) {
      const blockOx = bx * BLOCK_SIZE;
      const blockOz = bz * BLOCK_SIZE;

      if (isParkBlock(bx, bz)) {
        // Park: trees and benches
        for (let i = 0; i < 8; i++) {
          const tx = blockOx + 10 + rng() * (BLOCK_SIZE - 20);
          const tz = blockOz + 10 + rng() * (BLOCK_SIZE - 20);
          const tree = createTree(tx, 0, tz, 0.8 + rng() * 0.6);
          sceneRef.add(tree);
          objs.push(tree);
        }
      } else if (isParkingBlock(bx, bz)) {
        // Parking lot: static cars
        for (let i = 0; i < 6; i++) {
          const px = blockOx + 15 + (i % 3) * 25;
          const pz = blockOz + 15 + Math.floor(i / 3) * 35;
          const car = createStaticCar(px, 0.3, pz, rng);
          sceneRef.add(car);
          objs.push(car);
        }
      } else {
        // Regular block: buildings
        // Determine building layout for this block
        const blockSeed = bx * 10000 + bz;
        const numBuildings = 2 + Math.floor(rng() * 3);

        for (let i = 0; i < numBuildings; i++) {
          // Building placement within block (avoiding roads)
          const margin = ROAD_WIDTH_MAIN / 2 + SIDEWALK_WIDTH + BUILDING_MARGIN;
          const availSize = BLOCK_SIZE - margin * 2;

          const bldgX = blockOx + margin + rng() * availSize;
          const bldgZ = blockOz + margin + rng() * availSize;

          // Building dimensions
          const bldgW = 15 + rng() * 20;
          const bldgD = 15 + rng() * 20;

          // Keep within block
          if (bldgX + bldgW / 2 > blockOx + BLOCK_SIZE - margin) continue;
          if (bldgX - bldgW / 2 < blockOx + margin) continue;
          if (bldgZ + bldgD / 2 > blockOz + BLOCK_SIZE - margin) continue;
          if (bldgZ - bldgD / 2 < blockOz + margin) continue;

          // Building height based on distance from center (CBD effect)
          const distFromCenter = Math.sqrt(bldgX * bldgX + bldgZ * bldgZ);
          const maxHeight = Math.max(20, 200 - distFromCenter * 0.3);
          const heightTiers = [20, 40, 60, 80, 120, 160, 200];
          let bldgH = heightTiers[Math.floor(rng() * heightTiers.length)];
          bldgH = Math.min(bldgH, maxHeight);
          bldgH = Math.max(bldgH, 15);

          const building = createBuilding(bldgX, bldgZ, bldgW, bldgH, bldgD, rng);
          sceneRef.add(building);
          objs.push(building);
        }
      }
    }
  }

  // Street lamps along roads
  for (let x = ox; x < ox + CHUNK_SIZE; x += 30) {
    for (let z = oz; z < oz + CHUNK_SIZE; z += 30) {
      if (isOnRoadInternal(x, z) && rng() > 0.3) {
        const lamp = createStreetLamp(x, 0, z);
        sceneRef.add(lamp);
        objs.push(lamp);
      }
    }
  }

  // Power lines between buildings
  createPowerLines(ox, oz, CHUNK_SIZE, objs, rng);

  // Road markings (lane lines)
  createRoadMarkings(ox, oz, CHUNK_SIZE, objs);

  // Bridges (overpasses with holes)
  addBridgesToChunk(ox, oz, CHUNK_SIZE, objs, rng);

  MapBase.chunkObjects.set(key, objs);
}

function createBuilding(x, z, w, h, d, rng) {
  const group = new THREE.Group();

  // Main building body
  const color = buildingColors[Math.floor(rng() * buildingColors.length)];
  const bodyGeo = new THREE.BoxGeometry(w, h, d);
  const bodyMat = new THREE.MeshLambertMaterial({ color });
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.position.y = h / 2;
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  // === BIGGER WINDOWS - drone can fly through ===
  // Use larger windows, fewer of them, with gaps between
  const windowRows = Math.max(2, Math.floor(h / 12));
  const windowColsFront = Math.max(2, Math.floor(w / 10));
  const windowColsSide = Math.max(2, Math.floor(d / 10));
  const glassColor = glassColors[Math.floor(rng() * glassColors.length)];

  // Window size - much bigger so drone can fly through
  const winW = Math.min(w / windowColsFront * 0.7, 4);
  const winH = Math.min(h / windowRows * 0.6, 4);
  const winD = 0.15;
  const winGeo = new THREE.BoxGeometry(winW, winH, winD);
  const winMat = new THREE.MeshLambertMaterial({
    color: glassColor,
    transparent: true,
    opacity: 0.5,
    emissive: glassColor,
    emissiveIntensity: 0.2
  });

  // Front face windows (+Z)
  for (let row = 0; row < windowRows; row++) {
    for (let col = 0; col < windowColsFront; col++) {
      const win = new THREE.Mesh(winGeo, winMat);
      const xPos = -w / 2 + (col + 0.5) * (w / windowColsFront);
      const yPos = 4 + row * (h / windowRows);
      win.position.set(xPos, yPos, d / 2 + winD / 2);
      group.add(win);
    }
  }

  // Back face windows (-Z)
  for (let row = 0; row < windowRows; row++) {
    for (let col = 0; col < windowColsFront; col++) {
      const win = new THREE.Mesh(winGeo, winMat);
      const xPos = -w / 2 + (col + 0.5) * (w / windowColsFront);
      const yPos = 4 + row * (h / windowRows);
      win.position.set(xPos, yPos, -d / 2 - winD / 2);
      group.add(win);
    }
  }

  // Left face windows (-X)
  for (let row = 0; row < windowRows; row++) {
    for (let col = 0; col < windowColsSide; col++) {
      const win = new THREE.Mesh(winGeo, winMat);
      const zPos = -d / 2 + (col + 0.5) * (d / windowColsSide);
      const yPos = 4 + row * (h / windowRows);
      win.position.set(-w / 2 - winD / 2, yPos, zPos);
      group.add(win);
    }
  }

  // Right face windows (+X)
  for (let row = 0; row < windowRows; row++) {
    for (let col = 0; col < windowColsSide; col++) {
      const win = new THREE.Mesh(winGeo, winMat);
      const zPos = -d / 2 + (col + 0.5) * (d / windowColsSide);
      const yPos = 4 + row * (h / windowRows);
      win.position.set(w / 2 + winD / 2, yPos, zPos);
      group.add(win);
    }
  }

  // === BIGGER DOOR - drone can fly through ===
  const doorW = Math.min(w * 0.4, 5);
  const doorH = 5;
  const doorD = 0.2;
  const doorGeo = new THREE.BoxGeometry(doorW, doorH, doorD);
  const doorMat = new THREE.MeshLambertMaterial({ color: 0x4a3728 });
  const door = new THREE.Mesh(doorGeo, doorMat);
  door.position.set(0, doorH / 2, d / 2 + doorD / 2);
  group.add(door);

  // Door frame
  const frameThick = 0.2;
  const frameMat = new THREE.MeshLambertMaterial({ color: 0x666666 });
  const frameTop = new THREE.Mesh(new THREE.BoxGeometry(doorW + frameThick * 2, frameThick, doorD + 0.1), frameMat);
  frameTop.position.set(0, doorH + frameThick / 2, d / 2 + doorD / 2);
  group.add(frameTop);
  const frameLeft = new THREE.Mesh(new THREE.BoxGeometry(frameThick, doorH, doorD + 0.1), frameMat);
  frameLeft.position.set(-doorW / 2 - frameThick / 2, doorH / 2, d / 2 + doorD / 2);
  group.add(frameLeft);
  const frameRight = new THREE.Mesh(new THREE.BoxGeometry(frameThick, doorH, doorD + 0.1), frameMat);
  frameRight.position.set(doorW / 2 + frameThick / 2, doorH / 2, d / 2 + doorD / 2);
  group.add(frameRight);

  // Glass entrance canopy above door
  const canopyGeo = new THREE.BoxGeometry(doorW + 1.5, 0.1, 2);
  const canopyMat = new THREE.MeshLambertMaterial({
    color: 0x88aacc,
    transparent: true,
    opacity: 0.4
  });
  const canopy = new THREE.Mesh(canopyGeo, canopyMat);
  canopy.position.set(0, doorH + 0.5, d / 2 + 0.8);
  group.add(canopy);

  // === BILLBOARD on building side ===
  if (rng() > 0.3 && h > 30) {
    const billboardW = 6 + rng() * 4;
    const billboardH = 3 + rng() * 2;
    const billboardY = 8 + rng() * (h - 20);
    const billboardSide = rng() > 0.5 ? 1 : -1; // +X or -X side
    const billboardColors = [0xff3333, 0x33ff33, 0x3333ff, 0xffaa00, 0xff33ff, 0x00ffff];
    const bbColor = billboardColors[Math.floor(rng() * billboardColors.length)];

    // Billboard backing
    const bbGeo = new THREE.BoxGeometry(0.2, billboardH, billboardW);
    const bbMat = new THREE.MeshLambertMaterial({ color: bbColor });
    const bb = new THREE.Mesh(bbGeo, bbMat);
    bb.position.set(
      billboardSide * (w / 2 + 0.3),
      billboardY,
      (rng() - 0.5) * d * 0.5
    );
    group.add(bb);

    // Billboard frame
    const bbFrameMat = new THREE.MeshLambertMaterial({ color: 0x444444 });
    const bbFrameTop = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.15, billboardW + 0.3), bbFrameMat);
    bbFrameTop.position.copy(bb.position);
    bbFrameTop.position.y += billboardH / 2 + 0.1;
    group.add(bbFrameTop);
    const bbFrameBot = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.15, billboardW + 0.3), bbFrameMat);
    bbFrameBot.position.copy(bb.position);
    bbFrameBot.position.y -= billboardH / 2 + 0.1;
    group.add(bbFrameBot);
  }

  // Roof details
  if (rng() > 0.5 && h > 40) {
    // Antenna / spire
    const antennaGeo = new THREE.CylinderGeometry(0.1, 0.2, 8, 4);
    const antennaMat = new THREE.MeshLambertMaterial({ color: 0x888888 });
    const antenna = new THREE.Mesh(antennaGeo, antennaMat);
    antenna.position.y = h + 4;
    group.add(antenna);
  }

  // Rooftop AC units
  if (rng() > 0.4) {
    const acGeo = new THREE.BoxGeometry(3, 1.5, 3);
    const acMat = new THREE.MeshLambertMaterial({ color: 0x666666 });
    const ac = new THREE.Mesh(acGeo, acMat);
    ac.position.set(rng() * w * 0.3 - w * 0.15, h + 0.75, rng() * d * 0.3 - d * 0.15);
    group.add(ac);
  }

  group.position.set(x, 0, z);

  // Store building bounds for collision detection
  // Building AABB: minX, maxX, minY, maxY, minZ, maxZ
  buildingBounds.push({
    minX: x - w / 2,
    maxX: x + w / 2,
    minY: 0,
    maxY: h,
    minZ: z - d / 2,
    maxZ: z + d / 2,
    group: group
  });

  return group;
}

function createTree(x, y, z, scale) {
  const group = new THREE.Group();

  const trunk = new THREE.Mesh(treeTrunkGeo, treeTrunkMat);
  trunk.scale.set(scale, scale, scale);
  trunk.position.y = 1.5 * scale;
  group.add(trunk);

  const crown = new THREE.Mesh(treeCrownGeo, treeCrownMat);
  crown.scale.set(scale, scale * 0.8, scale);
  crown.position.y = 4 * scale;
  group.add(crown);

  group.position.set(x, y, z);
  group.castShadow = true;
  return group;
}

function createStaticCar(x, y, z, rng) {
  const group = new THREE.Group();
  const colors = [0xe53935, 0x1e88e5, 0x43a047, 0xfdd835, 0xff9800, 0x8e24aa];
  const color = colors[Math.floor(rng() * colors.length)];

  const body = new THREE.Mesh(
    new THREE.BoxGeometry(1.8, 0.6, 3.8),
    new THREE.MeshLambertMaterial({ color })
  );
  body.position.y = 0.5;
  group.add(body);

  const cabin = new THREE.Mesh(
    new THREE.BoxGeometry(1.5, 0.4, 1.4),
    new THREE.MeshLambertMaterial({ color: 0x88bbdd, transparent: true, opacity: 0.6 })
  );
  cabin.position.y = 0.9;
  group.add(cabin);

  // Wheels
  const wheelGeo = new THREE.CylinderGeometry(0.25, 0.25, 0.2, 8);
  wheelGeo.rotateZ(Math.PI / 2);
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x222222 });
  const wheelPositions = [[-0.9, 0.25, 1.2], [0.9, 0.25, 1.2], [-0.9, 0.25, -1.2], [0.9, 0.25, -1.2]];
  wheelPositions.forEach(pos => {
    const wheel = new THREE.Mesh(wheelGeo, wheelMat);
    wheel.position.set(...pos);
    group.add(wheel);
  });

  group.position.set(x, y, z);
  group.rotation.y = rng() * Math.PI * 2;
  return group;
}

function createStreetLamp(x, y, z) {
  const group = new THREE.Group();

  const post = new THREE.Mesh(lampPostGeo, lampPostMat);
  post.position.y = 3;
  group.add(post);

  const head = new THREE.Mesh(lampHeadGeo, lampHeadMat);
  head.position.y = 6.2;
  group.add(head);

  // Light cone (visual only)
  const coneGeo = new THREE.ConeGeometry(1.5, 3, 8, 1, true);
  const coneMat = new THREE.MeshLambertMaterial({
    color: 0xffffaa,
    transparent: true,
    opacity: 0.1,
    side: THREE.DoubleSide
  });
  const cone = new THREE.Mesh(coneGeo, coneMat);
  cone.position.y = 4.5;
  group.add(cone);

  group.position.set(x, y, z);
  return group;
}

function createRoadMarkings(ox, oz, size, objs) {
  // === ADVANCED ROAD MARKINGS ===
  // Yellow center line (solid)
  const yellowMat = new THREE.MeshLambertMaterial({ color: 0xffcc00 });
  // White lane separator (dashed)
  const whiteMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  // White edge line (solid)
  const whiteSolidMat = new THREE.MeshLambertMaterial({ color: 0xeeeeee });

  // Main roads: Double yellow center line + white dashed lane lines + white solid edge lines
  for (let x = ox; x < ox + size; x += BLOCK_SIZE) {
    const blockInGroupX = (Math.floor(x / BLOCK_SIZE) % 2 + 2) % 2;
    if (blockInGroupX !== 0) continue; // Only main roads every 2 blocks

    // Yellow center line (double solid)
    for (let offset = -0.15; offset <= 0.15; offset += 0.3) {
      const centerLineGeo = new THREE.PlaneGeometry(0.15, size);
      centerLineGeo.rotateX(-Math.PI / 2);
      const centerLine = new THREE.Mesh(centerLineGeo, yellowMat);
      centerLine.position.set(x + offset, 0.05, oz + size / 2);
      sceneRef.add(centerLine);
      objs.push(centerLine);
    }

    // White dashed lane lines (left and right of center)
    const laneWidth = ROAD_WIDTH_MAIN / 3; // 3 lanes per direction
    for (let lane = 1; lane <= 2; lane++) {
      const laneOffset = lane * laneWidth;
      // Left lanes
      for (let z = oz; z < oz + size; z += 6) {
        const dashGeo = new THREE.PlaneGeometry(0.12, 3);
        dashGeo.rotateX(-Math.PI / 2);
        const dash = new THREE.Mesh(dashGeo, whiteMat);
        dash.position.set(x - laneOffset, 0.05, z);
        sceneRef.add(dash);
        objs.push(dash);
      }
      // Right lanes
      for (let z = oz; z < oz + size; z += 6) {
        const dashGeo = new THREE.PlaneGeometry(0.12, 3);
        dashGeo.rotateX(-Math.PI / 2);
        const dash = new THREE.Mesh(dashGeo, whiteMat);
        dash.position.set(x + laneOffset, 0.05, z);
        sceneRef.add(dash);
        objs.push(dash);
      }
    }

    // White solid edge lines
    const edgeGeo = new THREE.PlaneGeometry(0.2, size);
    edgeGeo.rotateX(-Math.PI / 2);
    const leftEdge = new THREE.Mesh(edgeGeo, whiteSolidMat);
    leftEdge.position.set(x - ROAD_WIDTH_MAIN / 2, 0.05, oz + size / 2);
    sceneRef.add(leftEdge);
    objs.push(leftEdge);

    const rightEdge = new THREE.Mesh(edgeGeo.clone(), whiteSolidMat);
    rightEdge.position.set(x + ROAD_WIDTH_MAIN / 2, 0.05, oz + size / 2);
    sceneRef.add(rightEdge);
    objs.push(rightEdge);
  }

  // Vertical roads (along X axis)
  for (let z = oz; z < oz + size; z += BLOCK_SIZE) {
    const blockInGroupZ = (Math.floor(z / BLOCK_SIZE) % 2 + 2) % 2;
    if (blockInGroupZ !== 0) continue;

    // Yellow center line
    for (let offset = -0.15; offset <= 0.15; offset += 0.3) {
      const centerLineGeo = new THREE.PlaneGeometry(size, 0.15);
      centerLineGeo.rotateX(-Math.PI / 2);
      const centerLine = new THREE.Mesh(centerLineGeo, yellowMat);
      centerLine.position.set(ox + size / 2, 0.05, z + offset);
      sceneRef.add(centerLine);
      objs.push(centerLine);
    }

    // White dashed lane lines
    const laneWidth = ROAD_WIDTH_MAIN / 3;
    for (let lane = 1; lane <= 2; lane++) {
      const laneOffset = lane * laneWidth;
      for (let x = ox; x < ox + size; x += 6) {
        const dashGeo = new THREE.PlaneGeometry(3, 0.12);
        dashGeo.rotateX(-Math.PI / 2);
        const dashFront = new THREE.Mesh(dashGeo, whiteMat);
        dashFront.position.set(x, 0.05, z - laneOffset);
        sceneRef.add(dashFront);
        objs.push(dashFront);

        const dashBack = new THREE.Mesh(dashGeo.clone(), whiteMat);
        dashBack.position.set(x, 0.05, z + laneOffset);
        sceneRef.add(dashBack);
        objs.push(dashBack);
      }
    }

    // White solid edge lines
    const edgeGeo = new THREE.PlaneGeometry(size, 0.2);
    edgeGeo.rotateX(-Math.PI / 2);
    const frontEdge = new THREE.Mesh(edgeGeo, whiteSolidMat);
    frontEdge.position.set(ox + size / 2, 0.05, z - ROAD_WIDTH_MAIN / 2);
    sceneRef.add(frontEdge);
    objs.push(frontEdge);

    const backEdge = new THREE.Mesh(edgeGeo.clone(), whiteSolidMat);
    backEdge.position.set(ox + size / 2, 0.05, z + ROAD_WIDTH_MAIN / 2);
    sceneRef.add(backEdge);
    objs.push(backEdge);
  }

  // Crosswalks at intersections (斑马线)
  const crosswalkMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const crosswalkStripeGeo = new THREE.PlaneGeometry(0.5, ROAD_WIDTH_MAIN);
  crosswalkStripeGeo.rotateX(-Math.PI / 2);

  // Add crosswalks at main road intersections
  for (let x = ox; x < ox + size; x += BLOCK_SIZE * 2) {
    for (let z = oz; z < oz + size; z += BLOCK_SIZE * 2) {
      // Check if this is a main road intersection
      const blockX = (Math.floor(x / BLOCK_SIZE) % 2 + 2) % 2;
      const blockZ = (Math.floor(z / BLOCK_SIZE) % 2 + 2) % 2;
      if (blockX === 0 && blockZ === 0) {
        // Add crosswalk stripes
        for (let stripeOffset = -3; stripeOffset <= 3; stripeOffset += 1.2) {
          const stripeX = new THREE.Mesh(crosswalkStripeGeo.clone(), crosswalkMat);
          stripeX.position.set(x + stripeOffset, 0.05, z);
          sceneRef.add(stripeX);
          objs.push(stripeX);

          const stripeZ = new THREE.Mesh(crosswalkStripeGeo.clone(), crosswalkMat);
          stripeZ.rotation.y = Math.PI / 2;
          stripeZ.position.set(x, 0.05, z + stripeOffset);
          sceneRef.add(stripeZ);
          objs.push(stripeZ);
        }
      }
    }
  }
}

// Export constants for entities
export const ROAD_WIDTH = ROAD_WIDTH_MAIN;

// === POWER LINES ===
function createPowerLines(ox, oz, size, objs, rng) {
  // Create power lines between buildings across roads
  // Power lines run along road edges, connecting buildings on opposite sides
  const poleMat = new THREE.MeshLambertMaterial({ color: 0x555555 });
  const wireMat = new THREE.MeshLambertMaterial({ color: 0x222222 });

  // Check horizontal roads (along Z axis, at specific X positions)
  for (let x = ox; x < ox + size; x += BLOCK_SIZE) {
    // Only place at block boundaries (where roads are)
    const blockInGroupX = (Math.floor(x / BLOCK_SIZE) % 2 + 2) % 2;
    if (blockInGroupX !== 0) continue;

    for (let z = oz + 10; z < oz + size - 10; z += 20 + rng() * 15) {
      // Place poles on both sides of the road
      const roadHalf = ROAD_WIDTH_MAIN / 2 + SIDEWALK_WIDTH + 2;

      // Left side pole
      const leftPoleX = x - roadHalf;
      const leftPoleH = 12 + rng() * 8;
      const leftPole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.12, 0.18, leftPoleH, 6),
        poleMat
      );
      leftPole.position.set(leftPoleX, leftPoleH / 2, z);
      sceneRef.add(leftPole);
      objs.push(leftPole);

      // Right side pole
      const rightPoleX = x + roadHalf;
      const rightPoleH = 12 + rng() * 8;
      const rightPole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.12, 0.18, rightPoleH, 6),
        poleMat
      );
      rightPole.position.set(rightPoleX, rightPoleH / 2, z);
      sceneRef.add(rightPole);
      objs.push(rightPole);

      // Crossbar on top of each pole
      const crossbarGeo = new THREE.BoxGeometry(0.1, 0.08, 3);
      const leftCrossbar = new THREE.Mesh(crossbarGeo, poleMat);
      leftCrossbar.position.set(leftPoleX, leftPoleH, z);
      sceneRef.add(leftCrossbar);
      objs.push(leftCrossbar);

      const rightCrossbar = new THREE.Mesh(crossbarGeo, poleMat);
      rightCrossbar.position.set(rightPoleX, rightPoleH, z);
      sceneRef.add(rightCrossbar);
      objs.push(rightCrossbar);

      // Wire connecting the two poles (catenary curve approximation)
      const wireSegments = 12;
      const sagAmount = 1.5; // How much the wire sags
      for (let i = 0; i < wireSegments; i++) {
        const t1 = i / wireSegments;
        const t2 = (i + 1) / wireSegments;

        const wx1 = leftPoleX + t1 * (rightPoleX - leftPoleX);
        const wx2 = leftPoleX + t2 * (rightPoleX - leftPoleX);

        // Catenary sag: y = h - sag * 4 * t * (1-t)
        const wy1 = leftPoleH - sagAmount * 4 * t1 * (1 - t1);
        const wy2 = leftPoleH - sagAmount * 4 * t2 * (1 - t2);

        const wireLen = Math.sqrt((wx2 - wx1) ** 2 + (wy2 - wy1) ** 2);
        const wireGeo = new THREE.CylinderGeometry(0.03, 0.03, wireLen, 4);
        const wire = new THREE.Mesh(wireGeo, wireMat);
        wire.position.set((wx1 + wx2) / 2, (wy1 + wy2) / 2, z);
        wire.lookAt(new THREE.Vector3(wx2, wy2, z));
        wire.rotateX(Math.PI / 2);
        sceneRef.add(wire);
        objs.push(wire);

        // Store wire bounds for collision detection
        powerLines.push({
          x1: wx1, y1: wy1, z1: z,
          x2: wx2, y2: wy2, z2: z,
          radius: 0.15
        });
      }
    }
  }

  // Check vertical roads (along X axis, at specific Z positions)
  for (let z = oz; z < oz + size; z += BLOCK_SIZE) {
    const blockInGroupZ = (Math.floor(z / BLOCK_SIZE) % 2 + 2) % 2;
    if (blockInGroupZ !== 0) continue;

    for (let x = ox + 10; x < ox + size - 10; x += 20 + rng() * 15) {
      const roadHalf = ROAD_WIDTH_MAIN / 2 + SIDEWALK_WIDTH + 2;

      // Front side pole
      const frontPoleZ = z - roadHalf;
      const frontPoleH = 12 + rng() * 8;
      const frontPole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.12, 0.18, frontPoleH, 6),
        poleMat
      );
      frontPole.position.set(x, frontPoleH / 2, frontPoleZ);
      sceneRef.add(frontPole);
      objs.push(frontPole);

      // Back side pole
      const backPoleZ = z + roadHalf;
      const backPoleH = 12 + rng() * 8;
      const backPole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.12, 0.18, backPoleH, 6),
        poleMat
      );
      backPole.position.set(x, backPoleH / 2, backPoleZ);
      sceneRef.add(backPole);
      objs.push(backPole);

      // Crossbars
      const crossbarGeo = new THREE.BoxGeometry(3, 0.08, 0.1);
      const frontCrossbar = new THREE.Mesh(crossbarGeo, poleMat);
      frontCrossbar.position.set(x, frontPoleH, frontPoleZ);
      sceneRef.add(frontCrossbar);
      objs.push(frontCrossbar);

      const backCrossbar = new THREE.Mesh(crossbarGeo, poleMat);
      backCrossbar.position.set(x, backPoleH, backPoleZ);
      sceneRef.add(backCrossbar);
      objs.push(backCrossbar);

      // Wire
      const wireSegments = 12;
      const sagAmount = 1.5;
      for (let i = 0; i < wireSegments; i++) {
        const t1 = i / wireSegments;
        const t2 = (i + 1) / wireSegments;

        const wz1 = frontPoleZ + t1 * (backPoleZ - frontPoleZ);
        const wz2 = frontPoleZ + t2 * (backPoleZ - frontPoleZ);

        const wy1 = frontPoleH - sagAmount * 4 * t1 * (1 - t1);
        const wy2 = frontPoleH - sagAmount * 4 * t2 * (1 - t2);

        const wireLen = Math.sqrt((wz2 - wz1) ** 2 + (wy2 - wy1) ** 2);
        const wireGeo = new THREE.CylinderGeometry(0.03, 0.03, wireLen, 4);
        const wire = new THREE.Mesh(wireGeo, wireMat);
        wire.position.set(x, (wy1 + wy2) / 2, (wz1 + wz2) / 2);
        wire.lookAt(new THREE.Vector3(x, wy2, wz2));
        wire.rotateX(Math.PI / 2);
        sceneRef.add(wire);
        objs.push(wire);

        powerLines.push({
          x1: x, y1: wy1, z1: wz1,
          x2: x, y2: wy2, z2: wz2,
          radius: 0.15
        });
      }
    }
  }
}

// === BRIDGE SYSTEM ===
// Store bridge data for collision detection
export const bridges = [];

// Bridge parameters
const BRIDGE_HEIGHT = 20; // Height above ground (meters)
const BRIDGE_WIDTH = ROAD_WIDTH_MAIN * 2; // Bridge width
const BRIDGE_LENGTH = BLOCK_SIZE * 1.5; // Bridge length
const BRIDGE_THICKNESS = 0.8; // Bridge deck thickness
const HOLE_SIZE = 2.0; // Hole size (2m x 2m, allows Air3/Mini4/Mavic3 to pass)
const HOLE_COUNT = 3; // Number of holes per bridge

function createBridge(ox, oz, size, objs, rng) {
  const group = new THREE.Group();

  // Determine bridge position (cross over a road intersection)
  const bridgeX = ox + size / 2 + (rng() - 0.5) * size * 0.3;
  const bridgeZ = oz + size / 2 + (rng() - 0.5) * size * 0.3;

  // Bridge direction (cross over main road)
  const bridgeAngle = rng() > 0.5 ? 0 : Math.PI / 2;

  // Bridge deck (main structure)
  const deckGeo = new THREE.BoxGeometry(BRIDGE_WIDTH, BRIDGE_THICKNESS, BRIDGE_LENGTH);
  const deckMat = new THREE.MeshLambertMaterial({ color: 0x666666 });
  const deck = new THREE.Mesh(deckGeo, deckMat);
  deck.position.y = BRIDGE_HEIGHT;
  deck.castShadow = true;
  deck.receiveShadow = true;
  group.add(deck);

  // Bridge railings
  const railingHeight = 1.2;
  const railingMat = new THREE.MeshLambertMaterial({ color: 0x444444 });

  // Left railing
  const leftRailingGeo = new THREE.BoxGeometry(0.15, railingHeight, BRIDGE_LENGTH);
  const leftRailing = new THREE.Mesh(leftRailingGeo, railingMat);
  leftRailing.position.set(-BRIDGE_WIDTH / 2 + 0.15, BRIDGE_HEIGHT + railingHeight / 2, 0);
  group.add(leftRailing);

  // Right railing
  const rightRailing = new THREE.Mesh(leftRailingGeo.clone(), railingMat);
  rightRailing.position.set(BRIDGE_WIDTH / 2 - 0.15, BRIDGE_HEIGHT + railingHeight / 2, 0);
  group.add(rightRailing);

  // === HOLES IN BRIDGE DECK ===
  // Create holes that drones can fly through
  // Since we can't use CSG (Constructive Solid Geometry) easily in Three.js,
  // we'll create visual holes using transparency and define collision bounds

  const holePositions = [];
  for (let i = 0; i < HOLE_COUNT; i++) {
    // Distribute holes along the bridge
    const holeX = (i - (HOLE_COUNT - 1) / 2) * (BRIDGE_WIDTH / HOLE_COUNT);
    const holeZ = (rng() - 0.5) * BRIDGE_LENGTH * 0.5;

    holePositions.push({ x: holeX, z: holeZ });

    // Visual hole (dark rectangle on bridge deck)
    const holeGeo = new THREE.PlaneGeometry(HOLE_SIZE, HOLE_SIZE);
    holeGeo.rotateX(-Math.PI / 2);
    const holeMat = new THREE.MeshLambertMaterial({
      color: 0x222222,
      transparent: true,
      opacity: 0.8
    });
    const hole = new THREE.Mesh(holeGeo, holeMat);
    hole.position.set(holeX, BRIDGE_HEIGHT + 0.01, holeZ);
    group.add(hole);

    // Hole frame (edge markings)
    const frameMat = new THREE.MeshLambertMaterial({ color: 0xffaa00 }); // Yellow warning frame
    const frameThick = 0.1;

    // Frame edges
    const frameTop = new THREE.Mesh(
      new THREE.BoxGeometry(HOLE_SIZE + frameThick * 2, frameThick, frameThick),
      frameMat
    );
    frameTop.position.set(holeX, BRIDGE_HEIGHT + 0.02, holeZ - HOLE_SIZE / 2 - frameThick / 2);
    group.add(frameTop);

    const frameBottom = new THREE.Mesh(
      new THREE.BoxGeometry(HOLE_SIZE + frameThick * 2, frameThick, frameThick),
      frameMat
    );
    frameBottom.position.set(holeX, BRIDGE_HEIGHT + 0.02, holeZ + HOLE_SIZE / 2 + frameThick / 2);
    group.add(frameBottom);

    const frameLeft = new THREE.Mesh(
      new THREE.BoxGeometry(frameThick, frameThick, HOLE_SIZE),
      frameMat
    );
    frameLeft.position.set(holeX - HOLE_SIZE / 2 - frameThick / 2, BRIDGE_HEIGHT + 0.02, holeZ);
    group.add(frameLeft);

    const frameRight = new THREE.Mesh(
      new THREE.BoxGeometry(frameThick, frameThick, HOLE_SIZE),
      frameMat
    );
    frameRight.position.set(holeX + HOLE_SIZE / 2 + frameThick / 2, BRIDGE_HEIGHT + 0.02, holeZ);
    group.add(frameRight);
  }

  // Bridge support columns
  const supportMat = new THREE.MeshLambertMaterial({ color: 0x555555 });
  const supportRadius = 0.8;
  const supportGeo = new THREE.CylinderGeometry(supportRadius, supportRadius, BRIDGE_HEIGHT, 8);

  // Four corner supports
  const supportPositions = [
    [-BRIDGE_WIDTH / 2 + 1, -BRIDGE_LENGTH / 2 + 1],
    [BRIDGE_WIDTH / 2 - 1, -BRIDGE_LENGTH / 2 + 1],
    [-BRIDGE_WIDTH / 2 + 1, BRIDGE_LENGTH / 2 - 1],
    [BRIDGE_WIDTH / 2 - 1, BRIDGE_LENGTH / 2 - 1]
  ];

  supportPositions.forEach(([sx, sz]) => {
    const support = new THREE.Mesh(supportGeo, supportMat);
    support.position.set(sx, BRIDGE_HEIGHT / 2, sz);
    support.castShadow = true;
    group.add(support);
  });

  // Position the bridge
  group.position.set(bridgeX, 0, bridgeZ);
  group.rotation.y = bridgeAngle;
  sceneRef.add(group);
  objs.push(group);

  // Store bridge collision data
  // Bridge deck: solid except for holes
  const bridgeBounds = {
    // Bridge deck bounds (with rotation)
    minX: bridgeX - BRIDGE_WIDTH / 2,
    maxX: bridgeX + BRIDGE_WIDTH / 2,
    minY: BRIDGE_HEIGHT,
    maxY: BRIDGE_HEIGHT + BRIDGE_THICKNESS,
    minZ: bridgeZ - BRIDGE_LENGTH / 2,
    maxZ: bridgeZ + BRIDGE_LENGTH / 2,
    holes: holePositions.map(h => ({
      minX: bridgeX + h.x - HOLE_SIZE / 2,
      maxX: bridgeX + h.x + HOLE_SIZE / 2,
      minY: BRIDGE_HEIGHT - HOLE_SIZE / 2,
      maxY: BRIDGE_HEIGHT + BRIDGE_THICKNESS,
      minZ: bridgeZ + h.z - HOLE_SIZE / 2,
      maxZ: bridgeZ + h.z + HOLE_SIZE / 2
    })),
    angle: bridgeAngle
  };

  bridges.push(bridgeBounds);
}

// Add bridges to populateChunk
function addBridgesToChunk(ox, oz, size, objs, rng) {
  // Create 1-2 bridges per chunk
  const numBridges = Math.floor(rng() * 2) + 1;

  for (let i = 0; i < numBridges; i++) {
    createBridge(ox + i * size / 2, oz, size, objs, rng);
  }
}
