// 启动、场景/相机/光照、菜单展示、游戏循环与调试钩子
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import {
  AIRCRAFT, MAPS, VIEWS, DEFAULT_STATE, clamp, damp
} from './config.js';
import { preloadModels, hasModel, createAircraftInstance } from './assets.js';
import { buildWorld, makeStars } from './world.js';
import { latLonFromDir, isLandAt } from './earth.js';
import {
  createPlayer, updatePlayer, startAutoTakeoff, toggleVTOL, playerHUD
} from './flight.js';
import { createEffects } from './effects.js';
import { createCombat } from './combat.js';
import { createUI } from './ui.js';
import { audio } from './audio.js';

const TEST = new URLSearchParams(location.search).has('test');
const isCoarse = window.matchMedia('(pointer: coarse)').matches;
const isSmall = window.innerWidth < 820;
const isMobile = isCoarse || isSmall;

const state = { ...DEFAULT_STATE };

let renderer, scene, camera, sun, hemi, sky, stars;
let world = null;
let menuPlayer = null;
let player = null;
let effects = null;
let combat = null;
let ui = null;
let ready = false;
let phase = 'loading';
let menuAngle = 0.8;
let viewIndex = 0;
let currentView = 'chase';
let crashTimer = 0;
let crashShake = 0;
let victoryTime = 0;
let time = 0;
let last = performance.now();
let rainSoundOn = false;

const clockTarget = new THREE.Vector3();
const camDesired = new THREE.Vector3();
const camLook = new THREE.Vector3();
const camForward = new THREE.Vector3(0, 0, -1);
const WORLD_UP = new THREE.Vector3(0, 1, 0);
let camForwardReady = false;

function resetCameraFollow() {
  camForwardReady = false;
}

function specOf(key = state.aircraft) { return AIRCRAFT[key]; }

// ---------- 场景 ----------
function setupRenderer() {
  const canvas = document.getElementById('scene');
  renderer = new THREE.WebGLRenderer({
    canvas, antialias: !isMobile, powerPreference: 'high-performance'
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isMobile ? 1.35 : 1.75));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.85;
  renderer.shadowMap.enabled = !isMobile;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xbcd6e8, 140, 2800);
  scene.background = new THREE.Color(0xbcd6e8);

  // 给金属材质一点环境反射，否则战机模型会发黑
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();

  camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.5, 60000);
  camera.position.set(30, 18, 40);

  hemi = new THREE.HemisphereLight(0xbfe4ff, 0x4a5a3a, 0.85);
  scene.add(hemi);

  sun = new THREE.DirectionalLight(0xfff2d4, 2.2);
  sun.position.set(140, 190, 90);
  sun.castShadow = !isMobile;
  sun.shadow.mapSize.set(isMobile ? 1024 : 2048, isMobile ? 1024 : 2048);
  sun.shadow.camera.left = -150;
  sun.shadow.camera.right = 150;
  sun.shadow.camera.top = 150;
  sun.shadow.camera.bottom = -150;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 700;
  sun.shadow.bias = -0.0004;
  scene.add(sun);
  scene.add(sun.target);

  const skyGeo = new THREE.SphereGeometry(12000, 32, 20);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      topColor: { value: new THREE.Color('#2f7fc4') },
      bottomColor: { value: new THREE.Color('#cfe9ff') },
      offset: { value: 120 },
      exponent: { value: 0.8 }
    },
    vertexShader: `
      varying vec3 vLocalPosition;
      void main() {
        vLocalPosition = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 topColor;
      uniform vec3 bottomColor;
      uniform float offset;
      uniform float exponent;
      varying vec3 vLocalPosition;
      void main() {
        float h = normalize(vLocalPosition + vec3(0.0, offset, 0.0)).y;
        float f = max(pow(max(h, 0.0), exponent), 0.0);
        gl_FragColor = vec4(mix(bottomColor, topColor, f), 1.0);
      }
    `
  });
  sky = new THREE.Mesh(skyGeo, skyMat);
  sky.frustumCulled = false;
  sky.renderOrder = -10;
  scene.add(sky);

  stars = makeStars(scene);
  stars.visible = false;

  window.addEventListener('resize', onResize);
  window.addEventListener('orientationchange', () => setTimeout(onResize, 120));
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && phase === 'flying') pauseGame();
  });
}

function onResize() {
  if (!renderer) return;
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.fov = camera.aspect < 1 ? 62 : 55;
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isMobile ? 1.35 : 1.75));
  renderer.setSize(window.innerWidth, window.innerHeight);
}

