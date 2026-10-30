// 数据配置：天体、尺度层级、任务、导览、知识卡
// 严格参考 ORBIT (dididaiqu.com/orbit) 的信息结构：类别/英文名/编号/描述/统计/操作/思考题

// === 探索尺度（ORBIT 的「近地轨道 / 太阳系 / 银河系 / 星系图鉴」）===
export const SCALES = [
  { id: 'earth', label: '近地轨道', caption: '地球近轨', distance: '距地表 20,000 km' },
  { id: 'solar', label: '太阳系', caption: '太阳系', distance: '约 4.5 小时光程' },
  { id: 'galaxy', label: '银河系', caption: '银河系', distance: '直径约 100,000 光年' },
  { id: 'local', label: '星系图鉴', caption: '星系图鉴', distance: '空间布局为示意' },
];

// === 天体数据（真实数据 + 展示用视觉参数）===
// radiusKm 真实半径；visualR 展示用半径（非真实比例）；au 轨道半径
export const BODIES = [
  {
    id: 'earth', index: 3, category: '太阳系 / 类地行星', name: '地球', en: 'EARTH',
    description: '越过蔚蓝的大气层，看见云海之下的万家灯火。这里，是我们在宇宙中的家。',
    radiusKm: 12742, au: 1.0, periodDays: 365.25, color: '#3b7ddd', visualR: 4.0,
    stats: [['平均直径', '12,742', ' km'], ['公转周期', '365.25', ' 天']],
    actions: [
      { id: 'night', label: '看万家灯火' },
      { id: 'station', label: '探访空间站' },
    ],
    texture: 'earth',
  },
  {
    id: 'moon', index: 3.1, category: '地球 / 卫星', name: '月球', en: 'MOON',
    description: '没有大气，没有风。四十亿年的撞击坑安静地保存着太阳系早期的记忆。',
    radiusKm: 3474, orbitOf: 'earth', color: '#b8b8c0', visualR: 1.2,
    stats: [['平均直径', '3,474', ' km'], ['公转周期', '27.3', ' 天']],
    texture: 'moon',
  },
  {
    id: 'mercury', index: 1, category: '太阳系 / 类地行星', name: '水星', en: 'MERCURY',
    description: '离太阳最近的行星。白天 427°C，夜晚骤降至 -173°C，没有大气来缓冲。',
    radiusKm: 4879, au: 0.387, periodDays: 87.97, color: '#9a9a9a', visualR: 1.6,
    stats: [['平均直径', '4,879', ' km'], ['公转周期', '88', ' 天']],
    texture: 'mercury',
  },
  {
    id: 'venus', index: 2, category: '太阳系 / 类地行星', name: '金星', en: 'VENUS',
    description: '浓密的二氧化碳大气造成失控温室效应，表面 465°C，是太阳系最热的行星。',
    radiusKm: 12104, au: 0.723, periodDays: 224.7, color: '#e6c878', visualR: 3.8,
    stats: [['平均直径', '12,104', ' km'], ['公转周期', '225', ' 天']],
    texture: 'venus',
  },
  {
    id: 'mars', index: 4, category: '太阳系 / 类地行星', name: '火星', en: 'MARS',
    description: '红色的氧化铁土壤覆盖着这颗星球。奥林帕斯山高 21.9 km，是太阳系最高的火山。',
    radiusKm: 6779, au: 1.524, periodDays: 686.98, color: '#c1643a', visualR: 2.4,
    stats: [['平均直径', '6,779', ' km'], ['公转周期', '687', ' 天']],
    actions: [{ id: 'rover', label: '看探测器' }],
    texture: 'mars',
  },
  {
    id: 'jupiter', index: 5, category: '太阳系 / 气态巨行星', name: '木星', en: 'JUPITER',
    description: '太阳系最大的行星。大红斑是一场持续数百年的风暴，比地球还大。',
    radiusKm: 139820, au: 5.204, periodDays: 4332.6, color: '#d4a46a', visualR: 8.0,
    hasRings: false,
    stats: [['平均直径', '139,820', ' km'], ['公转周期', '11.86', ' 年']],
    texture: 'jupiter',
  },
  {
    id: 'saturn', index: 6, category: '太阳系 / 气态巨行星', name: '土星', en: 'SATURN',
    description: '土星环由无数冰块与岩石组成，宽达数十万公里，厚度却只有几十米。',
    radiusKm: 116460, au: 9.537, periodDays: 10759, color: '#e3d090', visualR: 7.0,
    hasRings: true, ringInner: 1.4, ringOuter: 2.6,
    stats: [['平均直径', '116,460', ' km'], ['公转周期', '29.46', ' 年']],
    actions: [{ id: 'rings', label: '近看土星环' }],
    texture: 'saturn',
  },
  {
    id: 'uranus', index: 7, category: '太阳系 / 冰巨行星', name: '天王星', en: 'URANUS',
    description: '自转轴几乎横躺，98° 的倾角让它像一个滚动的球绕太阳前进。',
    radiusKm: 50724, au: 19.19, periodDays: 30687, color: '#8fd0dd', visualR: 4.6,
    hasRings: true, ringInner: 1.5, ringOuter: 1.9,
    stats: [['平均直径', '50,724', ' km'], ['公转周期', '84.01', ' 年']],
    texture: 'uranus',
  },
  {
    id: 'neptune', index: 8, category: '太阳系 / 冰巨行星', name: '海王星', en: 'NEPTUNE',
    description: '太阳系最远的行星。风速可达 2,100 km/h，是已知最狂暴的行星大气。',
    radiusKm: 49244, au: 30.07, periodDays: 60190, color: '#4a68d8', visualR: 4.4,
    stats: [['平均直径', '49,244', ' km'], ['公转周期', '164.8', ' 年']],
    texture: 'neptune',
  },
  {
    id: 'sun', index: 0, category: '太阳系 / 恒星', name: '太阳', en: 'SUN',
    description: '一颗普通的 G 型主序星，占太阳系 99.86% 的质量，每秒把 6 亿吨氢聚变成氦。',
    radiusKm: 696340, au: 0, periodDays: 0, color: '#ffcc44', visualR: 14.0,
    stats: [['平均直径', '1,392,700', ' km'], ['表面温度', '5,500', ' °C']],
    texture: 'sun',
  },
  {
    id: 'voyager', index: 9, category: '深空 / 探测器', name: '旅行者1号', en: 'VOYAGER 1',
    description: '1977 年发射，携带金唱片飞出太阳系。它是人类制造的最遥远的物体。',
    radiusKm: 0, au: 120, periodDays: 0, color: '#ccccaa', visualR: 1.0,
    stats: [['距地球', '约 240 亿', ' km'], ['飞行速度', '17', ' km/s']],
    texture: 'voyager',
  },
];

