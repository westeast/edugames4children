# 深空探测器旅行 - 完整实现计划

## 项目概述

3D 太空探索游戏，使用 Three.js。包含：太阳系模拟、火箭发射全流程、行星环绕物理、载人飞船返回、旅行者1号探测器等。

## 目录结构

```
spacegame/
├── index.html          # 入口页面（开始界面 + UI + importmap）
├── css/
│   └── style.css       # 全部样式
├── js/
│   ├── game.js         # 主入口：init() → 游戏循环
│   ├── engine.js       # Three.js 场景、相机、渲染器、光照、星空背景
│   ├── config.js       # 常量 + 全局 state（火箭型号、探测器型号）
│   ├── controls.js     # 键盘/触摸输入 + 虚拟摇杆
│   ├── physics.js      # 轨道力学 + 引力 N-body + 速度第一宇宙速度计算
│   ├── solar-system.js # 太阳系：太阳 + 8大行星 + 月球 + 程序化纹理着色器
│   ├── rocket-select.js # 火箭选择界面 + 3D预览 + 探测器载荷选择
│   ├── launch-seq.js   # 发射流程：组装→移动发射塔→点火→升空→助推分离
│   ├── rocket-model.js # 火箭3D模型（SpaceX/CZ-5/CZ-2C/Starship）+ 发动机可视化
│   ├── spacecraft.js   # 探测器/飞船3D模型 + 轨道舱/返回舱/推进舱
│   ├── orbital-mech.js # 轨道计算：开普勒方程、引力弹弓、逃逸速度
│   ├── re-entry.js     # 载人返回全流程：分离→再入→黑障→降落伞→着陆点火
│   ├── voyager1.js     # 旅行者1号：大锅盖天线 + 波纹信号追踪地球
│   ├── ui.js           # HUD：坐标显示(经纬高)、速度、发动机状态、通知
│   └── audio.js        # Web Audio API 合成音效（发射轰鸣、引擎点火等）
└── maps/               # (暂不需要，纯太空场景)
```

---

## Phase 1: 基础框架 + 太阳系

### 1.1 `config.js` - 全局状态与常量

