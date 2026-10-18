// 飞行物理：滑跑、起飞、协调转弯、翻滚、VTOL、燃油与碰撞
import * as THREE from 'three';
import { createAircraftInstance } from './assets.js';
import { clamp, damp, lerp } from './config.js';

const LOCAL_X = new THREE.Vector3(1, 0, 0);
const LOCAL_Y = new THREE.Vector3(0, 1, 0);
const LOCAL_Z = new THREE.Vector3(0, 0, 1);
const WORLD_Y = new THREE.Vector3(0, 1, 0);

function qAxis(axis, angle) {
  return new THREE.Quaternion().setFromAxisAngle(axis, angle);
}

function bankAngle(q) {
  const right = new THREE.Vector3(1, 0, 0).applyQuaternion(q);
  const up = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
  return Math.atan2(right.y, up.y);
}

function wrapAngle(a) {
  return Math.atan2(Math.sin(a), Math.cos(a));
}

function forwardOf(q) {
  return new THREE.Vector3(0, 0, -1).applyQuaternion(q);
}

function yawOf(q) {
  const f = forwardOf(q);
  return Math.atan2(-f.x, -f.z);
}

export function createPlayer(spec, world, scene) {
  const object = createAircraftInstance(spec);
  const halfHeight = object.userData.halfHeight || spec.halfHeight;
  const surface = world.surfaceAt(world.spawn.x, world.spawn.z);
  const player = {
    spec,
    object,
    halfHeight,
    quaternion: object.quaternion,
    fuel: spec.fuelMax,
    speed: 0,
    throttle: 0,
    pitchInput: 0,
    rollInput: 0,
    yawInput: 0,
    verticalSpeed: 0,
    engineOn: true,
    onGround: true,
    airborne: false,
    crashed: false,
    crashTime: 0,
    crashReason: '',
    vtol: false,
    vtolBlend: 0,
    nozzleAngle: 0,
    autoTakeoff: null,
    missiles: spec.missiles,
    missileCooldown: 0,
    altitude: 0,
    bank: 0,
    heading: 0,
    gForce: 1,
    distanceTravelled: 0,
    lastPos: new THREE.Vector3(),
    started: false
  };

  object.position.set(world.spawn.x, surface.h + halfHeight + 0.14, world.spawn.z);
  object.rotation.set(0, 0, 0);
  object.name = 'player';
  scene.add(object);
  player.lastPos.copy(object.position);
  return player;
}

export function placePlayerAtSpawn(player, world) {
  const surface = world.surfaceAt(world.spawn.x, world.spawn.z);
  player.object.position.set(world.spawn.x, surface.h + player.halfHeight + 0.14, world.spawn.z);
  player.object.quaternion.identity();
  player.speed = 0;
  player.throttle = 0;
  player.verticalSpeed = 0;
  player.engineOn = true;
  player.onGround = true;
  player.airborne = false;
  player.crashed = false;
  player.vtol = false;
  player.vtolBlend = 0;
  player.nozzleAngle = 0;
  player.autoTakeoff = null;
  player.fuel = player.spec.fuelMax;
  player.missiles = player.spec.missiles;
  player.missileCooldown = 0;
  player.lastPos.copy(player.object.position);
}

export function toggleVTOL(player) {
  if (!player.spec.vtol || player.crashed) return false;
  player.vtol = !player.vtol;
  if (player.vtol && player.speed > 70) player.speed = Math.max(45, player.speed * 0.72);
  if (!player.vtol && player.altitude > 2) {
    player.speed = Math.max(player.speed, 28);
    player.onGround = false;
    player.airborne = true;
  }
  return player.vtol;
}

export function startAutoTakeoff(player) {
  if (player.crashed || !player.onGround || player.autoTakeoff) return false;
  if (!player.spec.autoTakeoff) return false;
  if (player.throttle < 0.95) return false;
  if (player.spec.vtol && player.vtol) {
    // F-35B 垂直起飞：松开刹车，直接靠升力风扇
    player.autoTakeoff = { t: 0, duration: 0.9, vtol: true, ...player.spec.autoTakeoff };
    return true;
  }
  player.autoTakeoff = { t: 0, ...player.spec.autoTakeoff };
  return true;
}

