// N-body gravity + RK4 integration + first cosmic speed detection
import * as THREE from 'three';
import { state, G_GAME, SUN_MASS, EARTH_MASS, JUPITER_MASS, PLANETS, PLUTO } from './config.js';

const G = G_GAME; // Scaled gravitational constant for gameplay

// === N-body gravity computation (simplified: Sun + selected planet) ===
export function computeGravity(pos) {
  const acc = new THREE.Vector3();

  // Sun's gravity
  const toSun = new THREE.Vector3().subVectors(new THREE.Vector3(0, 0, 0), pos);
  const rSun = toSun.length();
  if (rSun > 1) {
    acc.addScaledVector(toSun.clone().normalize(), -G * SUN_MASS / (rSun * rSun));
  }

  // Selected planet's gravity (the one the player is orbiting)
  const tp = state.targetPlanetPos;
  const toPlanet = new THREE.Vector3().subVectors(tp, pos);
  const rPlanet = toPlanet.length();

  if (rPlanet > 1 && rPlanet < 50) { // Only significant when near the planet
    acc.addScaledVector(toPlanet.clone().normalize(), -G * EARTH_MASS / (rPlanet * rPlanet));
  }

  return acc;
}

// === RK4 integration for stable orbital mechanics ===
export function integrateRK4(pos, vel, dt) {
  // k1: f(t, y) = (v, a)
  const v1 = new THREE.Vector3().copy(vel);
  const a1 = computeGravity(pos);

  // k2: f(t+dt/2, y+k1*dt/2)
  const pos2 = new THREE.Vector3().copy(pos).addScaledVector(v1, dt * 0.5);
  const v2 = new THREE.Vector3().copy(vel).addScaledVector(a1, dt * 0.5);
  const a2 = computeGravity(pos2);

  // k3: f(t+dt/2, y+k2*dt/2)
  const pos3 = new THREE.Vector3().copy(pos).addScaledVector(v2, dt * 0.5);
  const v3 = new THREE.Vector3().copy(vel).addScaledVector(a2, dt * 0.5);
  const a3 = computeGravity(pos3);

  // k4: f(t+dt, y+k3*dt)
  const pos4 = new THREE.Vector3().copy(pos).addScaledVector(v3, dt);
  const v4 = new THREE.Vector3().copy(vel).addScaledVector(a3, dt);
  const a4 = computeGravity(pos4);

  // Combine: y_new = y + dt*(k1+2*k2+2*k3+k4)/6
  pos.x += dt * (v1.x + 2*v2.x + 2*v3.x + v4.x) / 6;
  pos.y += dt * (v1.y + 2*v2.y + 2*v3.y + v4.y) / 6;
  pos.z += dt * (v1.z + 2*v2.z + 2*v3.z + v4.z) / 6;

  vel.x += dt * (a1.x + 2*a2.x + 2*a3.x + a4.x) / 6;
  vel.y += dt * (a1.y + 2*a2.y + 2*a3.y + a4.y) / 6;
  vel.z += dt * (a1.z + 2*a2.z + 2*a3.z + a4.z) / 6;
}

// === First cosmic speed: v₁ = √(GM/r) — orbital velocity ===
export function firstCosmicSpeed(massKg, radiusKm) {
  const r = radiusKm * 1000; // Convert to meters
  return Math.sqrt(G_REAL * massKg / r);
}

// Escape velocity: v₂ = √2 × v₁
function escapeVelocity(massKg, radiusKm) {
  return firstCosmicSpeed(massKg, radiusKm) * Math.SQRT2;
}

const G_REAL = 6.674e-11;

// === Check if player has reached orbital velocity around target planet ===
export function checkOrbitalVelocity() {
  const planetIdx = state.targetPlanetIdx;
  const planet = PLANETS[planetIdx];
  const r = planet.radius * 0.01; // km → game units (simplified)
  const vOrbital = Math.sqrt(G_REAL * EARTH_MASS / (r * 1e3));

  const speed = state.rocketVel.length();

  if (speed >= vOrbital * 0.8 && speed < vOrbital) {
    showNotif(`⚠️ 速度接近第一宇宙速度 ${vOrbital.toFixed(1)} m/s！再加速即可环绕${planet.name}！`);
  } else if (speed >= vOrbital) {
    state.orbitActive = true;
    showNotif(`✅ 达到第一宇宙速度 ${vOrbital.toFixed(1)} m/s！可以环绕${planet.name}了！`);

    // Switch to orbit control mode
    state.gamePhase = 'explore';
  } else if (speed >= escapeVelocity(EARTH_MASS, r)) {
    showNotif(`🚀 达到逃逸速度 ${escapeVelocity(EARTH_MASS, r).toFixed(1)} m/s！可以逃离${planet.name}引力了！`);
  }

  return speed;
}

// === Player thrust input (radial / tangential) ===
export function applyThrust(dt) {
  const maxThrust = 50; // Maximum player thrust in game units
  const radialX = state.rightStick.x * maxThrust;   // Left-right = radial push
  const radialZ = -state.rightStick.y * maxThrust;  // Up-down = away/toward planet
  const verticalY = state.leftStick.y * maxThrust * 0.5;

  state.rocketVel.x += radialX * dt;
  state.rocketVel.z += radialZ * dt;
  state.rocketVel.y += verticalY * dt;

  // Speed cap (prevent infinite acceleration)
  const speed = state.rocketVel.length();
  const maxSpeed = 200;
  if (speed > maxSpeed) {
    state.rocketVel.multiplyScalar(maxSpeed / speed);
  }
}

// === Update coordinates display (from position relative to target planet) ===
export function updateCoordinates() {
  const tp = state.targetPlanetPos;
  const dx = state.rocketPos.x - tp.x;
  const dy = state.rocketPos.y - tp.y;
  const dz = state.rocketPos.z - tp.z;

  // Longitude (from planet center, in the XZ plane)
  state.longitude = Math.atan2(dx, dz) * 180 / Math.PI;
  if (state.longitude > 180) state.longitude -= 360;
  else if (state.longitude < -180) state.longitude += 360;

  // Latitude (from planet center, using Y as "up")
  const r = Math.sqrt(dx*dx + dy*dy + dz*dz);
  state.latitude = Math.asin(dy / r) * 180 / Math.PI;

  // Altitude (distance from planet surface in km)
  const planet = PLANETS[state.targetPlanetIdx];
  state.altitude = (r - planet.radius) ; // Already in km since positions are scaled

  // Speed
  state.speed = state.rocketVel.length();
}

function showNotif(msg) {
  const el = document.getElementById('notification');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(el._timer);
  el._timer = setTimeout(() => el.classList.remove('show'), 3000);
}