```js
// 火箭型号定义（参考真实数据）
export const ROCKETS = [
  { id:'starship', name:'星舰 Starship', company:'SpaceX',
    stages:[
      {name:'Super Heavy 助推器', height:71, radius:5, engineCount:33, engines:'Raptor 3×33', prop:'LOX/LH2'},
      {name:'Starship 飞船', height:50, radius:9, engineCount:6, engines:'Raptor×6 (海平面) + RaptorVac×18 (真空)', prop:'LOX/LH2'}
    ],
    totalHeight:121, mass:5000, thrust:76000 // kN
  },
  { id:'falcon9', name:'猎鹰9号 Falcon 9', company:'SpaceX',
    stages:[
      {name:'第一级助推器', height:43.8, radius:1.675, engineCount:9, engines:'Merlin 1D×9 (Octaweb)', prop:'LOX/RP-1'},
      {name:'第二级整流罩+发动机', height:4.0, radius:0.825, engineCount:1, engines:'Merlin Vacuum×1', prop:'LOX/LH2'}
    ],
    totalHeight:70, mass:500, thrust:7600 // kN per Merlin 1D × 9 = ~68400 kN total
  },
  { id:'falcon_heavy', name:'猎鹰重型 Falcon Heavy', company:'SpaceX',
    stages:[
      {name:'中心核心级', height:50, radius:1.675, engineCount:9, engines:'Merlin 1D×9 (Octaweb)', prop:'LOX/RP-1'},
      {name:'左侧助推器', height:43.8, radius:1.675, engineCount:9, engines:'Merlin 1D×9', prop:'LOX/RP-1'},
      {name:'右侧助推器', height:43.8, radius:1.675, engineCount:9, engines:'Merlin 1D×9', prop:'LOX/RP-1'}
    ],
    totalHeight:81.2, mass:1500, thrust:13500 // per side × 27 + center = ~68400 kN total
  },
  { id:'cz5', name:'长征五号 CZ-5', company:'中国航天',
    stages:[
      {name:'芯级', height:33.3, radius:2.5, engineCount:2, engines:'YF-77×2 (液氢液氧)', prop:'LOX/LH2'},
      {name:'4个助推器(每侧2个)', height:16.1, radius:1.675, engineCount:8, engines:'YF-100×8 (液氧煤油)', prop:'LOX/RP-1'},
      {name:'二级', height:13.4, radius:2.5, engineCount:2, engines:'YF-75D×2', prop:'LOX/LH2'}
    ],
    totalHeight:56.97, mass:870, thrust:1080 // tonnes total liftoff
  },
  { id:'cz2c', name:'长征二号C CZ-2C', company:'中国航天',
    stages:[
      {name:'一级(4发动机簇)', height:26.6, radius:1.675, engineCount:4, engines:'YF-20A×4 (偏二甲肼/四氧化二氮)', prop:'N2O4/UDMH'},
      {name:'二级', height:8.3, radius:1.675, engineCount:1, engines:'YF-22E×1', prop:'N2O4/UDMH'}
    ],
    totalHeight:35.15, mass:192, thrust:306 // tonnes
  }
];

// 探测器载荷类型
export const PAYLOADS = [
  { id:'mars_probe', name:'火星探测卫星', desc:'携带光谱仪、钻探设备' },
  { id:'moon_probe', name:'月球探测器', desc:'轨道相机、月震仪' },
  { id:'voyager1', name:'旅行者1号 Voyager 1', desc:'3.66m大锅盖天线 · S/X波段通信' },
  { id:'deep_space', name:'深空探测器', desc:'通用探测平台' },
  { id:'crew_capsule', name:'载人飞船（神舟型）', desc:'轨道舱+返回舱+推进舱 · 太阳能板' }
];

// 行星数据（半径 km，距离 AU，公转周期年）
export const PLANETS = [
  { name:'水星', radius:2439.7, distAU:0.387, period:0.241, color:'#a0a0a0', tilt:0.03 },
  { name:'金星', radius:6051.8, distAU:0.723, period:0.615, color:'#e8c870', tilt:177.4 },
  { name:'地球', radius:6371.0, distAU:1.0,   period:1.0,   color:'#4488ff', tilt:23.4, hasMoon:true },
  { name:'火星', radius:3389.5, distAU:1.524, period:1.881, color:'#cc6644', tilt:25.2 },
  { name:'木星', radius:71492,  distAU:5.204, period:11.86,  color:'#d4a46a', tilt:3.1, hasRings:true, ringLayers:5 },
  { name:'土星', radius:60268,  distAU:9.537, period:29.46,  color:'#e8d088', tilt:26.7, hasRings:true, ringLayers:7 },
  { name:'天王星', radius:25559, distAU:19.19, period:84.01, color:'#88ccdd', tilt:97.8 },
  { name:'海王星', radius:24764, distAU:30.07, period:164.8, color:'#4466ee', tilt:28.3 }
];

// 冥王星（矮行星）
export const PLUTO = { name:'冥王星', radius:1188, distAU:39.48, period:248, color:'#aa9988', tilt:177 };

// 第一宇宙速度公式：v = sqrt(GM/r)
const G = 6.674e-11; // 引力常数（使用游戏单位缩放）
export function firstCosmicSpeed(radiusKm, massKg) {
  return Math.sqrt(G * massKg / (radiusKm * 1000));
}

// 全局状态
export const state = {
  gamePhase: 'menu', // menu → assemble → launchPad → ignite → ascend → boosterSep → orbit → explore → reentry → landing → done
  selectedRocketIdx: 0,
  selectedPayloadIdx: 0,
  isCrewed: false,     // 是否载人模式
  // 火箭位置/速度（游戏单位）
  rocketPos: new THREE.Vector3(0, 0, 0),
  rocketVel: new THREE.Vector3(0, 0, 0),
  rocketYaw: 0,
  rocketPitch: 0,
  // 发射状态
  enginesLit: false,
  boostersAttached: true,
  stage2Ignited: false,
  // 轨道状态
  orbitActive: false,
  targetPlanetIdx: 2, // default Earth
  // 返回状态
  reentryPhase: null, // 'serviceSep' | 'orbitalSep' | 'reentry' | 'blackout' | 'drogue' | 'mainChute' | 'retro' | 'landed'
  // 坐标显示
  latitude: 0,
  longitude: 0,
  altitude: 0,
  speed: 0,
  // 发动机状态
  engineStates: {},   // { name: 'lit'|'off', thrust: 0 }
};

// 太阳质量（游戏单位缩放）
export const SUN_MASS = 1.989e30;
// 地球质量
export const EARTH_MASS = 5.972e24;
```

### 1.2 `engine.js` - Three.js 引擎

- 场景初始化（同 flight 的 engine.js）
- **星空背景**：粒子系统生成 10000+ 恒星
- **太阳点光源** + 环境光 + 半球光
- 相机初始位置：地面观测视角

### 1.3 `solar-system.js` - 太阳系建模（程序化着色器）

