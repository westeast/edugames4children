// 战斗：导弹、敌机/敌舰/无人机、任务状态与小红花触发
import * as THREE from 'three';
import { AIRCRAFT, clamp } from './config.js';
import { createAircraftInstance, buildShipInstance, makeMissile } from './assets.js';

const LOCAL_FORWARD = new THREE.Vector3(0, 0, -1);

function tintEnemy(root) {
  root.traverse((o) => {
    if (!o.isMesh) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) {
      if (!m) continue;
      if (m.color) m.color.multiply(new THREE.Color('#e8c9c4'));
      if ('emissive' in m) {
        m.emissive = new THREE.Color('#240404');
        m.emissiveIntensity = 0.5;
      }
      m.needsUpdate = true;
    }
  });
}

function makeDrone() {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: '#3a4045', roughness: 0.6, metalness: 0.5 });
  const red = new THREE.MeshStandardMaterial({ color: '#b52a20', emissive: '#5c0b06', emissiveIntensity: 0.9, roughness: 0.5 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.6, 2.6), mat);
  g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.55, 10, 8), red);
  head.position.set(0, 0.1, -1.5);
  g.add(head);
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + i * Math.PI / 2;
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 2.4), mat);
    arm.position.set(Math.cos(a) * 1.2, 0.1, Math.sin(a) * 1.2);
    arm.rotation.y = -a;
    g.add(arm);
    const rotor = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.85, 0.04, 14), new THREE.MeshStandardMaterial({ color: '#222629', transparent: true, opacity: 0.6 }));
    rotor.position.set(Math.cos(a) * 2.2, 0.22, Math.sin(a) * 2.2);
    g.add(rotor);
  }
  g.userData.spinRotors = true;
  return g;
}

