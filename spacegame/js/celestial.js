// 天体场景：太阳系（太阳 + 8 行星 + 月球 + 土星环）、银河系、星系图鉴
// 全部程序化纹理，不依赖图片资源。视觉比例用于展示（非真实比例）。
import * as THREE from 'three';
import { scene, sunLight } from './engine.js';
import { BODIES, GALAXIES, state } from './config.js';

export const SOLAR_UNIT = 62;     // 1 AU 的压缩基准（sqrt 压缩，保证可见）
export const GALAXY_DIST = 46000; // 银河系距原点

export const celestial = {};      // id -> { group, mesh, ring, labelAnchor, data }
export const groups = { solar: new THREE.Group(), galaxy: new THREE.Group(), local: new THREE.Group() };
let galaxySpiral = null;
let issStation = null;
let orbitLines = [];
let labelAnchors = {};

// === 程序化纹理 ===
function makeCanvas(size = 256) {
  const c = document.createElement('canvas');
  c.width = size; c.height = size;
  return { c, ctx: c.getContext('2d') };
}

function noiseBands(ctx, s, colors, wobble = 6) {
  const h = s / colors.length;
  colors.forEach((col, i) => {
    ctx.fillStyle = col;
    ctx.fillRect(0, i * h, s, h + 1);
  });
  for (let i = 0; i < 60; i++) {
    const y = Math.random() * s;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.bezierCurveTo(s * 0.3, y + (Math.random() - 0.5) * wobble, s * 0.7, y + (Math.random() - 0.5) * wobble, s, y + (Math.random() - 0.5) * wobble);
    ctx.strokeStyle = `rgba(255,255,255,${0.03 + Math.random() * 0.06})`;
    ctx.lineWidth = 2 + Math.random() * 8;
    ctx.stroke();
  }
}

function drawEarth(ctx, s) {
  ctx.fillStyle = '#123a7a'; ctx.fillRect(0, 0, s, s);
  const blobs = [
    [0.30, 0.24, 0.17, 0.19], [0.40, 0.55, 0.10, 0.32], [0.56, 0.28, 0.13, 0.16],
    [0.60, 0.55, 0.13, 0.28], [0.76, 0.33, 0.19, 0.22], [0.86, 0.66, 0.11, 0.11],
  ];
  blobs.forEach(([cx, cy, rx, ry]) => {
    ctx.beginPath();
    ctx.ellipse(cx * s, cy * s, rx * s, ry * s, Math.random() * 0.4, 0, Math.PI * 2);
    const g = 90 + Math.random() * 60;
    ctx.fillStyle = `rgb(${40 + Math.random() * 30},${g},${50 + Math.random() * 30})`;
    ctx.fill();
  });
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.fillRect(0, 0, s, s * 0.07); ctx.fillRect(0, s * 0.93, s, s * 0.07);
  for (let i = 0; i < 22; i++) {
    ctx.beginPath();
    ctx.arc(Math.random() * s, Math.random() * s, 8 + Math.random() * 26, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.22)'; ctx.fill();
  }
}

function drawMoon(ctx, s) {
  ctx.fillStyle = '#b6b6bd'; ctx.fillRect(0, 0, s, s);
  for (let i = 0; i < 90; i++) {
    const x = Math.random() * s, y = Math.random() * s, r = 2 + Math.random() * 16;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(${110 + Math.random() * 50},${110 + Math.random() * 50},${120 + Math.random() * 50},0.5)`;
    ctx.fill();
    ctx.strokeStyle = 'rgba(90,90,100,0.35)'; ctx.lineWidth = 1; ctx.stroke();
  }
}

function drawMercury(ctx, s) {
  ctx.fillStyle = '#8f8f92'; ctx.fillRect(0, 0, s, s);
  for (let i = 0; i < 70; i++) {
    const x = Math.random() * s, y = Math.random() * s, r = 3 + Math.random() * 20;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(${80 + Math.random() * 40},${80 + Math.random() * 40},${80 + Math.random() * 40},0.45)`;
    ctx.fill();
  }
}

function drawVenus(ctx, s) {
  ctx.fillStyle = '#e8d080'; ctx.fillRect(0, 0, s, s);
  noiseBands(ctx, s, ['#e8d080', '#dcc06a', '#efdba0', '#d2b258', '#e6ce88'], 40);
}