// ---------- 天气/光照 ----------
function applyWeather() {
  if (!scene) return;
  const night = state.time === 'night';
  const rain = !!state.rain;
  const volcano = state.map === 'volcano';
  const b = clamp((state.brightness - 30) / 70, 0, 1);

  let top;
  let bottom;
  if (night) {
    top = new THREE.Color(volcano ? '#150807' : '#030812');
    bottom = new THREE.Color(volcano ? '#3a140d' : '#0d2036');
  } else if (rain) {
    top = new THREE.Color('#5a7182');
    bottom = new THREE.Color('#b9c8d1');
  } else {
    top = new THREE.Color(volcano ? '#3a2a26' : '#2f7fc4');
    bottom = new THREE.Color(volcano ? '#9a7c68' : '#d3ebff');
  }
  const dim = 0.55 + b * 0.45;
  top.multiplyScalar(dim);
  bottom.multiplyScalar(dim);
  sky.material.uniforms.topColor.value.copy(top);
  sky.material.uniforms.bottomColor.value.copy(bottom);

  scene.background.copy(bottom);
  scene.fog.color.copy(bottom).lerp(new THREE.Color('#6f8798'), rain ? 0.4 : 0.12);
  scene.fog.near = rain ? 80 : 150;
  scene.fog.far = rain ? 1800 : night ? 3200 : 4400;

  sun.color.set(night ? '#9db8ff' : rain ? '#d7e2ea' : '#fff2d4');
  sun.intensity = (night ? 0.5 : 2.3) * (rain ? 0.55 : 1) * (0.45 + b * 0.75);
  hemi.color.set(night ? '#23405e' : rain ? '#aebfcc' : '#bfe4ff');
  hemi.groundColor.set(night ? '#151a1f' : '#4a5a3a');
  hemi.intensity = (night ? 0.28 : 0.9) * (rain ? 0.75 : 1) * (0.55 + b * 0.6);

  renderer.toneMappingExposure = 0.62 + b * 0.42 + (night ? 0.05 : 0);
  stars.visible = night;
  stars.material.opacity = night ? 0.9 : 0;

  if (effects) {
    effects.setRain(rain);
    effects.setAsh(volcano);
  }
  syncRainSound(rain && (phase === 'flying' || phase === 'paused' || phase === 'crashed'));
}

function syncRainSound(on) {
  if (on === rainSoundOn) return;
  rainSoundOn = on;
  if (audio.ready) audio.setRain(on);
}

// ---------- 世界/菜单 ----------
function buildWorldForMenu() {
  if (menuPlayer) {
    scene.remove(menuPlayer.object);
    menuPlayer = null;
  }
  if (world) scene.remove(world.group);

  world = buildWorld(state.map, {
    makeParkedAircraft: () => createAircraftInstance(AIRCRAFT.f35b)
  });
  scene.add(world.group);
  if (effects) effects.setPlanetRadius(world.radius);
  menuPlayer = createPlayer(specOf(), world, scene);
  resetCameraFollow();
  menuAngle = 0.8;
  applyWeather();
  updateMenuCamera(0);
}

function replaceMenuAircraft() {
  if (!menuPlayer) return;
  scene.remove(menuPlayer.object);
  menuPlayer = createPlayer(specOf(), world, scene);
  resetCameraFollow();
  updateMenuCamera(0);
}

function updateMenuCamera(dt) {
  if (!menuPlayer) return;
  const spec = menuPlayer.spec;
  const targetFov = camera.aspect < 1 ? 62 : 55;
  camera.fov = damp(camera.fov, targetFov, 3, dt);
  camera.updateProjectionMatrix();
  const p = menuPlayer.object.position;
  const b = world.basisAt(p);
  menuAngle += dt * 0.16;
  const radius = spec.category === 'airliner' ? 95 : spec.category === 'prop' ? 26 : 37;
  const height = spec.category === 'airliner' ? 30 : 10 + spec.halfHeight * 0.9;
  camDesired.copy(p)
    .addScaledVector(b.east, Math.cos(menuAngle) * radius)
    .addScaledVector(b.north, Math.sin(menuAngle) * radius)
    .addScaledVector(b.up, height);
  const s = world.surfaceAtPosition(camDesired);
  if (camDesired.length() < s.h + 3) camDesired.setLength(s.h + 3);
  camera.position.lerp(camDesired, dt > 0 ? Math.min(1, dt * 6) : 1);
  camera.up.copy(b.up);
  camLook.copy(p).addScaledVector(b.up, 1.1);
  camera.lookAt(camLook);
  const prop = menuPlayer.object.userData.propeller;
  if (prop) prop.rotation.z += dt * 1.6;
}

// ---------- 相机 ----------
function setView(id) {
  currentView = id;
  const found = VIEWS.find((v) => v.id === id);
  ui.setViewLabel(found ? found.name : '追尾视角');
  document.body.classList.toggle('cockpit-view', id === 'cockpit' && phase === 'flying');
  if (player) {
    player.object.visible = id !== 'cockpit';
  }
}

