// Living entities: birds, cars, people, clouds
import * as THREE from 'three';
import { scene } from './engine.js';
import { state } from './config.js';
import { getTerrainHeight } from './terrain.js';

export const birds = [];
export const cars = [];
export const people = [];
export const clouds = [];

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
  const body = new THREE.Mesh(new THREE.BoxGeometry(2, 0.8, 4), new THREE.MeshLambertMaterial({ color }));
  body.position.y = 0.6; g.add(body);
  const top = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.6, 2), new THREE.MeshLambertMaterial({ color: 0xaaddff, transparent: true, opacity: 0.6 }));
  top.position.y = 1.2; g.add(top);
  const wg = new THREE.CylinderGeometry(0.3, 0.3, 0.2, 8); wg.rotateZ(Math.PI / 2);
  const wm = new THREE.MeshLambertMaterial({ color: 0x222222 });
  [[-1, 0.3, 1.2], [1, 0.3, 1.2], [-1, 0.3, -1.2], [1, 0.3, -1.2]].forEach(p => { const w = new THREE.Mesh(wg, wm); w.position.set(...p); g.add(w); });
  return g;
}

export function spawnCars() {
  const { dronePos } = state;
  const cc = [0xe53935, 0x1e88e5, 0x43a047, 0xfdd835, 0xff9800, 0x8e24aa];
  for (let i = 0; i < 12; i++) {
    const car = createCarMesh(cc[Math.floor(Math.random() * cc.length)]);
    const a = Math.random() * Math.PI * 2, d = 30 + Math.random() * 200;
    const cx = dronePos.x + Math.cos(a) * d, cz = dronePos.z + Math.sin(a) * d;
    car.position.set(cx, getTerrainHeight(cx, cz) + 0.3, cz);
    const dir = Math.random() * Math.PI * 2, sp = 8 + Math.random() * 15;
    car.userData = { vx: Math.cos(dir) * sp, vz: Math.sin(dir) * sp };
    car.rotation.y = dir; scene.add(car); cars.push(car);
  }
}

export function updateCars(dt) {
  const { dronePos } = state;
  cars.forEach(car => {
    car.position.x += car.userData.vx * dt; car.position.z += car.userData.vz * dt;
    car.position.y = getTerrainHeight(car.position.x, car.position.z) + 0.3;
    if (car.position.distanceTo(dronePos) > 300) {
      const a = Math.random() * Math.PI * 2, nd = 50 + Math.random() * 150;
      car.position.x = dronePos.x + Math.cos(a) * nd; car.position.z = dronePos.z + Math.sin(a) * nd;
      car.position.y = getTerrainHeight(car.position.x, car.position.z) + 0.3;
    }
  });
}

// ---- PEOPLE ----
function createPersonMesh(shirtColor) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 1.0, 6), new THREE.MeshLambertMaterial({ color: shirtColor }));
  body.position.y = 0.8; g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 6, 6), new THREE.MeshLambertMaterial({ color: 0xddbb88 }));
  head.position.y = 1.5; g.add(head);
  const lg = new THREE.CylinderGeometry(0.08, 0.08, 0.6, 4), lm = new THREE.MeshLambertMaterial({ color: 0x333355 });
  const ll = new THREE.Mesh(lg, lm); ll.position.set(-0.1, 0.3, 0); ll.name = 'leftLeg'; g.add(ll);
  const rl = new THREE.Mesh(lg, lm); rl.position.set(0.1, 0.3, 0); rl.name = 'rightLeg'; g.add(rl);
  return g;
}

export function spawnPeople() {
  const { dronePos } = state;
  for (let i = 0; i < 15; i++) {
    const shirt = new THREE.Color().setHSL(Math.random(), 0.6, 0.5).getHex();
    const p = createPersonMesh(shirt);
    const a = Math.random() * Math.PI * 2, d = 20 + Math.random() * 150;
    const px = dronePos.x + Math.cos(a) * d, pz = dronePos.z + Math.sin(a) * d;
    p.position.set(px, getTerrainHeight(px, pz), pz);
    const dir = Math.random() * Math.PI * 2, sp = 1 + Math.random() * 2;
    p.userData = { vx: Math.cos(dir) * sp, vz: Math.sin(dir) * sp, walkPhase: Math.random() * Math.PI * 2 };
    p.rotation.y = dir; scene.add(p); people.push(p);
  }
}

export function updatePeople(dt) {
  const { dronePos } = state;
  people.forEach(p => {
    p.userData.walkPhase += 8 * dt;
    p.position.x += p.userData.vx * dt; p.position.z += p.userData.vz * dt;
    p.position.y = getTerrainHeight(p.position.x, p.position.z);
    const ll = p.getObjectByName('leftLeg'), rl = p.getObjectByName('rightLeg');
    if (ll) ll.rotation.x = Math.sin(p.userData.walkPhase) * 0.4;
    if (rl) rl.rotation.x = -Math.sin(p.userData.walkPhase) * 0.4;
    if (p.position.distanceTo(dronePos) > 200) {
      const a = Math.random() * Math.PI * 2, nd = 30 + Math.random() * 100;
      p.position.x = dronePos.x + Math.cos(a) * nd; p.position.z = dronePos.z + Math.sin(a) * nd;
      p.position.y = getTerrainHeight(p.position.x, p.position.z);
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