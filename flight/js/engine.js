// Three.js engine: scene, camera, renderer, lighting, sky
import * as THREE from 'three';
import { state } from './config.js';

export const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x87CEEB, 0.0015);

// Initialize with safe defaults, will be corrected on resize
export const camera = new THREE.PerspectiveCamera(70, 1, 0.5, 2000);
camera.position.set(0, 50, 30);
camera.lookAt(0, 0, 0);

export const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(800, 600);  // Safe initial size
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.2;

// Apply correct aspect ratio (supports portrait rotation for 无损竖拍)
export function applyAspect() {
  const w = window.innerWidth || 800;
  const h = window.innerHeight || 600;
  if (w > 0 && h > 0) {
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  }
  renderer.domElement.style.transform = state.portraitMode ? 'rotate(90deg)' : 'none';
}

// Wait for DOM ready before inserting canvas
function initRenderer() {
  const w = window.innerWidth || 800;
  const h = window.innerHeight || 600;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);

  // Wrap canvas so portrait rotation stays centered (letterbox black bars on sides)
  let wrap = document.getElementById('appCanvasWrap');
  if (!wrap) {
    wrap = document.createElement('div');
    wrap.id = 'appCanvasWrap';
    wrap.style.cssText = 'position:fixed;inset:0;z-index:0;display:flex;align-items:center;justify-content:center;overflow:hidden;';
    document.body.insertBefore(wrap, document.body.firstChild);
  }
  wrap.appendChild(renderer.domElement);
  renderer.domElement.style.cssText = '';

  // Dispatch event to notify game.js that renderer is ready
  window.dispatchEvent(new Event('renderer-ready'));
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initRenderer);
} else {
  initRenderer();
}

// Lighting
export const ambientLight = new THREE.AmbientLight(0x6688cc, 0.6);
scene.add(ambientLight);

export const sunLight = new THREE.DirectionalLight(0xffeedd, 1.8);
sunLight.position.set(200, 300, 100);
sunLight.castShadow = true;
sunLight.shadow.mapSize.set(2048, 2048);
sunLight.shadow.camera.near = 1;
sunLight.shadow.camera.far = 800;
sunLight.shadow.camera.left = -300;
sunLight.shadow.camera.right = 300;
sunLight.shadow.camera.top = 300;
sunLight.shadow.camera.bottom = -300;
scene.add(sunLight);
export const hemisphereLight = new THREE.HemisphereLight(0x87CEEB, 0x3a7d3a, 0.4);
scene.add(hemisphereLight);

// Day/night lighting presets (used by night map init/cleanup)
const DAY_FOG = { color: 0x87CEEB, density: 0.0015 };
const DAY_SKY_TOP = 0x0055aa;
const DAY_SKY_BOTTOM = 0x87CEEB;
const DAY_SUN = { color: 0xffeedd, intensity: 1.8 };
const DAY_AMBIENT = { color: 0x6688cc, intensity: 0.6 };
const DAY_HEMI = { color: 0x87CEEB, ground: 0x3a7d3a, intensity: 0.4 };

const NIGHT_FOG = { color: 0x05050c, density: 0.0055 };
const NIGHT_SKY_TOP = 0x000022;
const NIGHT_SKY_BOTTOM = 0x0a1230;
const NIGHT_SUN = { color: 0x8899cc, intensity: 0.35 };
const NIGHT_AMBIENT = { color: 0x223355, intensity: 0.35 };
const NIGHT_HEMI = { color: 0x1a2a44, ground: 0x0a0f1a, intensity: 0.3 };

export function applyDayLighting() {
  scene.fog = new THREE.FogExp2(DAY_FOG.color, DAY_FOG.density);
  skyMesh.material.uniforms.topColor.value.setHex(DAY_SKY_TOP);
  skyMesh.material.uniforms.bottomColor.value.setHex(DAY_SKY_BOTTOM);
  sunLight.color.setHex(DAY_SUN.color);
  sunLight.intensity = DAY_SUN.intensity;
  ambientLight.color.setHex(DAY_AMBIENT.color);
  ambientLight.intensity = DAY_AMBIENT.intensity;
  hemisphereLight.color.setHex(DAY_HEMI.color);
  hemisphereLight.groundColor.setHex(DAY_HEMI.ground);
  hemisphereLight.intensity = DAY_HEMI.intensity;
}

export function applyNightLighting() {
  scene.fog = new THREE.FogExp2(NIGHT_FOG.color, NIGHT_FOG.density);
  skyMesh.material.uniforms.topColor.value.setHex(NIGHT_SKY_TOP);
  skyMesh.material.uniforms.bottomColor.value.setHex(NIGHT_SKY_BOTTOM);
  sunLight.color.setHex(NIGHT_SUN.color);
  sunLight.intensity = NIGHT_SUN.intensity;
  ambientLight.color.setHex(NIGHT_AMBIENT.color);
  ambientLight.intensity = NIGHT_AMBIENT.intensity;
  hemisphereLight.color.setHex(NIGHT_HEMI.color);
  hemisphereLight.groundColor.setHex(NIGHT_HEMI.ground);
  hemisphereLight.intensity = NIGHT_HEMI.intensity;
}

// Sky dome with gradient shader
const skyMat = new THREE.ShaderMaterial({
  side: THREE.BackSide,
  uniforms: {
    topColor: { value: new THREE.Color(0x0055aa) },
    bottomColor: { value: new THREE.Color(0x87CEEB) },
    offset: { value: 20 },
    exponent: { value: 0.4 }
  },
  vertexShader: `
    varying vec3 vWP;
    void main() {
      vWP = (modelMatrix * vec4(position, 1.0)).xyz;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform vec3 topColor;
    uniform vec3 bottomColor;
    uniform float offset;
    uniform float exponent;
    varying vec3 vWP;
    void main() {
      float h = normalize(vWP + offset).y;
      gl_FragColor = vec4(mix(bottomColor, topColor, max(pow(max(h, 0.0), exponent), 0.0)), 1.0);
    }
  `
});
export const skyMesh = new THREE.Mesh(new THREE.SphereGeometry(1500, 32, 32), skyMat);
scene.add(skyMesh);

// Resize handler - force update on any size change
window.addEventListener('resize', () => {
  const w = window.innerWidth || 800;
  const h = window.innerHeight || 600;
  if (w > 0 && h > 0) {
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    // Dispatch a custom event so game.js can re-center the camera
    window.dispatchEvent(new Event('game-resize'));
  }
});