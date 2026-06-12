// Temple Run - Power-up System with Real GLB Models

const B = window.BABYLON;

import { TRACK, POWERUP, POWERUP_TYPE, state } from './config.js';
import { ObjectPool, weightedRandom } from './utils.js';

let scene = null;
let powerupPool = null;
let powerupTemplates = {};
let powerupMaterials = {};

// GLB model paths
const POWERUP_MODELS = {
    [POWERUP_TYPE.SHIELD]: 'assets/objects/pickups/pickupShield.glb',
    [POWERUP_TYPE.BOOST]: 'assets/objects/pickups/pickupBoost.glb',
    [POWERUP_TYPE.MAGNET]: 'assets/objects/pickups/pickupVacuum.glb',
};

// === Load Power-up GLB Models ===
export async function loadPowerupModels(sceneRef) {
    scene = sceneRef;

    for (const [type, path] of Object.entries(POWERUP_MODELS)) {
        try {
            console.log('Loading powerup model:', path);
            const result = await B.SceneLoader.ImportMeshAsync(
                null,
                '',
                path,
                scene
            );

            if (result.meshes.length > 0) {
                // Store template mesh
                const templateMesh = result.meshes[0];
                templateMesh.setEnabled(false);
                templateMesh.isPickable = false;

                powerupTemplates[type] = {
                    meshes: result.meshes,
                    skeleton: result.skeletons?.[0],
                    animationGroups: result.animationGroups,
                };

                console.log('  Loaded', result.meshes.length, 'meshes for', type);
            }
        } catch (e) {
            console.warn('Failed to load powerup GLB:', path, e.message);
            // Fallback to procedural
            powerupTemplates[type] = null;
        }
    }

    // Create fallback materials if GLB loading failed
    if (!powerupTemplates[POWERUP_TYPE.SHIELD]) {
        createFallbackMaterials();
    }

    // Power-up pool
    powerupPool = new ObjectPool(
        () => createPowerupFallback(),
        (pu) => resetPowerup(pu),
        10
    );
}

function createFallbackMaterials() {
    powerupMaterials[POWERUP_TYPE.SHIELD] = new B.StandardMaterial('shieldMat', scene);
    powerupMaterials[POWERUP_TYPE.SHIELD].diffuseColor = new B.Color3(0.2, 0.6, 1.0);
    powerupMaterials[POWERUP_TYPE.SHIELD].emissiveColor = new B.Color3(0.1, 0.3, 0.5);

    powerupMaterials[POWERUP_TYPE.BOOST] = new B.StandardMaterial('boostMat', scene);
    powerupMaterials[POWERUP_TYPE.BOOST].diffuseColor = new B.Color3(1.0, 0.3, 0.0);
    powerupMaterials[POWERUP_TYPE.BOOST].emissiveColor = new B.Color3(0.5, 0.15, 0.0);

    powerupMaterials[POWERUP_TYPE.MAGNET] = new B.StandardMaterial('magnetMat', scene);
    powerupMaterials[POWERUP_TYPE.MAGNET].diffuseColor = new B.Color3(0.8, 0.0, 0.8);
    powerupMaterials[POWERUP_TYPE.MAGNET].emissiveColor = new B.Color3(0.4, 0.0, 0.4);
}

function createPowerupFallback() {
    const root = new B.TransformNode('powerupRoot', scene);
    const mesh = B.MeshBuilder.CreatePolyhedron('powerupMesh', { type: 1, size: 0.3 }, scene);
    mesh.parent = root;
    mesh.isPickable = false;
    mesh.position.y = 1.0;

    root._mesh = mesh;
    root._type = null;
    root._worldZ = 0;
    root._worldX = 0;
    root._collected = false;
    root.setEnabled(false);

    return root;
}

function resetPowerup(pu) {
    pu.setEnabled(false);
    pu._collected = false;
    pu._type = null;

    // Dispose instances if using GLB
    if (pu._instances) {
        for (const inst of pu._instances) {
            inst.dispose();
        }
        pu._instances = null;
    }
}

// === Initialize Power-up System (Legacy) ===
export function initPowerups(sceneRef) {
    scene = sceneRef;
    createFallbackMaterials();

    powerupPool = new ObjectPool(
        () => createPowerupFallback(),
        (pu) => resetPowerup(pu),
        10
    );
}

