// Manual Mode Module - M档 手动模式逻辑
// M档控制映射与标准模式不同，转向速度更快

import * as THREE from 'three';
import { state, DRONES, GEAR_MULT, MANUAL_TURN_MULT } from './config.js';
import { showNotif } from './ui.js';

// 手动模式转向速度倍率
export function getManualTurnSpeed() {
  return MANUAL_TURN_MULT || 2.5;
}

// 检查是否处于手动模式
export function isManualMode() {
  return state.isManualMode === true;
}

// 设置手动模式状态
export function setManualMode(enabled) {
  state.isManualMode = enabled;

  // 如果切换到手动模式且当前在 C档，自动切换到 N档
  if (enabled && state.currentGear === 'C') {
    state.currentGear = 'N';
  }

  // 更新 UI 按钮显示
  updateGearButtonsUI();

  showNotif(enabled ? '已切换至手动模式' : '已切换至运动模式');
}

// 更新档位按钮 UI 显示
export function updateGearButtonsUI() {
  const manualMode = state.isManualMode;

  // 显示/隐藏按钮
  const gearC = document.getElementById('gearC');
  const gearM = document.getElementById('gearM');

  if (gearC) gearC.style.display = manualMode ? 'none' : '';
  if (gearM) gearM.style.display = manualMode ? '' : 'none';

  // 更新按钮激活状态
  const gears = manualMode ? ['N', 'S', 'M'] : ['C', 'N', 'S'];
  gears.forEach(g => {
    const btn = document.getElementById('gear' + g);
    if (btn) {
      btn.classList.toggle('active', g === state.currentGear);
    }
  });

  // 更新档位描述
  const gearDescEl = document.getElementById('gearDesc');
  if (gearDescEl) {
    const desc = {
      C: '平稳档 · 慢速安全',
      N: '普通档 · 均衡飞行',
      S: '运动档 · 极速体验',
      M: '手动档 · 专业操控'
    };
    gearDescEl.textContent = desc[state.currentGear] || '';
  }

  // 更新飞行模式显示
  const flightModeEl = document.getElementById('flightMode');
  if (flightModeEl) {
    flightModeEl.textContent = state.currentGear + '档';
    flightModeEl.classList.toggle('manual', manualMode && state.currentGear === 'M');
  }
}

// 显示 M档 提示弹窗
export function showManualModePrompt() {
  const modal = document.getElementById('manualModePromptModal');
  if (modal) {
    modal.style.display = 'flex';
  }
}

// 关闭 M档 提示弹窗
export function closeManualModePrompt() {
  const modal = document.getElementById('manualModePromptModal');
  if (modal) {
    modal.style.display = 'none';
  }
}

// 确认进入 M档
export function confirmManualModePrompt() {
  closeManualModePrompt();

  // 实际切换到 M档
  state.currentGear = 'M';

  // 更新按钮状态
  updateGearButtonsUI();

  showNotif('已切换至 M档 手动模式');
}

