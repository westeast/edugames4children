// Input handling: keyboard, virtual joystick, mobile orientation
import { state, DRONES, GEAR_DESC, GEAR_MULT } from './config.js';
import { showNotif } from './ui.js';
import { createDroneModel } from './drone-model.js';

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
  let active = false, startX, startY;
  const onStart = e => {
    active = true;
    const t = e.touches ? e.touches[0] : e;
    const r = base.getBoundingClientRect();
    startX = r.left + r.width / 2; startY = r.top + r.height / 2;
    e.preventDefault();
  };
  const onMove = e => {
    if (!active) return;
    const t = e.touches ? e.touches[0] : e;
    const dx = t.clientX - startX, dy = t.clientY - startY;
    const maxR = 50, dist = Math.sqrt(dx * dx + dy * dy);
    const clampDist = Math.min(dist, maxR);
    const angle = Math.atan2(dy, dx);
    const nx = Math.cos(angle) * clampDist / maxR;
    const ny = Math.sin(angle) * clampDist / maxR;
    stickObj.x = nx; stickObj.y = -ny;
    thumb.style.transform = `translate(${-50 + nx * 50}%, ${-50 + ny * 50}%)`;
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
  document.querySelectorAll('.drone-card').forEach((c, i) => { c.classList.toggle('active', i === idx); });
  createDroneModel(idx);
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
  showNotif(state.fpvMode ? '👁️ FPV 第一人称' : '第三人称视角');
};

window.togglePause = function() {
  state.isPaused = !state.isPaused;
  document.getElementById('btnPause').classList.toggle('active', state.isPaused);
  showNotif(state.isPaused ? '⏸️ 已暂停' : '继续飞行');
};