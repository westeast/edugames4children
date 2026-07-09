// Waypoint Flight System - 航点飞行
import * as THREE from 'three';
import { scene } from './engine.js';
import { state } from './config.js';
import { getTerrainHeight } from './terrain.js';
import { showNotif } from './ui.js';
// Avoid circular import: triggerRTH is on window (set by controls.js)

let waypoints = [];         // [{x, z, y}] world coords
let currentWaypointIdx = 0;
let waypointPathMesh = null;
let waypointMarkers = [];
let mapRenderPending = false;

// === 航点规划 ===

export function openWaypointPlanner() {
  const modal = document.getElementById('waypointModal');
  if (!modal) return;
  modal.style.display = 'flex';
  renderMinimap();
  // Update button state
  const btn = document.getElementById('btnWaypoint');
  if (btn) btn.classList.add('active');
}

export function closeWaypointPlanner() {
  const modal = document.getElementById('waypointModal');
  if (!modal) return;
  modal.style.display = 'none';
  const btn = document.getElementById('btnWaypoint');
  if (btn) btn.classList.remove('active');
}

export function addWaypoint(worldX, worldZ) {
  const terrainY = getTerrainHeight(worldX, worldZ) + 30; // 30m above terrain
  waypoints.push({ x: worldX, z: worldZ, y: terrainY });
  renderMinimap();
  updateWaypointInfo();
}

export function clearWaypoints() {
  waypoints = [];
  renderMinimap();
  updateWaypointInfo();
  showNotif('🧭 航点已清除');
}

export function getWaypoints() {
  return waypoints;
}

export function setWaypointSpeed(speed) {
  state.waypointSpeed = speed;
}

// === 航点飞行执行 ===

export function startWaypointFlight() {
  if (waypoints.length === 0) {
    showNotif('⚠️ 请先添加航点');
    return;
  }

  // Check battery - estimate distance
  let totalDist = 0;
  let prevPos = state.dronePos.clone();
  for (const wp of waypoints) {
    const wpPos = new THREE.Vector3(wp.x, wp.y, wp.z);
    totalDist += prevPos.distanceTo(wpPos);
    prevPos = wpPos;
  }
  // Rough battery estimate: batteryDrain * distance / speed
  const estTime = totalDist / state.waypointSpeed; // seconds
  const estDrain = state.droneSpec.batteryDrain * estTime;
  if (estDrain > state.battery) {
    showNotif('⚠️ 当前电量不够路段，请减少路段后再点击Go');
    return;
  }

  // Not yet in air (on ground at start)
  if (!state.gameStarted || state.isLanded) {
    // Show confirmation
    const confirmModal = document.getElementById('waypointConfirmModal');
    if (confirmModal) {
      confirmModal.style.display = 'flex';
      return;
    }
  }

  executeWaypointFlight();
}

export function confirmWaypointFlight() {
  const confirmModal = document.getElementById('waypointConfirmModal');
  if (confirmModal) confirmModal.style.display = 'none';

  // Take off first
  if (state.isLanded) {
    state.isLanded = false;
    const groundH = getTerrainHeight(state.dronePos.x, state.dronePos.z) + 1;
    state.dronePos.y = groundH + 30;
    showNotif('🛫 起飞中...');
  }

  executeWaypointFlight();
}

export function cancelWaypointConfirm() {
  const confirmModal = document.getElementById('waypointConfirmModal');
  if (confirmModal) confirmModal.style.display = 'none';
}

function executeWaypointFlight() {
  // Close planner modal
  closeWaypointPlanner();

  state.isWaypointFlying = true;
  state.isCruise = false;
  state.isRTH = false;
  currentWaypointIdx = 0;

  // Create 3D path visualization
  createWaypointPath3D();

  showNotif('🧭 航点飞行开始！飞向航点 1');
}

export function stopWaypointFlight() {
  state.isWaypointFlying = false;
  currentWaypointIdx = 0;
  removeWaypointPath3D();
  showNotif('🧭 航点飞行已停止');
}

