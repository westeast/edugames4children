// World objects: trees, buildings, towers, lakes that populate terrain chunks
import * as THREE from 'three';
import { scene } from './engine.js';
import { CHUNK_SIZE } from './config.js';
import { chunkKey, chunkObjects, getTerrainHeight } from './terrain.js';

// Shared geometries & materials
const treeTrunkGeo = new THREE.CylinderGeometry(0.3, 0.5, 4, 6);
const treeTrunkMat = new THREE.MeshLambertMaterial({ color: 0x5c3a1e });
const treeCrownGeo1 = new THREE.ConeGeometry(3, 6, 6);
const treeCrownGeo2 = new THREE.SphereGeometry(3, 6, 5);
const treeCrownMat1 = new THREE.MeshLambertMaterial({ color: 0x2d6b2d });
const treeCrownMat2 = new THREE.MeshLambertMaterial({ color: 0x3a8a3a });
const buildingGeo = new THREE.BoxGeometry(1, 1, 1);
const buildingMat = new THREE.MeshLambertMaterial({ color: 0x888899 });
const towerGeo = new THREE.CylinderGeometry(0.3, 0.5, 30, 6);
const towerMat = new THREE.MeshLambertMaterial({ color: 0x999999 });

export function populateChunk(cx, cz, ox, oz) {
  const key = chunkKey(cx, cz);
  const objs = [];
  // Seeded random for consistent chunk content
  let s = cx * 73856093 ^ cz * 19349663;
  const rng = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };

  // Trees
  for (let i = 0; i < 25; i++) {
    const tx = ox + (rng() - 0.5) * CHUNK_SIZE, tz = oz + (rng() - 0.5) * CHUNK_SIZE;
    const th = getTerrainHeight(tx, tz);
    if (th < 3 || th > 55) continue;
    const tt = rng() > 0.5 ? 0 : 1, sc = 0.8 + rng() * 1.5;
    const g = new THREE.Group();
    const trunk = new THREE.Mesh(treeTrunkGeo, treeTrunkMat);
    trunk.scale.set(sc, sc, sc); trunk.position.y = 2 * sc; g.add(trunk);
    const crown = new THREE.Mesh(tt === 0 ? treeCrownGeo1 : treeCrownGeo2, tt === 0 ? treeCrownMat1 : treeCrownMat2);
    crown.scale.set(sc, sc * (tt === 0 ? 1.2 : 1), sc); crown.position.y = (tt === 0 ? 7 : 6) * sc; g.add(crown);
    g.position.set(tx, th, tz); g.castShadow = true; scene.add(g); objs.push(g);
  }

  // Buildings
  for (let i = 0; i < 5; i++) {
    const bx = ox + (rng() - 0.5) * CHUNK_SIZE * 0.6, bz = oz + (rng() - 0.5) * CHUNK_SIZE * 0.6;
    const bh = getTerrainHeight(bx, bz);
    if (bh < 2 || bh > 30) continue;
    const h = 8 + rng() * 25, w = 5 + rng() * 10, d = 5 + rng() * 10;
    const bldg = new THREE.Mesh(buildingGeo, buildingMat.clone());
    bldg.material.color.setHSL(rng() * 0.1 + 0.55, 0.1, 0.5 + rng() * 0.3);
    bldg.scale.set(w, h, d); bldg.position.set(bx, bh + h / 2, bz);
    bldg.castShadow = true; bldg.receiveShadow = true; scene.add(bldg); objs.push(bldg);
  }

  // Power line towers (sparse)
  if (rng() > 0.7) {
    const tx = ox + (rng() - 0.5) * CHUNK_SIZE * 0.5, tz = oz + (rng() - 0.5) * CHUNK_SIZE * 0.5;
    const th = getTerrainHeight(tx, tz);
    const tw = new THREE.Mesh(towerGeo, towerMat);
    tw.position.set(tx, th + 15, tz); tw.castShadow = true; scene.add(tw); objs.push(tw);
  }

  // Water lakes
  if (rng() > 0.6) {
    const lx = ox + (rng() - 0.5) * CHUNK_SIZE * 0.4, lz = oz + (rng() - 0.5) * CHUNK_SIZE * 0.4;
    if (getTerrainHeight(lx, lz) < 5) {
      const wg = new THREE.CircleGeometry(20 + rng() * 30, 16); wg.rotateX(-Math.PI / 2);
      const water = new THREE.Mesh(wg, new THREE.MeshPhongMaterial({ color: 0x2266aa, transparent: true, opacity: 0.7, shininess: 100, specular: 0x88bbff }));
      water.position.set(lx, 1.5, lz); scene.add(water); objs.push(water);
    }
  }

  chunkObjects.set(key, objs);
}