// Input handling: keyboard, virtual joystick, mobile orientation
import { state, DRONES, GEAR_DESC, GEAR_MULT, MANUAL_TURN_MULT } from './config.js';
import { showNotif, updateGimbalUI } from './ui.js';
import { createDroneModel, toggleZoom, toggleLid, toggleModuleBay, zoomLevel } from './drone-model.js';
import { isManualMode, showManualModePrompt, updateGearButtonsUI } from './manual-mode.js';
import { openWaypointPlanner, closeWaypointPlanner, stopWaypointFlight, isWaypointActive, handleMapClick, setWaypointSpeed, clearWaypoints, startWaypointFlight, confirmWaypointFlight, cancelWaypointConfirm } from './waypoint.js';
import { setPanoMode, resetPano, isPanoActive } from './panorama.js';

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
  if (e.key === '4') window.selectDrone(3);
  if (e.key === '5') window.selectDrone(4);
  if (e.key === '6') window.selectDrone(5);
  if (e.key === '7') window.selectDrone(6);
  if (e.key === 'z' || e.key === 'Z') { toggleZoom(); showNotif('🔍 变焦 ' + (zoomLevel === 0 ? '1x' : zoomLevel === 1 ? '2x' : '4x')); }
  if (e.key === 'l' || e.key === 'L') { toggleLid(); }
  if (e.key === 'b' || e.key === 'B') { toggleModuleBay(); }
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
let pendingDroneIdx = null;

window.selectDrone = function(idx) {
  // 切换到全景无人机需二次确认
  if (DRONES[idx].panoramic && idx !== state.currentDroneIdx) {
    pendingDroneIdx = idx;
    const modal = document.getElementById('avataPromptModal');
    if (modal) { modal.style.display = 'flex'; return; }
  }
  // 切换到 Neo 2 跟拍机需二次确认（仅确定按钮）
  if (DRONES[idx].followCam && idx !== state.currentDroneIdx) {
    pendingDroneIdx = idx;
    const modal = document.getElementById('neo2ConfirmModal');
    if (modal) { modal.style.display = 'flex'; return; }
  }
  applyDroneSelection(idx);
};

window.confirmAvataPrompt = function() {
  const modal = document.getElementById('avataPromptModal');
  if (modal) modal.style.display = 'none';
  if (pendingDroneIdx !== null) { applyDroneSelection(pendingDroneIdx); pendingDroneIdx = null; }
};

window.closeAvataPrompt = function() {
  const modal = document.getElementById('avataPromptModal');
  if (modal) modal.style.display = 'none';
  pendingDroneIdx = null;
};

// === Neo 2 跟拍机确认（仅确定切换按钮） ===
window.confirmNeo2 = function() {
  const modal = document.getElementById('neo2ConfirmModal');
  if (modal) modal.style.display = 'none';
  if (pendingDroneIdx !== null) {
    applyDroneSelection(pendingDroneIdx);
    pendingDroneIdx = null;
    // 确认后弹白屏双操控选择
    const chooser = document.getElementById('neo2ControlChooser');
    if (chooser) {
      document.querySelectorAll('.neo2-control-option').forEach((o, i) => o.classList.toggle('active', i === 0));
      chooser.style.display = 'flex';
    }
  }
};

window.cancelNeo2 = function() {
  const modal = document.getElementById('neo2ConfirmModal');
  if (modal) modal.style.display = 'none';
  pendingDroneIdx = null;
};

