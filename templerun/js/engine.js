// Temple Run - Babylon.js Engine Setup

const B = window.BABYLON;

// === Engine ===
let engine = null;
let scene = null;
let camera = null;
let sunLight = null;
let shadowGenerator = null;

// Camera target tracking
let cameraTarget = { x: 0, y: 0, z: 0 };
let cameraPosition = { x: 0, y: 3.5, z: -8 };

// === Initialize Engine & Scene ===
export function initEngine() {
    const canvas = document.createElement('canvas');
    canvas.id = 'renderCanvas';
    canvas.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;z-index:0;outline:none;touch-action:none;';
    document.body.insertBefore(canvas, document.body.firstChild);

    engine = new B.Engine(canvas, true, {
        preserveDrawingBuffer: true,
        stencil: true,
        antialias: true,
    });

    // Set pixel ratio via engine property
    engine._hardwareScalingLevel = 1 / Math.min(window.devicePixelRatio, 2);

    scene = new B.Scene(engine);
    scene.clearColor = new B.Color4(0.3, 0.15, 0.05, 1); // Warm dark sky
    scene.ambientColor = new B.Color3(0.3, 0.2, 0.1);

    // Fog for depth
    scene.fogMode = B.Scene.FOGMODE_EXP2;
    scene.fogDensity = 0.008;
    scene.fogColor = new B.Color3(0.35, 0.25, 0.15); // Warm fog matching temple theme

    // === Camera ===
    camera = new B.FreeCamera('gameCamera', new B.Vector3(0, 3.5, -8), scene);
    camera.fov = 0.8; // ~45 degrees
    camera.minZ = 0.1;
    camera.maxZ = 500;
    camera.position = new B.Vector3(0, 3.5, -8);
    camera.setTarget(new B.Vector3(0, 1, 5));
    scene.activeCamera = camera;

    // === Lighting ===
    // Hemispheric light (sky + ground ambient)
    const hemiLight = new B.HemisphericLight('hemiLight', new B.Vector3(0, 1, 0), scene);
    hemiLight.intensity = 0.6;
    hemiLight.diffuse = new B.Color3(0.8, 0.7, 0.5); // Warm sky
    hemiLight.groundColor = new B.Color3(0.3, 0.2, 0.1); // Dark ground

    // Directional sun
    sunLight = new B.DirectionalLight('sunLight', new B.Vector3(-1, -2, 1), scene);
    sunLight.intensity = 1.5;
    sunLight.diffuse = new B.Color3(1.0, 0.9, 0.7); // Warm sunlight
    sunLight.position = new B.Vector3(50, 100, 0);

    // Shadow generator
    shadowGenerator = new B.ShadowGenerator(1024, sunLight);
    shadowGenerator.useBlurExponentialShadowMap = true;
    shadowGenerator.blurKernel = 32;
    shadowGenerator.setDarkness(0.3);

    // === Skybox ===
    loadSkybox();

    // === Resize handler ===
    window.addEventListener('resize', () => {
        engine.resize();
    });

    return { engine, scene, camera, shadowGenerator };
}

// === Load Skybox ===
async function loadSkybox() {
    try {
        const result = await B.SceneLoader.ImportMeshAsync(
            null, 'assets/environments/', 'Machu_Skybox.glb', scene
        );
        if (result.meshes.length > 0) {
            const skybox = result.meshes[0];
            skybox.scaling = new B.Vector3(200, 200, 200);
            skybox.position = new B.Vector3(0, 0, 0);
            skybox.isPickable = false;
            skybox.receiveShadows = false;
            skybox.infiniteDistance = true;
            skybox.renderingGroupId = 0;

            // Make skybox not affected by fog
            for (const mesh of result.meshes) {
                mesh.isPickable = false;
                mesh.receiveShadows = false;
                mesh.infiniteDistance = true;
                if (mesh.material) {
                    mesh.material.fogEnabled = false;
                }
            }
            console.log('Skybox loaded successfully');
        }
    } catch (e) {
        console.warn('Skybox loading failed, creating procedural sky:', e.message);
        createProceduralSky();
    }
}

