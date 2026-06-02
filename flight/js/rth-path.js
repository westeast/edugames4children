// Return-to-Home Path Visualization
// Green transparent path from drone to home point
import * as THREE from 'three';
import { scene } from './engine.js';
import { state } from './config.js';
import { getTerrainHeight } from './terrain.js';

let rthPathMesh = null;
let landingPathMesh = null;
let rthAudioContext = null;
let rthBeepInterval = null;
let homeMarker = null; // H marker for home point

// Create H marker for home point
export function createHomeMarker() {
  if (homeMarker) {
    scene.remove(homeMarker);
  }

  const group = new THREE.Group();

  // Create H shape using boxes
  const mat = new THREE.MeshBasicMaterial({ color: 0xff8800, side: THREE.DoubleSide });

  // Left vertical bar of H
  const leftBar = new THREE.Mesh(new THREE.BoxGeometry(0.8, 6, 0.3), mat);
  leftBar.position.set(-1.5, 3, 0);
  group.add(leftBar);

  // Right vertical bar of H
  const rightBar = new THREE.Mesh(new THREE.BoxGeometry(0.8, 6, 0.3), mat);
  rightBar.position.set(1.5, 3, 0);
  group.add(rightBar);

  // Horizontal bar of H
  const horizontalBar = new THREE.Mesh(new THREE.BoxGeometry(3, 0.8, 0.3), mat);
  horizontalBar.position.set(0, 3, 0);
  group.add(horizontalBar);

  // Base circle (helipad)
  const circleMat = new THREE.MeshBasicMaterial({ color: 0xffaa00, transparent: true, opacity: 0.6, side: THREE.DoubleSide });
  const circle = new THREE.Mesh(new THREE.CircleGeometry(4, 32), circleMat);
  circle.rotation.x = -Math.PI / 2;
  circle.position.y = 0.1;
  group.add(circle);

  // Arrow pointing to H (for visibility from above)
  const arrowMat = new THREE.MeshBasicMaterial({ color: 0xff6600, side: THREE.DoubleSide });
  const arrow = new THREE.Mesh(new THREE.ConeGeometry(1.5, 3, 4), arrowMat);
  arrow.rotation.x = Math.PI / 2;
  arrow.position.set(0, 0.2, 7);
  group.add(arrow);

  // Position at home point
  const groundY = getTerrainHeight(state.homePos.x, state.homePos.z);
  group.position.set(state.homePos.x, groundY, state.homePos.z);

  scene.add(group);
  homeMarker = group;

  return group;
}

// Update home marker position
export function updateHomeMarker() {
  if (!homeMarker) {
    createHomeMarker();
    return;
  }

  const groundY = getTerrainHeight(state.homePos.x, state.homePos.z);
  homeMarker.position.set(state.homePos.x, groundY, state.homePos.z);
}

// Remove home marker
export function removeHomeMarker() {
  if (homeMarker) {
    scene.remove(homeMarker);
    homeMarker = null;
  }
}

// Get home marker for raycasting (drag detection)
export function getHomeMarker() {
  return homeMarker;
}

// Generate path that avoids obstacles (terrain)
function generateAvoidancePath(start, end) {
  const points = [];
  const dir = new THREE.Vector3().subVectors(end, start);
  const totalDist = dir.length();
  dir.normalize();

  // Sample points along the direct path
  const numSamples = Math.max(10, Math.floor(totalDist / 20));

  // Find obstacles along the path
  const obstacles = [];
  for (let i = 0; i <= numSamples; i++) {
    const t = i / numSamples;
    const samplePoint = new THREE.Vector3().lerpVectors(start, end, t);
    const terrainH = getTerrainHeight(samplePoint.x, samplePoint.z) + 5; // +5m safety margin

    // Check if this point would hit terrain
    if (samplePoint.y < terrainH) {
      obstacles.push({
        t: t,
        point: samplePoint.clone(),
        terrainHeight: terrainH,
        neededHeight: terrainH + 10 // Need to be 10m above terrain
      });
    }
  }

  // If no obstacles, return direct path
  if (obstacles.length === 0) {
    const segments = Math.max(10, Math.floor(totalDist / 15));
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      points.push(new THREE.Vector3(
        THREE.MathUtils.lerp(start.x, end.x, t),
        THREE.MathUtils.lerp(start.y, end.y, t),
        THREE.MathUtils.lerp(start.z, end.z, t)
      ));
    }
    return points;
  }

  // Find the highest obstacle - we need to go over it
  const maxObstacle = obstacles.reduce((max, o) => o.neededHeight > max.neededHeight ? o : max, obstacles[0]);

  // Create path that goes over the highest obstacle
  // Phase 1: Climb from start to above obstacle
  // Phase 2: Fly over at safe height
  // Phase 3: Descend to end

  const safeHeight = Math.max(start.y, end.y, maxObstacle.neededHeight);

  // Start point
  points.push(start.clone());

  // Climb phase (if needed)
  if (start.y < safeHeight) {
    // Climb while staying in place horizontally
    points.push(new THREE.Vector3(start.x, safeHeight, start.z));
  }

  // Fly over at safe height
  if (start.y < safeHeight || end.y < safeHeight) {
    points.push(new THREE.Vector3(
      THREE.MathUtils.lerp(start.x, end.x, 0.3),
      safeHeight,
      THREE.MathUtils.lerp(start.z, end.z, 0.3)
    ));
    points.push(new THREE.Vector3(
      THREE.MathUtils.lerp(start.x, end.x, 0.5),
      safeHeight,
      THREE.MathUtils.lerp(start.z, end.z, 0.5)
    ));
    points.push(new THREE.Vector3(
      THREE.MathUtils.lerp(start.x, end.x, 0.7),
      safeHeight,
      THREE.MathUtils.lerp(start.z, end.z, 0.7)
    ));
  }

  // Descend to end (if needed)
  if (end.y < safeHeight) {
    points.push(new THREE.Vector3(end.x, safeHeight, end.z));
  }

  // End point
  points.push(end.clone());

  return points;
}

