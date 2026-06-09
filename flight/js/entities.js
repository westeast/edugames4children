// Living entities: birds, cars, people, clouds
import * as THREE from 'three';
import { scene } from './engine.js';
import { state } from './config.js';
import { getTerrainHeight, ROAD_WIDTH, getRoadDirectionAt } from './terrain.js';
import { SimplexNoise } from './noise.js';

export const birds = [];
export const cars = [];
export const people = [];
export const clouds = [];

// Clear all entities (for map switching)
export function clearEntities() {
  birds.forEach(b => scene.remove(b));
  cars.forEach(c => scene.remove(c));
  people.forEach(p => scene.remove(p));
  clouds.forEach(c => scene.remove(c));
  birds.length = 0;
  cars.length = 0;
  people.length = 0;
  clouds.length = 0;
}

// Noise for road generation - same seed as terrain.js
const roadNoise = new SimplexNoise(123);

// Check if position is on mountain road (same logic as terrain.js)
function isOnRoad(x, z) {
  const h = getTerrainHeight(x, z);

  if (h < 5 || h > 80) return false;

  const delta = 5;
  const h_dx = getTerrainHeight(x + delta, z) - h;
  const h_dz = getTerrainHeight(x, z + delta) - h;
  const slope = Math.sqrt(h_dx * h_dx + h_dz * h_dz) / delta;
  if (slope > 0.8) return false;

  // Mountain roads at elevation bands
  const elevationBands = [
    { base: 15, range: 8 },
    { base: 30, range: 8 },
    { base: 50, range: 8 },
  ];

  for (const band of elevationBands) {
    const heightDiff = Math.abs(h - band.base);
    if (heightDiff < band.range) {
      const nx = x / 100, nz = z / 100;
      const winding = roadNoise.noise2D(nx * 0.5, nz * 0.5);
      const spiralFactor = Math.sin(x * 0.02 + winding * 5) * Math.cos(z * 0.02 + winding * 5);
      if (Math.abs(spiralFactor + winding * 0.3) < 0.25) {
        return true;
      }
    }
  }

  return false;
}

// Get road direction - use terrain gradient (along contour)
function getRoadDirection(x, z) {
  return getRoadDirectionAt(x, z);
}

// Get nearest point on road
function getNearestRoadPoint(x, z) {
  for (let r = 0; r <= 60; r += 8) {
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 8) {
      const testX = x + Math.cos(a) * r;
      const testZ = z + Math.sin(a) * r;
      if (isOnRoad(testX, testZ)) {
        return { x: testX, z: testZ };
      }
    }
  }
  return null;
}

// ---- BIRDS ----
function createBirdMesh() {
  const g = new THREE.Group();
  const bg = new THREE.SphereGeometry(0.3, 4, 4); bg.scale(1.5, 0.6, 0.8);
  g.add(new THREE.Mesh(bg, new THREE.MeshLambertMaterial({ color: 0x333333 })));
  const wg = new THREE.PlaneGeometry(1.5, 0.4);
  const wm = new THREE.MeshLambertMaterial({ color: 0x444444, side: THREE.DoubleSide });
  const lw = new THREE.Mesh(wg, wm); lw.position.set(0, 0.1, 0.8); lw.name = 'leftWing'; g.add(lw);
  const rw = new THREE.Mesh(wg, wm); rw.position.set(0, 0.1, -0.8); rw.name = 'rightWing'; g.add(rw);
  return g;
}

export function spawnBirds() {
  const { dronePos } = state;
  for (let i = 0; i < 20; i++) {
    const bird = createBirdMesh();
    const a = Math.random() * Math.PI * 2, d = 50 + Math.random() * 200;
    bird.position.set(dronePos.x + Math.cos(a) * d, 25 + Math.random() * 60, dronePos.z + Math.sin(a) * d);
    const sp = 5 + Math.random() * 10, dir = Math.random() * Math.PI * 2;
    bird.userData = { vx: Math.cos(dir) * sp, vy: (Math.random() - 0.5) * 2, vz: Math.sin(dir) * sp, wingPhase: Math.random() * Math.PI * 2, wingSpeed: 8 + Math.random() * 6 };
    scene.add(bird); birds.push(bird);
  }
}

