// Main entry point: init + game loop
import { renderer, scene, camera } from './engine.js';
import { state } from './config.js';
import { updateTerrainChunks } from './terrain.js';
import { spawnBirds, spawnCars, spawnPeople, spawnClouds, updateBirds, updateCars, updatePeople, updateClouds } from './entities.js';
import { createDroneModel, droneGroup, propellers, propBlurs } from './drone-model.js';
import { updateDrone, emergencyStop, updateEmergencyStop } from './physics.js';
import { setupJoystick } from './controls.js';
import { updateCamera, updateUI, showNotif } from './ui.js';
import { updateRTHPath, isLanding } from './rth-path.js';

// Export emergency stop to global scope for HTML onclick
window.emergencyStop = emergencyStop;

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
      propBlurs.forEach((b, i) => {
        b.material.opacity = blurAmount * 0.5; // Show blur disk
        b.visible = !state.fpvMode;
      });
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