// === 星系图鉴（ORBIT 的「星系图鉴」，程序生成示意）===
export const GALAXIES = [
  { id: 'milkyway', name: '银河系', en: 'MILKY WAY', type: '棒旋星系', desc: '我们的家园星系，包含 1,000–4,000 亿颗恒星。', color: '#cfe0ff' },
  { id: 'andromeda', name: '仙女座星系', en: 'ANDROMEDA', type: '旋涡星系', desc: '距我们 254 万光年，是银河系最大的邻居，正在靠近。', color: '#ffd9c0' },
  { id: 'triangulum', name: '三角座星系', en: 'TRIANGULUM', type: '旋涡星系', desc: '本星系群第三大成员，约 300 亿颗恒星。', color: '#c0d8ff' },
  { id: 'lmc', name: '大麦哲伦云', en: 'LMC', type: '不规则星系', desc: '银河系的伴星系，南半球肉眼可见。', color: '#e0e0ff' },
  { id: 'sombrero', name: '草帽星系', en: 'SOMBRERO', type: '透镜星系', desc: '侧视的尘埃带让它像一顶墨西哥草帽。示意。', color: '#ffe0b0' },
];

// === 5 关主线任务（教育：到达 → 观察 → 答题 → 解锁知识卡）===
export const MISSIONS = [
  {
    id: 'm1', title: '最近的邻居', subtitle: '为什么月球没有大气',
    targetId: 'moon', scale: 'earth',
    objective: '飞到月球，观察它的表面，回答问题。',
    briefing: '月球是地球唯一的天然卫星。它很小，引力只有地球的 1/6 —— 这正是它留不住大气的原因。',
    question: '月球为什么几乎没有大气层？',
    options: ['因为它离太阳太近', '因为引力太小，气体逃逸到太空', '因为被陨石撞没了'],
    answer: 1,
    explain: '月球引力只有地球的 1/6，逃逸速度仅 2.4 km/s，气体分子很容易逃逸到太空。',
    knowledgeCard: 'moon',
  },
  {
    id: 'm2', title: '红色星球', subtitle: '火星为什么是红的',
    targetId: 'mars', scale: 'solar',
    objective: '飞到火星，观察它，回答问题。',
    briefing: '火星距离太阳比地球远一半，表面覆盖着氧化铁尘埃 —— 也就是铁锈。',
    question: '火星表面呈现红色，是因为？',
    options: ['表面全是熔岩', '土壤富含氧化铁（铁锈）', '反射了太阳的红光'],
    answer: 1,
    explain: '火星土壤富含氧化铁，反射红光，所以从太空看是一颗红色星球。',
    knowledgeCard: 'mars',
  },
  {
    id: 'm3', title: '巨大的风暴', subtitle: '大红斑的秘密',
    targetId: 'jupiter', scale: 'solar',
    objective: '飞到木星，寻找大红斑，回答问题。',
    briefing: '木星比地球大 11 倍，自转却只要 10 小时。快速自转把大气拉成条纹，也搅出了大红斑。',
    question: '木星的大红斑是什么？',
    options: ['一块红色岩石', '一场持续数百年的巨型风暴', '卫星投下的影子'],
    answer: 1,
    explain: '大红斑是一场反气旋风暴，直径可容纳整个地球，已持续至少 350 年。',
    knowledgeCard: 'jupiter',
  },
  {
    id: 'm4', title: '环的世界', subtitle: '土星环是什么做的',
    targetId: 'saturn', scale: 'solar',
    objective: '飞到土星，近看土星环，回答问题。',
    briefing: '土星环宽 28 万公里，却薄得惊人。它由数不清的冰块和岩石颗粒组成。',
    question: '土星环的主要成分是？',
    options: ['固体圆盘', '冰块与岩石颗粒', '浓密的气体'],
    answer: 1,
    explain: '土星环由无数冰块和岩石颗粒组成，它们各自沿轨道运行，并不相连。',
    knowledgeCard: 'saturn',
  },
  {
    id: 'm5', title: '飞向星际', subtitle: '旅行者1号与金唱片',
    targetId: 'voyager', scale: 'solar',
    objective: '跟随信号前往旅行者1号，回答问题。',
    briefing: '1977 年，旅行者1号带着一张金唱片出发了。上面有人类的问候、音乐和 55 种语言。',
    question: '旅行者1号上的金唱片是为了？',
    options: ['记录飞行数据', '向可能存在的外星文明传递地球信息', '反射阳光调整航向'],
    answer: 1,
    explain: '金唱片记录了人类的问候与音乐，是写给宇宙的一封信，能保存约 10 亿年。',
    knowledgeCard: 'voyager',
  },
];

