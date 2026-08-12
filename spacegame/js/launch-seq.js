// Launch sequence state machine: menu → assemble → launchPad → ignite → ascend → boosterSep → orbit
import * as THREE from 'three';
import { scene } from './engine.js';
import { state, ROCKETS } from './config.js';
import { createRocketModel, setEnginesLit, rocketGroup, escapeTower } from './rocket-model.js';
import { showNotif } from './ui.js';

// Launch sequence timing (seconds)
const ASSEMBLE_TIME = 2;
const LAUNCH_PAD_TIME = 3; // Wait for user to confirm ignition
const IGNITE_DELAY = 1.5; // Countdown before liftoff
const ASCEND_TO_BOOSTER_SEP = 8; // Time from lift-off to booster separation

let sequenceTime = 0;
let countdownValue = 3;
let enginesStarted = false;
let boostersDetached = false;
let stage2Ignited = false;

// === Create launch pad platform (ground) ===
export function createLaunchPad() {
  const padGeo = new THREE.CylinderGeometry(8, 10, 1, 32);
  const padMat = new THREE.MeshStandardMaterial({ color: 0x444455 });
  const pad = new THREE.Mesh(padGeo, padMat);
  pad.position.y = -0.5;
  scene.add(pad);

  // Support tower (launch gantry)
  const towerGeo = new THREE.BoxGeometry(1, 30, 1);
  const towerMat = new THREE.MeshStandardMaterial({ color: 0x666677 });
  const tower = new THREE.Mesh(towerGeo, towerMat);
  tower.position.set(8, 14.5, 0);
  scene.add(tower);

  // Tower arm (connects to rocket)
  const armGeo = new THREE.BoxGeometry(6, 0.5, 0.5);
  const arm = new THREE.Mesh(armGeo, towerMat);
  arm.position.set(5, 28, 0);
  scene.add(arm);
}

// === Start the launch sequence ===
export function startLaunchSequence() {
  state.gamePhase = 'assemble';
  sequenceTime = 0;
  countdownValue = 3;
  enginesStarted = false;
  boostersDetached = false;
  stage2Ignited = false;

  // Position rocket on launch pad
  if (rocketGroup) {
    rocketGroup.position.set(0, 0, 0);
    rocketGroup.rotation.set(0, 0, 0);
  }

  showNotif('🔧 开始组装火箭...');
}