```js
// 行星纹理生成器 - 使用 Canvas2D + ShaderMaterial
export function createPlanetTexture(name, radius) {
  // 根据行星名生成独特 Canvas 纹理
  switch(name) {
    case '水星': return canvasMercury();   // 灰色陨石坑表面
    case '金星': return canvasVenus();     // 黄色云层条纹
    case '地球': return canvasEarth();     // 蓝色海洋 + 绿色陆地 + 白色云
    case '火星': return canvasMars();      // 红色沙漠 + 极冠
    case '木星': return canvasJupiter();   // 彩色条纹 + 大红斑
    case '土星': return canvasSaturn();    // 金色条纹（半透明）
    case '天王星': return canvasUranus();  // 浅蓝绿色
    case '海王星': return canvasNeptune(); // 深蓝色
    default:   return canvasDefault();
  }
}

// 土星环 - 多层同心圆环纹理
export function createRingTexture(layers) {
  // layers=5(木星) or 7(土星)，每层不同宽度和透明度
}

// 创建行星 Mesh（球体 + 程序化纹理）
export function createPlanetMesh(name, radius, dist) {
  const geo = new THREE.SphereGeometry(radius * 0.1, 64, 64); // 游戏单位缩放
  const tex = createPlanetTexture(name, radius);
  const mat = new THREE.MeshStandardMaterial({ map: tex });
  return new THREE.Mesh(geo, mat);
}

// 创建行星轨道线（虚线圆）
export function createOrbitLine(dist) { ... }

// 月球
export function createMoonMesh() { ... }

// 初始化整个太阳系场景
export function initSolarSystem() {
  // 太阳（自发光球体 + 点光源）
  // 8大行星 + 冥王星
  // 每个：轨道线 + Mesh + 子对象(月球/环)
}
```

---

## Phase 2: 火箭选择 + 3D模型 + 发射流程

### 2.1 `rocket-select.js` - 火箭选择界面

- 右上角面板显示5种火箭卡片（SpaceX×3, CZ-5, CZ-2C）
- 点击卡片在3D场景中预览火箭模型（旋转查看）
- 下方选择探测器载荷类型
- 载人模式开关

### 2.2 `rocket-model.js` - 火箭3D建模

```js
// 根据型号创建不同火箭 Mesh
export function createRocketModel(rocketId) {
  switch(rocketId) {
    case 'starship':
      // Super Heavy: 71m高, 9m直径, 银色不锈钢外观
      // Starship: 50m高, 9m直径, 锥形头部
      // 33个 Raptor 发动机（内圈3 + 中圈10 + 外圈20）
      // 6+18 = 24个上部发动机
      return buildStarship();

    case 'falcon9':
      // 两级: 第一级43.8m(橙色热盾) + 第二级4m
      // 9x Merlin (Octaweb排列: 中心1 + 外圈8, 偏移设计)
      // 1x MVac
      return buildFalcon9();

    case 'falcon_heavy':
      // 三助推器布局（中心+左右）
      return buildFalconHeavy();

    case 'cz5':
      // 芯级33.3m(白色) + 4个助推器16.1m(橙色)
      // 2x YF-77 (芯级) + 8x YF-100 (助推)
      return buildCZ5();

    case 'cz2c':
      // 一级26.6m(绿色/灰色) + 二级8.3m
      // 4x YF-20A 簇 + 1x YF-22E
      return buildCZ2C();
  }
}

// 发动机可视化 - 每个发动机独立 Mesh + 火焰粒子
export function createEngineVisuals(rocketModel, engineStates) {
  // 点火: 锥形火焰（橙色→黄色渐变）+ 点光源闪烁
  // 未点火: 金属喷嘴颜色
  // 分离: 旧级向下掉落 + 旋转
}

// 逃逸塔（载人火箭特有）
export function createEscapeTower() {
  // 细长锥体，顶部有整流罩
  // 故障时自动点火：向上脱离火箭主体
}

// 助推器模型（4枚，像缩小版火箭）
export function createBoosters(count) {
  // 尖头 + 平身 + 底部喷嘴
  // 与主发动机一起挂载
}
```

### 2.3 `launch-seq.js` - 发射流程状态机