function drawMars(ctx, s) {
  ctx.fillStyle = '#b4562f'; ctx.fillRect(0, 0, s, s);
  for (let i = 0; i < 55; i++) {
    ctx.beginPath();
    ctx.arc(Math.random() * s, Math.random() * s, 3 + Math.random() * 22, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(${150 + Math.random() * 50},${70 + Math.random() * 30},${40 + Math.random() * 20},0.35)`;
    ctx.fill();
  }
  ctx.fillStyle = 'rgba(240,240,245,0.75)';
  ctx.fillRect(0, 0, s, s * 0.05); ctx.fillRect(0, s * 0.95, s, s * 0.05);
}

function drawJupiter(ctx, s) {
  noiseBands(ctx, s, ['#c9a26b', '#b98b52', '#e0cba0', '#a97a42', '#efdfc4', '#9c6a34', '#d9bd8e', '#c69459'], 10);
  ctx.beginPath(); ctx.ellipse(s * 0.66, s * 0.58, s * 0.14, s * 0.08, 0.1, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(196,86,54,0.75)'; ctx.fill();
}

function drawSaturn(ctx, s) {
  noiseBands(ctx, s, ['#e3d090', '#d6bd74', '#efe2ad', '#c9ab5e', '#ddca92'], 8);
}

function drawUranus(ctx, s) {
  ctx.fillStyle = '#8fd0dd'; ctx.fillRect(0, 0, s, s);
  noiseBands(ctx, s, ['#8fd0dd', '#86c8d6', '#98d8e4'], 20);
}

function drawNeptune(ctx, s) {
  ctx.fillStyle = '#3f60cf'; ctx.fillRect(0, 0, s, s);
  noiseBands(ctx, s, ['#3f60cf', '#3857c0', '#4a6bd8'], 22);
  ctx.beginPath(); ctx.ellipse(s * 0.42, s * 0.46, s * 0.09, s * 0.06, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(20,30,90,0.5)'; ctx.fill();
}

function drawSun(ctx, s) {
  ctx.fillStyle = '#ffd257'; ctx.fillRect(0, 0, s, s);
  for (let i = 0; i < 120; i++) {
    ctx.beginPath();
    ctx.arc(Math.random() * s, Math.random() * s, 4 + Math.random() * 22, 0, Math.PI * 2);
    ctx.fillStyle = Math.random() < 0.5 ? 'rgba(255,240,180,0.35)' : 'rgba(255,160,40,0.3)';
    ctx.fill();
  }
}

const TEXTURE_PAINTERS = {
  earth: drawEarth, moon: drawMoon, mercury: drawMercury, venus: drawVenus,
  mars: drawMars, jupiter: drawJupiter, saturn: drawSaturn, uranus: drawUranus,
  neptune: drawNeptune, sun: drawSun,
};

function planetTexture(key) {
  const { c, ctx } = makeCanvas(256);
  (TEXTURE_PAINTERS[key] || drawMoon)(ctx, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.anisotropy = 4;
  return tex;
}

function ringTexture(layers = 6) {
  const s = 512;
  const { c, ctx } = makeCanvas(s);
  ctx.clearRect(0, 0, s, s);
  const cx = s / 2, cy = s / 2;
  for (let i = 0; i < layers; i++) {
    const innerR = 70 + i * (s * 0.3 / layers);
    const outerR = innerR + s * 0.12 + Math.random() * 10;
    ctx.beginPath();
    ctx.arc(cx, cy, outerR, 0, Math.PI * 2);
    ctx.arc(cx, cy, innerR, Math.PI * 2, 0, true);
    const a = 0.18 + Math.random() * 0.4;
    ctx.fillStyle = `rgba(${200 + Math.random() * 40 | 0},${180 + Math.random() * 40 | 0},${130 + Math.random() * 40 | 0},${a})`;
    ctx.fill();
  }
  return new THREE.CanvasTexture(c);
}

// === 构建太阳系 ===
// 视觉位置：sqrt(AU) 压缩，让内外行星都能看见
export function orbitRadiusFor(au) {
  return Math.sqrt(Math.max(au, 0)) * SOLAR_UNIT * 1.15;
}

function makeBody(data) {
  const group = new THREE.Group();
  const isSun = data.id === 'sun';
  const geo = new THREE.SphereGeometry(data.visualR, 48, 48);
  const mat = isSun
    ? new THREE.MeshBasicMaterial({ map: planetTexture('sun') })
    : new THREE.MeshStandardMaterial({ map: planetTexture(data.texture), roughness: 0.85, metalness: 0.05 });
  const mesh = new THREE.Mesh(geo, mat);
  group.add(mesh);

  if (isSun) {
    const glow = new THREE.Mesh(
      new THREE.SphereGeometry(data.visualR * 1.4, 32, 32),
      new THREE.MeshBasicMaterial({ color: 0xffaa33, transparent: true, opacity: 0.14 })
    );
    group.add(glow);
    group.userData.glow = glow;
  }

  let ring = null;
  if (data.hasRings) {
    const inner = data.visualR * (data.ringInner || 1.4);
    const outer = data.visualR * (data.ringOuter || 2.4);
    ring = new THREE.Mesh(
      new THREE.RingGeometry(inner, outer, 96),
      new THREE.MeshBasicMaterial({ map: ringTexture(data.id === 'saturn' ? 7 : 3), side: THREE.DoubleSide, transparent: true, opacity: 0.85 })
    );
    ring.rotation.x = Math.PI / 2 - (data.id === 'uranus' ? 1.6 : 0.47);
    group.add(ring);
  }

  return { group, mesh, ring };
}

export function buildSolarSystem() {
  const sunData = BODIES.find(b => b.id === 'sun');
  const sunObj = makeBody(sunData);
  sunObj.group.position.set(0, 0, 0);
  groups.solar.add(sunObj.group);
  celestial.sun = { ...sunObj, data: sunData, orbitR: 0 };
  labelAnchors.sun = sunObj.group;

  const angle0 = {};
  BODIES.forEach((data, i) => {
    if (data.id === 'sun' || data.id === 'moon' || data.id === 'voyager') return;
    const r = orbitRadiusFor(data.au);
    const a = (i * 0.9) % (Math.PI * 2);
    angle0[data.id] = a;

    const obj = makeBody(data);
    obj.group.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
    groups.solar.add(obj.group);

    // 轨道线
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(r - 0.15, r + 0.15, 200),
      new THREE.MeshBasicMaterial({ color: 0x2b4a6b, side: THREE.DoubleSide, transparent: true, opacity: 0.5 })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.userData.isOrbit = true;
    groups.solar.add(ring);
    orbitLines.push(ring);

    obj.group.userData.orbitR = r;
    obj.group.userData.baseAngle = a;
    obj.group.userData.speed = 1 / Math.max(data.periodDays, 1);
    celestial[data.id] = { ...obj, data, orbitR: r };
    labelAnchors[data.id] = obj.group;
  });

  // 月球：绕地球
  const moonData = BODIES.find(b => b.id === 'moon');
  const moonObj = makeBody(moonData);
  const earthGroup = celestial.earth.group;
  earthGroup.add(moonObj.group);
  moonObj.group.position.set(moonData.visualR * 3.2 + 3, 0.6, 0);
  celestial.moon = { ...moonObj, data: moonData, orbitR: 8 };
  labelAnchors.moon = moonObj.group;
  earthGroup.userData.moon = moonObj.group;

  // 旅行者1号：深空探测器模型
  const vData = BODIES.find(b => b.id === 'voyager');
  const voyager = buildVoyager(vData);
  voyager.group.position.set(orbitRadiusFor(30) * 1.6, 22, orbitRadiusFor(30) * 0.4);
  groups.solar.add(voyager.group);
  celestial.voyager = { ...voyager, data: vData, orbitR: voyager.group.position.length() };
  labelAnchors.voyager = voyager.group;

  // 国际空间站（近地轨道的卫星）
  issStation = buildISS();
  earthGroup.add(issStation);
  issStation.position.set(earthGroup.userData.moon ? 0 : 0, 0, moonData.visualR * 4 + 6);

  scene.add(groups.solar);
}

function buildVoyager(data) {
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0xcfc9a6, metalness: 0.5, roughness: 0.5 });
  group.add(new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.0, 0.8), bodyMat));

  const dish = new THREE.Mesh(
    new THREE.CylinderGeometry(2.2, 2.2, 0.18, 40),
    new THREE.MeshStandardMaterial({ color: 0xe6e2cc, side: THREE.DoubleSide, metalness: 0.3 })
  );
  dish.rotation.x = Math.PI / 2;
  dish.position.z = -1.4;
  group.add(dish);

  const boom = new THREE.Mesh(
    new THREE.CylinderGeometry(0.06, 0.06, 4, 8),
    new THREE.MeshStandardMaterial({ color: 0xaaaaaa })
  );
  boom.rotation.z = Math.PI / 2;
  boom.position.set(2.4, 0, 0);
  group.add(boom);

  // 信号波纹
  const rings = [];
  for (let i = 0; i < 4; i++) {
    const r = new THREE.Mesh(
      new THREE.RingGeometry(0.3, 0.55, 40),
      new THREE.MeshBasicMaterial({ color: 0x4aa8ff, transparent: true, opacity: 0.0, side: THREE.DoubleSide })
    );
    r.rotation.x = Math.PI / 2;
    group.add(r);
    rings.push(r);
  }
  group.userData.signalRings = rings;
  return { group, mesh: group };
}

function buildISS() {
  const g = new THREE.Group();
  const truss = new THREE.Mesh(
    new THREE.BoxGeometry(3.4, 0.12, 0.12),
    new THREE.MeshStandardMaterial({ color: 0xbbbbbb, metalness: 0.7, roughness: 0.4 })
  );
  g.add(truss);
  const mod = new THREE.Mesh(
    new THREE.CylinderGeometry(0.22, 0.22, 1.0, 12),
    new THREE.MeshStandardMaterial({ color: 0xdddddd, metalness: 0.5 })
  );
  mod.rotation.z = Math.PI / 2;
  g.add(mod);
  for (const sx of [-1.9, 1.9]) {
    const panel = new THREE.Mesh(
      new THREE.BoxGeometry(1.4, 0.03, 0.7),
      new THREE.MeshStandardMaterial({ color: 0x2a3f8a, metalness: 0.6, roughness: 0.3 })
    );
    panel.position.set(sx, 0, 0);
    g.add(panel);
  }
  g.userData.speed = 2.4;
  return g;
}

// === 银河系（粒子旋臂）===
export function buildGalaxy() {
  const count = 14000;
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  const arms = 4;
  const base = new THREE.Color();

  for (let i = 0; i < count; i++) {
    const arm = i % arms;
    const t = Math.pow(Math.random(), 0.6);
    const radius = 1200 + t * 9000;
    const spin = radius * 0.0016;
    const spread = 260 + t * 900;
    const angle = (arm / arms) * Math.PI * 2 + spin + (Math.random() - 0.5) * 0.45;
    pos[i*3] = Math.cos(angle) * radius + (Math.random() - 0.5) * spread;
    pos[i*3+1] = (Math.random() - 0.5) * (240 + t * 260);
    pos[i*3+2] = Math.sin(angle) * radius + (Math.random() - 0.5) * spread;

    const core = 1 - Math.min(t * 1.8, 1);
    base.setHSL(0.58 - core * 0.5, 0.35 + core * 0.25, 0.62 + core * 0.3);
    col[i*3] = base.r; col[i*3+1] = base.g; col[i*3+2] = base.b;
  }

  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const mat = new THREE.PointsMaterial({ size: 90, vertexColors: true, transparent: true, opacity: 0.85, depthWrite: false });
  galaxySpiral = new THREE.Points(geo, mat);

  const core = new THREE.Mesh(
    new THREE.SphereGeometry(420, 32, 32),
    new THREE.MeshBasicMaterial({ color: 0xfff0c8, transparent: true, opacity: 0.9 })
  );
  const glow = new THREE.Mesh(
    new THREE.SphereGeometry(900, 32, 32),
    new THREE.MeshBasicMaterial({ color: 0xffd080, transparent: true, opacity: 0.16 })
  );
  const g = new THREE.Group();
  g.add(galaxySpiral, core, glow);
  g.position.set(0, -2000, 0);
  groups.galaxy.add(g);
  scene.add(groups.galaxy);

  // 星系图鉴：远处的示意星系
  GALAXIES.forEach((gal, i) => {
    const a = (i / GALAXIES.length) * Math.PI * 2;
    const r = GALAXY_DIST * (0.6 + (i % 3) * 0.35);
    const sprite = makeGalaxySprite(gal);
    sprite.position.set(Math.cos(a) * r, (i % 2 ? 1 : -1) * 6000, Math.sin(a) * r);
    sprite.userData.galaxy = gal;
    groups.local.add(sprite);
    labelAnchors[gal.id] = sprite;
    celestial[gal.id] = { group: sprite, mesh: sprite, data: { id: gal.id, name: gal.name, en: gal.en, category: '星系图鉴', description: gal.desc, stats: [['类型', gal.type, '']], visualR: 1200, color: gal.color }, orbitR: 0, isGalaxy: true };
  });
  scene.add(groups.local);
}

function makeGalaxySprite(gal) {
  const size = 256;
  const { c, ctx } = makeCanvas(size);
  const cx = size / 2, cy = size / 2;
  ctx.translate(cx, cy);
  ctx.rotate(Math.random() * Math.PI);
  const grad = ctx.createRadialGradient(0, 0, 4, 0, 0, cx);
  grad.addColorStop(0, '#fffbe8');
  grad.addColorStop(0.35, gal.color);
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grad;
  for (let a = 0; a < Math.PI * 2; a += 0.08) {
    const rr = cx * (0.35 + 0.65 * Math.abs(Math.cos(a * 2)));
    ctx.beginPath();
    ctx.ellipse(0, 0, rr, rr * 0.4, a, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.globalAlpha = 0.04;
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  ctx.beginPath(); ctx.arc(0, 0, cx * 0.9, 0, Math.PI * 2); ctx.fillStyle = grad; ctx.fill();

  const tex = new THREE.CanvasTexture(c);
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 0.9, depthWrite: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(5200, 5200, 1);
  return sprite;
}

// === 动画 ===
export function animateCelestial(dt, elapsed) {
  const t = dt * state.timeScale;
  BODIES.forEach(data => {
    if (data.id === 'sun' || data.id === 'moon' || data.id === 'voyager') return;
    const obj = celestial[data.id];
    if (!obj) return;
    const g = obj.group;
    const a = g.userData.baseAngle + elapsed * 0.02 * state.timeScale * Math.sqrt(1 / Math.max(data.periodDays / 365, 1)) * 0.15;
    g.position.set(Math.cos(a) * obj.orbitR, 0, Math.sin(a) * obj.orbitR);
    obj.mesh.rotation.y += dt * 0.35 * state.timeScale;
  });

  // 月球绕地球
  if (celestial.moon && celestial.earth) {
    const m = celestial.moon.group;
    const a = elapsed * 0.5 * state.timeScale;
    m.position.set(Math.cos(a) * 7.5, Math.sin(a * 0.6) * 0.6, Math.sin(a) * 7.5);
    m.rotation.y += dt * 0.3 * state.timeScale;
  }

  // 空间站
  if (issStation) {
    const a = elapsed * issStation.userData.speed * state.timeScale;
    issStation.position.set(Math.cos(a) * 9, Math.sin(a) * 2.2, Math.sin(a) * 9);
  }

  // 旅行者信号波纹
  if (celestial.voyager) {
    const rings = celestial.voyager.group.userData.signalRings || [];
    rings.forEach((r, i) => {
      const phase = (elapsed * 0.5 + i * 0.7) % 3;
      const sc = 1 + phase * 2.2;
      r.scale.set(sc, sc, sc);
      r.material.opacity = Math.max(0, 0.55 - phase * 0.18);
    });
    celestial.voyager.group.rotation.y += dt * 0.1;
  }

  // 太阳呼吸
  if (celestial.sun && celestial.sun.group.userData.glow) {
    const p = 1 + Math.sin(elapsed * 1.6) * 0.03;
    celestial.sun.group.userData.glow.scale.set(p, p, p);
    celestial.sun.mesh.rotation.y += dt * 0.06;
  }

  // 银河缓慢自转
  if (galaxySpiral) {
    groups.galaxy.children[0].rotation.y += dt * 0.006 * state.timeScale;
  }
}

export function setOrbitsVisible(v) { orbitLines.forEach(l => { l.visible = !!v; }); }
export function setSatellitesVisible(v) {
  if (issStation) issStation.visible = !!v;
  if (celestial.voyager) celestial.voyager.group.visible = !!v;
}
export function getLabelAnchors() { return labelAnchors; }

export function initCelestial() {
  buildSolarSystem();
  buildGalaxy();
  setOrbitsVisible(state.layers.orbits);
  setSatellitesVisible(state.layers.satellites);
}
