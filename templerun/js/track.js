// Temple Run - Track Generation using Real GLB Models

const B = window.BABYLON;

import { state, TRACK } from './config.js';
import { ObjectPool, randomInt, weightedRandom } from './utils.js';
import { loadTrackPieces, createTrackPieceInstance, getRandomPiece, TRACK_PIECES, hasPiece } from './trackLoader.js';
import { spawnCoinsForPiece, removeCoinsBehind, checkCoinCollection } from './coins.js';
import { spawnPowerupForPiece, removePowerupsBehind, checkPowerupCollection } from './powerups.js';

let scene = null;
let trackPiecePool = null;
let trackPiecesLoaded = false;
let trackDirection = 0;
let trackAngle = 0;

// Piece selection weights based on difficulty
const PIECE_WEIGHTS = {
    easy: {
        straight: 10,
        curve: 3,
        turn: 1,
        jump: 2,
        slide: 1,
        hill: 1,
    },
    medium: {
        straight: 8,
        curve: 4,
        turn: 2,
        jump: 3,
        slide: 2,
        hill: 2,
        gap: 1,
        bridge: 1,
    },
    hard: {
        straight: 6,
        curve: 5,
        turn: 3,
        jump: 4,
        slide: 3,
        hill: 2,
        gap: 2,
        bridge: 2,
        ledge: 1,
        zipline: 1,
    }
};

// Track piece lengths (approximate, from GLB bounds)
const PIECE_LENGTHS = {
    straight_a: 30,
    straight_b: 30,
    straight_c: 30,
    turn_left_a: 20,
    turn_right_a: 20,
    curve_a: 25,
    jump_over_a: 30,
    slide_under_a: 30,
    // Default for unknown pieces
    default: 30,
};

/**
 * Initialize track system - load GLB models first
 */
export async function initTrack(sceneRef) {
    scene = sceneRef;

    // Load real track pieces from GLB
    const loadedPieces = await loadTrackPieces(scene);
    if (!loadedPieces || Object.keys(loadedPieces).length === 0) {
        console.error('Failed to load track pieces, falling back to procedural');
        trackPiecesLoaded = false;
        return;
    }

    trackPiecesLoaded = true;
    console.log('Track system initialized with', Object.keys(loadedPieces).length, 'real pieces');

    // Create pool for track piece instances
    trackPiecePool = new ObjectPool(
        () => createProceduralFallback(scene), // Fallback if needed
        (piece) => resetPiece(piece),
        TRACK.VISIBLE_PIECES_AHEAD + TRACK.VISIBLE_PIECES_BEHIND + 5
    );

    // Initialize track state
    state.nextPieceZ = 0;
    state.distanceSinceLastTurn = 0;
    state.distanceSinceLastObstacle = 0;
    state.distanceSinceLastCoinRun = 0;
    state.distanceSinceLastPowerup = 0;

    // Generate initial pieces
    for (let i = 0; i < TRACK.VISIBLE_PIECES_AHEAD; i++) {
        generateNextPiece();
    }
}

/**
 * Select a track piece based on difficulty and constraints
 */
function selectPieceType() {
    const difficulty = state.difficultyLevel <= 2 ? 'easy' :
                       state.difficultyLevel <= 5 ? 'medium' : 'hard';
    const weights = PIECE_WEIGHTS[difficulty];

    // Check constraints
    const canTurn = state.distanceSinceLastTurn >= TRACK.MIN_DIST_BETWEEN_TURNS;
    const mustTurn = state.distanceSinceLastTurn >= TRACK.MAX_DIST_BETWEEN_TURNS;

    // Build available pieces and weights
    const available = [];
    const weightList = [];

    // Always include straight pieces
    for (const piece of TRACK_PIECES.STRAIGHT) {
        if (hasPiece(piece)) {
            available.push(piece);
            weightList.push(weights.straight || 5);
        }
    }

    // Add turns if allowed
    if (canTurn) {
        for (const piece of TRACK_PIECES.TURN) {
            if (hasPiece(piece)) {
                available.push(piece);
                weightList.push(weights.turn || 1);
            }
        }
    }

    // Force turn if must turn
    if (mustTurn && hasPiece('turn_left_a') && hasPiece('turn_right_a')) {
        // High probability of turn
        available.push('turn_left_a', 'turn_right_a');
        weightList.push(10, 10);
    }

    // Add obstacle pieces based on distance since last obstacle
    if (state.distanceSinceLastObstacle >= TRACK.MIN_DIST_BETWEEN_OBSTACLES) {
        for (const piece of TRACK_PIECES.JUMP) {
            if (hasPiece(piece)) {
                available.push(piece);
                weightList.push(weights.jump || 2);
            }
        }
        for (const piece of TRACK_PIECES.SLIDE) {
            if (hasPiece(piece)) {
                available.push(piece);
                weightList.push(weights.slide || 1);
            }
        }
    }

    // Select weighted random
    if (available.length === 0) {
        return 'straight_a'; // Safe fallback
    }

    return weightedRandom(available, weightList);
}

