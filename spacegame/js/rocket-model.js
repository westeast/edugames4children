// Rocket 3D models + engine visualization (5 rockets from real-world data)
import * as THREE from 'three';
import { scene } from './engine.js';
import { ROCKETS, state } from './config.js';

export let rocketGroup = null;
export let engineFlames = [];
export let boosterGroups = [];
export let escapeTower = null;

// === Engine flame (cone with glow) ===
function createEngineFlame(count) {
  const group = new THREE.Group();
  for (let i = 0; i < count; i++) {
    // Flame cone (orange → yellow gradient via emissive material)
    const flameGeo = new THREE.ConeGeometry(0.15, 0.8, 8);
    const flameMat = new THREE.MeshBasicMaterial({ color: 0xffaa33, transparent: true, opacity: 0 });
    const flame = new THREE.Mesh(flameGeo, flameMat);
    flame.rotation.z = Math.PI; // Point downward
    flame.position.y = -0.5;
    group.add(flame);

    // Flame glow (point light)
    const glow = new THREE.PointLight(0xff6622, 0, 10);
    glow.position.y = -0.8;
    group.add(glow);
  }
  return group;
}

// === Engine positions for different rocket types ===
function getEnginePositions(count, radius) {
  const positions = [];
  if (count <= 1) {
    positions.push(new THREE.Vector3(0, 0, -radius));
  } else if (count <= 4) {
    // Square cluster (CZ-2C style)
    const s = radius * 0.5;
    for (let i = 0; i < 4; i++) {
      positions.push(new THREE.Vector3(
        (i % 2 === 0 ? -1 : 1) * s, 0, -(radius + (i % 2 === 0 ? 0.5 : 0))
      ));
    }
  } else if (count <= 9) {
    // Octaweb pattern (Falcon 9 style): center + ring of 8, offset outer
    positions.push(new THREE.Vector3(0, 0, -radius)); // Center
    const r = radius * 0.7;
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      positions.push(new THREE.Vector3(
        Math.cos(angle) * r + (i % 2 === 0 ? radius*0.15 : 0), // Offset for gas generator space
        Math.sin(angle) * r,
        -(radius + 0.3)
      ));
    }
  } else {
    // Concentric rings (Starship / CZ-5 style)
    const innerR = radius * 0.2;
    const outerR = radius * 0.7;
    // Inner ring
    const innerCount = Math.min(3, count);
    for (let i = 0; i < innerCount; i++) {
      const a = (i / innerCount) * Math.PI * 2;
      positions.push(new THREE.Vector3(Math.cos(a)*innerR, Math.sin(a)*innerR, -radius));
    }
    // Middle ring
    const midCount = Math.min(10, count - innerCount);
    const remaining = count - innerCount;
    for (let i = 0; i < Math.min(midCount, remaining); i++) {
      const a = (i / midCount) * Math.PI * 2;
      positions.push(new THREE.Vector3(Math.cos(a)*innerR*1.5, Math.sin(a)*innerR*1.5, -radius));
    }
    // Outer ring
    const outerCount = count - innerCount - (remaining > 0 ? midCount : 0);
    for (let i = 0; i < Math.min(outerCount, remaining); i++) {
      const a = (i / Math.max(outerCount,1)) * Math.PI * 2;
      positions.push(new THREE.Vector3(Math.cos(a)*outerR, Math.sin(a)*outerR, -radius));
    }
  }
  return positions;
}