// M档 手动控制更新
// 与标准模式不同的控制映射：
// - 左摇杆 Y: 油门 (上=爬升, 下=下降)
// - 左摇杆 X: 快速转向 (速度倍率 MANUAL_TURN_MULT)
// - 右摇杆 Y: 俯仰 + 垂直分量 (前推=前倾+下降, 后拉=后仰+斜向爬升)
// - 右摇杆 X: 横滚 (左右倾斜)
export function updateManualControls(dt) {
  if (!state.isManualMode || state.currentGear !== 'M') return false;

  const gearMult = GEAR_MULT['M'] || 1.8;
  const maxSpd = state.droneSpec.maxSpeed * gearMult;
  const accel = state.droneSpec.accel * gearMult;

  // 获取摇杆输入
  const leftY = state.leftStick.y;  // 油门: 上=正(爬升), 下=负(下降)
  const leftX = state.leftStick.x;  // 快速转向
  const rightY = state.rightStick.y; // 俯仰
  const rightX = state.rightStick.x; // 横滚

  // 键盘输入也加入
  let inputUp = leftY;
  let inputYaw = leftX * getManualTurnSpeed();

  // 键盘辅助
  if (state.keys[' ']) inputUp += 1;
  if (state.keys['Shift'] || state.keys['shift']) inputUp -= 1;
  if (state.keys['q'] || state.keys['Q']) inputYaw -= 1 * getManualTurnSpeed();
  if (state.keys['e'] || state.keys['E']) inputYaw += 1 * getManualTurnSpeed();

  // 快速转向
  state.droneYaw += inputYaw * 2.0 * dt;

  // 方向向量
  const forward = new THREE.Vector3(-Math.sin(state.droneYaw), 0, -Math.cos(state.droneYaw));
  const right = new THREE.Vector3(Math.cos(state.droneYaw), 0, -Math.sin(state.droneYaw));

  // 目标速度
  const targetVel = new THREE.Vector3();

  // 右摇杆控制俯仰和横滚
  // 前推 (rightY > 0): 前倾 + 下降
  // 后拉 (rightY < 0): 后仰 + 斜向爬升
  let inputF = rightY;
  let inputR = rightX;

  // 键盘辅助
  if (state.keys['w'] || state.keys['W'] || state.keys['ArrowUp']) inputF += 1;
  if (state.keys['s'] || state.keys['S'] || state.keys['ArrowDown']) inputF -= 1;
  if (state.keys['a'] || state.keys['A'] || state.keys['ArrowLeft']) inputR -= 1;
  if (state.keys['d'] || state.keys['D'] || state.keys['ArrowRight']) inputR += 1;

  // 前推 = 前倾 + 下降
  // 后拉 = 后仰 + 斜向爬升 (不是直上，而是斜上)
  const pitchEffect = inputF;  // 正=前推(向前), 负=后拉(向后)

  // 水平移动
  targetVel.addScaledVector(forward, pitchEffect * maxSpd);
  targetVel.addScaledVector(right, inputR * maxSpd);

  // 垂直控制
  // 前推时下降，后拉时斜向爬升
  if (inputF > 0) {
    // 前推: 前倾并下降
    targetVel.y = inputUp * maxSpd * 0.6 - inputF * maxSpd * 0.3;
  } else if (inputF < 0) {
    // 后拉: 后仰并斜向爬升 (不是直上)
    targetVel.y = inputUp * maxSpd * 0.6 + Math.abs(inputF) * maxSpd * 0.5;
  } else {
    // 无俯仰输入时，仅油门控制
    targetVel.y = inputUp * maxSpd * 0.6;
  }

  // 速度平滑
  state.droneVel.lerp(targetVel, accel * dt * 0.3);
  const spd = state.droneVel.length();
  if (spd > maxSpd) state.droneVel.multiplyScalar(maxSpd / spd);

  // 位置更新
  const prevPos = state.dronePos.clone();
  state.dronePos.add(state.droneVel.clone().multiplyScalar(dt));

  // 视觉倾斜
  // M档 倾斜更明显
  state.dronePitch = THREE.MathUtils.lerp(state.dronePitch, -inputF * 0.5, 4 * dt);
  state.droneRoll = THREE.MathUtils.lerp(state.droneRoll, -inputR * 0.5, 4 * dt);

  return true; // 表示已处理
}

// 导出到全局，供 HTML 调用
window.isManualMode = isManualMode;
window.setManualMode = setManualMode;
window.showManualModePrompt = showManualModePrompt;
window.closeManualModePrompt = closeManualModePrompt;
window.confirmManualModePrompt = confirmManualModePrompt;
window.updateGearButtonsUI = updateGearButtonsUI;
window.setFlightMode = function(mode) {
  const isManual = (mode === 'manual');

  // 更新按钮状态
  const sportBtn = document.getElementById('modeSport');
  const manualBtn = document.getElementById('modeManual');
  if (sportBtn) sportBtn.classList.toggle('active', !isManual);
  if (manualBtn) manualBtn.classList.toggle('active', isManual);

  // 更新描述
  const descEl = document.getElementById('flightModeDesc');
  if (descEl) {
    descEl.textContent = isManual
      ? '手动操控模式，N/S/M三档可选'
      : '标准飞行模式，C/N/S三档可选';
  }

  // 显示/隐藏手动模式说明
  const infoEl = document.getElementById('manualModeInfo');
  if (infoEl) infoEl.style.display = isManual ? 'block' : 'none';

  // 设置手动模式状态
  setManualMode(isManual);
};