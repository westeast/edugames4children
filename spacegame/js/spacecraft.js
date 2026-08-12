// Spacecraft 3D models + return sequence
import * as THREE from 'three';
import { scene } from './engine.js';
import { state } from './config.js';

export let crewCapsule = null;
export let serviceModule = null;
export let orbitalModule = null;
export let drogueChutes = [];
export let mainParachutes = [];
export let plasmaTrail = null;
export let retroFlames = [];

// === Create Shenzhou-type crewed capsule (3 modules) ===
export function createCrewCapsule() {
  if (crewCapsule) {
    // Properly dispose before removing to avoid dangling parent refs
    crewCapsule.traverse(child => {
      if (child.isMesh || child.isPoints) {
        if (child.material) {
          const mat = Array.isArray(child.material) ? child.material : [child.material];
          mat.forEach(m => { m.dispose && m.dispose(); });
        }
        if (child.geometry) child.geometry.dispose && child.geometry.dispose();
      }
    });
    scene.remove(crewCapsule);
  }
  crewCapsule = new THREE.Group();

  // Orbital Module (front) - cylindrical
  const omGeo = new THREE.CylinderGeometry(0.8, 0.8, 2, 32);
  const omMat = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.5 });
  orbitalModule = new THREE.Mesh(omGeo, omMat);
  orbitalModule.position.z = 2.5;
  crewCapsule.add(orbitalModule);

  // Reentry Module (middle) - bell shape (wider at bottom)
  const reGeo = createBellShape();
  const reMat = new THREE.MeshStandardMaterial({ color: 0xf0f0f0, metalness: 0.3 });
  const reModule = new THREE.Mesh(reGeo, reMat);
  crewCapsule.add(reModule);

  // Service Module (back) - cylindrical with solar panels
  const smGeo = new THREE.CylinderGeometry(1.2, 1.2, 3, 32);
  const smMat = new THREE.MeshStandardMaterial({ color: 0x888888, metalness: 0.6 });
  serviceModule = new THREE.Mesh(smGeo, smMat);
  serviceModule.position.z = -2.5;
  crewCapsule.add(serviceModule);

  // Solar panels (blue rectangles on service module)
  const spGeo = new THREE.BoxGeometry(4, 0.1, 1.5);
  const spMat = new THREE.MeshStandardMaterial({ color: 0x2244aa, metalness: 0.8 });

  const leftPanel = new THREE.Mesh(spGeo, spMat);
  leftPanel.position.set(-2.5, 0, -2.5);
  crewCapsule.add(leftPanel);

  const rightPanel = new THREE.Mesh(spGeo, spMat);
  rightPanel.position.set(2.5, 0, -2.5);
  crewCapsule.add(rightPanel);

  // Antenna on top of service module (like Voyager's dish)
  const antBaseGeo = new THREE.CylinderGeometry(0.15, 0.15, 0.3, 16);
  const antMat = new THREE.MeshStandardMaterial({ color: 0xcccccc });
  const antBase = new THREE.Mesh(antBaseGeo, antMat);
  antBase.position.set(0, 1.65, -2.5);
  crewCapsule.add(antBase);

  // Dish antenna (cone pointing up)
  const dishGeo = new THREE.ConeGeometry(0.4, 0.8, 16);
  const dishMat = new THREE.MeshStandardMaterial({ color: 0xdddddd });
  const dish = new THREE.Mesh(dishGeo, dishMat);
  dish.position.set(0, 2.1, -2.5);
  crewCapsule.add(dish);

  // Bottom retro rockets (small cones at base)
  for (let i = 0; i < 4; i++) {
    const angle = (i / 4) * Math.PI * 2;
    const rfGeo = new THREE.ConeGeometry(0.1, 0.3, 8);
    const rfMat = new THREE.MeshStandardMaterial({ color: 0x666666 });
    const rf = new THREE.Mesh(rfGeo, rfMat);
    rf.position.set(Math.cos(angle) * 1.0, -4.2, Math.sin(angle) * 1.0);
    rf.rotation.z = Math.PI; // Point down
    crewCapsule.add(rf);

    // Retro flame (visible during landing burn)
    const rfFlameGeo = new THREE.ConeGeometry(0.08, 0.5, 8);
    const rfFlameMat = new THREE.MeshBasicMaterial({ color: 0xaaccff, transparent: true, opacity: 0 });
    const rfFlame = new THREE.Mesh(rfFlameGeo, rfFlameMat);
    rfFlame.position.set(Math.cos(angle) * 1.0, -4.6, Math.sin(angle) * 1.0);
    rfFlame.rotation.z = Math.PI;
    crewCapsule.add(rfFlame);
    retroFlames.push(rfFlame);
  }

  // Position capsule at rocket top (will be updated in game loop)
  crewCapsule.position.copy(state.rocketPos);
  scene.add(crewCapsule);
}

// Bell shape for reentry module (wider bottom, narrow top)
function createBellShape() {
  const points = [];
  // Bottom rim (wide)
  points.push(new THREE.Vector2(1.5, -0.8));
  // Curved side going up and narrowing
  points.push(new THREE.Vector2(1.3, -0.4));
  points.push(new THREE.Vector2(1.0, 0));
  points.push(new THREE.Vector2(0.7, 0.5));
  points.push(new THREE.Vector2(0.5, 1.0));
  // Top (narrow)
  points.push(new THREE.Vector2(0.4, 1.3));

  const geo = new THREE.LatheGeometry(points, 32);
  return geo;
}

