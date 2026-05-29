// Three.js engine: scene, camera, renderer, lighting, sky
import * as THREE from 'three';

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

// Wait for DOM ready before inserting canvas
function initRenderer() {
  const w = window.innerWidth || 800;
  const h = window.innerHeight || 600;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  document.body.insertBefore(renderer.domElement, document.body.firstChild);
  renderer.domElement.style.cssText = 'position:fixed;top:0;left:0;z-index:0;';
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initRenderer);
} else {
  initRenderer();
}

// Lighting
scene.add(new THREE.AmbientLight(0x6688cc, 0.6));

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
scene.add(new THREE.HemisphereLight(0x87CEEB, 0x3a7d3a, 0.4));

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
  }
});