// === Procedural Sky (fallback) ===
function createProceduralSky() {
    const skybox = B.MeshBuilder.CreateBox('skyBox', { size: 500 }, scene);
    const skyMat = new B.StandardMaterial('skyMat', scene);
    skyMat.backFaceCulling = false;
    skyMat.disableLighting = true;
    skyMat.fogEnabled = false;

    // Warm sunset gradient colors
    const topColor = new B.Color3(0.15, 0.35, 0.65); // Blue
    const bottomColor = new B.Color3(0.7, 0.4, 0.2); // Orange horizon
    const midColor = new B.Color3(0.5, 0.5, 0.4);    // Yellow mid

    skyMat.emissiveColor = new B.Color3(0.5, 0.35, 0.2);
    skybox.material = skyMat;
    skybox.infiniteDistance = true;
    skybox.isPickable = false;
    skybox.renderingGroupId = 0;

    // Create gradient sky shader
    const gradientShader = new B.ShaderMaterial('gradientShader', scene, {
        vertex: 'gradientSky',
        fragment: 'gradientSky',
    }, {
        attributes: ['position', 'normal'],
        uniforms: ['worldViewProjection', 'topColor', 'bottomColor', 'offset', 'exponent'],
    });

    B.Effect.ShadersStore['gradientSkyVertexShader'] = `
        precision highp float;
        attribute position;
        attribute normal;
        uniform mat4 worldViewProjection;
        varying vec3 vPosition;
        void main() {
            vPosition = position;
            gl_Position = worldViewProjection * vec4(position, 1.0);
        }
    `;

    B.Effect.ShadersStore['gradientSkyFragmentShader'] = `
        precision highp float;
        uniform vec3 topColor;
        uniform vec3 bottomColor;
        uniform float offset;
        uniform float exponent;
        varying vec3 vPosition;
        void main() {
            float h = normalize(vPosition + offset).y;
            gl_FragColor = vec4(mix(bottomColor, topColor, pow(max(h, 0.0), exponent)), 1.0);
        }
    `;

    gradientShader.backFaceCulling = false;
    gradientShader.setFloat('offset', 20);
    gradientShader.setFloat('exponent', 0.4);
    gradientShader.setColor3('topColor', topColor);
    gradientShader.setColor3('bottomColor', bottomColor);
    gradientShader.fogEnabled = false;
    skybox.material = gradientShader;
}

// === Update Camera Position ===
export function updateCamera(playerX, playerY, playerZ, trackAngle, dt) {
    // Camera follows behind the player in the current track direction
    const behindOffset = CAMERA_FOLLOW_DISTANCE;
    const heightOffset = CAMERA_HEIGHT_OFFSET;

    // Calculate world position from track-relative coordinates
    // playerZ is distance traveled along track, playerX is lane offset
    const worldX = Math.sin(trackAngle) * playerZ + playerX;
    const worldZ = Math.cos(trackAngle) * playerZ;

    // Track direction vectors
    const dirX = Math.sin(trackAngle);
    const dirZ = Math.cos(trackAngle);

    // Camera is behind and above the player (in world coordinates)
    const targetCamX = worldX - dirX * behindOffset;
    const targetCamY = playerY + heightOffset;
    const targetCamZ = worldZ - dirZ * behindOffset;

    // Smooth interpolation
    const lerpFactor = Math.min(dt * 5.0, 1.0);
    cameraPosition.x += (targetCamX - cameraPosition.x) * lerpFactor;
    cameraPosition.y += (targetCamY - cameraPosition.y) * lerpFactor;
    cameraPosition.z += (targetCamZ - cameraPosition.z) * lerpFactor;

    // Look ahead of player (in world coordinates)
    const lookX = worldX + dirX * 3;
    const lookY = playerY + 1;
    const lookZ = worldZ + dirZ * 3;

    camera.position.set(cameraPosition.x, cameraPosition.y, cameraPosition.z);
    camera.setTarget(new B.Vector3(lookX, lookY, lookZ));
}

const CAMERA_FOLLOW_DISTANCE = 8.0;
const CAMERA_HEIGHT_OFFSET = 3.5;

// === Render ===
export function render() {
    if (scene && engine) {
        scene.render();
    }
}

// === Getters ===
export function getEngine() { return engine; }
export function getScene() { return scene; }
export function getCamera() { return camera; }
export function getShadowGenerator() { return shadowGenerator; }
export function getSunLight() { return sunLight; }