function currentViews() {
  return specOf().vtol ? ['chase', 'top', 'cockpit', 'rear'] : ['chase', 'top', 'cockpit'];
}

function cycleView() {
  const views = currentViews();
  viewIndex = (viewIndex + 1) % views.length;
  setView(views[viewIndex]);
  ui.toast(VIEWS.find((v) => v.id === currentView).name, '', 1200);
}

function updateCamera(dt) {
  if (!player) return;
  const spec = player.spec;
  const p = player.object.position;
  const localUp = p.clone().normalize();

  // 速度感：速度越快视野越开阔
  const baseFov = camera.aspect < 1 ? 62 : 55;
  const speedFov = baseFov + clamp(player.speed / 380, 0, 1) * (currentView === 'cockpit' ? 7 : 9);
  camera.fov = damp(camera.fov, speedFov, 2.5, dt);
  camera.updateProjectionMatrix();

  // 机身水平朝前方向（忽略滚转），相机跟随它转到飞机后方
  const f = new THREE.Vector3(0, 0, -1).applyQuaternion(player.object.quaternion);
  let horiz = f.clone().addScaledVector(localUp, -f.dot(localUp));
  if (horiz.lengthSq() < 0.01) {
    horiz.copy(camForward).addScaledVector(localUp, -camForward.dot(localUp));
  }
  if (horiz.lengthSq() < 1e-6) {
    horiz.copy(world.basisAt(p).north);
  }
  horiz.normalize();
  if (!camForwardReady) {
    camForward.copy(horiz);
    camForwardReady = true;
  } else {
    camForward.addScaledVector(localUp, -camForward.dot(localUp));
    if (camForward.lengthSq() < 1e-6) camForward.copy(horiz);
    camForward.lerp(horiz, 1 - Math.exp(-3.4 * Math.max(dt, 0.0001)));
    camForward.addScaledVector(localUp, -camForward.dot(localUp)).normalize();
  }

  if (currentView === 'cockpit') {
    const cp = player.object.localToWorld(new THREE.Vector3(...spec.cockpit));
    camera.position.copy(cp);
    // 镜头保持当地水平，不随飞机滚转
    let lookDir = f.clone();
    let up = localUp.clone();
    if (Math.abs(lookDir.dot(up)) > 0.985) up = camForward.clone();
    camera.up.copy(up);
    camLook.copy(cp).addScaledVector(lookDir, 120);
    camera.lookAt(camLook);
    return;
  }

  let topView = false;
  if (currentView === 'top') {
    topView = true;
    const h = spec.category === 'airliner' ? 110 : camera.aspect < 1 ? 82 : 58;
    camDesired.copy(p).addScaledVector(localUp, h).addScaledVector(camForward, -6);
  } else if (currentView === 'rear') {
    const dist = spec.targetLength * 1.15 + 10;
    const h = player.halfHeight + 3.2;
    camDesired.copy(p).addScaledVector(camForward, -dist).addScaledVector(localUp, h);
  } else {
    const portrait = camera.aspect < 1 ? 1.5 : 1;
    const dist = (spec.category === 'airliner' ? 92 : spec.category === 'prop' ? 19 : 28) * portrait;
    const height = (spec.category === 'airliner' ? 30 : spec.category === 'prop' ? 7.5 : 10) * (portrait > 1 ? 1.18 : 1);
    camDesired.copy(p).addScaledVector(camForward, -dist).addScaledVector(localUp, height);
  }

  const s = world.surfaceAtPosition(camDesired);
  if (camDesired.length() < s.h + 2.2) camDesired.setLength(s.h + 2.2);
  if (camera.position.distanceTo(camDesired) > 1500) camera.position.copy(camDesired);
  else camera.position.lerp(camDesired, Math.min(1, dt * 6));
  const cs = world.surfaceAtPosition(camera.position);
  if (camera.position.length() < cs.h + 1.5) camera.position.setLength(cs.h + 1.5);

  if (topView) {
    camera.up.copy(camForward);
    camLook.copy(p).addScaledVector(localUp, 2);
  } else if (currentView === 'rear') {
    camera.up.copy(localUp);
    camLook.copy(p).addScaledVector(localUp, player.halfHeight * 0.6);
  } else {
    camera.up.copy(localUp);
    camLook.copy(p).addScaledVector(camForward, 26).addScaledVector(localUp, 2.2);
  }
  camera.lookAt(camLook);

  if (crashShake > 0) {
    const b = world.basisAt(camera.position);
    camera.position
      .addScaledVector(b.east, (Math.random() - 0.5) * crashShake)
      .addScaledVector(b.up, (Math.random() - 0.5) * crashShake)
      .addScaledVector(b.north, (Math.random() - 0.5) * crashShake);
  }
}

