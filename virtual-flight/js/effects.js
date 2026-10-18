// 粒子特效：爆炸、火焰、黑烟、碎片、雨、灰烬
import * as THREE from 'three';

const FIRE_MAX = 520;
const SMOKE_MAX = 420;

function makeParticleMaterial(additive) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    vertexShader: `
      attribute float aSize;
      attribute float aAlpha;
      varying vec3 vColor;
      varying float vAlpha;
      void main() {
        vColor = color;
        vAlpha = aAlpha;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = aSize * (320.0 / max(-mv.z, 1.0));
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: `
      varying vec3 vColor;
      varying float vAlpha;
      void main() {
        float d = length(gl_PointCoord - vec2(0.5));
        if (d > 0.5) discard;
        float a = smoothstep(0.5, 0.12, d) * vAlpha;
        gl_FragColor = vec4(vColor, a);
      }
    `,
    vertexColors: true
  });
}

function createPool(scene, max, additive) {
  const positions = new Float32Array(max * 3);
  const colors = new Float32Array(max * 3);
  const sizes = new Float32Array(max);
  const alphas = new Float32Array(max);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
  geo.setAttribute('aAlpha', new THREE.BufferAttribute(alphas, 1));
  geo.setDrawRange(0, max);
  const mat = makeParticleMaterial(additive);
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  scene.add(points);

  const parts = new Array(max);
  for (let i = 0; i < max; i++) parts[i] = null;

  let cursor = 0;
  return {
    points, geo, positions, colors, sizes, alphas, parts,
    spawn(p) {
      // 优先使用空位，否则覆盖最旧的
      let idx = -1;
      for (let i = 0; i < max; i++) {
        if (!parts[i]) { idx = i; break; }
      }
      if (idx < 0) { idx = cursor % max; cursor++; }
      parts[idx] = p;
    },
    update(dt) {
      let alive = 0;
      for (let i = 0; i < max; i++) {
        const p = parts[i];
        if (!p) {
          alphas[i] = 0;
          sizes[i] = 0;
          continue;
        }
        p.life += dt;
        if (p.life >= p.maxLife) { parts[i] = null; alphas[i] = 0; sizes[i] = 0; continue; }
        alive++;
        const t = p.life / p.maxLife;
        p.vx *= (1 - p.drag * dt);
        p.vy *= (1 - p.drag * dt);
        p.vz *= (1 - p.drag * dt);
        p.vy += p.gravity * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.z += p.vz * dt;
        const k = i * 3;
        positions[k] = p.x;
        positions[k + 1] = p.y;
        positions[k + 2] = p.z;
        const r = p.c0[0] + (p.c1[0] - p.c0[0]) * t;
        const g = p.c0[1] + (p.c1[1] - p.c0[1]) * t;
        const b = p.c0[2] + (p.c1[2] - p.c0[2]) * t;
        colors[k] = r; colors[k + 1] = g; colors[k + 2] = b;
        sizes[i] = p.size0 + (p.size1 - p.size0) * t;
        alphas[i] = Math.sin(Math.min(t, 1) * Math.PI) * p.opacity;
      }
      geo.attributes.position.needsUpdate = true;
      geo.attributes.color.needsUpdate = true;
      geo.attributes.aSize.needsUpdate = true;
      geo.attributes.aAlpha.needsUpdate = true;
      return alive;
    }
  };
}

function rand(a, b) { return a + Math.random() * (b - a); }

export function createEffects(scene) {
  const fire = createPool(scene, FIRE_MAX, true);
  const smoke = createPool(scene, SMOKE_MAX, false);

  const flashes = [];
  const debris = [];
  const ashMats = [];
  const burnSources = [];
  const sound = { play: null };

  // 雨
  const rainCount = 700;
  const rainGeo = new THREE.BufferGeometry();
  const rainPos = new Float32Array(rainCount * 6);
  const rainSpeed = new Float32Array(rainCount);
  for (let i = 0; i < rainCount; i++) {
    rainPos[i * 6] = rand(-90, 90);
    rainPos[i * 6 + 1] = rand(0, 90);
    rainPos[i * 6 + 2] = rand(-90, 90);
    rainPos[i * 6 + 3] = rainPos[i * 6];
    rainPos[i * 6 + 4] = rainPos[i * 6 + 1] - rand(1.2, 2.6);
    rainPos[i * 6 + 5] = rainPos[i * 6 + 2];
    rainSpeed[i] = rand(55, 85);
  }
  rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
  const rainMat = new THREE.LineBasicMaterial({
    color: '#b9d4e8', transparent: true, opacity: 0.5, depthWrite: false
  });
  const rainLines = new THREE.LineSegments(rainGeo, rainMat);
  rainLines.frustumCulled = false;
  rainLines.visible = false;
  scene.add(rainLines);

  // 火山灰
  const ashCount = 320;
  const ashGeo = new THREE.BufferGeometry();
  const ashPos = new Float32Array(ashCount * 3);
  for (let i = 0; i < ashCount; i++) {
    ashPos[i * 3] = rand(-400, 400);
    ashPos[i * 3 + 1] = rand(2, 180);
    ashPos[i * 3 + 2] = rand(-1400, 200);
  }
  ashGeo.setAttribute('position', new THREE.BufferAttribute(ashPos, 3));
  const ashMat = new THREE.PointsMaterial({
    color: '#c9b9a4', size: 1.1, transparent: true, opacity: 0.55, depthWrite: false
  });
  const ashPoints = new THREE.Points(ashGeo, ashMat);
  ashPoints.frustumCulled = false;
  ashPoints.visible = false;
  scene.add(ashPoints);

  const hemi = new THREE.Vector3();
  let planetRadius = 20000;

  function spawnFire(pos, n, scale = 1, spread = 1) {
    for (let i = 0; i < n; i++) {
      const life = rand(0.35, 0.9) * scale;
      fire.spawn({
        x: pos.x + rand(-spread, spread), y: pos.y + rand(-spread * 0.5, spread),
        z: pos.z + rand(-spread, spread),
        vx: rand(-6, 6) * scale, vy: rand(1, 9) * scale, vz: rand(-6, 6) * scale,
        gravity: 2.5, drag: 1.4, life: 0, maxLife: life,
        size0: rand(2.5, 6) * scale, size1: rand(0.4, 1.6) * scale,
        c0: [1.0, 0.86, 0.32], c1: [0.85, 0.12, 0.02], opacity: 0.95
      });
    }
  }

  function spawnSmoke(pos, n, scale = 1, spread = 1) {
    for (let i = 0; i < n; i++) {
      const life = rand(1.4, 3.4) * scale;
      const grey = rand(0.08, 0.2);
      smoke.spawn({
        x: pos.x + rand(-spread, spread), y: pos.y + rand(0, spread),
        z: pos.z + rand(-spread, spread),
        vx: rand(-2.4, 2.4) * scale, vy: rand(2, 7) * scale, vz: rand(-2.4, 2.4) * scale,
        gravity: 0.8, drag: 0.8, life: 0, maxLife: life,
        size0: rand(3, 6) * scale, size1: rand(10, 20) * scale,
        c0: [grey + 0.12, grey + 0.12, grey + 0.13], c1: [0.05, 0.05, 0.06], opacity: 0.7
      });
    }
  }

  function flashAt(pos, scale = 1) {
    const mat = new THREE.MeshBasicMaterial({
      color: '#ffd27a', transparent: true, opacity: 0.95,
      blending: THREE.AdditiveBlending, depthWrite: false
    });
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), mat);
    mesh.position.copy(pos);
    mesh.scale.setScalar(0.5 * scale);
    scene.add(mesh);
    flashes.push({ mesh, t: 0, life: 0.4, scale });

    const ringMat = new THREE.MeshBasicMaterial({
      color: '#ffcf8a', transparent: true, opacity: 0.8,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide
    });
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.8, 1.0, 40), ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.copy(pos);
    scene.add(ring);
    flashes.push({ mesh: ring, t: 0, life: 0.65, scale, ring: true });

    const light = new THREE.PointLight('#ff9a42', 30 * scale, 160 * scale, 2);
    light.position.copy(pos);
    scene.add(light);
    flashes.push({ light, t: 0, life: 0.55, scale });
  }

  function explode(pos, { scale = 1, quiet = false } = {}) {
    flashAt(pos, scale);
    spawnFire(pos, Math.round(46 * Math.min(scale, 2)), scale);
    spawnSmoke(pos, Math.round(34 * Math.min(scale, 2)), scale);
    for (let i = 0; i < Math.round(18 * scale); i++) {
      fire.spawn({
        x: pos.x, y: pos.y, z: pos.z,
        vx: rand(-24, 24), vy: rand(2, 26), vz: rand(-24, 24),
        gravity: -18, drag: 0.15, life: 0, maxLife: rand(0.5, 1.3),
        size0: rand(0.5, 1.3), size1: 0.1,
        c0: [1.0, 0.95, 0.7], c1: [1.0, 0.35, 0.05], opacity: 1
      });
    }
    if (!quiet && sound.play) sound.play('explosion', { scale });
  }

  function makeGray(mat) {
    if (!mat || !mat.color) return;
    mat.userData = mat.userData || {};
    if (!mat.userData.origColor) mat.userData.origColor = mat.color.clone();
    if ('roughness' in mat) mat.roughness = 1;
    if ('metalness' in mat) mat.metalness = 0.05;
  }

  function collectMaterials(root) {
    root.traverse((o) => {
      if (!o.isMesh || !o.material) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) {
        if (m && !ashMats.includes(m)) {
          makeGray(m);
          ashMats.push(m);
        }
      }
    });
  }

  function fallParts(player) {
    const obj = player.object;
    const extras = new Set([
      obj.userData.missileGroup, obj.userData.afterburner, obj.userData.vtolGlow,
      obj.userData.liftFan, obj.userData.nozzlePivot
    ]);
    if (obj.userData.elevators) for (const e of obj.userData.elevators) extras.add(e);
    if (obj.userData.propeller) extras.add(obj.userData.propeller);
    if (obj.userData.wingFans) for (const w of obj.userData.wingFans) extras.add(w.parent);

    const candidates = [];
    obj.traverse((o) => {
      if (!o.isMesh) return;
      if (extras.has(o) || extras.has(o.parent)) return;
      const box = new THREE.Box3().setFromObject(o);
      const size = box.getSize(new THREE.Vector3());
      if (size.length() < 0.15) return;
      candidates.push(o);
    });
    const picks = candidates.sort(() => Math.random() - 0.5).slice(0, 7);
    for (const mesh of picks) {
      obj.updateMatrixWorld(true);
      const worldPos = new THREE.Vector3();
      const worldQuat = new THREE.Quaternion();
      const worldScale = new THREE.Vector3();
      mesh.matrixWorld.decompose(worldPos, worldQuat, worldScale);
      const clone = new THREE.Mesh(mesh.geometry, mesh.material.clone());
      clone.position.copy(worldPos);
      clone.quaternion.copy(worldQuat);
      clone.scale.copy(worldScale);
      clone.castShadow = true;
      scene.add(clone);
      const v = new THREE.Vector3(
        mesh.matrixWorld.elements[12] - obj.position.x,
        0, mesh.matrixWorld.elements[14] - obj.position.z
      ).normalize().multiplyScalar(rand(3, 9));
      debris.push({
        mesh: clone,
        vel: new THREE.Vector3(v.x, rand(2, 9), v.z),
        spin: new THREE.Vector3(rand(-5, 5), rand(-5, 5), rand(-5, 5)),
        t: 0, life: rand(3, 5.5)
      });
      mesh.visible = false;
    }
    // 挡风玻璃板：额外生成一块透明面板
    const glass = new THREE.Mesh(
      new THREE.PlaneGeometry(1.6, 1.1),
      new THREE.MeshStandardMaterial({
        color: '#9fd4e8', transparent: true, opacity: 0.55,
        roughness: 0.05, metalness: 0.2, side: THREE.DoubleSide
      })
    );
    glass.position.copy(obj.position);
    glass.position.y += player.halfHeight * 0.9;
    glass.position.z += obj.userData.length ? obj.userData.length * 0.1 : 1;
    scene.add(glass);
    debris.push({
      mesh: glass,
      vel: new THREE.Vector3(rand(-4, 4), 7, rand(2, 7)),
      spin: new THREE.Vector3(rand(-6, 6), rand(-4, 4), rand(-8, 8)),
      t: 0, life: 4.5
    });
    return picks.length + 1;
  }

  let ashT = 0;
  function crash(player, { enemy = false } = {}) {
    const pos = player.object.position.clone();
    explode(pos, { scale: 1.6 });
    spawnFire(pos, 60, 1.4, 2);
    spawnSmoke(pos, 55, 1.6, 2);
    for (let i = 0; i < 12; i++) {
      setTimeout(() => {
        if (!player.object.parent) return;
        spawnFire(player.object.position.clone(), 12, 1, 1.4);
        spawnSmoke(player.object.position.clone(), 8, 1.2, 1.2);
      }, i * 140);
    }
    collectMaterials(player.object);
    ashT = 0;
    const detached = enemy ? 0 : fallParts(player);
    burnSources.push({ obj: player.object, t: 0, life: enemy ? 2.2 : 3.6, enemy });
    if (sound.play) sound.play(enemy ? 'explosion' : 'crash');
    return detached;
  }

  function spawnTrail(pos, kind = 'missile') {
    if (kind === 'missile') {
      smoke.spawn({
        x: pos.x, y: pos.y, z: pos.z,
        vx: rand(-0.5, 0.5), vy: rand(0, 0.8), vz: rand(-0.5, 0.5),
        gravity: 0.6, drag: 1.2, life: 0, maxLife: rand(0.9, 1.6),
        size0: 0.5, size1: 3.2, c0: [0.9, 0.9, 0.9], c1: [0.4, 0.4, 0.4], opacity: 0.5
      });
    } else {
      spawnFire(pos, 1, 0.5);
    }
  }

  function update(dt, camera, elapsed = 0) {
    fire.update(dt);
    smoke.update(dt);

    for (let i = flashes.length - 1; i >= 0; i--) {
      const f = flashes[i];
      f.t += dt;
      const k = f.t / f.life;
      if (k >= 1) {
        scene.remove(f.mesh || f.light);
        if (f.mesh) { f.mesh.geometry.dispose(); f.mesh.material.dispose(); }
        flashes.splice(i, 1);
        continue;
      }
      if (f.light) f.light.intensity = (1 - k) * 30 * f.scale;
      else if (f.ring) {
        f.mesh.scale.setScalar((0.6 + k * 9) * f.scale);
        f.mesh.material.opacity = (1 - k) * 0.8;
      } else {
        f.mesh.scale.setScalar((0.5 + k * 3.2) * f.scale);
        f.mesh.material.opacity = (1 - k) * 0.95;
      }
    }

    for (let i = debris.length - 1; i >= 0; i--) {
      const d = debris[i];
      d.t += dt;
      const up = d.mesh.position.clone().normalize();
      d.vel.addScaledVector(up, -22 * dt);
      d.mesh.position.addScaledVector(d.vel, dt);
      d.mesh.rotation.x += d.spin.x * dt;
      d.mesh.rotation.y += d.spin.y * dt;
      d.mesh.rotation.z += d.spin.z * dt;
      if (d.mesh.position.length() < planetRadius + 0.2) {
        d.mesh.position.copy(up).multiplyScalar(planetRadius + 0.2);
        const radial = d.vel.dot(up);
        d.vel.addScaledVector(up, -radial * 1.25);
        d.vel.multiplyScalar(0.3);
        d.spin.multiplyScalar(0.5);
      }
      if (d.t >= d.life) {
        scene.remove(d.mesh);
        if (d.mesh.material && d.mesh.material.dispose) d.mesh.material.dispose();
        debris.splice(i, 1);
      }
    }

    // 燃烧源：持续冒火/黑烟，材质逐渐变灰
    ashT += dt;
    for (let i = burnSources.length - 1; i >= 0; i--) {
      const b = burnSources[i];
      b.t += dt;
      if (Math.random() < 0.7) spawnFire(b.obj.position.clone().add(new THREE.Vector3(rand(-1.4, 1.4), rand(0, 1.4), rand(-1.4, 1.4))), 1, 0.8);
      if (Math.random() < 0.35) spawnSmoke(b.obj.position.clone().add(new THREE.Vector3(rand(-1.5, 1.5), rand(0.5, 2), rand(-1.5, 1.5))), 1, 0.9);
      const gray = Math.min(1, b.t / 2.4);
      for (const m of ashMats) {
        if (m.userData?.origColor && m.color) {
          m.color.copy(m.userData.origColor).lerp(new THREE.Color('#4d4a48'), gray);
          m.needsUpdate = true;
        }
      }
      if (b.t >= b.life) {
        b.obj.visible = false;
        burnSources.splice(i, 1);
      }
    }

    if (rainLines.visible && camera) {
      const arr = rainLines.geometry.attributes.position.array;
      const cx = camera.position.x, cy = camera.position.y, cz = camera.position.z;
      for (let i = 0; i < rainCount; i++) {
        const k = i * 6;
        arr[k + 1] -= rainSpeed[i] * dt;
        arr[k + 4] = arr[k + 1] - 1.8;
        if (arr[k + 1] < cy - 60) {
          arr[k] = cx + rand(-70, 70);
          arr[k + 2] = cz + rand(-70, 70);
          arr[k + 1] = cy + 55 + rand(0, 20);
          arr[k + 3] = arr[k];
          arr[k + 4] = arr[k + 1] - 1.8;
          arr[k + 5] = arr[k + 2];
        }
      }
      rainLines.geometry.attributes.position.needsUpdate = true;
      rainLines.position.set(0, 0, 0);
    }

    if (ashPoints.visible) {
      const arr = ashPoints.geometry.attributes.position.array;
      for (let i = 0; i < ashCount; i++) {
        arr[i * 3 + 1] -= (1.4 + (i % 5) * 0.3) * dt;
        arr[i * 3] += Math.sin(elapsed * 0.6 + i) * 0.6 * dt;
        if (arr[i * 3 + 1] < -20) arr[i * 3 + 1] = 160;
      }
      ashPoints.geometry.attributes.position.needsUpdate = true;
      // 灰烬始终围绕镜头，球面上任何位置都能看到
      if (camera) ashPoints.position.copy(camera.position);
    }
  }

  function setRain(on) {
    rainLines.visible = on;
  }

  function setAsh(on) {
    ashPoints.visible = on;
    // 每颗灰烬以镜头为原点，重置到镜头附近
    const arr = ashPoints.geometry.attributes.position.array;
    for (let i = 0; i < ashCount; i++) {
      arr[i * 3] = rand(-90, 90);
      arr[i * 3 + 1] = rand(-20, 160);
      arr[i * 3 + 2] = rand(-90, 90);
    }
    ashPoints.geometry.attributes.position.needsUpdate = true;
  }

  function setPlanetRadius(r) {
    if (Number.isFinite(r) && r > 0) planetRadius = r;
  }

  function clear() {
    for (let i = 0; i < FIRE_MAX; i++) fire.parts[i] = null;
    for (let i = 0; i < SMOKE_MAX; i++) smoke.parts[i] = null;
    for (const d of debris) scene.remove(d.mesh);
    debris.length = 0;
    for (const f of flashes) scene.remove(f.mesh || f.light);
    flashes.length = 0;
    for (const b of burnSources) b.obj.visible = true;
    burnSources.length = 0;
    for (const m of ashMats) {
      if (m.userData?.origColor && m.color) {
        m.color.copy(m.userData.origColor);
        m.needsUpdate = true;
      }
    }
    ashMats.length = 0;
  }

  return {
    update, explode, crash, spawnTrail, setRain, setAsh, clear, sound,
    setPlanetRadius,
    spawnFire, spawnSmoke,
    get activeParticles() { return fire.parts.filter(Boolean).length + smoke.parts.filter(Boolean).length; },
    get debrisCount() { return debris.length; },
    get burnCount() { return burnSources.length; }
  };
}
