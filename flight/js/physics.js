// Flight physics, collision detection, and game mechanics
import * as THREE from 'three';
import { scene } from './engine.js';
import { state, DRONES, GEAR_MULT } from './config.js';
import { getTerrainHeight, terrainGroup } from './terrain.js';
import { birds } from './entities.js';
import { showNotif } from './ui.js';
import { createRTHPath, removeRTHPath, isLanding } from './rth-path.js';

export function updateDrone(dt) {
  if (state.isCrashed || state.isPaused || !state.gameStarted) return;

  const gearMult = GEAR_MULT[state.currentGear];
  const maxSpd = state.droneSpec.maxSpeed * gearMult;
  const accel = state.droneSpec.accel * gearMult;

  let inputF = 0, inputR = 0, inputUp = 0, inputYaw = 0;

  if (state.keys['w'] || state.keys['W'] || state.keys['ArrowUp']) inputF = 1;
  if (state.keys['s'] || state.keys['S'] || state.keys['ArrowDown']) inputF = -1;
  if (state.keys['a'] || state.keys['A'] || state.keys['ArrowLeft']) inputR = -1;
  if (state.keys['d'] || state.keys['D'] || state.keys['ArrowRight']) inputR = 1;
  if (state.keys[' ']) inputUp = 1;
  if (state.keys['Shift'] || state.keys['shift']) inputUp = -1;
  if (state.keys['q'] || state.keys['Q']) inputYaw = -1;
  if (state.keys['e'] || state.keys['E']) inputYaw = 1;
  inputF += state.rightStick.y; inputR += state.rightStick.x;
  inputUp += state.leftStick.y; inputYaw += state.leftStick.x;

  // Cruise mode override
  if (state.isCruise && !state.isRTH) { inputF = 1; inputUp = 0; inputR = 0; inputYaw = 0; }

  // Return-to-home autopilot
  if (state.isRTH) {
    const toHome = new THREE.Vector3().subVectors(state.homePos, state.dronePos);
    const dist = toHome.length();

    // Create RTH path visualization
    createRTHPath();

    if (dist < 2) {
      // Arrived at home - final landing
      state.isRTH = false;
      state.droneVel.set(0, 0, 0);
      removeRTHPath();
      showNotif('✅ 已返航到家，降落完成');
      return;
    }

    toHome.normalize();

    // Calculate desired yaw to face home
    const targetYaw = Math.atan2(toHome.x, toHome.z);
    let yawDiff = targetYaw - state.droneYaw;
    // Normalize to -PI..PI
    while (yawDiff > Math.PI) yawDiff -= Math.PI * 2;
    while (yawDiff < -Math.PI) yawDiff += Math.PI * 2;

    // Landing phase: close to home
    if (dist < 15) {
      // Turn around (tail towards home) before landing
      const landingYaw = targetYaw + Math.PI; // Face away from home (tail towards home)
      let landingYawDiff = landingYaw - state.droneYaw;
      while (landingYawDiff > Math.PI) landingYawDiff -= Math.PI * 2;
      while (landingYawDiff < -Math.PI) landingYawDiff += Math.PI * 2;

      // First turn to face away from home
      if (Math.abs(landingYawDiff) > 0.3) {
        inputYaw = Math.sign(landingYawDiff) * 0.8;
        inputF = 0;
        inputR = 0;
      } else {
        // Aligned for landing - slow approach
        const speedFactor = Math.max(0.2, dist / 15); // Slow down as we get closer
        inputF = speedFactor * 0.5;
        inputR = 0;
        inputYaw = landingYawDiff * 0.5;
      }

      // Descend slowly
      const heightDiff = state.homePos.y - state.dronePos.y;
      if (dist < 5) {
        inputUp = heightDiff * 0.1; // Gentle descent
      } else {
        inputUp = Math.min(0.3, heightDiff * 0.05);
      }
    } else {
      // Approach phase: fly towards home
      inputF = 1;
      inputR = toHome.x * Math.cos(state.droneYaw) - toHome.z * Math.sin(state.droneYaw);
      inputYaw = yawDiff * 0.5;

      // Maintain altitude or climb to safe height
      if (state.dronePos.y < 30) inputUp = 0.5;
      else if (state.dronePos.y > state.homePos.y + 10) inputUp = -0.2;
      else inputUp = 0;
    }
  } else {
    // Remove RTH path if not in RTH mode
    removeRTHPath();
  }

  // Yaw rotation
  state.droneYaw += inputYaw * 2.0 * dt;

  // Direction vectors
  const forward = new THREE.Vector3(-Math.sin(state.droneYaw), 0, -Math.cos(state.droneYaw));
  const right = new THREE.Vector3(Math.cos(state.droneYaw), 0, -Math.sin(state.droneYaw));
  const targetVel = new THREE.Vector3();
  targetVel.addScaledVector(forward, inputF * maxSpd);
  targetVel.addScaledVector(right, inputR * maxSpd);
  targetVel.y = inputUp * maxSpd * 0.6;

  // Velocity smoothing
  state.droneVel.lerp(targetVel, accel * dt * 0.3);
  const spd = state.droneVel.length();
  if (spd > maxSpd) state.droneVel.multiplyScalar(maxSpd / spd);

  // Position update
  const prevPos = state.dronePos.clone();
  state.dronePos.add(state.droneVel.clone().multiplyScalar(dt));

  // Ground collision
  const groundH = getTerrainHeight(state.dronePos.x, state.dronePos.z) + 1;
  if (state.dronePos.y < groundH) {
    state.dronePos.y = groundH;
    if (state.droneVel.y < -8) { crash(); return; }
    else state.droneVel.y = 0;
  }
  if (state.dronePos.y > 500) state.dronePos.y = 500;

  // Visual tilt
  // Pitch: forward input should tilt forward (negative pitch in Three.js)
  // Roll: right input should tilt right (negative roll, matching existing logic)
  state.dronePitch = THREE.MathUtils.lerp(state.dronePitch, -inputF * 0.3, 3 * dt);
  state.droneRoll = THREE.MathUtils.lerp(state.droneRoll, -inputR * 0.3, 3 * dt);
  
  // Propeller speed based on drone velocity and vertical movement
  // Base speed when flying, faster when moving fast, slower when hovering
  // Climbing requires extra power to overcome gravity
  const basePropSpeed = 15; // Minimum propeller speed when flying
  const maxPropSpeed = 50;  // Maximum propeller speed at high velocity
  const horizontalSpeedRatio = Math.sqrt(state.droneVel.x * state.droneVel.x + state.droneVel.z * state.droneVel.z) / maxSpd;
  
  // Climbing (positive vertical velocity) requires more power
  // Descending (negative vertical velocity) requires less power
  const verticalFactor = state.droneVel.y / (maxSpd * 0.6); // Normalized vertical speed
  
  // Combined propeller speed: horizontal movement + vertical compensation
  // Climbing: add extra speed, Descending: reduce speed
  let propSpeedMultiplier = 1.0;
  if (verticalFactor > 0) {
    // Climbing - need extra power (up to 1.5x more)
    propSpeedMultiplier = 1.0 + verticalFactor * 1.5;
  } else if (verticalFactor < 0) {
    // Descending - need less power (down to 0.7x)
    propSpeedMultiplier = 1.0 + verticalFactor * 0.5;
  }
  
  const targetPropSpeed = (basePropSpeed + horizontalSpeedRatio * (maxPropSpeed - basePropSpeed)) * propSpeedMultiplier;
  // Propeller speed responds quickly to velocity changes
  state.propSpeed = THREE.MathUtils.lerp(state.propSpeed, state.gameStarted ? Math.min(targetPropSpeed, maxPropSpeed * 1.5) : 0, 15 * dt);

  // Distance tracking
  const moved = state.dronePos.distanceTo(prevPos);
  state.totalDist += moved;

  // Battery drain
  state.battery -= state.droneSpec.batteryDrain * dt * (1 + spd * 0.05);
  if (state.battery <= 0) { state.battery = 0; crash(); showNotif('电池耗尽！炸机！'); return; }
  if (state.battery < 20 && state.battery > 19.5) showNotif('⚠️ 电量低于 20%');

  // Bird collision
  for (const bird of birds) {
    if (bird.position.distanceTo(state.dronePos) < 3) {
      crash(); showNotif('💥 撞到飞鸟！炸机！'); return;
    }
  }

  // Obstacle avoidance indicator
  if (state.obstacleEnabled) updateObstacleIndicator();
}