function updateVictoryCamera(dt) {
  if (!player) return;
  const p = player.object.position;
  const b = world.basisAt(p);
  victoryTime += dt;
  const a = victoryTime * 0.45 + 0.8;
  camDesired.copy(p)
    .addScaledVector(b.east, Math.cos(a) * 32)
    .addScaledVector(b.north, Math.sin(a) * 32)
    .addScaledVector(b.up, 12);
  const s = world.surfaceAtPosition(camDesired);
  if (camDesired.length() < s.h + 3) camDesired.setLength(s.h + 3);
  camera.position.lerp(camDesired, Math.min(1, dt * 3));
  camera.up.copy(b.up);
  camLook.copy(p).addScaledVector(b.up, 1.2);
  camera.lookAt(camLook);
}

// ---------- HUD ----------
function missionText() {
  if (state.mode === 'mission') {
    if (combat && combat.missionState === 'victory') return '任务完成！';
    return state.missionLevel === 1
      ? '任务：击毁敌方军舰'
      : '任务：击毁敌舰与全部敌机 · 躲避导弹';
  }
  const names = { mountain: '山川水林', volcano: '火山之夜', carrier: '航母海域' };
  return `自由飞行 · ${names[state.map] || ''}`;
}

function updateHUD() {
  if (!player || !ui) return;
  const hud = playerHUD(player);
  const spec = player.spec;
  const lock = combat ? combat.getLock(player) : null;
  ui.updateHUD({
    ...hud,
    ammo: player.missiles,
    heading: hud.heading,
    missionText: missionText(),
    objectives: combat ? combat.getObjectives(player) : [],
    lock: !!lock && phase === 'flying' && !player.onGround,
    stall: spec.stall,
    canTakeoff: phase === 'flying' && player.onGround && !!spec.autoTakeoff && !player.crashed,
    hasVtol: !!spec.vtol,
    hasMissiles: spec.missiles > 0,
    playerX: player.object.position.x,
    playerZ: player.object.position.z
  });
}

// ---------- 飞行控制 ----------
function doTakeoff() {
  if (phase !== 'flying' || !player || player.crashed) return;
  const spec = player.spec;
  if (!spec.autoTakeoff) {
    ui.toast('把油门推到最大，然后向后拉摇杆起飞', '', 2600);
    return;
  }
  if (!player.onGround) {
    ui.toast('已经在空中啦', '', 1200);
    return;
  }
  ui.setThrottle(1);
  player.throttle = 1;
  if (player.vtol) {
    ui.toast('VTOL：向后拉摇杆垂直升空', 'good', 2200);
    return;
  }
  if (startAutoTakeoff(player)) {
    ui.toast('起飞！', 'good', 1500);
  }
}

function onFire() {
  if (phase !== 'flying' || !player || !combat) return;
  if (player.crashed) return;
  if (player.missiles <= 0) {
    ui.toast(player.spec.missiles > 0 ? '导弹已经用完啦' : '这架飞机没有导弹', 'danger', 1600);
    return;
  }
  if (combat.firePlayerMissile(player)) {
    ui.toast('导弹发射！', '', 1000);
  }
}

function enterVtol(on) {
  if (!player || !player.spec.vtol || phase !== 'flying') return;
  if (on && !player.vtol) {
    toggleVTOL(player);
    const views = currentViews();
    viewIndex = views.indexOf('rear');
    if (viewIndex < 0) viewIndex = 0;
    setView('rear');
    ui.toast('VTOL 垂直起降已开启 · 摇杆控制升降与侧移', 'good', 2600);
    audio.play('click');
  } else if (!on && player.vtol) {
    toggleVTOL(player);
    viewIndex = 0;
    setView('chase');
    ui.toast('已恢复战斗飞行', '', 1600);
  }
}

function onVtolToggle() {
  if (!player) return;
  if (!player.spec.vtol) {
    ui.toast('这架飞机不支持垂直起降', '', 1500);
    return;
  }
  enterVtol(!player.vtol);
}

// ---------- 阶段 ----------
function setPhase(p) {
  phase = p;
  ui.setPhase(p);
}

