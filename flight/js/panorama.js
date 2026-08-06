// panorama.js — Avata 360 全景/超全景相机系统
//
// 架构：从 state.dronePos 把整个场景渲染进立方体贴图（CubeCamera，6 面，世界对齐），
//   单镜头 : 不激活，普通相机渲染。
//   双镜头 : 全屏 equirect 采样 quad —— 屏幕 UV 映射为 (方位角 ±180°, 俯仰角 ±63°)，
//            采样立方体贴图得到 360° 前/侧/后都可见的弯曲全景：
//            树、山弯曲；地面像小桥；房子向中间弯；近处草地基本不弯。
//   超全景 : 一个 FrontSide 星球球体置于无人机前上方，采样立方体贴图，
//            地面/树/山集中在球上，球四周露出真实蓝天；飞行时内容滚动更新。
//
import * as THREE from 'three';
import { scene, renderer } from './engine.js';
import { state } from './config.js';
import { droneGroup } from './drone-model.js';

// 当前是否处于全景模式（dual / super）以及模式
let active = false;
let mode = 'single';

// --- 立方体贴图渲染目标（世界对齐，从 dronePos 拍摄 6 面） ---
const cubeRT = new THREE.WebGLCubeRenderTarget(512, {
  generateMipmaps: true,
  minFilter: THREE.LinearMipmapLinearFilter,
  magFilter: THREE.LinearFilter,
});
const cubeCamera = new THREE.CubeCamera(0.5, 2000, cubeRT);

