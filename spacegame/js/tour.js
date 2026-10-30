// 一键导览：5 站旅程（参考 ORBIT「一键导览 · 5 站 · 约 40 秒」）
import { state, TOUR } from './config.js';
import { flyTo, setScale } from './camera-rig.js';
import { renderTourCard, hideTourCard, hideMissionCard, toast } from './ui.js';
import { sfx } from './audio.js';

const STOP_SECONDS = 9;

export function startTour() {
  state.mode = 'tour';
  state.tourIdx = 0;
  state.tourPlaying = true;
  state.tourTime = 0;
  hideMissionCard();
  enterStop();
  toast('🧭 一键导览 · 5 站 · 约 45 秒');
}

function enterStop() {
  const stop = TOUR[state.tourIdx];
  if (!stop) return;
  // 尺度：地球/月球走近地轨道，其余太阳系
  const scale = (stop.targetId === 'earth' || stop.targetId === 'moon') ? 'earth' : 'solar';
  if (state.scale !== scale) setScale(scale, true);
  flyTo(stop.targetId);
  renderTourCard(stop, state.tourIdx, TOUR.length, state.tourPlaying);
  sfx.arrive();
}

export function updateTour(dt) {
  if (state.mode !== 'tour' || !state.tourPlaying) return;
  state.tourTime += dt;
  if (state.tourTime >= STOP_SECONDS) tourNext();
}

export function tourNext() {
  state.tourTime = 0;
  state.tourIdx = (state.tourIdx + 1) % TOUR.length;
  enterStop();
}

export function tourPrev() {
  state.tourTime = 0;
  state.tourIdx = (state.tourIdx - 1 + TOUR.length) % TOUR.length;
  enterStop();
}

export function tourToggle() {
  state.tourPlaying = !state.tourPlaying;
  const stop = TOUR[state.tourIdx];
  renderTourCard(stop, state.tourIdx, TOUR.length, state.tourPlaying);
  toast(state.tourPlaying ? '▶ 继续旅程' : '⏸ 旅程暂停 · 进度已保留');
}

export function exitTour() {
  state.mode = 'explore';
  state.tourPlaying = false;
  hideTourCard();
  toast('← 已退出导览');
}