export function crash() {
  state.isCrashed = true;
  state.propSpeed = 0; // Stop propellers
  document.getElementById('crashOverlay').classList.add('show');
  setTimeout(() => {
    state.isCrashed = false;
    state.dronePos.copy(state.homePos); state.droneVel.set(0, 0, 0);
    state.droneYaw = 0; state.dronePitch = 0; state.droneRoll = 0;
    state.battery = 100; state.totalDist = 0;
    state.propSpeed = 15;
    document.getElementById('crashOverlay').classList.remove('show');
    showNotif('已重置到家园点');
  }, 2000);
}

// Emergency stop - immediately stop propellers and crash with tumbling
export function emergencyStop() {
  if (!state.gameStarted || state.isCrashed) return;
  
  state.propSpeed = 0; // Stop propellers immediately
  state.isEmergencyStop = true;
  showNotif('💥 紧急停桨！飞机正在坠落！');
  
  // Random tumble direction - fast and chaotic tumbling
  state.tumblePitch = (Math.random() - 0.5) * 15; // Fast pitch rotation
  state.tumbleRoll = (Math.random() - 0.5) * 18;  // Fast roll rotation
  state.tumbleYaw = (Math.random() - 0.5) * 10;   // Fast yaw rotation
  
  // Store initial horizontal velocity for tumbling movement
  state.tumbleVelX = state.droneVel.x * 0.8;
  state.tumbleVelZ = state.droneVel.z * 0.8;
}

