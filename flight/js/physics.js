// Flight physics, collision detection, and game mechanics
import * as THREE from 'three';
import { scene } from './engine.js';
import { state, DRONES, GEAR_MULT, MANUAL_TURN_MULT } from './config.js';
import { getTerrainHeight, terrainGroup } from './terrain.js';
import { birds } from './entities.js';
import { showNotif } from './ui.js';
import { createRTHPath, removeRTHPath, isLanding } from './rth-path.js';
import { isManualMode, updateManualControls, getManualTurnSpeed } from './manual-mode.js';
import { initCrashSequence, updateCrashPhysics, CRASH_TYPES } from './crash-physics.js';
import { buildingBounds, powerLines, bridges } from './maps/city-map.js';
import { updateFollowPath, removeFollowPath } from './follow-path.js';
import { updateWaypointFlight } from './waypoint.js';

// Track which map we're on for collision detection
let currentMapType = 'mountain';

export function updateDrone(dt) {
  if (state.isCrashed || state.isPaused || !state.gameStarted) return;

  // 处理炸机物理
  if (state.isCrashing) {
    updateCrashPhysics(dt);
    return;
  }

  // 处理紧急停桨
  if (state.isEmergencyStop) {
    updateEmergencyStop(dt);
    return;
  }

  // 处理已降落状态 - 需要按空格起飞
  if (state.isLanded) {
    // 检测起飞输入：空格键或左摇杆向上
    const takeoffInput = state.keys[' '] || state.leftStick.y > 0.3;
    if (takeoffInput) {
      state.isLanded = false;
      state.droneVel.y = 3;  // 初始上升速度
      showNotif('🚀 起飞');
    }
    // 降落状态下不处理其他输入
    return;
  }

  // 处理跟随模式
  if (state.isFollowMode && state.followTarget) {
    updateFollowMode(dt);
    return;
  }

  // 处理航点飞行 - waypoint.js handles movement directly
  if (state.isWaypointFlying) {
    updateWaypointPhysics(dt);
    return;
  }

  // 处理手动模式 M档
  if (isManualMode() && state.currentGear === 'M') {
    if (updateManualControls(dt)) {
      // 手动模式已处理输入和速度更新，继续碰撞检测
      doCollisionAndBattery(dt);
      return;
    }
  }

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

  // 手动模式下转向速度更快
  const turnMult = isManualMode() ? getManualTurnSpeed() : 1.0;

  // Cruise mode override
  if (state.isCruise && !state.isRTH) { inputF = 1; inputUp = 0; inputR = 0; inputYaw = 0; }

  // Return-to-home autopilot
  if (state.isRTH) {
    // DISABLE all user input during RTH
    inputF = 0; inputR = 0; inputUp = 0; inputYaw = 0;

    const toHome = new THREE.Vector3().subVectors(state.homePos, state.dronePos);
    toHome.y = 0; // Only consider horizontal distance
    const dist = toHome.length();

    // Get ground height at current position for landing detection
    const groundHere = getTerrainHeight(state.dronePos.x, state.dronePos.z) + 1;
    // Get ground height at home position for final landing
    const groundAtHome = getTerrainHeight(state.homePos.x, state.homePos.z) + 1;

    // Create RTH path visualization
    createRTHPath();

    // Calculate direction from drone to home
    const angleToHome = Math.atan2(toHome.x, toHome.z);

    // droneYaw=0 means drone faces -Z direction
    let yawDiff = angleToHome - state.droneYaw + Math.PI;
    while (yawDiff > Math.PI) yawDiff -= Math.PI * 2;
    while (yawDiff < -Math.PI) yawDiff += Math.PI * 2;

    // Calculate height above ground for landing
    const heightAboveGround = state.dronePos.y - Math.max(groundHere, groundAtHome);

    // Final landing - drone is close to ground and close to home
    if (dist < 5 && heightAboveGround <= 1.5) {
      state.isRTH = false;
      state.isLanded = true;  // Lock drone on ground
      state.droneVel.set(0, 0, 0);
      state.dronePos.set(state.homePos.x, groundAtHome, state.homePos.z);
      removeRTHPath();
      showNotif('✅ 已返航到家，降落完成（按空格起飞）');
      return;
    }

    // Phase 3: Landing - close to home point, descend to ground
    if (dist < 5) {
      // First, turn to face home if not aligned
      if (Math.abs(yawDiff) > 0.5) {
        // Need to turn first - don't move forward
        inputYaw = Math.sign(yawDiff) * 0.8;
        inputF = 0;
      } else {
        // Aligned with home - can move forward to center
        inputYaw = yawDiff * 0.5; // Gentle yaw correction

        if (dist > 0.5) {
          inputF = Math.min(dist * 0.2, 0.4); // Move toward home
        }
      }
      inputR = 0;

      // More aggressive descent for landing
      if (heightAboveGround > 10) {
        // Fast descent from high altitude
        inputUp = -0.8;
      } else if (heightAboveGround > 3) {
        // Medium descent
        inputUp = -0.6;
      } else if (heightAboveGround > 1.5) {
        // Slower descent near ground
        inputUp = -0.5;
      } else if (heightAboveGround > 0.5) {
        // Very slow final descent
        inputUp = -0.3;
      }
      // If heightAboveGround <= 0.5, stop descending - will trigger landing next frame
    }
    // Phase 2: Approach - close to home, prepare for landing
    else if (dist < 15) {
      // Slow approach
      const speedFactor = Math.max(0.3, dist / 15);
      inputF = speedFactor * 0.6;
      inputR = 0;
      inputYaw = yawDiff * 0.5;

      // Start descending to home altitude first
      const heightDiff = state.homePos.y - state.dronePos.y;
      if (heightDiff > 2) {
        inputUp = Math.min(heightDiff * 0.1, 0.3);
      } else if (heightDiff < -2) {
        inputUp = Math.max(heightDiff * 0.1, -0.3);
      } else {
        inputUp = 0;
      }
    }
    // Phase 1: Turn to face home first
    else if (Math.abs(yawDiff) > 0.3) {
      inputYaw = Math.sign(yawDiff) * 1.5;
      inputF = 0;
      inputR = 0;
      inputUp = 0;
    }
    // Phase 1b: Fly towards home
    else {
      inputF = 1;
      inputR = 0;
      inputYaw = yawDiff * 0.8;

      // Maintain safe altitude during flight
      if (state.dronePos.y < 30) inputUp = 0.5;
      else if (state.dronePos.y > state.homePos.y + 20) inputUp = -0.2;
      else inputUp = 0;
    }
  } else {
    // Remove RTH path if not in RTH mode
    removeRTHPath();
  }

  // Yaw rotation (考虑手动模式转向速度)
  state.droneYaw += inputYaw * 2.0 * turnMult * dt;

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
    if (state.droneVel.y < -8) { crash(CRASH_TYPES.COLLISION); return; }
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
  if (state.battery <= 0) { state.battery = 0; crash(CRASH_TYPES.BATTERY); showNotif('电池耗尽！炸机！'); return; }
  if (state.battery < 20 && state.battery > 19.5) showNotif('⚠️ 电量低于 20%');

  // Bird collision
  for (const bird of birds) {
    if (bird.position.distanceTo(state.dronePos) < 3) {
      crash(CRASH_TYPES.BIRD); showNotif('💥 撞到飞鸟！炸机！'); return;
    }
  }

  // Building collision (city map only)
  checkBuildingCollision();

  // Power line collision (city map only)
  checkPowerLineCollision();

  // Bridge collision (city map only)
  checkBridgeCollision();

  // Obstacle avoidance indicator
  if (state.obstacleEnabled) updateObstacleIndicator();
}

