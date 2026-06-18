// Follow Mode - Path visualization and target tracking
import * as THREE from 'three';
import { scene } from './engine.js';
import { state } from './config.js';
import { cars, birds } from './entities.js';
import { showNotif } from './ui.js';

let followPathMesh = null;

// Create follow path visualization (blue line from drone to target)
export function createFollowPath() {
  // Remove existing path
  removeFollowPath();

  if (!state.isFollowMode || !state.followTarget) return;

  const startPos = state.dronePos.clone();
  const targetPos = state.followTarget.position.clone();

  // Create blue tube path
  const points = [startPos, targetPos];
  const curve = new THREE.LineCurve3(points);
  const pathGeometry = new THREE.TubeGeometry(curve, 8, 0.5, 8, false);

  const pathMaterial = new THREE.MeshBasicMaterial({
    color: 0x4488ff, // Blue color
    transparent: true,
    opacity: 0.6,
    side: THREE.DoubleSide,
    depthWrite: false,
  });

  followPathMesh = new THREE.Mesh(pathGeometry, pathMaterial);
  scene.add(followPathMesh);
}

// Update follow path every frame
export function updateFollowPath() {
  if (!state.isFollowMode || !state.followTarget) {
    removeFollowPath();
    return;
  }
  createFollowPath();
}

// Remove follow path visualization
export function removeFollowPath() {
  if (followPathMesh) {
    scene.remove(followPathMesh);
    followPathMesh.geometry.dispose();
    followPathMesh.material.dispose();
    followPathMesh = null;
  }
}

// Find nearest target (car or bird)
export function findNearestTarget(type = 'car') {
  const { dronePos } = state;

  if (type === 'car') {
    let nearestCar = null;
    let nearestDist = Infinity;

    cars.forEach(car => {
      const dist = car.position.distanceTo(dronePos);
      if (dist < nearestDist && dist < 150) {
        nearestDist = dist;
        nearestCar = car;
      }
    });

    return nearestCar;
  } else if (type === 'bird') {
    let nearestBird = null;
    let nearestDist = Infinity;

    birds.forEach(bird => {
      const dist = bird.position.distanceTo(dronePos);
      if (dist < nearestDist && dist < 150) {
        nearestDist = dist;
        nearestBird = bird;
      }
    });

    return nearestBird;
  }

  return null;
}

// Start follow mode
export function startFollow(targetType = 'car') {
  const target = findNearestTarget(targetType);

  if (!target) {
    showNotif(`⚠️ 没有找到附近的${targetType === 'car' ? '车辆' : '飞鸟'}`);
    return false;
  }

  state.isFollowMode = true;
  state.followTarget = target;
  state.followTargetType = targetType;

  createFollowPath();
  showNotif(`✈️ 开始跟随${targetType === 'car' ? '车辆' : '飞鸟'}`);

  return true;
}

// Stop follow mode
export function stopFollow() {
  state.isFollowMode = false;
  state.followTarget = null;
  removeFollowPath();
  showNotif('跟随已停止');
}