export function isWaypointActive() {
  return state.isWaypointFlying;
}

// === 每帧更新 ===

export function updateWaypointFlight(dt) {
  if (!state.isWaypointFlying) return;
  if (waypoints.length === 0 || currentWaypointIdx >= waypoints.length) {
    // All waypoints reached
    state.isWaypointFlying = false;
    removeWaypointPath3D();
    showNotif('✅ 航点飞行完成！');
    return;
  }

  const target = waypoints[currentWaypointIdx];
  const targetPos = new THREE.Vector3(target.x, target.y, target.z);
  const toTarget = new THREE.Vector3().subVectors(targetPos, state.dronePos);
  const dist = toTarget.length();

  // Reached waypoint
  if (dist < 5) {
    currentWaypointIdx++;
    if (currentWaypointIdx >= waypoints.length) {
      state.isWaypointFlying = false;
      removeWaypointPath3D();
      showNotif('✅ 航点飞行完成！');
    } else {
      showNotif('🧭 飞向航点 ' + (currentWaypointIdx + 1));
    }
    return;
  }

  // Signal check - if too far from home, trigger RTH
  const distFromHome = state.dronePos.distanceTo(state.homePos);
  if (distFromHome > 8000) {
    state.isWaypointFlying = false;
    removeWaypointPath3D();
    showNotif('⚠️ 信号断裂！执行自动返航');
    if (window.triggerRTH) window.triggerRTH();
    return;
  }

  // Autopilot: steer toward target
  const speed = state.waypointSpeed;

  // Horizontal direction
  const toTargetH = new THREE.Vector3(toTarget.x, 0, toTarget.z);
  const distH = toTargetH.length();

  if (distH > 1) {
    // Yaw toward target
    const angleToTarget = Math.atan2(toTargetH.x, toTargetH.z);
    let yawDiff = angleToTarget - state.droneYaw + Math.PI;
    while (yawDiff > Math.PI) yawDiff -= Math.PI * 2;
    while (yawDiff < -Math.PI) yawDiff += Math.PI * 2;

    // Smooth yaw
    const yawRate = Math.sign(yawDiff) * Math.min(Math.abs(yawDiff) * 2, 2.0);
    state.droneYaw += yawRate * dt;

    // Forward speed
    const forwardSpeed = Math.min(speed, distH);
    const forward = new THREE.Vector3(-Math.sin(state.droneYaw), 0, -Math.cos(state.droneYaw));
    state.droneVel.x = forward.x * forwardSpeed;
    state.droneVel.z = forward.z * forwardSpeed;
  } else {
    state.droneVel.x = 0;
    state.droneVel.z = 0;
  }

  // Vertical: move toward target altitude
  const heightDiff = target.y - state.dronePos.y;
  const verticalSpeed = Math.sign(heightDiff) * Math.min(Math.abs(heightDiff) * 2, 5);
  state.droneVel.y = verticalSpeed;

  // Obstacle avoidance - check terrain height ahead
  const lookAhead = 20;
  const aheadPos = state.dronePos.clone().add(
    new THREE.Vector3(-Math.sin(state.droneYaw) * lookAhead, 0, -Math.cos(state.droneYaw) * lookAhead)
  );
  const terrainAhead = getTerrainHeight(aheadPos.x, aheadPos.z) + 5;
  if (state.dronePos.y < terrainAhead) {
    // Climb to avoid
    state.droneVel.y = Math.max(state.droneVel.y, 5);
  }

  // Update position
  state.dronePos.add(state.droneVel.clone().multiplyScalar(dt));

  // Keep above terrain
  const groundH = getTerrainHeight(state.dronePos.x, state.dronePos.z) + 1;
  if (state.dronePos.y < groundH) {
    state.dronePos.y = groundH;
    state.droneVel.y = 0;
  }

  // Update 3D path
  updateWaypointPath3D();
}

// === 2D 地图渲染 ===