export function updateBirds(dt) {
  const { dronePos } = state;
  birds.forEach(bird => {
    const d = bird.userData; d.wingPhase += d.wingSpeed * dt;
    const lw = bird.getObjectByName('leftWing'), rw = bird.getObjectByName('rightWing');
    if (lw) lw.rotation.z = Math.sin(d.wingPhase) * 0.5;
    if (rw) rw.rotation.z = -Math.sin(d.wingPhase) * 0.5;
    bird.position.x += d.vx * dt; bird.position.y += d.vy * dt; bird.position.z += d.vz * dt;
    bird.rotation.y = Math.atan2(d.vx, d.vz);
    if (bird.position.distanceTo(dronePos) > 300) {
      const a = Math.random() * Math.PI * 2, nd = 50 + Math.random() * 150;
      bird.position.set(dronePos.x + Math.cos(a) * nd, 25 + Math.random() * 60, dronePos.z + Math.sin(a) * nd);
      const sp = 5 + Math.random() * 10, dir = Math.random() * Math.PI * 2;
      d.vx = Math.cos(dir) * sp; d.vz = Math.sin(dir) * sp;
    }
    if (bird.position.y < 10) { bird.position.y = 10; d.vy = Math.abs(d.vy); }
    if (bird.position.y > 100) { bird.position.y = 100; d.vy = -Math.abs(d.vy); }
  });
}

// ---- CARS ----
function createCarMesh(color) {
  const g = new THREE.Group();
  
  // Main body - more realistic car shape
  const bodyMat = new THREE.MeshLambertMaterial({ color: color });
  
  // Lower body (chassis)
  const lowerBody = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.5, 3.8), bodyMat);
  lowerBody.position.y = 0.45;
  g.add(lowerBody);
  
  // Hood (front)
  const hood = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.25, 1.2), bodyMat);
  hood.position.set(0, 0.65, 1.4);
  g.add(hood);
  
  // Trunk (back)
  const trunk = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.2, 0.8), bodyMat);
  trunk.position.set(0, 0.6, -1.4);
  g.add(trunk);
  
  // Cabin (windows)
  const cabinMat = new THREE.MeshLambertMaterial({ color: 0x88bbdd, transparent: true, opacity: 0.75 });
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.5, 1.4), cabinMat);
  cabin.position.set(0, 0.95, -0.1);
  g.add(cabin);
  
  // Roof
  const roof = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.08, 1.2), bodyMat);
  roof.position.set(0, 1.25, -0.1);
  g.add(roof);
  
  // Wheels - larger, more visible
  const wheelGeo = new THREE.CylinderGeometry(0.32, 0.32, 0.22, 12);
  wheelGeo.rotateZ(Math.PI / 2);
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x1a1a1a });
  const wheelPositions = [
    [-0.95, 0.32, 1.2], [0.95, 0.32, 1.2],
    [-0.95, 0.32, -1.2], [0.95, 0.32, -1.2]
  ];
  wheelPositions.forEach(pos => {
    const wheel = new THREE.Mesh(wheelGeo, wheelMat);
    wheel.position.set(...pos);
    wheel.name = 'wheel';
    g.add(wheel);
  });
  
  // Headlights (front - round)
  const hlGeo = new THREE.SphereGeometry(0.1, 8, 8);
  const hlMat = new THREE.MeshLambertMaterial({ color: 0xffffee, emissive: 0xffffaa, emissiveIntensity: 0.4 });
  const hl1 = new THREE.Mesh(hlGeo, hlMat); hl1.position.set(-0.6, 0.5, 1.91);
  g.add(hl1);
  const hl2 = new THREE.Mesh(hlGeo, hlMat); hl2.position.set(0.6, 0.5, 1.91);
  g.add(hl2);
  
  // Taillights (back)
  const tlGeo = new THREE.BoxGeometry(0.35, 0.12, 0.06);
  const tlMat = new THREE.MeshLambertMaterial({ color: 0xff2222, emissive: 0xff0000, emissiveIntensity: 0.3 });
  const tl1 = new THREE.Mesh(tlGeo, tlMat); tl1.position.set(-0.55, 0.5, -1.91);
  g.add(tl1);
  const tl2 = new THREE.Mesh(tlGeo, tlMat); tl2.position.set(0.55, 0.5, -1.91);
  g.add(tl2);
  
  // Side mirrors
  const mirrorMat = new THREE.MeshLambertMaterial({ color: 0x333333 });
  const mirrorGeo = new THREE.BoxGeometry(0.08, 0.06, 0.15);
  const ml = new THREE.Mesh(mirrorGeo, mirrorMat); ml.position.set(-0.98, 0.75, 0.3);
  g.add(ml);
  const mr = new THREE.Mesh(mirrorGeo, mirrorMat); mr.position.set(0.98, 0.75, 0.3);
  g.add(mr);
  
  return g;
}

