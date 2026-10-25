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
  { name: '水星', radius: 2439.7, distAU: 0.387, period: 0.241, color: '#a0a0a0', tilt: 0.03, fact: '水星是离太阳最近的行星，白天温度可达 427°C，夜晚骤降至 -173°C。' },
  { name: '金星', radius: 6051.8, distAU: 0.723, period: 0.615, color: '#e8c870', tilt: 177.4, fact: '金星是太阳系最热的行星，表面温度约 465°C，大气压是地球的 92 倍。' },
  { name: '地球', radius: 6371.0, distAU: 1.0,   period: 1.0,   color: '#4488ff', tilt: 23.4, hasMoon: true, fact: '地球是唯一已知存在生命的行星，71% 表面被海洋覆盖。' },
  { name: '火星', radius: 3389.5, distAU: 1.524, period: 1.881, color: '#cc6644', tilt: 25.2, fact: '火星被称为红色星球，拥有太阳系最高的火山奥林帕斯山（21.9km）。' },
  { name: '木星', radius: 71492,  distAU: 5.204, period: 11.86,  color: '#d4a46a', tilt: 3.1, hasRings: true, ringLayers: 5, fact: '木星是太阳系最大的行星，大红斑是一场持续了数百年的风暴。' },
  { name: '土星', radius: 60268,  distAU: 9.537, period: 29.46,  color: '#e8d088', tilt: 26.7, hasRings: true, ringLayers: 7, fact: '土星环由无数冰块和岩石组成，最宽处可达数十万公里。' },
  { name: '天王星', radius: 25559, distAU: 19.19, period: 84.01, color: '#88ccdd', tilt: 97.8, fact: '天王星几乎横躺着绕太阳转，是太阳系最"躺"的行星。' },
  { name: '海王星', radius: 24764, distAU: 30.07, period: 164.8, color: '#4466ee', tilt: 28.3, fact: '海王星是太阳系最远的行星，风速可达 2100 km/h，是太阳系最狂暴的风。' }
];

export const PLUTO = { name: '冥王星', radius: 1188, distAU: 39.48, period: 248, color: '#aa9988', tilt: 177, fact: '冥王星是矮行星，位于柯伊伯带，直径约 2377 km。' };

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

