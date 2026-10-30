// ORBIT 式相机：拖动旋转、滚轮缩放、点击天体平滑飞入、缩放越界切换尺度
import * as THREE from 'three';
import { camera } from './engine.js';
import { state, BODIES, SCALES } from './config.js';
import { celestial } from './celestial.js';

// 每个尺度层级的相机距离区间（单位）
export const SCALE_DIST = {
  earth: { near: 8, home: 20, far: 90 },
  solar: { near: 120, home: 620, far: 4200 },
  galaxy: { near: 6000, home: 24000, far: 90000 },
  local: { near: 20000, home: 90000, far: 200000 },
};

const rig = {
  target: new THREE.Vector3(0, 0, 0),
  desiredTarget: new THREE.Vector3(0, 0, 0),
  theta: 0.6, phi: 1.05, dist: 20,                 // 球坐标
  desiredTheta: 0.6, desiredPhi: 1.05, desiredDist: 20,
  dragging: false, lastX: 0, lastY: 0,
  pinch: 0,
  flyingTo: null,
};

let wheelLock = 0;

export function initCameraRig(dom) {
  const el = dom || document.getElementById('universe');
  if (!el) return;

  el.addEventListener('pointerdown', e => {
    rig.dragging = true; rig.lastX = e.clientX; rig.lastY = e.clientY;
    el.setPointerCapture?.(e.pointerId);
  });
  el.addEventListener('pointermove', e => {
    if (!rig.dragging) return;
    const dx = e.clientX - rig.lastX, dy = e.clientY - rig.lastY;
    rig.lastX = e.clientX; rig.lastY = e.clientY;
    const k = 0.006 * (rig.dist > 4000 ? (rig.dist > 30000 ? 0.5 : 1.4) : 1);
    rig.desiredTheta -= dx * k;
    rig.desiredPhi = clamp(rig.desiredPhi - dy * k, 0.18, Math.PI - 0.18);
    rig.flyingTo = null;
  });
  const endDrag = () => { rig.dragging = false; };
  el.addEventListener('pointerup', endDrag);
  el.addEventListener('pointercancel', endDrag);
  el.addEventListener('pointerleave', endDrag);

  el.addEventListener('wheel', e => {
    e.preventDefault();
    zoom(-e.deltaY * 0.0016);
  }, { passive: false });

  // 触摸双指缩放
  el.addEventListener('touchmove', e => {
    if (e.touches.length === 2) {
      const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
      if (rig.pinch) zoom((rig.pinch - d) * 0.004);
      rig.pinch = d;
    }
  }, { passive: true });
  el.addEventListener('touchend', () => { rig.pinch = 0; });
}

function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

export function zoom(factor) {
  const range = SCALE_DIST[state.scale];
  rig.desiredDist = clamp(rig.desiredDist * (1 + factor), range.near, range.far);
  rig.flyingTo = null;
}

// 缩放到相邻尺度（越界时自动切换）
export function stepScale(dir) {
  const idx = SCALES.findIndex(s => s.id === state.scale);
  const next = clamp(idx + dir, 0, SCALES.length - 1);
  if (next !== idx) setScale(SCALES[next].id);
}

export function setScale(id, keepTarget = false) {
  if (!SCALE_DIST[id]) return;
  state.scale = id;
  const range = SCALE_DIST[id];
  rig.desiredDist = range.home;

  if (!keepTarget) {
    if (id === 'earth') flyTo('earth');
    else if (id === 'solar') { rig.desiredTarget.set(0, 0, 0); state.selectedId = 'sun'; }
    else { rig.desiredTarget.set(0, -2000, 0); }
  }
}

// 飞向某天体（平滑）
export function flyTo(id) {
  const obj = celestial[id];
  if (!obj || !obj.group) return;
  const p = new THREE.Vector3();
  obj.group.getWorldPosition(p);
  const r = obj.data?.visualR || 3;
  const dist = Math.max(r * 3.4, 6);
  rig.desiredTarget.copy(p);
  rig.desiredDist = dist;
  rig.flyingTo = id;
  state.selectedId = id;
  state.focusedId = id;
}

// 每帧更新相机
export function updateCameraRig(dt) {
  // 跟随运动的天体（月球/空间站/旅行者）
  if (state.selectedId && (state.selectedId === 'moon' || state.selectedId === 'voyager' || state.selectedId === 'venus' || state.selectedId === 'mars' || state.selectedId === 'jupiter' || state.selectedId === 'saturn')) {
    const obj = celestial[state.selectedId];
    if (obj && obj.group) {
      const p = new THREE.Vector3();
      obj.group.getWorldPosition(p);
      rig.desiredTarget.copy(p);
    }
  }

  const k = 1 - Math.pow(0.0016, dt);
  rig.target.lerp(rig.desiredTarget, Math.min(1, k * 1.2));
  rig.theta += (rig.desiredTheta - rig.theta) * Math.min(1, k);
  rig.phi += (rig.desiredPhi - rig.phi) * Math.min(1, k);
  rig.dist += (rig.desiredDist - rig.dist) * Math.min(1, k);

  const sp = Math.sin(rig.phi);
  camera.position.set(
    rig.target.x + rig.dist * sp * Math.sin(rig.theta),
    rig.target.y + rig.dist * Math.cos(rig.phi),
    rig.target.z + rig.dist * sp * Math.cos(rig.theta)
  );
  camera.lookAt(rig.target);
}

export function resetView() { setScale('earth'); flyTo('earth'); }
export function getRig() { return rig; }