export function renderMinimap() {
  const canvas = document.getElementById('waypointMap');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;

  // Map center: drone position
  const cx = state.dronePos.x;
  const cz = state.dronePos.z;
  const range = 500; // ±500m visible
  const meterPerPixel = (range * 2) / w; // 2m per pixel for 500px

  // Render terrain
  const step = 4; // Sample every 4 pixels for performance
  for (let py = 0; py < h; py += step) {
    for (let px = 0; px < w; px += step) {
      const wx = cx + (px - w / 2) * meterPerPixel;
      const wz = cz + (py - h / 2) * meterPerPixel;
      const terrainH = getTerrainHeight(wx, wz);

      // Color based on height
      let color;
      if (terrainH < 2) {
        color = '#1a5276'; // Deep water
      } else if (terrainH < 5) {
        color = '#2e86c1'; // Shallow water
      } else if (terrainH < 15) {
        color = '#27ae60'; // Low green
      } else if (terrainH < 30) {
        color = '#1e8449'; // Medium green
      } else if (terrainH < 60) {
        color = '#7d6608'; // Brown hills
      } else if (terrainH < 80) {
        color = '#a04000'; // Mountain
      } else {
        color = '#d5d8dc'; // Snow peak
      }

      ctx.fillStyle = color;
      ctx.fillRect(px, py, step, step);
    }
  }

  // Draw city buildings if city map
  // (Buildings are in terrainGroup - skip for performance, terrain color handles it)

  // Draw home point
  const homePx = Math.round((state.homePos.x - cx) / meterPerPixel + w / 2);
  const homePy = Math.round((state.homePos.z - cz) / meterPerPixel + h / 2);
  if (homePx >= 0 && homePx < w && homePy >= 0 && homePy < h) {
    ctx.fillStyle = '#ff8800';
    ctx.font = 'bold 16px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('H', homePx, homePy);
  }

  // Draw drone position
  const dronePx = Math.round((state.dronePos.x - cx) / meterPerPixel + w / 2);
  const dronePy = Math.round((state.dronePos.z - cz) / meterPerPixel + h / 2);
  ctx.fillStyle = '#ff3333';
  ctx.beginPath();
  ctx.moveTo(dronePx, dronePy - 8);
  ctx.lineTo(dronePx - 6, dronePy + 6);
  ctx.lineTo(dronePx + 6, dronePy + 6);
  ctx.closePath();
  ctx.fill();

  // Draw waypoint route
  if (waypoints.length > 0) {
    ctx.strokeStyle = '#ffcc00';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);

    // Line from drone to first waypoint
    const wp0Px = Math.round((waypoints[0].x - cx) / meterPerPixel + w / 2);
    const wp0Py = Math.round((waypoints[0].z - cz) / meterPerPixel + h / 2);
    ctx.beginPath();
    ctx.moveTo(dronePx, dronePy);
    ctx.lineTo(wp0Px, wp0Py);
    ctx.stroke();

    // Lines between waypoints
    for (let i = 1; i < waypoints.length; i++) {
      const prevPx = Math.round((waypoints[i - 1].x - cx) / meterPerPixel + w / 2);
      const prevPy = Math.round((waypoints[i - 1].z - cz) / meterPerPixel + h / 2);
      const curPx = Math.round((waypoints[i].x - cx) / meterPerPixel + w / 2);
      const curPy = Math.round((waypoints[i].z - cz) / meterPerPixel + h / 2);
      ctx.beginPath();
      ctx.moveTo(prevPx, prevPy);
      ctx.lineTo(curPx, curPy);
      ctx.stroke();
    }

    // Line from last waypoint back to first (closed loop indicator)
    if (waypoints.length > 1) {
      const lastPx = Math.round((waypoints[waypoints.length - 1].x - cx) / meterPerPixel + w / 2);
      const lastPy = Math.round((waypoints[waypoints.length - 1].z - cz) / meterPerPixel + h / 2);
      ctx.strokeStyle = '#ffcc0088';
      ctx.beginPath();
      ctx.moveTo(lastPx, lastPy);
      ctx.lineTo(wp0Px, wp0Py);
      ctx.stroke();
    }

    ctx.setLineDash([]);

    // Draw waypoint markers
    for (let i = 0; i < waypoints.length; i++) {
      const wpPx = Math.round((waypoints[i].x - cx) / meterPerPixel + w / 2);
      const wpPy = Math.round((waypoints[i].z - cz) / meterPerPixel + h / 2);
      ctx.fillStyle = '#ffcc00';
      ctx.beginPath();
      ctx.arc(wpPx, wpPy, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#000';
      ctx.font = 'bold 10px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(i + 1), wpPx, wpPy);
    }
  }

  // Compass
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 12px Arial';
  ctx.textAlign = 'center';
  ctx.fillText('N', w / 2, 14);
  ctx.fillText('S', w / 2, h - 6);
  ctx.fillText('W', 10, h / 2);
  ctx.fillText('E', w - 10, h / 2);
}

