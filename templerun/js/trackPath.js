// Temple Run - Path-based Track System
// Based on reference game's trackPaths system

const B = window.BABYLON;

import { state, TRACK } from './config.js';
import { loadTrackPieces, createTrackPieceInstance, getRandomPiece, TRACK_PIECES } from './trackLoader.js';

let scene = null;
let trackPiecePool = null;
let trackPiecesLoaded = false;

// Track piece data with paths
const PIECE_DATA = {
    straight_a: { length: 30, paths: [[
        {x: 0, y: 0, z: 0},
        {x: 0, y: 0, z: 30}
    ]]},
    turn_left_a: { length: 20, paths: [[
        {x: 0, y: 0, z: 0},
        {x: 0, y: 0, z: 10},
        {x: -10, y: 0, z: 10},
        {x: -20, y: 0, z: 10}
    ]], sourceLastYRot: 90 },
    turn_right_a: { length: 20, paths: [[
        {x: 0, y: 0, z: 0},
        {x: 0, y: 0, z: 10},
        {x: 10, y: 0, z: 10},
        {x: 20, y: 0, z: 10}
    ]], sourceLastYRot: -90 },
};

/**
 * Initialize track system
 */
export async function initTrack(sceneRef) {
    scene = sceneRef;

    const loadedPieces = await loadTrackPieces(scene);
    if (!loadedPieces || Object.keys(loadedPieces).length === 0) {
        console.error('Failed to load track pieces');
        trackPiecesLoaded = false;
        return;
    }

    trackPiecesLoaded = true;
    console.log('Track system initialized with', Object.keys(loadedPieces).length, 'pieces');

    // Initialize state
    state.trackPieces = [];
    state.worldRotationY = 0;
    state.nextPiecePosition = new B.Vector3(0, 0, 0);

    // Generate initial pieces
    for (let i = 0; i < TRACK.VISIBLE_PIECES_AHEAD; i++) {
        generateNextPiece();
    }
}

/**
 * Generate next track piece using path-based positioning
 */
function generateNextPiece() {
    // Select piece type
    const pieceType = selectPieceType();
    const pieceData = PIECE_DATA[pieceType] || PIECE_DATA.straight_a;

    // Create mesh instance
    let piece;
    if (trackPiecesLoaded && TRACK_PIECES.STRAIGHT.includes(pieceType)) {
        piece = createTrackPieceInstance(pieceType, scene);
    } else if (trackPiecesLoaded && TRACK_PIECES.TURN.includes(pieceType)) {
        piece = createTrackPieceInstance(pieceType, scene);
    }

    if (!piece) {
        piece = createProceduralPiece(pieceType, scene);
    }

    piece.setEnabled(true);

    // Position piece at current position
    piece.position = state.nextPiecePosition.clone();
    piece.rotation.y = state.worldRotationY;

    // Store piece metadata
    piece._pieceType = pieceType;
    piece._worldRotationY = state.worldRotationY;
    piece._length = pieceData.length;
    piece._paths = generateWorldPaths(pieceData.paths[0], state.worldRotationY, state.nextPiecePosition);

    // Add to state
    state.trackPieces.push(piece);

    // Update next piece position
    const lastPathPoint = piece._paths[piece._paths.length - 1];
    state.nextPiecePosition = lastPathPoint.clone();

    // Update rotation for turns
    if (pieceData.sourceLastYRot) {
        state.worldRotationY += pieceData.sourceLastYRot * Math.PI / 180;
        state.trackAngle = state.worldRotationY;
    }
}

/**
 * Generate world coordinate paths
 */
function generateWorldPaths(localPath, rotationY, offset) {
    const worldPath = [];
    for (const point of localPath) {
        const localVec = new B.Vector3(point.x, point.y, point.z);
        // Rotate by current rotation
        const rotated = B.Vector3.TransformCoordinates(
            localVec,
            B.Matrix.RotationAxis(B.Axis.Y, rotationY)
        );
        // Add offset
        worldPath.push(rotated.add(offset));
    }
    return worldPath;
}

/**
 * Select piece type based on difficulty
 */
function selectPieceType() {
    const pieces = TRACK_PIECES.STRAIGHT;
    return pieces[Math.floor(Math.random() * pieces.length)];
}

/**
 * Create procedural fallback piece
 */
function createProceduralPiece(type, scene) {
    const root = new B.TransformNode('procedural_' + type, scene);
    const ground = B.MeshBuilder.CreateBox('ground', { width: 3, height: 0.3, depth: 30 }, scene);
    ground.position.y = -0.15;
    ground.parent = root;
    return root;
}

/**
 * Update track and check player position
 */
export function updateTrack(dt) {
    // Remove pieces behind player
    while (state.trackPieces.length > 0) {
        const firstPiece = state.trackPieces[0];
        const lastPoint = firstPiece._paths[firstPiece._paths.length - 1];

        // Check if piece is behind player
        const playerPos = new B.Vector3(
            Math.sin(state.trackAngle) * state.playerZ + state.playerX,
            state.playerY,
            Math.cos(state.trackAngle) * state.playerZ
        );

        if (lastPoint.z < playerPos.z - 50) {
            firstPiece.dispose();
            state.trackPieces.shift();
        } else {
            break;
        }
    }

    // Generate new pieces ahead
    while (state.trackPieces.length < TRACK.VISIBLE_PIECES_AHEAD) {
        generateNextPiece();
    }

    // Check if player is on track
    return checkPlayerOnTrack();
}

/**
 * Check if player is still on track (DEATH CHECK)
 */
function checkPlayerOnTrack() {
    // Calculate player world position
    const worldX = Math.sin(state.trackAngle || 0) * state.playerZ + state.playerX;
    const worldZ = Math.cos(state.trackAngle || 0) * state.playerZ;

    // Find current piece
    let currentPiece = null;
    let minDist = Infinity;

    for (const piece of state.trackPieces) {
        for (const pathPoint of piece._paths) {
            const dist = Math.sqrt(
                Math.pow(worldX - pathPoint.x, 2) +
                Math.pow(worldZ - pathPoint.z, 2)
            );
            if (dist < minDist) {
                minDist = dist;
                currentPiece = piece;
            }
        }
    }

    // Check if player is too far from track (DEATH)
    const MAX_DISTANCE_FROM_PATH = 2.0; // Maximum allowed distance

    if (minDist > MAX_DISTANCE_FROM_PATH) {
        console.log('💀 Player fell off! Distance from path:', minDist.toFixed(2));
        return { type: 'fall', obstacle: null };
    }

    return null;
}

/**
 * Reset track system
 */
export function resetTrack() {
    // Dispose all pieces
    for (const piece of state.trackPieces) {
        piece.dispose();
    }

    state.trackPieces = [];
    state.worldRotationY = 0;
    state.trackAngle = 0;
    state.nextPiecePosition = new B.Vector3(0, 0, 0);
    state.nextPieceZ = 0;

    // Generate new pieces
    for (let i = 0; i < TRACK.VISIBLE_PIECES_AHEAD; i++) {
        generateNextPiece();
    }
}

export function getTrackAngle() { return state.trackAngle || 0; }
export function areTrackPiecesLoaded() { return trackPiecesLoaded; }
