// 菜单、HUD、摇杆/油门/视角、键盘与移动端触控
import { AIRCRAFT, FIGHTERS, MAPS, COUNTRIES, clamp } from './config.js';
import { audio } from './audio.js';

const FLOWER_KEY = 'virtual-flight-flowers';

function getFlowers() {
  try {
    return Number.parseInt(localStorage.getItem(FLOWER_KEY) || '0', 10) || 0;
  } catch {
    return 0;
  }
}

function writeFlowers(n) {
  try { localStorage.setItem(FLOWER_KEY, String(n)); } catch { /* 隐私模式 */ }
}

const $ = (sel) => document.querySelector(sel);

export function createUI(state, handlers) {
  const input = {
    joystickPitch: 0,
    joystickRoll: 0,
    buttonYaw: 0,
    throttle: 0
  };
  const keys = new Set();
  let inputEnabled = false;
  let phase = 'loading';
  let flowers = getFlowers();
  let toastTimer = null;
  let lastHud = {};
  let objectiveSignature = '';
  let objectiveTime = 0;
  let viewName = '追尾视角';
  let restartLeft = 3;

  const el = {
    loading: $('#loading'), loadFill: $('#loadFill'), loadText: $('#loadText'),
    menu: $('#menu'), hud: $('#hud'), controls: $('#controls'),
    aircraftTabs: $('#aircraftTabs'), fighterTabs: $('#fighterTabs'),
    pickedName: $('#pickedName'), pickedSub: $('#pickedSub'), pickedTag: $('#pickedTag'),
    pickedDesc: $('#pickedDesc'), flowerCount: $('#flowerCount'),
    modeTabs: $('#modeTabs'), levelRow: $('#levelRow'), levelTabs: $('#levelTabs'),
    mapCards: $('#mapCards'), countryA: $('#countryA'), countryB: $('#countryB'),
    timeTabs: $('#timeTabs'), rainTabs: $('#rainTabs'), brightness: $('#brightness'),
    musicToggle: $('#musicToggle'), startBtn: $('#startBtn'), menuHint: $('#menuHint'),
    creditsBtn: $('#creditsBtn'), creditsModal: $('#creditsModal'), creditsClose: $('#creditsClose'),
    altValue: $('#altValue'), vsValue: $('#vsValue'), headingValue: $('#headingValue'),
    speedValue: $('#speedValue'), throttleBar: $('#throttleBar'), throttlePercent: $('#throttlePercent'),
    missionObjective: $('#missionObjective'), objectiveList: $('#objectiveList'),
    fuelFill: $('#fuelFill'), fuelPct: $('#fuelPct'), fuelTime: $('#fuelTime'),
    ammoValue: $('#ammoValue'), vtolState: $('#vtolState'), lockHint: $('#lockHint'),
    speedWarn: $('#speedWarn'),
    viewBtn: $('#viewBtn'), hudTime: $('#hudTime'), hudRain: $('#hudRain'),
    hudMusic: $('#hudMusic'), pauseBtn: $('#pauseBtn'),
    toast: $('#toast'),
    crashOverlay: $('#crashOverlay'), crashTitle: $('#crashTitle'), crashReason: $('#crashReason'),
    restartCount: $('#restartCount'),
    victoryOverlay: $('#victoryOverlay'), victoryTitle: $('#victoryTitle'), victoryText: $('#victoryText'),
    victoryFlowers: $('#victoryFlowers'), redFlower: $('#redFlower'),
    victoryAgain: $('#victoryAgain'), victoryMenu: $('#victoryMenu'),
    pauseOverlay: $('#pauseOverlay'), resumeBtn: $('#resumeBtn'), restartBtn: $('#restartBtn'), exitBtn: $('#exitBtn'),
    joystick: $('#joystick'), joyStick: $('#joyStick'),
    joyBtn1: $('#joyBtn1'), joyBtn2: $('#joyBtn2'), joyBtn3: $('#joyBtn3'), joyBtn4: $('#joyBtn4'),
    throttle: $('#throttle'), throttleFill: $('#throttleFill'), throttleKnob: $('#throttleKnob'), throttleValue: $('#throttleValue'),
    btnFire: $('#btnFire'), btnTakeoff: $('#btnTakeoff'), btnVtol: $('#btnVtol')
  };

  // ---------------- 菜单渲染 ----------------
  el.mapCards.innerHTML = Object.values(MAPS).map((m) => `
    <button type="button" class="map-card" data-map="${m.id}">
      <span class="map-icon">${m.icon}</span>
      <b>${m.name}</b>
      <small>${m.desc}</small>
    </button>
  `).join('');

  const countryOptions = COUNTRIES.map((c) => `<option value="${c}">${c}</option>`).join('');
  el.countryA.innerHTML = countryOptions;
  el.countryB.innerHTML = countryOptions;

  function categoryOf(key) {
    return AIRCRAFT[key].category;
  }

  function updateMenu() {
    const spec = AIRCRAFT[state.aircraft];
    const cat = categoryOf(state.aircraft);
    for (const b of el.aircraftTabs.querySelectorAll('button')) {
      b.classList.toggle('active', b.dataset.cat === cat);
    }
    el.fighterTabs.classList.toggle('hidden', cat !== 'fighter');
    for (const b of el.fighterTabs.querySelectorAll('button')) {
      b.classList.toggle('active', b.dataset.aircraft === state.aircraft);
    }
    for (const b of el.modeTabs.querySelectorAll('button')) {
      b.classList.toggle('active', b.dataset.mode === state.mode);
    }
    el.levelRow.classList.toggle('hidden', state.mode !== 'mission');
    for (const b of el.levelTabs.querySelectorAll('button')) {
      b.classList.toggle('active', Number(b.dataset.level) === state.missionLevel);
    }
    for (const b of el.mapCards.querySelectorAll('button')) {
      b.classList.toggle('active', b.dataset.map === state.map);
    }
    for (const b of el.timeTabs.querySelectorAll('button')) {
      b.classList.toggle('active', b.dataset.time === state.time);
    }
    for (const b of el.rainTabs.querySelectorAll('button')) {
      b.classList.toggle('active', (b.dataset.rain === '1') === !!state.rain);
    }
    el.countryA.value = state.countryA;
    el.countryB.value = state.countryB;
    el.brightness.value = state.brightness;

    el.pickedName.textContent = spec.name;
    el.pickedSub.textContent = spec.sub;
    el.pickedDesc.textContent = spec.desc;
    el.pickedTag.textContent = cat === 'prop' ? '螺旋桨' : cat === 'airliner' ? '民航' : '战斗机';
    el.flowerCount.textContent = `🌺 ${flowers}`;
    el.musicToggle.classList.toggle('off', !state.music);
    el.musicToggle.textContent = state.music ? '🎵 音乐开' : '🔇 音乐关';
    el.hudMusic.textContent = state.music ? '🎵' : '🔇';
    el.hudTime.textContent = state.time === 'night' ? '🌙' : '☀️';
    el.hudRain.textContent = state.rain ? '🌧️' : '🌤️';
    el.menuHint.textContent = `${state.mode === 'mission' ? `任务模式 · 第 ${state.missionLevel} 关` : '自由模式'} · ${MAPS[state.map].name} · ${state.time === 'night' ? '黑夜' : '白天'}${state.rain ? '雨天' : '晴天'}`;
  }

  // ---------------- 菜单事件 ----------------
  el.aircraftTabs.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-cat]');
    if (!b) return;
    if (b.dataset.cat === 'fighter') {
      const next = FIGHTERS.includes(state.aircraft) ? state.aircraft : 'f35b';
      handlers.onSelectAircraft(next);
    } else {
      handlers.onSelectAircraft(b.dataset.cat === 'prop' ? 'prop' : 'airliner');
    }
    audio.play('click');
  });

  el.fighterTabs.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-aircraft]');
    if (!b) return;
    handlers.onSelectAircraft(b.dataset.aircraft);
    audio.play('click');
  });

  el.modeTabs.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-mode]');
    if (!b) return;
    handlers.onSelectMode(b.dataset.mode);
    audio.play('click');
  });

  el.levelTabs.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-level]');
    if (!b) return;
    handlers.onSelectLevel(Number(b.dataset.level));
    audio.play('click');
  });

  el.mapCards.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-map]');
    if (!b) return;
    handlers.onSelectMap(b.dataset.map);
    audio.play('click');
  });

  el.timeTabs.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-time]');
    if (!b) return;
    handlers.onTimeChange(b.dataset.time);
    audio.play('click');
  });

  el.rainTabs.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-rain]');
    if (!b) return;
    handlers.onRainChange(b.dataset.rain === '1');
    audio.play('click');
  });

  el.brightness.addEventListener('input', () => {
    handlers.onBrightness(Number(el.brightness.value));
  });

  el.countryA.addEventListener('change', () => handlers.onCountry('a', el.countryA.value));
  el.countryB.addEventListener('change', () => handlers.onCountry('b', el.countryB.value));

  el.musicToggle.addEventListener('click', () => {
    handlers.onMusicToggle();
    audio.play('click');
  });

  el.startBtn.addEventListener('click', () => {
    audio.ensure();
    audio.play('click');
    handlers.onStart();
  });

  el.creditsBtn.addEventListener('click', () => { el.creditsModal.classList.remove('hidden'); });
  el.creditsClose.addEventListener('click', () => { el.creditsModal.classList.add('hidden'); });
  el.creditsModal.addEventListener('click', (e) => {
    if (e.target === el.creditsModal) el.creditsModal.classList.add('hidden');
  });

  // ---------------- 飞行 HUD 按钮 ----------------
  function refreshViewButton() {
    const short = viewName.replace('视角', '');
    el.viewBtn.innerHTML = `视角 ${short || ''}<small>②</small>`;
  }

  function doViewChange() {
    handlers.onView();
    el.joyBtn2.classList.add('pressed');
    el.viewBtn.classList.add('pressed');
    setTimeout(() => {
      el.joyBtn2.classList.remove('pressed');
      el.viewBtn.classList.remove('pressed');
    }, 170);
    audio.play('click');
  }

  el.viewBtn.addEventListener('click', doViewChange);
  el.hudTime.addEventListener('click', () => { handlers.onTimeToggle(); audio.play('click'); });
  el.hudRain.addEventListener('click', () => { handlers.onRainToggle(); audio.play('click'); });
  el.hudMusic.addEventListener('click', () => { handlers.onMusicToggle(); audio.play('click'); });
  el.pauseBtn.addEventListener('click', () => handlers.onPause());

  el.resumeBtn.addEventListener('click', () => handlers.onResume());
  el.restartBtn.addEventListener('click', () => handlers.onRestart());
  el.exitBtn.addEventListener('click', () => handlers.onExitMenu());
  el.victoryAgain.addEventListener('click', () => handlers.onRestart());
  el.victoryMenu.addEventListener('click', () => handlers.onExitMenu());

  // ---------------- 摇杆 ----------------
  let joyPointer = null;
  let joyMax = 40;

  function setStick(dx, dy) {
    el.joyStick.style.transform = `translate(${dx}px, ${dy}px)`;
  }

  function updateJoy(e) {
    const rect = el.joystick.getBoundingClientRect();
    joyMax = rect.width * 0.27;
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    let dx = e.clientX - cx;
    let dy = e.clientY - cy;
    const len = Math.hypot(dx, dy);
    if (len > joyMax) {
      dx = dx / len * joyMax;
      dy = dy / len * joyMax;
    }
    setStick(dx, dy);
    input.joystickRoll = -dx / joyMax;
    input.joystickPitch = -dy / joyMax;
  }

  function resetJoy() {
    joyPointer = null;
    setStick(0, 0);
    input.joystickPitch = 0;
    input.joystickRoll = 0;
  }

  el.joystick.addEventListener('pointerdown', (e) => {
    if (!inputEnabled) return;
    if (e.target.closest('.joy-btn')) return;
    e.preventDefault();
    joyPointer = e.pointerId;
    el.joystick.setPointerCapture(e.pointerId);
    updateJoy(e);
  });

  el.joystick.addEventListener('pointermove', (e) => {
    if (joyPointer !== e.pointerId) return;
    e.preventDefault();
    updateJoy(e);
  });

  el.joystick.addEventListener('pointerup', (e) => {
    if (joyPointer === e.pointerId) resetJoy();
  });
  el.joystick.addEventListener('pointercancel', resetJoy);

  el.joyBtn1.addEventListener('pointerdown', (e) => { e.preventDefault(); handlers.onFire(); });
  el.joyBtn2.addEventListener('click', (e) => { e.preventDefault(); doViewChange(); });

  function yawButton(btn, dir) {
    const down = (e) => {
      e.preventDefault();
      if (!inputEnabled) return;
      input.buttonYaw = dir;
      btn.classList.add('pressed');
      btn.setPointerCapture?.(e.pointerId);
    };
    const up = () => {
      if (input.buttonYaw === dir) input.buttonYaw = 0;
      btn.classList.remove('pressed');
    };
    btn.addEventListener('pointerdown', down);
    btn.addEventListener('pointerup', up);
    btn.addEventListener('pointercancel', up);
    btn.addEventListener('pointerleave', up);
  }
  yawButton(el.joyBtn3, 1);
  yawButton(el.joyBtn4, -1);

  // ---------------- 油门 ----------------
  let throttlePointer = null;

  function setThrottle(v) {
    input.throttle = clamp(v, 0, 1);
    const pct = Math.round(input.throttle * 100);
    el.throttleFill.style.width = pct + '%';
    el.throttleKnob.style.left = pct + '%';
    el.throttleValue.textContent = pct + '%';
  }
  setThrottle(0);

  function throttleFromEvent(e) {
    const rect = el.throttle.getBoundingClientRect();
    setThrottle((e.clientX - rect.left) / Math.max(1, rect.width));
  }

  el.throttle.addEventListener('pointerdown', (e) => {
    if (!inputEnabled) return;
    e.preventDefault();
    throttlePointer = e.pointerId;
    el.throttle.setPointerCapture(e.pointerId);
    throttleFromEvent(e);
  });
  el.throttle.addEventListener('pointermove', (e) => {
    if (throttlePointer !== e.pointerId) return;
    e.preventDefault();
    throttleFromEvent(e);
  });
  el.throttle.addEventListener('pointerup', (e) => {
    if (throttlePointer === e.pointerId) throttlePointer = null;
  });
  el.throttle.addEventListener('pointercancel', () => { throttlePointer = null; });
  el.throttle.addEventListener('wheel', (e) => {
    if (!inputEnabled) return;
    e.preventDefault();
    setThrottle(input.throttle - Math.sign(e.deltaY) * 0.08);
  }, { passive: false });

  // ---------------- 动作按钮 ----------------
  el.btnFire.addEventListener('click', () => handlers.onFire());
  el.btnTakeoff.addEventListener('click', () => {
    handlers.onTakeoff();
    audio.play('click');
  });

  let vtolDownAt = 0;
  let vtolTimer = null;
  let vtolLong = false;

  function vtolPointerDown(e) {
    e.preventDefault();
    if (!inputEnabled) return;
    vtolDownAt = performance.now();
    vtolLong = false;
    el.btnVtol.classList.add('holding');
    if (!handlers.isVtol()) {
      vtolTimer = setTimeout(() => {
        vtolLong = true;
        el.btnVtol.classList.remove('holding');
        handlers.onVtol(true);
        if (navigator.vibrate) navigator.vibrate(30);
      }, 460);
    }
  }

  function vtolPointerUp(e) {
    if (e) e.preventDefault();
    clearTimeout(vtolTimer);
    vtolTimer = null;
    el.btnVtol.classList.remove('holding');
    if (!inputEnabled) return;
    const quick = performance.now() - vtolDownAt < 460;
    if (handlers.isVtol()) {
      // 短按退出 VTOL
      if (quick) handlers.onVtol(false);
    } else if (!vtolLong) {
      toast('长按 VTOL 按钮进入垂直起降');
    }
    vtolLong = false;
  }

  el.btnVtol.addEventListener('pointerdown', vtolPointerDown);
  el.btnVtol.addEventListener('pointerup', vtolPointerUp);
  el.btnVtol.addEventListener('pointercancel', vtolPointerUp);
  el.btnVtol.addEventListener('pointerleave', (e) => {
    if (vtolTimer) vtolPointerUp(e);
  });

  // ---------------- 键盘 ----------------
  function isTypingTarget(t) {
    return t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA');
  }

  window.addEventListener('keydown', (e) => {
    if (isTypingTarget(e.target)) return;
    const code = e.code;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(code) && inputEnabled) {
      e.preventDefault();
    }
    if (e.repeat) {
      if (!['KeyW', 'KeyS'].includes(code)) return;
    }
    keys.add(code);
    if (!inputEnabled) return;
    if (code === 'Space') handlers.onFire();
    else if (code === 'KeyV') doViewChange();
    else if (code === 'KeyG') handlers.onTakeoff();
    else if (code === 'KeyT') handlers.onVtolToggle();
    else if (code === 'KeyM') handlers.onMusicToggle();
    else if (code === 'Escape' || code === 'KeyP') handlers.onPause();
    else if (code === 'KeyR') handlers.onRestart();
  });

  window.addEventListener('keyup', (e) => keys.delete(e.code));
  window.addEventListener('blur', () => { keys.clear(); resetJoy(); input.buttonYaw = 0; });

  el.btnVtol.classList.add('hidden');
  el.btnTakeoff.classList.add('hidden');

  // ---------------- HUD 更新 ----------------
  function text(ref, value) {
    if (lastHud[ref.id] !== value) {
      lastHud[ref.id] = value;
      ref.textContent = value;
    }
  }

  function updateHUD(d) {
    text(el.altValue, String(Math.round(d.altitude)));
    text(el.speedValue, String(Math.round(d.speed)));
    const vs = d.verticalSpeed >= 0 ? `+${d.verticalSpeed.toFixed(1)}` : d.verticalSpeed.toFixed(1);
    text(el.vsValue, vs);
    text(el.headingValue, String(Math.round(d.heading) % 360).padStart(3, '0'));
    text(el.throttlePercent, String(Math.round(d.throttle * 100)));
    text(el.fuelPct, Math.round(d.fuel) + '%');
    text(el.fuelTime, d.minutes >= 60 ? `${(d.minutes / 60).toFixed(1)} 小时` : `${Math.max(0, d.minutes).toFixed(1)}`);
    text(el.ammoValue, String(d.ammo));
    el.throttleBar.style.width = Math.round(d.throttle * 100) + '%';
    el.fuelFill.style.width = Math.max(0, d.fuel) + '%';
    el.fuelFill.classList.toggle('low', d.fuel < 25);

    el.missionObjective.textContent = d.missionText;
    const vt = d.vtol ? 'VTOL 悬停' : d.onGround ? '地面滑跑' : '';
    text(el.vtolState, vt);

    el.lockHint.classList.toggle('hidden', !d.lock);
    const stalling = !d.onGround && d.speed < d.stall * 0.85 && !d.crashed;
    el.speedWarn.classList.toggle('hidden', !stalling);

    el.btnVtol.classList.toggle('hidden', !d.hasVtol);
    el.btnVtol.classList.toggle('active', !!d.vtol);
    el.btnTakeoff.classList.toggle('hidden', !d.canTakeoff);
    el.btnFire.classList.toggle('hidden', !d.hasMissiles);

    el.hudTime.textContent = state.time === 'night' ? '🌙' : '☀️';
    el.hudRain.textContent = state.rain ? '🌧️' : '🌤️';
    el.hudMusic.textContent = state.music ? '🎵' : '🔇';

    objectiveTime += 1 / 60;
    if (objectiveTime > 0.18) {
      objectiveTime = 0;
      const objs = d.objectives || [];
      const sig = objs.map((o) => `${o.label}:${Math.round(o.distance / 10)}`).join('|') + `@${Math.round(d.heading / 10)}`;
      if (sig !== objectiveSignature) {
        objectiveSignature = sig;
        el.objectiveList.innerHTML = objs.slice(0, 4).map((o) => {
          const dx = o.worldX - d.playerX;
          const dz = o.worldZ - d.playerZ;
          const bearing = Math.atan2(dx, -dz) * 180 / Math.PI;
          let rel = bearing - d.heading;
          rel = ((rel + 540) % 360) - 180;
          return `<span class="obj-chip"><span class="obj-arrow" style="transform:rotate(${rel}deg)">▲</span>${o.label} ${Math.round(o.distance)}m</span>`;
        }).join('');
      }
    }
  }

  function setViewLabel(name) {
    viewName = name;
    refreshViewButton();
  }

  // ---------------- 浮层 ----------------
  function toast(msg, kind = '', ms = 2200) {
    el.toast.textContent = msg;
    el.toast.className = 'toast show' + (kind ? ' ' + kind : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      el.toast.className = 'toast' + (kind ? ' ' + kind : '');
    }, ms);
  }

  function showCrash(title, reason) {
    restartLeft = 3;
    el.crashTitle.textContent = title || '飞机损毁';
    el.crashReason.textContent = reason || '别担心，马上重新起飞！';
    el.restartCount.textContent = String(restartLeft);
    el.crashOverlay.classList.remove('hidden');
  }

  function setRestartCount(n) {
    restartLeft = Math.max(0, n);
    el.restartCount.textContent = String(restartLeft);
  }

  function hideCrash() {
    el.crashOverlay.classList.add('hidden');
  }

  function showVictory({ winner, missionLevel, mode, flowers: total }) {
    const text = mode === 'mission'
      ? `${winner} 获胜，获得一朵小红花！`
      : `${winner} 完成自由飞行，获得一朵小红花！`;
    el.victoryTitle.textContent = mode === 'mission' ? `第 ${missionLevel} 关完成！` : '自由飞行完成！';
    el.victoryText.textContent = text;
    el.victoryFlowers.textContent = String(total ?? flowers);
    el.redFlower.textContent = '🌺';
    el.victoryOverlay.classList.remove('hidden');
  }

  function hideVictory() {
    el.victoryOverlay.classList.add('hidden');
  }

  function showPause() {
    el.pauseOverlay.classList.remove('hidden');
  }

  function hidePause() {
    el.pauseOverlay.classList.add('hidden');
  }

  function addFlower() {
    flowers += 1;
    writeFlowers(flowers);
    el.flowerCount.textContent = `🌺 ${flowers}`;
    return flowers;
  }

  // ---------------- 阶段 ----------------
  function setPhase(p) {
    phase = p;
    inputEnabled = p === 'flying';
    el.loading.classList.toggle('hidden', p !== 'loading');
    el.menu.classList.toggle('hidden', p !== 'menu');
    const showFlight = p === 'flying' || p === 'paused' || p === 'crashed' || p === 'victory';
    el.hud.classList.toggle('hidden', !showFlight);
    el.controls.classList.toggle('hidden', !showFlight);
    if (p === 'menu') {
      el.hideVictory?.();
      hideVictory();
      hidePause();
      hideCrash();
      el.creditsModal.classList.add('hidden');
    }
    if (p !== 'paused') hidePause();
    if (p !== 'crashed') hideCrash();
    if (p !== 'victory') hideVictory();
    if (p !== 'flying') {
      keys.clear();
      resetJoy();
      input.buttonYaw = 0;
    }
  }

  function setLoading(progress, label) {
    el.loadFill.style.width = Math.round(progress * 100) + '%';
    if (label) el.loadText.textContent = label;
  }

  function finishLoading() {
    el.loading.classList.add('fade');
    setTimeout(() => el.loading.classList.add('hidden'), 520);
  }

  function getInput() {
    const kPitch = (keys.has('ArrowUp') ? 1 : 0) - (keys.has('ArrowDown') ? 1 : 0);
    const kRoll = (keys.has('ArrowLeft') ? 1 : 0) - (keys.has('ArrowRight') ? 1 : 0);
    const kYaw = (keys.has('KeyQ') ? 1 : 0) - (keys.has('KeyE') ? 1 : 0);
    const pitch = clamp(input.joystickPitch + kPitch, -1, 1);
    const roll = clamp(input.joystickRoll + kRoll, -1, 1);
    const yaw = clamp(input.buttonYaw + kYaw, -1, 1);
    return { pitch, roll, yaw, throttle: input.throttle };
  }

  function updateKeyboardThrottle(dt) {
    if (!inputEnabled) return;
    if (keys.has('KeyW')) setThrottle(input.throttle + dt * 0.55);
    if (keys.has('KeyS')) setThrottle(input.throttle - dt * 0.55);
  }

  function setTakeoffVisible(v) {
    el.btnTakeoff.classList.toggle('hidden', !v);
  }

  function forceThrottle(v) {
    setThrottle(v);
  }

  return {
    el,
    input,
    getInput,
    updateKeyboardThrottle,
    setThrottle: forceThrottle,
    getThrottle: () => input.throttle,
    updateMenu,
    updateHUD,
    setViewLabel,
    setPhase,
    setLoading,
    finishLoading,
    toast,
    showCrash,
    setRestartCount,
    hideCrash,
    showVictory,
    hideVictory,
    showPause,
    hidePause,
    addFlower,
    getFlowers: () => flowers,
    setTakeoffVisible,
    getPhase: () => phase
  };
}