// Create RTH path visualization
export function createRTHPath() {
  // Remove existing path
  removeRTHPath();
  removeLandingPath();

  if (!state.isRTH) return;

  const startPos = state.dronePos.clone();
  const endPos = state.homePos.clone();

  // Generate path that avoids obstacles
  const points = generateAvoidancePath(startPos, endPos);

  // Create a tube geometry for the path
  const pathWidth = 2;
  const curve = new THREE.CatmullRomCurve3(points);

  const pathGeometry = new THREE.TubeGeometry(curve, Math.max(8, points.length * 2), pathWidth, 8, false);

  // Color gradient: bright green at drone, darker at home
  const pathMaterial = new THREE.MeshBasicMaterial({
    color: 0x44ff66,
    transparent: true,
    opacity: 0.6,
    side: THREE.DoubleSide,
    depthWrite: false,
  });

  rthPathMesh = new THREE.Mesh(pathGeometry, pathMaterial);
  scene.add(rthPathMesh);

  // Create landing indicator at home position
  createLandingPath();

  // Start beeping sound
  startRTHBeep();
}

// Create landing path - vertical green column showing descent path
export function createLandingPath() {
  removeLandingPath();
  
  if (!state.isRTH) return;
  
  const homePos = state.homePos.clone();
  const groundHeight = getTerrainHeight(homePos.x, homePos.z);
  
  // Create a cylindrical path from home altitude to ground
  const landingGeometry = new THREE.CylinderGeometry(2, 2, homePos.y - groundHeight, 16);
  landingGeometry.translate(0, (homePos.y + groundHeight) / 2, 0);
  
  const landingMaterial = new THREE.MeshBasicMaterial({
    color: 0x44ff66,
    transparent: true,
    opacity: 0.3,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  
  landingPathMesh = new THREE.Mesh(landingGeometry, landingMaterial);
  landingPathMesh.position.set(homePos.x, 0, homePos.z);
  scene.add(landingPathMesh);
}

// Update RTH path during flight
export function updateRTHPath() {
  if (!state.isRTH) {
    removeRTHPath();
    stopRTHBeep();
    return;
  }
  
  // Recreate path periodically to follow drone movement
  createRTHPath();
}

// Remove RTH path visualization
export function removeRTHPath() {
  if (rthPathMesh) {
    scene.remove(rthPathMesh);
    rthPathMesh.geometry.dispose();
    rthPathMesh.material.dispose();
    rthPathMesh = null;
  }
  // Also remove landing path
  removeLandingPath();
  // Stop beeping
  stopRTHBeep();
}

// Remove landing path
export function removeLandingPath() {
  if (landingPathMesh) {
    scene.remove(landingPathMesh);
    landingPathMesh.geometry.dispose();
    landingPathMesh.material.dispose();
    landingPathMesh = null;
  }
}

// Start RTH beeping sound
function startRTHBeep() {
  if (rthBeepInterval) return;
  
  try {
    rthAudioContext = new (window.AudioContext || window.webkitAudioContext)();
    
    rthBeepInterval = setInterval(() => {
      if (!state.isRTH) {
        stopRTHBeep();
        return;
      }
      
      // Create beep sound
      const oscillator = rthAudioContext.createOscillator();
      const gainNode = rthAudioContext.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(rthAudioContext.destination);
      
      oscillator.frequency.value = 1000; // 1000 Hz beep
      oscillator.type = 'sine';
      
      gainNode.gain.setValueAtTime(0.1, rthAudioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, rthAudioContext.currentTime + 0.1);
      
      oscillator.start(rthAudioContext.currentTime);
      oscillator.stop(rthAudioContext.currentTime + 0.1);
    }, 500); // Beep every 500ms
  } catch (e) {
    console.log('Audio not available');
  }
}

// Stop RTH beeping
function stopRTHBeep() {
  if (rthBeepInterval) {
    clearInterval(rthBeepInterval);
    rthBeepInterval = null;
  }
  if (rthAudioContext) {
    rthAudioContext.close();
    rthAudioContext = null;
  }
}

// Check if drone is in landing phase
export function isLanding() {
  if (!state.isRTH) return false;
  
  const dist = state.dronePos.distanceTo(state.homePos);
  return dist < 20;
}