// === Voyager 1 handled by voyager1.js — import from there ===

// === Plasma trail for re-entry (fire effect) ===
export function createPlasmaTrail() {
  if (plasmaTrail) {
    plasmaTrail.traverse(child => {
      if (child.isMesh || child.isPoints) {
        if (child.material) {
          const mat = Array.isArray(child.material) ? child.material : [child.material];
          mat.forEach(m => { m.dispose && m.dispose(); });
        }
        if (child.geometry) child.geometry.dispose && child.geometry.dispose();
      }
    });
    scene.remove(plasmaTrail);
  }
  plasmaTrail = new THREE.Group();

  // Outer glow sphere (red/orange plasma sheath)
  const outerGeo = new THREE.SphereGeometry(3, 32, 32);
  const outerMat = new THREE.MeshBasicMaterial({ color: 0xff4411, transparent: true, opacity: 0.3 });
  plasmaTrail.add(new THREE.Mesh(outerGeo, outerMat));

  // Inner glow sphere (brighter)
  const innerGeo = new THREE.SphereGeometry(2, 24, 24);
  const innerMat = new THREE.MeshBasicMaterial({ color: 0xff8833, transparent: true, opacity: 0.5 });
  plasmaTrail.add(new THREE.Mesh(innerGeo, innerMat));

  // Particle system for ionization
  const particleCount = 200;
  const pGeo = new THREE.BufferGeometry();
  const positions = new Float32Array(particleCount * 3);
  const velocities = [];

  for (let i = 0; i < particleCount; i++) {
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    const r = 2 + Math.random() * 1.5;
    positions[i*3] = r * Math.sin(phi) * Math.cos(theta);
    positions[i*3+1] = r * Math.sin(phi) * Math.sin(theta);
    positions[i*3+2] = r * Math.cos(phi);

    velocities.push({
      vx: (Math.random() - 0.5) * 0.5,
      vy: (Math.random() - 0.5) * 0.5,
      vz: (Math.random() - 0.5) * 0.5,
    });
  }

  pGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const pMat = new THREE.PointsMaterial({ color: 0xff6622, size: 0.15, transparent: true, opacity: 0.7 });
  plasmaTrail.add(new THREE.Points(pGeo, pMat));

  plasmaTrail.userData.velocities = velocities;
}

// === Parachute deployment (3 main chutes for Shenzhou) ===
export function deployParachutes() {
  // Drogue chute (small pilot parachute)
  const drogueGeo = new THREE.ConeGeometry(1.5, 2, 8);
  const drogueMat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide });
  for (let i = 0; i < 2; i++) {
    const dc = new THREE.Mesh(drogueGeo, drogueMat);
    dc.position.set(i === 0 ? -1 : 1, 3, 0);
    crewCapsule.add(dc);
    drogueChutes.push(dc);
  }

  // Main parachutes (3 large ringsail chutes, each ~4篮球场 size ≈ 1200m² total)
  const mainGeo = new THREE.ConeGeometry(5, 6, 8);
  const mainMat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide });
  for (let i = 0; i < 3; i++) {
    const angle = (i / 3) * Math.PI * 2 - Math.PI/2;
    const mc = new THREE.Mesh(mainGeo, mainMat);
    mc.position.set(Math.cos(angle)*1.5, 4, Math.sin(angle)*1.5);
    crewCapsule.add(mc);
    mainParachutes.push(mc);
  }

  // Connect lines (simplified)
  const lineMat = new THREE.LineBasicMaterial({ color: 0x888888 });
  for (let i = 0; i < 3; i++) {
    const angle = (i / 3) * Math.PI * 2 - Math.PI/2;
    const topY = 7, botY = 1.5;
    const lineGeo = new THREE.BufferGeometry();
    lineGeo.setAttribute('position', new THREE.Float32BufferAttribute([
      Math.cos(angle)*1.5, topY, Math.sin(angle)*1.5,
      0, botY, 0
    ], 3));
    crewCapsule.add(new THREE.Line(lineGeo, lineMat));
  }
}

// === Detach modules for return sequence ===
export function detachServiceModule() {
  if (!serviceModule) return;
  serviceModule.visible = false;
  // Push it backward (away from Earth direction)
  state.rocketVel.addScaledVector(
    new THREE.Vector3(0, 0, -1).applyQuaternion(crewCapsule.quaternion), -2
  );
}

export function detachOrbitalModule() {
  if (!orbitalModule) return;
  orbitalModule.visible = false;
  state.rocketVel.addScaledVector(new THREE.Vector3(1, 0, 0), 1);
}

// === Create crew capsule + attach to rocket during launch ===
export function createCrewedCapsule() {
  // Capsule sits on top of the rocket during launch
  if (rocketGroup) {
    const capGeo = new THREE.CylinderGeometry(0.6, 0.8, 1.5, 24);
    const capMat = new THREE.MeshStandardMaterial({ color: 0xeeeeee });
    const capMesh = new THREE.Mesh(capGeo, capMat);
    capMesh.position.y = rocketGroup.children[0].geometry.parameters.height / 2 + 1;
    rocketGroup.add(capMesh);
  }

  // Create the full crew capsule for return sequence
  createCrewCapsule();
}