// === Build rocket body (cylinder with tapered top) ===
function buildRocketBody(height, radius, color, isBoosted) {
  const group = new THREE.Group();

  // Main body cylinder
  const bodyGeo = new THREE.CylinderGeometry(radius, radius * 0.95, height, 24);
  const bodyMat = new THREE.MeshStandardMaterial({
    color: color, metalness: 0.6, roughness: 0.3
  });
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  group.add(body);

  // Tapered top (cone)
  const topGeo = new THREE.ConeGeometry(radius * 0.95, height * 0.15, 24);
  const topMat = new THREE.MeshStandardMaterial({ color: color, metalness: 0.6, roughness: 0.3 });
  const top = new THREE.Mesh(topGeo, topMat);
  top.position.y = height / 2 + height * 0.075;
  group.add(top);

  // Engine ring at bottom
  const engRingGeo = new THREE.CylinderGeometry(radius * 1.1, radius, 0.3, 24);
  const engRingMat = new THREE.MeshStandardMaterial({ color: 0x888888, metalness: 0.9, roughness: 0.2 });
  const engRing = new THREE.Mesh(engRingGeo, engRingMat);
  engRing.position.y = -height / 2;
  group.add(engRing);

  // Engine nozzles (smaller cones at bottom)
  const nozzleCount = Math.min(9, Math.ceil(radius * 8)); // Estimate based on size
  const positions = getEnginePositions(nozzleCount, radius);

  for (let i = 0; i < nozzleCount; i++) {
    const nozzleGeo = new THREE.ConeGeometry(radius * 0.12, 0.3, 8);
    const nozzleMat = new THREE.MeshStandardMaterial({ color: 0x666666, metalness: 0.9 });
    const nozzle = new THREE.Mesh(nozzleGeo, nozzleMat);
    nozzle.position.copy(positions[i]);
    nozzle.rotation.z = Math.PI; // Point down
    group.add(nozzle);

    // Flame for each engine (direct creation, no intermediate group)
    const flameGeo2 = new THREE.ConeGeometry(0.14, 0.6, 8);
    const flameMat2 = new THREE.MeshBasicMaterial({ color: 0xffaa33, transparent: true, opacity: 0 });
    const flame = new THREE.Mesh(flameGeo2, flameMat2);
    flame.position.copy(positions[i]);
    flame.position.y -= 0.6;
    flame.rotation.z = Math.PI;
    group.add(flame);
    engineFlames.push(flame);
  }

  return group;
}

// === Build individual rockets ===
export function createRocketModel(rocketId) {
  if (rocketGroup) scene.remove(rocketGroup);
  rocketGroup = null;
  engineFlames.length = 0; // Clear flame references to avoid dangling pointers
  boosterGroups = [];
  escapeTower = null;

  switch (rocketId) {
    case 'starship': buildStarship(); break;
    case 'falcon9': buildFalcon9(); break;
    case 'falcon_heavy': buildFalconHeavy(); break;
    case 'cz5': buildCZ5(); break;
    case 'cz2c': buildCZ2C(); break;
  }

  return rocketGroup;
}

