// Temple Run - Coin System

const B = window.BABYLON;

import { TRACK, COLLISION, state } from './config.js';
import { ObjectPool, randomInt, randomFloat } from './utils.js';

let scene = null;
let coinPool = null;
let coinTemplate = null;
let coinMaterial = null;
let coinSpinAnimation = null;

// === Initialize Coin System ===
export async function initCoins(sceneRef) {
    scene = sceneRef;

    // Try loading the coin GLB model
    try {
        const result = await B.SceneLoader.ImportMeshAsync(
            null, 'assets/objects/coins/', 'default_coin_gold.glb', scene
        );
        if (result.meshes.length > 0) {
            coinTemplate = result.meshes[0];
            coinTemplate.setEnabled(false);
            coinTemplate.isPickable = false;
            console.log('Coin model loaded:', result.meshes.length, 'meshes');
        }
    } catch (e) {
        console.warn('Failed to load coin GLB, creating fallback:', e.message);
    }

    // Fallback coin material
    coinMaterial = new B.StandardMaterial('coinMat', scene);
    coinMaterial.diffuseColor = new B.Color3(1.0, 0.85, 0.0); // Gold
    coinMaterial.specularColor = new B.Color3(1.0, 0.9, 0.5);
    coinMaterial.emissiveColor = new B.Color3(0.3, 0.25, 0.0);

    // Coin pool
    coinPool = new ObjectPool(
        () => createCoin(),
        (coin) => resetCoin(coin),
        80
    );
}

// === Create a Coin ===
function createCoin() {
    const root = new B.TransformNode('coinRoot', scene);
    let mesh;

    if (coinTemplate) {
        // Instance the GLB model
        mesh = coinTemplate.createInstance('coinInstance');
        mesh.parent = root;
        mesh.scaling = new B.Vector3(0.5, 0.5, 0.5);
    } else {
        // Fallback: simple disc/cylinder
        mesh = B.MeshBuilder.CreateCylinder('coinMesh', {
            height: 0.08,
            diameter: 0.35,
            tessellation: 16
        }, scene);
        mesh.parent = root;
        mesh.material = coinMaterial;
    }

    mesh.isPickable = false;
    root._mesh = mesh;
    root._worldZ = 0;
    root._worldX = 0;
    root._worldY = 0;
    root._collected = false;
    root.setEnabled(false);

    return root;
}

function resetCoin(coin) {
    coin.setEnabled(false);
    coin._collected = false;
    coin.scaling.set(1, 1, 1);
}

// === Spawn Coins for a Track Piece ===
export function spawnCoinsForPiece(piece, sceneRef) {
    if (!scene) return; // Not initialized yet
    if (!coinPool) return;

    const pieceZ = piece._pieceZ;

    // Check if we should spawn coins
    if (state.distanceSinceLastCoinRun < TRACK.MIN_DIST_BETWEEN_COIN_RUNS) return;

    // Random chance
    if (Math.random() > 0.5) return;

    // Decide coin pattern
    const pattern = Math.random();
    const count = randomInt(3, Math.min(TRACK.MAX_COINS_PER_RUN, 8 + state.difficultyLevel));
    const lane = randomInt(-1, 1);

    for (let i = 0; i < count; i++) {
        const coin = coinPool.acquire();
        coin.setEnabled(true);

        const offsetZ = i * 1.2; // Spacing between coins

        let coinY = TRACK.DEFAULT_COIN_PLACEMENT_HEIGHT;
        let coinLane = lane;

        if (pattern < 0.3) {
            // Arc pattern
            const t = count > 1 ? i / (count - 1) : 0.5;
            coinY = TRACK.DEFAULT_COIN_PLACEMENT_HEIGHT + Math.sin(t * Math.PI) * TRACK.ARC_MAX_HEIGHT;
        } else if (pattern < 0.5) {
            // Zigzag pattern
            coinLane = (i % 2 === 0) ? lane : -lane;
        }

        const worldZ = pieceZ + offsetZ;
        const worldX = coinLane * TRACK.LANE_WIDTH;

        const dirX = Math.sin(state.trackAngle || 0);
        const dirZ = Math.cos(state.trackAngle || 0);

        coin.position.set(
            dirX * worldZ + worldX,
            coinY,
            dirZ * worldZ
        );
        coin.rotation.y = state.trackAngle || 0;

        coin._worldZ = worldZ;
        coin._worldX = worldX;
        coin._worldY = coinY;
        coin._collected = false;

        state.activeCoins.push(coin);
    }

    state.distanceSinceLastCoinRun = 0;
}

// === Check Coin Collection ===
export function checkCoinCollection(playerBounds, gameState) {
    const collectRadius = gameState.magnetActive ? COLLISION.MAGNET_COLLECT_RADIUS : COLLISION.COIN_COLLECT_RADIUS;

    for (const coin of state.activeCoins) {
        if (!coin.isEnabled() || coin._collected) continue;

        const dx = state.playerX - coin._worldX;
        const dy = (state.playerY + 1.0) - coin._worldY;
        const dz = state.playerZ - coin._worldZ;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

        if (dist < collectRadius) {
            coin._collected = true;

            // Animate collection (shrink + float up)
            const mesh = coin._mesh;
            if (mesh) {
                // Quick shrink animation
                const anim = new B.Animation('coinCollect', 'scaling', 60,
                    B.Animation.ANIMATIONTYPE_VECTOR3,
                    B.Animation.ANIMATIONLOOPMODE_CONSTANT);
                anim.setKeys([
                    { frame: 0, value: new B.Vector3(1, 1, 1) },
                    { frame: 10, value: new B.Vector3(0.1, 0.1, 0.1) }
                ]);
                coin.animations = [anim];
                scene.beginAnimation(coin, 0, 10, false, 2, () => {
                    coinPool.release(coin);
                });
            } else {
                coinPool.release(coin);
            }

            // Update state
            state.coins++;
            state.totalCoins++;

            // Remove from active list
            const idx = state.activeCoins.indexOf(coin);
            if (idx !== -1) state.activeCoins.splice(idx, 1);

            return true; // Coin collected
        }

        // Magnet: attract coins toward player
        if (gameState.magnetActive && dist < COLLISION.MAGNET_COLLECT_RADIUS * 1.5) {
            const attractStrength = 5.0 * (1 - dist / (COLLISION.MAGNET_COLLECT_RADIUS * 1.5));
            const nx = dx / dist;
            const nz = dz / dist;
            coin._worldX += nx * attractStrength * 0.016;
            coin._worldZ += nz * attractStrength * 0.016;
            coin.position.x = Math.sin(state.trackAngle || 0) * coin._worldZ + coin._worldX;
            coin.position.z = Math.cos(state.trackAngle || 0) * coin._worldZ;
        }
    }

    return false;
}

// === Spin Coins (called each frame) ===
export function updateCoins(dt) {
    const spinSpeed = 3.0; // Radians per second
    for (const coin of state.activeCoins) {
        if (coin.isEnabled() && coin._mesh) {
            coin._mesh.rotation.y += spinSpeed * dt;
        }
    }
}

// === Remove Coins Behind ===
export function removeCoinsBehind(zThreshold) {
    const toRemove = state.activeCoins.filter(coin => coin._worldZ < zThreshold - TRACK.PIECE_LENGTH * 2);
    for (const coin of toRemove) {
        const idx = state.activeCoins.indexOf(coin);
        if (idx !== -1) state.activeCoins.splice(idx, 1);
        coinPool.release(coin);
    }
}