// --- 双镜头全景：全屏 equirect 采样 quad ---
const equirectMat = new THREE.ShaderMaterial({
  uniforms: {
    uCube: { value: cubeRT.texture },
    uForward: { value: new THREE.Vector3(0, 0, -1) },
    uRight: { value: new THREE.Vector3(1, 0, 0) },
    uUp: { value: new THREE.Vector3(0, 1, 0) },
    uVertHalf: { value: 1.1 },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = vec4(position.xy, 0.0, 1.0);
    }
  `,
  fragmentShader: `
    uniform samplerCube uCube;
    uniform vec3 uForward;
    uniform vec3 uRight;
    uniform vec3 uUp;
    uniform float uVertHalf;
    varying vec2 vUv;
    void main() {
      // 屏幕 UV -> 方位角 az（-π..π，前向为 0，左右与后方可见）/ 俯仰角 el
      float az = (vUv.x * 2.0 - 1.0) * 3.141592653589793;
      float el = (vUv.y * 2.0 - 1.0) * uVertHalf;
      vec3 dir = normalize(
        uForward * (cos(el) * cos(az)) +
        uRight   * (cos(el) * sin(az)) +
        uUp      * sin(el)
      );
      gl_FragColor = vec4(textureCube(uCube, dir).rgb, 1.0);
      #include <colorspace_fragment>
    }
  `,
  depthTest: false,
  depthWrite: false,
  side: THREE.DoubleSide,
});
const equirectQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), equirectMat);
equirectQuad.name = 'panoEquirect';
equirectQuad.renderOrder = 999;
equirectQuad.frustumCulled = false;
equirectQuad.visible = false;

// --- 超全景：星球球体（置于无人机前方，屏幕空间映射 equirect 世界于球面） ---
// 球体像素按其屏幕 NDC 位置映射为 (方位角, 俯仰角) 再采样立方体贴图，
// 因而球心显示正前方山景、球下半部显示地面、上半部显示天空，两侧景色绕球包裹。
const planetMat = new THREE.ShaderMaterial({
  uniforms: {
    uCube: { value: cubeRT.texture },
    uForward: { value: new THREE.Vector3(0, 0, -1) },
    uRight: { value: new THREE.Vector3(1, 0, 0) },
    uUp: { value: new THREE.Vector3(0, 1, 0) },
    uHorizHalf: { value: Math.PI / 2 },   // 前半球 ±90°
    uVertHalf: { value: 1.1 },            // 垂直 ±63°
  },
  vertexShader: `
    varying vec2 vNDC;
    void main() {
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      vNDC = gl_Position.xy / gl_Position.w;
    }
  `,
  fragmentShader: `
    uniform samplerCube uCube;
    uniform vec3 uForward;
    uniform vec3 uRight;
    uniform vec3 uUp;
    uniform float uHorizHalf;
    uniform float uVertHalf;
    varying vec2 vNDC;
    void main() {
      float az = vNDC.x * uHorizHalf;
      float el = vNDC.y * uVertHalf;
      vec3 dir = normalize(
        uForward * (cos(el) * cos(az)) +
        uRight   * (cos(el) * sin(az)) +
        uUp      * sin(el)
      );
      gl_FragColor = vec4(textureCube(uCube, dir).rgb, 1.0);
      #include <colorspace_fragment>
    }
  `,
  side: THREE.FrontSide,
});
const planet = new THREE.Mesh(new THREE.SphereGeometry(40, 48, 32), planetMat);
planet.name = 'panoPlanet';
planet.frustumCulled = false;
planet.visible = false;

// 超全景相机看向的目标（星球中心），供 ui.js 每帧使用
export const panoLookAt = new THREE.Vector3(0, 30, -60);

export function isPanoActive() { return active; }

// 切换全景模式：'single' | 'dual' | 'super'
export function setPanoMode(m) {
  mode = m;
  scene.remove(equirectQuad);
  scene.remove(planet);
  if (m === 'dual' || m === 'super') {
    active = true;
    if (m === 'dual') {
      equirectQuad.visible = true;
      planet.visible = false;
      scene.add(equirectQuad);
    } else {
      planet.visible = true;
      equirectQuad.visible = false;
      scene.add(planet);
    }
  } else {
    active = false;
    equirectQuad.visible = false;
    planet.visible = false;
  }
}

// 切机型 / 切地图 / 结束时调用：回到单镜头普通渲染
export function resetPano() {
  setPanoMode('single');
}

let captureCounter = 0;
let lastCapturePos = new THREE.Vector3(1e9, 1e9, 1e9);

// 每帧更新：刷新 quad/planet 的 uniform、星球位置，并节流重渲立方体贴图
export function updatePanoCube() {
  if (!active) return;

  const yaw = state.droneYaw;

  // 双镜头 quad：前向 + 云台俯仰构造正交基
  const forward = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
  const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
  const up = new THREE.Vector3(0, 1, 0);
  if (mode === 'dual' && state.gimbalPitch !== 0) {
    const pitchRad = state.gimbalPitch * Math.PI / 180;
    forward.applyAxisAngle(right, pitchRad);
    up.applyAxisAngle(right, pitchRad);
  }
  equirectMat.uniforms.uForward.value.copy(forward);
  equirectMat.uniforms.uRight.value.copy(right);
  equirectMat.uniforms.uUp.value.copy(up);

  // 超全景星球：置于无人机前方稍高处（球浮于蓝天前），相机看向它
  if (mode === 'super') {
    planetMat.uniforms.uForward.value.copy(forward);
    planetMat.uniforms.uRight.value.copy(right);
    planetMat.uniforms.uUp.value.copy(up);
    planet.position.copy(state.dronePos);
    planet.position.addScaledVector(forward, 90);
    planet.position.y += 35;
    panoLookAt.copy(planet.position);
  }

  // cube 重渲节流：每 2 帧一次，或位移超过 1.5 立即重渲（6 面 + 阴影较贵）
  captureCounter++;
  const moved = state.dronePos.distanceTo(lastCapturePos);
  if (captureCounter % 2 !== 0 && moved < 1.5) return;
  captureCounter = 0;
  lastCapturePos.copy(state.dronePos);

  // 拍摄时隐藏全景网格与机身，避免被拍进画面
  const qv = equirectQuad.visible, pv = planet.visible, dv = droneGroup.visible;
  equirectQuad.visible = false;
  planet.visible = false;
  droneGroup.visible = false;

  cubeCamera.position.copy(state.dronePos);
  cubeCamera.update(renderer, scene);

  equirectQuad.visible = qv;
  planet.visible = pv;
  droneGroup.visible = dv;
}