function buildStarship() {
  const group = new THREE.Group();

  // Super Heavy booster (lower section)
  const shBodyGeo = new THREE.CylinderGeometry(5, 4.8, 71, 24);
  const shMat = new THREE.MeshStandardMaterial({ color: 0x99aacc, metalness: 0.8, roughness: 0.2 });
  const shBody = new THREE.Mesh(shBodyGeo, shMat);
  shBody.position.y = -35.5; // Center at origin
  group.add(shBody);

  // Starship upper section (silver stainless steel)
  const ssBodyGeo = new THREE.CylinderGeometry(4.5, 4.5, 50, 24);
  const ssMat = new THREE.MeshStandardMaterial({ color: 0xccccdd, metalness: 0.9, roughness: 0.15 });
  const ssBody = new THREE.Mesh(ssBodyGeo, ssMat);
  ssBody.position.y = 25;
  group.add(ssBody);

  // Conical top for Starship
  const ssTopGeo = new THREE.ConeGeometry(4.5, 8, 24);
  const ssTop = new THREE.Mesh(ssTopGeo, ssMat);
  ssTop.position.y = 53;
  group.add(ssTop);

  // Engine ring at bottom of Super Heavy (33 Raptor 3 engines)
  const engRingGeo = new THREE.CylinderGeometry(5.2, 5, 0.4, 24);
  const engRingMat = new THREE.MeshStandardMaterial({ color: 0x7788aa, metalness: 0.9 });
  const engRing = new THREE.Mesh(engRingGeo, engRingMat);
  engRing.position.y = -35.7;
  group.add(engRing);

  // Engine nozzles (33) + flames
  for (let i = 0; i < 33; i++) {
    const nozzleGeo = new THREE.ConeGeometry(0.25, 0.4, 8);
    const nozzleMat = new THREE.MeshStandardMaterial({ color: 0x556677, metalness: 0.9 });
    const nozzle = new THREE.Mesh(nozzleGeo, nozzleMat);

    // Ring layout for 33 engines: inner(3) + middle(10) + outer(20)
    let pos;
    if (i < 3) { // Inner ring
      const a = (i / 3) * Math.PI * 2;
      pos = new THREE.Vector3(Math.cos(a)*1.5, -36, Math.sin(a)*1.5);
    } else if (i < 13) { // Middle ring
      const idx = i - 3;
      const a = (idx / 10) * Math.PI * 2;
      pos = new THREE.Vector3(Math.cos(a)*3, -36, Math.sin(a)*3);
    } else { // Outer ring
      const idx = i - 13;
      const a = (idx / 20) * Math.PI * 2;
      pos = new THREE.Vector3(Math.cos(a)*4.5, -36, Math.sin(a)*4.5);
    }

    nozzle.position.copy(pos);
    nozzle.rotation.z = Math.PI;
    group.add(nozzle);

    // Flame (direct creation)
    const flameGeo2 = new THREE.ConeGeometry(0.18, 0.7, 8);
    const flameMat2 = new THREE.MeshBasicMaterial({ color: 0xffaa33, transparent: true, opacity: 0 });
    const flame = new THREE.Mesh(flameGeo2, flameMat2);
    flame.position.set(pos.x, pos.y - 0.6, pos.z);
    flame.rotation.z = Math.PI;
    group.add(flame);
    engineFlames.push(flame);
  }

  // Engine ring at top section (24 Raptor engines: 6 sea level + 18 vacuum)
  const ssEngGeo = new THREE.CylinderGeometry(4.7, 4.5, 0.3, 24);
  const ssEngMat = new THREE.MeshStandardMaterial({ color: 0x99aabb, metalness: 0.9 });
  const ssEngRing = new THREE.Mesh(ssEngGeo, ssEngMat);
  ssEngRing.position.y = -0.15;
  group.add(ssEngRing);

  // Upper engine nozzles (24) + flames
  for (let i = 0; i < 24; i++) {
    const r = 3.5;
    const a = (i / 24) * Math.PI * 2;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;

    const nozzleGeo = new THREE.ConeGeometry(0.18, 0.35, 8);
    const nozzleMat = new THREE.MeshStandardMaterial({ color: 0x667788, metalness: 0.9 });
    const nozzle = new THREE.Mesh(nozzleGeo, nozzleMat);
    nozzle.position.set(x, -0.35, z);
    nozzle.rotation.z = Math.PI;
    group.add(nozzle);

    // Flame for upper engines (add to engineFlames)
    const flameGeo2 = new THREE.ConeGeometry(0.14, 0.6, 8);
    const flameMat2 = new THREE.MeshBasicMaterial({ color: 0xffaa33, transparent: true, opacity: 0 });
    const flame = new THREE.Mesh(flameGeo2, flameMat2);
    flame.position.set(x, -0.75, z);
    flame.rotation.z = Math.PI;
    group.add(flame);
    engineFlames.push(flame);
  }

  // Escape tower (for crewed mode)
  const towerGeo = new THREE.CylinderGeometry(0.1, 0.1, 6, 8);
  const towerMat = new THREE.MeshStandardMaterial({ color: 0xeeeeee });
  escapeTower = new THREE.Mesh(towerGeo, towerMat);
  escapeTower.position.y = 57;
  group.add(escapeTower);

  // Escape tower nose cone
  const noseGeo = new THREE.ConeGeometry(0.3, 1.5, 8);
  const noseMat = new THREE.MeshStandardMaterial({ color: 0xff4444 });
  const nose = new THREE.Mesh(noseGeo, noseMat);
  nose.position.y = 60;
  escapeTower.add(nose);

  rocketGroup = group;
  scene.add(rocketGroup);
}

