// Web Audio API synthesized sound effects
let audioCtx = null;
let masterGain = null;

// === Initialize audio (on user gesture) ===
export function initAudio() {
  if (audioCtx) return;
  try {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    masterGain = audioCtx.createGain();
    masterGain.gain.value = 0.5;
    masterGain.connect(audioCtx.destination);
  } catch (e) {
    console.warn('Audio init failed:', e);
  }
}

// === Tone helper ===
function tone(freq, duration, type = 'sine', volume = 0.3, delay = 0) {
  if (!audioCtx) return;
  const t0 = audioCtx.currentTime + delay;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(volume, t0);
  gain.gain.exponentialRampToValueAtTime(0.001, t0 + duration);
  osc.connect(gain);
  gain.connect(masterGain);
  osc.start(t0);
  osc.stop(t0 + duration + 0.05);
}

// === Noise burst (for engine rumble / separation) ===
function noise(duration, volume = 0.2, delay = 0) {
  if (!audioCtx) return;
  const t0 = audioCtx.currentTime + delay;
  const bufferSize = Math.floor(audioCtx.sampleRate * duration);
  const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
  }
  const source = audioCtx.createBufferSource();
  source.buffer = buffer;
  const filter = audioCtx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 400;
  const gain = audioCtx.createGain();
  gain.gain.setValueAtTime(volume, t0);
  gain.gain.exponentialRampToValueAtTime(0.001, t0 + duration);
  source.connect(filter);
  filter.connect(gain);
  gain.connect(masterGain);
  source.start(t0);
}

// === Sound effects ===
export const sfx = {
  countdown() {
    tone(440, 0.15, 'square', 0.2);
  },
  liftoff() {
    noise(2, 0.3);
    tone(60, 2, 'sawtooth', 0.25);
  },
  boosterSep() {
    noise(0.5, 0.4);
    tone(200, 0.3, 'square', 0.3);
    tone(400, 0.2, 'square', 0.2, 0.1);
  },
  orbit() {
    tone(523, 0.2, 'sine', 0.3);
    tone(659, 0.2, 'sine', 0.3, 0.15);
    tone(784, 0.4, 'sine', 0.3, 0.3);
  },
  survey() {
    tone(880, 0.15, 'sine', 0.3);
    tone(1320, 0.25, 'sine', 0.3, 0.1);
  },
  knowledge() {
    tone(523, 0.15, 'sine', 0.3);
    tone(659, 0.15, 'sine', 0.3, 0.12);
    tone(784, 0.15, 'sine', 0.3, 0.24);
    tone(1046, 0.4, 'sine', 0.35, 0.36);
  },
  warning() {
    tone(220, 0.2, 'square', 0.2);
    tone(220, 0.2, 'square', 0.2, 0.25);
  },
  success() {
    tone(660, 0.15, 'sine', 0.3);
    tone(880, 0.3, 'sine', 0.3, 0.15);
  },
  click() {
    tone(880, 0.08, 'sine', 0.15);
  },
};
