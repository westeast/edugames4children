// Main entry point: init + game loop
import * as THREE from 'three';
import { renderer, scene, camera } from './engine.js';
import { state } from './config.js';
import { updateTerrainChunks } from './terrain.js';
import { spawnBirds, spawnCars, spawnPeople, spawnClouds, updateBirds, updateCars, updatePeople, updateClouds } from './entities.js';
import { createDroneModel, droneGroup, propellers, propBlurs } from './drone-model.js';
import { updateDrone, emergencyStop, updateEmergencyStop } from './physics.js';
import { setupJoystick } from './controls.js';
import { updateCamera, updateUI, showNotif } from './ui.js';
import { updateRTHPath, isLanding, createHomeMarker, updateHomeMarker, getHomeMarker } from './rth-path.js';
import { getTerrainHeight } from './terrain.js';

// Export emergency stop to global scope for HTML onclick
window.emergencyStop = emergencyStop;

// Dragging state for home marker
let isDraggingHome = false;
let dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
let raycaster = new THREE.Raycaster();

let lastTime = 0;

function gameLoop(time) {
  requestAnimationFrame(gameLoop);
  const dt = Math.min((time - lastTime) / 1000, 0.05);
  lastTime = time;

  if (state.gameStarted && !state.isPaused) {
    // Handle emergency stop tumbling crash
    if (state.isEmergencyStop) {
      updateEmergencyStop(dt);
    } else {
      updateDrone(dt);
    }
    updateBirds(dt);
    updateCars(dt);
    updatePeople(dt);
    updateClouds(dt);
    updateTerrainChunks();
    
    // Update RTH path visualization
    if (state.isRTH) {
      updateRTHPath();
      
      // Show landing notification when close to home
      if (isLanding()) {
        showNotif('📍 自动降落中...', 2);
      }
    }
    
    if (droneGroup) {
      droneGroup.visible = !state.fpvMode;
      droneGroup.position.copy(state.dronePos);
      droneGroup.rotation.set(state.dronePitch, state.droneYaw, state.droneRoll);
      // Propeller visual: show blur disk at high speed, blades at low speed
      const blurAmount = Math.min(state.propSpeed / 40, 1); // 0-1 based on speed
      propellers.forEach((p, i) => {
        p.rotation.y += state.propSpeed * dt * (i % 2 === 0 ? 1 : -1);
        p.visible = blurAmount < 0.7; // Hide blades when spinning fast
      });
      // propBlurs: [disk0, ring0, disk1, ring1, ...] - 8 elements for 4 propellers
      for (let i = 0; i < 4; i++) {
        const disk = propBlurs[i * 2];
        const ring = propBlurs[i * 2 + 1];
        if (disk) {
          disk.material.opacity = blurAmount * 0.5;
          disk.visible = !state.fpvMode;
        }
        if (ring) {
          ring.visible = blurAmount >= 0.7 && !state.fpvMode;
        }
      }
    }
  }
  // Always update camera, but only lerp after game started
  updateCamera(state.gameStarted);
  updateUI();
  renderer.render(scene, camera);
}

function init() {
  document.getElementById('loadingText').style.display = 'none';
  document.getElementById('startScreen').style.display = 'none';

  // Auto-start game immediately
  ['topBar', 'leftPanel', 'rightPanel', 'bottomPanel', 'joystickLeft', 'joystickRight'].forEach(id => {
    document.getElementById(id).style.display = '';
  });
  state.gameStarted = true;
  createDroneModel(state.currentDroneIdx);
  spawnBirds(); spawnCars(); spawnPeople(); spawnClouds();
  updateTerrainChunks();
  
  // Force camera to correct position immediately to center the drone
  // Use setTimeout to ensure renderer has correct size after DOM is fully ready
  function forceCameraUpdate() {
    const w = window.innerWidth || 800;
    const h = window.innerHeight || 600;
    if (w > 0 && h > 0) {
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    }
    updateCamera(false);
  }
  
  // Immediate update
  forceCameraUpdate();
  
  // Delayed update to handle any async rendering
  setTimeout(forceCameraUpdate, 100);
  setTimeout(forceCameraUpdate, 500);
  
  // Listen for window resize to re-center camera and fix rendering issues
  window.addEventListener('game-resize', () => {
    updateCamera(false);
  });
  
  setupJoystick('baseL', 'thumbL', state.leftStick);
  setupJoystick('baseR', 'thumbR', state.rightStick);
  showNotif('🛫 起飞！祝飞行愉快', 5);

  // Create home marker (H) for return point
  createHomeMarker();

  // Setup home marker dragging
  setupHomeMarkerDrag();

  // Force landscape orientation hint on mobile
  if (/Mobi|Android/i.test(navigator.userAgent)) {
    const orientHint = document.createElement('div');
    orientHint.id = 'orientHint';
    orientHint.style.cssText = 'position:fixed;inset:0;background:#0a0a0f;z-index:500;display:none;align-items:center;justify-content:center;font-size:18px;color:#ff9500;text-align:center;flex-direction:column;gap:20px;';
    orientHint.innerHTML = '<div style="font-size:48px;">📱↔️</div><div>请横屏使用以获得最佳体验</div>';
    document.body.appendChild(orientHint);
    const checkOrient = () => {
      if (innerWidth < innerHeight && state.gameStarted) {
        orientHint.style.display = 'flex';
      } else {
        orientHint.style.display = 'none';
      }
    };
    window.addEventListener('resize', checkOrient);
    window.addEventListener('orientationchange', checkOrient);
  }



  lastTime = performance.now();
  requestAnimationFrame(gameLoop);
}

init();

// Setup home marker dragging functionality
function setupHomeMarkerDrag() {
  const canvas = renderer.domElement;

  // Mouse/touch events for dragging
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
}

function onPointerDown(event) {
  if (!state.gameStarted) return;

  const rect = renderer.domElement.getBoundingClientRect();
  const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  const y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

  raycaster.setFromCamera(new THREE.Vector2(x, y), camera);

  const homeMarker = getHomeMarker();
  if (homeMarker) {
    const intersects = raycaster.intersectObject(homeMarker, true);
    if (intersects.length > 0) {
      isDraggingHome = true;
      event.preventDefault();
      showNotif('拖动 H 标记设置返航点');
    }
  }
}

function onPointerMove(event) {
  if (!isDraggingHome) return;

  const rect = renderer.domElement.getBoundingClientRect();
  const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  const y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

  raycaster.setFromCamera(new THREE.Vector2(x, y), camera);

  // Intersect with horizontal plane at ground level
  const intersectPoint = new THREE.Vector3();
  const groundY = getTerrainHeight(state.homePos.x, state.homePos.z);
  dragPlane.setFromNormalAndCoplanarPoint(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, groundY, 0));
  raycaster.ray.intersectPlane(dragPlane, intersectPoint);

  if (intersectPoint && Number.isFinite(intersectPoint.x) && Number.isFinite(intersectPoint.z)) {
    state.homePos.x = intersectPoint.x;
    state.homePos.z = intersectPoint.z;
    updateHomeMarker();
  }
}

function onPointerUp(event) {
  if (isDraggingHome) {
    isDraggingHome = false;
    showNotif('✅ 返航点已更新');
    // Ensure marker is still visible
    updateHomeMarker();
  }
}