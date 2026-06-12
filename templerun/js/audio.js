// Temple Run - Audio System (Web Audio API)

let audioCtx = null;

// === Initialize Audio Context on first user interaction ===
function ensureAudio() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
    return audioCtx;
}

// === Play a synthesized tone ===
function playTone(frequency, duration, type = 'sine', volume = 0.3, ramp = true) {
    const ctx = ensureAudio();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(frequency, ctx.currentTime);

    gain.gain.setValueAtTime(volume, ctx.currentTime);
    if (ramp) {
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    }

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + duration);
}

// === Play a noise burst ===
function playNoise(duration, volume = 0.1) {
    const ctx = ensureAudio();
    const bufferSize = Math.floor(ctx.sampleRate * duration);
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * volume;
    }

    const source = ctx.createBufferSource();
    source.buffer = buffer;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);

    // Low-pass filter for softer noise
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(2000, ctx.currentTime);

    source.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    source.start(ctx.currentTime);
    source.stop(ctx.currentTime + duration);
}

// === Sound Effect Functions ===
export function playJump() {
    playTone(400, 0.15, 'sine', 0.2);
    playTone(600, 0.15, 'sine', 0.15);
    // Whoosh noise
    playNoise(0.15, 0.05);
}

export function playSlide() {
    // Whoosh sound
    playNoise(0.25, 0.08);
    playTone(200, 0.2, 'sine', 0.1);
}

export function playCoinCollect() {
    playTone(1200, 0.08, 'sine', 0.25);
    setTimeout(() => playTone(1600, 0.08, 'sine', 0.2), 50);
}

export function playPowerupCollect() {
    // Ascending arpeggio
    playTone(500, 0.1, 'sine', 0.2);
    setTimeout(() => playTone(700, 0.1, 'sine', 0.2), 70);
    setTimeout(() => playTone(900, 0.1, 'sine', 0.2), 140);
    setTimeout(() => playTone(1200, 0.2, 'sine', 0.25), 210);
}

export function playHit() {
    // Low thud
    playTone(100, 0.3, 'sine', 0.4);
    playTone(80, 0.3, 'sawtooth', 0.2);
    playNoise(0.15, 0.1);
}

export function playDeath() {
    // Descending tone
    playTone(400, 0.5, 'sine', 0.3);
    setTimeout(() => playTone(300, 0.5, 'sine', 0.25), 150);
    setTimeout(() => playTone(200, 0.6, 'sine', 0.2), 300);
    playNoise(0.3, 0.12);
}

export function playTurn() {
    playTone(500, 0.1, 'sine', 0.15);
    playTone(700, 0.1, 'sine', 0.1);
    playNoise(0.1, 0.03);
}

export function playChaserGrowl() {
    const ctx = ensureAudio();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(80, ctx.currentTime);
    osc.frequency.linearRampToValueAtTime(50, ctx.currentTime + 0.5);

    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(200, ctx.currentTime);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.5);
}

export function playShieldBreak() {
    playTone(300, 0.3, 'square', 0.15);
    playTone(200, 0.3, 'square', 0.1);
    playNoise(0.2, 0.08);
}

export function playBoostStart() {
    playTone(300, 0.15, 'sine', 0.2);
    setTimeout(() => playTone(500, 0.15, 'sine', 0.2), 80);
    setTimeout(() => playTone(800, 0.2, 'sine', 0.25), 160);
    setTimeout(() => playTone(1200, 0.3, 'sine', 0.2), 240);
}