// 碰撞检测和电量消耗 (用于手动模式后的处理)
function doCollisionAndBattery(dt) {
  const maxSpd = state.droneSpec.maxSpeed * (GEAR_MULT['M'] || 1.8);

  // Ground collision
  const groundH = getTerrainHeight(state.dronePos.x, state.dronePos.z) + 1;
  if (state.dronePos.y < groundH) {
    state.dronePos.y = groundH;
    if (state.droneVel.y < -8) { crash(CRASH_TYPES.COLLISION); return; }
    else state.droneVel.y = 0;
  }
  if (state.dronePos.y > 500) state.dronePos.y = 500;

  // Propeller speed
  const basePropSpeed = 15;
  const maxPropSpeed = 50;
  const horizontalSpeedRatio = Math.sqrt(state.droneVel.x * state.droneVel.x + state.droneVel.z * state.droneVel.z) / maxSpd;
  const targetPropSpeed = basePropSpeed + horizontalSpeedRatio * (maxPropSpeed - basePropSpeed);
  state.propSpeed = THREE.MathUtils.lerp(state.propSpeed, state.gameStarted ? Math.min(targetPropSpeed, maxPropSpeed) : 0, 15 * dt);

  // Battery drain
  const spd = state.droneVel.length();
  state.battery -= state.droneSpec.batteryDrain * dt * (1 + spd * 0.05);
  if (state.battery <= 0) { state.battery = 0; crash(CRASH_TYPES.BATTERY); return; }
  if (state.battery < 20 && state.battery > 19.5) showNotif('⚠️ 电量低于 20%');

  // Bird collision
  for (const bird of birds) {
    if (bird.position.distanceTo(state.dronePos) < 3) {
      crash(CRASH_TYPES.BIRD); return;
    }
  }

  // Building collision (city map only)
  checkBuildingCollision();

  // Power line collision (city map only)
  checkPowerLineCollision();

  // Bridge collision (city map only)
  checkBridgeCollision();

  // Obstacle avoidance indicator
  if (state.obstacleEnabled) updateObstacleIndicator();
}

