// Temple Run - UI Updates & Screen Management

import { state, GAME_PHASE, POWERUP_TYPE, POWERUP } from './config.js';
import { formatNumber } from './utils.js';

// === Screen Elements ===
const screens = {};

// === Initialize UI ===
export function initUI() {
    screens.loading = document.getElementById('loadingScreen');
    screens.menu = document.getElementById('menuScreen');
    screens.settings = document.getElementById('settingsScreen');
    screens.hud = document.getElementById('gameHUD');
    screens.pause = document.getElementById('pauseScreen');
    screens.gameover = document.getElementById('gameOverScreen');

    // Set initial high score and total coins
    updateMenuStats();
}

// === Show/Hide Screens ===
export function showScreen(screenId) {
    // Hide all screens first
    for (const [id, el] of Object.entries(screens)) {
        if (el) el.style.display = 'none';
    }

    // Show requested screen
    if (screens[screenId]) {
        screens[screenId].style.display = 'flex';
    }
}

export function showHUD(show) {
    if (screens.hud) {
        screens.hud.style.display = show ? 'block' : 'none';
    }
}

// === Update HUD (called each frame) ===
export function updateHUD() {
    if (state.gamePhase !== GAME_PHASE.PLAYING) return;

    const scoreEl = document.getElementById('hudScore');
    const coinsEl = document.getElementById('hudCoins');
    const distEl = document.getElementById('hudDistance');

    if (scoreEl) scoreEl.textContent = formatNumber(state.score);
    if (coinsEl) coinsEl.textContent = state.coins;
    if (distEl) distEl.textContent = Math.floor(state.distance) + 'm';

    // Update power-up indicators
    updatePowerupIndicators();
}

// === Update Power-up Indicators ===
function updatePowerupIndicators() {
    const container = document.getElementById('hudPowerups');
    if (!container) return;

    let html = '';

    if (state.shieldActive) {
        const pct = (state.shieldTimer / POWERUP.SHIELD_DURATION * 100).toFixed(0);
        html += `<div class="powerup-indicator" style="border-color:#3399ff;color:#3399ff;">
            🛡️<div class="powerup-timer" style="transform:scaleX(${pct/100})"></div>
        </div>`;
    }

    if (state.boostActive) {
        const pct = (state.boostTimer / POWERUP.BOOST_DURATION * 100).toFixed(0);
        html += `<div class="powerup-indicator" style="border-color:#ff6600;color:#ff6600;">
            ⚡<div class="powerup-timer" style="transform:scaleX(${pct/100})"></div>
        </div>`;
    }

    if (state.magnetActive) {
        const pct = (state.magnetTimer / POWERUP.MAGNET_DURATION * 100).toFixed(0);
        html += `<div class="powerup-indicator" style="border-color:#cc00cc;color:#cc00cc;">
            🧲<div class="powerup-timer" style="transform:scaleX(${pct/100})"></div>
        </div>`;
    }

    container.innerHTML = html;
}

// === Update Menu Stats ===
export function updateMenuStats() {
    const hsEl = document.getElementById('menuHighScore');
    const tcEl = document.getElementById('menuTotalCoins');
    if (hsEl) hsEl.textContent = formatNumber(state.highScore);
    if (tcEl) tcEl.textContent = formatNumber(state.totalCoins);
}

// === Show Game Over ===
export function showGameOver() {
    // Update high score
    if (state.score > state.highScore) {
        state.highScore = state.score;
        localStorage.setItem('templeRunHighScore', state.highScore.toString());
    }
    localStorage.setItem('templeRunTotalCoins', state.totalCoins.toString());

    const finalScore = document.getElementById('finalScore');
    const finalCoins = document.getElementById('finalCoins');
    const finalDist = document.getElementById('finalDistance');
    const finalHS = document.getElementById('finalHighScore');

    if (finalScore) finalScore.textContent = formatNumber(state.score);
    if (finalCoins) finalCoins.textContent = state.coins;
    if (finalDist) finalDist.textContent = Math.floor(state.distance) + 'm';
    if (finalHS) finalHS.textContent = formatNumber(state.highScore);

    showScreen('gameover');
    showHUD(false);
}

// === Loading Progress ===
export function updateLoadingProgress(progress) {
    const bar = document.getElementById('loadingBar');
    const text = document.getElementById('loadingText');
    if (bar) bar.style.width = progress + '%';
    if (text) text.textContent = progress >= 100 ? '准备就绪!' : `加载中... ${Math.floor(progress)}%`;
}