function startFlight() {
  audio.ensure();
  audio.startMusic();
  audio.setScene('flight');

  if (menuPlayer) {
    scene.remove(menuPlayer.object);
    menuPlayer = null;
  }
  if (player) {
    scene.remove(player.object);
    player = null;
  }
  if (combat) {
    combat.clear();
    combat = null;
  }
  ui.hideCrash();
  ui.hideVictory();
  ui.hidePause();
  if (!world || world.mapId !== state.map) {
    if (world) scene.remove(world.group);
    world = buildWorld(state.map, {
      makeParkedAircraft: () => createAircraftInstance(AIRCRAFT.f35b)
    });
    scene.add(world.group);
  }
  effects.setPlanetRadius(world.radius);

  effects.clear();
  player = createPlayer(specOf(), world, scene);
  resetCameraFollow();
  combat = createCombat(scene, world, effects, combatCallbacks);
  combat.spawnFor({ mapId: state.map, gameMode: state.mode, missionLevel: state.missionLevel });
  effects.setRain(state.rain);
  effects.setAsh(state.map === 'volcano');

  ui.setThrottle(0);
  viewIndex = 0;
  setView('chase');
  crashTimer = 0;
  crashShake = 0;
  victoryTime = 0;
  setPhase('flying');
  updateCamera(1);
  updateHUD();
  audio.startEngine();
  const tip = player.spec.vtol
    ? '推油门滑跑，点「起飞」短距升空；长按 VTOL 悬停'
    : player.spec.category === 'fighter'
      ? '推油门滑跑，点「起飞」自动拉起'
      : '把油门推满，达到速度后向后拉摇杆起飞';
  ui.toast(tip, '', 3300);
}

function restartFlight() {
  if (!player || !world) return;
  ui.hideCrash();
  ui.hideVictory();
  ui.hidePause();
  scene.remove(player.object);
  effects.clear();
  player = createPlayer(specOf(), world, scene);
  resetCameraFollow();
  combat.clear();
  combat.spawnFor({ mapId: state.map, gameMode: state.mode, missionLevel: state.missionLevel });
  ui.setThrottle(0);
  viewIndex = 0;
  setView('chase');
  crashTimer = 0;
  crashShake = 0;
  victoryTime = 0;
  setPhase('flying');
  updateCamera(1);
  updateHUD();
  audio.startEngine();
  audio.setScene('flight');
  ui.toast('重新起飞！', 'good', 1600);
}

function exitToMenu() {
  document.body.classList.remove('cockpit-view');
  if (player) {
    scene.remove(player.object);
    player = null;
  }
  if (combat) combat.clear();
  effects.clear();
  audio.stopEngine();
  audio.setScene('menu');
  syncRainSound(false);
  setPhase('menu');
  if (!menuPlayer && world) {
    menuPlayer = createPlayer(specOf(), world, scene);
    resetCameraFollow();
  }
  ui.updateMenu();
  applyWeather();
}

function pauseGame() {
  if (phase !== 'flying') return;
  setPhase('paused');
  ui.showPause();
  audio.updateEngine({ on: false });
  syncRainSound(false);
}

function resumeGame() {
  if (phase !== 'paused') return;
  setPhase('flying');
  ui.hidePause();
  applyWeather();
}

function crashReasonText(reason) {
  switch (reason) {
    case 'missile': return '被敌方导弹击中，飞行员跳伞成功！';
    case 'water': return '飞机落入水中，救援队马上到！';
    case 'fuel': return '燃油耗尽，飞机迫降了。';
    default: return '飞机撞到了地面，再来一次吧！';
  }
}

function handlePlayerCrash(reason = 'crash') {
  if (!player || phase !== 'flying') return;
  player.crashed = true;
  player.crashTime = 0;
  player.engineOn = false;
  if (!player.object.visible) player.object.visible = true;
  setPhase('crashed');
  crashTimer = TEST ? 1.1 : 3.6;
  crashShake = 0.6;
  effects.crash(player);
  combat.onPlayerCrash();
  audio.stopEngine();
  syncRainSound(false);
  const title = player.spec.category === 'prop' ? '飞行员弹射逃生' : '飞机损毁';
  ui.showCrash(title, crashReasonText(reason));
  ui.setRestartCount(3);
}

function handleVictory(info) {
  if (!player || phase !== 'flying') return;
  setPhase('victory');
  audio.stopEngine();
  syncRainSound(false);
  victoryTime = 0;
  const total = ui.addFlower();
  ui.showVictory({
    winner: state.countryA,
    missionLevel: info.missionLevel,
    mode: info.mode,
    flowers: total
  });
}

const callbacks = {
  onCrash: (reason) => handlePlayerCrash(reason),
  onFuelOut: () => {
    ui.toast('燃油耗尽！飞机开始滑翔', 'danger', 3200);
    audio.play('fuelout');
  },
  onTakeoff: () => {
    ui.toast('起飞成功！', 'good', 1600);
    audio.play('takeoff');
  },
  onLand: () => ui.toast('平稳着陆！', 'good', 1600)
};

const combatCallbacks = {
  onVictory: (info) => handleVictory(info),
  onPlayerHit: () => handlePlayerCrash('missile'),
  onWarning: (msg) => ui.toast(msg, 'danger', 1500),
  onSfx: (name, opts) => audio.play(name, opts),
  onNoAmmo: () => ui.toast('导弹已经用完啦', 'danger', 1600),
  onKill: (t) => {
    ui.toast(t.type === 'ship' ? '敌舰被击毁！' : `${t.label} 被击毁！`, 'good', 1700);
  }
};

