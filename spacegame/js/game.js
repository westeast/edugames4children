// 入口：状态机 + 主循环（探索 / 任务 / 导览）
import * as THREE from 'three';
import { renderer, scene, camera, applySpaceColor, setStarsVisible } from './engine.js';
import { state, MISSIONS, SCALES } from './config.js';
import { initCelestial, animateCelestial, setOrbitsVisible, setSatellitesVisible, celestial } from './celestial.js';
import { initCameraRig, updateCameraRig, flyTo, setScale, zoom, resetView, stepScale } from './camera-rig.js';
import {
  bindUI, refreshAll, renderInfoPanel, updateLabels, updateScaleRail,
  toast, hideLoading, showError, openSettings, closeSettings,
  renderMissionCard, hideMissionCard, hideTourCard,
} from './ui.js';
import { startMission, missionGo, answerQuiz, updateMissionArrival } from './mission.js';
import { startTour, updateTour, tourNext, tourPrev, tourToggle, exitTour } from './tour.js';
import { initAudio, sfx } from './audio.js';

let last = 0, elapsed = 0, labelTick = 0;

function loop(time) {
  requestAnimationFrame(loop);
  const dt = Math.min((time - last) / 1000, 0.05);
  last = time;

  if (!state.paused) {
    elapsed += dt;
    animateCelestial(dt, elapsed);
    updateCameraRig(dt);
    updateTour(dt);
    if (state.mode === 'mission') updateMissionArrival(camera.position);
  }

  labelTick += dt;
  if (labelTick > 0.05) { updateLabels(); labelTick = 0; }

  renderer.render(scene, camera);
}

function boot() {
  try {
    initAudio();
    initCelestial();
    initCameraRig();
    bindUI();
    wireGlobals();

    state.ready = true;
    state.mode = 'explore';
    state.scale = 'earth';
    setScale('earth');
    flyTo('earth');
    renderInfoPanel('earth');
    renderScaleRailUI();
    refreshAll();
    buildTimeline();
    hideLoading();

    last = performance.now();
    requestAnimationFrame(loop);
  } catch (err) {
    console.error(err);
    showError(err && err.message ? err.message : String(err));
  }
}

function renderScaleRailUI() {
  const rail = document.getElementById('scale-rail');
  if (!rail) return;
  rail.innerHTML = '';
  [...SCALES].forEach(s => {
    const b = document.createElement('button');
    b.className = 'rail-item' + (state.scale === s.id ? ' active' : '');
    b.dataset.scale = s.id;
    b.innerHTML = `<i></i><span>${s.label}</span>`;
    b.onclick = () => { setScale(s.id); sfx.click(); refreshAll(); };
    rail.appendChild(b);
  });
}

// 底部「探索尺度」横条（ORBIT 顶部导航的近地轨道/太阳系/银河系/星系图鉴）
function buildTimeline() {
  document.querySelectorAll('.scale-nav button').forEach(b => {
    b.onclick = () => {
      setScale(b.dataset.scale);
      sfx.click();
      const def = SCALES[0];
      refreshAll();
      b.blur();
    };
  });
}

function wireGlobals() {
  window.__setMode = m => {
    state.mode = m;
    if (m === 'explore') {
      state.tourPlaying = false;
      hideMissionCard();
      hideTourCard();
    }
    refreshAll();
  };
  window.__openMissionSelect = () => {
    const idx = state.unlocked.length < MISSIONS.length && state.mode !== 'mission' ? state.unlocked.length : 0;
    startMission(Math.min(idx, MISSIONS.length - 1));
  };
  window.__startTour = () => startTour();
  window.__missionGo = missionGo;
  window.__answerQuiz = answerQuiz;
  window.__tourNext = tourNext;
  window.__tourPrev = tourPrev;
  window.__tourToggle = tourToggle;
  window.__exitTour = exitTour;
  window.__zoom = f => zoom(f);
  window.__resetView = resetView;
  window.__stepScale = d => stepScale(d);
  window.__celestialGet = id => celestial[id];
  window.__toggleLayer = name => {
    state.layers[name] = !state.layers[name];
    if (name === 'orbits') setOrbitsVisible(state.layers.orbits);
    if (name === 'satellites') setSatellitesVisible(state.layers.satellites);
    refreshAll();
    const b = document.getElementById(name === 'orbits' ? 'toggle-orbits' : name === 'labels' ? 'toggle-labels' : 'toggle-sat');
    if (b) b.classList.toggle('active', state.layers[name]);
  };
  window.__setSpaceColor = c => { state.spaceColor = c; applySpaceColor(); };
  window.__setStars = v => { state.stars = v; setStarsVisible(v); };
  window.__selectBody = id => { flyTo(id); renderInfoPanel(id); };

  // 键盘：空格暂停、H 回地球、F 全屏
  document.addEventListener('keydown', e => {
    if (e.key === ' ') { state.paused = !state.paused; toast(state.paused ? '⏸ 已暂停' : '▶ 继续'); }
    if (e.key === 'h' || e.key === 'H') { resetView(); renderInfoPanel('earth'); }
    if (e.key === 'f' || e.key === 'F') toggleFullscreen();
    if (e.key === '+' || e.key === '=') zoom(-0.3);
    if (e.key === '-' || e.key === '_') zoom(0.3);
    if (e.key === 'Escape') { closeSettings(); }
  });

  window.__toggleFullscreen = toggleFullscreen;
}

function toggleFullscreen() {
  if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => {});
  else document.exitFullscreen();
}
window.toggleFullscreen = toggleFullscreen;

// 调试钩子（Playwright 用，不截图）
window.__gamePhase = () => state.mode;
window.__scale = () => state.scale;
window.__selected = () => state.selectedId;
window.__mode = () => state.mode;
window.__missionStage = () => state.missionStage;
window.__missionIdx = () => state.missionIdx;
window.__unlocked = () => state.unlocked;
window.__tourIdx = () => state.tourIdx;
window.__tourPlaying = () => state.tourPlaying;

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}
