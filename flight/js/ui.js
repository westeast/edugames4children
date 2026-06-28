// UI update: telemetry panel, battery, notification, camera tracking
import * as THREE from 'three';
import { camera, skyMesh, sunLight, renderer } from './engine.js';
import { state } from './config.js';
import { getTerrainHeight } from './terrain.js';

export function showNotif(text, dur = 3) {
  const el = document.getElementById('notification');
  el.textContent = text; el.classList.add('show'); state.notifTimer = dur;
}

export function updateCamera(gameStarted = false) {
  // Always ensure camera has valid position
  if (!Number.isFinite(state.dronePos.x) || !Number.isFinite(state.dronePos.y) || !Number.isFinite(state.dronePos.z)) {
    camera.position.set(0, 50, 30);
    camera.lookAt(0, 0, 0);
    return;
  }

  // 重置 camera.up 防止 FPV 模式切换时画面倒置
  // Three.js lookAt() 在云台俯仰角极端时会导致 up 向量翻转
  camera.up.set(0, 1, 0);

  skyMesh.position.copy(state.dronePos);
  sunLight.position.set(state.dronePos.x + 200, 300, state.dronePos.z + 100);
  sunLight.target.position.copy(state.dronePos);
  sunLight.target.updateMatrixWorld();

  // Gimbal pitch in radians (0 = horizontal, negative = down, positive = up)
  const gimbalRad = state.gimbalPitch * Math.PI / 180;

  if (state.fpvMode) {
    // FPV camera position: at the drone's camera gimbal (Front-bottom)
    const camOffset = new THREE.Vector3(0, -0.25, 0.6);
    camOffset.applyAxisAngle(new THREE.Vector3(0, 1, 0), state.droneYaw);
    camera.position.copy(state.dronePos).add(camOffset);

    // Look direction: forward + gimbal pitch rotation
    // Base forward direction (horizontal)
    const forward = new THREE.Vector3(-Math.sin(state.droneYaw), 0, -Math.cos(state.droneYaw));
    // Rotate forward by gimbal pitch around the local right axis
    const rightAxis = new THREE.Vector3(Math.cos(state.droneYaw), 0, -Math.sin(state.droneYaw));
    const lookDir = forward.clone().applyAxisAngle(rightAxis, gimbalRad).normalize();
    camera.lookAt(camera.position.clone().add(lookDir.multiplyScalar(100)));

    // === GIMBAL FPV MODE (穿越模式) ===
    // 禁用相机倾斜,保持画面水平
    // 修复问题:之前 camera.rotation.z 会跟随 droneRoll 持续倾斜导致画面倒置
    // 现在强制设置为 0,让画面始终保持水平
    camera.rotation.z = 0;

    // === 镜头脱落晃动效果 ===
    if (state.cameraDetached && state.cameraWobbleDecay > 0.01) {
      const wx = Math.sin(state.cameraWobblePhase) * state.cameraWobbleDecay * state.cameraWobbleDir;
      const wy = -Math.abs(Math.sin(state.cameraWobblePhase * 0.7)) * state.cameraWobbleDecay * 0.5;
      camera.position.x += wx;
      camera.position.y += wy;
    }
  } else {
    // Third-person camera with offset based on drone yaw
    const offset = new THREE.Vector3(0, 8, 15).applyAxisAngle(new THREE.Vector3(0, 1, 0), state.droneYaw);
    const targetCamPos = state.dronePos.clone().add(offset);

    // During emergency stop, camera still follows but stays more stable to watch the tumble
    if (state.isEmergencyStop) {
      // Keep camera closer to see the tumbling drone better
      const emergencyOffset = new THREE.Vector3(0, 5, 12).applyAxisAngle(new THREE.Vector3(0, 1, 0), state.droneYaw);
      const emergencyCamPos = state.dronePos.clone().add(emergencyOffset);
      camera.position.lerp(emergencyCamPos, 0.08);
    } else if (gameStarted && state.lastTime > 0) {
      camera.position.lerp(targetCamPos, 0.05);
    } else {
      camera.position.copy(targetCamPos);
    }

    // In third-person, look at drone but apply gimbal pitch offset to look point
    const forward = new THREE.Vector3(-Math.sin(state.droneYaw), 0, -Math.cos(state.droneYaw));
    const rightAxis = new THREE.Vector3(Math.cos(state.droneYaw), 0, -Math.sin(state.droneYaw));
    const gimbalLookOffset = forward.clone().applyAxisAngle(rightAxis, gimbalRad).multiplyScalar(50);
    camera.lookAt(state.dronePos.clone().add(gimbalLookOffset));
  }
}

