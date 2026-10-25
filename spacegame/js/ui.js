// HUD: mission panel, planet data panel, notifications, knowledge cards, tour panel
import { state, PLANETS, ROCKETS, PAYLOADS, MISSIONS, KNOWLEDGE_CARDS, TOUR_STOPS } from './config.js';
import { updateCoordinates } from './physics.js';
import { sfx } from './audio.js';
import { collectSurveyPoint } from './mission.js';

// === Notification system ===
export function showNotif(msg) {
  const el = document.getElementById('notification');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(el._timer);
  el._timer = setTimeout(() => el.classList.remove('show'), 3000);
}

// === Update coordinate display (top-right) ===
export function updateCoordsDisplay() {
  const el = document.getElementById('coordsDisplay');
  if (!el || state.gamePhase === 'menu') return;

  if (state.gamePhase !== 'explore' && state.gamePhase !== 'orbit') {
    el.style.display = 'none';
    return;
  }

  updateCoordinates();

  const lon = ((state.longitude + 180) % 360 - 180).toFixed(2);
  const lat = state.latitude.toFixed(2);
  const alt = Math.max(0, state.altitude).toFixed(1);

  el.innerHTML = `
    <div style="color:#888;font-size:9px;">📍 探测器坐标</div>
    <div style="font-size:13px;color:#ff9500;">经度: ${lon}°</div>
    <div style="font-size:13px;color:#ff9500;">纬度: ${lat}°</div>
    <div style="font-size:13px;color:#ff9500;">高度: ${alt} km</div>
  `;
  el.style.display = 'block';
}

// === Update phase display ===
export function updatePhaseHUD() {
  const phaseEl = document.getElementById('telePhase');
  if (!phaseEl) return;

  const phaseNames = {
    'menu': '就绪',
    'briefing': '任务简报',
    'assemble': '组装中',
    'launchPad': '发射塔位',
    'ignite': '点火',
    'ascend': '升空',
    'boosterSep': '助推分离',
    'orbit': '入轨',
    'travel': '航行中',
    'arrive': '到达',
    'explore': '探索中',
    'survey': '科学探测',
    'complete': '任务完成',
    'serviceSep': '推进舱分离',
    'orbitalSep': '轨道舱分离',
    'reentry': '再入大气层',
    'blackout': '黑障区',
    'drogue': '引导伞',
    'mainChute': '主伞展开',
    'retro': '反推减速',
    'landed': '着陆成功'
  };

  phaseEl.textContent = phaseNames[state.gamePhase] || state.gamePhase;
}

// === Show mission panel ===
export function showMissionPanel(mission, complete = false) {
  const panel = document.getElementById('missionPanel');
  if (!panel) return;

  panel.style.display = 'block';

  const titleEl = document.getElementById('missionTitle');
  const objEl = document.getElementById('missionObjective');
  const stepsEl = document.getElementById('missionSteps');

  if (titleEl) titleEl.textContent = complete ? '✅ ' + mission.title : mission.title;
  if (objEl) objEl.textContent = mission.objective;

  if (stepsEl) {
    stepsEl.innerHTML = '';
    mission.steps.forEach((step, i) => {
      const div = document.createElement('div');
      div.className = 'mission-step';
      div.innerHTML = `
        <span class="step-check ${i < state.missionStepIdx ? 'done' : ''}">${i < state.missionStepIdx ? '✓' : '○'}</span>
        <span class="step-text">${step.text}</span>
      `;
      stepsEl.appendChild(div);
    });
  }
}

// === Update mission progress ===
export function updateMissionProgress(mission) {
  showMissionPanel(mission);
}

// === Render survey points (during explore phase) ===
export function renderSurveyPoints() {
  const container = document.getElementById('surveyPoints');
  if (!container) return;

  const mission = MISSIONS[state.selectedMissionIdx];
  if (!mission || state.mode !== 'mission' || state.missionComplete) {
    container.style.display = 'none';
    return;
  }

  const step = mission.steps[state.missionStepIdx];
  if (!step || step.id !== 'survey') {
    container.style.display = 'none';
    return;
  }

  container.style.display = 'block';
  container.innerHTML = '';

  mission.surveyPoints.forEach((point, i) => {
    const collected = state.surveyPointsCollected.includes(i);
    const btn = document.createElement('button');
    btn.className = 'survey-btn';
    btn.innerHTML = `${collected ? '✅' : '🔬'} ${point.name}<small>${point.desc}</small>`;
    btn.onclick = () => collectSurveyPoint(i);
    container.appendChild(btn);
  });
}

