// Temple Run - Obstacle System

const B = window.BABYLON;

import { TRACK, OBSTACLE_TYPE, COLLISION, state } from './config.js';
import { randomInt, randomFloat, weightedRandom, ObjectPool } from './utils.js';

let scene = null;
let obstaclePool = null;
let obstacleMaterial = null;
let lowObstacleMaterial = null;
let highObstacleMaterial = null;

// === Initialize Obstacle System ===
export function initObstacles(sceneRef) {
    scene = sceneRef;

    // Materials
    obstacleMaterial = new B.StandardMaterial('obstacleMat', scene);
    obstacleMaterial.diffuseColor = new B.Color3(0.55, 0.35, 0.2); // Wood/stone
    obstacleMaterial.specularColor = new B.Color3(0.1, 0.1, 0.1);

    lowObstacleMaterial = new B.StandardMaterial('lowObstacleMat', scene);
    lowObstacleMaterial.diffuseColor = new B.Color3(0.6, 0.4, 0.2);
    lowObstacleMaterial.specularColor = new B.Color3(0.1, 0.1, 0.1);

    highObstacleMaterial = new B.StandardMaterial('highObstacleMat', scene);
    highObstacleMaterial.diffuseColor = new B.Color3(0.5, 0.3, 0.15);
    highObstacleMaterial.specularColor = new B.Color3(0.1, 0.1, 0.1);

    // Obstacle pool
    obstaclePool = new ObjectPool(
        () => createObstacle(),
        (obs) => resetObstacle(obs),
        30
    );
}

// === Create an Obstacle Mesh ===
function createObstacle() {
    const root = new B.TransformNode('obstacleRoot', scene);
    root._mesh = null;
    root._type = null;
    root._lane = 0;
    root._worldZ = 0;
    root._height = 0;
    root._width = 0;
    root._depth = 0;
    root._yOffset = 0;
    root.setEnabled(false);
    return root;
}

function resetObstacle(obs) {
    obs.setEnabled(false);
    if (obs._mesh) {
        obs._mesh.dispose();
        obs._mesh = null;
    }
    obs._type = null;
}

// === Spawn Obstacles for a Track Piece ===
export function spawnObstaclesForPiece(piece, sceneRef) {
    if (!scene) initObstacles(sceneRef);

    const pieceZ = piece._pieceZ;

    // Check if we should spawn obstacles
    if (state.distanceSinceLastObstacle < TRACK.MIN_DIST_BETWEEN_OBSTACLES) return;
    if (state.distanceSinceLastObstacle < TRACK.MIN_DIST_AFTER_TURN_FOR_OBSTACLE &&
        state.distanceSinceLastTurn < TRACK.PIECE_LENGTH * 2) return;

    // Random chance based on difficulty - higher chance for more action
    const spawnChance = Math.min(0.85, 0.4 + state.difficultyLevel * 0.07);
    if (Math.random() > spawnChance) return;

    // Max consecutive obstacles check
    if (state.consecutiveObstacles >= TRACK.MAX_BACK_TO_BACK_OBSTACLES) {
        state.consecutiveObstacles = 0;
        return;
    }

    // Decide obstacle type based on difficulty
    const types = [OBSTACLE_TYPE.JUMP_OVER, OBSTACLE_TYPE.SLIDE_UNDER, OBSTACLE_TYPE.LANE_BLOCK];
    const weights = [0.35, 0.25, 0.4];

    // Add turn obstacles if we haven't turned in a while
    if (state.distanceSinceLastTurn >= TRACK.MIN_DIST_BETWEEN_TURNS) {
        types.push(OBSTACLE_TYPE.TURN_LEFT, OBSTACLE_TYPE.TURN_RIGHT);
        weights.push(0.15, 0.15);
    }

    const type = weightedRandom(types, weights);

    // Decide which lane(s) to block
    const lanes = [-1, 0, 1];
    const blockLane = lanes[randomInt(0, 2)];

    // Maybe double obstacle
    let secondLane = null;
    if (type === OBSTACLE_TYPE.LANE_BLOCK && state.difficultyLevel >= 3 &&
        Math.random() < TRACK.DOUBLE_OBSTACLE_PERCENT) {
        const remaining = lanes.filter(l => l !== blockLane);
        secondLane = remaining[randomInt(0, remaining.length - 1)];
    }

    // Create obstacle(s)
    createObstacleAt(type, blockLane, pieceZ);
    if (secondLane !== null) {
        createObstacleAt(type, secondLane, pieceZ);
    }

    state.consecutiveObstacles++;
    state.distanceSinceLastObstacle = 0;
}

