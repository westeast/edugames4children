// Temple Run - Main Game Entry Point

import { state, GAME_PHASE } from './config.js';
import { initEngine, updateCamera, render, getScene, getEngine } from './engine.js';
import { setupKeyboardControls, setupTouchControls, setupMobileOrientation, getNextAction, clearActions } from './controls.js';
import { loadCharacter, updateCharacterPosition, playAnimation } from './character.js';
import { updatePlayer, getPlayerBounds, playerHit, resetPlayer } from './player.js';
import { initTrack, updateTrack, resetTrack, getTrackAngle } from './track.js';
import { initObstacles } from './obstacles.js';
import { initCoins, updateCoins } from './coins.js';
import { initPowerups, updatePowerups, loadPowerupModels } from './powerups.js';
import { loadChaser, updateChaser, chaserCatchUp } from './chaser.js';
import { initUI, showScreen, showHUD, updateHUD, showGameOver, updateLoadingProgress, updateMenuStats } from './ui.js';
import { playJump, playSlide, playCoinCollect, playPowerupCollect, playHit, playDeath, playTurn, playChaserGrowl, playShieldBreak, playBoostStart } from './audio.js';

// === Game Initialization ===
async function init() {
    state.gamePhase = GAME_PHASE.LOADING;

    // Initialize UI
    initUI();
    updateLoadingProgress(10);

    // Initialize Babylon.js engine
    const { engine: babylonEngine, scene, camera } = initEngine();
    updateLoadingProgress(20);

    // Load player character
    updateLoadingProgress(30);
    const playerRoot = await loadCharacter(scene);
    updateLoadingProgress(40);

    // Load chaser (demon monkey)
    updateLoadingProgress(50);
    const chaserRoot = await loadChaser(scene);
    updateLoadingProgress(55);

    // Initialize track system (NOW ASYNC - loads real GLB track pieces)
    await initTrack(scene);
    updateLoadingProgress(70);

    // Initialize sub-systems
    initObstacles(scene);
    await initCoins(scene);
    await loadPowerupModels(scene);
    initPowerups(scene);
    updateLoadingProgress(85);

    // Setup controls
    setupKeyboardControls();
    setupTouchControls();
    setupMobileOrientation();
    updateLoadingProgress(90);

    // Setup button handlers
    setupButtonHandlers();
    updateLoadingProgress(100);

    // Start game loop
    state.lastTime = performance.now();
    requestAnimationFrame(gameLoop);

    // Show menu after brief delay
    setTimeout(() => {
        state.gamePhase = GAME_PHASE.MENU;
        showScreen('menu');
        updateMenuStats();
    }, 500);

    console.log('Temple Run initialized with real track pieces!');
}

// === Main Game Loop ===
let lastCoinSoundTime = 0;
let lastGrowlTime = 0;

function gameLoop(timestamp) {
    requestAnimationFrame(gameLoop);

    const dt = Math.min((timestamp - state.lastTime) / 1000, 0.05);
    state.lastTime = timestamp;

    if (state.gamePhase === GAME_PHASE.PLAYING) {
        // Get next input action
        const action = getNextAction();

        // Handle pause action
        if (action === 'pause') {
            state.gamePhase = GAME_PHASE.PAUSED;
            showScreen('pause');
            return;
        }

        // Update player movement
        updatePlayer(dt, action);

        // Play sound effects based on action
        if (state.soundEnabled) {
            switch (action) {
                case 'jump': playJump(); break;
                case 'slide': playSlide(); break;
                case 'moveLeft':
                case 'moveRight': playTurn(); break;
            }
        }

        // Update track (generates new pieces, removes old ones)
        const collision = updateTrack(dt);

        // Update coins (spin animation)
        updateCoins(dt);

        // Update power-ups (timers, spin)
        updatePowerups(dt);

        // Update chaser
        updateChaser(dt);

        // Update character position
        const trackAngle = getTrackAngle();
        updateCharacterPosition(
            state.playerX,
            state.playerY,
            state.playerZ,
            trackAngle,
            state.isSliding
        );

        // Update camera
        updateCamera(state.playerX, state.playerY, state.playerZ, trackAngle, dt);

        // Update HUD
        updateHUD();

        // Handle coin collection sound (throttled)
        if (state.coins > 0 && state.soundEnabled && timestamp - lastCoinSoundTime > 80) {
            playCoinCollect();
            lastCoinSoundTime = timestamp;
        }

        // Handle power-up collection sound
        // (This is handled in the powerup collection function)

        // Chaser growl (when close)
        if (state.chaserDistance < 10 && state.soundEnabled && timestamp - lastGrowlTime > 3000) {
            playChaserGrowl();
            lastGrowlTime = timestamp;
        }

        // Handle collision
        if (collision) {
            handleCollision(collision);
        }

    } else if (state.gamePhase === GAME_PHASE.PAUSED) {
        // Don't update game state, just render
    } else if (state.gamePhase === GAME_PHASE.MENU || state.gamePhase === GAME_PHASE.GAMEOVER) {
        // Slow camera rotation for visual interest on menu
        if (state.gamePhase === GAME_PHASE.MENU) {
            // Gentle camera animation
        }
    }

    // Always render
    render();
}