export function updateUI() {
  if (!state.gameStarted) return;
  const spd = state.droneVel.length();
  const alt = state.dronePos.y - getTerrainHeight(state.dronePos.x, state.dronePos.z);
  const dist = state.dronePos.distanceTo(state.homePos);
  const hdg = ((state.droneYaw * 180 / Math.PI) % 360 + 360) % 360;

  document.getElementById('teleAlt').textContent = alt.toFixed(1);
  document.getElementById('teleSpd').textContent = spd.toFixed(1);
  document.getElementById('teleDis').textContent = dist.toFixed(1);
  document.getElementById('teleDist').textContent = (state.totalDist / 1000).toFixed(2);
  document.getElementById('teleHdg').textContent = Math.round(hdg);

  document.getElementById('batteryFill').style.width = state.battery + '%';
  document.getElementById('batteryVal').textContent = Math.round(state.battery) + '%';
  const bf = document.getElementById('batteryFill');
  bf.classList.remove('low', 'mid');
  if (state.battery < 20) bf.classList.add('low');
  else if (state.battery < 50) bf.classList.add('mid');

  document.getElementById('flightMode').textContent = state.currentGear + '档';

  const signal = Math.max(1, Math.min(5, Math.round(5 - dist / 1000)));
  document.getElementById('signalVal').textContent = signal;
  const gps = Math.min(23, Math.round(12 + dist * 0.01));
  document.getElementById('gpsVal').textContent = gps;

  // Notification timer
  if (state.notifTimer > 0) {
    state.notifTimer -= 0.016;
    document.getElementById('notification').classList.add('show');
    if (state.notifTimer <= 0) document.getElementById('notification').classList.remove('show');
  }

  // Update gimbal pitch UI
  updateGimbalUI();
}

// Update gimbal pitch slider UI
export function updateGimbalUI() {
  const thumb = document.getElementById('gimbalThumb');
  const degreeEl = document.getElementById('gimbalDegree');
  const limitNotify = document.getElementById('gimbalLimitNotify');
  if (!thumb || !degreeEl) return;

  const spec = state.droneSpec;
  const pitch = state.gimbalPitch;
  const isUnlimited = spec.gimbalMin === -Infinity && spec.gimbalMax === Infinity;

  // Display angle: positive = up, negative = down
  // Show as: -90° (down) ... 0° (horizontal) ... +70° (up)
  const displayAngle = Math.round(pitch);
  degreeEl.textContent = (displayAngle > 0 ? '+' : '') + displayAngle + '°';

  // Slider position: map pitch to 0-1 range
  // Top of slider = max up, bottom = max down
  let normalizedPos;
  if (isUnlimited) {
    // Mini 4 Pro: wrap around, map -180 to +180 to 0-1
    let wrapped = ((pitch + 180) % 360 + 360) % 360 - 180;
    normalizedPos = 0.5 - (wrapped / 360); // 0.5 = horizontal, 1 = up, 0 = down
  } else {
    // Air 3 / Mavic 3 Pro: -90 to +30
    const range = spec.gimbalMax - spec.gimbalMin; // 120
    normalizedPos = (pitch - spec.gimbalMin) / range; // 0 = -90 (bottom), 1 = +30 (top)
  }

  // Clamp to slider bounds (0.06 to 0.94 to keep thumb visible)
  const clampedPos = Math.max(0.06, Math.min(0.94, normalizedPos));
  thumb.style.top = ((1 - clampedPos) * 100) + '%';

  // Check if at limit
  const atLimit = !isUnlimited && (pitch <= spec.gimbalMin || pitch >= spec.gimbalMax);
  thumb.classList.toggle('at-limit', atLimit);
  degreeEl.classList.toggle('at-limit', atLimit);
  if (limitNotify) {
    limitNotify.style.display = atLimit ? '' : 'none';
  }
}