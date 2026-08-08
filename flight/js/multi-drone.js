// 夜间地图多机同时起飞测试场景：5架无人机编队起飞 + 底部5个图传窗口
// 起飞模式：'single' 单机起飞（普通流程）| 'multi' 5机同时起飞（本模块）
import * as THREE from 'three';
import { scene } from './engine.js';
import { state, DRONES } from './config.js';
import { mapState } from './maps/map-base.js';
import * as MapBase from './maps/map-base.js';

let active = false;
let drones = [];     // { mesh, props, label, idx, offset, groundY }
let feedBar = null;
let t = 0;           // 场景累计时间
let lastDraw = 0;

// 5机机型组合：Mavic 4 Pro / Air 3S / Mini 5 Pro / Mini 4 Pro / Mavic 3 Pro
const FORMATION = [3, 1, 7, 4, 2];

// 低模代替（不上详细 build 函数，避免污染全局 propellers/lidarCells/auxLightMesh）
function buildStandInDrone(idx) {
  const g = new THREE.Group();
  const color = DRONES[idx].color;

  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 0.12, 0.34),
    new THREE.MeshLambertMaterial({ color })
  );
  g.add(body);

  const cam = new THREE.Mesh(
    new THREE.SphereGeometry(0.05, 6, 4),
    new THREE.MeshBasicMaterial({ color: 0x111111 })
  );
  cam.position.set(0, -0.06, 0.16);
  g.add(cam);

  const armPos = [[-0.42, 0.06, -0.26], [0.42, 0.06, -0.26], [-0.42, 0.06, 0.26], [0.42, 0.06, 0.26]];
  const props = [];
  for (let i = 0; i < 4; i++) {
    const arm = new THREE.Mesh(
      new THREE.CylinderGeometry(0.03, 0.03, 0.08, 6),
      new THREE.MeshLambertMaterial({ color: 0x444444 })
    );
    arm.position.set(armPos[i][0], armPos[i][1], armPos[i][2]);
    g.add(arm);

    const prop = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.012, 0.12),
      new THREE.MeshLambertMaterial({ color: 0x1a1a1a })
    );
    prop.position.set(armPos[i][0], armPos[i][1] + 0.09, armPos[i][2]);
    g.add(prop);
    props.push(prop);

    // 臂灯：前绿后红
    const isFront = armPos[i][2] < 0;
    const led = new THREE.Mesh(
      new THREE.SphereGeometry(0.02, 4, 4),
      new THREE.MeshBasicMaterial({ color: isFront ? 0x00ff44 : 0xff2222 })
    );
    led.position.set(armPos[i][0], armPos[i][1] + 0.07, armPos[i][2] + (isFront ? 0.1 : -0.1));
    g.add(led);
  }

  return { mesh: g, props, label: DRONES[idx].name, idx };
}

export function isNightShowActive() { return active; }

export function startNightShow() {
  if (active) return;
  active = true;
  t = 0;
  lastDraw = 0;
  drones = [];
  const gx = state.dronePos.x, gz = state.dronePos.z;
  const groundY = MapBase.getTerrainHeight(gx, gz);
  for (let i = 0; i < FORMATION.length; i++) {
    const d = buildStandInDrone(FORMATION[i]);
    const ang = (i / FORMATION.length) * Math.PI * 2;
    d.offset = new THREE.Vector3(Math.cos(ang) * 5, 0, Math.sin(ang) * 5);
    d.groundY = groundY;
    d.mesh.position.set(gx + d.offset.x, groundY, gz + d.offset.z);
    d.mesh.rotation.y = state.droneYaw;
    scene.add(d.mesh);
    drones.push(d);
  }
  buildFeedBar();
  import('./ui.js').then(m => m.showNotif('🚁 夜间测试 · 5机同时起飞（点击图传窗口可切主机）', 4));
}

export function stopNightShow() {
  if (!active) return;
  active = false;
  drones.forEach(d => {
    scene.remove(d.mesh);
    d.mesh.traverse(c => {
      if (c.geometry) c.geometry.dispose();
      if (c.material) {
        if (Array.isArray(c.material)) c.material.forEach(m => m.dispose());
        else c.material.dispose();
      }
    });
  });
  drones = [];
  if (feedBar && feedBar.parentNode) feedBar.parentNode.removeChild(feedBar);
  feedBar = null;
}

export function updateNightShow(dt) {
  if (!active) return;
  t += dt;
  // 升空动画：0.5s 延迟后 1.5s 内升到编队高度（smoothstep）
  const ease = Math.min(1, Math.max(0, (t - 0.5) / 1.5));
  const e = ease * ease * (3 - 2 * ease);

  drones.forEach((d, i) => {
    // 桨叶自转
    d.props.forEach((p, j) => { p.rotation.y += dt * 50 * (j % 2 === 0 ? 1 : -1); });

    // 编队跟随玩家（绕玩家环形 + 随玩家 yaw 旋转）
    const base = state.dronePos.clone().add(d.offset.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), state.droneYaw));
    const targetY = state.dronePos.y + 3 + Math.sin(t * 1.5 + i * 1.7) * 0.6;

    d.mesh.position.x += (base.x - d.mesh.position.x) * (0.04 + e * 0.05);
    d.mesh.position.z += (base.z - d.mesh.position.z) * (0.04 + e * 0.05);
    const wantY = d.groundY + (targetY - d.groundY) * e;
    d.mesh.position.y += (wantY - d.mesh.position.y) * 0.05;
    d.mesh.rotation.y = state.droneYaw;
  });

  // 图传窗口 ~10fps
  if (feedBar && t - lastDraw > 0.1) {
    lastDraw = t;
    drawFeeds();
  }
}