function createObstacleAt(type, lane, worldZ) {
    const obs = obstaclePool.acquire();
    obs.setEnabled(true);

    const dirX = Math.sin(state.trackAngle || 0);
    const dirZ = Math.cos(state.trackAngle || 0);

    obs._type = type;
    obs._lane = lane;
    obs._worldZ = worldZ;

    let mesh;
    switch (type) {
        case OBSTACLE_TYPE.JUMP_OVER: {
            // Low barrier across ALL lanes
            mesh = B.MeshBuilder.CreateBox('jumpObstacle', {
                width: TRACK.TRACK_WIDTH * 0.95,
                height: 0.8,
                depth: 0.3
            }, scene);
            mesh.position.y = 0.4;
            mesh.material = lowObstacleMaterial;
            obs._height = 0.8;
            obs._yOffset = 0;
            break;
        }
        case OBSTACLE_TYPE.SLIDE_UNDER: {
            // Overhead barrier across ALL lanes
            mesh = B.MeshBuilder.CreateBox('slideObstacle', {
                width: TRACK.TRACK_WIDTH * 0.95,
                height: 0.5,
                depth: 0.3
            }, scene);
            mesh.position.y = 1.5;
            mesh.material = highObstacleMaterial;
            obs._height = 0.5;
            obs._yOffset = 1.25;
            break;
        }
        case OBSTACLE_TYPE.LANE_BLOCK: {
            // Full-height block
            mesh = B.MeshBuilder.CreateBox('blockObstacle', {
                width: TRACK.LANE_WIDTH * 0.8,
                height: 2.5,
                depth: 0.4
            }, scene);
            mesh.position.y = 1.25;
            mesh.material = obstacleMaterial;
            obs._height = 2.5;
            obs._yOffset = 0;
            break;
        }
        case OBSTACLE_TYPE.TURN_LEFT:
        case OBSTACLE_TYPE.TURN_RIGHT: {
            // Turn indicator - a column
            mesh = B.MeshBuilder.CreateCylinder('turnObstacle', {
                height: 3,
                diameter: 0.5
            }, scene);
            mesh.position.y = 1.5;
            mesh.material = obstacleMaterial;
            obs._height = 3;
            obs._yOffset = 0;
            break;
        }
    }

    if (mesh) {
        mesh.isPickable = false;
        mesh.parent = obs;
        obs._mesh = mesh;
    }

    // Position in world
    const laneX = lane * TRACK.LANE_WIDTH;
    obs.position.set(
        dirX * worldZ + laneX,
        0,
        dirZ * worldZ
    );
    obs.rotation.y = state.trackAngle || 0;

    state.activeObstacles.push(obs);
}

// === Check Obstacle Collision ===
export function checkObstacleCollision(playerBounds) {
    for (const obs of state.activeObstacles) {
        if (!obs._mesh || !obs.isEnabled()) continue;

        const obsLane = obs._lane;
        const playerLane = Math.round(state.playerX / TRACK.LANE_WIDTH);
        const laneDist = Math.abs(state.playerX - obsLane * TRACK.LANE_WIDTH);

        // Z distance check
        const zDist = Math.abs(obs._worldZ - state.playerZ);
        if (zDist > 1.0) continue; // Too far along track

        // X distance check - JUMP_OVER and SLIDE_UNDER span all lanes
        if (obs._type !== OBSTACLE_TYPE.JUMP_OVER && obs._type !== OBSTACLE_TYPE.SLIDE_UNDER) {
            if (laneDist > TRACK.LANE_WIDTH * 0.7) continue; // Different lane
        }

        // Type-specific collision
        switch (obs._type) {
            case OBSTACLE_TYPE.JUMP_OVER:
                // Player must be jumping to avoid
                if (!playerBounds.isJumping && zDist < 0.4) {
                    return { type: obs._type, obstacle: obs };
                }
                break;

            case OBSTACLE_TYPE.SLIDE_UNDER:
                // Player must be sliding to avoid
                if (!playerBounds.isSliding && zDist < 0.4) {
                    return { type: obs._type, obstacle: obs };
                }
                break;

            case OBSTACLE_TYPE.LANE_BLOCK:
                // Player must be in different lane
                if (laneDist < COLLISION.PLAYER_RADIUS + 0.3 && zDist < 0.4) {
                    return { type: obs._type, obstacle: obs };
                }
                break;

            case OBSTACLE_TYPE.TURN_LEFT:
            case OBSTACLE_TYPE.TURN_RIGHT:
                // These block the path if player doesn't turn
                if (zDist < 0.5) {
                    return { type: obs._type, obstacle: obs };
                }
                break;
        }
    }

    return null;
}

// === Remove Obstacles Behind ===
export function removeObstaclesBehind(zThreshold) {
    const toRemove = state.activeObstacles.filter(obs => obs._worldZ < zThreshold - TRACK.PIECE_LENGTH * 2);
    for (const obs of toRemove) {
        const idx = state.activeObstacles.indexOf(obs);
        if (idx !== -1) {
            state.activeObstacles.splice(idx, 1);
        }
        obstaclePool.release(obs);
    }
}

// === Remove a Specific Obstacle ===
export function removeObstacle(obs) {
    const idx = state.activeObstacles.indexOf(obs);
    if (idx !== -1) {
        state.activeObstacles.splice(idx, 1);
    }
    obstaclePool.release(obs);
}
