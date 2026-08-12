// Configuration constants and shared game state
import * as THREE from 'three';

// === Rocket definitions (real-world data) ===
export const ROCKETS = [
  { id: 'starship', name: '星舰 Starship', company: 'SpaceX',
    stages: [
      { name: 'Super Heavy 助推器', height: 71, radius: 5, engineCount: 33, engines: 'Raptor 3×33', prop: 'LOX/LH2' },
      { name: 'Starship 飞船', height: 50, radius: 4.5, engineCount: 6, engines: 'Raptor×6+18Vac', prop: 'LOX/LH2' }
    ],
    totalHeight: 121, mass: 5000, thrust: 76000 // kN total liftoff thrust
  },
  { id: 'falcon9', name: '猎鹰9号 Falcon 9', company: 'SpaceX',
    stages: [
      { name: '第一级助推器', height: 43.8, radius: 1.675, engineCount: 9, engines: 'Merlin 1D×9 (Octaweb)', prop: 'LOX/RP-1' },
      { name: '第二级发动机', height: 4.0, radius: 0.825, engineCount: 1, engines: 'Merlin Vacuum×1', prop: 'LOX/LH2' }
    ],
    totalHeight: 70, mass: 500, thrust: 6840 // 9 × ~760 kN per Merlin 1D
  },
  { id: 'falcon_heavy', name: '猎鹰重型 Falcon Heavy', company: 'SpaceX',
    stages: [
      { name: '中心核心级', height: 50, radius: 1.675, engineCount: 9, engines: 'Merlin 1D×9 (Octaweb)', prop: 'LOX/RP-1' },
      { name: '左侧助推器', height: 43.8, radius: 1.675, engineCount: 9, engines: 'Merlin 1D×9', prop: 'LOX/RP-1' },
      { name: '右侧助推器', height: 43.8, radius: 1.675, engineCount: 9, engines: 'Merlin 1D×9', prop: 'LOX/RP-1' }
    ],
    totalHeight: 81.2, mass: 1500, thrust: 13500 // per side × 27 + center = ~68400 kN total
  },
  { id: 'cz5', name: '长征五号 CZ-5', company: '中国航天',
    stages: [
      { name: '芯级发动机', height: 33.3, radius: 2.5, engineCount: 2, engines: 'YF-77×2 (液氢液氧)', prop: 'LOX/LH2' },
      { name: '4个助推器(每侧2个)', height: 16.1, radius: 1.675, engineCount: 8, engines: 'YF-100×8 (液氧煤油)', prop: 'LOX/RP-1' },
      { name: '二级发动机', height: 13.4, radius: 2.5, engineCount: 2, engines: 'YF-75D×2', prop: 'LOX/LH2' }
    ],
    totalHeight: 56.97, mass: 870, thrust: 1080 // tonnes total liftoff
  },
  { id: 'cz2c', name: '长征二号C CZ-2C', company: '中国航天',
    stages: [
      { name: '一级(4发动机簇)', height: 26.6, radius: 1.675, engineCount: 4, engines: 'YF-20A×4 (偏二甲肼/四氧化二氮)', prop: 'N2O4/UDMH' },
      { name: '二级发动机', height: 8.3, radius: 1.675, engineCount: 1, engines: 'YF-22E×1', prop: 'N2O4/UDMH' }
    ],
    totalHeight: 35.15, mass: 192, thrust: 306 // tonnes
  }
];

// === Payload types ===
export const PAYLOADS = [
  { id: 'mars_probe', name: '火星探测卫星', desc: '携带光谱仪、钻探设备' },
  { id: 'moon_probe', name: '月球探测器', desc: '轨道相机、月震仪' },
  { id: 'voyager1', name: '旅行者1号 Voyager 1', desc: '3.66m大锅盖天线 · S/X波段通信' },
  { id: 'deep_space', name: '深空探测器', desc: '通用探测平台' },
  { id: 'crew_capsule', name: '载人飞船（神舟型）', desc: '轨道舱+返回舱+推进舱 · 太阳能板' }
];