// === Show knowledge card ===
export function showKnowledgeCard(card) {
  const el = document.getElementById('knowledgeCard');
  if (!el) return;

  el.style.display = 'block';
  el.innerHTML = `
    <button class="dialog-close" onclick="document.getElementById('knowledgeCard').style.display='none'">×</button>
    <div class="knowledge-icon">${card.icon}</div>
    <h3>${card.title}</h3>
    <p class="knowledge-content">${card.content}</p>
    <div class="knowledge-formula">${card.formula}</div>
    <p class="knowledge-fact">${card.fact}</p>
  `;
}

// === Show knowledge library ===
export function showKnowledgeLibrary(unlocked) {
  const el = document.getElementById('knowledgeLibrary');
  if (!el) return;

  el.style.display = 'block';
  el.innerHTML = `
    <button class="dialog-close" onclick="document.getElementById('knowledgeLibrary').style.display='none'">×</button>
    <h3>📚 知识图鉴</h3>
    ${unlocked.length === 0
      ? '<p class="empty">还没有解锁知识卡。完成关卡任务来收集吧！</p>'
      : unlocked.map(card => `
        <div class="knowledge-entry">
          <span class="knowledge-icon">${card.icon}</span>
          <div>
            <strong>${card.title}</strong>
            <p>${card.content}</p>
          </div>
        </div>
      `).join('')
    }
  `;
}

// === Show tour panel ===
let tourStopIdx = 0;
export function showTourPanel(stop) {
  const panel = document.getElementById('tourPanel');
  if (!panel) return;

  panel.style.display = 'block';

  const counter = document.getElementById('tourCounter');
  const subtitle = document.getElementById('tourSubtitle');
  const title = document.getElementById('tourTitle');
  const desc = document.getElementById('tourDescription');
  const stats = document.getElementById('tourStats');
  const question = document.getElementById('tourQuestion');

  if (counter) counter.textContent = `${String(tourStopIdx + 1).padStart(2, '0')} / 05`;
  if (subtitle) subtitle.textContent = stop.subtitle;
  if (title) title.textContent = stop.title;
  if (desc) desc.textContent = stop.description;
  if (stats) stats.innerHTML = stop.stats.map(s => `<div class="tour-stat">${s}</div>`).join('');
  if (question) question.textContent = stop.question;
}

// === Update tour progress ===
export function updateTourProgress(idx) {
  tourStopIdx = idx;
  const counter = document.getElementById('tourCounter');
  if (counter) counter.textContent = `${String(idx + 1).padStart(2, '0')} / 05`;
}

// === Create planet selector panel (left side) ===
export function createPlanetSelector() {
  const panel = document.getElementById('planetPanel');
  if (!panel) return;
  panel.innerHTML = '';

  PLANETS.forEach((p, i) => {
    const btn = document.createElement('button');
    btn.className = 'planet-btn';
    btn.textContent = p.name;
    btn.onclick = () => selectTargetPlanet(i);
    if (i === state.targetPlanetIdx) btn.classList.add('active');
    panel.appendChild(btn);
  });

  const plutoBtn = document.createElement('button');
  plutoBtn.className = 'planet-btn';
  plutoBtn.textContent = '冥王星 ⚪';
  plutoBtn.onclick = () => { showNotif('⚠️ 冥王星是矮行星，不是正式行星'); };
  panel.appendChild(plutoBtn);
}

function selectTargetPlanet(idx) {
  state.targetPlanetIdx = idx;
  createPlanetSelector();
  showNotif(`🎯 目标: ${PLANETS[idx].name}`);
}

