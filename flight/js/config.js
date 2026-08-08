// Configuration constants and shared game state
import * as THREE from 'three';

export const DRONES = [
  { name: 'Air 3',       model: 'air3',       maxSpeed: 21, color: 0xc0c0c0, accel: 8, batteryDrain: 0.012, gimbalMin: -90, gimbalMax: 30,             needsArmUnfold: true,  windResist: 1.0 },
  { name: 'Air 3S',      model: 'air3s',      maxSpeed: 21, color: 0xc8c8c8, accel: 8, batteryDrain: 0.012, gimbalMin: -90, gimbalMax: 30,             needsArmUnfold: true,  windResist: 1.0, lidar: true },
  { name: 'Mavic 3 Pro', model: 'mavic3pro',  maxSpeed: 19, color: 0x3a3a3a, accel: 6, batteryDrain: 0.015, gimbalMin: -90, gimbalMax: 30,             needsArmUnfold: true,  windResist: 1.0 },
  { name: 'Mavic 4 Pro', model: 'mavic4pro',  maxSpeed: 20, color: 0x1e1e24, accel: 7, batteryDrain: 0.014, gimbalMin: -90, gimbalMax: 45,             needsArmUnfold: true,  windResist: 1.0, rollCapable: true, lidar: true },
  { name: 'Mini 4 Pro',  model: 'mini4pro',   maxSpeed: 16, color: 0xf0f0f0, accel: 7, batteryDrain: 0.018, gimbalMin: -Infinity, gimbalMax: Infinity, needsArmUnfold: true,  windResist: 0.7 },
  { name: 'Neo 2',       model: 'neo2',       maxSpeed: 14, color: 0xfafafa, accel: 5, batteryDrain: 0.014, gimbalMin: -90, gimbalMax: 90,             needsArmUnfold: false, windResist: 0.3, followCam: true },
  { name: 'Avata 360',   model: 'avata360',   maxSpeed: 27, color: 0x9a9a9a, accel: 10, batteryDrain: 0.022, gimbalMin: -90, gimbalMax: 90,            needsArmUnfold: false, windResist: 0.6, panoramic: true },
  { name: 'Mini 5 Pro',  model: 'mini5pro',   maxSpeed: 17, color: 0xc8c8c8, accel: 7, batteryDrain: 0.016, gimbalMin: -90, gimbalMax: 90,            needsArmUnfold: true,  windResist: 0.75, lidar: true, portraitCapable: true },
];

export const GEAR_MULT = { C: 0.4, N: 1.0, S: 1.6, M: 1.8 };
export const GEAR_DESC = { C: '平稳档 · 慢速安全', N: '普通档 · 均衡飞行', S: '运动档 · 极速体验', M: '手动档 · 专业操控' };
export const MANUAL_TURN_MULT = 2.5;  // 手动模式转向速度倍率

export const CHUNK_SIZE = 200;
export const CHUNK_RES = 40;
export const VIEW_DIST = 3;
export const TERRAIN_SCALE = 80;
export const TERRAIN_HEIGHT = 60;

// Shared mutable state (single source of truth)
export const state = {
  currentDroneIdx: 7,
  droneSpec: DRONES[7],
  battery: 100,
  totalDist: 0,
  isPaused: false,
  isCrashed: false,
  fpvMode: false,
  isCruise: false,
  isRTH: false,
  obstacleEnabled: true,
  obstacleMode: 'bypass', // 'bypass' = 绕行, 'brake' = 刹停
  currentGear: 'N',
  gameStarted: false,
  homePos: new THREE.Vector3(0, 30, 0),
  dronePos: new THREE.Vector3(0, 30, 0),
  droneVel: new THREE.Vector3(0, 0, 0),
  droneYaw: 0,
  dronePitch: 0,
  droneRoll: 0,
  propSpeed: 0,
  keys: {},
  leftStick: { x: 0, y: 0 },
  rightStick: { x: 0, y: 0 },
  lastTime: 0,
  notifTimer: 0,
  // Emergency stop tumble state
  isEmergencyStop: false,
  tumblePitch: 0,
  tumbleRoll: 0,
  tumbleYaw: 0,
  tumbleVelX: 0,
  tumbleVelZ: 0,
  // Manual mode state
  isManualMode: false,
  // Crash physics state
  isCrashing: false,
  crashType: null,
  crashBounceCount: 0,
  impactSpeed: 5, // 撞击速度，用于控制旋转强度
  // Gimbal pitch (degrees): 0 = horizontal forward, -90 = straight down, +70 = up 70°
  gimbalPitch: 0,
  // Gimbal mode: 'follow' (cloud台 stays level) or 'fpv' (cloud台 tilts with drone)
  gimbalMode: 'follow',
  // Follow mode state
  isFollowMode: false,        // Whether follow mode is active
  followTarget: null,         // Target object (car or bird mesh)
  followTargetType: 'car',    // Target type: 'car' | 'bird'
  followHeight: 30,           // Follow height (meters)
  followMinHeight: 5,         // Minimum follow height
  followMaxHeight: 120,       // Maximum follow height
  followSpeed: 20,            // Follow speed (m/s)
  followMinSpeed: 30,         // Minimum follow speed
  followMaxSpeed: 50,         // Maximum follow speed
  followDistance: 15,         // Maintain distance from target (meters)
  // Landed state - drone is on ground after RTH landing, needs takeoff to fly again
  isLanded: false,
  // Crash debris state
  cameraDetached: false,
  cameraWobbleDir: 0,      // +1 or -1
  cameraWobblePhase: 0,
  cameraWobbleDecay: 0,
  // Waypoint flight state
  isWaypointFlying: false,
  waypointSpeed: 10,
  // Preflight (起飞准备流程) state
  isPreflight: false,
  preflightCamPos: new THREE.Vector3(0, 40, 14),
  preflightLookAt: new THREE.Vector3(0, 30, 0),
  // Avata 360 相机模式：'single' 单镜头 | 'dual' 双镜头全景 | 'super' 超全景
  avataCamMode: 'single',
  // 大风地图 / 风级系统
  windLevel: 8,                 // 风级 1-8（默认 8）
  windActive: false,            // 当前地图是否起风（大风地图 true）
  windAngle: Math.PI / 5,       // 风向来向角（弧度）
  windSwept: false,             // Neo 2 是否已被吹飞
  windCrash: false,             // Neo 2 是否已风坠炸机（触发记者播报）
  // Mavic 4 Pro 横滚旋转
  gimbalRoll: 0,                // 相机横滚角（度），范围 -45 ~ +400
  rollModeEnabled: false,       // 设置里横滚旋转开关
  // Neo 2 操控方式
  neo2Control: 'rc',            // 'rc' 遥控器 | 'phone' 手机
  // 无损竖拍（Mini 5 Pro）
  portraitMode: false,          // 竖拍开关（画面转90° 9:16 + 云台侧转）
  // 夜间地图
  nightActive: false,           // 当前地图是否为夜间地图
  // 避障绕行中心障碍偏置（避免随机转向闪烁）
  bypassTurnBias: 1,            // +1 或 -1，遇到中心障碍时翻转
  // 夜间地图起飞模式：'single' 单机起飞 | 'multi' 5机同时起飞测试
  takeoffMode: 'single',
};