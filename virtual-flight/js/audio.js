// 原创轻快合成音乐 + 全部 Web Audio 音效（无外部音频文件）
let ctx = null;
let master = null;
let musicGain = null;
let sfxGain = null;
let rainGain = null;
let noiseBuffer = null;

let musicEnabled = true;
let musicScene = 'menu';
let musicTimer = null;
let nextStepTime = 0;
let stepIndex = 0;

let engine = null;
let rainSource = null;

const BPM = 112;
const STEP = 60 / BPM / 4;      // 十六分音符
const TOTAL_STEPS = 128;         // 8 小节

function midi(n) { return 440 * Math.pow(2, (n - 69) / 12); }

export function audioAvailable() {
  return typeof window !== 'undefined' && !!(window.AudioContext || window.webkitAudioContext);
}

export function ensureAudio() {
  if (!audioAvailable()) return null;
  try {
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain();
      master.gain.value = 0.8;
      master.connect(ctx.destination);
      musicGain = ctx.createGain();
      musicGain.gain.value = 0.14;
      musicGain.connect(master);
      sfxGain = ctx.createGain();
      sfxGain.gain.value = 0.5;
      sfxGain.connect(master);
      rainGain = ctx.createGain();
      rainGain.gain.value = 0;
      rainGain.connect(master);
      noiseBuffer = makeNoise(2);
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  } catch (err) {
    console.warn('[virtual-flight] audio unavailable:', err);
    ctx = null;
    return null;
  }
}

function makeNoise(seconds) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}

function tone(freq, time, dur, { type = 'triangle', gain = 0.1, dest = sfxGain, attack = 0.008, slide = 0 } = {}) {
  if (!ctx) return;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(Math.max(20, freq), time);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), time + dur);
  g.gain.setValueAtTime(0.0001, time);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), time + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, time + dur);
  o.connect(g);
  g.connect(dest);
  o.start(time);
  o.stop(time + dur + 0.05);
}

function noiseBurst(time, dur, { gain = 0.3, freq = 900, q = 0.8, type = 'lowpass' } = {}) {
  if (!ctx || !noiseBuffer) return;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer;
  src.loop = true;
  const filter = ctx.createBiquadFilter();
  filter.type = type;
  filter.frequency.setValueAtTime(freq, time);
  filter.frequency.exponentialRampToValueAtTime(Math.max(60, freq * 0.18), time + dur);
  filter.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, time);
  g.gain.exponentialRampToValueAtTime(gain, time + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, time + dur);
  src.connect(filter);
  filter.connect(g);
  g.connect(sfxGain);
  src.start(time);
  src.stop(time + dur + 0.05);
}

// ---------- 原创音乐 ----------

const CHORDS = [
  { root: 48, notes: [60, 64, 67] }, // C
  { root: 45, notes: [57, 60, 64] }, // Am
  { root: 41, notes: [53, 57, 60] }, // F
  { root: 43, notes: [55, 59, 62] }  // G
];

// 原创五声音阶旋律（C D E G A），32 个十六分音符，0 = 休止
const MELODY_A = [
  72, 0, 74, 76, 79, 76, 74, 0, 72, 0, 69, 72, 74, 0, 76, 0,
  79, 0, 81, 79, 76, 74, 72, 0, 74, 0, 76, 74, 72, 69, 0, 0
];
const MELODY_B = [
  76, 0, 79, 81, 84, 81, 79, 0, 76, 0, 74, 76, 79, 0, 81, 0,
  84, 0, 81, 79, 76, 74, 72, 74, 76, 0, 79, 76, 74, 72, 0, 0
];

function scheduleStep(step, time) {
  if (!ctx) return;
  const bar = Math.floor(step / 16);
  const inBar = step % 16;
  const chord = CHORDS[Math.floor(bar / 2) % 4];

  // 低音：每小节第 1、3 拍
  if (inBar === 0 || inBar === 8) {
    tone(midi(chord.root - 12), time, STEP * 3.6, {
      type: 'triangle', gain: 0.075, dest: musicGain, attack: 0.01
    });
  }

  // 琶音：每 8 分音符
  if (inBar % 2 === 0) {
    const idx = (inBar / 2) % 3;
    tone(midi(chord.notes[idx] + 12), time, STEP * 1.7, {
      type: 'square', gain: 0.018, dest: musicGain, attack: 0.006
    });
  }

  // 旋律
  const phrase = (step % 64) < 32 ? MELODY_A : MELODY_B;
  const note = phrase[step % 32];
  if (note) {
    tone(midi(note), time, STEP * 2.4, {
      type: 'triangle', gain: 0.045, dest: musicGain, attack: 0.015
    });
    // 轻微回声
    tone(midi(note), time + STEP * 3, STEP * 1.6, {
      type: 'triangle', gain: 0.012, dest: musicGain, attack: 0.01
    });
  }

  // 轻打击：底鼓 + 沙锤
  if (inBar === 0 || inBar === 8) {
    tone(52, time, 0.22, { type: 'sine', gain: 0.05, dest: musicGain, slide: -22 });
  }
  if (inBar % 4 === 2) {
    noiseBurst(time, 0.06, { gain: 0.018, freq: 7000, q: 0.6, type: 'highpass' });
  }
}