```js
// 状态机: menu → assemble → launchPad → ignite → ascend → boosterSep → orbit → explore
export function updateLaunchSequence(dt) {
  switch(state.gamePhase) {
    case 'assemble':
      // 快速组装动画（火箭从地面升起，对接）
      // 2秒内完成
      if (time > 2) state.gamePhase = 'launchPad';
      break;

    case 'launchPad':
      // 移动到发射塔位
      // 等待用户确认点火
      showIgniteButton();
      break;

    case 'ignite':
      // 发动机点火！显示火焰粒子效果
      // 倒计时 3, 2, 1, GO!
      // 震动效果（相机抖动）
      state.enginesLit = true;
      if (time > 5) state.gamePhase = 'ascend';
      break;

    case 'ascend':
      // 火箭升空！
      // 大气层内：显示哪些发动机点火/未点火
      // 速度逐渐增加，重力向下
      updateAscent(dt);
      if (altitude > 100) {
        // 一级燃料耗尽 → 助推分离
        state.gamePhase = 'boosterSep';
      }
      break;

    case 'boosterSep':
      // 4枚助推器 + 第一级分离！
      // 旧级向下坠落（带旋转）
      // 第二级点火
      detachBoosters();
      igniteSecondStage();
      state.gamePhase = 'orbit';
      break;

    case 'orbit':
      // 进入轨道，切换到探测器控制模式
      state.orbitActive = true;
      state.gamePhase = 'explore';
      break;
  }
}
```

### 2.4 发动机可视化细节

**SpaceX Starship:**
- Super Heavy: 33× Raptor 3（内圈3 RC + 中圈10 RC + 外圈20 RB）
- Starship上部: 6× Raptor Sea Level + 18× Raptor Vacuum
- 点火火焰：锥形，橙色→黄色渐变，带点光源

**SpaceX Falcon 9:**
- 9× Merlin 1D (Octaweb排列)
- 1× MVac (第二级)
- 分离时旧级旋转坠落

**中国长征五号:**
- 2× YF-77 (芯级液氢液氧) + 8× YF-100 (助推液氧煤油)
- 4个助推器同时分离

---

## Phase 3: 轨道力学 + 行星环绕

### 3.1 `physics.js` - N-body引力 + 第一宇宙速度

```js
import { state, SUN_MASS, EARTH_MASS, PLANETS } from './config.js';
import * as THREE from 'three';

// 游戏单位缩放: 1 AU = 100 units, 1 km = 0.01 units
const SCALE_DIST = 100; // 1 AU → 100 game units
const SCALE_RADIUS = 0.01; // 1 km → 0.01 game units

// N-body引力计算（RK4积分）
export function computeGravity(pos, vel, dt) {
  const acc = new THREE.Vector3();
  const G_game = G * SCALE_DIST * SCALE_DIST * SCALE_DIST / (SCALE_MASS);

  // 太阳引力
  const toSun = new THREE.Vector3().subVectors(new THREE.Vector3(0,0,0), pos);
  const rSun = toSun.length();
  acc.addScaledVector(toSun.normalize(), -G_game * SUN_MASS / (rSun * rSun));

  // 各行行星引力（玩家选择绕哪个转，就主要受那个影响）
  for (const planet of PLANETS) {
    const pPos = getPlanetPosition(planet);
    const toPlanet = new THREE.Vector3().subVectors(pPos, pos);
    const rPlanet = toPlanet.length();
    acc.addScaledVector(toPlanet.normalize(), -G_game * planet.mass / (rPlanet * rPlanet));
  }

  return acc;
}

// RK4积分更新位置
export function integrateRK4(pos, vel, dt) {
  // k1: f(t, y) = (v, a)
  // k2: f(t+dt/2, y+k1*dt/2)
  // k3: ...
  // k4: ...
  // y_new = y + dt*(k1+2*k2+2*k3+k4)/6

  const posNew = pos.clone();
  const velNew = vel.clone();
  // ... RK4 implementation
}

// 第一宇宙速度计算与检测
export function checkFirstCosmicSpeed(planetIdx) {
  const planet = PLANETS[planetIdx];
  const r = planet.radius * SCALE_RADIUS; // m → game units
  const vOrbital = Math.sqrt(G_game * EARTH_MASS / r);

  const speed = state.rocketVel.length();
  if (speed >= vOrbital) {
    showNotif(`✅ 达到第一宇宙速度 ${vOrbital.toFixed(1)} m/s！可以环绕${planet.name}！`);
    return true;
  } else {
    const needed = (vOrbital - speed).toFixed(1);
    showNotif(`⚠️ 还需加速 ${(needed)}. 第一宇宙速度: ${vOrbital.toFixed(1)} m/s`);
    return false;
  }
}

// 逃逸速度检测（第二宇宙速度 = sqrt(2) × 第一宇宙速度）
export function checkEscapeVelocity(planetIdx) {
  const planet = PLANETS[planetIdx];
  const r = planet.radius * SCALE_RADIUS;
  const vOrbital = Math.sqrt(G_game * EARTH_MASS / r);
  const vEscape = vOrbital * Math.SQRT2; // 第二宇宙速度

  const speed = state.rocketVel.length();
  if (speed >= vEscape) {
    showNotif(`🚀 达到逃逸速度 ${vEscape.toFixed(1)} m/s！可以逃离${planet.name}引力！`);
    return true;
  }
  return false;
}

// 引力弹弓计算（经过行星附近时获得速度增量）
export function computeGravityAssist(planetPos, planetVel, planetMass) {
  const toPlanet = new THREE.Vector3().subVectors(planetPos, state.rocketPos);
  const r = toPlanet.length();
  if (r < planet.radius * SCALE_RADIUS * 2) { // 进入引力影响球
    // 简化：速度增量沿行星运动方向
    const deltaV = new THREE.Vector3().copy(planetVel).multiplyScalar(0.1);
    state.rocketVel.add(deltaV);
    showNotif(`🌀 引力弹弓！获得速度增量`);
  }
}
```