// === Mission definitions (5 main missions + free explore + tour) ===
export const MISSIONS = [
  {
    id: 'm1', title: '第一次入轨', subtitle: '从地球出发',
    targetPlanetIdx: 2, // Earth
    rocketHint: '推荐：长征二号C 或 猎鹰9号',
    objective: '发射火箭，达到第一宇宙速度 7.9 km/s，环绕地球',
    briefing: '地球引力把我们牢牢拉住。想要环绕地球不掉下来，需要达到第一宇宙速度 v₁ = √(GM/r) ≈ 7.9 km/s。今天，你就是航天员！',
    steps: [
      { id: 'launch', text: '点火升空', hint: '点击点火按钮，倒计时 3-2-1' },
      { id: 'orbit', text: '达到第一宇宙速度', hint: '持续加速，速度达到 7.9 km/s' },
      { id: 'survey', text: '探测地球', hint: '点击地球上的探测点，收集数据' }
    ],
    surveyPoints: [
      { name: '万家灯火', desc: '夜半球的城市灯光', x: 0.6, y: 0.3 },
      { name: '蔚蓝海洋', desc: '太平洋的蓝色', x: -0.4, y: -0.2 },
      { name: '云海', desc: '大气层的白色云层', x: 0.2, y: 0.7 }
    ],
    knowledgeCard: 'first_cosmic_speed'
  },
  {
    id: 'm2', title: '奔向月球', subtitle: '第二宇宙速度',
    targetPlanetIdx: 2, // Earth (moon orbit)
    rocketHint: '推荐：长征五号 或 星舰',
    objective: '变轨到月球，绕月探测，收集月震数据',
    briefing: '第二宇宙速度 v₂ = √2 × v₁ ≈ 11.2 km/s，可以逃离地球引力。但我们要去月球——只需把速度提高到 10.9 km/s，就能进入奔月轨道。',
    steps: [
      { id: 'launch', text: '点火升空', hint: '点击点火按钮' },
      { id: 'orbit', text: '达到第二宇宙速度', hint: '加速到 10.9 km/s，脱离地球引力' },
      { id: 'travel', text: '变轨到月球', hint: '沿轨道航行，接近月球引力圈' },
      { id: 'survey', text: '探测月球', hint: '点击月球上的探测点' }
    ],
    surveyPoints: [
      { name: '静海', desc: '阿波罗11号着陆点', x: 0.5, y: 0.4 },
      { name: '月震仪', desc: '记录月球内部震动', x: -0.3, y: -0.5 },
      { name: '环形山', desc: '陨石撞击的痕迹', x: 0.1, y: 0.8 }
    ],
    knowledgeCard: 'moon'
  },
  {
    id: 'm3', title: '红色星球', subtitle: '引力弹弓',
    targetPlanetIdx: 3, // Mars
    rocketHint: '推荐：猎鹰重型 或 星舰',
    objective: '利用引力弹弓加速，进入火星轨道，探测火星',
    briefing: '火星太远了，直接飞过去要消耗大量燃料。聪明的办法是：借助行星的引力弹弓效应——飞近一颗行星，让它"甩"你一下，速度就大大增加！',
    steps: [
      { id: 'launch', text: '点火升空', hint: '点击点火按钮' },
      { id: 'orbit', text: '达到逃逸速度', hint: '加速到 11.2 km/s 以上' },
      { id: 'travel', text: '引力弹弓加速', hint: '飞近金星/地球借力' },
      { id: 'arrive', text: '进入火星轨道', hint: '到达火星引力圈，减速入轨' },
      { id: 'survey', text: '探测火星', hint: '点击火星上的探测点' }
    ],
    surveyPoints: [
      { name: '奥林帕斯山', desc: '太阳系最高火山', x: 0.3, y: 0.6 },
      { name: '水手峡谷', desc: '太阳系最大峡谷', x: -0.5, y: 0.2 },
      { name: '极冠', desc: '火星两极冰盖', x: 0.1, y: -0.8 }
    ],
    knowledgeCard: 'mars'
  },
  {
    id: 'm4', title: '巨行星之旅', subtitle: '气态巨行星',
    targetPlanetIdx: 4, // Jupiter
    rocketHint: '推荐：星舰',
    objective: '到达木星，观察大红斑；顺访土星环',
    briefing: '木星和土星是气态巨行星，没有固体表面。木星的大红斑是一场比地球还大的风暴，已经持续了数百年！',
    steps: [
      { id: 'launch', text: '点火升空', hint: '点击点火按钮' },
      { id: 'orbit', text: '达到逃逸速度', hint: '加速到 11.2 km/s 以上' },
      { id: 'travel', text: '深空航行', hint: '穿越小行星带' },
      { id: 'arrive', text: '进入木星轨道', hint: '到达木星引力圈' },
      { id: 'survey', text: '探测木星', hint: '点击大红斑探测点' }
    ],
    surveyPoints: [
      { name: '大红斑', desc: '持续数百年的风暴', x: 0.65, y: 0.55 },
      { name: '云带', desc: '木星的风带', x: -0.2, y: 0.3 },
      { name: '伽利略卫星', desc: '木卫二欧罗巴', x: 0.1, y: -0.6 }
    ],
    knowledgeCard: 'jupiter'
  },
  {
    id: 'm5', title: '深空信使', subtitle: '第三宇宙速度',
    targetPlanetIdx: 8, // Voyager / deep space
    rocketHint: '推荐：星舰 + 旅行者1号载荷',
    objective: '发射旅行者1号，达到第三宇宙速度，逃离太阳系',
    briefing: '第三宇宙速度 v₃ ≈ 16.7 km/s，可以逃离太阳系。旅行者1号带着金唱片，上面记录了人类的声音和问候，已经飞了 40 多年！',
    steps: [
      { id: 'launch', text: '点火升空', hint: '点击点火按钮' },
      { id: 'orbit', text: '达到第三宇宙速度', hint: '加速到 16.7 km/s' },
      { id: 'travel', text: '深空航行', hint: '飞向太阳系边缘' },
      { id: 'survey', text: '探测旅行者1号', hint: '点击金唱片探测点' }
    ],
    surveyPoints: [
      { name: '金唱片', desc: '人类的声音与问候', x: 0.5, y: 0.5 },
      { name: '大锅盖天线', desc: '高增益天线', x: -0.4, y: 0.2 },
      { name: '磁强计', desc: '磁场测量长杆', x: 0.2, y: -0.5 }
    ],
    knowledgeCard: 'voyager'
  }
];