function musicTarget() {
  if (!musicEnabled) return 0;
  return musicScene === 'flight' ? 0.06 : 0.14;
}

function applyMusicGain() {
  if (!ctx || !musicGain) return;
  const now = ctx.currentTime;
  musicGain.gain.cancelScheduledValues(now);
  musicGain.gain.setValueAtTime(Math.max(0.0001, musicGain.gain.value), now);
  musicGain.gain.linearRampToValueAtTime(Math.max(0.0001, musicTarget()), now + 0.45);
}

function startMusic() {
  if (!ctx || !musicEnabled || musicTimer) return;
  nextStepTime = ctx.currentTime + 0.08;
  stepIndex = 0;
  musicTimer = setInterval(() => {
    if (!ctx || ctx.state !== 'running') return;
    while (nextStepTime < ctx.currentTime + 0.18) {
      scheduleStep(stepIndex, nextStepTime);
      nextStepTime += STEP;
      stepIndex = (stepIndex + 1) % TOTAL_STEPS;
    }
  }, 25);
}

function stopMusic() {
  if (musicTimer) clearInterval(musicTimer);
  musicTimer = null;
}

// ---------- 引擎声 ----------

function startEngine() {
  if (!ctx || engine) return;
  const osc1 = ctx.createOscillator();
  const osc2 = ctx.createOscillator();
  const filter = ctx.createBiquadFilter();
  const gain = ctx.createGain();
  const whine = ctx.createOscillator();
  const whineGain = ctx.createGain();
  osc1.type = 'sawtooth';
  osc2.type = 'square';
  osc1.frequency.value = 70;
  osc2.frequency.value = 72;
  osc2.detune.value = 8;
  filter.type = 'lowpass';
  filter.frequency.value = 420;
  filter.Q.value = 1.2;
  gain.gain.value = 0.0001;
  whine.type = 'sine';
  whine.frequency.value = 300;
  whineGain.gain.value = 0.0001;
  osc1.connect(filter);
  osc2.connect(filter);
  filter.connect(gain);
  gain.connect(sfxGain);
  whine.connect(whineGain);
  whineGain.connect(sfxGain);
  osc1.start();
  osc2.start();
  whine.start();
  engine = { osc1, osc2, filter, gain, whine, whineGain };
}

function stopEngine() {
  if (!engine || !ctx) return;
  const e = engine;
  engine = null;
  const now = ctx.currentTime;
  try {
    e.gain.gain.cancelScheduledValues(now);
    e.gain.gain.setValueAtTime(Math.max(0.0001, e.gain.gain.value), now);
    e.gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);
    e.whineGain.gain.cancelScheduledValues(now);
    e.whineGain.gain.setValueAtTime(Math.max(0.0001, e.whineGain.gain.value), now);
    e.whineGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);
    e.osc1.stop(now + 0.4);
    e.osc2.stop(now + 0.4);
    e.whine.stop(now + 0.4);
  } catch { /* 已停止 */ }
}

// ---------- 雨声 ----------

function setRainSound(on) {
  if (!ctx || !noiseBuffer) return;
  if (on && !rainSource) {
    rainSource = ctx.createBufferSource();
    rainSource.buffer = noiseBuffer;
    rainSource.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 1600;
    f.Q.value = 0.45;
    rainSource.connect(f);
    f.connect(rainGain);
    rainSource.start();
  }
  const now = ctx.currentTime;
  rainGain.gain.cancelScheduledValues(now);
  rainGain.gain.setValueAtTime(Math.max(0.0001, rainGain.gain.value), now);
  rainGain.gain.linearRampToValueAtTime(on ? 0.055 : 0.0001, now + 0.8);
  if (!on && rainSource) {
    const src = rainSource;
    rainSource = null;
    setTimeout(() => { try { src.stop(); } catch { /* noop */ } }, 900);
  }
}

// ---------- 音效 ----------