### 3.2 `orbital-mech.js` - 轨道控制

```js
// 探测器绕行星运动（玩家控制）
export function updateOrbitControl(dt) {
  // 左摇杆: 径向加速/减速
  // 右摇杆: 切向加速/减速 + 垂直调整
  // 自动跟随目标行星

  const targetPlanet = PLANETS[state.targetPlanetIdx];
  const pPos = getPlanetPosition(targetPlanet);

  // 计算探测器到行星的向量
  const toPlanet = new THREE.Vector3().subVectors(pPos, state.rocketPos);
  const dist = toPlanet.length();

  // 应用玩家输入（径向/切向推力）
  applyThrust(dt);

  // N-body引力
  const acc = computeGravity(state.rocketPos, state.rocketVel, dt);

  // RK4积分
  integrateRK4(state.rocketPos, state.rocketVel, dt);

  // 更新坐标显示
  updateCoordinates(targetPlanet);
}

// 选择目标行星（点击UI切换）
export function selectTargetPlanet(idx) {
  if (idx === state.targetPlanetIdx) return;
  state.targetPlanetIdx = idx;
  showNotif(`🎯 目标: ${PLANETS[idx].name}`);
}
```

---

## Phase 4: 载人返回全流程

### 4.1 `spacecraft.js` - 神舟型飞船3D模型

```js
export function createShenzhouCapsule() {
  const group = new THREE.Group();

  // 轨道舱（前部）- 圆筒形
  const orbitalGeo = new THREE.CylinderGeometry(0.8, 0.8, 2, 32);
  const orbitalMat = new THREE.MeshStandardMaterial({ color: 0xffffff });
  const orbitalModule = new THREE.Mesh(orbitalGeo, orbitalMat);
  orbitalModule.position.z = 2.5;
  group.add(orbitalModule);

  // 返回舱（中部）- 上窄下宽（钟形）
  const reentryGeo = createBellShape(); // 使用 LatheGeometry 或自定义几何体
  const reentryMat = new THREE.MeshStandardMaterial({ color: 0xf0f0f0 });
  const reentryModule = new THREE.Mesh(reentryGeo, reentryMat);
  group.add(reentryModule);

  // 推进舱（后部）- 圆柱形
  const serviceGeo = new THREE.CylinderGeometry(1.2, 1.2, 3, 32);
  const serviceMat = new THREE.MeshStandardMaterial({ color: 0x888888 });
  const serviceModule = new THREE.Mesh(serviceGeo, serviceMat);
  serviceModule.position.z = -2.5;
  group.add(serviceModule);

  // 太阳能板（推进舱后部）- 蓝色长方形
  const solarGeo = new THREE.BoxGeometry(4, 0.1, 1.5);
  const solarMat = new THREE.MeshStandardMaterial({ color: 0x2244aa, metalness: 0.8 });
  const leftSolar = new THREE.Mesh(solarGeo, solarMat);
  leftSolar.position.set(-2.5, 0, -2.5);
  group.add(leftSolar);

  const rightSolar = new THREE.Mesh(solarGeo, solarMat);
  rightSolar.position.set(2.5, 0, -2.5);
  group.add(rightSolar);

  // 接收装置（推进舱顶部）- 小天线
  const antennaGeo = new THREE.ConeGeometry(0.3, 1, 8);
  const antennaMat = new THREE.MeshStandardMaterial({ color: 0xcccccc });
  const antenna = new THREE.Mesh(antennaGeo, antennaMat);
  antenna.position.set(0, 1.5, -2.5);
  group.add(antenna);

  return group;
}
```

### 4.2 `re-entry.js` - 返回全流程状态机