export function spawnCars() {
  const { dronePos } = state;
  const cc = [0xe53935, 0x1e88e5, 0x43a047, 0xfdd835, 0xff9800, 0x8e24aa, 0x00acc1, 0x5e35b1, 0x3949ab, 0xd81b60];
  
  for (let i = 0; i < 15; i++) {
    const car = createCarMesh(cc[Math.floor(Math.random() * cc.length)]);
    
    // Place car on road
    const a = Math.random() * Math.PI * 2;
    const d = 40 + Math.random() * 180;
    let cx = dronePos.x + Math.cos(a) * d;
    let cz = dronePos.z + Math.sin(a) * d;
    
    const roadPoint = getNearestRoadPoint(cx, cz);
    if (roadPoint) {
      cx = roadPoint.x;
      cz = roadPoint.z;
    }
    
    car.position.set(cx, getTerrainHeight(cx, cz) + 0.35, cz);
    
    // Determine movement direction along road
    let dir;
    if (roadPoint) {
      dir = getRoadDirection(cx, cz);
      // Randomly go forward or backward along road
      if (Math.random() > 0.5) dir += Math.PI;
    } else {
      dir = Math.random() * Math.PI * 2;
    }
    
    const sp = 12 + Math.random() * 10;
    // Car model faces +Z by default, rotation.y = 0
    // Movement: vx = sin(dir), vz = cos(dir)
    car.userData = {
      vx: Math.sin(dir) * sp,
      vz: Math.cos(dir) * sp,
      speed: sp,
      onRoad: !!roadPoint
    };
    
    // Set rotation so car faces movement direction
    // Car's front is +Z (hood at z=1.4), so rotation.y should match movement direction
    car.rotation.y = dir;
    
    scene.add(car);
    cars.push(car);
  }
}