function buildFalcon9() {
  const group = new THREE.Group();

  // First stage (orange thermal blanket)
  const fsGeo = new THREE.CylinderGeometry(1.675, 1.675, 43.8, 24);
  const fsMat = new THREE.MeshStandardMaterial({ color: 0xdd6622, metalness: 0.4, roughness: 0.5 });
  const fsBody = new THREE.Mesh(fsGeo, fsMat);
  fsBody.position.y = -21.9;
  group.add(fsBody);

  // Second stage (white)
  const ssGeo = new THREE.CylinderGeometry(1.2, 1.2, 4, 24);
  const ssMat = new THREE.MeshStandardMaterial({ color: 0xeeeeee, metalness: 0.6 });
  const ssBody = new THREE.Mesh(ssGeo, ssMat);
  ssBody.position.y = 22;
  group.add(ssBody);

  // Second stage top (cone)
  const stGeo = new THREE.ConeGeometry(1.2, 3, 24);
  const stTop = new THREE.Mesh(stGeo, ssMat);
  stTop.position.y = 25.5;
  group.add(stTop);

  // Engine ring at bottom (9 Merlin engines - Octaweb)
  const engRingGeo = new THREE.CylinderGeometry(1.8, 1.675, 0.3, 24);
  const engRingMat = new THREE.MeshStandardMaterial({ color: 0x888888, metalness: 0.9 });
  const engRing = new THREE.Mesh(engRingGeo, engRingMat);
  engRing.position.y = -21.95;
  group.add(engRing);

  // Engine nozzles (9) + flames
  for (let i = 0; i < 9; i++) {
    let x, z;
    if (i === 0) {
      x = 0; z = -1.4; // Center
    } else {
      const angle = ((i - 1) / 8) * Math.PI * 2;
      const r = 1.2;
      x = Math.cos(angle) * r + (i % 2 === 0 ? 0.3 : 0); // Offset for gas generator space
      z = Math.sin(angle) * r;
    }

    const nozzleGeo = new THREE.ConeGeometry(0.18, 0.35, 8);
    const nozzleMat = new THREE.MeshStandardMaterial({ color: 0x666666, metalness: 0.9 });
    const nozzle = new THREE.Mesh(nozzleGeo, nozzleMat);
    nozzle.position.set(x, -21.85, z);
    nozzle.rotation.z = Math.PI;
    group.add(nozzle);

    // Flame (direct creation)
    const flameGeo2 = new THREE.ConeGeometry(0.14, 0.6, 8);
    const flameMat2 = new THREE.MeshBasicMaterial({ color: 0xffaa33, transparent: true, opacity: 0 });
    const flame = new THREE.Mesh(flameGeo2, flameMat2);
    flame.position.set(x, -22.3, z);
    flame.rotation.z = Math.PI;
    group.add(flame);
    engineFlames.push(flame);
  }

  // MVac engine at top of second stage
  const mvacGeo = new THREE.CylinderGeometry(0.6, 0.825, 0.3, 24);
  const mvacMat = new THREE.MeshStandardMaterial({ color: 0x99aabb, metalness: 0.9 });
  const mvacRing = new THREE.Mesh(mvacGeo, mvacMat);
  mvacRing.position.y = 19.85;
  group.add(mvacRing);

  // Escape tower (crewed mode)
  const towerGeo = new THREE.CylinderGeometry(0.06, 0.06, 4, 8);
  const towerMat = new THREE.MeshStandardMaterial({ color: 0xeeeeee });
  escapeTower = new THREE.Mesh(towerGeo, towerMat);
  escapeTower.position.y = 27;
  group.add(escapeTower);

  rocketGroup = group;
  scene.add(rocketGroup);
}