/**
 * Generate next track piece
 */
function generateNextPiece() {
    // Select piece type
    const pieceType = selectPieceType();
    const pieceLength = PIECE_LENGTHS[pieceType] || PIECE_LENGTHS.default;

    // Create instance
    let piece;
    if (trackPiecesLoaded && hasPiece(pieceType)) {
        piece = createTrackPieceInstance(pieceType, scene);
    } else {
        piece = createProceduralFallback(scene);
    }

    if (!piece) {
        piece = createProceduralFallback(scene);
    }

    piece.setEnabled(true);

    // Get piece Z position
    const pieceZ = state.nextPieceZ;

    // Use current track angle for positioning
    const currentAngle = trackAngle;
    const dirX = Math.sin(currentAngle);
    const dirZ = Math.cos(currentAngle);

    // Position piece
    piece.position.set(dirX * pieceZ, 0, dirZ * pieceZ);
    piece.rotation.y = currentAngle;

    piece._pieceZ = pieceZ;
    piece._pieceType = pieceType;
    piece._pieceLength = pieceLength;
    piece._trackAngle = currentAngle; // Store angle at creation time

    // Handle turn pieces - update direction AFTER positioning
    if (pieceType === 'turn_left_a' || pieceType === 'turn_right_a') {
        // Turn pieces: update track direction for NEXT piece
        if (pieceType === 'turn_left_a') {
            trackDirection = (trackDirection + 3) % 4; // Turn left (-90°)
        } else {
            trackDirection = (trackDirection + 1) % 4; // Turn right (+90°)
        }
        trackAngle = trackDirection * Math.PI / 2;
        state.trackAngle = trackAngle;
        state.distanceSinceLastTurn = 0;
        state.distanceSinceLastObstacle = 0;
    }

    // Spawn coins and powerups
    spawnCoinsForPiece(piece, scene);
    spawnPowerupForPiece(piece, scene);

    state.trackPieces.push(piece);
    state.nextPieceZ += pieceLength;
    state.distanceSinceLastTurn += pieceLength;
    state.distanceSinceLastObstacle += pieceLength;
    state.distanceSinceLastCoinRun += pieceLength;
    state.distanceSinceLastPowerup += pieceLength;
}

/**
 * Update track - recycle old pieces, generate new ones
 */
export function updateTrack(dt) {
    // Remove pieces behind player
    while (state.trackPieces.length > 0) {
        const firstPiece = state.trackPieces[0];
        const pieceZ = firstPiece._pieceZ;
        const pieceLength = firstPiece._pieceLength || TRACK.PIECE_LENGTH;

        if (pieceZ < state.playerZ - pieceLength * (TRACK.VISIBLE_PIECES_BEHIND + 1)) {
            removeCoinsBehind(pieceZ);
            removePowerupsBehind(pieceZ);

            // Dispose instances
            if (firstPiece._instances) {
                for (const inst of firstPiece._instances) {
                    inst.dispose();
                }
            }
            firstPiece.dispose();

            state.trackPieces.shift();
        } else {
            break;
        }
    }

    // Generate new pieces ahead
    while (state.nextPieceZ < state.playerZ + TRACK.PIECE_LENGTH * TRACK.VISIBLE_PIECES_AHEAD) {
        generateNextPiece();
    }

    // Check coin/powerup collection
    const playerBounds = {
        x: state.playerX,
        y: state.playerY,
        z: state.playerZ,
        radius: 0.4,
        height: state.isSliding ? 0.6 : 1.8,
        isJumping: state.isJumping,
        isSliding: state.isSliding,
    };

    checkCoinCollection(playerBounds, state);
    checkPowerupCollection(playerBounds, state);

    // Obstacle collision is handled by track piece selection now
    // Pieces like jump_over_a require jumping, slide_under_a require sliding
    const currentPieceType = getCurrentPieceType(state.playerZ);
    const obstacleCollision = checkPieceObstacleCollision(currentPieceType, playerBounds);

    return obstacleCollision;
}

