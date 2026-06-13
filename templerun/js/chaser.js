// Temple Run - Demon Monkey Chaser

const B = window.BABYLON;

import { state, CHASER } from './config.js';
import { playAnimation } from './character.js';

let scene = null;
let chaserRoot = null;
let chaserMeshes = [];
let chaserAnimations = {};

// === Load Chaser Model ===
export async function loadChaser(sceneRef) {
    scene = sceneRef;

    try {
        const result = await B.SceneLoader.ImportMeshAsync(
            null, 'assets/characters/demon_monkey/', 'demon_monkey_chaser.glb', scene
        );

        chaserMeshes = result.meshes;
        chaserRoot = new B.TransformNode('chaserRoot', scene);

        for (const mesh of result.meshes) {
            if (mesh.parent === null) {
                mesh.parent = chaserRoot;
            }
            mesh.isPickable = false;
        }

        // Extract animations
        for (const anim of result.animationGroups) {
            chaserAnimations[anim.name] = anim;
            anim.stop();
        }

        // Start run animation
        startChaserAnimation('Run', true);

        console.log('Chaser model loaded:', result.meshes.length, 'meshes',
            result.animationGroups.length, 'animations');

    } catch (e) {
        console.warn('Failed to load chaser GLB, creating fallback:', e.message);
        chaserRoot = createFallbackChaser(scene);
    }

    // Position behind player
    updateChaserPosition();

    return chaserRoot;
}

// === Fallback Chaser ===
function createFallbackChaser(scene) {
    const root = new B.TransformNode('chaserRootFallback', scene);

    // Demon monkey body (dark, menacing)
    const body = B.MeshBuilder.CreateBox('chaserBody', { width: 0.8, height: 1.2, depth: 0.5 }, scene);
    body.position.y = 1.0;
    body.parent = root;
    const bodyMat = new B.StandardMaterial('chaserBodyMat', scene);
    bodyMat.diffuseColor = new B.Color3(0.15, 0.1, 0.1); // Dark red-brown
    bodyMat.emissiveColor = new B.Color3(0.1, 0.02, 0.02); // Slight glow
    body.material = bodyMat;

    // Head
    const head = B.MeshBuilder.CreateSphere('chaserHead', { diameter: 0.5 }, scene);
    head.position.y = 1.9;
    head.parent = root;
    const headMat = new B.StandardMaterial('chaserHeadMat', scene);
    headMat.diffuseColor = new B.Color3(0.2, 0.1, 0.1);
    headMat.emissiveColor = new B.Color3(0.15, 0.03, 0.0);
    head.material = headMat;

    // Eyes (red glowing)
    for (let i = -1; i <= 1; i += 2) {
        const eye = B.MeshBuilder.CreateSphere('chaserEye' + i, { diameter: 0.08 }, scene);
        eye.position.set(i * 0.12, 1.95, 0.2);
        eye.parent = root;
        const eyeMat = new B.StandardMaterial('chaserEyeMat', scene);
        eyeMat.diffuseColor = new B.Color3(1.0, 0.1, 0.0);
        eyeMat.emissiveColor = new B.Color3(1.0, 0.2, 0.0);
        eye.material = eyeMat;
    }

    chaserMeshes = [body, head];
    return root;
}

// === Start Chaser Animation ===
function startChaserAnimation(name, loop) {
    // Try exact match
    if (chaserAnimations[name]) {
        chaserAnimations[name].start(loop);
        return;
    }

    // Fuzzy match
    const nameLower = name.toLowerCase();
    for (const [key, anim] of Object.entries(chaserAnimations)) {
        if (key.toLowerCase().includes(nameLower)) {
            anim.start(loop);
            return;
        }
    }
}

// === Update Chaser ===
export function updateChaser(dt) {
    if (!chaserRoot) return;

    // Chaser behavior:
    // - When player is running well, chaser slowly falls behind
    // - When player stumbles (hits obstacle without dying), chaser catches up
    // - Chaser distance affects visual size and sound

    if (state.isDead) {
        // Chaser reaches the player on death
        state.chaserDistance = Math.max(0, state.chaserDistance - dt * 15);
    } else if (state.chaserCatchingUp) {
        // Chaser lunges forward
        state.chaserDistance -= CHASER.CATCH_UP_SPEED * dt;
        if (state.chaserDistance <= 5) {
            state.chaserCatchingUp = false;
        }
    } else {
        // Chaser slowly drifts back
        state.chaserDistance += CHASER.DRIFT_BACK_SPEED * dt;
        state.chaserDistance = Math.min(state.chaserDistance, CHASER.MAX_DISTANCE);
    }

    updateChaserPosition();
}

// === Update Chaser Position ===
function updateChaserPosition() {
    if (!chaserRoot) return;

    const trackAngle = state.trackAngle || 0;
    const dirX = Math.sin(trackAngle);
    const dirZ = Math.cos(trackAngle);

    // Chaser position in track-relative coordinates (behind player)
    const behindZ = state.playerZ - state.chaserDistance;

    // Convert to world coordinates
    const worldX = Math.sin(trackAngle) * behindZ + state.playerX;
    const worldZ = Math.cos(trackAngle) * behindZ;

    chaserRoot.position.set(worldX, 0, worldZ);
    chaserRoot.rotation.y = trackAngle;

    // Scale based on distance (closer = more menacing)
    const scaleFactor = Math.max(0.5, 1.0 - state.chaserDistance / CHASER.MAX_DISTANCE * 0.5);
    chaserRoot.scaling.set(scaleFactor, scaleFactor, scaleFactor);

    // Visibility
    const isClose = state.chaserDistance < 20;
    chaserRoot.setEnabled(isClose || state.gamePhase === 'playing');
}

// === Chaser Catches Up (called when player stumbles) ===
export function chaserCatchUp() {
    state.chaserDistance = Math.max(2, state.chaserDistance - CHASER.STUMBLE_CATCH_UP);
    state.chaserCatchingUp = true;
    setTimeout(() => { state.chaserCatchingUp = false; }, 2000);
}

// === Get Chaser Root ===
export function getChaserRoot() { return chaserRoot; }