```js
export function updateReturnSequence(dt) {
  switch(state.reentryPhase) {
    case 'serviceSep': {
      // 推进舱点火变轨，然后与返回舱+轨道舱分离
      // 推进舱向后脱离
      showNotif('🔥 推进舱制动点火...');
      if (time > 3) {
        detachServiceModule();
        state.reentryPhase = 'orbitalSep';
      }
      break;
    }

    case 'orbitalSep': {
      // 轨道舱与返回舱分离
      showNotif('🔧 轨道舱分离...');
      if (time > 2) {
        detachOrbitalModule();
        state.reentryPhase = 'reentry';
      }
      break;
    }

    case 'reentry': {
      // 返回舱头朝后，再入大气层
      // 速度 ~7.8 km/s → 摩擦燃烧
      showNotif('🔥 再入大气层！');
      // 等离子体火焰效果（粒子系统）
      updatePlasmaTrail(dt);
      if (altitude < 100) {
        state.reentryPhase = 'blackout';
      }
      break;
    }

    case 'blackout': {
      showNotif('📡 进入黑障区！通信中断...');
      // 等离子体遮蔽效果（红色粒子包围）
      if (altitude < 20) {
        state.reentryPhase = 'drogue';
      }
      break;
    }

    case 'drogue': {
      showNotif('🪂 释放引导伞...');
      // 小降落伞弹出
      deployDrogueChute();
      if (speed < 120) {
        state.reentryPhase = 'mainChute';
      }
      break;
    }

    case 'mainChute': {
      showNotif('🪂 释放主伞（3个，面积约3×4个篮球场）...');
      // 3个大降落伞展开
      deployMainParachutes();
      if (altitude < 10) {
        state.reentryPhase = 'retro';
      }
      break;
    }

    case 'retro': {
      showNotif('💥 着陆反推发动机点火！');
      // 底部反推火箭点火（白色烟雾）
      deployRetroRockets();
      if (speed < 4.5) {
        state.reentryPhase = 'landed';
      }
      break;

    case 'landed': {
      showNotif('✅ 着陆成功！欢迎返回地球！');
      // 伞掉落，火箭落地
      break;
    }
  }
}
```

---

## Phase 5: 旅行者1号探测器

### 5.1 `voyager1.js` - 旅行者1号3D模型 + 信号波纹

```js
export function createVoyager1() {
  const group = new THREE.Group();

  // 主体箱形结构 (~0.5m × 0.4m × 0.3m)
  const bodyGeo = new THREE.BoxGeometry(0.5, 0.4, 0.3);
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0xccccaa });
  group.add(new THREE.Mesh(bodyGeo, bodyMat));

  // 大锅盖天线 - 3.66m直径抛物面反射器
  const dishGeo = new THREE.CylinderGeometry(1.83, 1.83, 0.15, 48);
  const dishMat = new THREE.MeshStandardMaterial({ color: 0xddddcc, side: THREE.DoubleSide });
  const dish = new THREE.Mesh(dishGeo, dishMat);
  dish.position.z = -2; // 指向地球方向
  group.add(dish);

  // 天线支架
  const boomGeo = new THREE.CylinderGeometry(0.03, 0.03, 2, 8);
  const boom = new THREE.Mesh(boomGeo, bodyMat);
  boom.position.z = -1;
  group.add(boom);

  // 信号波纹（同心圆环，持续向外扩散）
  createSignalRings(group);

  return group;
}

// 信号波纹 - 从大锅盖天线发出，追踪地球方向
export function createSignalRings(parent) {
  for (let i = 0; i < 5; i++) {
    const ringGeo = new THREE.RingGeometry(0.3, 0.6, 48);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x44aaff, transparent: true, opacity: 0.6 - i * 0.12, side: THREE.DoubleSide
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.z = -2.1; // 在天线前方
    parent.add(ring);

    // 持续向外扩散 + 淡出
    animateRing(ring, i * 0.5);
  }
}

function animateRing(ring, delay) {
  // 每3秒循环一次：半径从0.3→3，透明度从0.6→0
}
```

---

## Phase 6: UI + HUD + 音效

### 6.1 `ui.js` - HUD显示