function applyDroneSelection(idx) {
  state.currentDroneIdx = idx; state.droneSpec = DRONES[idx];
  // Reset gimbal pitch to 0 and clamp to new drone limits
  state.gimbalPitch = Math.max(DRONES[idx].gimbalMin === -Infinity ? -90 : DRONES[idx].gimbalMin,
                               Math.min(DRONES[idx].gimbalMax === Infinity ? 30 : DRONES[idx].gimbalMax, 0));
  // 横滚 / 大风 / 手机操控 状态复位
  state.gimbalRoll = 0;
  state.windSwept = false; state.windCrash = false;
  state.neo2Control = 'rc';
  closePhoneControl(true);
  // 仅 Mavic 4 Pro 显示「横滚旋转」设置项
  const rollItem = document.getElementById('rollModeItem');
  if (rollItem) rollItem.style.display = DRONES[idx].rollCapable ? '' : 'none';
  if (!DRONES[idx].rollCapable) state.rollModeEnabled = false;
  document.querySelectorAll('.drone-card').forEach((c, i) => { c.classList.toggle('active', i === idx); });
  createDroneModel(idx);
  updateGimbalUI();
  // Avata 360：显示相机模式栏（单镜头/双镜头/超全景）；其他机型：隐藏并重置全景
  const isAvata = !!DRONES[idx].panoramic;
  if (isAvata) {
    state.avataCamMode = 'single';
    setPanoMode('single');
    updateAvataCamUI();
  } else {
    resetPano();
    const camBar = document.getElementById('avataCamBar');
    if (camBar) camBar.style.display = 'none';
  }
  updateRollBtn();
  showNotif('切换机型: ' + state.droneSpec.name);
};

// === Avata 360 相机模式：单镜头 / 双镜头全景 / 超全景 ===
window.setAvataCamMode = function(mode) {
  state.avataCamMode = mode;
  setPanoMode(mode);
  updateAvataCamUI();
  // 全景模式为 FPV 语义：隐藏准星（退出时按 fpvMode 恢复）
  const crosshair = document.getElementById('crosshair');
  if (crosshair) crosshair.style.display = (mode !== 'single' || state.fpvMode) ? 'none' : '';
  showNotif(mode === 'single' ? '📷 单镜头模式' : mode === 'dual' ? '🌐 双镜头全景' : '🪐 超全景模式');
};

// 刷新 Avata 相机栏可见性与按钮高亮（游戏循环在起飞/取消起飞时也会调用）
window.updateAvataCamUI = function() {
  const camBar = document.getElementById('avataCamBar');
  if (!camBar) return;
  const isAvata = !!state.droneSpec.panoramic;
  camBar.style.display = (isAvata && !state.isPreflight && state.gameStarted) ? '' : 'none';
  document.querySelectorAll('.avata-cam-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.cam === state.avataCamMode);
  });
};

// === Neo 2 跟拍机：双操控选择（白屏 + 蓝框） ===
window.chooseNeo2Control = function(mode) {
  const chooser = document.getElementById('neo2ControlChooser');
  document.querySelectorAll('.neo2-control-option').forEach(o => {
    o.classList.toggle('active', o.dataset.mode === mode);
  });
  state.neo2Control = mode;
  if (chooser) chooser.style.display = 'none';
  if (mode === 'rc') {
    showNotif('🎮 遥控器操控 Neo 2');
  } else {
    openPhoneControl();
  }
};

window.cancelNeo2Chooser = function() {
  const chooser = document.getElementById('neo2ControlChooser');
  if (chooser) chooser.style.display = 'none';
  state.neo2Control = 'rc';
};

// === 大风地图风级设置（1-8） ===
window.setWindLevel = function() {
  const slider = document.getElementById('windLevel');
  if (!slider) return;
  const level = parseInt(slider.value);
  state.windLevel = level;
  const val = document.getElementById('windLevelVal');
  if (val) val.textContent = level + '级';
  const hud = document.getElementById('windHud');
  if (hud) hud.textContent = '💨 ' + level + '级';
  showNotif('🌬️ 风级设置为 ' + level + '级');
};

