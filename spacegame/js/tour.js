// Tour mode (5-station journey + thought questions, reference ORBIT)
import { state, TOUR_STOPS } from './config.js';
import { showNotif, showTourPanel, updateTourProgress } from './ui.js';

let tourStopIdx = 0;
let tourPaused = false;
let tourTime = 0;
const STOP_DURATION = 8; // seconds per stop

// === Start the tour ===
export function startTour() {
  state.mode = 'tour';
  tourStopIdx = 0;
  tourPaused = false;
  tourTime = 0;

  // Set target to Earth first
  state.targetPlanetIdx = 2;

  showTourPanel(TOUR_STOPS[0]);
  showNotif('🚀 一键导览 · 5 站 · 约 40 秒');
}

// === Update tour each frame ===
export function updateTour(dt) {
  if (state.mode !== 'tour') return;
  if (tourPaused) return;

  tourTime += dt;

  // Advance to next stop after duration
  if (tourTime >= STOP_DURATION) {
    tourTime = 0;
    nextStop();
  }
}

// === Next stop ===
export function nextStop() {
  tourStopIdx = (tourStopIdx + 1) % TOUR_STOPS.length;
  const stop = TOUR_STOPS[tourStopIdx];

  // Set target planet based on stop
  if (tourStopIdx === 0) state.targetPlanetIdx = 2; // Earth
  else if (tourStopIdx === 1) state.targetPlanetIdx = 2; // Moon (Earth vicinity)
  else if (tourStopIdx === 2) state.targetPlanetIdx = 3; // Mars
  else if (tourStopIdx === 3) state.targetPlanetIdx = 5; // Saturn
  else state.targetPlanetIdx = 8; // Deep space / Voyager

  showTourPanel(stop);
  updateTourProgress(tourStopIdx);
}

// === Previous stop ===
export function previousStop() {
  tourStopIdx = (tourStopIdx - 1 + TOUR_STOPS.length) % TOUR_STOPS.length;
  const stop = TOUR_STOPS[tourStopIdx];

  if (tourStopIdx === 0) state.targetPlanetIdx = 2;
  else if (tourStopIdx === 1) state.targetPlanetIdx = 2;
  else if (tourStopIdx === 2) state.targetPlanetIdx = 3;
  else if (tourStopIdx === 3) state.targetPlanetIdx = 5;
  else state.targetPlanetIdx = 8;

  showTourPanel(stop);
  updateTourProgress(tourStopIdx);
}

// === Pause / resume tour ===
export function toggleTourPause() {
  tourPaused = !tourPaused;
  showNotif(tourPaused ? '⏸ 旅程暂停 · 进度已保留' : '▶ 继续原旅程');
}

// === Exit tour ===
export function exitTour() {
  state.mode = 'menu';
  state.gamePhase = 'menu';
  showNotif('← 返回星空');
}

// === Show thought question ===
export function showThoughtQuestion() {
  const stop = TOUR_STOPS[tourStopIdx];
  if (!stop) return;
  showNotif(`🤔 ${stop.question}`);
}
