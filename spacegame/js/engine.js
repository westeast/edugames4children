// Three.js engine: scene, camera, renderer, lighting, starfield
import * as THREE from 'three';
import { state } from './config.js';

export const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a1a2e); // Deep space dark blue (visible)

export const camera = new THREE.PerspectiveCamera(60, 1, 0.5, 5000);
camera.position.set(0, 8, 25);
camera.lookAt(0, 0, 0);

// === Renderer ===
let _renderer;
function createRenderer() {
	_renderer = new THREE.WebGLRenderer({ antialias: true });
	_renderer.setSize(window.innerWidth || 800, window.innerHeight || 600);
	_renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
	_renderer.shadowMap.enabled = false; // No shadows for space game (performance)
	_renderer.setClearColor(0x1a1a2e, 1); // Deep space dark blue clear color
	return _renderer;
}

export const renderer = createRenderer();

// === Lighting ===
export const ambientLight = new THREE.AmbientLight(0x223344, 0.5);

export const sunLight = new THREE.DirectionalLight(0xffeedd, 2.0);
sunLight.position.set(200, 100, 100);

// === Starfield background (particle system) ===
export function createStarfield(count) {
  const geo = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const sizes = new Float32Array(count);

  for (let i = 0; i < count; i++) {
    // Random position in a large sphere
    const r = 1500 + Math.random() * 1000;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    positions[i * 3 + 2] = r * Math.cos(phi);

    // Star color (white to blue-white to yellow)
    const type = Math.random();
    if (type < 0.6) { colors[i*3]=1; colors[i*3+1]=1; colors[i*3+2]=1; } // white
    else if (type < 0.8) { colors[i*3]=0.7; colors[i*3+1]=0.8; colors[i*3+2]=1; } // blue-white
    else { colors[i*3]=1; colors[i*3+1]=0.9; colors[i*3+2]=0.6; } // yellow

    sizes[i] = 1 + Math.random() * 3;
  }

  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

  const mat = new THREE.PointsMaterial({
    size: 2.5,
    vertexColors: true,
    transparent: false, // Opaque stars so they're always visible
    opacity: 0.9,
    sizeAttenuation: true,
  });

  return new THREE.Points(geo, mat);
}

export const stars = createStarfield(10000);

// === Resize handler ===
window.addEventListener('resize', () => {
  const w = window.innerWidth || 800;
  const h = window.innerHeight || 600;
  if (w > 0 && h > 0) {
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  }
});

// === Insert canvas and add scene objects ===
function initRenderer() {
  const w = window.innerWidth || 800;
  const h = window.innerHeight || 600;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);

  let wrap = document.getElementById('appCanvasWrap');
  if (!wrap) {
    wrap = document.createElement('div');
    wrap.id = 'appCanvasWrap';
    wrap.style.cssText = 'position:fixed;inset:0;z-index:1;display:flex;align-items:center;justify-content:center;overflow:hidden;';
    document.body.insertBefore(wrap, document.body.firstChild);
  }
  wrap.appendChild(renderer.domElement);

  // Add scene objects (lighting + stars) after canvas is in DOM
  scene.add(ambientLight);
  scene.add(sunLight);
  scene.add(stars);

  window.dispatchEvent(new Event('renderer-ready'));
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initRenderer);
} else {
  initRenderer();
}