// ---------- 主循环 ----------
function animate(now) {
  const raw = (now - last) / 1000;
  last = now;
  const dt = Math.min(Math.max(raw, 0), 0.05);
  time += dt;

  if (phase === 'flying' && player) {
    ui.updateKeyboardThrottle(dt);
    const input = ui.getInput();
    updatePlayer(player, input, world, dt, callbacks);
    if (phase === 'flying' && combat) combat.update(dt, player);
    if (phase === 'flying') {
      updateCamera(dt);
      updateHUD();
      audio.updateEngine({
        speed: player.speed,
        throttle: player.throttle,
        vtolBlend: player.vtolBlend,
        on: true,
        engineOn: player.engineOn
      });
    }
  } else if (phase === 'crashed') {
    crashTimer -= dt;
    crashShake = Math.max(0, crashShake - dt * 0.35);
    const total = TEST ? 1.1 : 3.6;
    ui.setRestartCount(Math.max(0, Math.ceil(crashTimer / (total / 3))));
    crashShake = 0.35 + Math.sin(time * 32) * 0.12;
    updateCamera(dt);
    if (crashTimer <= 0) restartFlight();
  } else if (phase === 'victory') {
    updateVictoryCamera(dt);
  } else if (phase === 'menu') {
    updateMenuCamera(dt);
  }

  if (world) world.update(dt, time);
  if (effects) effects.update(dt, camera, time);

  const active = player || menuPlayer;
  if (active) {
    const p = active.object.position;
    const b = world ? world.basisAt(p) : { up: WORLD_UP.clone(), east: new THREE.Vector3(1, 0, 0), north: new THREE.Vector3(0, 0, 1) };
    sun.target.position.copy(p);
    sun.position.copy(p)
      .addScaledVector(b.east, 130)
      .addScaledVector(b.north, 80)
      .addScaledVector(b.up, 180);
    // 天空球与星空始终跟随镜头，球面上任何位置都有地平线
    sky.position.copy(camera.position);
    sky.quaternion.setFromUnitVectors(WORLD_UP, b.up);
    stars.position.copy(camera.position);
    if (world && effects) effects.setPlanetRadius(world.radius);
    // 飞得越高，雾的可见距离越远，才能看见整颗地球
    const alt = active.altitude || 0;
    const baseFar = state.rain ? 1800 : state.time === 'night' ? 3200 : 4400;
    scene.fog.far = baseFar + Math.max(0, alt) * 4;
  }

  if (audio.ready && (phase === 'flying' || phase === 'paused' || phase === 'crashed')) {
    syncRainSound(state.rain && phase === 'flying');
  }

  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

// ---------- 初始化 ----------
function initUI() {
  ui = createUI(state, {
    onSelectAircraft: (key) => {
      if (!AIRCRAFT[key]) return;
      state.aircraft = key;
      if (phase === 'menu') replaceMenuAircraft();
      ui.updateMenu();
    },
    onSelectMode: (mode) => {
      state.mode = mode;
      ui.updateMenu();
    },
    onSelectLevel: (level) => {
      state.missionLevel = level;
      ui.updateMenu();
    },
    onSelectMap: (map) => {
      if (!MAPS[map]) return;
      state.map = map;
      if (map === 'volcano') state.time = 'night';
      if (phase === 'menu') buildWorldForMenu();
      ui.updateMenu();
      applyWeather();
    },
    onTimeChange: (t) => {
      state.time = t;
      ui.updateMenu();
      applyWeather();
    },
    onTimeToggle: () => {
      state.time = state.time === 'night' ? 'day' : 'night';
      ui.updateMenu();
      applyWeather();
      ui.toast(state.time === 'night' ? '切换到黑夜' : '切换到白天', '', 1200);
    },
    onRainChange: (rain) => {
      state.rain = rain;
      ui.updateMenu();
      applyWeather();
    },
    onRainToggle: () => {
      state.rain = !state.rain;
      ui.updateMenu();
      applyWeather();
      ui.toast(state.rain ? '开始下雨了' : '雨停了', '', 1200);
    },
    onBrightness: (v) => {
      state.brightness = v;
      applyWeather();
    },
    onCountry: (side, country) => {
      if (side === 'a') state.countryA = country;
      else state.countryB = country;
      ui.updateMenu();
    },
    onMusicToggle: () => {
      state.music = !state.music;
      audio.setMusicEnabled(state.music);
      ui.updateMenu();
      if (state.music) ui.toast('音乐已开启', '', 1200);
    },
    onStart: () => startFlight(),
    onView: () => { if (phase === 'flying' || phase === 'paused') cycleView(); },
    onFire: () => onFire(),
    onTakeoff: () => doTakeoff(),
    onVtol: (on) => enterVtol(on),
    onVtolToggle: () => onVtolToggle(),
    onPause: () => {
      if (phase === 'flying') pauseGame();
      else if (phase === 'paused') resumeGame();
    },
    onResume: () => resumeGame(),
    onRestart: () => {
      if (phase === 'menu' || phase === 'loading') return;
      if (phase === 'victory' || phase === 'crashed') restartFlight();
      else if (phase === 'paused') restartFlight();
    },
    onExitMenu: () => exitToMenu(),
    isVtol: () => !!player && !!player.vtol
  });
}

function installDebug() {
  const debug = {
    get ready() { return ready; },
    get phase() { return phase; },
    get scene() { return scene; },
    get camera() { return camera; },
    get player() { return player; },
    get combat() { return combat; },
    get ui() { return ui; },
    get views() { return currentViews(); },
    get targetCount() { return combat ? combat.targetCount : 0; },
    get assets() {
      return {
        f35b: { loaded: hasModel('f35'), fallback: !hasModel('f35') },
        j20: { loaded: hasModel('su57'), fallback: !hasModel('su57') },
        j16: { loaded: hasModel('su35'), fallback: !hasModel('su35') },
        prop: { loaded: hasModel('c172'), fallback: !hasModel('c172') },
        airliner: { loaded: hasModel('airplane'), fallback: !hasModel('airplane') },
        ship: { loaded: hasModel('ship'), fallback: !hasModel('ship') }
      };
    },
    get snapshot() {
      const p = player;
      const burn = p ? p.spec.fuelBurn * (0.32 + 0.68 * p.throttle) : 0;
      const pos = p ? p.object.position : null;
      const localUp = pos ? pos.clone().normalize() : null;
      const fwd = p ? new THREE.Vector3(0, 0, -1).applyQuaternion(p.object.quaternion) : null;
      let horizFwd = null;
      let camBehindDot = 0;
      let cameraUpDotLocalUp = 0;
      if (p && pos && localUp) {
        horizFwd = fwd.clone().addScaledVector(localUp, -fwd.dot(localUp));
        if (horizFwd.lengthSq() > 1e-8) horizFwd.normalize();
        const toPlane = pos.clone().sub(camera.position);
        toPlane.addScaledVector(localUp, -toPlane.dot(localUp));
        if (toPlane.lengthSq() > 1e-8 && horizFwd.lengthSq() > 1e-8) {
          camBehindDot = toPlane.normalize().dot(horizFwd);
        }
        cameraUpDotLocalUp = camera.up.dot(localUp);
      }
      return {
        phase,
        aircraft: state.aircraft,
        map: state.map,
        mode: state.mode,
        missionLevel: state.missionLevel,
        altitude: p ? Math.max(0, p.altitude) : 0,
        speed: p ? p.speed : 0,
        fuelSec: p && burn > 0 ? p.fuel / burn : 0,
        ammo: p ? p.missiles : 0,
        targetsAlive: combat ? combat.targetCount : 0,
        missileCount: combat ? combat.missileCount : 0,
        enemyMissileCount: combat ? combat.enemyMissileCount : 0,
        view: currentView,
        vtol: p ? p.vtol : false,
        vtolBlend: p ? p.vtolBlend : 0,
        nozzleAngle: p ? p.nozzleAngle : 0,
        liftFanVisible: !!(p && p.vtol && p.object.userData.liftFan),
        onGround: p ? p.onGround : false,
        crashed: p ? p.crashed : false,
        missionState: combat ? combat.missionState : 'none',
        redFlowerVisible: !document.getElementById('victoryOverlay').classList.contains('hidden'),
        partsDetached: effects ? effects.debrisCount : 0,
        particles: effects ? effects.activeParticles : 0,
        flowers: ui ? ui.getFlowers() : 0,
        throttle: ui ? ui.getThrottle() : 0,
        cameraView: currentView,
        planetRadius: world ? world.radius : 0,
        worldMap: world ? world.mapId : null,
        spawnType: world ? world.surfaceAtPosition(world.spawn).type : null,
        spawnLat: world ? latLonFromDir(world.spawnDir).lat : null,
        spawnLon: world ? latLonFromDir(world.spawnDir).lon : null,
        spawnOnLand: world ? isLandAt(latLonFromDir(world.spawnDir).lat, latLonFromDir(world.spawnDir).lon) : false,
        earthVisible: !!(scene && scene.getObjectByName('earth')),
        planetDistance: pos ? pos.length() : 0,
        surfaceH: p && world ? world.surfaceAtPosition(pos).h : 0,
        groundR: p && world ? world.surfaceAtPosition(pos).h + p.halfHeight + 0.12 : 0,
        distanceTravelled: p ? p.distanceTravelled : 0,
        cameraUpDotLocalUp,
        camBehindDot,
        aircraftRollDeg: p ? (p.bank * 180) / Math.PI : 0,
        cameraForward: camera.getWorldDirection(new THREE.Vector3()).toArray(),
        aircraftForward: fwd ? fwd.toArray() : null
      };
    },
    setAircraft(key) {
      if (!AIRCRAFT[key]) return false;
      state.aircraft = key;
      if (phase === 'menu') replaceMenuAircraft();
      if (ui) ui.updateMenu();
      return true;
    },
    setMap(key) {
      if (!MAPS[key]) return false;
      state.map = key;
      if (key === 'volcano') state.time = 'night';
      if (phase === 'menu') buildWorldForMenu();
      if (ui) ui.updateMenu();
      applyWeather();
      return true;
    },
    setMode(mode) {
      if (!['mission', 'free'].includes(mode)) return false;
      state.mode = mode;
      if (ui) ui.updateMenu();
      return true;
    },
    setLevel(level) {
      if (![1, 2].includes(level)) return false;
      state.missionLevel = level;
      if (ui) ui.updateMenu();
      return true;
    },
    setWeather(time, rain, brightness) {
      if (time) state.time = time;
      if (typeof rain === 'boolean') state.rain = rain;
      if (typeof brightness === 'number') state.brightness = brightness;
      if (ui) ui.updateMenu();
      applyWeather();
      return true;
    },
    start() { startFlight(); return true; },
    takeoff() { doTakeoff(); return true; },
    setThrottle(v) { if (ui) ui.setThrottle(v); if (player) player.throttle = clamp(v, 0, 1); return true; },
    warpForward(meters = 5000) {
      if (!player || !world) return false;
      const p = player.object.position;
      const up = p.clone().normalize();
      const f = new THREE.Vector3(0, 0, -1).applyQuaternion(player.object.quaternion);
      const h = f.clone().addScaledVector(up, -f.dot(up));
      if (h.lengthSq() < 1e-8) return false;
      h.normalize();
      const arc = meters / world.radius;
      const nd = up.clone().multiplyScalar(Math.cos(arc)).addScaledVector(h, Math.sin(arc)).normalize();
      const np = nd.multiplyScalar(p.length());
      const surf = world.surfaceAtPosition(np);
      const minR = surf.h + player.halfHeight + 30;
      if (np.length() < minR) np.setLength(minR);
      player.object.position.copy(np);
      player.lastPos.copy(player.object.position);
      player.distanceTravelled += Math.abs(meters);
      return true;
    },
    cycleView() { cycleView(); return currentView; },
    fireMissile() { onFire(); return true; },
    enterVTOL() { enterVtol(true); return true; },
    exitVTOL() { enterVtol(false); return true; },
    crashNow() {
      if (!player) return false;
      if (phase === 'flying') handlePlayerCrash('crash');
      return true;
    },
    damageTarget(id, n = 1) {
      if (!combat) return false;
      const byId = combat.targets.find((t) => t.id === id);
      const t = byId || combat.targets[id];
      if (!t) return false;
      combat.damageTarget(t, n);
      return true;
    },
    destroyAllTargets() { if (combat) combat.destroyAllTargets(); },
    forceMissionWin() { if (combat) combat.forceMissionWin(); },
    restart() { restartFlight(); },
    exit() { exitToMenu(); },
    pause() { pauseGame(); },
    resume() { resumeGame(); }
  };
  window.__flightSimDebug = debug;
}

async function init() {
  setupRenderer();
  initUI();
  installDebug();

  effects = createEffects(scene);
  effects.sound.play = (name, opts) => audio.play(name, opts);

  ui.setLoading(0.03, '加载飞机模型…');
  await preloadModels((progress, name) => {
    ui.setLoading(0.03 + progress * 0.68, `加载 ${name} 模型 ${Math.round(progress * 100)}%`);
  });

  ui.setLoading(0.76, '生成山川、河流与跑道…');
  buildWorldForMenu();

  ui.setLoading(0.96, '准备起飞…');
  applyWeather();
  ui.updateMenu();
  setPhase('menu');
  ui.finishLoading();
  ready = true;

  window.addEventListener('pointerdown', () => {
    if (!audio.ready) {
      audio.ensure();
      if (state.music) audio.startMusic();
      audio.setScene(phase === 'menu' ? 'menu' : 'flight');
      if (rainSoundOn) audio.setRain(true);
    }
  }, { once: true });

  last = performance.now();
  requestAnimationFrame(animate);
}

init().catch((err) => {
  console.error('[virtual-flight] init failed', err);
  const text = document.getElementById('loadText');
  if (text) text.textContent = '加载失败：' + (err?.message || err);
});
