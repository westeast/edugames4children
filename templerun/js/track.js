// Temple Run - Track Generation using Real GLB Models

const B = window.BABYLON;

import { state, TRACK } from './config.js';
import { ObjectPool, randomInt, weightedRandom } from './utils.js';
import { loadTrackPieces, createTrackPieceInstance, getRandomPiece, TRACK_PIECES, hasPiece } from './trackLoader.js';
import { spawnCoinsForPiece, removeCoinsBehind, checkCoinCollection } from './coins.js';
import { spawnPowerupForPiece, removePowerupsBehind, checkPowerupCollection } from './powerups.js';
import { TRACK_PIECE_DATA } from './trackData.js';

let scene = null;
let trackPiecePool = null;
let trackPiecesLoaded = false;

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
    state._accumulatedDist = 0;
    state.nextPiecePosition = new B.Vector3(0, 0, 0); // First piece starts at origin
    state.worldRotationY = 0;
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
 * Generate next track piece using path-based placement for continuous tracks
 */
function generateNextPiece() {
    // Select piece type
    const pieceType = selectPieceType();

    // Create instances (uses real GLB mesh) — returns { root, instances: Mesh[] }
    let result;
    if (trackPiecesLoaded && hasPiece(pieceType)) {
        result = createTrackPieceInstance(pieceType, scene);
    } else {
        const fallbackRoot = createProceduralFallback(scene);
        result = { root: fallbackRoot, instances: [] };
    }

    if (!result) {
        const fallbackRoot = createProceduralFallback(scene);
        result = { root: fallbackRoot, instances: [] };
    }

    const piece = result.root;
    const instances = result.instances || [];

    // Enable all instances
    for (const inst of instances) {
        inst.setEnabled(true);
    }

    // Get path data for this piece type
    const data = TRACK_PIECE_DATA[pieceType];
    let pieceLength;

    if (data) {
        pieceLength = data.len;

        // Position and rotate each instance directly at world coordinates
        for (const inst of instances) {
            inst.position.set(state.nextPiecePosition.x, 0, state.nextPiecePosition.z);
            const pieceRotRad = data.rot * Math.PI / 180;
            inst.rotation.y = state.worldRotationY + pieceRotRad;
        }

        // Update anchor for next piece: last point of this piece's path, rotated by cumulative rotation
        const lastPt = data.pts[data.pts.length - 1];
        const cosR = Math.cos(state.worldRotationY);
        const sinR = Math.sin(state.worldRotationY);
        state.nextPiecePosition = new B.Vector3(
            state.nextPiecePosition.x + cosR * (-lastPt[0]) + sinR * (-lastPt[1]),
            0,
            state.nextPiecePosition.z - sinR * (-lastPt[0]) + cosR * (-lastPt[1])
        );

        // Update cumulative rotation (convert degrees to radians)
        state.worldRotationY += data.rot * Math.PI / 180;
        state.trackAngle = state.worldRotationY; // Keep alias in sync for existing code
    } else {
        // Fallback for pieces without path data
        pieceLength = PIECE_LENGTHS[pieceType] || PIECE_LENGTHS.default;

        if (!state.nextPiecePosition) {
            state.nextPiecePosition = new B.Vector3(0, 0, -pieceLength);
        } else {
            state.nextPiecePosition.z -= pieceLength;
        }

        // Position and rotate fallback instances too
        for (const inst of instances) {
            inst.position.set(state.nextPiecePosition.x, 0, state.nextPiecePosition.z + pieceLength);
            inst.rotation.y = state.worldRotationY;
        }
    }

    // Store metadata for collision detection and recycling
    piece._pieceType = pieceType;
    piece._pieceLength = pieceLength;
    piece._trackAngle = state.worldRotationY;

    // Track accumulated distance along path (used as "Z" for recycling/collision)
    if (!state._accumulatedDist) state._accumulatedDist = 0;
    piece._pieceZ = state._accumulatedDist;
    state._accumulatedDist += pieceLength;

    // Store world position from the first instance (instances have independent transforms,
    // so we read their actual world coordinates for camera/chaser lookup).
    if (instances.length > 0) {
        const inst = instances[0];
        piece._worldPos = new B.Vector3(inst.position.x, inst.position.y, inst.position.z);
    } else {
        piece._worldPos = new B.Vector3(state.nextPiecePosition.x, 0, state.nextPiecePosition.z);
    }

    // Update distance counters along the path
    const traveledDist = data ? data.len : pieceLength;
    state.distanceSinceLastTurn += traveledDist;
    state.distanceSinceLastObstacle += traveledDist;
    state.distanceSinceLastCoinRun += traveledDist;
    state.distanceSinceLastPowerup += traveledDist;

    // Spawn coins and powerups
    spawnCoinsForPiece(piece, scene);
    spawnPowerupForPiece(piece, scene);

    state.trackPieces.push(piece);
}

