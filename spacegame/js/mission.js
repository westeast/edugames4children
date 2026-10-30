// 关卡任务系统：前往目标 → 观察 → 答题 → 解锁知识卡
import { state, MISSIONS, BODIES } from './config.js';
import { flyTo, setScale } from './camera-rig.js';
import { renderMissionCard, hideMissionCard, hideTourCard, showKnowledgeCard, toast } from './ui.js';
import { sfx } from './audio.js';

// 开始一关
export function startMission(idx) {
  state.mode = 'mission';
  state.missionIdx = idx;
  state.missionStage = 'navigate';
  state.missionAnswered = false;

  hideTourCard();
  const m = MISSIONS[idx];
  // 调整到该关所在尺度
  if (m.scale && m.scale !== state.scale) setScale(m.scale);

  renderMissionCard(m, 'navigate', null, false);
  toast(`🎯 任务 ${idx + 1}：${m.title}`);
  sfx.click();
}

// 前往任务目标
export function missionGo() {
  const m = MISSIONS[state.missionIdx];
  if (!m) return;
  flyTo(m.targetId);
  state.missionStage = 'observe';
  toast(`🚀 正在飞向 ${bodyName(m.targetId)}…`);
  sfx.whoosh();
  // 到达判定交给 game.js 的 updateMissionArrival
}

export function bodyName(id) {
  const b = BODIES.find(x => x.id === id);
  return b ? b.name : id;
}

// 检测是否已到达目标附近 → 进入答题
export function updateMissionArrival(camPos) {
  if (state.mode !== 'mission' || state.missionStage !== 'observe') return;
  const m = MISSIONS[state.missionIdx];
  if (!m) return;

  const obj = window.__celestialGet && window.__celestialGet(m.targetId);
  if (!obj || !obj.group) return;
  const p = new (obj.group.position.constructor)();
  obj.group.getWorldPosition(p);
  const d = camPos.distanceTo(p);
  const r = obj.data?.visualR || 3;

  if (d < Math.max(r * 5, 12)) {
    state.missionStage = 'quiz';
    renderMissionCard(m, 'quiz', null, false);
    sfx.arrive();
    toast(`📍 已到达 ${bodyName(m.targetId)}，回答问题吧`);
  }
}

// 答题
export function answerQuiz(sel) {
  const m = MISSIONS[state.missionIdx];
  if (!m || state.missionAnswered) return;
  state.missionAnswered = true;

  const correct = sel === m.answer;
  renderMissionCard(m, 'quiz', sel, true);

  if (correct) {
    sfx.correct();
    if (!state.unlocked.includes(m.knowledgeCard)) state.unlocked.push(m.knowledgeCard);
    setTimeout(() => {
      state.missionStage = 'done';
      showKnowledgeCard(m.knowledgeCard, () => {
        toast('✅ 任务完成！可在顶部继续下一关');
        renderMissionDone(m);
      });
    }, 900);
  } else {
    sfx.wrong();
    toast('❌ 再想一想：' + m.explain);
    setTimeout(() => {
      state.missionAnswered = false;
      renderMissionCard(m, 'quiz', null, false);
    }, 2200);
  }
}

function renderMissionDone(m) {
  const el = document.getElementById('mission-card');
  if (!el) return;
  const idx = state.missionIdx;
  const hasNext = idx + 1 < MISSIONS.length;
  el.innerHTML = `
    <div class="eyebrow">MISSION ${String(idx + 1).padStart(2, '0')} / 05 · 完成</div>
    <h3>✅ ${m.title}</h3>
    <p class="mission-brief">${m.explain}</p>
    ${hasNext
      ? '<button class="primary-btn" id="mission-next">进入下一关 →</button>'
      : '<button class="primary-btn" id="mission-next">🎉 全部完成，自由探索</button>'}
  `;
  el.classList.add('show');
  const next = document.getElementById('mission-next');
  next.onclick = () => {
    if (hasNext) startMission(idx + 1);
    else { state.mode = 'explore'; hideMissionCard(); document.querySelector('#mode-nav button[data-mode="explore"]')?.click(); }
  };
}