export function updateCars(dt) {
  const { dronePos } = state;

  cars.forEach(car => {
    // Move car first
    car.position.x += car.userData.vx * dt;
    car.position.z += car.userData.vz * dt;

    // Check if still on road
    if (isOnRoad(car.position.x, car.position.z)) {
      // Get road direction at current position
      const roadDir = getRoadDirection(car.position.x, car.position.z);

      // Determine if going forward or backward along road
      const currentDir = Math.atan2(car.userData.vx, car.userData.vz);
      const dirDiff = Math.abs(((roadDir - currentDir + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
      const finalDir = dirDiff < Math.PI / 2 ? roadDir : roadDir + Math.PI;

      // Smoothly adjust direction to follow road (lerp)
      const currentAngle = Math.atan2(car.userData.vx, car.userData.vz);
      const turnRate = 2 * dt; // Smooth turning
      let newAngle = currentAngle;

      const diff = finalDir - currentAngle;
      // Normalize angle difference to -PI..PI
      const normalizedDiff = ((diff + Math.PI) % (Math.PI * 2)) - Math.PI;

      if (Math.abs(normalizedDiff) > 0.1) {
        newAngle = currentAngle + Math.sign(normalizedDiff) * Math.min(Math.abs(normalizedDiff), turnRate * Math.PI);
      }

      car.userData.vx = Math.sin(newAngle) * car.userData.speed;
      car.userData.vz = Math.cos(newAngle) * car.userData.speed;
      car.rotation.y = newAngle;
    }

    // Get terrain height and slope
    const h = getTerrainHeight(car.position.x, car.position.z);
    
    // Calculate movement direction
    const moveAngle = Math.atan2(car.userData.vx, car.userData.vz);
    
    // Sample points for slope alignment
    const hFront = getTerrainHeight(car.position.x + Math.sin(moveAngle) * 1.5, car.position.z + Math.cos(moveAngle) * 1.5);
    const hRight = getTerrainHeight(car.position.x + Math.sin(moveAngle + Math.PI/2) * 1, car.position.z + Math.cos(moveAngle + Math.PI/2) * 1);
    
    const pitch = Math.atan2(hFront - h, 1.5);
    const roll = Math.atan2(hRight - h, 1);
    
    car.position.y = h + 0.35;
    car.rotation.x = pitch * 0.4;
    car.rotation.z = -roll * 0.4;
    
    // Rotate wheels
    car.children.forEach(child => {
      if (child.name === 'wheel') {
        child.rotation.x += car.userData.speed * dt * 0.6;
      }
    });
    
    // Respawn if too far
    if (car.position.distanceTo(dronePos) > 280) {
      const a = Math.random() * Math.PI * 2;
      const nd = 50 + Math.random() * 150;
      let nx = dronePos.x + Math.cos(a) * nd;
      let nz = dronePos.z + Math.sin(a) * nd;
      
      const roadPoint = getNearestRoadPoint(nx, nz);
      if (roadPoint) {
        nx = roadPoint.x;
        nz = roadPoint.z;
      }
      
      car.position.x = nx;
      car.position.z = nz;
      car.position.y = getTerrainHeight(nx, nz) + 0.35;
      
      let dir;
      if (roadPoint) {
        dir = getRoadDirection(nx, nz);
        if (Math.random() > 0.5) dir += Math.PI;
      } else {
        dir = Math.random() * Math.PI * 2;
      }
      
      car.userData.vx = Math.sin(dir) * car.userData.speed;
      car.userData.vz = Math.cos(dir) * car.userData.speed;
      car.rotation.y = dir;
    }
  });
}

// ---- PEOPLE ----
function createPersonMesh(shirtColor) {
  const g = new THREE.Group();
  const skinColor = 0xddbb88;
  const pantsColor = 0x2a3a5a;
  
  // Torso
  const bodyGeo = new THREE.BoxGeometry(0.32, 0.42, 0.16);
  const bodyMat = new THREE.MeshLambertMaterial({ color: shirtColor });
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.position.y = 0.92;
  g.add(body);
  
  // Head (more realistic proportions)
  const headGeo = new THREE.SphereGeometry(0.12, 10, 8);
  const headMat = new THREE.MeshLambertMaterial({ color: skinColor });
  const head = new THREE.Mesh(headGeo, headMat);
  head.position.y = 1.26;
  g.add(head);
  
  // Neck
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.06, 6), headMat);
  neck.position.y = 1.14;
  g.add(neck);
  
  // Arms
  const armGeo = new THREE.CylinderGeometry(0.04, 0.035, 0.36, 6);
  const armMat = new THREE.MeshLambertMaterial({ color: shirtColor });
  
  const leftArm = new THREE.Mesh(armGeo, armMat);
  leftArm.position.set(-0.22, 0.88, 0);
  leftArm.name = 'leftArm';
  g.add(leftArm);
  
  const rightArm = new THREE.Mesh(armGeo, armMat);
  rightArm.position.set(0.22, 0.88, 0);
  rightArm.name = 'rightArm';
  g.add(rightArm);
  
  // Hands
  const handGeo = new THREE.SphereGeometry(0.04, 6, 5);
  const leftHand = new THREE.Mesh(handGeo, headMat);
  leftHand.position.set(-0.22, 0.66, 0);
  leftHand.name = 'leftHand';
  g.add(leftHand);
  
  const rightHand = new THREE.Mesh(handGeo, headMat);
  rightHand.position.set(0.22, 0.66, 0);
  rightHand.name = 'rightHand';
  g.add(rightHand);
  
  // Legs
  const legGeo = new THREE.CylinderGeometry(0.05, 0.045, 0.46, 6);
  const legMat = new THREE.MeshLambertMaterial({ color: pantsColor });
  
  const leftLeg = new THREE.Mesh(legGeo, legMat);
  leftLeg.position.set(-0.09, 0.36, 0);
  leftLeg.name = 'leftLeg';
  g.add(leftLeg);
  
  const rightLeg = new THREE.Mesh(legGeo, legMat);
  rightLeg.position.set(0.09, 0.36, 0);
  rightLeg.name = 'rightLeg';
  g.add(rightLeg);
  
  // Feet
  const footGeo = new THREE.BoxGeometry(0.09, 0.05, 0.16);
  const footMat = new THREE.MeshLambertMaterial({ color: 0x222222 });
  
  const leftFoot = new THREE.Mesh(footGeo, footMat);
  leftFoot.position.set(-0.09, 0.08, 0.02);
  g.add(leftFoot);
  
  const rightFoot = new THREE.Mesh(footGeo, footMat);
  rightFoot.position.set(0.09, 0.08, 0.02);
  g.add(rightFoot);
  
  return g;
}

export function spawnPeople() {
  const { dronePos } = state;
  
  for (let i = 0; i < 25; i++) {
    // Random shirt color
    const shirt = new THREE.Color().setHSL(
      Math.random(),
      0.5 + Math.random() * 0.3,
      0.35 + Math.random() * 0.25
    ).getHex();
    
    const p = createPersonMesh(shirt);
    
    // Place people near roads (on the side)
    const a = Math.random() * Math.PI * 2;
    const d = 25 + Math.random() * 150;
    let px = dronePos.x + Math.cos(a) * d;
    let pz = dronePos.z + Math.sin(a) * d;
    
    const roadPoint = getNearestRoadPoint(px, pz);
    if (roadPoint) {
      // Place on side of road
      const roadDir = getRoadDirection(roadPoint.x, roadPoint.z);
      const sideOffset = (Math.random() > 0.5 ? 1 : -1) * (ROAD_WIDTH * 0.5 + Math.random() * 3);
      px = roadPoint.x + Math.cos(roadDir + Math.PI/2) * sideOffset;
      pz = roadPoint.z + Math.sin(roadDir + Math.PI/2) * sideOffset;
    }
    
    p.position.set(px, getTerrainHeight(px, pz), pz);
    
    // Walk direction
    let dir;
    if (roadPoint) {
      // Walk along road
      dir = getRoadDirection(roadPoint.x, roadPoint.z);
      if (Math.random() > 0.5) dir += Math.PI;
    } else {
      dir = Math.random() * Math.PI * 2;
    }
    
    const sp = 0.7 + Math.random() * 1.2;
    p.userData = {
      vx: Math.sin(dir) * sp,
      vz: Math.cos(dir) * sp,
      walkPhase: Math.random() * Math.PI * 2,
      onRoad: !!roadPoint
    };
    
    // Person faces movement direction
    p.rotation.y = dir;
    
    scene.add(p);
    people.push(p);
  }
}

export function updatePeople(dt) {
  const { dronePos } = state;

  people.forEach(p => {
    // Walk animation
    p.userData.walkPhase += 10 * dt;

    // Move along current direction
    p.position.x += p.userData.vx * dt;
    p.position.z += p.userData.vz * dt;

    // Check if near road and follow road direction
    if (isOnRoad(p.position.x, p.position.z)) {
      // We're on the road - move to the edge
      const roadDir = getRoadDirection(p.position.x, p.position.z);

      // Move perpendicular to road to get to the edge
      // Use a small offset to stay on the roadside
      const edgeOffset = ROAD_WIDTH * 0.55; // Just outside road edge
      const side = p.userData.side || (Math.random() > 0.5 ? 1 : -1);
      p.userData.side = side;

      // Gradually move towards road edge while walking along road
      const perpX = Math.cos(roadDir + Math.PI / 2) * edgeOffset * side;
      const perpZ = Math.sin(roadDir + Math.PI / 2) * edgeOffset * side;

      // Find road center by moving back from edge
      // Actually, just walk along the road direction
      const currentDir = Math.atan2(p.userData.vx, p.userData.vz);
      const dirDiff = ((roadDir - currentDir + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
      const finalDir = Math.abs(dirDiff) < Math.PI / 2 ? roadDir : roadDir + Math.PI;

      const sp = Math.sqrt(p.userData.vx * p.userData.vx + p.userData.vz * p.userData.vz);
      p.userData.vx = Math.sin(finalDir) * sp;
      p.userData.vz = Math.cos(finalDir) * sp;
      p.rotation.y = finalDir;
    }

    // Terrain alignment
    const h = getTerrainHeight(p.position.x, p.position.z);

    const moveAngle = Math.atan2(p.userData.vx, p.userData.vz);
    const hFront = getTerrainHeight(p.position.x + Math.sin(moveAngle) * 0.25, p.position.z + Math.cos(moveAngle) * 0.25);
    const hRight = getTerrainHeight(p.position.x + Math.sin(moveAngle + Math.PI/2) * 0.15, p.position.z + Math.cos(moveAngle + Math.PI/2) * 0.15);

    const pitch = Math.atan2(hFront - h, 0.25);
    const roll = Math.atan2(hRight - h, 0.15);

    p.position.y = h;
    p.rotation.x = pitch * 0.25;
    p.rotation.z = -roll * 0.25;
    
    // Animate limbs
    const swing = Math.sin(p.userData.walkPhase);
    
    const la = p.getObjectByName('leftArm');
    const ra = p.getObjectByName('rightArm');
    const ll = p.getObjectByName('leftLeg');
    const rl = p.getObjectByName('rightLeg');
    const lh = p.getObjectByName('leftHand');
    const rh = p.getObjectByName('rightHand');
    
    if (la) la.rotation.x = swing * 0.55;
    if (ra) ra.rotation.x = -swing * 0.55;
    if (ll) ll.rotation.x = swing * 0.45;
    if (rl) rl.rotation.x = -swing * 0.45;
    
    // Move hands with arms
    if (lh) {
      lh.position.y = 0.66 - swing * 0.03;
      lh.position.z = swing * 0.02;
    }
    if (rh) {
      rh.position.y = 0.66 + swing * 0.03;
      rh.position.z = -swing * 0.02;
    }
    
    // Respawn if too far
    if (p.position.distanceTo(dronePos) > 180) {
      const a = Math.random() * Math.PI * 2;
      const nd = 30 + Math.random() * 100;
      let nx = dronePos.x + Math.cos(a) * nd;
      let nz = dronePos.z + Math.sin(a) * nd;
      
      const roadPoint = getNearestRoadPoint(nx, nz);
      if (roadPoint) {
        const roadDir = getRoadDirection(roadPoint.x, roadPoint.z);
        const sideOffset = (Math.random() > 0.5 ? 1 : -1) * (ROAD_WIDTH * 0.5 + Math.random() * 2);
        nx = roadPoint.x + Math.cos(roadDir + Math.PI/2) * sideOffset;
        nz = roadPoint.z + Math.sin(roadDir + Math.PI/2) * sideOffset;
      }
      
      p.position.x = nx;
      p.position.z = nz;
      p.position.y = getTerrainHeight(nx, nz);
      
      let dir;
      if (roadPoint) {
        dir = getRoadDirection(roadPoint.x, roadPoint.z);
        if (Math.random() > 0.5) dir += Math.PI;
      } else {
        dir = Math.random() * Math.PI * 2;
      }
      
      p.userData.vx = Math.sin(dir) * 0.9;
      p.userData.vz = Math.cos(dir) * 0.9;
      p.rotation.y = dir;
    }
  });
}

// ---- CLOUDS ----
function createCloud() {
  const g = new THREE.Group(), cm = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.8 });
  for (let i = 0; i < 3 + Math.floor(Math.random() * 4); i++) {
    const r = 10 + Math.random() * 20;
    const puff = new THREE.Mesh(new THREE.SphereGeometry(r, 6, 5), cm);
    puff.position.set((Math.random() - 0.5) * 30, (Math.random() - 0.5) * 5, (Math.random() - 0.5) * 20);
    puff.scale.y = 0.4 + Math.random() * 0.3; g.add(puff);
  }
  return g;
}

export function spawnClouds() {
  const { dronePos } = state;
  for (let i = 0; i < 30; i++) {
    const c = createCloud();
    const a = Math.random() * Math.PI * 2, d = 100 + Math.random() * 800;
    c.position.set(dronePos.x + Math.cos(a) * d, 120 + Math.random() * 200, dronePos.z + Math.sin(a) * d);
    c.userData = { speed: 1 + Math.random() * 3, dir: Math.random() * Math.PI * 2 };
    scene.add(c); clouds.push(c);
  }
}

export function updateClouds(dt) {
  const { dronePos } = state;
  clouds.forEach(c => {
    c.position.x += Math.cos(c.userData.dir) * c.userData.speed * dt;
    c.position.z += Math.sin(c.userData.dir) * c.userData.speed * dt;
    if (c.position.distanceTo(dronePos) > 900) {
      const a = Math.random() * Math.PI * 2;
      c.position.x = dronePos.x + Math.cos(a) * (500 + Math.random() * 300);
      c.position.z = dronePos.z + Math.sin(a) * (500 + Math.random() * 300);
    }
  });
}