// === 知识卡（真实数据）===
export const KNOWLEDGE = {
  moon: {
    title: '月球与逃逸速度', icon: '🌕',
    body: '天体能否留住大气，取决于它的逃逸速度。月球逃逸速度只有 2.4 km/s，气体分子轻易跑到太空；地球是 11.2 km/s，才能留住厚厚的大气层。',
    fact: '月球引力约为地球的 1/6，在月球上你能跳 6 倍高。',
  },
  mars: {
    title: '火星的红色', icon: '🔴',
    body: '火星表面遍布氧化铁（Fe₂O₃）尘埃，也就是铁锈。它反射红光，让火星从太空看呈现橙红色。',
    fact: '火星有太阳系最高的火山奥林帕斯山（21.9 km）和最长的峡谷水手谷（4,000 km）。',
  },
  jupiter: {
    title: '大红斑', icon: '🪐',
    body: '大红斑是木星上的一场反气旋风暴，直径约 16,000 km，比地球还大。它至少已持续 350 年。',
    fact: '木星自转只要约 10 小时，是太阳系自转最快的行星。',
  },
  saturn: {
    title: '土星环', icon: '💫',
    body: '土星环由无数冰块和岩石颗粒组成，直径约 28 万公里，但平均厚度只有约 10–100 米。',
    fact: '土星平均密度小于水，如果有足够大的海洋，土星能浮起来。',
  },
  voyager: {
    title: '金唱片', icon: '📀',
    body: '旅行者1号携带的金唱片刻有 55 种语言的问候、90 分钟音乐和地球的声音，附带播放说明。',
    fact: '旅行者1号已飞出太阳风层顶，进入星际空间，是人类最遥远的信使。',
  },
};