```js
// 三维坐标显示（右上角）
export function updateCoordinatesHUD() {
  // 经度 (longitude): -180° ~ +180°
  // 纬度 (latitude): -90° ~ +90°
  // 高度 (altitude): 0 ~ ∞ km

  const el = document.getElementById('coordsDisplay');
  if (!el) return;

  const lon = state.longitude.toFixed(2);
  const lat = state.latitude.toFixed(2);
  const alt = state.altitude.toFixed(1);

  el.innerHTML = `
    <div style="color:#888;font-size:9px;">📍 探测器坐标</div>
    <div style="font-size:14px;color:#ff9500;">经度: ${lon}°</div>
    <div style="font-size:14px;color:#ff9500;">纬度: ${lat}°</div>
    <div style="font-size:14px;color:#ff9500;">高度: ${alt} km</div>
  `;
}

// 速度显示
export function updateSpeedHUD() {
  const el = document.getElementById('speedDisplay');
  if (!el) return;
  el.innerHTML = `
    <div style="color:#888;font-size:9px;">🚀 速度</div>
    <div style="font-size:14px;color:#ff9500;">${state.speed.toFixed(1)} m/s</div>
    <div style="font-size:10px;color:#666;">第一宇宙速度: ${getFirstCosmicSpeed().toFixed(1)} m/s</div>
  `;
}

// 发动机状态显示（右下角）
export function updateEngineHUD() {
  const el = document.getElementById('engineDisplay');
  if (!el) return;

  let html = '<div style="color:#888;font-size:9px;">⚙️ 发动机状态</div>';
  for (const [name, status] of Object.entries(state.engineStates)) {
    const icon = status.lit ? '🔥' : '⬜';
    html += `<div style="font-size:10px;">${icon} ${name}</div>`;
  }
  el.innerHTML = html;
}

// 行星选择面板（左侧）
export function createPlanetSelector() {
  const panel = document.getElementById('planetPanel');
  PLANETS.forEach((p, i) => {
    const btn = document.createElement('button');
    btn.className = 'planet-btn';
    btn.textContent = p.name;
    btn.onclick = () => selectTargetPlanet(i);
    if (i === state.targetPlanetIdx) btn.classList.add('active');
    panel.appendChild(btn);
  });

  // 添加冥王星
  const plutoBtn = document.createElement('button');
  plutoBtn.className = 'planet-btn';
  plutoBtn.textContent = '冥王星 ⚪';
  plutoBtn.onclick = () => selectPluto();
  panel.appendChild(plutoBtn);
}

// 返回按钮（仅在载人模式）
export function createReturnButton() {
  if (!state.isCrewed) return;
  const btn = document.createElement('button');
  btn.id = 'returnBtn';
  btn.className = 'ctrl-btn-inline';
  btn.innerHTML = '<span class="icon">🔄</span><span>返回地球</span>';
  btn.onclick = startReturnSequence;
  panel.appendChild(btn);
}
```

### 6.2 `audio.js` - Web Audio API 音效

```js
// 发射轰鸣（低频噪声 + 调制）
export function playLaunchRoar() {
  const ctx = audioContext;
  const bufferSize = ctx.sampleRate * 4;
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 2));
  }
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 500;
  source.connect(filter).connect(ctx.destination);
  source.start();
}

// 发动机点火（高频嘶嘶声）
export function playEngineIgnite() { ... }

// 助推分离（金属碰撞声）
export function playBoosterDetach() { ... }

// 降落伞开伞（风声 + 砰）
export function playChuteDeploy() { ... }

// 着陆反推（短促爆鸣）
export function playRetroBurst() { ... }
```

---

## Phase 7: HTML入口页面

### `index.html` - 完整UI布局

```html
<!DOCTYPE html>
<html lang="zh">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">
<title>深空探测器旅行 - Deep Space Explorer</title>
<link rel="stylesheet" href="css/style.css?v=20260812">
</head>
<body>

<!-- 加载提示 -->
<div id="loadingText">正在初始化太空系统...</div>

<!-- 开始界面 -->
<div id="startScreen" style="display:none">
  <div style="font-size:48px;">🚀</div>
  <h1>深空探测器旅行</h1>
  <p>Deep Space Explorer · Three.js Powered</p>
  <button class="start-btn" id="startBtn">▶ 开始探索</button>
</div>

<!-- 顶部状态栏 -->
<div id="topBar" style="display:none">
  <div class="settings-logo" onclick="openSettings()">🚀</div>
  <div class="status-item"><span>📶</span><span class="val" id="signalVal">5</span></div>
  <div class="status-item"><span>🛰️</span><span class="val" id="gpsVal">OK</span></div>
  <button class="fullscreen-btn" onclick="toggleFullscreen()">⛶</button>
  <button class="settings-btn" onclick="openSettings()">⋮</button>
</div>

<!-- 左侧面板: 行星选择 -->
<div id="leftPanel" style="display:none">
  <div class="panel-title collapsible" onclick="togglePanel('leftPanel')">
    <span>目标行星</span><span class="collapse-icon">▼</span>
  </div>
  <div class="panel-content" id="planetPanel"></div>
</div>

<!-- 右侧面板: 火箭选择 + 载荷 -->
<div id="rightPanel" style="display:none">
  <div class="panel-title collapsible" onclick="togglePanel('rightPanel')">
    <span>发射配置</span><span class="collapse-icon">▼</span>
  </div>
  <div class="panel-content" id="launchConfig"></div>
</div>

<!-- 底部遥测面板 -->
<div id="bottomPanel" style="display:none">
  <div class="tele-panel"><div class="label">速度 SPD</div><div class="value" id="teleSpd">0.0</div><div class="unit">m/s</div></div>
  <div class="tele-panel"><div class="label">距离 DIS</div><div class="value" id="teleDis">0.0</div><div class="unit">km</div></div>
  <div class="tele-panel"><div class="label">阶段 PHASE</div><div class="value" id="telePhase">就绪</div></div>
</div>

<!-- 坐标显示 -->
<div id="coordsDisplay" style="display:none"></div>

<!-- 发动机状态 -->
<div id="engineDisplay" style="display:none"></div>

<!-- 通知 -->
<div id="notification"></div>

<script type="importmap">
{
  "imports": {
    "three": "https://unpkg.com/three@0.160.0/build/three.module.js"
  }
}
</script>
<script type="module" src="js/game.js?v=20260812"></script>

</body>
</html>
```

