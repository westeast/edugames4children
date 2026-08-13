// Main entry point: init + game loop
import * as THREE from 'three';
import { renderer, camera } from './engine.js';
import { state, ROCKETS, PAYLOADS } from './config.js';
import { createRocketModel, rocketGroup } from './rocket-model.js';
import { initSolarSystem, animatePlanets } from './solar-system.js';
import { updateLaunchSequence, startLaunchSequence, createLaunchPad } from './launch-seq.js';
import { applyThrust, checkOrbitalVelocity, integrateRK4, updateCoordinates } from './physics.js';
import { setupControls } from './controls.js';
import { showNotif, updateCoordsDisplay, createPlanetSelector, createLaunchConfig, updatePhaseHUD } from './ui.js';
import { startReturnSequence, updateReturnSequence } from './re-entry.js';
import { createVoyager1, voyager1Group, signalRings } from './voyager1.js';
import { crewCapsule } from './spacecraft.js';

// Export for HTML onclick handlers
window.startReturnSequence = startReturnSequence;

let lastTime = 0;
let uiUpdateCounter = 0;

function gameLoop(time) {
  requestAnimationFrame(gameLoop);
  const dt = Math.min((time - lastTime) / 1000, 0.05);
  lastTime = time;

  if (state.gameStarted && !state.isPaused) {
    // Update launch sequence
    updateLaunchSequence(dt);

    // Update return sequence (crewed mode)
    updateReturnSequence(dt);

    // Animate planets (always visible in background)
    animatePlanets(dt);

    // During orbit/exploration phase: player controls probe
    if (state.gamePhase === 'explore' || state.gamePhase === 'orbit') {
      applyThrust(dt);
      integrateRK4(state.rocketPos, state.rocketVel, dt);
      updateCoordinates();
      checkOrbitalVelocity();

      // Animate Voyager 1 signal rings (if selected)
      if (state.selectedPayloadIdx === 2 && voyager1Group) {
        state.voyagerTime += dt;
        signalRings.forEach((ring, i) => {
          const phase = (state.voyagerTime * 0.5 + ring.delay) % 3;
          const scale = 1 + phase * 2;
          const opacity = Math.max(0, 0.6 - phase * 0.2);
          ring.mesh.scale.set(scale, scale, scale);
          ring.mesh.material.opacity = opacity;
        });
      }

      // Update camera to follow probe
      if (state.rocketPos) {
        const camTarget = state.rocketPos.clone().add(new THREE.Vector3(10, 8, 20));
        camera.position.lerp(camTarget, dt * 2);
        camera.lookAt(state.rocketPos);
      }

      // Update probe position in scene (if rocket group still exists)
      if (rocketGroup && state.gamePhase === 'explore') {
        rocketGroup.position.copy(state.rocketPos);
        rocketGroup.rotation.y = Math.atan2(
          state.rocketVel.x, state.rocketVel.z
        );
      }
    }

    // During ascent: camera follows rocket
    if ((state.gamePhase === 'ascend' || state.gamePhase === 'boosterSep') && rocketGroup) {
      const camTarget = new THREE.Vector3().copy(rocketGroup.position).add(new THREE.Vector3(0, 5, 15));
      camera.position.lerp(camTarget, dt * 3);
      camera.lookAt(rocketGroup.position);
    }

    // Menu phase: orbit camera around solar system
    if (state.gamePhase === 'menu') {
      const angle = Date.now() * 0.0001;
      const radius = 50;
      camera.position.set(Math.cos(angle) * radius, 30, Math.sin(angle) * radius);
      camera.lookAt(0, 0, 0);
    }

    // Explore phase: orbit camera around target planet
    if (state.gamePhase === 'explore' && state.targetPlanetPos) {
      const angle = Date.now() * 0.00015;
      const radius = 20;
      camera.position.set(
        state.targetPlanetPos.x + Math.cos(angle) * radius,
        state.targetPlanetPos.y + 8,
        state.targetPlanetPos.z + Math.sin(angle) * radius
      );
      camera.lookAt(state.targetPlanetPos);
    }

    // Landed phase: static camera at landing site
    if (state.gamePhase === 'landed') {
      const camTarget = new THREE.Vector3().copy(state.rocketPos || new THREE.Vector3(0, 0, 0)).add(new THREE.Vector3(15, 10, 25));
      camera.position.lerp(camTarget, dt * 2);
      camera.lookAt(state.rocketPos || new THREE.Vector3(0, 0, 0));
    }
  }

  // Periodic UI updates (throttled to avoid DOM thrashing)
  uiUpdateCounter += dt;
  if (uiUpdateCounter > 0.1) {
    updateCoordsDisplay();
    updatePhaseHUD();
    window._updatePhaseWithUI && window._updatePhaseWithUI();
    uiUpdateCounter = 0;
  }

  try {
    renderer.render(camera);
  } catch (e) {
    // Suppress Three.js internal traversal errors from scene.remove parent corruption
    if (!e.message || !e.message.includes('parent')) throw e;
  }
}

// === Initialize game on user click (ES module has implicit defer, but DOMContentLoaded may already have fired) ===
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', onReady);
} else {
  // Module loaded after DOM ready — fire immediately
  onReady();
}

function onReady() {
  const btn = document.getElementById('startBtn');
  if (btn) {
    btn.addEventListener('click', () => {
      document.getElementById('startScreen').style.display = 'none';
      startGame();
    });
  } else {
    // No button — auto-start anyway
    document.getElementById('loadingText').style.display = 'none';
    startGame();
  }
}

async function startGame() {
  document.getElementById('loadingText').style.display = 'none';
  document.getElementById('startScreen').style.display = 'none';

  // Build solar system scene
  initSolarSystem();

  // Create launch pad (ground + gantry)
  createLaunchPad();

  // Setup controls (keyboard + touch joystick)
  setupControls();

  // Auto-start: go to menu phase with rocket on display
  state.gameStarted = true;
  state.gamePhase = 'menu';

  // Create default rocket model for preview
  createRocketModel(ROCKETS[0].id);

  // Build UI panels
  createPlanetSelector();
  createLaunchConfig();

  // Show main UI elements
  ['topBar', 'leftPanel', 'rightPanel', 'bottomPanel'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = '';
  });

  // Joysticks only on mobile
  if (/Mobi|Android/i.test(navigator.userAgent)) {
    ['joystickLeft', 'joystickRight'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.display = '';
    });
  }

  // Start game loop
  lastTime = performance.now();
  requestAnimationFrame(gameLoop);
}
