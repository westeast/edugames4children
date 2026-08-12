// Solar system: Sun, 8 planets + Pluto + Moon, rings (procedural textures)
import * as THREE from 'three';
import { scene } from './engine.js';
import { PLANETS, PLUTO, state } from './config.js';

const DIST_SCALE = 100; // 1 AU ≈ 100 game units (visual scale, not real)
const RADIUS_SCALE = 0.08; // Scale planet radii for visibility

// === Procedural texture generators ===
export function createPlanetTexture(name) {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  switch (name) {
    case '水星': drawMercury(ctx, size); break;
    case '金星': drawVenus(ctx, size); break;
    case '地球': drawEarth(ctx, size); break;
    case '火星': drawMars(ctx, size); break;
    case '木星': drawJupiter(ctx, size); break;
    case '土星': drawSaturn(ctx, size); break;
    case '天王星': drawUranus(ctx, size); break;
    case '海王星': drawNeptune(ctx, size); break;
    default: drawDefault(ctx, size); break;
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  return texture;
}

function drawMercury(ctx, s) {
  ctx.fillStyle = '#8a8a8a';
  ctx.fillRect(0, 0, s, s);
  // Craters
  for (let i = 0; i < 60; i++) {
    const x = Math.random() * s;
    const y = Math.random() * s;
    const r = 3 + Math.random() * 25;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(${60+Math.random()*40}, ${60+Math.random()*40}, ${60+Math.random()*40}, 0.5)`;
    ctx.fill();
    ctx.strokeStyle = 'rgba(40,40,40,0.3)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}

function drawVenus(ctx, s) {
  // Yellowish cloudy surface
  const grad = ctx.createLinearGradient(0, 0, s, s);
  grad.addColorStop(0, '#e8d070');
  grad.addColorStop(0.5, '#d4b860');
  grad.addColorStop(1, '#c8a840');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, s, s);
  // Cloud bands
  for (let i = 0; i < 30; i++) {
    const y = Math.random() * s;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.bezierCurveTo(s*0.25, y + (Math.random()-0.5)*40, s*0.75, y + (Math.random()-0.5)*40, s, y + (Math.random()-0.5)*20);
    ctx.strokeStyle = `rgba(${200+Math.random()*30}, ${180+Math.random()*30}, ${80+Math.random()*30}, 0.3)`;
    ctx.lineWidth = 8 + Math.random() * 20;
    ctx.stroke();
  }
}

function drawEarth(ctx, s) {
  // Ocean base
  ctx.fillStyle = '#1a44aa';
  ctx.fillRect(0, 0, s, s);
  // Continents (green/brown patches)
  const continents = [
    { cx: s*0.35, cy: s*0.25, rx: s*0.18, ry: s*0.2 },   // North America
    { cx: s*0.45, cy: s*0.55, rx: s*0.12, ry: s*0.35 },  // South America
    { cx: s*0.6,  cy: s*0.3,  rx: s*0.15, ry: s*0.18 },  // Europe
    { cx: s*0.62, cy: s*0.55, rx: s*0.14, ry: s*0.3 },   // Africa
    { cx: s*0.75, cy: s*0.35, rx: s*0.2,  ry: s*0.25 },  // Asia
    { cx: s*0.85, cy: s*0.65, rx: s*0.12, ry: s*0.12 },  // Australia
  ];
  continents.forEach(c => {
    ctx.beginPath();
    ctx.ellipse(c.cx, c.cy, c.rx, c.ry, Math.random()*0.3, 0, Math.PI*2);
    ctx.fillStyle = `rgb(${40+Math.random()*40}, ${100+Math.random()*60}, ${40+Math.random()*30})`;
    ctx.fill();
  });
  // Ice caps
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.fillRect(0, 0, s, s*0.08);
  ctx.fillRect(0, s*0.92, s, s*0.08);
  // Clouds
  for (let i = 0; i < 15; i++) {
    const x = Math.random() * s;
    const y = Math.random() * s;
    ctx.beginPath();
    ctx.arc(x, y, 15 + Math.random()*30, 0, Math.PI*2);
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.fill();
  }
}

function drawMars(ctx, s) {
  // Red desert surface
  const grad = ctx.createLinearGradient(0, 0, s, s);
  grad.addColorStop(0, '#cc6644');
  grad.addColorStop(0.5, '#b85533');
  grad.addColorStop(1, '#a04422');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, s, s);
  // Surface features
  for (let i = 0; i < 40; i++) {
    const x = Math.random() * s;
    const y = Math.random() * s;
    const r = 3 + Math.random() * 20;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI*2);
    ctx.fillStyle = `rgba(${140+Math.random()*50}, ${60+Math.random()*30}, ${30+Math.random()*20}, 0.4)`;
    ctx.fill();
  }
  // Polar ice caps
  ctx.fillStyle = 'rgba(230,230,240,0.5)';
  ctx.fillRect(0, 0, s, s*0.06);
  ctx.fillRect(0, s*0.94, s, s*0.06);
}

function drawJupiter(ctx, s) {
  // Jupiter bands + Great Red Spot
  const bandColors = ['#d4a46a','#c89050','#e8c890','#b07838','#f0dcc0','#a06828','#d8b888','#c09060'];
  const bandH = s / bandColors.length;
  bandColors.forEach((c, i) => {
    ctx.fillStyle = c;
    ctx.fillRect(0, i * bandH, s, bandH + 1);
  });
  // Turbulence within bands
  for (let i = 0; i < 50; i++) {
    const y = Math.random() * s;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.bezierCurveTo(s*0.2, y+(Math.random()-0.5)*15, s*0.8, y+(Math.random()-0.5)*15, s, y+(Math.random()-0.5)*10);
    const shade = 160 + Math.floor(Math.random()*40);
    ctx.strokeStyle = `rgba(${shade}, ${shade-30}, ${shade-80}, 0.2)`;
    ctx.lineWidth = 3 + Math.random()*8;
    ctx.stroke();
  }
  // Great Red Spot
  ctx.beginPath();
  ctx.ellipse(s*0.65, s*0.55, 35, 22, 0.1, 0, Math.PI*2);
  ctx.fillStyle = 'rgba(200,80,50,0.6)';
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(s*0.65, s*0.55, 25, 15, 0.1, 0, Math.PI*2);
  ctx.fillStyle = 'rgba(180,70,40,0.5)';
  ctx.fill();
}

function drawSaturn(ctx, s) {
  // Saturn bands (golden tones)
  const bandColors = ['#e8d088','#d4b868','#f0e0a0','#c8a850','#dcc890','#b89840','#e0cc80'];
  const bandH = s / bandColors.length;
  bandColors.forEach((c, i) => {
    ctx.fillStyle = c;
    ctx.fillRect(0, i * bandH, s, bandH + 1);
  });
  // Subtle turbulence
  for (let i = 0; i < 30; i++) {
    const y = Math.random() * s;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.bezierCurveTo(s*0.25, y+(Math.random()-0.5)*10, s*0.75, y+(Math.random()-0.5)*10, s, y+(Math.random()-0.5)*8);
    const shade = 180 + Math.floor(Math.random()*30);
    ctx.strokeStyle = `rgba(${shade}, ${shade-20}, ${shade-60}, 0.15)`;
    ctx.lineWidth = 4 + Math.random()*10;
    ctx.stroke();
  }
}

function drawUranus(ctx, s) {
  // Light blue-green (featureless)
  const grad = ctx.createLinearGradient(0, 0, 0, s);
  grad.addColorStop(0, '#98d8e8');
  grad.addColorStop(0.5, '#88ccdd');
  grad.addColorStop(1, '#70b8c8');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, s, s);
  // Subtle bands
  for (let i = 0; i < 5; i++) {
    const y = Math.random() * s;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.bezierCurveTo(s*0.3, y+5, s*0.7, y-5, s, y);
    ctx.strokeStyle = 'rgba(120,200,220,0.15)';
    ctx.lineWidth = 15 + Math.random()*20;
    ctx.stroke();
  }
}

function drawNeptune(ctx, s) {
  // Deep blue with subtle features
  const grad = ctx.createLinearGradient(0, 0, 0, s);
  grad.addColorStop(0, '#5577ee');
  grad.addColorStop(0.5, '#4466dd');
  grad.addColorStop(1, '#3355bb');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, s, s);
  // Dark spot (Great Dark Spot)
  ctx.beginPath();
  ctx.ellipse(s*0.4, s*0.45, 25, 18, 0, 0, Math.PI*2);
  ctx.fillStyle = 'rgba(30,40,120,0.4)';
  ctx.fill();
  // Bright clouds
  for (let i = 0; i < 6; i++) {
    const x = Math.random() * s;
    const y = Math.random() * s;
    ctx.beginPath();
    ctx.arc(x, y, 8 + Math.random()*15, 0, Math.PI*2);
    ctx.fillStyle = 'rgba(150,170,255,0.3)';
    ctx.fill();
  }
}

function drawDefault(ctx, s) {
  const grad = ctx.createLinearGradient(0, 0, s, s);
  grad.addColorStop(0, '#888');
  grad.addColorStop(1, '#666');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, s, s);
}

// === Saturn / Jupiter rings (multi-layer) ===
export function createRingTexture(layers) {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  // Clear transparent
  ctx.clearRect(0, 0, size, size);

  const cx = size / 2;
  const cy = size / 2;

  for (let i = 0; i < layers; i++) {
    const innerR = 60 + i * (size * 0.35 / layers);
    const outerR = innerR + size * 0.18 + Math.random() * 12;
    const alpha = 0.2 + Math.random() * 0.45;

    ctx.beginPath();
    ctx.arc(cx, cy, outerR, 0, Math.PI*2);
    ctx.arc(cx, cy, innerR, Math.PI*2, 0, true);
    const r = 180 + Math.floor(Math.random()*60);
    const g = 160 + Math.floor(Math.random()*50);
    const b = 120 + Math.floor(Math.random()*40);
    ctx.fillStyle = `rgba(${r},${g},${b},${alpha})`;
    ctx.fill();
  }

  const texture = new THREE.CanvasTexture(canvas);
  return texture;
}

// === Create planet mesh ===
export function createPlanetMesh(name, radius) {
  // Use a fixed visual size (not real scale — planets need to be visible)
  const visualRadius = Math.max(3, radius * RADIUS_SCALE);
  const geo = new THREE.SphereGeometry(visualRadius, 48, 48);
  const tex = createPlanetTexture(name);
  const mat = new THREE.MeshStandardMaterial({ map: tex });
  const mesh = new THREE.Mesh(geo, mat);

  return { mesh, visualRadius };
}

// === Create orbit line (dashed circle) ===
export function createOrbitLine(distAU) {
  const dist = distAU * DIST_SCALE;
  const geo = new THREE.RingGeometry(dist - 0.15, dist + 0.15, 128);
  const mat = new THREE.MeshBasicMaterial({
    color: 0x334466,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.35,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.x = -Math.PI / 2; // Flat on XZ plane
  return mesh;
}

// === Initialize entire solar system scene ===
export let planetMeshes = {};
export let moonMesh = null;
export let saturnRings = null;
export let jupiterRings = null;
export let sunMesh = null;
export let plutoMesh = null;

export function initSolarSystem() {
  // Sun (self-illuminated sphere + point light)
  const sunGeo = new THREE.SphereGeometry(8, 48, 48);
  const sunMat = new THREE.MeshBasicMaterial({ color: 0xffdd44 });
  sunMesh = new THREE.Mesh(sunGeo, sunMat);
  sunMesh.position.set(0, 0, 0);
  scene.add(sunMesh);

  // Sun glow (larger transparent sphere)
  const glowGeo = new THREE.SphereGeometry(12, 32, 32);
  const glowMat = new THREE.MeshBasicMaterial({ color: 0xffaa22, transparent: true, opacity: 0.15 });
  const glow = new THREE.Mesh(glowGeo, glowMat);
  scene.add(glow);

  // Sun point light
  const sunPointLight = new THREE.PointLight(0xffeedd, 2.0, 500);
  sunPointLight.position.set(0, 0, 0);
  scene.add(sunPointLight);

  // Planets
  PLANETS.forEach((planet, idx) => {
    const dist = planet.distAU * DIST_SCALE;
    const angle = (idx / PLANETS.length) * Math.PI * 2 + Math.random() * 0.5; // Spread out initially

    const { mesh, visualRadius } = createPlanetMesh(planet.name, planet.radius);
    mesh.position.set(Math.cos(angle) * dist, 0, Math.sin(angle) * dist);
    scene.add(mesh);

    // Orbit line
    const orbitLine = createOrbitLine(planet.distAU);
    scene.add(orbitLine);

    // Store for animation
    planetMeshes[planet.name] = {
      mesh,
      visualRadius,
      dist,
      angle,
      speed: 1.0 / (planet.period * 365), // Relative orbital speed
      idx,
    };

    // Moon for Earth
    if (planet.hasMoon) {
      const moonGeo = new THREE.SphereGeometry(visualRadius * 0.27, 32, 32);
      const moonMat = new THREE.MeshStandardMaterial({ color: 0xaaaaaa });
      moonMesh = new THREE.Mesh(moonGeo, moonMat);
      scene.add(moonMesh);
    }

    // Rings for Jupiter and Saturn
    if (planet.hasRings) {
      const ringTex = createRingTexture(planet.ringLayers || 5);
      const ringGeo = new THREE.RingGeometry(visualRadius * 1.4, visualRadius * 2.8, 64);
      const ringMat = new THREE.MeshBasicMaterial({
          map: ringTex, side: THREE.DoubleSide, transparent: true, opacity: 0.7
      });
      const ringMesh = new THREE.Mesh(ringGeo, ringMat);
      ringMesh.rotation.x = -Math.PI / 2 + planet.tilt * Math.PI / 180; // Axial tilt
      mesh.add(ringMesh);

      if (planet.name === '土星') saturnRings = ringMesh;
      if (planet.name === '木星') jupiterRings = ringMesh;
    }
  });

  // Pluto (dwarf planet)
  const plutoDist = PLUTO.distAU * DIST_SCALE;
  const { mesh: pMesh, visualRadius: pVis } = createPlanetMesh(PLUTO.name, PLUTO.radius);
  pMesh.position.set(plutoDist, 0, 0);
  scene.add(pMesh);

  const plutoOrbit = createOrbitLine(PLUTO.distAU);
  scene.add(plutoOrbit);

  plutoMesh = { mesh: pMesh, dist: plutoDist, angle: Math.random() * Math.PI * 2 };
}

// === Animate planets (simple circular orbits) ===
export function animatePlanets(dt) {
  const timeScale = dt * 0.3; // Slow down orbital animation

  for (const name of Object.keys(planetMeshes)) {
    const p = planetMeshes[name];
    p.angle += p.speed * timeScale;
    p.mesh.position.x = Math.cos(p.angle) * p.dist;
    p.mesh.position.z = Math.sin(p.angle) * p.dist;

    // Self rotation
    p.mesh.rotation.y += dt * 0.5;

    // Update target planet position for player
    if (p.idx === state.targetPlanetIdx) {
      state.targetPlanetPos.copy(p.mesh.position);
    }
  }

  // Animate Moon around Earth
  if (moonMesh && planetMeshes['地球']) {
    const earth = planetMeshes['地球'];
    const moonAngle = Date.now() * 0.001; // Real-ish speed for visual effect
    const moonDist = earth.visualRadius + 3;
    moonMesh.position.set(
      earth.mesh.position.x + Math.cos(moonAngle) * moonDist,
      0,
      earth.mesh.position.z + Math.sin(moonAngle) * moonDist
    );
    moonMesh.rotation.y += dt * 1.0;
  }

  // Animate Pluto
  if (plutoMesh) {
    plutoMesh.angle += timeScale * 0.05; // Very slow orbit
    plutoMesh.mesh.position.x = Math.cos(plutoMesh.angle) * plutoMesh.dist;
    plutoMesh.mesh.position.z = Math.sin(plutoMesh.angle) * plutoMesh.dist;
  }

  // Sun pulsing glow
  if (sunMesh) {
    const pulse = 1 + Math.sin(Date.now() * 0.003) * 0.05;
    sunMesh.scale.set(pulse, pulse, pulse);
  }
}
