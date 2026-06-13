// Temple Run - Player Movement Logic

import { state, SPEED, TRACK, COLLISION, GAME_PHASE } from './config.js';
import { lerp, clamp } from './utils.js';
import { playAnimation } from './character.js';

// === Process Player Movement ===
export function updatePlayer(dt, action) {
    if (state.isDead) return;

    // === Process queued action ===
    switch (action) {
        case 'moveLeft':
            if (state.targetLane > -1) {
                state.targetLane--;
                if (state.movementState === 'running') {
                    playAnimation('turn', false);
                    setTimeout(() => playAnimation('run', true), 200);
                }
            }
            break;

        case 'moveRight':
            if (state.targetLane < 1) {
                state.targetLane++;
                if (state.movementState === 'running') {
                    playAnimation('turn', false);
                    setTimeout(() => playAnimation('run', true), 200);
                }
            }
            break;

        case 'jump':
            if (!state.isJumping && !state.isSliding) {
                state.isJumping = true;
                state.playerVelocityY = state.jumpSpeed;
                state.movementState = 'jumping';
                playAnimation('jump', false);
            }
            break;

        case 'slide':
            if (!state.isSliding && !state.isJumping) {
                state.isSliding = true;
                state.slideTimer = SPEED.SLIDE_DURATION;
                state.movementState = 'sliding';
                playAnimation('slide', false);
            }
            break;
    }

    // === Lane interpolation ===
    const targetX = state.targetLane * TRACK.LANE_WIDTH;
    const laneDiff = targetX - state.playerX;
    if (Math.abs(laneDiff) > 0.01) {
        state.playerX = lerp(state.playerX, targetX, clamp(dt * SPEED.LANE_CHANGE_SPEED, 0, 1));
    } else {
        state.playerX = targetX;
    }
    state.currentLane = state.targetLane;

    // === Check if player fell off track (outside lane boundaries) ===
    const maxLaneOffset = TRACK.LANE_WIDTH * 1.5; // Allow slight deviation
    if (Math.abs(state.playerX) > maxLaneOffset && !state.isJumping) {
        // Player fell off the track!
        console.log('Player fell off track! X:', state.playerX);
        playerHit();
        return;
    }

    // === Jump physics ===
    if (state.isJumping) {
        state.playerVelocityY += SPEED.GRAVITY * dt;
        state.playerY += state.playerVelocityY * dt;

        // Land
        if (state.playerY <= TRACK.GROUND_Y) {
            state.playerY = TRACK.GROUND_Y;
            state.playerVelocityY = 0;
            state.isJumping = false;
            state.movementState = 'running';
            playAnimation('run', true);
        }
    }

    // === Slide timer ===
    if (state.isSliding) {
        state.slideTimer -= dt;
        if (state.slideTimer <= 0) {
            state.isSliding = false;
            state.slideTimer = 0;
            state.movementState = 'running';
            playAnimation('run', true);
        }
    }

    // === Forward movement ===
    const speedMultiplier = state.boostActive ? SPEED.BOOST_MULTIPLIER : 1.0;
    const currentSpeed = state.runSpeed * speedMultiplier;
    state.playerZ += currentSpeed * dt;

    // === Speed increase ===
    if (!state.boostActive) {
        state.runSpeed = Math.min(
            SPEED.MAX_RUN_SPEED,
            state.runSpeed + SPEED.SPEED_INCREASE_RATE * dt * 1000
        );
        state.jumpSpeed = Math.min(
            SPEED.MAX_JUMP_SPEED,
            state.jumpSpeed + SPEED.JUMP_INCREASE_RATE * dt * 1000
        );
    }

    // === Update distance & score ===
    state.distance += currentSpeed * dt;
    state.score = Math.floor(state.distance * 1.0 + state.coins * 50);
    state.percentageOfMaxSpeed = state.runSpeed / SPEED.MAX_RUN_SPEED;

    // === Update difficulty ===
    state.difficultyLevel = 1 + Math.floor(state.distance / 500);

    // === Update game time ===
    state.gameTime += dt;
}

// === Player Collision Bounds ===
export function getPlayerBounds() {
    const height = state.isSliding ? COLLISION.PLAYER_SLIDE_HEIGHT : COLLISION.PLAYER_HEIGHT;
    return {
        x: state.playerX,
        y: state.playerY,
        z: state.playerZ,
        radius: COLLISION.PLAYER_RADIUS,
        height: height,
        isJumping: state.isJumping,
        isSliding: state.isSliding,
    };
}

// === Player Hit / Death ===
export function playerHit() {
    if (state.shieldActive) {
        state.shieldActive = false;
        state.shieldTimer = 0;
        return false; // Shield absorbed hit
    }

    state.isDead = true;
    state.movementState = 'death';
    playAnimation('death', false);
    return true; // Player dies
}

// === Reset Player State ===
export function resetPlayer() {
    state.currentLane = 0;
    state.targetLane = 0;
    state.playerX = 0;
    state.playerY = TRACK.GROUND_Y;
    state.playerZ = 0;
    state.playerVelocityY = 0;
    state.isJumping = false;
    state.isSliding = false;
    state.isTurning = false;
    state.isDead = false;
    state.movementState = 'running';
    state.slideTimer = 0;
    state.turnDirection = 0;
    state.turnProgress = 0;
    state.runSpeed = SPEED.DEFAULT_RUN_SPEED;
    state.jumpSpeed = SPEED.DEFAULT_JUMP_SPEED;
    state.distance = 0;
    state.score = 0;
    state.coins = 0;
    state.gameTime = 0;
    state.difficultyLevel = 1;
    state.percentageOfMaxSpeed = 0;
    state.shieldActive = false;
    state.boostActive = false;
    state.magnetActive = false;
    state.shieldTimer = 0;
    state.boostTimer = 0;
    state.magnetTimer = 0;
    state.chaserDistance = 30;

    playAnimation('run', true);
}
