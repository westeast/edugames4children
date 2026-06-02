// Input handling: keyboard, virtual joystick, mobile orientation
import { state, DRONES, GEAR_DESC, GEAR_MULT } from './config.js';
import { showNotif, updateGimbalUI } from './ui.js';
import { createDroneModel } from './drone-model.js';

// Gimbal pitch control state
let gimbalDragging = false;
let gimbalStartY = 0;
let gimbalStartPitch = 0;

// Keyboard input
window.addEventListener('keydown', e => {
  state.keys[e.key] = true;
  if ([' ', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) e.preventDefault();
  if (e.key === 'v' || e.key === 'V') window.toggleFPV();
  if (e.key === 'h' || e.key === 'H') window.triggerRTH();
  if (e.key === 'p' || e.key === 'P') window.togglePause();
  if (e.key === 'c' || e.key === 'C') window.toggleCruise();
  if (e.key === 'o' || e.key === 'O') window.toggleObstacle();
  if (e.key === '1') window.selectDrone(0);
  if (e.key === '2') window.selectDrone(1);
  if (e.key === '3') window.selectDrone(2);
});
window.addEventListener('keyup', e => { state.keys[e.key] = false; });

// Virtual joystick setup
export function setupJoystick(baseId, thumbId, stickObj) {
  const base = document.getElementById(baseId), thumb = document.getElementById(thumbId);
  if (!base || !thumb) return;
  let active = false, startX, startY, maxR;
  const onStart = e => {
    active = true;
    const t = e.touches ? e.touches[0] : e;
    const r = base.getBoundingClientRect();
    startX = r.left + r.width / 2; startY = r.top + r.height / 2;
    maxR = r.width / 2 - 25; // Leave room for thumb radius
    e.preventDefault();
  };
  const onMove = e => {
    if (!active) return;
    const t = e.touches ? e.touches[0] : e;
    const dx = t.clientX - startX, dy = t.clientY - startY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const clampDist = Math.min(dist, maxR);
    const angle = Math.atan2(dy, dx);
    const px = Math.cos(angle) * clampDist;
    const py = Math.sin(angle) * clampDist;
    stickObj.x = px / maxR; stickObj.y = -py / maxR;
    // Use pixel offsets from center; CSS top:50%;left:50% centers thumb, px/py move it
    thumb.style.transform = `translate(calc(-50% + ${px}px), calc(-50% + ${py}px))`;
    e.preventDefault();
  };
  const onEnd = () => { active = false; stickObj.x = 0; stickObj.y = 0; thumb.style.transform = 'translate(-50%, -50%)'; };
  base.addEventListener('touchstart', onStart); base.addEventListener('mousedown', onStart);
  window.addEventListener('touchmove', onMove); window.addEventListener('mousemove', onMove);
  window.addEventListener('touchend', onEnd); window.addEventListener('mouseup', onEnd);
}

// Global control functions (called from HTML onclick handlers)
window.selectDrone = function(idx) {
  state.currentDroneIdx = idx; state.droneSpec = DRONES[idx];
  // Reset gimbal pitch to 0 and clamp to new drone limits
  state.gimbalPitch = Math.max(DRONES[idx].gimbalMin === -Infinity ? -90 : DRONES[idx].gimbalMin,
                               Math.min(DRONES[idx].gimbalMax === Infinity ? 30 : DRONES[idx].gimbalMax, 0));
  document.querySelectorAll('.drone-card').forEach((c, i) => { c.classList.toggle('active', i === idx); });
  createDroneModel(idx);
  updateGimbalUI();
  showNotif('切换机型: ' + state.droneSpec.name);
};

window.setGear = function(gear) {
  state.currentGear = gear;
  ['C', 'N', 'S'].forEach(g => { document.getElementById('gear' + g).classList.toggle('active', g === gear); });
  document.getElementById('gearDesc').textContent = GEAR_DESC[gear];
  document.getElementById('flightMode').textContent = gear + '档';
  showNotif('切换至 ' + GEAR_DESC[gear]);
};

window.toggleCruise = function() {
  state.isCruise = !state.isCruise;
  document.getElementById('btnCruise').classList.toggle('active', state.isCruise);
  showNotif(state.isCruise ? '🚀 巡航模式已开启' : '巡航模式已关闭');
};

window.triggerRTH = function() {
  if (state.isRTH) { state.isRTH = false; showNotif('返航已取消'); return; }
  state.isRTH = true; state.isCruise = false;
  document.getElementById('btnRTH').classList.add('active');
  document.getElementById('btnCruise').classList.remove('active');
  showNotif('🏠 返航中...');
  setTimeout(() => { if (state.isRTH) document.getElementById('btnRTH').classList.remove('active'); }, 3000);
};

window.toggleObstacle = function() {
  state.obstacleEnabled = !state.obstacleEnabled;
  document.getElementById('btnOBS').classList.toggle('active', state.obstacleEnabled);
  showNotif(state.obstacleEnabled ? '🛡️ 避障已开启' : '避障已关闭');
};

window.toggleFPV = function() {
  state.fpvMode = !state.fpvMode;
  document.getElementById('btnFPV').classList.toggle('active', state.fpvMode);
  // Show/hide crosshair in FPV mode
  const crosshair = document.getElementById('crosshair');
  if (crosshair) {
    crosshair.style.display = state.fpvMode ? '' : 'none';
  }
  showNotif(state.fpvMode ? '👁️ FPV 第一人称' : '第三人称视角');
};

window.togglePause = function() {
  state.isPaused = !state.isPaused;
  document.getElementById('btnPause').classList.toggle('active', state.isPaused);
  showNotif(state.isPaused ? '⏸️ 已暂停' : '继续飞行');
};

// Gimbal pitch slider setup
export function setupGimbalControl() {
  const slider = document.getElementById('gimbalSlider');
  const thumb = document.getElementById('gimbalThumb');
  if (!slider || !thumb) return;

  const isUnlimited = () => state.droneSpec.gimbalMin === -Infinity;

  const onStart = (e) => {
    gimbalDragging = true;
    const t = e.touches ? e.touches[0] : e;
    gimbalStartY = t.clientY;
    gimbalStartPitch = state.gimbalPitch;
    thumb.classList.add('dragging');
    e.preventDefault();
  };

  const onMove = (e) => {
    if (!gimbalDragging) return;
    const t = e.touches ? e.touches[0] : e;
    const dy = gimbalStartY - t.clientY; // positive = dragged up = more pitch up
    const sliderRect = slider.getBoundingClientRect();
    const sliderH = sliderRect.height;
    // Map pixel drag to degrees: full slider height = range of motion
    const degreesPerPixel = 160 / sliderH; // 160° range mapped to slider
    let newPitch = gimbalStartPitch + dy * degreesPerPixel;

    if (isUnlimited()) {
      // Mini 4 Pro: unlimited, wrap around
      newPitch = ((newPitch + 180) % 360 + 360) % 360 - 180;
    } else {
      // Clamp to drone limits
      const prevPitch = state.gimbalPitch;
      newPitch = Math.max(state.droneSpec.gimbalMin, Math.min(state.droneSpec.gimbalMax, newPitch));
      // Show notification if hitting limit
      if (newPitch <= state.droneSpec.gimbalMin && prevPitch > state.droneSpec.gimbalMin) {
        showNotif('⚠️ 已达到最大俯仰度');
      } else if (newPitch >= state.droneSpec.gimbalMax && prevPitch < state.droneSpec.gimbalMax) {
        showNotif('⚠️ 已达到最大俯仰度');
      }
    }
    state.gimbalPitch = newPitch;
    updateGimbalUI();
    e.preventDefault();
  };

  const onEnd = () => {
    if (!gimbalDragging) return;
    gimbalDragging = false;
    thumb.classList.remove('dragging');
  };

  // Mouse/touch events on slider
  slider.addEventListener('mousedown', onStart);
  slider.addEventListener('touchstart', onStart);
  window.addEventListener('mousemove', onMove);
  window.addEventListener('touchmove', onMove);
  window.addEventListener('mouseup', onEnd);
  window.addEventListener('touchend', onEnd);

  // Scroll wheel on gimbal panel
  const gimbalPanel = document.getElementById('gimbalPanel');
  if (gimbalPanel) {
    gimbalPanel.addEventListener('wheel', (e) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -3 : 3; // scroll up = pitch up, scroll down = pitch down
      let newPitch = state.gimbalPitch + delta;

      if (isUnlimited()) {
        newPitch = ((newPitch + 180) % 360 + 360) % 360 - 180;
      } else {
        const prevPitch = state.gimbalPitch;
        newPitch = Math.max(state.droneSpec.gimbalMin, Math.min(state.droneSpec.gimbalMax, newPitch));
        if ((newPitch <= state.droneSpec.gimbalMin && prevPitch > state.droneSpec.gimbalMin) ||
            (newPitch >= state.droneSpec.gimbalMax && prevPitch < state.droneSpec.gimbalMax)) {
          showNotif('⚠️ 已达到最大俯仰度');
        }
      }
      state.gimbalPitch = newPitch;
      updateGimbalUI();
    }, { passive: false });
  }
}