function fail(player, reason, callbacks) {
  if (player.crashed) return;
  player.crashed = true;
  player.crashTime = 0;
  player.crashReason = reason;
  player.engineOn = false;
  callbacks.onCrash?.(reason);
}

function updateVisuals(player, dt, input) {
  const ud = player.object.userData;
  if (ud.propeller) {
    ud.propeller.rotation.z += dt * (player.engineOn ? 8 + player.throttle * 34 : 0);
  }
  if (ud.elevators) {
    const p = clamp(player.pitchInput, -1, 1);
    for (const e of ud.elevators) e.rotation.x = damp(e.rotation.x, -p * 0.3, 10, dt);
  }
  if (ud.afterburner) {
    const on = player.engineOn && player.throttle > 0.65 && !player.vtol;
    ud.afterburner.material.opacity = damp(ud.afterburner.material.opacity, on ? 0.85 : 0, 8, dt);
    ud.afterburner.scale.setScalar(1 + Math.sin(performance.now() * 0.03) * 0.08 + player.throttle * 0.25);
  }
  if (ud.nozzlePivot) ud.nozzlePivot.rotation.x = player.nozzleAngle;
  const vt = player.vtolBlend;
  if (ud.liftFanBlades) ud.liftFanBlades.rotation.y += dt * vt * 24;
  if (ud.wingFans) for (const w of ud.wingFans) w.rotation.y += dt * vt * 26;
  if (ud.vtolGlow) ud.vtolGlow.material.opacity = vt * 0.7;
  if (ud.missileGroup) ud.missileGroup.visible = player.missiles > 0;
}