---

## Phase 8: 测试 + 部署

### Playwright 测试脚本

```js
import { chromium } from 'playwright';

async function test() {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  // Listen for console errors
  page.on('console', msg => {
    if (msg.text().includes('Error') || msg.text().includes('TypeError')) {
      console.error(`[page error] ${msg.text()}`);
    }
  });

  await page.goto('http://localhost:8765/spacegame/index.html');

  // Wait for game to load
  await page.waitForSelector('#startScreen', { timeout: 10000 });

  // Click start button
  await page.click('.start-btn');

  // Wait for solar system to render
  await new Promise(r => setTimeout(r, 3000));

  // Take screenshot
  await page.screenshot({ path: 'screenshots/01-start.png' });

  // Check for JS errors
  const errors = [];
  page.on('pageerror', err => errors.push(err.message));

  console.log(`Test complete. Errors: ${errors.length}`);
  await browser.close();
}

test();
```

### 部署命令

```bash
scp -r spacegame root@nuwaos.cn:/home/wwwroot/edugame.nuwaos.cn/
```

---

## 开发顺序（执行计划）

1. **config.js** - 定义所有常量、火箭型号、行星数据、全局状态
2. **engine.js** - Three.js 场景初始化 + 星空背景
3. **solar-system.js** - 程序化着色器生成8大行星+冥王星+月球+环
4. **rocket-model.js** - 5种火箭3D模型 + 发动机可视化
5. **spacecraft.js** - 神舟型载人飞船（轨道舱/返回舱/推进舱）
6. **voyager1.js** - 旅行者1号（大锅盖天线+信号波纹）
7. **physics.js** - N-body引力 + RK4积分 + 第一宇宙速度检测
8. **orbital-mech.js** - 轨道控制 + 行星选择 + 引力弹弓
9. **launch-seq.js** - 发射流程状态机（组装→点火→升空→分离）
10. **re-entry.js** - 载人返回全流程（分离→再入→黑障→降落伞→着陆）
11. **controls.js** - 键盘/触摸输入 + 虚拟摇杆
12. **ui.js** - HUD坐标显示 + 速度 + 发动机状态 + 通知系统
13. **audio.js** - Web Audio API合成音效
14. **game.js** - 主入口 + 游戏循环 + 状态机串联
15. **style.css** - 全部样式（暗色太空主题）
16. **index.html** - HTML入口页面
17. **测试** → Playwright截图验证 → 修复bug → 部署

---

## 技术要点总结

### N-body引力公式
- `F = G * m1 * m2 / r²`，游戏单位缩放后积分
- RK4积分器保证数值稳定性

### 第一宇宙速度
- `v₁ = √(GM/r)` — 环绕速度
- `v₂ = v₁ × √2 ≈ 1.414 × v₁` — 逃逸速度

### 程序化纹理
- Canvas2D绘制行星外观 → `THREE.CanvasTexture` → `MeshStandardMaterial`
- 木星条纹：多层水平彩色条带 + 大红斑椭圆
- 土星环：同心圆渐变（7层不同宽度和透明度）

### 发动机可视化
- 点火：锥形火焰 Mesh（橙色→黄色渐变）+ PointLight闪烁
- 未点火：金属喷嘴颜色（灰色/银色）
- 分离：旧级旋转坠落 + 粒子拖尾