export function createCombat(scene, world, effects, callbacks = {}) {
  let targets = [];
  let missiles = [];
  let enemyMissiles = [];
  let missionState = 'active';
  let selectedMap = 'mountain';
  let mode = 'free';
  let level = 1;
  let elapsed = 0;
  let ship = null;
  let shipSink = 0;
  let nextId = 1;

  function addTarget(t) {
    t.id = nextId++;
    t.maxHealth = t.health;
    t.alive = true;
    targets.push(t);
    if (t.object && !t.object.parent) scene.add(t.object);
    return t;
  }

  function clearTargets() {
    for (const t of targets) {
      if (t.object && t.object.parent === scene) scene.remove(t.object);
    }
    targets = [];
    for (const m of [...missiles, ...enemyMissiles]) scene.remove(m.object);
    missiles = [];
    enemyMissiles = [];
    ship = null;
    shipSink = 0;
    missionState = 'active';
  }

  function spawnShip() {
    const obj = buildShipInstance(120);
    const sp = world.shipSpawn.clone();
    const surf = world.surfaceAtPosition(sp);
    const dir = sp.clone().normalize();
    obj.position.copy(dir).multiplyScalar(surf.h + 6.5);
    obj.quaternion.copy(world.orientAt(obj.position, selectedMap === 'carrier' ? 0.7 : -0.5));
    const up = obj.position.clone().normalize();
    const t = addTarget({
      type: 'ship', object: obj, health: 2, radius: 34,
      pos: obj.position.clone().addScaledVector(up, 8),
      label: '敌舰'
    });
    ship = t;
    return t;
  }

  function spawnEnemyPlane(index, withFire) {
    const spec = index === 0 ? AIRCRAFT.j20 : AIRCRAFT.j16;
    const obj = createAircraftInstance(spec);
    tintEnemy(obj);
    const base = world.shipSpawn;
    const side = index === 0 ? 1 : -1;
    obj.position.copy(world.offsetAt(base, side * 180, 130 + index * 35, 240 + index * 90));
    obj.quaternion.copy(world.orientAt(obj.position, side * 1.2));
    const t = addTarget({
      type: 'plane', object: obj, health: 1, radius: 9,
      label: index === 0 ? '敌机 A' : '敌机 B',
      speed: 105 + index * 8,
      phase: index * 2.1,
      fireEnabled: withFire,
      fireCooldown: 4 + index * 2,
      home: obj.position.clone()
    });
    return t;
  }

  function spawnDrone(index) {
    const obj = makeDrone();
    const lx = -120 + index * 120;
    obj.position.copy(world.localToWorld(new THREE.Vector3(lx, 55 + index * 12, -520 - index * 60)));
    obj.quaternion.copy(world.orientAt(obj.position, index * 1.4));
    const t = addTarget({
      type: 'drone', object: obj, health: 1, radius: 4,
      label: '无人机 ' + (index + 1),
      speed: 26, phase: index * 1.4,
      fireEnabled: false, fireCooldown: 0,
      home: obj.position.clone()
    });
    return t;
  }

  function spawnLaunchers() {
    // 与 world.js 中发射车位置一致
    for (let i = 0; i < 5; i++) {
      const x = -120 + i * 55;
      const z = -620 - (i % 2) * 70;
      const marker = new THREE.Object3D();
      const base = world.localToWorld(new THREE.Vector3(x, 0, z));
      const surf = world.surfaceAtPosition(base);
      marker.position.copy(base.clone().normalize()).multiplyScalar(surf.h + 5);
      addTarget({
        type: 'launcher', object: marker, health: 1, radius: 7,
        label: '导弹车 ' + (i + 1), static: true, fireEnabled: false
      });
    }
  }

  function spawnOutpost() {
    const out = world.outpost;
    if (!out) return;
    for (const s of out.soldiers) {
      s.group.visible = true;
      const pos = new THREE.Vector3();
      s.group.getWorldPosition(pos);
      addTarget({
        type: 'soldier', object: s.group, health: 1, radius: 2.6,
        pos: pos.add(new THREE.Vector3(0, 1.2, 0)),
        label: s.rocket ? '敌军火箭兵' : '敌军士兵',
        static: true
      });
    }
  }

  function spawnFor({ mapId, gameMode, missionLevel }) {
    clearTargets();
    selectedMap = mapId;
    mode = gameMode;
    level = missionLevel;
    elapsed = 0;
    missionState = 'active';
    if (mode === 'free' && mapId === 'volcano') {
      spawnDrone(0); spawnDrone(1); spawnDrone(2);
      spawnLaunchers();
      spawnShip();
      return;
    }
    if (mapId === 'mountain') spawnOutpost();
    spawnShip();
    const withFire = mode === 'mission' && level === 2;
    spawnEnemyPlane(0, withFire);
    spawnEnemyPlane(1, withFire);
    if (mapId === 'volcano') {
      spawnDrone(0);
      spawnDrone(1);
      spawnLaunchers();
    }
  }

  function makeMissileEntity(origin, dir, target, owner, opts = {}) {
    const obj = makeMissile();
    obj.position.copy(origin);
    const q = new THREE.Quaternion().setFromUnitVectors(LOCAL_FORWARD, dir.clone().normalize());
    obj.quaternion.copy(q);
    obj.scale.setScalar(owner === 'player' ? 1.25 : 1.0);
    scene.add(obj);
    return {
      object: obj,
      velocity: dir.clone().normalize().multiplyScalar(opts.speed || (owner === 'player' ? 90 : 55)),
      speed: opts.speed || (owner === 'player' ? 90 : 55),
      maxSpeed: opts.maxSpeed || (owner === 'player' ? 430 : 175),
      accel: opts.accel ?? (owner === 'player' ? 160 : 42),
      turnRate: opts.turnRate ?? (owner === 'player' ? 2.4 : 1.05),
      target,
      owner,
      life: 0,
      maxLife: opts.maxLife ?? (owner === 'player' ? 7 : 10),
      trail: 0
    };
  }

  function firePlayerMissile(player) {
    if (!player || player.crashed || player.missiles <= 0) {
      callbacks.onNoAmmo?.();
      return false;
    }
    if (player.missileCooldown > 0) return false;
    player.missiles--;
    player.missileCooldown = 0.65;
    const forward = LOCAL_FORWARD.clone().applyQuaternion(player.object.quaternion).normalize();
    const mounts = player.object.userData.missileMounts || [new THREE.Vector3(0, -0.8, 0)];
    const idx = Math.max(0, player.missiles) % mounts.length;
    const local = mounts[idx] || mounts[0];
    const origin = player.object.localToWorld(local.clone());
    origin.addScaledVector(forward, 1.5);

    const lock = getLock(player);
    let dir = forward;
    if (lock) {
      dir = lock.target.pos.clone().sub(origin).normalize();
    }
    missiles.push(makeMissileEntity(origin, dir, lock ? lock.target : null, 'player', {
      speed: Math.max(90, player.speed * 0.6 + 60)
    }));
    // 隐藏已发射的挂弹
    const group = player.object.userData.missileGroup;
    if (group) {
      const visible = group.children.filter((c) => c.visible);
      if (visible.length) visible[visible.length - 1].visible = false;
    }
    callbacks.onSfx?.('missile');
    return true;
  }

  function fireEnemyMissile(from, targetPlayer) {
    if (!targetPlayer || targetPlayer.crashed) return;
    const origin = from.pos.clone();
    const dir = targetPlayer.object.position.clone().sub(origin).normalize();
    enemyMissiles.push(makeMissileEntity(origin, dir, targetPlayer, 'enemy'));
    callbacks.onWarning?.('导弹来袭！');
    callbacks.onSfx?.('warning');
  }

  // 岛上的火箭兵：速度较慢、转弯较钝，给小朋友留出躲避时间
  function fireGroundRocket(origin, targetPlayer) {
    if (!targetPlayer || targetPlayer.crashed) return false;
    const from = origin.clone();
    // 从肩扛发射管升到地表以上，避免刚出膛就判定撞地
    const surf = world.surfaceAtPosition(from);
    if (from.length() < surf.h + 3) from.setLength(surf.h + 3);
    const dir = targetPlayer.object.position.clone().sub(from);
    if (dir.lengthSq() < 1) return false;
    dir.normalize();
    enemyMissiles.push(makeMissileEntity(from, dir, targetPlayer, 'enemy', {
      speed: 42, maxSpeed: 105, accel: 22, turnRate: 0.42, maxLife: 12
    }));
    callbacks.onWarning?.('敌军火箭弹来袭！');
    callbacks.onSfx?.('warning');
    return true;
  }

  function getLock(player) {
    if (!player || player.crashed) return null;
    const forward = LOCAL_FORWARD.clone().applyQuaternion(player.object.quaternion).normalize();
    let best = null;
    for (const t of targets) {
      if (!t.alive || !t.pos) continue;
      const to = t.pos.clone().sub(player.object.position);
      const dist = to.length();
      if (dist > 1500) continue;
      const dot = to.normalize().dot(forward);
      if (dot < 0.5) continue;
      if (!best || dist < best.distance) best = { target: t, distance: dist, dot };
    }
    return best;
  }

  function killTarget(t, byPlayer = true) {
    if (!t.alive) return;
    t.alive = false;
    const pos = t.pos ? t.pos.clone() : t.object.position.clone();
    if (t.type === 'ship') {
      effects.explode(pos, { scale: 2.4 });
      shipSink = 0;
      if (t.object) t.object.userData.sinking = true;
    } else if (t.type === 'launcher') {
      effects.explode(pos, { scale: 1.1 });
      if (t.object) t.object.visible = false;
    } else {
      effects.explode(pos, { scale: t.type === 'plane' ? 1.7 : 1.0 });
      if (t.object) t.object.visible = false;
    }
    callbacks.onKill?.(t);
    checkMission();
  }

  function damageTarget(t, amount = 99) {
    if (!t || !t.alive) return;
    t.health -= amount;
    if (t.health <= 0) killTarget(t);
  }

  function aliveTargets(type) {
    return targets.filter((t) => t.alive && (!type || t.type === type));
  }

  function checkMission() {
    if (missionState !== 'active' || mode !== 'mission') return;
    const shipAlive = targets.some((t) => t.type === 'ship' && t.alive);
    const planesAlive = targets.some((t) => t.type === 'plane' && t.alive);
    if (level === 1) {
      if (!shipAlive) victory();
    } else if (!shipAlive && !planesAlive) {
      victory();
    }
  }

  function victory() {
    if (missionState !== 'active') return;
    missionState = 'victory';
    callbacks.onVictory?.({ missionLevel: level, mode, elapsed });
    callbacks.onSfx?.('victory');
    for (const m of enemyMissiles) scene.remove(m.object);
    enemyMissiles = [];
  }

  function forceMissionWin() {
    for (const t of [...targets]) {
      if (t.alive) killTarget(t);
    }
    if (missionState === 'active') victory();
  }

  function updateMissile(m, dt, targetPlayer, isEnemy) {
    m.life += dt;
    if (m.life >= m.maxLife) return false;
    m.speed = Math.min(m.maxSpeed, m.speed + m.accel * dt);
    m.velocity.setLength(m.speed);

    let tp = null;
    if (isEnemy) {
      if (!targetPlayer || targetPlayer.crashed) return false;
      tp = targetPlayer.object.position.clone();
    } else if (m.target && m.target.alive && m.target.pos) {
      tp = m.target.pos;
    }
    if (tp) {
      const desired = tp.clone().sub(m.object.position);
      if (desired.lengthSq() > 0.001) {
        desired.normalize().multiplyScalar(m.speed);
        m.velocity.lerp(desired, clamp(m.turnRate * dt, 0, 1)).setLength(m.speed);
      }
    }

    const step = m.velocity.clone().multiplyScalar(dt);
    m.object.position.add(step);
    if (m.velocity.lengthSq() > 0.01) {
      m.object.quaternion.setFromUnitVectors(LOCAL_FORWARD, m.velocity.clone().normalize());
    }

    m.trail += dt;
    if (m.trail > 0.035) {
      m.trail = 0;
      effects.spawnTrail(m.object.position.clone(), 'missile');
    }

    // 命中判定
    if (isEnemy) {
      if (targetPlayer && !targetPlayer.crashed) {
        const d = m.object.position.distanceTo(targetPlayer.object.position);
        if (d < 5.5) {
          effects.explode(m.object.position.clone(), { scale: 1.2 });
          callbacks.onPlayerHit?.({ reason: 'missile' });
          return false;
        }
      }
    } else {
      for (const t of targets) {
        if (!t.alive || !t.pos) continue;
        const d = m.object.position.distanceTo(t.pos);
        if (d < t.radius + 3) {
          damageTarget(t, 1);
          return false;
        }
      }
    }

    const surf = world.surfaceAtPosition(m.object.position);
    if (m.life > 0.2 && m.object.position.length() <= surf.h + 1.2) {
      effects.explode(m.object.position.clone(), { scale: 0.7 });
      return false;
    }
    return true;
  }

  function updateEnemyPlane(t, dt, player) {
    if (!t.alive) return;
    const obj = t.object;
    const p = player.object.position;
    const a = elapsed * 0.24 + t.phase;
    const desired = world.offsetAt(p, Math.cos(a) * 330, 70 + Math.sin(a * 1.7) * 25, Math.sin(a) * 330);
    const dir = desired.clone().sub(obj.position);
    if (dir.lengthSq() < 1) return;
    dir.normalize();
    const desiredQ = world.orientToward(obj.position, dir);
    obj.quaternion.slerp(desiredQ, Math.min(1, dt * 1.1));
    obj.position.addScaledVector(LOCAL_FORWARD.clone().applyQuaternion(obj.quaternion), t.speed * dt);
    const surf = world.surfaceAtPosition(obj.position);
    const up = obj.position.clone().normalize();
    const minR = surf.h + 18;
    if (obj.position.length() < minR) {
      obj.position.copy(up).multiplyScalar(minR);
      obj.quaternion.slerp(world.orientAt(obj.position, 0), Math.min(1, dt * 0.8));
    }
    t.pos = obj.position.clone().addScaledVector(up, 1);

    if (t.fireEnabled && player && !player.crashed && !player.onGround) {
      t.fireCooldown -= dt;
      const dist = obj.position.distanceTo(p);
      if (t.fireCooldown <= 0 && dist < 700) {
        t.fireCooldown = 6.5 + Math.random() * 2;
        fireEnemyMissile(t, player);
      }
    }
  }

  function updateDrone(t, dt) {
    if (!t.alive) return;
    const obj = t.object;
    const a = elapsed * 0.5 + t.phase;
    obj.position.copy(world.offsetAt(t.home, Math.cos(a) * 40, Math.sin(a * 2) * 4, Math.sin(a) * 40));
    obj.quaternion.copy(world.orientAt(obj.position, -a + Math.PI / 2));
    t.pos = obj.position.clone();
  }

  function update(dt, player) {
    elapsed += dt;
    for (const t of targets) {
      if (!t.alive) continue;
      if (t.type === 'plane') updateEnemyPlane(t, dt, player);
      else if (t.type === 'drone') updateDrone(t, dt);
      if (t.type === 'ship' && t.object && t.object.userData.sinking) {
        shipSink += dt;
        if (shipSink > 1.2) {
          const up = t.object.position.clone().normalize();
          t.object.position.addScaledVector(up, -dt * 2.2);
          t.object.rotateZ(dt * 0.045);
        }
        if (shipSink > 7 && t.object.parent) scene.remove(t.object);
      }
    }

    // 玩家导弹
    for (let i = missiles.length - 1; i >= 0; i--) {
      const m = missiles[i];
      const alive = updateMissile(m, dt, player, false);
      if (!alive) {
        scene.remove(m.object);
        missiles.splice(i, 1);
      }
    }
    // 敌方导弹
    for (let i = enemyMissiles.length - 1; i >= 0; i--) {
      const m = enemyMissiles[i];
      const alive = updateMissile(m, dt, player, true);
      if (!alive) {
        scene.remove(m.object);
        enemyMissiles.splice(i, 1);
      }
    }
    if (player) player.missileCooldown = Math.max(0, (player.missileCooldown || 0) - dt);
  }

  function getObjectives(player) {
    const p = player.object.position;
    return targets.filter((t) =>
      t.alive && t.pos && ['ship', 'plane', 'drone'].includes(t.type)
    ).map((t) => {
      return {
        label: t.label,
        type: t.type,
        distance: t.pos.distanceTo(p),
        worldX: t.pos.x,
        worldZ: t.pos.z
      };
    });
  }

  function onPlayerCrash() {
    for (const m of enemyMissiles) scene.remove(m.object);
    enemyMissiles = [];
  }

  return {
    spawnFor,
    update,
    firePlayerMissile,
    fireGroundRocket,
    getLock,
    damageTarget,
    destroyAllTargets: forceMissionWin,
    forceMissionWin,
    clear: clearTargets,
    onPlayerCrash,
    getObjectives,
    get missionState() { return missionState; },
    get targets() { return targets; },
    get ship() { return ship; },
    get targetCount() { return targets.filter((t) => t.alive).length; },
    get missileCount() { return missiles.length; },
    get enemyMissileCount() { return enemyMissiles.length; }
  };
}