export function updatePlayer(player, input, world, dt, callbacks = {}) {
  if (player.crashed) {
    player.crashTime += dt;
    return;
  }
  const spec = player.spec;
  const obj = player.object;
  const pos = obj.position;
  const q = obj.quaternion;

  player.throttle = clamp(input.throttle ?? player.throttle, 0, 1);
  player.pitchInput = clamp(input.pitch ?? 0, -1, 1);
  player.rollInput = clamp(input.roll ?? 0, -1, 1);
  player.yawInput = clamp(input.yaw ?? 0, -1, 1);

  // 燃油
  if (player.engineOn) {
    player.fuel -= spec.fuelBurn * (0.32 + 0.68 * player.throttle + (player.vtol ? 0.3 : 0)) * dt;
    if (player.fuel <= 0) {
      player.fuel = 0;
      player.engineOn = false;
      callbacks.onFuelOut?.();
    }
  }

  // VTOL 过渡与喷管
  const vtolTarget = player.vtol ? 1 : 0;
  player.vtolBlend = damp(player.vtolBlend, vtolTarget, 3.2, dt);
  let nozzleTarget = player.vtol ? Math.PI / 2 : 0;
  if (player.autoTakeoff?.short && player.autoTakeoff.t < 0.85) nozzleTarget = Math.PI / 4;
  player.nozzleAngle = damp(player.nozzleAngle, nozzleTarget, 2.6, dt);

  const surface = world.surfaceAt(pos.x, pos.z);
  const groundY = surface.h + player.halfHeight + 0.12;
  const wasOnGround = player.onGround;
  let turn = 0;

  // 自动起飞序列
  if (player.autoTakeoff) {
    player.autoTakeoff.t += dt;
    player.throttle = 1;
    player.started = true;
    if (player.autoTakeoff.vtol) {
      // 垂直起飞：升力风扇提供升力
      if (player.autoTakeoff.t > 0.45) {
        player.onGround = false;
        player.airborne = true;
        pos.y += 11 * dt;
      }
    } else {
      // 短距/滑跑起飞：按配置的跑道长度在持续时间内前进
      const avg = player.autoTakeoff.runway / Math.max(0.4, player.autoTakeoff.duration);
      player.speed = Math.max(player.speed, avg);
      pos.addScaledVector(forwardOf(q), avg * dt);
    }
    if (player.autoTakeoff.t >= player.autoTakeoff.duration) {
      player.onGround = false;
      player.airborne = true;
      const short = player.autoTakeoff.short;
      player.autoTakeoff = null;
      if (!short && spec.category === 'fighter' && !player.vtol) {
        player.speed = Math.max(player.speed, spec.takeoffSpeed * 1.2);
      }
      q.multiply(qAxis(LOCAL_X, 0.11));
      pos.y = Math.max(pos.y, groundY + 0.9);
      callbacks.onTakeoff?.();
    }
  }

  if (player.vtolBlend > 0.55 && !player.autoTakeoff) {
    // ---------- VTOL 悬停 ----------
    const yaw = yawOf(q);
    const targetQ = new THREE.Quaternion().setFromAxisAngle(WORLD_Y, yaw);
    q.slerp(targetQ, Math.min(1, dt * 4.5));
    player.speed = damp(player.speed, 0, 2.4, dt);

    const yawInput = player.yawInput * 1.35;
    q.premultiply(qAxis(WORLD_Y, yawInput * dt));

    const yawNow = yawOf(q);
    const right = new THREE.Vector3(Math.cos(yawNow), 0, Math.sin(yawNow));
    const vertical = player.pitchInput * 13.5;
    const lateral = player.rollInput * 11;
    player.verticalSpeed = damp(player.verticalSpeed, vertical, 5, dt);
    pos.y += player.verticalSpeed * dt;
    pos.addScaledVector(right, -lateral * dt);

    if (pos.y > groundY + 0.35) {
      player.onGround = false;
      player.airborne = true;
    }
    if (pos.y <= groundY) {
      pos.y = groundY;
      player.verticalSpeed = Math.max(0, player.verticalSpeed);
      player.onGround = true;
      player.airborne = false;
    }
  } else if (player.onGround && !player.autoTakeoff) {
    // ---------- 地面滑跑 ----------
    const speedTarget = player.engineOn ? player.throttle * Math.min(spec.maxSpeed, spec.takeoffSpeed * 1.45) : 0;
    const rate = player.throttle > 0.02 ? (spec.category === 'fighter' ? 1.9 : 0.8) : 2.4;
    player.speed = damp(player.speed, speedTarget, rate, dt);
    player.verticalSpeed = 0;

    // 地面转向
    const steer = (player.rollInput * 0.55 + player.yawInput * 0.4) * clamp(player.speed / 18, 0, 1);
    q.premultiply(qAxis(WORLD_Y, steer * dt));
    q.slerp(new THREE.Quaternion().setFromAxisAngle(WORLD_Y, yawOf(q)), Math.min(1, dt * 5));

    pos.y = damp(pos.y, groundY, 18, dt);

    if (player.speed >= spec.takeoffSpeed && player.pitchInput > 0.28) {
      player.onGround = false;
      player.airborne = true;
      q.multiply(qAxis(LOCAL_X, 0.14));
      pos.y = groundY + 0.65;
      callbacks.onTakeoff?.();
    }
  } else if (!player.autoTakeoff) {
    // ---------- 空中飞行 ----------
    const authority = clamp(player.speed / (spec.stall * 1.55), 0.12, 1);
    if (!player.autoTakeoff) {
      const pitch = player.pitchInput * spec.pitchRate * authority;
      q.multiply(qAxis(LOCAL_X, pitch * dt));
    }

    // 横滚：客机限制倾斜角，其他机型可连续翻滚
    if (spec.bankLimit != null) {
      let bank = bankAngle(q);
      let target = clamp(bank + player.rollInput * 0.85, -spec.bankLimit, spec.bankLimit);
      if (Math.abs(player.rollInput) < 0.04) target = 0;
      const diff = wrapAngle(target - bank);
      q.multiply(qAxis(LOCAL_Z, clamp(diff, -2.2, 2.2) * Math.min(1, dt * 4.6)));
    } else {
      q.multiply(qAxis(LOCAL_Z, player.rollInput * spec.rollRate * dt));
      if (Math.abs(player.rollInput) < 0.03 && spec.autoLevel > 0) {
        const bank = wrapAngle(bankAngle(q));
        q.multiply(qAxis(LOCAL_Z, -bank * Math.min(0.95, spec.autoLevel * dt)));
      }
    }
    if (Math.abs(player.yawInput) > 0.02) {
      q.multiply(qAxis(LOCAL_Y, player.yawInput * 0.42 * dt));
    }

    // 协调转弯
    const bank = bankAngle(q);
    turn = (9.8 / Math.max(player.speed, 24)) * Math.tan(clamp(bank, -1.32, 1.32));
    turn = clamp(turn, -spec.maxTurn, spec.maxTurn);
    q.premultiply(qAxis(WORLD_Y, turn * dt));

    // 速度
    const target = player.engineOn ? player.throttle * spec.maxSpeed : 0;
    const rate = target > player.speed ? (spec.category === 'fighter' ? 1.7 : spec.category === 'airliner' ? 0.45 : 0.8) : 1.0;
    player.speed = damp(player.speed, target, rate, dt);

    const forward = forwardOf(q);
    const stallSink = Math.max(0, spec.stall - player.speed) * 0.6;
    const engineSink = player.engineOn ? 0 : 5;
    player.verticalSpeed = forward.y * player.speed - stallSink - engineSink;
    pos.addScaledVector(forward, player.speed * dt);
    pos.y -= (stallSink + engineSink) * dt;
    pos.y -= Math.abs(turn) * player.speed * 0.055 * dt;

    // 缓慢回正（螺旋桨/客机）
    if (spec.autoLevel > 0 && Math.abs(player.rollInput) < 0.03 && player.speed > spec.stall) {
      const b = wrapAngle(bankAngle(q));
      q.multiply(qAxis(LOCAL_Z, -b * Math.min(0.9, spec.autoLevel * 0.35 * dt)));
    }

    // 重力：油尽或失速时更明显
    if (!player.engineOn) {
      const down = 6 + Math.max(0, spec.stall - player.speed) * 0.9;
      pos.y -= down * dt;
      player.verticalSpeed = Math.min(player.verticalSpeed, -down);
    }

    // 地面/水面碰撞
    const groundNow = world.surfaceAt(pos.x, pos.z);
    const gy = groundNow.h + player.halfHeight + 0.12;
    if (pos.y <= gy + 0.05) {
      const hard = player.speed > 46 || Math.abs(bankAngle(q)) > 0.6 || player.verticalSpeed < -14;
      if (groundNow.type === 'water') {
        pos.y = gy;
        fail(player, 'water', callbacks);
      } else if (hard) {
        pos.y = gy;
        fail(player, 'crash', callbacks);
      } else {
        pos.y = gy;
        player.onGround = true;
        player.airborne = false;
        player.verticalSpeed = 0;
        player.speed = Math.min(player.speed, 42);
        q.slerp(new THREE.Quaternion().setFromAxisAngle(WORLD_Y, yawOf(q)), Math.min(1, dt * 8));
        callbacks.onLand?.();
      }
    }

    // 边界
    if (Math.abs(pos.x) > 2400 || Math.abs(pos.z) > 2400) {
      pos.x = clamp(pos.x, -2400, 2400);
      pos.z = clamp(pos.z, -2400, 2400);
    }
  }

  if (player.vtolBlend <= 0.55 && !player.onGround) player.airborne = true;
  if (wasOnGround && !player.onGround) player.started = true;

  const groundNow = world.surfaceAt(pos.x, pos.z);
  player.altitude = pos.y - (groundNow.h + player.halfHeight);
  player.bank = bankAngle(q);
  player.heading = ((Math.atan2(forwardOf(q).x, -forwardOf(q).z) * 180 / Math.PI) + 360) % 360;
  player.gForce = 1 + Math.abs(turn ?? 0) * Math.max(player.speed, 20) / 9.8 * 0.25;
  player.distanceTravelled += pos.distanceTo(player.lastPos);
  player.lastPos.copy(pos);

  updateVisuals(player, dt, input);
}

export function playerHUD(player) {
  const fuelPct = Math.max(0, Math.min(100, player.fuel));
  const burn = player.spec.fuelBurn * (0.32 + 0.68 * player.throttle);
  const minutes = burn > 0.0001 ? fuelPct / (burn * 60) : 0;
  return {
    altitude: Math.max(0, player.altitude),
    speed: player.speed,
    throttle: player.throttle,
    fuel: fuelPct,
    minutes,
    bank: (player.bank * 180) / Math.PI,
    heading: player.heading,
    verticalSpeed: player.verticalSpeed,
    vtol: player.vtol,
    vtolBlend: player.vtolBlend,
    onGround: player.onGround,
    crashed: player.crashed,
    missiles: player.missiles,
    autoTakeoff: !!player.autoTakeoff,
    engineOn: player.engineOn
  };
}