function buildFeedBar() {
  feedBar = document.createElement('div');
  feedBar.id = 'multiFeedBar';
  feedBar.style.cssText = 'position:fixed;bottom:8px;left:50%;transform:translateX(-50%);display:flex;gap:6px;z-index:400;max-width:96vw;flex-wrap:wrap;justify-content:center;';
  drones.forEach((d, i) => {
    const card = document.createElement('div');
    card.className = 'feed-card';
    card.style.cssText = 'width:110px;height:72px;border:2px solid rgba(76,175,240,0.55);border-radius:6px;overflow:hidden;cursor:pointer;position:relative;background:#06060c;box-shadow:0 2px 10px rgba(0,0,0,0.7);';
    const canvas = document.createElement('canvas');
    canvas.width = 110; canvas.height = 72;
    canvas.style.cssText = 'width:100%;height:100%;display:block;';
    card.appendChild(canvas);

    const label = document.createElement('div');
    label.textContent = d.label;
    label.style.cssText = 'position:absolute;left:4px;top:2px;color:#4fc3f7;font-size:8px;text-shadow:0 0 3px #000;pointer-events:none;';
    card.appendChild(label);

    const rec = document.createElement('div');
    rec.textContent = '● REC';
    rec.style.cssText = 'position:absolute;right:4px;top:2px;color:#ff5555;font-size:7px;pointer-events:none;';
    card.appendChild(rec);

    card.addEventListener('click', () => window.selectDrone(FORMATION[i]));
    feedBar.appendChild(card);
  });
  document.body.appendChild(feedBar);
}

// 2D 伪图传：夜空 + 建筑亮窗 + 机影 + OSD
function drawFeeds() {
  feedBar.querySelectorAll('canvas').forEach((cv, i) => {
    const ctx = cv.getContext('2d');
    const W = cv.width, H = cv.height;

    // 夜空渐变
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, '#030310'); grad.addColorStop(0.55, '#0a1230'); grad.addColorStop(0.8, '#0e1520');
    ctx.fillStyle = grad; ctx.fillRect(0, 0, W, H);

    // 星点
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    for (let s = 0; s < 10; s++) {
      ctx.fillRect((i * 41 + s * 57) % W, (s * 23) % Math.floor(H * 0.5), 1, 1);
    }

    // 地面
    const groundY = Math.floor(H * 0.72);
    ctx.fillStyle = '#0a1310'; ctx.fillRect(0, groundY, W, H - groundY);
    ctx.fillStyle = 'rgba(90,130,90,0.22)'; ctx.fillRect(0, groundY + 3, W, 2);

    // 建筑亮窗剪影
    for (let b = 0; b < 3; b++) {
      const bx = 6 + b * Math.floor((W - 20) / 3) + ((i * 7 + b * 13) % 8);
      const bw = 10 + (b * 5 + i) % 6;
      const bh = 8 + (b * 9 + i * 3) % 16;
      ctx.fillStyle = '#040408'; ctx.fillRect(bx, groundY - bh, bw, bh);
      for (let wy = 0; wy < Math.floor(bh / 5); wy++) {
        for (let wx = 0; wx < 2; wx++) {
          if (((bx * 3 + wx + wy + b * 7 + i) % 5) < 2) {
            ctx.fillStyle = '#ffdd88';
            ctx.fillRect(bx + 3 + wx * 4, groundY - bh + 2 + wy * 5, 2, 2);
          }
        }
      }
    }

    // 中央准星 + 机影
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.beginPath();
    ctx.moveTo(W / 2, H / 2 - 6); ctx.lineTo(W / 2, H / 2 + 6);
    ctx.moveTo(W / 2 - 6, H / 2); ctx.lineTo(W / 2 + 6, H / 2);
    ctx.stroke();
    ctx.fillStyle = 'rgba(40,40,46,0.9)';
    ctx.fillRect(W / 2 - 2, H / 2 - 1, 4, 2);

    // OSD
    ctx.fillStyle = '#4fc3f7'; ctx.font = '7px monospace';
    ctx.fillText('H ' + (28 + i * 2) + 'm', 4, H - 4);
    ctx.fillText('S ' + (7 + i) + 'm/s', 4, H - 10);
    ctx.fillStyle = '#ffdd88';
    ctx.fillText('GPS' + (12 + i), W - 27, H - 4);
  });
}

// === 起飞模式切换：'single' 单机 | 'multi' 5机同时起飞 ===
window.setTakeoffMode = function(mode) {
  if (mode !== 'single' && mode !== 'multi') return;
  state.takeoffMode = mode;
  updateTakeoffModeUI();
  const onNight = mapState.currentMapType === 'night';
  if (onNight) {
    if (mode === 'multi') startNightShow();
    else stopNightShow();
  }
  import('./ui.js').then(m => {
    m.showNotif(mode === 'single' ? '🚁 起飞模式：单机' : '🚁 起飞模式：5机同时起飞');
  });
};

window.updateTakeoffModeUI = function() {
  const b1 = document.getElementById('takeoffSingle');
  const b2 = document.getElementById('takeoffMulti');
  if (b1) b1.classList.toggle('active', state.takeoffMode === 'single');
  if (b2) b2.classList.toggle('active', state.takeoffMode === 'multi');
};
