// Crash Physics Module - 炸机物理效果
// 所有炸机都有翻滚效果，落地弹跳后重返家园

import * as THREE from 'three';
import { state } from './config.js';
import { getTerrainHeight } from './terrain.js';
import { showNotif } from './ui.js';

// 炸机类型
const CRASH_TYPES = {
  COLLISION: 'collision',  // 撞击地形/障碍物
  BIRD: 'bird',           // 撞击飞鸟
  BATTERY: 'battery',     // 电池耗尽
  EMERGENCY: 'emergency'  // 紧急停桨
};

// 启动炸机序列
export function initCrashSequence(crashType = CRASH_TYPES.COLLISION) {
  if (state.isCrashing || state.isCrashed) return;

  state.isCrashing = true;
  state.crashType = crashType;
  state.propSpeed = 0;
  state.crashBounceCount = 0;

  // 随机翻滚方向 - 混乱的翻滚
  state.tumblePitch = (Math.random() - 0.5) * 15;  // 快速俯仰旋转
  state.tumbleRoll = (Math.random() - 0.5) * 18;   // 快速横滚旋转
  state.tumbleYaw = (Math.random() - 0.5) * 10;    // 快速偏航旋转

  // 存储初始水平速度用于翻滚移动
  state.tumbleVelX = state.droneVel.x * 0.8;
  state.tumbleVelZ = state.droneVel.z * 0.8;

  // 根据类型显示不同的通知
  const messages = {
    [CRASH_TYPES.COLLISION]: '💥 撞击障碍物！炸机！',
    [CRASH_TYPES.BIRD]: '💥 撞到飞鸟！炸机！',
    [CRASH_TYPES.BATTERY]: '💥 电池耗尽！炸机！',
    [CRASH_TYPES.EMERGENCY]: '💥 紧急停桨导致炸机！'
  };

  showNotif(messages[crashType] || '💥 炸机！');
}

// 更新炸机物理 - 在游戏循环中调用
export function updateCrashPhysics(dt) {
  if (!state.isCrashing || state.isCrashed) return;

  // 应用重力 - 快速坠落
  state.droneVel.y -= 25 * dt;

  // 水平移动带有翻滚
  state.droneVel.x = state.tumbleVelX;
  state.droneVel.z = state.tumbleVelZ;
  state.tumbleVelX *= 0.98;  // 逐渐减速
  state.tumbleVelZ *= 0.98;

  // 更新位置
  state.dronePos.add(state.droneVel.clone().multiplyScalar(dt));

  // 翻滚无人机 (旋转)
  state.dronePitch += state.tumblePitch * dt;
  state.droneRoll += state.tumbleRoll * dt;
  state.droneYaw += state.tumbleYaw * dt;

  // 检查地面碰撞
  const groundH = getTerrainHeight(state.dronePos.x, state.dronePos.z) + 1;
  if (state.dronePos.y <= groundH) {
    handleGroundImpact();
  }
}

// 处理落地弹跳
function handleGroundImpact() {
  state.crashBounceCount++;
  const groundH = getTerrainHeight(state.dronePos.x, state.dronePos.z) + 1;
  state.dronePos.y = groundH;

  // 弹跳 2-3 次后停止
  if (state.crashBounceCount >= 3) {
    // 停止翻滚，显示炸机覆盖层，然后重置
    state.isCrashing = false;
    state.isCrashed = true;

    // 停止所有速度
    state.droneVel.set(0, 0, 0);
    state.propSpeed = 0;

    // 显示炸机覆盖层
    const overlay = document.getElementById('crashOverlay');
    if (overlay) overlay.classList.add('show');

    // 2秒后重返家园
    setTimeout(resetAfterCrash, 2000);
  } else {
    // 弹跳: 反转垂直速度并减弱
    state.droneVel.y = -state.droneVel.y * 0.3;

    // 减弱翻滚速度
    state.tumblePitch *= 0.5;
    state.tumbleRoll *= 0.5;
    state.tumbleYaw *= 0.5;

    // 弹跳音效提示
    showNotif('💥 弹跳 ' + state.crashBounceCount);
  }
}

// 炸机后重返家园
function resetAfterCrash() {
  state.isCrashed = false;
  state.isCrashing = false;
  state.crashBounceCount = 0;
  state.crashType = null;

  // 重置位置到家园点
  state.dronePos.copy(state.homePos);
  state.droneVel.set(0, 0, 0);
  state.droneYaw = 0;
  state.dronePitch = 0;
  state.droneRoll = 0;

  // 重置电量和其他状态
  state.battery = 100;
  state.totalDist = 0;
  state.propSpeed = 15;

  // 隐藏炸机覆盖层
  const overlay = document.getElementById('crashOverlay');
  if (overlay) overlay.classList.remove('show');

  showNotif('已重置到家园点');
}

// 导出常量供其他模块使用
export { CRASH_TYPES };

// 简化的 crash 函数替代原有的 crash()
export function crashWithTumble(crashType = CRASH_TYPES.COLLISION) {
  initCrashSequence(crashType);
}

// 导出到全局
window.initCrashSequence = initCrashSequence;
window.updateCrashPhysics = updateCrashPhysics;
window.crashWithTumble = crashWithTumble;