// === Knowledge cards (real data) ===
export const KNOWLEDGE_CARDS = {
  first_cosmic_speed: {
    title: '第一宇宙速度',
    icon: '🚀',
    content: '环绕地球的最小速度约为 7.9 km/s（约 28,440 km/h）。低于这个速度，物体会被地球引力拉回地面。',
    formula: 'v₁ = √(GM/r)',
    fact: '中国长征火箭、SpaceX 猎鹰火箭都是靠这个原理把卫星送入轨道的。'
  },
  moon: {
    title: '月球与月震',
    icon: '🌕',
    content: '月球没有大气层，昼夜温差高达 280°C。月震是月球内部的微弱震动，阿波罗任务在月球上放置了月震仪。',
    formula: '第二宇宙速度 v₂ = √2 × v₁ ≈ 11.2 km/s',
    fact: '月球距离地球约 38 万公里，是地球唯一的天然卫星。'
  },
  mars: {
    title: '火星与引力弹弓',
    icon: '🔴',
    content: '引力弹弓（引力助推）利用行星的引力改变探测器速度和方向，不消耗燃料。NASA 的许多火星任务都借地球或金星"甩"一下。',
    formula: 'Δv = 2 × V_planet × sin(θ/2)',
    fact: '火星大气稀薄，但足以让探测器减速着陆。'
  },
  jupiter: {
    title: '木星大红斑与土星环',
    icon: '🪐',
    content: '木星大红斑是一场反气旋风暴，直径约 16,000 km，比地球还大，已持续至少 350 年。土星环由冰块和岩石组成。',
    formula: '气态巨行星：无固体表面',
    fact: '木星有 95 颗卫星，其中木卫二欧罗巴可能藏着地下海洋。'
  },
  voyager: {
    title: '旅行者1号与金唱片',
    icon: '📀',
    content: '旅行者1号 1977 年发射，携带金唱片，记录了 55 种语言的问候、90 分钟音乐和地球的声音。它已飞出太阳系，是人类最远的信使。',
    formula: '第三宇宙速度 v₃ ≈ 16.7 km/s',
    fact: '金唱片能保存约 10 亿年，上面刻着如何使用它的"说明书"。'
  }
};

// === Tour stops (5 stations, reference ORBIT) ===
export const TOUR_STOPS = [
  {
    title: '从万家灯火出发', subtitle: '地球 · 夜侧', phase: '准备出发',
    description: '越过蔚蓝的大气层，看见云海之下的万家灯火。这里，是我们在宇宙中的家。',
    stats: ['平均直径 12,742 km', '公转周期 365.25 天'],
    question: '思考题：为什么白天看不到星星？',
    answer: '大气散射阳光，让天空变亮，星光就被"淹没"了。'
  },
  {
    title: '静海与月震', subtitle: '月球 · 静海', phase: '到站探索',
    description: '月球没有大气，没有风，脚印能保留几百万年。静海是阿波罗11号着陆的地方。',
    stats: ['距地球 384,400 km', '直径 3,474 km'],
    question: '思考题：月球上为什么能跳得更高？',
    answer: '月球引力只有地球的 1/6，同样的力气能跳 6 倍高！'
  },
  {
    title: '红色星球', subtitle: '火星 · 奥林帕斯山', phase: '到站探索',
    description: '火星的红色来自氧化铁。奥林帕斯山高 21.9 km，是珠穆朗玛峰的 2.5 倍。',
    stats: ['直径 6,779 km', '距太阳 2.28 亿 km'],
    question: '思考题：为什么火星看起来是红色的？',
    answer: '火星表面的岩石富含氧化铁（铁锈），反射阳光呈红色。'
  },
  {
    title: '换个角度想一想', subtitle: '土星 · 土星环', phase: '到站探索',
    description: '土星环宽达数十万公里，但厚度只有几十米。每一粒冰块都在自己的轨道上奔跑。',
    stats: ['直径 116,460 km', '环宽 282,000 km'],
    question: '思考题：土星环是固体吗？',
    answer: '不是。土星环由无数冰块和岩石组成，各自沿轨道运行。'
  },
  {
    title: '金唱片与深空', subtitle: '旅行者1号 · 深空', phase: '到站探索',
    description: '旅行者1号已飞出太阳系，带着金唱片上的声音，向宇宙送去人类的问候。',
    stats: ['距地球 240 亿 km', '速度 17 km/s'],
    question: '思考题：金唱片为什么要记录声音？',
    answer: '为了让可能的外星文明了解地球生命，这是人类写给宇宙的信。'
  }
];

// === Global state ===
export const state = {
  gamePhase: 'menu', // menu → briefing → launchPad → ignite → ascend → orbit → travel → arrive → survey → complete
  mode: 'menu', // menu | mission | free | tour
  selectedMissionIdx: 0,
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

  // Mission progress
  missionStepIdx: 0,
  missionComplete: false,
  surveyPointsCollected: [],
  knowledgeUnlocked: [],

  // Return state (crewed mode)
  reentryPhase: null,
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
