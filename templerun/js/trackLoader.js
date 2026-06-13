// Temple Run - Track Piece Loader
// Loads base_pack.glb containing all track piece meshes

const B = window.BABYLON;

let trackPieceTemplates = {};
let trackPieceRoot = null;
let sceneRef = null;

// Track piece categories
export const TRACK_PIECES = {
    STRAIGHT: ['straight_a', 'straight_b', 'straight_c', 'straight_d', 'straight_e', 'straight_f', 'straight_organic_a', 'straight_organic_b', 'straight_organic_c'],
    CURVE: ['curve_a', 'curve_b', 'curve_c', 'curve_d', 'curve_water_a'],
    TURN: ['turn_left_a', 'turn_right_a'],
    JUMP: ['jump_over_a', 'jump_over_b', 'jump_over_b_saw', 'jump_or_slide_a'],
    SLIDE: ['slide_under_a'],
    BRIDGE: ['bridge_a', 'bridge_gap_a'],
    HILL: ['hill_a', 'hill_b'],
    GAP: ['gap_large_a', 'gap_small_a'],
    STAIRS: ['stairs_twist_a', 'stairs_up_start_a', 'stairs_up_middle_a', 'stairs_up_middle_b', 'stairs_up_end_a'],
    LEDGE_START: ['ledge_start_left_a', 'ledge_start_right_a'],
    LEDGE_MIDDLE: ['ledge_left_a', 'ledge_left_b', 'ledge_right_a', 'ledge_right_b'],
    LEDGE_END: ['ledge_end_left_a', 'ledge_end_right_a'],
    ZIPLINE: ['zipline_a', 'zipline_b', 'zipline_start', 'zipline_end', 'zipline_line'],
    JUNCTION: ['junction_a', 'junction_b'],
    SPECIAL: ['temple_opening_a', 'floating_island_a', 'run_between_a', 'stumble_a', 'stumble_b'],
};

// All available piece names
export const ALL_PIECE_NAMES = Object.values(TRACK_PIECES).flat();

/**
 * Load base_pack.glb and extract all track piece meshes
 */
export async function loadTrackPieces(scene) {
    sceneRef = scene;

    try {
        console.log('Loading base_pack.glb...');
        const result = await B.SceneLoader.ImportMeshAsync(
            null,
            'assets/tracks/Machu/Base/',
            'base_pack.glb',
            scene
        );

        console.log('Loaded', result.meshes.length, 'meshes from base_pack.glb');

        // Load textures for materials
        console.log('Loading track textures...');
        const masterTexture = new B.Texture('assets/textures/machu_master_a.jpg', scene);
        masterTexture.uScale = 1;
        masterTexture.vScale = 1;

        // Apply texture to machu_master_opaque material
        const masterMaterial = scene.getMaterialByName('machu_master_opaque');
        if (masterMaterial) {
            masterMaterial.diffuseTexture = masterTexture;
            masterMaterial.specularColor = new B.Color3(0.2, 0.2, 0.2);
            masterMaterial.specularPower = 32;
            console.log('Applied texture to machu_master_opaque');
        }

        // Apply to other materials if needed
        const lambert1 = scene.getMaterialByName('lambert1');
        if (lambert1) {
            lambert1.diffuseTexture = masterTexture;
        }

        const lambert2 = scene.getMaterialByName('lambert2');
        if (lambert2) {
            lambert2.diffuseTexture = masterTexture;
        }

        // Log material info
        const materials = scene.materials;
        console.log('Materials loaded:', materials.length);
        for (const mat of materials) {
            if (mat.name.includes('machu') || mat.name.includes('lambert')) {
                console.log('  Material:', mat.name,
                    'diffuse:', mat.diffuseColor?.toString(),
                    'texture:', mat.diffuseTexture?.name);
            }
        }

        // Create a container for all track pieces
        trackPieceRoot = new B.TransformNode('trackPieceRoot', scene);

        // Group meshes by their base name (remove .001, .002 suffixes)
        const meshGroups = {};

        for (const mesh of result.meshes) {
            // Get base name by removing numeric suffix
            const baseName = mesh.name.replace(/\.\d+$/, '');

            if (!meshGroups[baseName]) {
                meshGroups[baseName] = [];
            }
            meshGroups[baseName].push(mesh);

            // Hide original meshes but keep them for instancing
            mesh.setEnabled(false);
            mesh.isPickable = false;
        }

        console.log('Found', Object.keys(meshGroups).length, 'unique mesh groups');

        // Create template entries for each track piece type
        for (const [baseName, meshes] of Object.entries(meshGroups)) {
            if (ALL_PIECE_NAMES.includes(baseName)) {
                trackPieceTemplates[baseName] = {
                    meshes: meshes,
                    boundingInfo: calculateCombinedBounding(meshes),
                    hasCollider: meshes.some(m => m.name.includes('Collider')),
                };
                // console.log('  Template created:', baseName, '(', meshes.length, 'meshes)');
            }
        }

        console.log('Track pieces loaded:', Object.keys(trackPieceTemplates).length);
        return trackPieceTemplates;

    } catch (e) {
        console.error('Failed to load base_pack.glb:', e.message);
        return null;
    }
}

/**
 * Calculate combined bounding box for a group of meshes
 */
function calculateCombinedBounding(meshes) {
    let min = new B.Vector3(Infinity, Infinity, Infinity);
    let max = new B.Vector3(-Infinity, -Infinity, -Infinity);

    for (const mesh of meshes) {
        if (mesh.getBoundingInfo) {
            const bi = mesh.getBoundingInfo();
            const minWorld = bi.boundingBox.minimumWorld;
            const maxWorld = bi.boundingBox.maximumWorld;

            min = B.Vector3.Minimize(min, minWorld);
            max = B.Vector3.Maximize(max, maxWorld);
        }
    }

    return { minimum: min, maximum: max };
}

/**
 * Create an instance of a track piece
 */
export function createTrackPieceInstance(pieceName, scene) {
    const template = trackPieceTemplates[pieceName];
    if (!template) {
        console.warn('Track piece not found:', pieceName);
        return null;
    }

    const root = new B.TransformNode('piece_' + pieceName, scene);
    root._trackPieceType = pieceName;

    // Create instances of all meshes in this piece
    const instances = [];
    for (const mesh of template.meshes) {
        const instance = mesh.createInstance(mesh.name + '_inst');
        instance.parent = root;
        instance.isPickable = false;
        // Note: receiveShadows has no effect on instances - shadows come from source mesh
        instances.push(instance);
    }

    root._instances = instances;
    root._boundingInfo = template.boundingInfo;

    return root;
}

/**
 * Get list of available piece names
 */
export function getAvailablePieces() {
    return Object.keys(trackPieceTemplates);
}

/**
 * Get pieces by category
 */
export function getPiecesByCategory(category) {
    return TRACK_PIECES[category] || [];
}

/**
 * Get random piece from category
 */
export function getRandomPiece(category) {
    const pieces = TRACK_PIECES[category];
    if (!pieces || pieces.length === 0) return null;
    return pieces[Math.floor(Math.random() * pieces.length)];
}

/**
 * Check if piece is available
 */
export function hasPiece(pieceName) {
    return pieceName in trackPieceTemplates;
}

/**
 * Get piece bounding info
 */
export function getPieceBounds(pieceName) {
    const template = trackPieceTemplates[pieceName];
    return template ? template.boundingInfo : null;
}