// === 手机操控：DJI Fly 连接动画 + 手机虚拟摇杆 ===
function openPhoneControl() {
  const overlay = document.getElementById('phoneControlOverlay');
  if (overlay) overlay.style.display = 'flex';
  const status = document.getElementById('phoneConnectStatus');
  if (status) { status.textContent = '正在连接 Neo 2...'; status.className = 'connecting'; }
  const spinner = document.getElementById('phoneConnectSpinner');
  if (spinner) spinner.style.display = 'block';
  const connected = document.getElementById('phoneConnected');
  if (connected) connected.style.display = 'none';
  const joysticks = document.getElementById('phoneJoysticks');
  if (joysticks) joysticks.style.display = 'none';
  // 模拟 DJI Fly 连接过程
  setTimeout(() => {
    if (status) { status.textContent = '已连接'; status.className = 'connected'; }
    if (spinner) spinner.style.display = 'none';
    if (connected) connected.style.display = 'block';
    if (joysticks) joysticks.style.display = 'flex';
    showNotif('📱 手机已连接 Neo 2');
  }, 1800);
}

window.closePhoneControl = function(noReset) {
  const overlay = document.getElementById('phoneControlOverlay');
  if (overlay) overlay.style.display = 'none';
  const joysticks = document.getElementById('phoneJoysticks');
  if (joysticks) joysticks.style.display = 'none';
  const status = document.getElementById('phoneConnectStatus');
  if (status) { status.textContent = '正在连接 Neo 2...'; status.className = 'connecting'; }
  const spinner = document.getElementById('phoneConnectSpinner');
  if (spinner) spinner.style.display = 'block';
  if (!noReset) state.neo2Control = 'rc';
};

// === Mavic 4 Pro 横滚旋转（-45° ~ +400°） ===
window.setRollMode = function(enabled) {
  state.rollModeEnabled = enabled;
  const toggle = document.getElementById('rollModeToggle');
  if (toggle) {
    toggle.classList.toggle('active', enabled);
    toggle.textContent = enabled ? '开启' : '关闭';
  }
  if (!enabled) state.gimbalRoll = 0;
  updateRollBtn();
  showNotif(enabled ? '🎥 横滚旋转已开启（左键 +45° / 右键 -45°）' : '横滚旋转已关闭');
};

window.stepRoll = function(delta) {
  if (!state.droneSpec.rollCapable || !state.rollModeEnabled) return;
  state.gimbalRoll = Math.max(-45, Math.min(400, state.gimbalRoll + delta));
  updateRollBtn();
};

window.updateRollBtn = function() {
  const btn = document.getElementById('rollBtn');
  if (!btn) return;
  const spec = state.droneSpec;
  const show = !!spec.rollCapable && state.rollModeEnabled && !state.isPreflight && state.gameStarted;
  btn.style.display = show ? '' : 'none';
  if (show) btn.textContent = '横滚 ' + Math.round(state.gimbalRoll) + '°';
};

// 手机操控虚拟摇杆（与主摇杆共用输入状态）
document.addEventListener('DOMContentLoaded', () => {
  setupJoystick('phoneLeftBase', 'phoneLeftThumb', state.leftStick);
  setupJoystick('phoneRightBase', 'phoneRightThumb', state.rightStick);
});

window.setGear = function(gear) {
  // 如果切换到 M档，显示提示弹窗
  if (gear === 'M' && state.currentGear !== 'M') {
    showManualModePrompt();
    return; // 等待用户确认后再切换
  }

  state.currentGear = gear;

  // 根据手动模式决定显示哪些按钮
  const manualMode = isManualMode();
  const gears = manualMode ? ['N', 'S', 'M'] : ['C', 'N', 'S'];
  gears.forEach(g => {
    const btn = document.getElementById('gear' + g);
    if (btn) btn.classList.toggle('active', g === gear);
  });

  document.getElementById('gearDesc').textContent = GEAR_DESC[gear];
  document.getElementById('flightMode').textContent = gear + '档';

  // M档 特殊样式
  const flightModeEl = document.getElementById('flightMode');
  if (flightModeEl) {
    flightModeEl.classList.toggle('manual', gear === 'M');
  }

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
  // Show/hide crosshair in FPV mode（全景模式下也隐藏）
  const crosshair = document.getElementById('crosshair');
  if (crosshair) {
    crosshair.style.display = (state.fpvMode || isPanoActive()) ? 'none' : '';
  }
  showNotif(state.fpvMode ? '👁️ FPV 第一人称' : '第三人称视角');
};