// === Update launch sequence each frame ===
export function updateLaunchSequence(dt) {
  if (!rocketGroup || state.gamePhase === 'menu' || state.gamePhase === 'explore') return;

  sequenceTime += dt;

  switch (state.gamePhase) {
    case 'assemble':
      // Quick assembly animation: rocket rises from ground and aligns
      const assembleProgress = Math.min(sequenceTime / ASSEMBLE_TIME, 1);
      if (rocketGroup) {
        rocketGroup.position.y = THREE.MathUtils.lerp(-20, 0, assembleProgress);
        rocketGroup.rotation.x = THREE.MathUtils.lerp(0.1, 0, assembleProgress);
      }

      if (assembleProgress >= 1) {
        state.gamePhase = 'launchPad';
        sequenceTime = 0;
        showNotif('🚀 火箭已就位，准备点火！');
        // Show ignition button in UI
        const btn = document.getElementById('igniteBtn');
        if (btn) btn.style.display = '';
      }
      break;

    case 'launchPad':
      // Wait at launch pad, countdown starts when user clicks ignite
      if (!enginesStarted && state._igniting) {
        enginesStarted = true;
        state.gamePhase = 'ignite';
        sequenceTime = 0;
        countdownValue = 3;

        // Hide ignition button
        const btn = document.getElementById('igniteBtn');
        if (btn) btn.style.display = 'none';

        showNotif('🔥 倒计时: 3...');
      }
      break;

    case 'ignite':
      // Countdown and engine ignition
      sequenceTime += dt;
      const newCountdown = Math.ceil(3 - sequenceTime);

      if (newCountdown !== countdownValue && newCountdown > 0) {
        countdownValue = newCountdown;
        showNotif(`🔥 倒计时: ${countdownValue}...`);
      } else if (newCountdown <= 0 && !state._liftOff) {
        state._liftOff = true;
        showNotif('🚀 GO! 点火升空！');

        // Light engines with flame effect
        setEnginesLit(true);

        // Camera shake effect (vibration during ascent)
        if (rocketGroup) {
          rocketGroup.userData.shakeIntensity = 0.5;
        }
      }

      if (sequenceTime > IGNITE_DELAY + 1) {
        state.gamePhase = 'ascend';
        sequenceTime = 0;
      }
      break;

    case 'ascend':
      // Rocket ascending through atmosphere
      sequenceTime += dt;

      // Move rocket upward with acceleration (gravity simulation)
      const gravity = -9.8 * dt * 0.1; // Scaled for gameplay
      state.rocketVel.y += gravity;

      if (rocketGroup) {
        // Apply slight tilt (gravity turn toward east)
        state.rocketYaw += dt * 0.3;
        rocketGroup.rotation.y = state.rocketYaw;

        // Move upward
        const forward = new THREE.Vector3(0, 1, 0).applyQuaternion(
          new THREE.Quaternion().setFromEuler(new THREE.Euler(0, state.rocketYaw, 0))
        );
        rocketGroup.position.addScaledVector(forward, dt * 20); // Ascend speed

        // Camera shake (decreasing as we go higher)
        if (rocketGroup.userData.shakeIntensity) {
          const shake = rocketGroup.userData.shakeIntensity / (1 + sequenceTime);
          rocketGroup.position.x += (Math.random() - 0.5) * shake;
          rocketGroup.position.z += (Math.random() - 0.5) * shake;
        }

        // Engine flame flicker
        const flicker = 0.7 + Math.sin(sequenceTime * 30) * 0.15 + Math.sin(sequenceTime * 47) * 0.1;
        engineFlames.forEach(f => {
          if (f.material && f.material.opacity !== undefined) {
            f.material.opacity = flicker;
          }
        });
      }

      // Update coordinates during ascent
      state.altitude = Math.max(0, rocketGroup ? rocketGroup.position.y : 0);

      // Notification at altitude milestones
      const altKm = state.altitude;
      if (altKm > 1 && altKm < 2) showNotif('🌍 穿越对流层...');
      if (altKm > 5 && altKm < 6) showNotif('☁️ 进入平流层...');

      // Booster separation at altitude threshold
      const boosterSepAlt = 10; // km (game units)
      if (state.altitude >= boosterSepAlt && !boostersDetached) {
        detachBoosters();
        boostersDetached = true;

        // Second stage ignition
        state.gamePhase = 'boosterSep';
        sequenceTime = 0;
        showNotif('💥 助推器分离！第二级点火！');
      }

      break;

    case 'boosterSep':
      sequenceTime += dt;

      // Second stage engine ignition (different flame color)
      if (!stage2Ignited && sequenceTime > 0.5) {
        setEnginesLit(true);
        stage2Ignited = true;
        showNotif('🔥 第二级发动机点火！');
      }

      // Continue ascending to orbit
      if (rocketGroup) {
        const forward = new THREE.Vector3(0, 1, 0).applyQuaternion(
          new THREE.Quaternion().setFromEuler(new THREE.Euler(0, state.rocketYaw, 0))
        );
        rocketGroup.position.addScaledVector(forward, dt * 40); // Faster ascent

        // Slow down rotation for orbit alignment
        state.rocketPitch = THREE.MathUtils.lerp(state.rocketPitch, -0.2, dt * 2);
      }

      if (sequenceTime > 3) {
        state.gamePhase = 'orbit';
        sequenceTime = 0;
        showNotif('🛰️ 进入轨道！现在可以控制探测器了！');

        // Switch to orbit control mode
        state.orbitActive = true;
        state.rocketPos.copy(rocketGroup.position);
      }
      break;
  }

  // Update camera to follow rocket during launch
  if (rocketGroup && state.gamePhase !== 'menu' && state.gamePhase !== 'explore') {
    const camTarget = new THREE.Vector3().copy(rocketGroup.position).add(new THREE.Vector3(0, 5, 15));
    camera.position.lerp(camTarget, dt * 3);
    camera.lookAt(rocketGroup.position);
  }
}

// === Detach boosters (animated separation) ===
import { engineFlames, boosterGroups } from './rocket-model.js';

export function detachBoosters() {
  if (!rocketGroup) return;

  // For CZ-5: 4 boosters fly outward
  for (const bg of boosterGroups) {
    if (!bg.active) continue;
    bg.active = false;

    const bMesh = bg.mesh;

    // Create detached booster as independent object with cloned geometry/material
    const detGeo = bMesh.geometry.clone();
    const detMat = new THREE.MeshStandardMaterial({
      color: 0xdd8833, metalness: 0.4, transparent: true, opacity: 0.7
    });
    const detBooster = new THREE.Mesh(detGeo, detMat);
    detBooster.position.set(rocketGroup.position.x + bg.offsetX, rocketGroup.position.y - 15, rocketGroup.position.z + bg.offsetZ);

    // Add small flame for separation burn
    const sepFlameGeo = new THREE.ConeGeometry(0.2, 0.5, 8);
    const sepFlameMat = new THREE.MeshBasicMaterial({ color: 0xff6633, transparent: true, opacity: 0.5 });
    const sepFlame = new THREE.Mesh(sepFlameGeo, sepFlameMat);
    sepFlame.position.set(detBooster.position.x, detBooster.position.y - 1.7, detBooster.position.z);

    scene.add(detBooster);
    scene.add(sepFlame);

    // Animate falling away (will be cleaned up by game loop)
    detBooster.userData = { vx: bg.offsetX * 0.5, vz: bg.offsetZ * 0.5, vy: -2, life: 10 };
    scene.userData.detachedBoosters = scene.userData.detachedBoosters || [];
    scene.userData.detachedBoosters.push(detBooster);

    // Hide original booster in rocket group (don't remove — keeps parent intact)
    bMesh.visible = false;
  }

  // For Falcon series: boosters are part of the main model, just hide them
  if (state.selectedRocketIdx === 3 || state.selectedRocketIdx === 4) {
    // CZ-5 or CZ-2C style boosters — already handled above
  } else {
    // Falcon-style: set booster flag in rocket group
    if (rocketGroup.userData) rocketGroup.userData.boostersDetached = true;
  }
}
