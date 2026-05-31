// Drone 3D model: realistic DJI quadcopter with spinning propellers
import * as THREE from 'three';
import { scene } from './engine.js';
import { DRONES, state } from './config.js';

export let droneGroup = null;
export let propellers = [];
export let propBlurs = []; // Blur disks for high speed

export function createDroneModel(droneIdx) {
  if (droneGroup) {
    scene.remove(droneGroup);
    droneGroup.traverse(c => {
      if (c.geometry) c.geometry.dispose();
      if (c.material) { if (Array.isArray(c.material)) c.material.forEach(m => m.dispose()); else c.material.dispose(); }
    });
  }
  const spec = DRONES[droneIdx];
  const g = new THREE.Group();
  propellers = [];
  propBlurs = [];
  const accent = spec.color;

  // Central body
  g.add(new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.3, 1.0), new THREE.MeshPhongMaterial({ color: 0x1a1a1a, shininess: 80 })));
  // Top accent shell
  const shell = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.15, 0.8), new THREE.MeshPhongMaterial({ color: accent, shininess: 100 }));
  shell.position.y = 0.22; g.add(shell);
  // Camera gimbal
  const gimbal = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 8), new THREE.MeshPhongMaterial({ color: 0x111111, shininess: 120 }));
  gimbal.position.set(0, -0.2, 0.4); g.add(gimbal);
  // Camera lens
  const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.1, 8), new THREE.MeshPhongMaterial({ color: 0x2244aa, shininess: 200 }));
  lens.rotation.x = Math.PI / 2; lens.position.set(0, -0.25, 0.5); g.add(lens);

  // Arms + motors + propellers
  const armPos = [
    { x: 1.2, z: 1.2, a: Math.PI / 4 },
    { x: -1.2, z: 1.2, a: 3 * Math.PI / 4 },
    { x: 1.2, z: -1.2, a: -Math.PI / 4 },
    { x: -1.2, z: -1.2, a: -3 * Math.PI / 4 },
  ];

  armPos.forEach((ap, idx) => {
    // Arm
    const arm = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.08, 0.12), new THREE.MeshPhongMaterial({ color: 0x2a2a2a }));
    arm.position.set(ap.x * 0.5, 0, ap.z * 0.5); arm.rotation.y = ap.a; g.add(arm);
    // Motor housing
    const motor = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.18, 0.2, 8), new THREE.MeshPhongMaterial({ color: 0x333333 }));
    motor.position.set(ap.x, 0.1, ap.z); g.add(motor);
    // Propeller group
    const propGroup = new THREE.Group(); propGroup.position.set(ap.x, 0.25, ap.z);
    const blade1 = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.02, 0.15), new THREE.MeshPhongMaterial({ color: 0x444444, transparent: true, opacity: 0.7 }));
    propGroup.add(blade1);
    const blade2 = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.02, 0.15), new THREE.MeshPhongMaterial({ color: 0x444444, transparent: true, opacity: 0.7 }));
    blade2.rotation.y = Math.PI / 2; propGroup.add(blade2);
    // Prop guard ring
    const guard = new THREE.Mesh(new THREE.TorusGeometry(1.1, 0.03, 4, 16), new THREE.MeshPhongMaterial({ color: 0x333333 }));
    guard.rotation.x = Math.PI / 2; propGroup.add(guard);
    g.add(propGroup); propellers.push(propGroup);
    // Blur disk for high speed (initially hidden)
    const blurDisk = new THREE.Mesh(
      new THREE.CircleGeometry(1.1, 32),
      new THREE.MeshBasicMaterial({ color: 0x666666, transparent: true, opacity: 0, side: THREE.DoubleSide })
    );
    blurDisk.rotation.x = -Math.PI / 2; blurDisk.position.set(ap.x, 0.26, ap.z);
    g.add(blurDisk); propBlurs.push(blurDisk);
    // Black ring around blur disk (same style as prop guard)
    const blurRing = new THREE.Mesh(new THREE.TorusGeometry(1.1, 0.03, 4, 16), new THREE.MeshPhongMaterial({ color: 0x333333 }));
    blurRing.rotation.x = Math.PI / 2; blurRing.position.set(ap.x, 0.27, ap.z);
    blurRing.visible = false; g.add(blurRing); propBlurs.push(blurRing);
    // LED lights (front=green, rear=red)
    const ledColor = idx < 2 ? 0x00ff00 : 0xff0000;
    const led = new THREE.Mesh(new THREE.SphereGeometry(0.05, 4, 4), new THREE.MeshBasicMaterial({ color: ledColor }));
    led.position.set(ap.x, -0.1, ap.z); g.add(led);
  });

  // Landing gear
  const legMat = new THREE.MeshPhongMaterial({ color: 0x333333 });
  [[-0.4, 0, 0.3], [0.4, 0, 0.3], [-0.4, 0, -0.3], [0.4, 0, -0.3]].forEach(p => {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.4, 4), legMat);
    leg.position.set(p[0], -0.35, p[2]); g.add(leg);
  });
  const skid1 = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.04, 0.06), legMat);
  skid1.position.set(0, -0.55, 0.3); g.add(skid1);
  const skid2 = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.04, 0.06), legMat);
  skid2.position.set(0, -0.55, -0.3); g.add(skid2);

  g.position.copy(state.dronePos);
  scene.add(g); droneGroup = g;
}