// Canvas click handler - add waypoint at clicked position
export function handleMapClick(event) {
  const canvas = document.getElementById('waypointMap');
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  const px = (event.clientX - rect.left) * (canvas.width / rect.width);
  const py = (event.clientY - rect.top) * (canvas.height / rect.height);

  const cx = state.dronePos.x;
  const cz = state.dronePos.z;
  const range = 500;
  const meterPerPixel = (range * 2) / canvas.width;

  const worldX = cx + (px - canvas.width / 2) * meterPerPixel;
  const worldZ = cz + (py - canvas.height / 2) * meterPerPixel;

  addWaypoint(worldX, worldZ);
}

// === 3D 路线可视化 ===

function createWaypointPath3D() {
  removeWaypointPath3D();
  if (waypoints.length === 0) return;

  const points = [state.dronePos.clone()];
  for (const wp of waypoints) {
    points.push(new THREE.Vector3(wp.x, wp.y, wp.z));
  }

  // Tube path
  if (points.length >= 2) {
    const curve = new THREE.CatmullRomCurve3(points);
    const geo = new THREE.TubeGeometry(curve, points.length * 10, 1.5, 8, false);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffcc00, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false });
    waypointPathMesh = new THREE.Mesh(geo, mat);
    scene.add(waypointPathMesh);
  }

  // Markers
  for (let i = 0; i < waypoints.length; i++) {
    const wp = waypoints[i];
    const markerGeo = new THREE.SphereGeometry(2, 8, 8);
    const markerMat = new THREE.MeshBasicMaterial({ color: 0xffcc00 });
    const marker = new THREE.Mesh(markerGeo, markerMat);
    marker.position.set(wp.x, wp.y, wp.z);
    scene.add(marker);
    waypointMarkers.push(marker);
  }
}

function updateWaypointPath3D() {
  // Recreate path from current position periodically
  // (simple approach: recreate every ~2 seconds via timer)
  // For now, path stays static - it's set at flight start
}

function removeWaypointPath3D() {
  if (waypointPathMesh) {
    scene.remove(waypointPathMesh);
    waypointPathMesh.geometry.dispose();
    waypointPathMesh.material.dispose();
    waypointPathMesh = null;
  }
  for (const m of waypointMarkers) {
    scene.remove(m);
    m.geometry.dispose();
    m.material.dispose();
  }
  waypointMarkers = [];
}

// === UI helpers ===

function updateWaypointInfo() {
  const el = document.getElementById('wpInfo');
  if (!el) return;
  if (waypoints.length === 0) {
    el.textContent = '点击地图添加航点';
  } else {
    let totalDist = 0;
    let prev = state.dronePos.clone();
    for (const wp of waypoints) {
      totalDist += prev.distanceTo(new THREE.Vector3(wp.x, wp.y, wp.z));
      prev = new THREE.Vector3(wp.x, wp.y, wp.z);
    }
    el.textContent = waypoints.length + ' 个航点 · 总距离 ' + Math.round(totalDist) + 'm';
  }
}
