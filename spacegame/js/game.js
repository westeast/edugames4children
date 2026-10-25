// Main entry point: init + game loop + state machine (mission/tour/free)
import * as THREE from 'three';
import { renderer, scene, camera } from './engine.js';
import { state, ROCKETS, PAYLOADS, MISSIONS, PLANETS } from './config.js';
import { createRocketModel, rocketGroup } from './rocket-model.js';
import { initSolarSystem, animatePlanets } from './solar-system.js';
import { updateLaunchSequence, startLaunchSequence, createLaunchPad } from './launch-seq.js';
import { applyThrust, checkOrbitalVelocity, integrateRK4, updateCoordinates } from './physics.js';
import { setupControls } from './controls.js';
import { showNotif, updateCoordsDisplay, createPlanetSelector, createLaunchConfig, updatePhaseHUD, renderSurveyPoints } from './ui.js';
import { startReturnSequence, updateReturnSequence } from './re-entry.js';
import { createVoyager1, voyager1Group, signalRings } from './voyager1.js';
import { crewCapsule } from './spacecraft.js';
import { startMission, checkMissionStep, collectSurveyPoint, travelToPlanet } from './mission.js';
import { showKnowledgeLibrary } from './knowledge.js';
import { startTour, updateTour, nextStop, previousStop, toggleTourPause, exitTour } from './tour.js';
import { initAudio, sfx } from './audio.js';

// Export for HTML onclick handlers
window.startReturnSequence = startReturnSequence;
window.startMission = startMission;

// === Start mission + launch sequence ===
window.startMissionFlow = (idx) => {
  document.getElementById('mainMenu').style.display = 'none';
  document.getElementById('missionSelect').style.display = 'none';
  document.getElementById('tourPanel').style.display = 'none';
  startMission(idx);
  startLaunchSequence();
};
window.startTour = startTour;
window.nextStop = nextStop;
window.previousStop = previousStop;
window.toggleTourPause = toggleTourPause;
window.exitTour = exitTour;
window.collectSurveyPoint = collectSurveyPoint;
window.showKnowledgeLibrary = showKnowledgeLibrary;

// === Auto travel: when mission step is travel and player escapes gravity, warp to next planet ===
function checkTravelAuto() {
  if (state.mode !== 'mission') return;
  if (state.missionComplete) return;
  const mission = MISSIONS[state.selectedMissionIdx];
  if (!mission) return;
  const step = mission.steps[state.missionStepIdx];
  if (!step || step.id !== 'travel') return;

  // Escape velocity check (real teaching threshold)
  const planet = PLANETS[state.targetPlanetIdx];
  if (!planet) return;
  const vEscape = Math.sqrt(2 * 6.674e-11 * 5.972e24 / (planet.radius * 1000)) / 1000; // m/s → km/s
  const speed = state.rocketVel.length() * 0.1; // game units → km/s

  if (speed >= vEscape) {
    // Find next planet in mission (or deep space for m5)
    const nextIdx = mission.targetPlanetIdx;
    travelToPlanet(nextIdx);
  }
}

// Debug hooks for Playwright tests
window.__gamePhase = () => state.gamePhase;
window.__orbitActive = () => state.orbitActive;
window.__altitude = () => state.altitude;
window.__travelToPlanet = travelToPlanet;
window.__missionStepIdx = () => state.missionStepIdx;
window.__mode = () => state.mode;
window.__speed = () => state.speed;
window.__vel = () => ({ x: state.rocketVel.x, y: state.rocketVel.y, z: state.rocketVel.z, len: state.rocketVel.length() });
window.__missionComplete = () => state.missionComplete;
window.__knowledgeUnlocked = () => state.knowledgeUnlocked;
window.__targetPlanetIdx = () => state.targetPlanetIdx;

// === Main menu navigation ===
window.showMainMenu = () => {
  document.getElementById('mainMenu').style.display = '';
  document.getElementById('missionSelect').style.display = 'none';
  document.getElementById('missionPanel').style.display = 'none';
  document.getElementById('tourPanel').style.display = 'none';
  state.mode = 'menu';
  state.gamePhase = 'menu';
};

window.showMissionSelect = () => {
  document.getElementById('mainMenu').style.display = 'none';
  document.getElementById('missionSelect').style.display = '';
  buildMissionList();
};

window.startFreeExplore = () => {
  state.mode = 'free';
  state.gamePhase = 'launchPad';
  document.getElementById('mainMenu').style.display = 'none';
  document.getElementById('missionPanel').style.display = 'none';
  document.getElementById('tourPanel').style.display = 'none';
  startLaunchSequence();
  showNotif('🛰️ 自由探索模式！选择目标行星，发射探测器！');
};

function buildMissionList() {
  const list = document.getElementById('missionList');
  if (!list) return;
  list.innerHTML = '';
  MISSIONS.forEach((m, i) => {
    const item = document.createElement('div');
    item.className = 'mission-item';
    item.innerHTML = `
      <div class="m-title">${i + 1}. ${m.title}</div>
      <div class="m-sub">${m.subtitle} · ${m.objective}</div>
      <div class="m-obj">${m.briefing}</div>
    `;
    item.onclick = () => {
      document.getElementById('missionSelect').style.display = 'none';
      window.startMissionFlow(i);
    };
    list.appendChild(item);
  });
}

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

    // Update tour
    updateTour(dt);

    // Animate planets (always visible in background)
    animatePlanets(dt);

    // During orbit/exploration phase: player controls probe
    if (state.gamePhase === 'explore' || state.gamePhase === 'orbit' || state.gamePhase === 'travel' || state.gamePhase === 'arrive') {
      window._keyThrust && window._keyThrust();
      applyThrust(dt);
      integrateRK4(state.rocketPos, state.rocketVel, dt);
      updateCoordinates();
      checkOrbitalVelocity();
      checkMissionStep();
      checkTravelAuto();

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
    renderSurveyPoints();
    window._updatePhaseWithUI && window._updatePhaseWithUI();
    uiUpdateCounter = 0;
  }

  try {
    renderer.render(scene, camera);
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
      initAudio();
      sfx.click();
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
  ['topBar', 'leftPanel', 'rightPanel', 'bottomPanel', 'mainMenu'].forEach(id => {
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
