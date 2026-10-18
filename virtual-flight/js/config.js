// 飞机的虚拟飞行 — 全局配置
// 坐标系：机头朝 -Z，右翼 +X，上方 +Y

export const AIRCRAFT = {
  prop: {
    id: 'prop',
    name: '螺旋桨飞机',
    sub: '塞斯纳 172 · 慢速稳定',
    category: 'prop',
    model: 'c172',
    rotY: -Math.PI / 2,          // 原模型机头朝 -X
    targetLength: 11,
    halfHeight: 1.35,
    cockpit: [0, 0.85, -1.2],
    maxSpeed: 55,
    stall: 17,
    takeoffSpeed: 23,
    accel: 5.5,
    decel: 7,
    pitchRate: 0.9,
    rollRate: 1.35,
    maxTurn: 0.9,
    bankLimit: null,
    autoLevel: 0.55,
    fuelMax: 100,
    fuelBurn: 0.055,
    missiles: 0,
    vtol: false,
    autoTakeoff: null,
    color: '#9fd7ff',
    desc: '挡风玻璃 85° 倾斜，长机翼，飞得慢但很灵活。'
  },
  airliner: {
    id: 'airliner',
    name: '民航客机',
    sub: '波音 747 · 平稳远航',
    category: 'airliner',
    model: 'airplane',
    rotY: -Math.PI / 2,
    targetLength: 62,
    halfHeight: 6.2,
    cockpit: [0, 2.8, -6],
    maxSpeed: 190,
    stall: 48,
    takeoffSpeed: 62,
    accel: 7,
    decel: 5,
    pitchRate: 0.38,
    rollRate: 0.32,
    maxTurn: 0.28,
    bankLimit: 0.38,             // 约 22°，转弯半径很大
    autoLevel: 2.2,
    fuelMax: 100,
    fuelBurn: 0.1,
    missiles: 0,
    vtol: false,
    autoTakeoff: null,
    color: '#f7f7fa',
    desc: '稳定性最高，只能轻轻倾斜，转弯要绕一大圈，不能翻滚。'
  },
  f35b: {
    id: 'f35b',
    name: 'F-35B',
    sub: '垂直起降 · 升力风扇',
    category: 'fighter',
    model: 'f35',
    rotY: Math.PI / 2,           // 原模型机头朝 +X
    targetLength: 16,
    halfHeight: 2.2,
    cockpit: [0, 1.15, -1.4],
    maxSpeed: 280,
    stall: 52,
    takeoffSpeed: 62,
    accel: 24,
    decel: 12,
    pitchRate: 1.15,
    rollRate: 3.2,
    maxTurn: 1.15,
    bankLimit: null,
    autoLevel: 0,
    fuelMax: 100,
    fuelBurn: 0.16,
    missiles: 4,
    vtol: true,
    autoTakeoff: { duration: 1.0, runway: 30, short: true },
    color: '#9aa4ad',
    desc: '长按垂直起降：喷管向下、锯齿升力风扇启动，可原地升降和侧移。'
  },
  j20: {
    id: 'j20',
    name: '歼-20',
    sub: '鸭翼隐身战机',
    category: 'fighter',
    model: 'su57',
    rotY: Math.PI / 2,
    targetLength: 20,
    halfHeight: 2.5,
    cockpit: [0, 1.25, -1.8],
    maxSpeed: 340,
    stall: 55,
    takeoffSpeed: 70,
    accel: 27,
    decel: 13,
    pitchRate: 1.22,
    rollRate: 3.5,
    maxTurn: 1.3,
    bankLimit: null,
    autoLevel: 0,
    fuelMax: 100,
    fuelBurn: 0.15,
    missiles: 4,
    vtol: false,
    autoTakeoff: { duration: 2.0, runway: 270 },
    color: '#5f6469',
    desc: '鸭翼 + 三角翼布局，滚转最快，滑跑约 270 米后起飞。'
  },
  j16: {
    id: 'j16',
    name: '歼-16',
    sub: '双发重型多用途战机',
    category: 'fighter',
    model: 'su35',
    rotY: Math.PI / 2,
    targetLength: 22,
    halfHeight: 2.8,
    cockpit: [0, 1.3, -2],
    maxSpeed: 300,
    stall: 58,
    takeoffSpeed: 72,
    accel: 22,
    decel: 12,
    pitchRate: 1.05,
    rollRate: 2.9,
    maxTurn: 1.05,
    bankLimit: null,
    autoLevel: 0,
    fuelMax: 100,
    fuelBurn: 0.17,
    missiles: 4,
    vtol: false,
    autoTakeoff: { duration: 5.0, runway: 360 },
    color: '#7c8a95',
    desc: '双发重型战机，挂载 4 枚导弹，滑跑约 360 米后起飞。'
  }
};

export const AIRCRAFT_ORDER = ['prop', 'airliner', 'f35b', 'j20', 'j16'];
export const FIGHTERS = ['f35b', 'j20', 'j16'];

export const MAPS = {
  mountain: {
    id: 'mountain',
    name: '山川水林',
    icon: '🏞️',
    desc: '绿色丘陵、河流、树林和草地，适合练习起降。',
    night: false
  },
  volcano: {
    id: 'volcano',
    name: '火山之夜',
    icon: '🌋',
    desc: '夜色火山、岩浆、导弹发射车与空中无人机。',
    night: true
  },
  carrier: {
    id: 'carrier',
    name: '航母海域',
    icon: '🚢',
    desc: '从航空母舰甲板起飞，海面上还有敌舰与岛屿。',
    night: false
  }
};

export const COUNTRIES = ['中国', '美国', '日本', '俄罗斯', '英国', '法国'];

export const VIEWS = [
  { id: 'chase', name: '追尾视角' },
  { id: 'top', name: '顶部视角' },
  { id: 'cockpit', name: '座舱视角' },
  { id: 'rear', name: '机尾视角' }
];

export const DEFAULT_STATE = {
  aircraft: 'f35b',
  mode: 'free',
  map: 'mountain',
  missionLevel: 1,
  time: 'day',
  rain: false,
  brightness: 60,
  countryA: '中国',
  countryB: '日本',
  music: true
};

export const RUNWAY = {
  length: 520,
  width: 34,
  startZ: 120,
  y: 0.12
};

export const CARRIER = {
  length: 330,
  width: 62,
  deckY: 13,
  x: 0,
  z: 0
};

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));