/**
 * Get current piece type based on player position
 */
function getCurrentPieceType(playerZ) {
    for (const piece of state.trackPieces) {
        const pieceZ = piece._pieceZ;
        const pieceLength = piece._pieceLength || TRACK.PIECE_LENGTH;
        if (playerZ >= pieceZ && playerZ < pieceZ + pieceLength) {
            return piece._pieceType || 'straight_a';
        }
    }
    return 'straight_a';
}

/**
 * Check collision based on piece type
 */
function checkPieceObstacleCollision(pieceType, playerBounds) {
    // TURN PIECES: Check if player made the turn correctly
    if (TRACK_PIECES.TURN.includes(pieceType)) {
        // Player must be in center lane when entering turn
        // Or they must have moved to correct lane
        const piece = state.trackPieces.find(p => p._pieceType === pieceType);
        if (piece) {
            const pieceAngle = piece._trackAngle || 0;
            const currentAngle = state.trackAngle || 0;

            // If angles match, turn was successful
            if (pieceAngle !== currentAngle) {
                // Turn NOT made - player continues in wrong direction
                // This means they missed the turn and will fall!
                console.log('💀 Missed turn! Piece angle:', pieceAngle, 'Current angle:', currentAngle);
                return { type: 'fall', obstacle: null };
            }
        }
    }

    // Jump pieces require jumping
    if (TRACK_PIECES.JUMP.includes(pieceType)) {
        if (!playerBounds.isJumping) {
            return { type: 'jumpOver', obstacle: null };
        }
    }

    // Slide pieces require sliding
    if (TRACK_PIECES.SLIDE.includes(pieceType)) {
        if (!playerBounds.isSliding) {
            return { type: 'slideUnder', obstacle: null };
        }
    }

    // Gap pieces - player falls if not jumping
    if (TRACK_PIECES.GAP.includes(pieceType)) {
        if (!playerBounds.isJumping && playerBounds.y <= 0) {
            return { type: 'fall', obstacle: null };
        }
    }

    return null;
}

/**
 * Procedural fallback piece (when GLB fails)
 */
function createProceduralFallback(scene) {
    const root = new B.TransformNode('fallbackPiece', scene);

    // Simple ground
    const ground = B.MeshBuilder.CreateBox('ground', {
        width: 3,
        height: 0.3,
        depth: 30
    }, scene);
    ground.position.y = -0.15;
    ground.parent = root;

    // Walls
    const leftWall = B.MeshBuilder.CreateBox('leftWall', { width: 0.4, height: 3, depth: 30 }, scene);
    leftWall.position.set(-1.7, 1.5, 0);
    leftWall.parent = root;

    const rightWall = B.MeshBuilder.CreateBox('rightWall', { width: 0.4, height: 3, depth: 30 }, scene);
    rightWall.position.set(1.7, 1.5, 0);
    rightWall.parent = root;

    root._pieceLength = 30;
    root._pieceType = 'straight_a';

    return root;
}

/**
 * Reset piece
 */
function resetPiece(piece) {
    piece.setEnabled(false);
}

/**
 * Reset entire track
 */
export function resetTrack() {
    trackDirection = 0;
    trackAngle = 0;
    state.trackAngle = 0;

    // Dispose all pieces
    for (const piece of state.trackPieces) {
        if (piece._instances) {
            for (const inst of piece._instances) {
                inst.dispose();
            }
        }
        piece.dispose();
    }

    state.trackPieces = [];
    state.nextPieceZ = 0;

    removeCoinsBehind(Infinity);
    removePowerupsBehind(Infinity);

    state.distanceSinceLastTurn = 0;
    state.distanceSinceLastObstacle = 0;
    state.distanceSinceLastCoinRun = 0;
    state.distanceSinceLastPowerup = 0;

    for (let i = 0; i < TRACK.VISIBLE_PIECES_AHEAD; i++) {
        generateNextPiece();
    }
}

export function getTrackAngle() { return trackAngle; }
export function getTrackDirection() { return trackDirection; }
export function areTrackPiecesLoaded() { return trackPiecesLoaded; }