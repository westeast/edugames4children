// Voyager 1 spacecraft with dish antenna + signal rings
import * as THREE from 'three';
import { scene } from './engine.js';
import { state } from './config.js';

export let voyager1Group = null;
export let signalRings = [];

export function createVoyager1() {
  if (voyager1Group) {
    voyager1Group.traverse(child => {
      if (child.isMesh || child.isPoints) {
        if (child.material) {
          const mat = Array.isArray(child.material) ? child.material : [child.material];
          mat.forEach(m => { m.dispose && m.dispose(); });
        }
        if (child.geometry) child.geometry.dispose && child.geometry.dispose();
      }
    });
    scene.remove(voyager1Group);
  }
  voyager1Group = new THREE.Group();

  // Main body box (~0.5m × 0.4m × 0.3m, scaled up for visibility)
  const bodyGeo = new THREE.BoxGeometry(1.2, 1.0, 0.8);
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0xccccaa, metalness: 0.5 });
  voyager1Group.add(new THREE.Mesh(bodyGeo, bodyMat));

  // High-gain antenna dish (3.66m diameter → scaled for visibility)
  const dishGeo = new THREE.CylinderGeometry(2.5, 2.5, 0.2, 48);
  const dishMat = new THREE.MeshStandardMaterial({ color: 0xddddcc, side: THREE.DoubleSide });
  const dish = new THREE.Mesh(dishGeo, dishMat);
  dish.position.z = -3; // Pointing toward Earth direction
  voyager1Group.add(dish);

  // Antenna support boom
  const boomGeo = new THREE.CylinderGeometry(0.05, 0.05, 2.8, 8);
  const boomMat = new THREE.MeshStandardMaterial({ color: 0xaaaaaa });
  const boom = new THREE.Mesh(boomGeo, boomMat);
  boom.position.z = -1.6;
  voyager1Group.add(boom);

  // Create signal rings (concentric circles expanding outward)
  createSignalRings();

  scene.add(voyager1Group);
}

function createSignalRings() {
  signalRings = [];
  for (let i = 0; i < 5; i++) {
    const ringGeo = new THREE.RingGeometry(0.3, 0.6, 48);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x44aaff, transparent: true, opacity: 0.6 - i * 0.12, side: THREE.DoubleSide
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.z = -3.2; // Just in front of dish
    voyager1Group.add(ring);
    signalRings.push({ mesh: ring, delay: i * 0.6, phase: 0 });
  }
}
