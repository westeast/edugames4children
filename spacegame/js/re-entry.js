// Return sequence state machine for crewed missions
import * as THREE from 'three';
import { scene } from './engine.js';
import { state } from './config.js';
import { showNotif } from './ui.js';
import { createPlasmaTrail, deployParachutes, detachServiceModule, detachOrbitalModule, crewCapsule, plasmaTrail, retroFlames } from './spacecraft.js';

let reentryTime = 0;

// === Start return sequence (crewed mode only) ===
export function startReturnSequence() {
  if (!state.isCrewed) {
    showNotif('⚠️ 仅载人模式可返回');
    return;
  }

  state.reentryPhase = 'serviceSep';
  reentryTime = 0;
  state.serviceDetached = false;
  state.orbitalDetached = false;

  // Rotate capsule to face Earth (head first)
  if (crewCapsule) {
    crewCapsule.rotation.x = Math.PI / 2; // Point forward into atmosphere
  }

  showNotif('🔄 开始返回地球...');
}

// === Update return sequence each frame ===
export function updateReturnSequence(dt) {
  if (!state.reentryPhase || state.gamePhase !== 'explore') return;

  reentryTime += dt;

  switch (state.reentryPhase) {
    case 'serviceSep': {
      showNotif('🔥 推进舱制动点火...');
      if (!state.serviceDetached && reentryTime > 3) {
        detachServiceModule();
        state.serviceDetached = true;
        state.reentryPhase = 'orbitalSep';
        reentryTime = 0;
      }
      break;
    }

    case 'orbitalSep': {
      showNotif('🔧 轨道舱分离...');
      if (!state.orbitalDetached && reentryTime > 2) {
        detachOrbitalModule();
        state.orbitalDetached = true;
        state.reentryPhase = 'reentry';
        reentryTime = 0;
        createPlasmaTrail();
      }
      break;
    }

    case 'reentry': {
      showNotif('🔥 再入大气层！');
      if (crewCapsule && plasmaTrail) {
        plasmaTrail.position.copy(crewCapsule.position);
        plasmaTrail.rotation.copy(crewCapsule.rotation);
      }
      const entrySpeed = 7800;
      const currentSpeed = Math.max(entrySpeed * 0.3, entrySpeed - dt * 500);
      if (currentSpeed < 1000 && reentryTime > 5) {
        state.reentryPhase = 'blackout';
        reentryTime = 0;
      }
      break;
    }

    case 'blackout': {
      showNotif('📡 进入黑障区！通信中断...');
      if (crewCapsule && plasmaTrail) {
        plasmaTrail.position.copy(crewCapsule.position);
        plasmaTrail.rotation.copy(crewCapsule.rotation);
      }
      if (reentryTime > 4) {
        state.reentryPhase = 'drogue';
        reentryTime = 0;
        showNotif('📡 黑障区结束，恢复通信...');
      }
      break;
    }

    case 'drogue': {
      showNotif('🪂 释放引导伞...');
      if (reentryTime > 2) {
        state.reentryPhase = 'mainChute';
        reentryTime = 0;
        deployParachutes();
      }
      break;
    }

    case 'mainChute': {
      showNotif('🪂 主伞展开（3个，总面积约1200m²）...');
      if (crewCapsule) {
        state.rocketVel.y += dt * -5; // Slow descent
      }
      if (reentryTime > 3 && crewCapsule && crewCapsule.position.y < 2) {
        state.reentryPhase = 'retro';
        reentryTime = 0;
      }
      break;
    }

    case 'retro': {
      showNotif('💥 着陆反推发动机点火！');
      if (retroFlames) {
        retroFlames.forEach(f => {
          f.material.opacity = 0.8;
          f.visible = true;
          f.scale.set(1 + Math.sin(Date.now() * 0.02) * 0.2, 1, 1 + Math.sin(Date.now() * 0.02) * 0.2);
        });
      }
      if (reentryTime > 1.5) {
        state.reentryPhase = 'landed';
        reentryTime = 0;
      }
      break;
    }

    case 'landed': {
      showNotif('✅ 着陆成功！欢迎返回地球！');
      if (crewCapsule) {
        crewCapsule.position.y = Math.max(0, crewCapsule.position.y - dt * 10);
      }
      state.gamePhase = 'landed';
      break;
    }
  }
}
