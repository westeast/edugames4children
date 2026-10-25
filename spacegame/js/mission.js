// Mission / level system: briefing → launchPad → ignite → ascend → orbit → travel → arrive → survey → complete
import * as THREE from 'three';
import { state, MISSIONS, KNOWLEDGE_CARDS, PLANETS } from './config.js';
import { showNotif, showMissionPanel, updateMissionProgress, showKnowledgeCard } from './ui.js';
import { sfx } from './audio.js';

// === Start a mission ===
export function startMission(idx) {
  state.mode = 'mission';
  state.selectedMissionIdx = idx;
  const mission = MISSIONS[idx];

  // Set target planet
  state.targetPlanetIdx = mission.targetPlanetIdx;

  // Reset mission progress
  state.missionStepIdx = 0;
  state.missionComplete = false;
  state.surveyPointsCollected = [];

  // Show briefing
  showMissionPanel(mission);
  showNotif(`📋 任务简报: ${mission.title}`);
  sfx.click();
}

// === Advance mission step ===
export function advanceMissionStep() {
  const mission = MISSIONS[state.selectedMissionIdx];
  if (!mission) return;

  state.missionStepIdx++;

  // Mission complete when all steps done
  if (state.missionStepIdx >= mission.steps.length) {
    completeMission();
    return;
  }

  updateMissionProgress(mission);
}

// === Complete mission: unlock knowledge card ===
export function completeMission() {
  const mission = MISSIONS[state.selectedMissionIdx];
  state.missionComplete = true;

  // Unlock knowledge card
  const card = KNOWLEDGE_CARDS[mission.knowledgeCard];
  if (card && !state.knowledgeUnlocked.includes(mission.knowledgeCard)) {
    state.knowledgeUnlocked.push(mission.knowledgeCard);
    showKnowledgeCard(card);
    sfx.knowledge();
  }

  showNotif(`🎉 任务完成！${mission.title}`);
  showMissionPanel(mission, true);
}

// === Travel to target planet (change central body) ===
export function travelToPlanet(planetIdx) {
  state.targetPlanetIdx = planetIdx;
  const planet = PLANETS[planetIdx];

  // Place rocket in orbit around new planet
  const orbitRadius = Math.max(planet.radius * 0.001 + 5, 15);
  const tp = state.targetPlanetPos;
  state.rocketPos.set(tp.x + orbitRadius, tp.y, tp.z);
  state.rocketVel.set(0, 0, orbitRadius * 0.1);

  state.gamePhase = 'arrive';
  state.orbitActive = true;

  showNotif(`🛰️ 到达 ${planet.name} 引力圈！进入环绕轨道！`);
  sfx.orbit();
}

// === Check mission step completion conditions ===
export function checkMissionStep() {
  const mission = MISSIONS[state.selectedMissionIdx];
  if (!mission || state.mode !== 'mission') return;
  if (state.missionComplete) return;

  const step = mission.steps[state.missionStepIdx];
  if (!step) return;

  switch (step.id) {
    case 'launch':
      // Launch step completes when rocket reaches orbit
      if (state.gamePhase === 'orbit' || state.gamePhase === 'explore') {
        advanceMissionStep();
      }
      break;

    case 'orbit':
      // Orbit step completes when reaching orbital velocity
      if (state.orbitActive) {
        advanceMissionStep();
      }
      break;

    case 'travel':
      // Travel step completes when reaching target planet vicinity
      if (state.gamePhase === 'arrive') {
        advanceMissionStep();
      }
      break;

    case 'arrive':
      // Arrive step completes when entering target orbit
      if (state.orbitActive && state.gamePhase === 'explore') {
        advanceMissionStep();
      }
      break;

    case 'survey':
      // Survey step completes when all survey points collected
      if (state.surveyPointsCollected.length >= mission.surveyPoints.length) {
        advanceMissionStep();
      }
      break;
  }
}

// === Collect a survey point ===
export function collectSurveyPoint(pointIdx) {
  const mission = MISSIONS[state.selectedMissionIdx];
  if (!mission) return;

  const point = mission.surveyPoints[pointIdx];
  if (!point) return;

  // Avoid double-collection
  if (state.surveyPointsCollected.includes(pointIdx)) return;

  state.surveyPointsCollected.push(pointIdx);
  showNotif(`🔬 探测成功: ${point.name} — ${point.desc}`);
  sfx.survey();
  updateMissionProgress(mission);

  // Check if survey step complete
  checkMissionStep();
}