// Update emergency stop falling - call from game loop
export function updateEmergencyStop(dt) {
  if (!state.isEmergencyStop || state.isCrashed) return;
  
  // Apply gravity - very fast fall
  state.droneVel.y -= 25 * dt; // Much heavier fall
  
  // Horizontal movement with tumbling
  state.droneVel.x = state.tumbleVelX;
  state.droneVel.z = state.tumbleVelZ;
  state.tumbleVelX *= 0.98; // Slow down
  state.tumbleVelZ *= 0.98;
  
  // Update position
  state.dronePos.add(state.droneVel.clone().multiplyScalar(dt));
  
  // Tumble the drone (rotation)
  state.dronePitch += state.tumblePitch * dt;
  state.droneRoll += state.tumbleRoll * dt;
  state.droneYaw += state.tumbleYaw * dt;
  
  // Check ground collision
  const groundH = getTerrainHeight(state.dronePos.x, state.dronePos.z) + 1;
  if (state.dronePos.y <= groundH) {
    state.dronePos.y = groundH;
    state.isEmergencyStop = false;
    crash();
    showNotif('💥 紧急停桨导致炸机！');
  }
}

function updateObstacleIndicator() {
  const dirs = [
    { id: 'ob-tl', dx: -1, dz: -1 }, { id: 'ob-tc', dx: 0, dz: -1 }, { id: 'ob-tr', dx: 1, dz: -1 },
    { id: 'ob-ml', dx: -1, dz: 0 }, { id: 'ob-mr', dx: 1, dz: 0 },
    { id: 'ob-bl', dx: -1, dz: 1 }, { id: 'ob-bc', dx: 0, dz: 1 }, { id: 'ob-br', dx: 1, dz: 1 },
  ];

  // Check for obstacles in front
  let frontObstacleDist = Infinity;
  let frontObstacleDir = null;

  dirs.forEach(d => {
    const el = document.getElementById(d.id);
    if (!el) return;
    el.className = 'ob-cell';
    const checkDir = new THREE.Vector3(
      Math.sin(state.droneYaw) + d.dx * 0.5, 0,
      Math.cos(state.droneYaw) + d.dz * 0.5
    ).normalize();
    const ray = new THREE.Raycaster(state.dronePos, checkDir, 0, 20);
    const hits = ray.intersectObjects(terrainGroup.children, true);
    if (hits.length > 0) {
      const dist = hits[0].distance;
      if (dist < 3) el.classList.add('active-danger');
      else if (dist < 8) el.classList.add('active-warn');
      else el.classList.add('active-safe');

      // Track front obstacle for avoidance logic
      if (d.dz === -1 && dist < frontObstacleDist) {
        frontObstacleDist = dist;
        frontObstacleDir = d.dx; // -1 = left, 0 = center, 1 = right
      }
    }
  });

  // Execute obstacle avoidance based on mode
  if (state.obstacleEnabled && frontObstacleDist < 8) {
    if (state.obstacleMode === 'brake') {
      // Brake mode: stop when obstacle is close
      if (frontObstacleDist < 5) {
        // Reduce forward velocity
        const forward = new THREE.Vector3(-Math.sin(state.droneYaw), 0, -Math.cos(state.droneYaw));
        const forwardVel = state.droneVel.dot(forward);
        if (forwardVel > 0) {
          state.droneVel.addScaledVector(forward, -forwardVel * 0.5);
        }
      }
    } else if (state.obstacleMode === 'bypass') {
      // Bypass mode: steer around obstacle from distance
      const avoidStrength = 1 - (frontObstacleDist / 8); // Stronger when closer

      if (frontObstacleDist < 6) {
        // Determine which way to turn based on obstacle position
        // If obstacle is on left (dx < 0), turn right; if on right (dx > 0), turn left
        let turnDir = frontObstacleDir !== null ? -frontObstacleDir : 1;
        if (turnDir === 0) turnDir = Math.random() > 0.5 ? 1 : -1; // If center, pick a side

        // Apply sideward velocity to bypass
        const right = new THREE.Vector3(Math.cos(state.droneYaw), 0, -Math.sin(state.droneYaw));
        state.droneVel.addScaledVector(right, turnDir * avoidStrength * 5);
      }
    }
  }

  // Bird proximity warning
  const warnBorder = document.getElementById('warnBorder');
  const warnOverlay = document.getElementById('warningOverlay');
  let closeBird = false;
  birds.forEach(b => { if (b.position.distanceTo(state.dronePos) < 15) closeBird = true; });
  if (closeBird) { warnOverlay.classList.add('show'); warnBorder.classList.add('red'); }
  else { warnOverlay.classList.remove('show'); warnBorder.classList.remove('red'); }
}