// === Handle Collision ===
function handleCollision(collision) {
    if (state.shieldActive) {
        // Shield absorbs the hit
        state.shieldActive = false;
        state.shieldTimer = 0;
        if (state.soundEnabled) playShieldBreak();
        return;
    }

    // Player dies
    const died = playerHit();
    if (died) {
        state.gamePhase = GAME_PHASE.GAMEOVER;
        if (state.soundEnabled) playDeath();

        // Chaser catches up
        chaserCatchUp();

        // Show game over screen after brief delay
        setTimeout(() => {
            showGameOver();
        }, 1000);
    }
}

// === Start Game ===
function startGame() {
    state.gamePhase = GAME_PHASE.PLAYING;
    resetPlayer();
    resetTrack();
    clearActions();

    showScreen(null);
    showHUD(true);
}

// === Setup Button Handlers ===
function setupButtonHandlers() {
    // Play button (menu)
    document.getElementById('playButton')?.addEventListener('click', () => {
        startGame();
    });

    // Settings button
    document.getElementById('settingsButton')?.addEventListener('click', () => {
        showScreen('settings');
    });

    // Settings back
    document.getElementById('settingsBackButton')?.addEventListener('click', () => {
        showScreen('menu');
    });

    // Sound toggle
    document.getElementById('soundToggle')?.addEventListener('change', (e) => {
        state.soundEnabled = e.target.checked;
    });

    // Sensitivity slider
    document.getElementById('sensitivitySlider')?.addEventListener('input', (e) => {
        state.sensitivity = parseInt(e.target.value);
    });

    // Pause button
    document.getElementById('pauseButton')?.addEventListener('click', () => {
        if (state.gamePhase === GAME_PHASE.PLAYING) {
            state.gamePhase = GAME_PHASE.PAUSED;
            showScreen('pause');
        }
    });

    // Resume
    document.getElementById('resumeButton')?.addEventListener('click', () => {
        state.gamePhase = GAME_PHASE.PLAYING;
        showScreen(null);
        showHUD(true);
        state.lastTime = performance.now(); // Reset delta time
    });

    // Restart (from pause)
    document.getElementById('restartButtonPause')?.addEventListener('click', () => {
        startGame();
    });

    // Menu (from pause)
    document.getElementById('menuButtonPause')?.addEventListener('click', () => {
        state.gamePhase = GAME_PHASE.MENU;
        showScreen('menu');
        showHUD(false);
        updateMenuStats();
    });

    // Play again (game over)
    document.getElementById('playAgainButton')?.addEventListener('click', () => {
        startGame();
    });

    // Menu (game over)
    document.getElementById('menuButtonGameOver')?.addEventListener('click', () => {
        state.gamePhase = GAME_PHASE.MENU;
        showScreen('menu');
        showHUD(false);
        updateMenuStats();
    });
}

// === Boot ===
init();
