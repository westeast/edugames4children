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

  skyMesh.position.copy(state.dronePos);
  sunLight.position.set(state.dronePos.x + 200, 300, state.dronePos.z + 100);
  sunLight.target.position.copy(state.dronePos);
  sunLight.target.updateMatrixWorld();

  if (state.fpvMode) {
    // FPV camera position: at the drone's camera gimbal (front-bottom)
    // Camera is at (0, -0.25, 0.5) in drone local coordinates
    const camOffset = new THREE.Vector3(0, -0.3, 0.6);
    camOffset.applyAxisAngle(new THREE.Vector3(0, 1, 0), state.droneYaw);
    camera.position.copy(state.dronePos).add(camOffset);
    // Look forward with slight pitch influence
    const lookDir = new THREE.Vector3(-Math.sin(state.droneYaw), -0.1 + state.dronePitch * 0.2, -Math.cos(state.droneYaw)).normalize();
    camera.lookAt(camera.position.clone().add(lookDir.multiplyScalar(100)));
  } else {
    const offset = new THREE.Vector3(0, 8, 15).applyAxisAngle(new THREE.Vector3(0, 1, 0), state.droneYaw);
    const targetCamPos = state.dronePos.clone().add(offset);
    // Use lerp after game started for smooth camera, snap immediately before
    if (gameStarted) {
      camera.position.lerp(targetCamPos, 0.05);
    } else {
      camera.position.copy(targetCamPos);
    }
    camera.lookAt(state.dronePos);
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
}