// === Planet data (radius km, distance AU, orbital period years) ===
export const PLANETS = [
  { name: '水星', radius: 2439.7, distAU: 0.387, period: 0.241, color: '#a0a0a0', tilt: 0.03 },
  { name: '金星', radius: 6051.8, distAU: 0.723, period: 0.615, color: '#e8c870', tilt: 177.4 },
  { name: '地球', radius: 6371.0, distAU: 1.0,   period: 1.0,   color: '#4488ff', tilt: 23.4, hasMoon: true },
  { name: '火星', radius: 3389.5, distAU: 1.524, period: 1.881, color: '#cc6644', tilt: 25.2 },
  { name: '木星', radius: 71492,  distAU: 5.204, period: 11.86,  color: '#d4a46a', tilt: 3.1, hasRings: true, ringLayers: 5 },
  { name: '土星', radius: 60268,  distAU: 9.537, period: 29.46,  color: '#e8d088', tilt: 26.7, hasRings: true, ringLayers: 7 },
  { name: '天王星', radius: 25559, distAU: 19.19, period: 84.01, color: '#88ccdd', tilt: 97.8 },
  { name: '海王星', radius: 24764, distAU: 30.07, period: 164.8, color: '#4466ee', tilt: 28.3 }
];

export const PLUTO = { name: '冥王星', radius: 1188, distAU: 39.48, period: 248, color: '#aa9988', tilt: 177 };

// === Physics constants (game unit scaled) ===
const G_REAL = 6.674e-11; // m³/(kg·s²)
export const SUN_MASS = 1.989e30;
export const EARTH_MASS = 5.972e24;
export const JUPITER_MASS = 1.898e27;

// Scale: 1 AU = 100 game units, 1 km = 0.01 game units
const SCALE_DIST = 100;
const SCALE_RADIUS = 0.01;
export const G_GAME = G_REAL * SCALE_DIST * SCALE_DIST * SCALE_DIST / (1e24); // scaled for gameplay

// First cosmic speed: v = sqrt(GM/r)
export function firstCosmicSpeed(massKg, radiusKm) {
  return Math.sqrt(G_REAL * massKg / (radiusKm * 1000));
}

// Escape velocity: v₂ = √2 × v₁
export function escapeVelocity(massKg, radiusKm) {
  return firstCosmicSpeed(massKg, radiusKm) * Math.SQRT2;
}

// === Global state ===
export const state = {
  gamePhase: 'menu', // menu → assemble → launchPad → ignite → ascend → boosterSep → orbit → explore → reentry → landing → done
  selectedRocketIdx: 0,
  selectedPayloadIdx: 0,
  isCrewed: false,

  // Rocket position/velocity (game units)
  rocketPos: new THREE.Vector3(0, 0, 0),
  rocketVel: new THREE.Vector3(0, 0, 0),
  rocketYaw: 0,
  rocketPitch: 0,

  // Launch state
  enginesLit: false,
  boostersAttached: true,
  stage2Ignited: false,
  launchTime: 0,

  // Orbit state
  orbitActive: false,
  targetPlanetIdx: 2, // default Earth
  targetPlanetPos: new THREE.Vector3(0, 0, 0),

  // Return state (crewed mode)
  reentryPhase: null, // 'serviceSep' | 'orbitalSep' | 'reentry' | 'blackout' | 'drogue' | 'mainChute' | 'retro' | 'landed'
  serviceDetached: false,
  orbitalDetached: false,

  // Coordinates display (game units → km)
  latitude: 0,
  longitude: 0,
  altitude: 0,
  speed: 0,

  // Engine states
  engineStates: {},

  // Player input
  keys: {},
  leftStick: { x: 0, y: 0 },
  rightStick: { x: 0, y: 0 },

  // Voyager 1 signal rings animation
  voyagerTime: 0,

  // Notification timer
  notifTimer: 0,
};
