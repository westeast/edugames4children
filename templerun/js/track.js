// Temple Run - Procedural Track Generation

const B = window.BABYLON;

import { state, TRACK, OBSTACLE_TYPE } from './config.js';
import { ObjectPool, randomInt, randomFloat, weightedRandom, clamp } from './utils.js';
import { spawnObstaclesForPiece, removeObstaclesBehind, checkObstacleCollision } from './obstacles.js';
import { spawnCoinsForPiece, removeCoinsBehind, checkCoinCollection } from './coins.js';
import { spawnPowerupForPiece, removePowerupsBehind, checkPowerupCollection } from './powerups.js';

let scene = null;
let trackPiecePool = null;
let wallMeshPool = null;
let groundMaterial = null;
let wallMaterial = null;
let trackDirection = 0;     // 0=+Z, 1=+X, 2=-Z, 3=-X
let trackAngle = 0;          // Current angle in radians

// === Initialize Track System ===
export function initTrack(sceneRef) {
    scene = sceneRef;

    // Create shared materials
    groundMaterial = new B.StandardMaterial('groundMat', scene);
    const groundTex = new B.Texture('assets/textures/machu_master_a.jpg', scene);
    groundTex.uScale = 2;
    groundTex.vScale = 4;
    groundMaterial.diffuseTexture = groundTex;
    groundMaterial.specularColor = new B.Color3(0.1, 0.1, 0.1);

    // Try to load lightmap
    try {
        const lightmap = new B.Texture('assets/textures/machu_lightmaps.jpg', scene);
        groundMaterial.lightmapTexture = lightmap;
        groundMaterial.useLightmapAsShadowmap = true;
    } catch (e) { /* lightmap optional */ }

    wallMaterial = new B.StandardMaterial('wallMat', scene);
    wallMaterial.diffuseColor = new B.Color3(0.5, 0.35, 0.2); // Stone color
    wallMaterial.specularColor = new B.Color3(0.05, 0.05, 0.05);

    // Create track piece pool
    trackPiecePool = new ObjectPool(
        () => createTrackPiece(),
        (piece) => resetTrackPiece(piece),
        TRACK.VISIBLE_PIECES_AHEAD + TRACK.VISIBLE_PIECES_BEHIND + 5
    );

    // Generate initial track
    state.nextPieceZ = 0;
    state.distanceSinceLastTurn = 0;
    state.distanceSinceLastObstacle = 0;
    state.distanceSinceLastCoinRun = 0;
    state.distanceSinceLastPowerup = 0;

    for (let i = 0; i < TRACK.VISIBLE_PIECES_AHEAD; i++) {
        generateNextPiece();
    }
}

// === Create a Track Piece ===
function createTrackPiece() {
    const root = new B.TransformNode('trackPiece', scene);

    // Ground plane
    const ground = B.MeshBuilder.CreateBox('ground', {
        width: TRACK.TRACK_WIDTH,
        height: 0.3,
        depth: TRACK.PIECE_LENGTH
    }, scene);
    ground.position.y = -0.15;
    ground.parent = root;
    ground.material = groundMaterial;
    ground.receiveShadows = true;

    // Left wall
    const leftWall = B.MeshBuilder.CreateBox('leftWall', {
        width: 0.4,
        height: TRACK.WALL_HEIGHT,
        depth: TRACK.PIECE_LENGTH
    }, scene);
    leftWall.position.set(-TRACK.TRACK_WIDTH / 2 - 0.2, TRACK.WALL_HEIGHT / 2, 0);
    leftWall.parent = root;
    leftWall.material = wallMaterial;

    // Right wall
    const rightWall = B.MeshBuilder.CreateBox('rightWall', {
        width: 0.4,
        height: TRACK.WALL_HEIGHT,
        depth: TRACK.PIECE_LENGTH
    }, scene);
    rightWall.position.set(TRACK.TRACK_WIDTH / 2 + 0.2, TRACK.WALL_HEIGHT / 2, 0);
    rightWall.parent = root;
    rightWall.material = wallMaterial;

    root._ground = ground;
    root._leftWall = leftWall;
    root._rightWall = rightWall;
    root._pieceZ = 0;
    root._isTurn = false;
    root._turnDir = 0;
    root._pieceIndex = 0;

    // Make non-pickable
    ground.isPickable = false;
    leftWall.isPickable = false;
    rightWall.isPickable = false;

    return root;
}

function resetTrackPiece(piece) {
    piece.setEnabled(false);
    piece.position.set(0, 0, 0);
    piece.rotation.set(0, 0, 0);
    piece._isTurn = false;
    piece._turnDir = 0;
}