function buildFalconHeavy() {
  const group = new THREE.Group();

  // Center core (same as Falcon 9)
  const ccGeo = new THREE.CylinderGeometry(1.675, 1.675, 50, 24);
  const ccMat = new THREE.MeshStandardMaterial({ color: 0xeeeeee, metalness: 0.5 });
  group.add(new THREE.Mesh(ccGeo, ccMat));

  // Left booster (attached to side)
  const lbGeo = new THREE.CylinderGeometry(1.675, 1.675, 43.8, 24);
  const lbMat = new THREE.MeshStandardMaterial({ color: 0xdd6622, metalness: 0.4 });
  const lbBody = new THREE.Mesh(lbGeo, lbMat);
  lbBody.position.set(-2.5, -19, 0);
  group.add(lbBody);

  // Right booster (attached to side)
  const rbGeo = new THREE.CylinderGeometry(1.675, 1.675, 43.8, 24);
  const rbMat = new THREE.MeshStandardMaterial({ color: 0xdd6622, metalness: 0.4 });
  const rbBody = new THREE.Mesh(rbGeo, rbMat);
  rbBody.position.set(2.5, -19, 0);
  group.add(rbBody);

  // Top section (white)
  const stGeo = new THREE.ConeGeometry(1.675, 4, 24);
  const stTop = new THREE.Mesh(stGeo, ccMat);
  stTop.position.y = 27;
  group.add(stTop);

  // Engine rings for all three boosters at bottom (27 total: 9+9+9)
  let globalIdx = 0;
  for (let side = -1; side <= 1; side++) {
    const offsetX = side * 2.5;
    for (let i = 0; i < 9; i++) {
      let x, z;
      if (i === 0) { x = 0; z = -1.4; }
      else {
        const angle = ((i-1)/8)*Math.PI*2;
        const r = 1.2;
        x = Math.cos(angle)*r + (i%2===0 ? 0.3 : 0);
        z = Math.sin(angle)*r;
      }

      const nozzleGeo = new THREE.ConeGeometry(0.18, 0.35, 8);
      const nozzleMat = new THREE.MeshStandardMaterial({ color: 0x666666, metalness: 0.9 });
      const nozzle = new THREE.Mesh(nozzleGeo, nozzleMat);
      nozzle.position.set(offsetX + x, -21.85, z);
      nozzle.rotation.z = Math.PI;
      group.add(nozzle);

      // Flame (direct creation)
      const flameGeo2 = new THREE.ConeGeometry(0.14, 0.6, 8);
      const flameMat2 = new THREE.MeshBasicMaterial({ color: 0xffaa33, transparent: true, opacity: 0 });
      const flame = new THREE.Mesh(flameGeo2, flameMat2);
      flame.position.set(offsetX + x, -22.3, z);
      flame.rotation.z = Math.PI;
      group.add(flame);
      engineFlames.push(flame);
      globalIdx++;
    }
  }

  escapeTower = new THREE.Mesh(
    new THREE.CylinderGeometry(0.06, 0.06, 4, 8),
    new THREE.MeshStandardMaterial({ color: 0xeeeeee })
  );
  escapeTower.position.y = 31;
  group.add(escapeTower);

  rocketGroup = group;
  scene.add(rocketGroup);
}

function buildCZ5() {
  const group = new THREE.Group();

  // Core stage (white, 5m diameter)
  const coreGeo = new THREE.CylinderGeometry(2.5, 2.5, 33.3, 24);
  const coreMat = new THREE.MeshStandardMaterial({ color: 0xeeeeee, metalness: 0.5 });
  group.add(new THREE.Mesh(coreGeo, coreMat));

  // 4 boosters (orange, 3.35m diameter each)
  const boosterPositions = [
    { x: -2.8, z: 0 },   // Left outer
    { x: -1.4, z: 1.7 }, // Left inner
    { x: 1.4, z: 1.7 },  // Right inner
    { x: 2.8, z: 0 },    // Right outer
  ];

  boosterPositions.forEach(bp => {
    const bGeo = new THREE.CylinderGeometry(1.675, 1.675, 16.1, 24);
    const bMat = new THREE.MeshStandardMaterial({ color: 0xdd8833, metalness: 0.4 });
    const booster = new THREE.Mesh(bGeo, bMat);
    booster.position.set(bp.x, -8, bp.z);
    group.add(booster);

    // Store for separation animation
    boosterGroups.push({ mesh: booster, offsetX: bp.x, offsetZ: bp.z, active: true });
  });

  // Second stage (white)
  const ssGeo = new THREE.CylinderGeometry(2.5, 2.5, 13.4, 24);
  const ssBody = new THREE.Mesh(ssGeo, coreMat);
  ssBody.position.y = 23;
  group.add(ssBody);

  // Top cone
  const topGeo = new THREE.ConeGeometry(2.5, 3, 24);
  const top = new THREE.Mesh(topGeo, coreMat);
  top.position.y = 31.7;
  group.add(top);

  // Core engines (2x YF-77)
  for (let i = 0; i < 2; i++) {
    const nozzleGeo = new THREE.ConeGeometry(0.4, 0.5, 8);
    const nozzleMat = new THREE.MeshStandardMaterial({ color: 0x666666, metalness: 0.9 });
    const nozzle = new THREE.Mesh(nozzleGeo, nozzleMat);
    nozzle.position.set(i === 0 ? -0.5 : 0.5, -16.65, 0);
    nozzle.rotation.z = Math.PI;
    group.add(nozzle);

    const flameGeo2 = new THREE.ConeGeometry(0.3, 0.8, 8);
    const flameMat2 = new THREE.MeshBasicMaterial({ color: 0xffaa33, transparent: true, opacity: 0 });
    const flame = new THREE.Mesh(flameGeo2, flameMat2);
    flame.position.set(i === 0 ? -0.5 : 0.5, -17.2, 0);
    flame.rotation.z = Math.PI;
    group.add(flame);
    engineFlames.push(flame);
  }

  // Booster engines (8x YF-100, 2 per booster)
  for (const bp of boosterPositions) {
    for (let i = 0; i < 2; i++) {
      const nozzleGeo = new THREE.ConeGeometry(0.3, 0.45, 8);
      const nozzleMat = new THREE.MeshStandardMaterial({ color: 0x666666, metalness: 0.9 });
      const nozzle = new THREE.Mesh(nozzleGeo, nozzleMat);
      nozzle.position.set(bp.x + (i===0?-0.3:i===1?0.3:0), -8, bp.z + (i===0?-0.2:i===1?0.2:0));
      nozzle.rotation.z = Math.PI;
      group.add(nozzle);

      const flameGeo2 = new THREE.ConeGeometry(0.25, 0.7, 8);
      const flameMat2 = new THREE.MeshBasicMaterial({ color: 0xffaa33, transparent: true, opacity: 0 });
      const flame = new THREE.Mesh(flameGeo2, flameMat2);
      flame.position.set(bp.x + (i===0?-0.3:i===1?0.3:0), -8.5, bp.z + (i===0?-0.2:i===1?0.2:0));
      flame.rotation.z = Math.PI;
      group.add(flame);
      engineFlames.push(flame);
    }
  }

  escapeTower = new THREE.Mesh(
    new THREE.CylinderGeometry(0.06, 0.06, 4, 8),
    new THREE.MeshStandardMaterial({ color: 0xeeeeee })
  );
  escapeTower.position.y = 35;
  group.add(escapeTower);

  rocketGroup = group;
  scene.add(rocketGroup);
}