// 新的 crash 函数 - 使用翻滚效果
export function crash(crashType = CRASH_TYPES.COLLISION) {
  initCrashSequence(crashType);
}

// Emergency stop - 使用统一的炸机系统
export function emergencyStop() {
  if (!state.gameStarted || state.isCrashed) return;
  initCrashSequence(CRASH_TYPES.EMERGENCY);
}

// Update emergency stop falling - 现由 crash-physics.js 处理
export function updateEmergencyStop(dt) {
  updateCrashPhysics(dt);
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

// === BUILDING COLLISION DETECTION ===
function checkBuildingCollision() {
  if (buildingBounds.length === 0) return;

  const droneR = 1.5; // Drone collision radius
  const pos = state.dronePos;

  for (const b of buildingBounds) {
    // AABB collision check with drone radius
    const collides =
      pos.x + droneR > b.minX && pos.x - droneR < b.maxX &&
      pos.y > b.minY && pos.y - droneR < b.maxY &&
      pos.z + droneR > b.minZ && pos.z - droneR < b.maxZ;

    if (collides) {
      // Calculate impact speed for tumble intensity
      const impactSpeed = state.droneVel.length();

      // If obstacle avoidance is enabled, try to avoid
      if (state.obstacleEnabled) {
        // Push drone away from building center
        const bCenterX = (b.minX + b.maxX) / 2;
        const bCenterZ = (b.minZ + b.maxZ) / 2;
        const pushX = pos.x - bCenterX;
        const pushZ = pos.z - bCenterZ;
        const pushLen = Math.sqrt(pushX * pushX + pushZ * pushZ);
        if (pushLen > 0.1) {
          state.droneVel.x += (pushX / pushLen) * 8;
          state.droneVel.z += (pushZ / pushLen) * 8;
          showNotif('⚠️ 检测到建筑物，正在避障');
        }
        // Push back to safe position
        if (pos.x < b.minX) pos.x = b.minX - droneR - 0.5;
        else if (pos.x > b.maxX) pos.x = b.maxX + droneR + 0.5;
        if (pos.z < b.minZ) pos.z = b.minZ - droneR - 0.5;
        else if (pos.z > b.maxZ) pos.z = b.maxZ + droneR + 0.5;
        return;
      }

      // No obstacle avoidance - CRASH!
      // Set impact speed for tumble intensity
      state.impactSpeed = impactSpeed;
      crash(CRASH_TYPES.COLLISION);
      showNotif('💥 撞到建筑物！炸机！');
      return;
    }
  }
}

// === POWER LINE COLLISION DETECTION ===
function checkPowerLineCollision() {
  if (powerLines.length === 0) return;

  const droneR = 1.0; // Drone collision radius for wires
  const pos = state.dronePos;

  for (const line of powerLines) {
    // Distance from point to line segment
    const dist = pointToLineSegmentDistance(
      pos.x, pos.y, pos.z,
      line.x1, line.y1, line.z1,
      line.x2, line.y2, line.z2
    );

    if (dist < droneR + line.radius) {
      const impactSpeed = state.droneVel.length();

      // If obstacle avoidance is enabled, try to avoid
      if (state.obstacleEnabled) {
        // Push drone down to avoid wire
        state.droneVel.y -= 5;
        showNotif('⚠️ 检测到电线，正在下降避障');
        return;
      }

      // No obstacle avoidance - CRASH with power line!
      // Power line crash spins MUCH faster
      state.impactSpeed = impactSpeed * 3; // Triple the impact speed for wire crashes
      crash(CRASH_TYPES.COLLISION);
      showNotif('💥⚡ 撞到电线！噼啪噼啪！炸机！');
      return;
    }
  }
}

// Distance from point to line segment in 3D
function pointToLineSegmentDistance(px, py, pz, x1, y1, z1, x2, y2, z2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const dz = z2 - z1;
  const lenSq = dx * dx + dy * dy + dz * dz;

  if (lenSq === 0) {
    // Line segment is a point
    return Math.sqrt((px - x1) ** 2 + (py - y1) ** 2 + (pz - z1) ** 2);
  }

  // Project point onto line segment
  let t = ((px - x1) * dx + (py - y1) * dy + (pz - z1) * dz) / lenSq;
  t = Math.max(0, Math.min(1, t));

  const closestX = x1 + t * dx;
  const closestY = y1 + t * dy;
  const closestZ = z1 + t * dz;

  return Math.sqrt((px - closestX) ** 2 + (py - closestY) ** 2 + (pz - closestZ) ** 2);
}

// === BRIDGE COLLISION DETECTION ===
function checkBridgeCollision() {
  if (bridges.length === 0) return;

  const droneR = 1.5; // Drone collision radius
  const pos = state.dronePos;

  for (const bridge of bridges) {
    // Check if drone is within bridge bounds
    const inBounds =
      pos.x + droneR > bridge.minX && pos.x - droneR < bridge.maxX &&
      pos.y + droneR > bridge.minY && pos.y - droneR < bridge.maxY &&
      pos.z + droneR > bridge.minZ && pos.z - droneR < bridge.maxZ;

    if (inBounds) {
      // Check if drone is in a hole
      let inHole = false;
      for (const hole of bridge.holes) {
        const inHoleBounds =
          pos.x > hole.minX && pos.x < hole.maxX &&
          pos.y > hole.minY && pos.y < hole.maxY &&
          pos.z > hole.minZ && pos.z < hole.maxZ;

        if (inHoleBounds) {
          inHole = true;
          break;
        }
      }

      // If not in a hole, collision with bridge deck
      if (!inHole) {
        const impactSpeed = state.droneVel.length();

        // If obstacle avoidance is enabled, try to avoid
        if (state.obstacleEnabled) {
          // Push drone down or up to avoid bridge
          if (pos.y > (bridge.minY + bridge.maxY) / 2) {
            // Drone is above bridge, push up
            state.droneVel.y += 5;
            showNotif('⚠️ 检测到桥梁，正在上升避障');
          } else {
            // Drone is below bridge, push down
            state.droneVel.y -= 5;
            showNotif('⚠️ 检测到桥梁，正在下降避障');
          }
          return;
        }

        // No obstacle avoidance - CRASH!
        state.impactSpeed = impactSpeed;
        crash(CRASH_TYPES.COLLISION);
        showNotif('💥 撞到桥梁！炸机！');
        return;
      } else {
        // Drone is flying through a hole
        // Show notification when near hole edges
        const nearEdge = false;
        for (const hole of bridge.holes) {
          const edgeThreshold = 0.3;
          if (Math.abs(pos.x - hole.minX) < edgeThreshold ||
              Math.abs(pos.x - hole.maxX) < edgeThreshold ||
              Math.abs(pos.z - hole.minZ) < edgeThreshold ||
              Math.abs(pos.z - hole.maxZ) < edgeThreshold) {
            showNotif('✈️ 穿过桥梁洞口！');
            break;
          }
        }
      }
    }
  }
}

// === FOLLOW MODE UPDATE ===
function updateFollowMode(dt) {
  if (!state.followTarget) {
    state.isFollowMode = false;
    return;
  }

  const target = state.followTarget;

  // Calculate vector to target
  const toTarget = new THREE.Vector3().subVectors(target.position, state.dronePos);
  toTarget.y = 0; // Only consider horizontal distance

  const dist = toTarget.length();

  // Check if target is too far (lost)
  if (dist > 200) {
    showNotif('⚠️ 目标丢失，跟随已停止');
    state.isFollowMode = false;
    removeFollowPath();
    return;
  }

  // Calculate direction to target
  const targetDir = Math.atan2(toTarget.x, toTarget.z);

  // Adjust yaw to face target
  let yawDiff = targetDir - state.droneYaw;
  while (yawDiff > Math.PI) yawDiff -= Math.PI * 2;
  while (yawDiff < -Math.PI) yawDiff += Math.PI * 2;

  // Smooth yaw adjustment
  state.droneYaw += yawDiff * 2.0 * dt;

  // Maintain follow height
  const heightDiff = state.followHeight - state.dronePos.y;
  if (Math.abs(heightDiff) > 2) {
    state.droneVel.y = heightDiff > 0 ? 3 : -2; // Climb or descend
  } else {
    state.droneVel.y = 0; // Maintain height
  }

  // Calculate forward direction based on current yaw
  const forward = new THREE.Vector3(-Math.sin(state.droneYaw), 0, -Math.cos(state.droneYaw));

  // Maintain follow distance
  if (dist > state.followDistance + 5) {
    // Target is far, accelerate forward
    const speed = Math.min(state.followSpeed, dist * 0.3);
    state.droneVel.x = forward.x * speed;
    state.droneVel.z = forward.z * speed;
  } else if (dist < state.followDistance - 3) {
    // Target is too close, slow down and backup
    state.droneVel.x = -forward.x * state.followSpeed * 0.5;
    state.droneVel.z = -forward.z * state.followSpeed * 0.5;
  } else {
    // Maintain distance, match target speed
    const targetSpeed = target.userData?.speed || 10;
    state.droneVel.x = forward.x * Math.min(targetSpeed, state.followSpeed);
    state.droneVel.z = forward.z * Math.min(targetSpeed, state.followSpeed);
  }

  // Update position
  const prevPos = state.dronePos.clone();
  state.dronePos.add(state.droneVel.clone().multiplyScalar(dt));

  // Ground collision
  const groundH = getTerrainHeight(state.dronePos.x, state.dronePos.z) + 1;
  if (state.dronePos.y < groundH) {
    state.dronePos.y = groundH;
    state.droneVel.y = 0;
  }

  // Height ceiling
  if (state.dronePos.y > 500) {
    state.dronePos.y = 500;
    state.droneVel.y = 0;
  }

  // Distance tracking
  const moved = state.dronePos.distanceTo(prevPos);
  state.totalDist += moved;

  // Battery drain
  const spd = state.droneVel.length();
  state.battery -= state.droneSpec.batteryDrain * dt * (1 + spd * 0.05);
  if (state.battery <= 0) {
    state.battery = 0;
    crash(CRASH_TYPES.BATTERY);
    showNotif('电池耗尽！炸机！');
    return;
  }
  if (state.battery < 20 && state.battery > 19.5) {
    showNotif('⚠️ 电量低于 20%');
  }

  // Visual tilt
  const inputF = state.droneVel.length() / state.followSpeed;
  const inputR = yawDiff / Math.PI;
  state.dronePitch = THREE.MathUtils.lerp(state.dronePitch, -inputF * 0.15, 3 * dt);
  state.droneRoll = THREE.MathUtils.lerp(state.droneRoll, -inputR * 0.2, 3 * dt);

  // Propeller speed
  const basePropSpeed = 15;
  const maxPropSpeed = 50;
  const horizontalSpeedRatio = Math.sqrt(state.droneVel.x * state.droneVel.x + state.droneVel.z * state.droneVel.z) / state.followSpeed;
  const targetPropSpeed = basePropSpeed + horizontalSpeedRatio * (maxPropSpeed - basePropSpeed);
  state.propSpeed = THREE.MathUtils.lerp(state.propSpeed, targetPropSpeed, 15 * dt);

  // Update follow path visualization
  updateFollowPath();

  // Collision detection
  for (const bird of birds) {
    if (bird.position.distanceTo(state.dronePos) < 3) {
      crash(CRASH_TYPES.BIRD);
      showNotif('💥 撞到飞鸟！炸机！');
      return;
    }
  }

  checkBuildingCollision();
  checkPowerLineCollision();
  checkBridgeCollision();

  if (state.obstacleEnabled) {
    updateObstacleIndicator();
  }
}

// === WAYPOINT FLIGHT PHYSICS ===
// waypoint.js handles position/velocity/yaw; this handles collision, battery, prop visuals
function updateWaypointPhysics(dt) {
  // First, let waypoint.js update position/velocity
  updateWaypointFlight(dt);
  if (!state.isWaypointFlying) return; // Waypoint flight ended or crashed

  const maxSpd = state.droneSpec.maxSpeed;

  // Ground collision
  const groundH = getTerrainHeight(state.dronePos.x, state.dronePos.z) + 1;
  if (state.dronePos.y < groundH) {
    state.dronePos.y = groundH;
    if (state.droneVel.y < -8) { crash(CRASH_TYPES.COLLISION); return; }
    else state.droneVel.y = 0;
  }
  if (state.dronePos.y > 500) state.dronePos.y = 500;

  // Visual tilt based on velocity direction
  const forward = new THREE.Vector3(-Math.sin(state.droneYaw), 0, -Math.cos(state.droneYaw));
  const right = new THREE.Vector3(Math.cos(state.droneYaw), 0, -Math.sin(state.droneYaw));
  const inputF = state.droneVel.dot(forward) / maxSpd;
  const inputR = state.droneVel.dot(right) / maxSpd;
  state.dronePitch = THREE.MathUtils.lerp(state.dronePitch, -inputF * 0.3, 3 * dt);
  state.droneRoll = THREE.MathUtils.lerp(state.droneRoll, -inputR * 0.3, 3 * dt);

  // Propeller speed
  const basePropSpeed = 15;
  const maxPropSpeed = 50;
  const horizontalSpeedRatio = Math.sqrt(state.droneVel.x * state.droneVel.x + state.droneVel.z * state.droneVel.z) / maxSpd;
  const targetPropSpeed = basePropSpeed + horizontalSpeedRatio * (maxPropSpeed - basePropSpeed);
  state.propSpeed = THREE.MathUtils.lerp(state.propSpeed, Math.min(targetPropSpeed, maxPropSpeed), 15 * dt);

  // Distance tracking
  // (waypoint.js updates dronePos, so we track distance here)
  // Battery drain
  const spd = state.droneVel.length();
  state.battery -= state.droneSpec.batteryDrain * dt * (1 + spd * 0.05);
  if (state.battery <= 0) { state.battery = 0; crash(CRASH_TYPES.BATTERY); showNotif('电池耗尽！炸机！'); return; }
  if (state.battery < 20 && state.battery > 19.5) showNotif('⚠️ 电量低于 20%');

  // Bird collision
  for (const bird of birds) {
    if (bird.position.distanceTo(state.dronePos) < 3) {
      crash(CRASH_TYPES.BIRD); showNotif('💥 撞到飞鸟！炸机！'); return;
    }
  }

  checkBuildingCollision();
  checkPowerLineCollision();
  checkBridgeCollision();

  if (state.obstacleEnabled) updateObstacleIndicator();
}