// === 5 站导览（参考 ORBIT「一键导览 · 5 站」）===
export const TOUR = [
  {
    id: 't1', title: '从万家灯火出发', subtitle: '地球 · 夜侧', phase: '准备出发',
    targetId: 'earth',
    description: '越过蔚蓝的大气层，看见云海之下的万家灯火。这里，是我们在宇宙中的家。',
    stats: ['平均直径 12,742 km', '公转周期 365.25 天'],
    question: '为什么白天看不见星星？',
    hint: '大气散射的阳光把微弱的星光掩盖了。',
  },
  {
    id: 't2', title: '静海与月震', subtitle: '月球 · 静海', phase: '到站探索',
    targetId: 'moon',
    description: '月球没有大气，没有风。阿波罗11号的脚印，也许还能保留几百万年。',
    stats: ['距地球 384,400 km', '直径 3,474 km'],
    question: '月球上为什么能跳得更高？',
    hint: '引力只有地球的 1/6。',
  },
  {
    id: 't3', title: '红色星球', subtitle: '火星 · 奥林帕斯山', phase: '到站探索',
    targetId: 'mars',
    description: '火星的红色来自氧化铁。奥林帕斯山高 21.9 km，是珠穆朗玛峰的 2.5 倍。',
    stats: ['直径 6,779 km', '距太阳 2.28 亿 km'],
    question: '为什么火星看起来是红色的？',
    hint: '表面岩石富含氧化铁，反射红光。',
  },
  {
    id: 't4', title: '换个角度想一想', subtitle: '土星 · 土星环', phase: '到站探索',
    targetId: 'saturn',
    description: '土星环宽达数十万公里，厚度却只有几十米。每一粒冰块都在自己的轨道上奔跑。',
    stats: ['直径 116,460 km', '环宽约 282,000 km'],
    question: '土星环是固体吗？',
    hint: '不是。它由无数冰块和岩石组成。',
  },
  {
    id: 't5', title: '金唱片与深空', subtitle: '旅行者1号 · 深空', phase: '到站探索',
    targetId: 'voyager',
    description: '旅行者1号已飞入星际空间，带着金唱片上的声音，向宇宙送去人类的问候。',
    stats: ['距地球 约 240 亿 km', '速度 17 km/s'],
    question: '金唱片为什么要记录声音？',
    hint: '让可能的外星文明了解地球生命。',
  },
];

// === 全局状态 ===
export const state = {
  ready: false,
  mode: 'explore',            // explore | mission | tour
  scale: 'earth',             // earth | solar | galaxy | local
  selectedId: 'earth',        // 当前聚焦天体
  focusedId: null,            // 相机飞向目标
  missionIdx: 0,
  missionStage: 'idle',       // idle | navigate | observe | quiz | done
  missionAnswered: false,
  tourIdx: 0,
  tourPlaying: false,
  tourTime: 0,
  unlocked: [],
  paused: false,
  layers: { orbits: true, labels: true, satellites: true },
  timeScale: 1,
  stars: true,
  spaceColor: '#05090e',
};
