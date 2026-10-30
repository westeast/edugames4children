// Three.js 场景、相机、渲染器、星空
import * as THREE from 'three';
import { state } from './config.js';

export const scene = new THREE.Scene();

export const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 200000);
camera.position.set(0, 6, 22);

let _renderer = null;
export function getRenderer() { return _renderer; }

function createRenderer() {
  const r = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  r.setSize(window.innerWidth || 800, window.innerHeight || 600);
  r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  _renderer = r;
  return r;
}
export const renderer = createRenderer();

// 光照：微弱环境光 + 太阳点光（位置由 celestial 设置）
export const ambientLight = new THREE.AmbientLight(0x2a3550, 0.55);
export const sunLight = new THREE.PointLight(0xfff2dd, 2.6, 0, 0);
sunLight.position.set(0, 0, 0);

// === 星空粒子 ===
export function createStarfield(count) {
  const geo = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);

  for (let i = 0; i < count; i++) {
    const r = 60000 + Math.random() * 40000;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    positions[i * 3 + 2] = r * Math.cos(phi);

    const t = Math.random();
    if (t < 0.7) { colors[i*3]=1; colors[i*3+1]=1; colors[i*3+2]=1; }
    else if (t < 0.88) { colors[i*3]=0.75; colors[i*3+1]=0.85; colors[i*3+2]=1; }
    else { colors[i*3]=1; colors[i*3+1]=0.9; colors[i*3+2]=0.7; }
  }

  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const mat = new THREE.PointsMaterial({ size: 260, vertexColors: true, sizeAttenuation: true, transparent: true, opacity: 0.9, depthWrite: false });
  const points = new THREE.Points(geo, mat);
  points.userData.isStars = true;
  return points;
}

export const stars = createStarfield(6000);

function initRenderer() {
  const w = window.innerWidth || 800;
  const h = window.innerHeight || 600;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);

  const wrap = document.getElementById('universe');
  if (wrap) wrap.appendChild(renderer.domElement);

  scene.add(ambientLight);
  scene.add(sunLight);
  scene.add(stars);
  applySpaceColor();

  window.addEventListener('resize', () => {
    const nw = window.innerWidth || 800;
    const nh = window.innerHeight || 600;
    if (nw > 0 && nh > 0) {
      camera.aspect = nw / nh;
      camera.updateProjectionMatrix();
      renderer.setSize(nw, nh);
    }
  });
}

// 深空颜色（ORBIT 设置里的「深空颜色」）
export function applySpaceColor() {
  const c = new THREE.Color(state.spaceColor || '#05090e');
  scene.background = c;
  renderer.setClearColor(c, 1);
}

export function setStarsVisible(v) {
  stars.visible = !!v;
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initRenderer);
} else {
  initRenderer();
}
