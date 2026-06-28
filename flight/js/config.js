// Configuration constants and shared game state
import * as THREE from 'three';

export const DRONES = [
  { name: 'Air 3', maxSpeed: 21, color: 0xff9500, accel: 8, batteryDrain: 0.012, gimbalMin: -90, gimbalMax: 30 },
  { name: 'Mavic 3 Pro', maxSpeed: 19, color: 0xff3b30, accel: 6, batteryDrain: 0.015, gimbalMin: -90, gimbalMax: 30 },
  { name: 'Mini 4 Pro', maxSpeed: 16, color: 0xd0d0d0, accel: 7, batteryDrain: 0.018, gimbalMin: -Infinity, gimbalMax: Infinity },
  { name: 'Avata 360', maxSpeed: 27, color: 0x9a9a9a, accel: 10, batteryDrain: 0.022, gimbalMin: -90, gimbalMax: 90, panoramic: true },
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
  currentDroneIdx: 0,
  droneSpec: DRONES[0],
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
};