window.togglePause = function() {
  state.isPaused = !state.isPaused;
  document.getElementById('btnPause').classList.toggle('active', state.isPaused);
  showNotif(state.isPaused ? '⏸️ 已暂停' : '继续飞行');
};

window.toggleGimbal = function() {
  const bar = document.getElementById('gimbalBar');
  const btn = document.getElementById('btnGimbal');
  if (!bar) return;
  const isVisible = bar.style.display !== 'none';
  bar.style.display = isVisible ? 'none' : '';
  btn.classList.toggle('active', !isVisible);
};

window.setGimbalMode = function(mode) {
  state.gimbalMode = mode;

  // Update button states
  document.getElementById('gimbalFollow').classList.toggle('active', mode === 'follow');
  document.getElementById('gimbalFPV').classList.toggle('active', mode === 'fpv');

  // Update description
  const desc = document.getElementById('gimbalModeDesc');
  if (mode === 'follow') {
    desc.textContent = '跟随模式：云台保持水平，画面稳定';
    showNotif('云台跟随模式');
  } else {
    desc.textContent = '穿越模式：云台随机体倾斜，画面随侧飞倾斜（±30°）';
    showNotif('云台穿越模式 - 画面将随无人机倾斜');
  }
};

// === WAYPOINT CONTROLS ===
window.toggleWaypoint = function() {
  if (isWaypointActive()) { stopWaypointFlight(); return; }
  openWaypointPlanner();
};
window.closeWaypointPlanner = closeWaypointPlanner;
window.clearWaypoints = clearWaypoints;
window.startWaypointFlight = startWaypointFlight;
window.confirmWaypointFlight = confirmWaypointFlight;
window.cancelWaypointConfirm = cancelWaypointConfirm;
window.updateWPSpeed = function() {
  const slider = document.getElementById('wpSpeed');
  const val = document.getElementById('wpSpeedVal');
  if (slider && val) {
    const speed = parseInt(slider.value);
    setWaypointSpeed(speed);
    val.textContent = speed + ' m/s';
  }
};

// Setup waypoint map click handler after DOM ready
document.addEventListener('DOMContentLoaded', () => {
  const canvas = document.getElementById('waypointMap');
  if (canvas) canvas.addEventListener('click', handleMapClick);
});

// === FOLLOW MODE CONTROLS ===
window.startFollowMode = function(targetType) {
  import('./follow-path.js').then(module => {
    const success = module.startFollow(targetType);
    if (success) {
      document.getElementById('followSettings').style.display = 'block';
    }
  });
};

window.stopFollowMode = function() {
  import('./follow-path.js').then(module => {
    module.stopFollow();
    document.getElementById('followSettings').style.display = 'none';
  });
};

window.updateFollowHeight = function() {
  const slider = document.getElementById('followHeight');
  const value = parseInt(slider.value);

  state.followHeight = value;
  document.getElementById('followHeightVal').textContent = value + '米';

  // Show warning for low height
  if (value <= 10) {
    showNotif('⚠️ 跟随高度较低，请注意避障！请谨慎跟随！');
  }
};

window.updateFollowSpeed = function() {
  const slider = document.getElementById('followSpeed');
  const value = parseInt(slider.value);

  state.followSpeed = value;
  document.getElementById('followSpeedVal').textContent = value + ' m/s';

  // Show warning for slow speed
  if (value <= 35) {
    showNotif('⚠️ 跟随速度较慢，容易跟丢。请小心！');
  }
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

  // Scroll wheel on gimbal slider area
  const gimbalContainer = slider.parentElement; // .gimbal-container
  if (gimbalContainer) {
    gimbalContainer.addEventListener('wheel', (e) => {
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