// === Create launch config panel (right side) ===
export function createLaunchConfig() {
  const content = document.getElementById('launchConfigContent');
  if (!content) return;
  content.innerHTML = '';

  // Rocket selection
  const rocketTitle = document.createElement('div');
  rocketTitle.className = 'panel-title';
  rocketTitle.textContent = '火箭选择';
  content.appendChild(rocketTitle);

  ROCKETS.forEach((r, i) => {
    const card = document.createElement('div');
    card.className = 'rocket-card';
    if (i === state.selectedRocketIdx) card.classList.add('active');

    card.innerHTML = `
      <div class="name">${r.name}</div>
      <div class="specs">${r.company} · ${r.stages[0].engines}</div>
      <div class="stats"><div class="stat">高度 <span>${r.totalHeight}m</span></div></div>
    `;

    card.onclick = () => selectRocket(i);
    content.appendChild(card);
  });

  // Payload selection
  const payloadTitle = document.createElement('div');
  payloadTitle.className = 'panel-title';
  payloadTitle.textContent = '探测器载荷';
  content.appendChild(payloadTitle);

  PAYLOADS.forEach((p, i) => {
    const card = document.createElement('div');
    card.className = 'payload-card';
    if (i === state.selectedPayloadIdx) card.classList.add('active');

    card.innerHTML = `
      <div class="name">${p.name}</div>
      <div class="specs">${p.desc}</div>
    `;

    card.onclick = () => selectPayload(i);
    content.appendChild(card);
  });

  // Crewed mode toggle
  const crewDiv = document.createElement('div');
  crewDiv.style.cssText = 'margin-top:12px;display:flex;align-items:center;gap:8px;';
  crewDiv.innerHTML = `
    <label style="font-size:11px;color:#aaa;">载人模式</label>
    <button class="toggle-btn ${state.isCrewed ? 'active' : ''}" id="crewToggle" onclick="window.toggleCrewMode()">
      ${state.isCrewed ? '已开启' : '关闭'}
    </button>
  `;
  content.appendChild(crewDiv);

  // Ignition button (hidden until launch pad)
  const igniteBtn = document.createElement('button');
  igniteBtn.id = 'igniteBtn';
  igniteBtn.className = 'ctrl-btn-inline ignite-btn';
  igniteBtn.style.display = 'none';
  igniteBtn.innerHTML = '<span class="icon">🔥</span><span>点火升空</span>';
  igniteBtn.onclick = () => { state._igniting = true; sfx.countdown(); };
  content.appendChild(igniteBtn);

  // Return button (crewed mode only)
  const returnBtn = document.createElement('button');
  returnBtn.id = 'returnBtn';
  returnBtn.className = 'ctrl-btn-inline return-btn';
  returnBtn.style.display = 'none';
  returnBtn.innerHTML = '<span class="icon">🔄</span><span>返回地球</span>';
  returnBtn.onclick = () => { if (window.startReturnSequence) window.startReturnSequence(); };
  content.appendChild(returnBtn);

  // Show/hide buttons based on game phase
  const origUpdatePhase = updatePhaseHUD;
  const _updatePhaseHUD = () => {
    origUpdatePhase();
    const rb = document.getElementById('returnBtn');
    if (rb) rb.style.display = state.isCrewed && state.gamePhase === 'explore' ? '' : 'none';
    const ib = document.getElementById('igniteBtn');
    if (ib) ib.style.display = state.gamePhase === 'launchPad' ? '' : 'none';
  };

  // Override updatePhaseHUD to include our logic
  window._updatePhaseWithUI = _updatePhaseHUD;
}

// === Global handlers for onclick in HTML ===
window.selectTargetPlanet = selectTargetPlanet;

window.toggleCrewMode = () => {
  state.isCrewed = !state.isCrewed;
  const btn = document.getElementById('crewToggle');
  if (btn) {
    btn.textContent = state.isCrewed ? '已开启' : '关闭';
    btn.classList.toggle('active', state.isCrewed);
  }

  // Show/hide return button
  const rb = document.getElementById('returnBtn');
  if (rb) rb.style.display = state.isCrewed && state.gamePhase === 'explore' ? '' : 'none';

  showNotif(state.isCrewed ? '载人模式已开启（可返回地球）' : '载人模式已关闭');
};

window.selectRocket = function(idx) {
  if (idx === state.selectedRocketIdx) return;
  state.selectedRocketIdx = idx;
  createLaunchConfig(); // Re-render active state
  showNotif(`🚀 选择: ${ROCKETS[idx].name}`);
  sfx.click();
};

window.selectPayload = function(idx) {
  if (idx === state.selectedPayloadIdx) return;
  state.selectedPayloadIdx = idx;
  createLaunchConfig(); // Re-render active state
  showNotif(`🛰️ 载荷: ${PAYLOADS[idx].name}`);
  sfx.click();
};

// === Panel collapse functionality ===
window.togglePanel = function(panelId) {
  const panel = document.getElementById(panelId);
  if (!panel) return;
  const title = panel.querySelector('.panel-title.collapsible');
  const content = panel.querySelector('.panel-content');

  if (title && content) {
    title.classList.toggle('collapsed');
    content.classList.toggle('collapsed');
  }
};

// === Settings modal functions ===
window.openSettings = function() {
  document.getElementById('settingsModal').style.display = 'flex';
};

window.closeSettings = function() {
  document.getElementById('settingsModal').style.display = 'none';
};

window.switchSettingsTab = function(tabName) {
  document.querySelectorAll('.settings-tab').forEach(t => t.classList.remove('active'));
  event.target.classList.add('active');
  document.querySelectorAll('.tab-content').forEach(c => c.style.display = 'none');
  const tabIdMap = {
    'rocket': 'tabRocket', 'payload': 'tabPayload', 'control': 'tabControl', 'about': 'tabAbout'
  };
  const tabId = tabIdMap[tabName] || ('tab' + tabName.charAt(0).toUpperCase() + tabName.slice(1));
  const tabEl = document.getElementById(tabId);
  if (tabEl) tabEl.style.display = 'block';
};

window.toggleFullscreen = function() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch(() => {});
  } else {
    document.exitFullscreen();
  }
};