// === Spawn Power-up for a Track Piece ===
export function spawnPowerupForPiece(piece, sceneRef) {
    if (!scene) {
        scene = sceneRef;
        if (!powerupPool) {
            powerupPool = new ObjectPool(
                () => createPowerupFallback(),
                (pu) => resetPowerup(pu),
                10
            );
        }
    }
    if (!powerupPool) return;

    // Check distance requirement
    if (state.distanceSinceLastPowerup < POWERUP.SPAWN_MIN_DISTANCE) return;

    // Random chance
    if (Math.random() > 0.15) return;

    // Decide power-up type
    const types = [POWERUP_TYPE.BOOST, POWERUP_TYPE.SHIELD, POWERUP_TYPE.MAGNET];
    const weights = [POWERUP.BOOST_PROBABILITY, POWERUP.SHIELD_PROBABILITY, POWERUP.MAGNET_PROBABILITY];
    const type = weightedRandom(types, weights);

    const pu = powerupPool.acquire();
    pu.setEnabled(true);
    pu._type = type;
    pu._collected = false;

    const lane = Math.floor(Math.random() * 3) - 1;
    const pieceLength = piece._pieceLength || TRACK.PIECE_LENGTH;
    const worldZ = piece._pieceZ + pieceLength / 2;
    const worldX = lane * TRACK.LANE_WIDTH;

    const dirX = Math.sin(state.trackAngle || 0);
    const dirZ = Math.cos(state.trackAngle || 0);

    pu.position.set(
        dirX * worldZ + worldX,
        0,
        dirZ * worldZ
    );
    pu.rotation.y = state.trackAngle || 0;

    pu._worldZ = worldZ;
    pu._worldX = worldX;

    // Use GLB model if available
    if (powerupTemplates[type] && powerupTemplates[type].meshes) {
        pu._mesh = null; // Clear fallback mesh

        pu._instances = [];
        for (const templateMesh of powerupTemplates[type].meshes) {
            const instance = templateMesh.createInstance(templateMesh.name + '_inst');
            instance.parent = pu;
            instance.isPickable = false;
            pu._instances.push(instance);
        }

        // Start animations if available
        if (powerupTemplates[type].animationGroups) {
            for (const anim of powerupTemplates[type].animationGroups) {
                anim.start(true); // Loop
            }
        }
    } else {
        // Use fallback mesh with colored material
        if (pu._mesh && powerupMaterials[type]) {
            pu._mesh.material = powerupMaterials[type];
        }
    }

    state.activePowerups.push(pu);
    state.distanceSinceLastPowerup = 0;
}

// === Check Power-up Collection ===
export function checkPowerupCollection(playerBounds, gameState) {
    for (const pu of state.activePowerups) {
        if (!pu.isEnabled() || pu._collected) continue;

        const dx = state.playerX - pu._worldX;
        const dz = state.playerZ - pu._worldZ;
        const dist = Math.sqrt(dx * dx + dz * dz);

        if (dist < 1.0) {
            pu._collected = true;
            activatePowerup(pu._type);

            const idx = state.activePowerups.indexOf(pu);
            if (idx !== -1) state.activePowerups.splice(idx, 1);
            powerupPool.release(pu);

            return true;
        }
    }
    return false;
}

// === Activate a Power-up ===
function activatePowerup(type) {
    switch (type) {
        case POWERUP_TYPE.SHIELD:
            state.shieldActive = true;
            state.shieldTimer = POWERUP.SHIELD_DURATION;
            break;
        case POWERUP_TYPE.BOOST:
            state.boostActive = true;
            state.boostTimer = POWERUP.BOOST_DURATION;
            break;
        case POWERUP_TYPE.MAGNET:
            state.magnetActive = true;
            state.magnetTimer = POWERUP.MAGNET_DURATION;
            break;
    }
}

// === Update Power-up Animations ===
export function updatePowerups(dt) {
    // Spin/powerup fallback meshes
    for (const pu of state.activePowerups) {
        if (pu.isEnabled() && pu._mesh) {
            pu._mesh.rotation.y += 2.0 * dt;
            pu._mesh.rotation.x += 1.0 * dt;
            pu._mesh.position.y = 1.0 + Math.sin(Date.now() * 0.003) * 0.15;
        }
    }

    // Update timers
    if (state.shieldActive) {
        state.shieldTimer -= dt;
        if (state.shieldTimer <= 0) {
            state.shieldActive = false;
            state.shieldTimer = 0;
        }
    }

    if (state.boostActive) {
        state.boostTimer -= dt;
        if (state.boostTimer <= 0) {
            state.boostActive = false;
            state.boostTimer = 0;
        }
    }

    if (state.magnetActive) {
        state.magnetTimer -= dt;
        if (state.magnetTimer <= 0) {
            state.magnetActive = false;
            state.magnetTimer = 0;
        }
    }
}

// === Remove Power-ups Behind ===
export function removePowerupsBehind(zThreshold) {
    if (!powerupPool) return;
    const toRemove = state.activePowerups.filter(pu => pu._worldZ < zThreshold - TRACK.PIECE_LENGTH * 2);
    for (const pu of toRemove) {
        const idx = state.activePowerups.indexOf(pu);
        if (idx !== -1) state.activePowerups.splice(idx, 1);
        powerupPool.release(pu);
    }
}