export function playSfx(name, opts = {}) {
  if (!ctx) return;
  const now = ctx.currentTime;
  const scale = opts.scale || 1;
  switch (name) {
    case 'click':
      tone(880, now, 0.07, { type: 'square', gain: 0.06 });
      break;
    case 'takeoff':
      noiseBurst(now, 1.1, { gain: 0.16, freq: 1800 });
      tone(180, now, 1.0, { type: 'sawtooth', gain: 0.06, slide: 180 });
      break;
    case 'missile':
      noiseBurst(now, 0.7, { gain: 0.28, freq: 2600 });
      tone(760, now, 0.55, { type: 'sawtooth', gain: 0.12, slide: -520 });
      break;
    case 'explosion':
      noiseBurst(now, 1.0 * Math.min(scale, 1.8), { gain: 0.42, freq: 1000 });
      tone(70, now, 0.9 * Math.min(scale, 1.8), { type: 'sine', gain: 0.4, slide: -38 });
      if (scale > 1.2) noiseBurst(now + 0.08, 0.5, { gain: 0.2, freq: 320 });
      break;
    case 'crash':
      noiseBurst(now, 1.7, { gain: 0.55, freq: 1200 });
      tone(62, now, 1.6, { type: 'sine', gain: 0.5, slide: -34 });
      tone(900, now + 0.04, 0.32, { type: 'square', gain: 0.1, slide: -700 });
      break;
    case 'lock':
      tone(1180, now, 0.09, { type: 'square', gain: 0.08 });
      tone(1480, now + 0.12, 0.09, { type: 'square', gain: 0.08 });
      break;
    case 'warning':
      tone(740, now, 0.12, { type: 'square', gain: 0.08 });
      tone(740, now + 0.2, 0.12, { type: 'square', gain: 0.08 });
      break;
    case 'hit':
      noiseBurst(now, 0.35, { gain: 0.24, freq: 700 });
      tone(110, now, 0.3, { type: 'sawtooth', gain: 0.16, slide: -40 });
      break;
    case 'victory': {
      const notes = [72, 76, 79, 84];
      notes.forEach((n, i) => {
        tone(midi(n), now + i * 0.16, 0.55, { type: 'triangle', gain: 0.12 });
        tone(midi(n - 12), now + i * 0.16, 0.5, { type: 'sine', gain: 0.07 });
      });
      tone(midi(88), now + 0.66, 1.1, { type: 'triangle', gain: 0.11 });
      break;
    }
    case 'fuelout':
      tone(420, now, 0.3, { type: 'square', gain: 0.09, slide: -180 });
      tone(300, now + 0.35, 0.45, { type: 'triangle', gain: 0.09, slide: -160 });
      break;
    default:
      break;
  }
}

// ---------- 对外接口 ----------

export const audio = {
  ensure: ensureAudio,
  get ctx() { return ctx; },
  get ready() { return !!ctx; },
  startMusic() {
    ensureAudio();
    applyMusicGain();
    startMusic();
  },
  stopMusic,
  setMusicEnabled(on) {
    musicEnabled = !!on;
    if (musicEnabled) {
      ensureAudio();
      startMusic();
    }
    applyMusicGain();
    if (!musicEnabled) stopMusic();
  },
  get musicEnabled() { return musicEnabled; },
  setScene(scene) {
    musicScene = scene;
    applyMusicGain();
    if (scene === 'flight') startMusic();
  },
  startEngine() {
    ensureAudio();
    startEngine();
  },
  updateEngine({ speed = 0, throttle = 0, vtolBlend = 0, on = true, engineOn = true } = {}) {
    if (!ctx || !engine) return;
    const now = ctx.currentTime;
    const base = 58 + Math.min(speed, 340) * 0.52 + throttle * 42;
    const targetGain = on && engineOn ? 0.045 + throttle * 0.05 : 0.0001;
    try {
      engine.osc1.frequency.setTargetAtTime(base, now, 0.08);
      engine.osc2.frequency.setTargetAtTime(base * 1.007, now, 0.08);
      engine.filter.frequency.setTargetAtTime(300 + throttle * 900 + speed * 1.2, now, 0.1);
      engine.gain.gain.setTargetAtTime(targetGain, now, 0.12);
      engine.whine.frequency.setTargetAtTime(280 + vtolBlend * 640 + throttle * 120, now, 0.1);
      engine.whineGain.gain.setTargetAtTime(vtolBlend * 0.05 + 0.0001, now, 0.12);
    } catch { /* noop */ }
  },
  stopEngine,
  setRain(on) {
    ensureAudio();
    setRainSound(!!on);
  },
  play: playSfx,
  setMaster(v) {
    if (!ctx) return;
    master.gain.setTargetAtTime(v, ctx.currentTime, 0.08);
  }
};
