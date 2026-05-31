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

// Create RTH path visualization
export function createRTHPath() {
  // Remove existing path
  removeRTHPath();
  
  if (!state.isRTH) return;
  
  const startPos = state.dronePos.clone();
  const endPos = state.homePos.clone();
  
  // Calculate path points with intermediate waypoints
  const points = [];
  const segments = 50;
  
  // Create a smooth path: drone -> climb -> fly -> descend -> home
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    
    // Path phases:
    // 1. Climb to safe altitude (first 10%)
    // 2. Fly horizontally (middle 80%)
    // 3. Descend to home (last 10%)
    
    let x, y, z;
    
    if (t < 0.1) {
      // Climb phase
      const climbT = t / 0.1;
      x = startPos.x;
      y = THREE.MathUtils.lerp(startPos.y, Math.max(startPos.y, endPos.y + 20), climbT);
      z = startPos.z;
    } else if (t < 0.9) {
      // Horizontal flight phase
      const flyT = (t - 0.1) / 0.8;
      const safeY = Math.max(startPos.y, endPos.y) + 20;
      x = THREE.MathUtils.lerp(startPos.x, endPos.x, flyT);
      y = safeY;
      z = THREE.MathUtils.lerp(startPos.z, endPos.z, flyT);
    } else {
      // Descend phase
      const descendT = (t - 0.9) / 0.1;
      const safeY = Math.max(startPos.y, endPos.y) + 20;
      x = endPos.x;
      y = THREE.MathUtils.lerp(safeY, endPos.y, descendT);
      z = endPos.z;
    }
    
    points.push(new THREE.Vector3(x, y, z));
  }
  
  // Create a tube geometry for the path
  const pathWidth = 3; // Width similar to drone size
  const curve = new THREE.CatmullRomCurve3(points);
  
  // Create custom shader material with gradient effect
  const pathGeometry = new THREE.TubeGeometry(curve, 64, pathWidth, 8, false);
  
  // Create gradient colors - darker at drone, lighter at home
  const colors = new Float32Array(pathGeometry.attributes.position.count * 4);
  const positions = pathGeometry.attributes.position;
  
  for (let i = 0; i < positions.count; i++) {
    const point = new THREE.Vector3(
      positions.getX(i),
      positions.getY(i),
      positions.getZ(i)
    );
    
    // Calculate distance along path (0 at drone, 1 at home)
    const distToStart = point.distanceTo(startPos);
    const distToEnd = point.distanceTo(endPos);
    const totalDist = startPos.distanceTo(endPos);
    const t = distToStart / (totalDist + 0.01);
    
    // Green color with alpha gradient
    // Start: darker green (0.6 alpha), End: brighter green (0.9 alpha)
    colors[i * 4] = 0.2 + t * 0.2;     // R
    colors[i * 4 + 1] = 0.8 + t * 0.15; // G
    colors[i * 4 + 2] = 0.3;             // B
    colors[i * 4 + 3] = 0.4 + t * 0.4;   // A - more transparent at start, more opaque at end
  }
  
  pathGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 4));
  
  const pathMaterial = new THREE.MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.7,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  
  rthPathMesh = new THREE.Mesh(pathGeometry, pathMaterial);
  scene.add(rthPathMesh);
  
  // Create landing path (vertical green column at home position)
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
