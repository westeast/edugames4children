// Temple Run - Character Model & Animation

const B = window.BABYLON;

let playerRoot = null;
let playerMeshes = [];
let skeleton = null;
let animationGroups = {};
let currentAnim = null;

// === Load Player Character GLB ===
export async function loadCharacter(scene) {
    try {
        const result = await B.SceneLoader.ImportMeshAsync(
            null, 'assets/characters/guy_dangerous/', 'guy_dangerous.glb', scene
        );

        playerMeshes = result.meshes;
        skeleton = result.skeletons[0] || null;
        playerRoot = new B.TransformNode('playerRoot', scene);

        // Parent all meshes to root
        for (const mesh of result.meshes) {
            if (mesh.parent === null) {
                mesh.parent = playerRoot;
            }
            mesh.isPickable = false;
        }

        // Scale the character (GLB may be in different scale)
        playerRoot.scaling = new B.Vector3(1, 1, 1);

        // Extract animation groups
        for (const anim of result.animationGroups) {
            animationGroups[anim.name] = anim;
            anim.stop(); // Stop all auto-playing
            console.log('Animation:', anim.name, 'Frames:', anim.from, '-', anim.to);
        }

        // Try to start run animation
        playAnimation('run', true);

        console.log('Player character loaded:', result.meshes.length, 'meshes',
            result.animationGroups.length, 'animations');
        return playerRoot;

    } catch (e) {
        console.warn('Failed to load player GLB, creating fallback:', e.message);
        return createFallbackCharacter(scene);
    }
}

// === Fallback Character (simple box person) ===
function createFallbackCharacter(scene) {
    playerRoot = new B.TransformNode('playerRoot', scene);

    // Body
    const body = B.MeshBuilder.CreateBox('playerBody', { width: 0.5, height: 1.2, depth: 0.3 }, scene);
    body.position.y = 0.9;
    body.parent = playerRoot;
    const bodyMat = new B.StandardMaterial('bodyMat', scene);
    bodyMat.diffuseColor = new B.Color3(0.2, 0.5, 0.8); // Blue shirt
    bodyMat.specularColor = new B.Color3(0.1, 0.1, 0.1);
    body.material = bodyMat;

    // Head
    const head = B.MeshBuilder.CreateSphere('playerHead', { diameter: 0.35 }, scene);
    head.position.y = 1.75;
    head.parent = playerRoot;
    const headMat = new B.StandardMaterial('headMat', scene);
    headMat.diffuseColor = new B.Color3(0.85, 0.65, 0.5); // Skin
    headMat.specularColor = new B.Color3(0.1, 0.1, 0.1);
    head.material = headMat;

    // Legs
    for (let i = -1; i <= 1; i += 2) {
        const leg = B.MeshBuilder.CreateBox('playerLeg' + i, { width: 0.15, height: 0.6, depth: 0.15 }, scene);
        leg.position.set(i * 0.12, 0.3, 0);
        leg.parent = playerRoot;
        const legMat = new B.StandardMaterial('legMat', scene);
        legMat.diffuseColor = new B.Color3(0.3, 0.3, 0.3); // Dark pants
        legMat.specularColor = new B.Color3(0.05, 0.05, 0.05);
        leg.material = legMat;
    }

    playerMeshes = [body, head];
    return playerRoot;
}

// === Play Animation by Name ===
export function playAnimation(name, loop = false) {
    // Stop current animation
    if (currentAnim) {
        try { currentAnim.stop(); } catch (e) { /* ignore */ }
    }

    // Try exact name match
    if (animationGroups[name]) {
        currentAnim = animationGroups[name];
        currentAnim.start(loop);
        return;
    }

    // Try fuzzy match (case-insensitive, partial)
    const nameLower = name.toLowerCase();
    for (const [key, anim] of Object.entries(animationGroups)) {
        if (key.toLowerCase().includes(nameLower) || nameLower.includes(key.toLowerCase())) {
            currentAnim = anim;
            currentAnim.start(loop);
            return;
        }
    }

    // Known animation name mappings (from GLB: Run01, Jump01, Slide01, etc.)
    const mappings = {
        'run': ['Run01', 'Run', 'Running', 'run', 'running', 'Idle01', 'Idle', 'idle'],
        'jump': ['Jump01', 'Jump', 'Jumping', 'jump', 'jumping', 'Run01', 'Running'],
        'slide': ['Slide01', 'SlideEnter01', 'Slide', 'Sliding', 'slide', 'sliding', 'Roll', 'roll', 'Run01', 'Running'],
        'death': ['Death01', 'DeathFalling01', 'Death', 'Die', 'death', 'die', 'Fall', 'fall'],
        'stumble': ['RunStumble01', 'RunStumble', 'stumble'],
        'turn': ['Run01', 'Turn', 'turn', 'Running'],
        'idle': ['Idle01', 'Idle', 'idle', 'Run01', 'Running'],
        'milestone': ['MileStone01', 'MileStone'],
    };

    const alternatives = mappings[nameLower] || mappings['run'];
    for (const alt of alternatives) {
        if (animationGroups[alt]) {
            currentAnim = animationGroups[alt];
            currentAnim.start(loop);
            return;
        }
    }

    // No animation found - this is OK for fallback character
}

// === Update Character Position ===
export function updateCharacterPosition(x, y, z, rotation, isSliding) {
    if (!playerRoot) return;

    playerRoot.position.set(x, y, z);
    playerRoot.rotation.y = rotation;

    // Scale for slide (squash character)
    if (isSliding) {
        playerRoot.scaling.y = 0.5;
        playerRoot.scaling.x = 1.2;
    } else {
        playerRoot.scaling.y = 1;
        playerRoot.scaling.x = 1;
    }
}

// === Get Player Root ===
export function getPlayerRoot() { return playerRoot; }
export function getPlayerMeshes() { return playerMeshes; }
export function getSkeleton() { return skeleton; }
