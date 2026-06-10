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
  const { localX, localZ } = getBlockCoords(x, z);
  const halfMain = ROAD_WIDTH_MAIN / 2;

  // Check if in roundabout
  const centerDist = Math.sqrt((localX - BLOCK_SIZE / 2) ** 2 + (localZ - BLOCK_SIZE / 2) ** 2);
  if (centerDist < ROAD_WIDTH_MAIN * 1.2 && centerDist > ROAD_WIDTH_MAIN * 0.4) {
    // In roundabout - return tangent direction for curved movement
    const angle = Math.atan2(localZ - BLOCK_SIZE / 2, localX - BLOCK_SIZE / 2);
    return angle + Math.PI / 2;
  }

  // Determine if we're closer to an X-aligned road or Z-aligned road
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

  // Road markings (lane lines)
  createRoadMarkings(ox, oz, CHUNK_SIZE, objs);

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

  // Windows and door details
  const windowRows = Math.max(2, Math.floor(h / 8));
  const windowColsFront = Math.max(2, Math.floor(w / 6));
  const windowColsSide = Math.max(2, Math.floor(d / 6));
  const glassColor = glassColors[Math.floor(rng() * glassColors.length)];

  // Window size
  const winW = Math.min(w / windowColsFront * 0.6, 2);
  const winH = Math.min(h / windowRows * 0.5, 2);
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
      const yPos = 3 + row * (h / windowRows);
      win.position.set(xPos, yPos, d / 2 + winD / 2);
      group.add(win);
    }
  }

  // Back face windows (-Z)
  for (let row = 0; row < windowRows; row++) {
    for (let col = 0; col < windowColsFront; col++) {
      const win = new THREE.Mesh(winGeo, winMat);
      const xPos = -w / 2 + (col + 0.5) * (w / windowColsFront);
      const yPos = 3 + row * (h / windowRows);
      win.position.set(xPos, yPos, -d / 2 - winD / 2);
      group.add(win);
    }
  }

  // Left face windows (-X)
  for (let row = 0; row < windowRows; row++) {
    for (let col = 0; col < windowColsSide; col++) {
      const win = new THREE.Mesh(winGeo, winMat);
      const zPos = -d / 2 + (col + 0.5) * (d / windowColsSide);
      const yPos = 3 + row * (h / windowRows);
      win.position.set(-w / 2 - winD / 2, yPos, zPos);
      group.add(win);
    }
  }

  // Right face windows (+X)
  for (let row = 0; row < windowRows; row++) {
    for (let col = 0; col < windowColsSide; col++) {
      const win = new THREE.Mesh(winGeo, winMat);
      const zPos = -d / 2 + (col + 0.5) * (d / windowColsSide);
      const yPos = 3 + row * (h / windowRows);
      win.position.set(w / 2 + winD / 2, yPos, zPos);
      group.add(win);
    }
  }

  // Door (front face, ground level)
  const doorW = Math.min(w * 0.3, 3);
  const doorH = 3.5;
  const doorD = 0.2;
  const doorGeo = new THREE.BoxGeometry(doorW, doorH, doorD);
  const doorMat = new THREE.MeshLambertMaterial({ color: 0x4a3728 });
  const door = new THREE.Mesh(doorGeo, doorMat);
  door.position.set(0, doorH / 2, d / 2 + doorD / 2);
  group.add(door);

  // Door frame
  const frameThick = 0.15;
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
  const canopyGeo = new THREE.BoxGeometry(doorW + 1, 0.1, 1.5);
  const canopyMat = new THREE.MeshLambertMaterial({
    color: 0x88aacc,
    transparent: true,
    opacity: 0.4
  });
  const canopy = new THREE.Mesh(canopyGeo, canopyMat);
  canopy.position.set(0, doorH + 0.5, d / 2 + 0.5);
  group.add(canopy);

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
  // Lane markings on main roads
  const markingGeo = new THREE.PlaneGeometry(1, 3);
  markingGeo.rotateX(-Math.PI / 2);
  const markingMat = new THREE.MeshLambertMaterial({ color: 0xffffff });

  // This is simplified - in a full implementation we'd trace road edges
  // For now, add some markings near block boundaries
  for (let x = ox; x < ox + size; x += BLOCK_SIZE) {
    for (let z = oz; z < oz + size; z += 8) {
      const marking = new THREE.Mesh(markingGeo, markingMat);
      marking.position.set(x, 0.05, z);
      sceneRef.add(marking);
      objs.push(marking);
    }
  }

  for (let z = oz; z < oz + size; z += BLOCK_SIZE) {
    for (let x = ox; x < ox + size; x += 8) {
      const marking = new THREE.Mesh(markingGeo.clone(), markingMat);
      marking.rotation.y = Math.PI / 2;
      marking.position.set(x, 0.05, z);
      sceneRef.add(marking);
      objs.push(marking);
    }
  }
}

// Export constants for entities
export const ROAD_WIDTH = ROAD_WIDTH_MAIN;
