// Web Audio API 合成音效
let ctx = null, master = null;

export function initAudio() {
  if (ctx) return;
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = 0.4;
    master.connect(ctx.destination);
  } catch (e) { /* 忽略音频不可用 */ }
}

function tone(freq, dur, type = 'sine', vol = 0.3, delay = 0) {
  if (!ctx) return;
  const t0 = ctx.currentTime + delay;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.value = freq;
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  o.connect(g); g.connect(master);
  o.start(t0); o.stop(t0 + dur + 0.05);
}

export const sfx = {
  click() { tone(760, 0.07, 'sine', 0.12); },
  whoosh() { tone(320, 0.35, 'sine', 0.1); },
  arrive() { tone(523, 0.14, 'sine', 0.22); tone(784, 0.3, 'sine', 0.2, 0.12); },
  correct() { tone(659, 0.14, 'sine', 0.25); tone(880, 0.3, 'sine', 0.25, 0.12); },
  wrong() { tone(300, 0.22, 'square', 0.16); tone(220, 0.3, 'square', 0.14, 0.16); },
  knowledge() { [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.35, 'sine', 0.26, i * 0.12)); },
};
