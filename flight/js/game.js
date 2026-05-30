// Main entry point: init + game loop
import { renderer, scene, camera } from './engine.js';
import { state } from './config.js';
import { updateTerrainChunks } from './terrain.js';
import { spawnBirds, spawnCars, spawnPeople, spawnClouds, updateBirds, updateCars, updatePeople, updateClouds } from './entities.js';
import { createDroneModel, droneGroup, propellers } from './drone-model.js';
import { updateDrone } from './physics.js';
import { setupJoystick } from './controls.js';
import { updateCamera, updateUI, showNotif } from './ui.js';

let lastTime = 0;

function gameLoop(time) {
  requestAnimationFrame(gameLoop);
  const dt = Math.min((time - lastTime) / 1000, 0.05);
  lastTime = time;

  if (state.gameStarted && !state.isPaused) {
    updateDrone(dt);
    updateBirds(dt);
    updateCars(dt);
    updatePeople(dt);
    updateClouds(dt);
    updateTerrainChunks();
    if (droneGroup) {
      droneGroup.visible = !state.fpvMode;
      droneGroup.position.copy(state.dronePos);
      droneGroup.rotation.set(state.dronePitch, state.droneYaw, state.droneRoll);
      propellers.forEach((p, i) => { p.rotation.y += state.propSpeed * dt * (i % 2 === 0 ? 1 : -1); });
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
  ['topBar', 'leftPanel', 'rightPanel', 'bottomPanel', 'ctrlButtons', 'joystickLeft', 'joystickRight'].forEach(id => {
    document.getElementById(id).style.display = '';
  });
  state.gameStarted = true;
  createDroneModel(state.currentDroneIdx);
  spawnBirds(); spawnCars(); spawnPeople(); spawnClouds();
  updateTerrainChunks();
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