// === Generate Next Track Piece ===
function generateNextPiece() {
    const piece = trackPiecePool.acquire();
    piece.setEnabled(true);

    const pieceZ = state.nextPieceZ;
    piece._pieceZ = pieceZ;
    piece._pieceIndex = state.trackPieces.length;

    // Position piece based on current track direction
    const dirX = Math.sin(trackAngle);
    const dirZ = Math.cos(trackAngle);
    piece.position.set(dirX * pieceZ, 0, dirZ * pieceZ);
    piece.rotation.y = trackAngle;

    // Decide if this is a turn piece
    let isTurn = false;
    let turnDir = 0;

    if (state.distanceSinceLastTurn >= TRACK.MIN_DIST_BETWEEN_TURNS &&
        Math.random() < 0.3) {
        if (state.distanceSinceLastTurn >= TRACK.MAX_DIST_BETWEEN_TURNS ||
            (state.distanceSinceLastTurn >= TRACK.MIN_DIST_BETWEEN_TURNS && Math.random() < 0.4)) {
            isTurn = true;
            turnDir = Math.random() < 0.5 ? -1 : 1;
        }
    }

    piece._isTurn = isTurn;
    piece._turnDir = turnDir;

    // Add shadow casters
    const shadowGen = scene.getLightByName('sunLight')?.getShadowGenerator();
    if (shadowGen) {
        shadowGen.addShadowCaster(piece._ground);
    }

    // Spawn obstacles, coins, powerups for this piece
    spawnObstaclesForPiece(piece, scene);
    spawnCoinsForPiece(piece, scene);
    spawnPowerupForPiece(piece, scene);

    state.trackPieces.push(piece);
    state.nextPieceZ += TRACK.PIECE_LENGTH;
    state.distanceSinceLastTurn += TRACK.PIECE_LENGTH;
    state.distanceSinceLastObstacle += TRACK.PIECE_LENGTH;
    state.distanceSinceLastCoinRun += TRACK.PIECE_LENGTH;
    state.distanceSinceLastPowerup += TRACK.PIECE_LENGTH;

    // Handle turn - update track direction
    if (isTurn) {
        trackDirection = (trackDirection + (turnDir > 0 ? 1 : 3)) % 4;
        trackAngle = trackDirection * Math.PI / 2;
        state.trackAngle = trackAngle;
        state.distanceSinceLastTurn = 0;
        state.distanceSinceLastObstacle = 0;
    }
}

// === Update Track (scroll & recycle) ===
export function updateTrack(dt) {
    // Remove pieces far behind the player
    while (state.trackPieces.length > 0) {
        const firstPiece = state.trackPieces[0];
        const pieceWorldZ = firstPiece._pieceZ;
        if (pieceWorldZ < state.playerZ - TRACK.PIECE_LENGTH * (TRACK.VISIBLE_PIECES_BEHIND + 1)) {
            removeObstaclesBehind(pieceWorldZ);
            removeCoinsBehind(pieceWorldZ);
            removePowerupsBehind(pieceWorldZ);
            trackPiecePool.release(firstPiece);
            state.trackPieces.shift();
        } else {
            break;
        }
    }

    // Generate new pieces ahead
    while (state.nextPieceZ < state.playerZ + TRACK.PIECE_LENGTH * TRACK.VISIBLE_PIECES_AHEAD) {
        generateNextPiece();
    }

    // Move pieces relative to camera (visual parallax)
    for (const piece of state.trackPieces) {
        const pieceZ = piece._pieceZ;
        const relZ = pieceZ - state.playerZ;
        const dirX = Math.sin(trackAngle);
        const dirZ = Math.cos(trackAngle);
        piece.position.set(dirX * pieceZ, 0, dirZ * pieceZ);
    }

    // Check collisions
    const playerBounds = {
        x: state.playerX,
        y: state.playerY,
        z: state.playerZ,
        radius: COLLISION_RADIUS,
        height: state.isSliding ? 0.6 : 1.8,
        isJumping: state.isJumping,
        isSliding: state.isSliding,
    };

    const obstacleHit = checkObstacleCollision(playerBounds);
    if (obstacleHit) {
        return obstacleHit;
    }

    checkCoinCollection(playerBounds, state);
    checkPowerupCollection(playerBounds, state);

    return null;
}

const COLLISION_RADIUS = 0.4;

// === Reset Track ===
export function resetTrack() {
    trackDirection = 0;
    trackAngle = 0;
    state.trackAngle = 0;
    state.trackPieces = [];
    state.nextPieceZ = 0;

    if (trackPiecePool) {
        trackPiecePool.releaseAll();
    }

    removeObstaclesBehind(Infinity);
    removeCoinsBehind(Infinity);
    removePowerupsBehind(Infinity);

    // Regenerate initial pieces
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