function buildCZ2C() {
  const group = new THREE.Group();

  // First stage (green/gray)
  const fsGeo = new THREE.CylinderGeometry(1.675, 1.675, 26.6, 24);
  const fsMat = new THREE.MeshStandardMaterial({ color: 0x889988, metalness: 0.4 });
  group.add(new THREE.Mesh(fsGeo, fsMat));

  // Second stage (white)
  const ssGeo = new THREE.CylinderGeometry(1.2, 1.2, 8.3, 24);
  const ssMat = new THREE.MeshStandardMaterial({ color: 0xeeeeee, metalness: 0.5 });
  group.add(new THREE.Mesh(ssGeo, ssMat));

  // Top cone
  const topGeo = new THREE.ConeGeometry(1.2, 2.5, 24);
  const top = new THREE.Mesh(topGeo, ssMat);
  top.position.y = 17;
  group.add(top);

  // Engine cluster (4x YF-20A combined as single cluster)
  for (let i = 0; i < 4; i++) {
    const angle = (i / 4) * Math.PI * 2;
    const r = 0.6;
    const nozzleGeo = new THREE.ConeGeometry(0.15, 0.35, 8);
    const nozzleMat = new THREE.MeshStandardMaterial({ color: 0x666666, metalness: 0.9 });
    const nozzle = new THREE.Mesh(nozzleGeo, nozzleMat);
    nozzle.position.set(Math.cos(angle)*r, -13.3, Math.sin(angle)*r);
    nozzle.rotation.z = Math.PI;
    group.add(nozzle);

    // Flame (single combined flame for cluster)
    const flameGeo2 = new THREE.ConeGeometry(0.4, 0.8, 8);
    const flameMat2 = new THREE.MeshBasicMaterial({ color: 0xffaa33, transparent: true, opacity: 0 });
    const flame = new THREE.Mesh(flameGeo2, flameMat2);
    flame.position.set(0, -13.7, 0);
    flame.rotation.z = Math.PI;
    group.add(flame);
    engineFlames.push(flame);
  }

  escapeTower = new THREE.Mesh(
    new THREE.CylinderGeometry(0.05, 0.05, 3, 8),
    new THREE.MeshStandardMaterial({ color: 0xeeeeee })
  );
  escapeTower.position.y = 19;
  group.add(escapeTower);

  rocketGroup = group;
  scene.add(rocketGroup);
}

// === Light / extinguish all engines ===
export function setEnginesLit(lit) {
  engineFlames.forEach(flame => {
    flame.material.opacity = lit ? 0.8 : 0;
    flame.visible = lit;
  });
}
