// Temple Run - Input Controls

import { state, GAME_PHASE, SPEED } from './config.js';

const SWIPE_MIN_DISTANCE = 30;    // Minimum pixels for a swipe
const SWIPE_MAX_TIME = 300;       // Maximum ms for a swipe
const TAP_MAX_DISTANCE = 10;      // Max pixels for a tap

// === Action queue (prevents missed inputs) ===
let actionQueue = [];

export function getNextAction() {
    return actionQueue.length > 0 ? actionQueue.shift() : null;
}

export function clearActions() {
    actionQueue = [];
}

function queueAction(action) {
    if (actionQueue.length < 3) { // Limit queue size
        actionQueue.push(action);
    }
}

// === Keyboard Input ===
export function setupKeyboardControls() {
    window.addEventListener('keydown', (e) => {
        if (state.gamePhase !== GAME_PHASE.PLAYING) return;

        state.keys[e.code] = true;

        switch (e.code) {
            case 'ArrowLeft':
            case 'KeyA':
                queueAction('moveLeft');
                break;
            case 'ArrowRight':
            case 'KeyD':
                queueAction('moveRight');
                break;
            case 'ArrowUp':
            case 'KeyW':
            case 'Space':
                queueAction('jump');
                e.preventDefault();
                break;
            case 'ArrowDown':
            case 'KeyS':
                queueAction('slide');
                break;
            case 'Escape':
            case 'KeyP':
                queueAction('pause');
                break;
        }
    });

    window.addEventListener('keyup', (e) => {
        state.keys[e.code] = false;
    });
}

// === Touch/Swipe Input ===
export function setupTouchControls() {
    const canvas = document.querySelector('canvas') || document.body;

    canvas.addEventListener('touchstart', onTouchStart, { passive: false });
    canvas.addEventListener('touchend', onTouchEnd, { passive: false });
    canvas.addEventListener('touchmove', onTouchMove, { passive: false });

    // Mouse fallback for desktop testing
    canvas.addEventListener('mousedown', onMouseDown);
    canvas.addEventListener('mouseup', onMouseUp);
}

function onTouchStart(e) {
    if (state.gamePhase !== GAME_PHASE.PLAYING) return;
    e.preventDefault();

    const touch = e.touches[0];
    state.swipeStart = { x: touch.clientX, y: touch.clientY };
    state.swipeStartTime = performance.now();
}

function onTouchMove(e) {
    e.preventDefault();
}

function onTouchEnd(e) {
    if (!state.swipeStart || state.gamePhase !== GAME_PHASE.PLAYING) return;
    e.preventDefault();

    const touch = e.changedTouches[0];
    handleSwipeEnd(touch.clientX, touch.clientY);
}

function onMouseDown(e) {
    if (state.gamePhase !== GAME_PHASE.PLAYING) return;
    state.swipeStart = { x: e.clientX, y: e.clientY };
    state.swipeStartTime = performance.now();
}

function onMouseUp(e) {
    if (!state.swipeStart || state.gamePhase !== GAME_PHASE.PLAYING) return;
    handleSwipeEnd(e.clientX, e.clientY);
}

function handleSwipeEnd(endX, endY) {
    const startX = state.swipeStart.x;
    const startY = state.swipeStart.y;
    const elapsed = performance.now() - state.swipeStartTime;

    const dx = endX - startX;
    const dy = endY - startY;
    const dist = Math.sqrt(dx * dx + dy * dy);

    state.swipeStart = null;

    // Check if it's a valid swipe
    if (dist >= SWIPE_MIN_DISTANCE && elapsed <= SWIPE_MAX_TIME) {
        // Determine dominant axis
        if (Math.abs(dx) > Math.abs(dy)) {
            // Horizontal swipe
            if (dx > 0) {
                queueAction('moveRight');
            } else {
                queueAction('moveLeft');
            }
        } else {
            // Vertical swipe
            if (dy < 0) {
                // Swipe up
                queueAction('jump');
            } else {
                // Swipe down
                queueAction('slide');
            }
        }
    } else if (dist <= TAP_MAX_DISTANCE) {
        // Tap = jump (alternative)
        queueAction('jump');
    }
}

// === Mobile Orientation ===
export function setupMobileOrientation() {
    if (!/Mobi|Android/i.test(navigator.userAgent)) return;

    const prompt = document.getElementById('landscapePrompt');
    if (!prompt) return;

    const check = () => {
        if (window.innerWidth < window.innerHeight) {
            prompt.style.display = 'flex';
        } else {
            prompt.style.display = 'none';
        }
    };

    window.addEventListener('resize', check);
    window.addEventListener('orientationchange', check);
    check();
}
