// ORBIT 式界面：信息面板、目的地坞、尺度导轨、图层开关、3D 标签投影、任务卡、导览卡、知识卡
import * as THREE from 'three';
import { camera } from './engine.js';
import { state, BODIES, GALAXIES, SCALES, KNOWLEDGE } from './config.js';
import { celestial, getLabelAnchors } from './celestial.js';
import { flyTo, setScale } from './camera-rig.js';
import { sfx } from './audio.js';

const $ = id => document.getElementById(id);

// === 通知 ===
export function toast(msg) {
  const el = $('toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('show'), 2600);
}

// === 信息面板（ORBIT 左上：类别 / 英文 / 名称+编号 / 描述 / 统计 / 操作）===
export function renderInfoPanel(id) {
  const data = getBodyData(id);
  if (!data) return;

  const idxLabel = Number.isFinite(data.index) && data.index >= 1 && data.index <= 9
    ? String(Math.floor(data.index)).padStart(2, '0') : '';
  $('info-eyebrow').textContent = data.category || '';
  $('info-en').textContent = data.en || '';
  $('info-name').innerHTML = `${data.name || ''}<span class="object-index" id="info-index">${idxLabel}</span>`;
  $('info-desc').textContent = data.description || '';

  const stats = $('info-stats');
  stats.innerHTML = '';
  (data.stats || []).forEach(([label, value, unit]) => {
    const d = document.createElement('div');
    d.innerHTML = `<span>${label}</span><strong>${value}<small>${unit || ''}</small></strong>`;
    stats.appendChild(d);
  });

  const actions = $('info-actions');
  actions.innerHTML = '';
  (data.actions || []).forEach(a => {
    const b = document.createElement('button');
    b.className = 'ghost-btn';
    b.innerHTML = `<span>${a.label}</span><i>›</i>`;
    b.onclick = () => runAction(a.id, id);
    actions.appendChild(b);
  });

  $('info-panel').classList.add('show');
  highlightDock(id);
}

function getBodyData(id) {
  return BODIES.find(b => b.id === id)
    || (celestial[id] && celestial[id].data)
    || GALAXIES.find(g => g.id === id)
    || null;
}

function runAction(actionId, bodyId) {
  sfx.click();
  if (actionId === 'night') toast('🌃 夜半球的城市灯光亮起');
  else if (actionId === 'station') { flyTo('earth'); toast('🛰️ 国际空间站：距地表约 400 km'); }
  else if (actionId === 'rover') toast('🤖 火星车正在杰泽罗陨石坑工作');
  else if (actionId === 'rings') { flyTo('saturn'); toast('💫 近看土星环：无数冰块各自沿轨道运行'); }
}

// === 尺度导轨（ORBIT 右侧）===
export function updateScaleRail() {
  document.querySelectorAll('.rail-item').forEach(el => {
    el.classList.toggle('active', el.dataset.scale === state.scale);
  });
  const cap = SCALES.find(s => s.id === state.scale);
  if (cap) {
    $('view-caption-scale').textContent = cap.caption;
    $('view-caption-distance').textContent = cap.distance;
  }
}

// === 目的地坞（ORBIT 底部图鉴 + 搜索）===
export function renderDock() {
  const list = $('dock-list');
  if (!list) return;
  list.innerHTML = '';

  let items;
  if (state.scale === 'local') {
    items = GALAXIES.map(g => ({ id: g.id, name: g.name, sub: g.en }));
    $('dock-context').textContent = '星系图鉴';
  } else if (state.scale === 'galaxy') {
    items = [{ id: 'milkyway', name: '银河系', sub: 'MILKY WAY' }, { id: 'voyager', name: '旅行者1号', sub: 'VOYAGER 1' }];
    $('dock-context').textContent = '银河系';
  } else {
    const ids = ['sun', 'mercury', 'venus', 'earth', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune', 'moon', 'voyager'];
    items = ids.map(id => {
      const b = BODIES.find(x => x.id === id);
      return { id, name: b.name, sub: b.en };
    });
    $('dock-context').textContent = '太阳系';
  }

  items.forEach(it => {
    const b = document.createElement('button');
    b.className = 'dock-item';
    b.dataset.id = it.id;
    b.innerHTML = `<span class="dock-dot" style="--c:${(getBodyData(it.id)?.color) || '#8ab4ff'}"></span><span class="dock-name">${it.name}</span>`;
    b.onclick = () => { flyTo(it.id); renderInfoPanel(it.id); sfx.click(); };
    list.appendChild(b);
  });
  highlightDock(state.selectedId);
}

export function highlightDock(id) {
  document.querySelectorAll('.dock-item').forEach(el => {
    el.classList.toggle('active', el.dataset.id === id);
  });
}

export function filterDock(q) {
  const query = (q || '').trim().toLowerCase();
  document.querySelectorAll('.dock-item').forEach(el => {
    const txt = el.textContent.toLowerCase();
    el.style.display = !query || txt.includes(query) ? '' : 'none';
  });
}

// === 图层开关 ===
export function syncLayerButtons() {
  const map = { 'toggle-orbits': state.layers.orbits, 'toggle-labels': state.layers.labels, 'toggle-sat': state.layers.satellites };
  Object.entries(map).forEach(([id, on]) => {
    const b = $(id);
    if (b) b.classList.toggle('active', !!on);
  });
}

// === 3D 标签投影 ===
const labelPool = {};
export function updateLabels() {
  const container = $('labels');
  if (!container) return;
  if (!state.layers.labels) { container.style.display = 'none'; return; }
  container.style.display = '';

  const anchors = getLabelAnchors();
  const w = window.innerWidth, h = window.innerHeight;
  const shown = new Set();

  Object.entries(anchors).forEach(([id, obj]) => {
    const data = getBodyData(id);
    if (!data || !obj) return;
    const p = new THREE.Vector3();
    obj.getWorldPosition(p);
    const projected = p.clone().project(camera);
    if (projected.z > 1) return; // 在相机后方

    const x = (projected.x * 0.5 + 0.5) * w;
    const y = (-projected.y * 0.5 + 0.5) * h;
    const inView = x > -60 && x < w + 60 && y > -30 && y < h + 30;
    // 距离太远就不显示
    const dist = camera.position.distanceTo(p);

    if (!inView || dist > getLabelMaxDist()) {
      if (labelPool[id]) labelPool[id].style.display = 'none';
      return;
    }

    let el = labelPool[id];
    if (!el) {
      el = document.createElement('div');
      el.className = 'space-label';
      container.appendChild(el);
      labelPool[id] = el;
    }
    el.textContent = data.name;
    el.style.transform = `translate(-50%, -50%) translate(${x}px, ${y}px)`;
    el.style.display = '';
    el.classList.toggle('active', state.selectedId === id);
    shown.add(id);
  });

  Object.entries(labelPool).forEach(([id, el]) => {
    if (!shown.has(id)) el.style.display = 'none';
  });
}

function getLabelMaxDist() {
  switch (state.scale) {
    case 'local': return 260000;
    case 'galaxy': return 150000;
    case 'solar': return 9000;
    default: return 120;
  }
}

// === 知识卡 ===
export function showKnowledgeCard(cardId, onClose) {
  const card = KNOWLEDGE[cardId];
  if (!card) return;
  const el = $('knowledge-card');
  el.innerHTML = `
    <button class="card-close" id="kc-close">×</button>
    <div class="kc-icon">${card.icon}</div>
    <h3>${card.title}</h3>
    <p>${card.body}</p>
    <div class="kc-fact">💡 ${card.fact}</div>
    <button class="primary-btn" id="kc-ok">收下这张知识卡</button>
  `;
  el.classList.add('show');
  $('kc-close').onclick = close;
  $('kc-ok').onclick = close;
  function close() { el.classList.remove('show'); onClose && onClose(); }
  sfx.knowledge();
}

// === 知识图鉴 ===
export function showLibrary() {
  const el = $('library');
  const cards = state.unlocked.map(id => KNOWLEDGE[id]).filter(Boolean);
  el.innerHTML = `
    <button class="card-close" id="lib-close">×</button>
    <div class="eyebrow">KNOWLEDGE · 知识图鉴</div>
    <h2>已收集 ${cards.length} / ${Object.keys(KNOWLEDGE).length}</h2>
    ${cards.length === 0 ? '<p class="muted">还没有知识卡。完成任务即可收集。</p>' :
      cards.map(c => `<div class="lib-item"><span>${c.icon}</span><div><strong>${c.title}</strong><p>${c.body}</p></div></div>`).join('')}
  `;
  el.classList.add('show');
  $('lib-close').onclick = () => el.classList.remove('show');
}

// === 任务 UI ===
export function renderMissionCard(mission, stage, selIdx, answered) {
  const el = $('mission-card');
  if (!mission) { el.classList.remove('show'); return; }

  if (stage === 'quiz' || stage === 'done') {
    const opts = mission.options.map((o, i) => {
      const cls = answered ? (i === mission.answer ? 'correct' : 'wrong') : '';
      return `<button class="quiz-opt ${cls}" data-i="${i}" ${answered ? 'disabled' : ''}>${o}</button>`;
    }).join('');
    el.innerHTML = `
      <div class="eyebrow">MISSION ${String(state.missionIdx + 1).padStart(2, '0')} / 05</div>
      <h3>${mission.question}</h3>
      <div class="quiz-opts">${opts}</div>
      <div class="quiz-explain ${answered ? 'show' : ''}">${mission.explain}</div>
    `;
    el.querySelectorAll('.quiz-opt').forEach(b => {
      b.onclick = () => window.__answerQuiz && window.__answerQuiz(Number(b.dataset.i));
    });
  } else {
    el.innerHTML = `
      <div class="eyebrow">MISSION ${String(state.missionIdx + 1).padStart(2, '0')} / 05</div>
      <h3>${mission.title}</h3>
      <p class="mission-sub">${mission.subtitle}</p>
      <p class="mission-brief">${mission.briefing}</p>
      <div class="mission-obj">🎯 ${mission.objective}</div>
      <button class="primary-btn" id="mission-go">前往目标 →</button>
    `;
    const go = $('mission-go');
    if (go) go.onclick = () => window.__missionGo && window.__missionGo();
  }
  el.classList.add('show');
}

export function renderTourCard(stop, idx, total, playing) {
  const el = $('tour-card');
  if (!stop) { el.classList.remove('show'); return; }
  el.innerHTML = `
    <div class="tour-meta"><span>${String(idx + 1).padStart(2, '0')} / ${String(total).padStart(2, '0')}</span><span>${stop.subtitle}</span><span class="tour-phase">${stop.phase}</span></div>
    <h3>${stop.title}</h3>
    <p class="tour-desc">${stop.description}</p>
    <div class="tour-stats">${stop.stats.map(s => `<span>${s}</span>`).join('')}</div>
    <div class="tour-q"><b>换个角度想一想</b><span>${stop.question}</span><small>${stop.hint}</small></div>
    <div class="tour-actions">
      <button class="ghost-btn" id="tour-prev" ${idx === 0 ? 'disabled' : ''}>← 上一站</button>
      <button class="primary-btn" id="tour-toggle">${playing ? '暂停旅程' : '继续旅程'}</button>
      <button class="ghost-btn" id="tour-next">${idx === total - 1 ? '重新开始' : '下一站 →'}</button>
    </div>
  `;
  el.classList.add('show');
  $('tour-prev').onclick = () => window.__tourPrev && window.__tourPrev();
  $('tour-toggle').onclick = () => window.__tourToggle && window.__tourToggle();
  $('tour-next').onclick = () => window.__tourNext && window.__tourNext();
}

export function hideTourCard() { $('tour-card')?.classList.remove('show'); }
export function hideMissionCard() { $('mission-card')?.classList.remove('show'); }

export function refreshAll() {
  renderDock();
  updateScaleRail();
  updateModeNav();
}

export function updateModeNav() {
  document.querySelectorAll('#mode-nav button').forEach(b => {
    b.classList.toggle('active', b.dataset.mode === state.mode);
  });
}

// === 设置弹窗 ===
export function openSettings() { $('settings').classList.add('show'); }
export function closeSettings() { $('settings').classList.remove('show'); }

export function bindUI() {
  // 顶部模式导航
  document.querySelectorAll('#mode-nav button').forEach(b => {
    b.onclick = () => {
      sfx.click();
      const m = b.dataset.mode;
      if (m === 'explore') window.__setMode && window.__setMode('explore');
      else if (m === 'mission') window.__openMissionSelect && window.__openMissionSelect();
      else if (m === 'tour') window.__startTour && window.__startTour();
    };
  });

  // 尺度导轨切换
  document.querySelectorAll('.scale-nav button').forEach(b => {
    b.onclick = () => { setScale(b.dataset.scale); sfx.click(); refreshAll(); };
  });

  // 缩放按钮
  $('zoom-in') && ($('zoom-in').onclick = () => window.__zoom && window.__zoom(-0.35));
  $('zoom-out') && ($('zoom-out').onclick = () => window.__zoom && window.__zoom(0.35));

  // 图层开关
  $('toggle-orbits') && ($('toggle-orbits').onclick = () => window.__toggleLayer && window.__toggleLayer('orbits'));
  $('toggle-labels') && ($('toggle-labels').onclick = () => window.__toggleLayer && window.__toggleLayer('labels'));
  $('toggle-sat') && ($('toggle-sat').onclick = () => window.__toggleLayer && window.__toggleLayer('satellites'));

  // 搜索
  const search = $('dock-search');
  if (search) search.oninput = () => filterDock(search.value);

  // 设置
  $('open-settings') && ($('open-settings').onclick = openSettings);
  $('settings-close') && ($('settings-close').onclick = closeSettings);
  $('library-btn') && ($('library-btn').onclick = showLibrary);
  $('reset-btn') && ($('reset-btn').onclick = () => { window.__resetView && window.__resetView(); });

  // 深空颜色
  const color = $('space-color');
  if (color) color.oninput = () => { window.__setSpaceColor && window.__setSpaceColor(color.value); };
  const starsToggle = $('stars-toggle');
  if (starsToggle) starsToggle.onchange = () => window.__setStars && window.__setStars(starsToggle.checked);
}

// === 加载屏 ===
export function hideLoading() {
  const el = $('loading');
  if (el) el.classList.add('hide');
  setTimeout(() => el && el.remove(), 900);
}

export function showError(msg) {
  const el = $('error');
  if (!el) return;
  el.classList.add('show');
  const m = $('error-msg');
  if (m) m.textContent = msg || '';
}