/**
 * Update track - recycle old pieces, generate new ones
 */
export function updateTrack(dt) {
    // Remove pieces behind player (pieceZ is accumulated distance from start)
    while (state.trackPieces.length > 0) {
        const firstPiece = state.trackPieces[0];
        const pieceDist = firstPiece._pieceZ;

        if (pieceDist < state.playerZ - TRACK.PIECE_LENGTH * (TRACK.VISIBLE_PIECES_BEHIND + 1)) {
            removeCoinsBehind(pieceDist);
            removePowerupsBehind(pieceDist);

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

    // Generate new pieces ahead (use accumulated distance instead of nextPieceZ)
    const targetDist = state._accumulatedDist + TRACK.PIECE_LENGTH * TRACK.VISIBLE_PIECES_AHEAD;
    while (state._accumulatedDist < targetDist) {
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
    state.nextPiecePosition = new B.Vector3(0, 0, 0);
    state.worldRotationY = 0;
    state._accumulatedDist = 0;

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

export function getTrackAngle() { return state.worldRotationY; }
export function areTrackPiecesLoaded() { return trackPiecesLoaded; }

/**
 * Get world position at a given accumulated distance along the track.
 * Used by engine.js (camera) and chaser.js for coordinate conversion.
 */
export function getWorldPositionAt(dist) {
    // Find the piece covering this distance
    for (const piece of state.trackPieces) {
        const pDist = piece._pieceZ;
        const pLen = piece._pieceLength || TRACK.PIECE_LENGTH;
        if (dist >= pDist && dist < pDist + pLen) {
            // Interpolate between this piece's position and the next
            const t = (dist - pDist) / pLen;
            const nextPiece = state.trackPieces[state.trackPieces.indexOf(piece) + 1];
            if (nextPiece && nextPiece._worldPos) {
                return new B.Vector3(
                    piece._worldPos.x + (nextPiece._worldPos.x - piece._worldPos.x) * t,
                    0,
                    piece._worldPos.z + (nextPiece._worldPos.z - piece._worldPos.z) * t
                );
            }
            return new B.Vector3(piece._worldPos.x, 0, piece._worldPos.z);
        }
    }
    // Fallback: use the last known position
    const last = state.trackPieces[state.trackPieces.length - 1];
    if (last && last._worldPos) {
        return new B.Vector3(last._worldPos.x, 0, last._worldPos.z);
    }
    return new B.Vector3(0, 0, 0);
}

/**
 * Get world direction (heading) at a given accumulated distance.
 */
export function getWorldHeadingAt(dist) {
    for (const piece of state.trackPieces) {
        const pDist = piece._pieceZ;
        const pLen = piece._pieceLength || TRACK.PIECE_LENGTH;
        if (dist >= pDist && dist < pDist + pLen) {
            return piece._trackAngle || 0;
        }
    }
    return state.worldRotationY || 0;
}