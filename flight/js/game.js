// Main entry point: init + game loop
import * as THREE from 'three';
import { renderer, scene, camera } from './engine.js';
import { state } from './config.js';
import { updateTerrainChunks, terrainGroup } from './terrain.js';
import { spawnBirds, spawnCars, spawnPeople, spawnClouds, updateBirds, updateCars, updatePeople, updateClouds, birds, cars, people, clouds, clearEntities, spawnReporter, removeReporter } from './entities.js';
import { createDroneModel, droneGroup, propellers, propBlurs, updateDroneAnimations, toggleLid, toggleModuleBay, toggleZoom, startDrag4G, updateDrag4G, endDrag4G, isDragging4GModule, lidOpen, moduleBayOpen, zoomLevel } from './drone-model.js';
import { updateDrone, emergencyStop, updateEmergencyStop } from './physics.js';
import { setupJoystick, setupGimbalControl } from './controls.js';
import { updateCamera, updateUI, showNotif } from './ui.js';
import { updateDebris } from './crash-debris.js';
import { isPanoActive, updatePanoCube, resetPano } from './panorama.js';
import { updateRTHPath, isLanding, createHomeMarker, updateHomeMarker, getHomeMarker, removeRTHPath } from './rth-path.js';
import { getTerrainHeight } from './terrain.js';
import * as MapBase from './maps/map-base.js';
import { startPreflight, updatePreflight, getPreflightPhase, preflightPointerDown, preflightPointerMove, preflightPointerUp } from './preflight.js';
import * as MountainMap from './maps/mountain-map.js';
import * as CityMap from './maps/city-map.js';
import * as WindMap from './maps/wind-map.js';
import * as NightMap from './maps/night-map.js';
import { startNightShow, stopNightShow, updateNightShow, isNightShowActive } from './multi-drone.js';
import { speakWindCrash } from './tts.js';

// Export emergency stop to global scope for HTML onclick
window.emergencyStop = emergencyStop;
// Export state for HTML ui access and testing
window.gameState = state;
// Debug/test hook: expose scene & drone group for Playwright assertions
// droneGroup 用 getter 保持实时引用（createDroneModel 后非空）
window.__flightDebug = { scene, camera, get droneGroup() { return droneGroup; }, terrainGroup, cars, people, birds, clouds };

// Dragging state for home marker
let isDraggingHome = false;
let dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
let raycaster = new THREE.Raycaster();

let lastTime = 0;

// === Avata 360 升空检测：起飞瞬间自动进入双镜头全景 ===
let wasLanded = true;
let wasPreflight = false;
function updateAvataWatcher() {
  const isAvata = !!(state.droneSpec && state.droneSpec.panoramic);
  if (isAvata) {
    // 起飞瞬间（isLanded true→false，且不在准备阶段）→ 自动切双镜头全景
    if (wasLanded && !state.isLanded && !state.isPreflight) {
      if (state.avataCamMode === 'single') window.setAvataCamMode('dual');
    }
    // 准备阶段开始/结束 → 刷新相机栏 + 横滚按钮可见性
    if (wasPreflight !== state.isPreflight) {
      window.updateAvataCamUI();
      window.updateRollBtn && window.updateRollBtn();
    }
  }
  wasLanded = state.isLanded;
  wasPreflight = state.isPreflight;
}

// Register maps
MapBase.registerMap('mountain', MountainMap);
MapBase.registerMap('city', CityMap);
MapBase.registerMap('wind', WindMap);
MapBase.registerMap('night', NightMap);

// 大风风坠检测：windCrash 置位后触发记者播报 + 更新风级 HUD
function updateWindWatcher() {
  const hud = document.getElementById('windHud');
  if (hud) {
    if (state.windActive) {
      hud.style.display = '';
      hud.textContent = '💨 ' + state.windLevel + '级';
    } else {
      hud.style.display = 'none';
    }
  }
  if (state.windCrash && state.windActive) {
    state.windCrash = false;
    speakWindCrash();
  }
}

// Set map switch callback
MapBase.setMapSwitchCallback(async (newMapType) => {
  // Clear all entities
  clearEntities();
  // 大风地图：清完后生成带麦克风的记者（必须在 clearEntities 之后）
  if (newMapType === 'wind') spawnReporter();
  else removeReporter();
  // 地图切换重置 Avata 全景状态（回单镜头）
  resetPano();
  state.avataCamMode = 'single';
  window.updateAvataCamUI && window.updateAvataCamUI();
  // 大风状态复位
  state.windSwept = false; state.windCrash = false; state.gimbalRoll = 0;
  window.updateRollBtn && window.updateRollBtn();

  // Reset drone position
  state.dronePos.set(0, 30, 0);
  state.droneVel.set(0, 0, 0);
  state.droneYaw = 0;
  state.dronePitch = 0;
  state.droneRoll = 0;
  state.homePos.set(0, 30, 0);
  state.battery = 100;
  state.totalDist = 0;
  state.isRTH = false;
  state.isCruise = false;
  state.isCrashed = false;
  state.isLanded = false;

  // Update home marker
  updateHomeMarker();

  // Generate terrain chunks for new map
  updateTerrainChunks();

  // Re-spawn entities
  spawnBirds();
  spawnCars();
  spawnPeople();
  spawnClouds();

  // 夜间地图多机测试：按起飞模式启动/停止 5 机同时起飞场景
  if (newMapType === 'night') {
    if (state.takeoffMode === 'multi') startNightShow();
    else stopNightShow();
  } else {
    stopNightShow();
  }
  window.updateTakeoffModeUI && window.updateTakeoffModeUI();

  // Show notification
  const mapInfo = MapBase.mapState.currentMap.getMapInfo();
  showNotif(`✅ 已切换到 ${mapInfo.name} 地图`, 3);
});

// Global map switch function for UI
window.selectMap = async function(mapType) {
  if (mapType === MapBase.mapState.currentMapType) return;

  // Show confirmation
  const confirmed = confirm('切换地图将重置飞行位置，是否继续？');
  if (!confirmed) return;

  // Close settings modal
  closeSettings();

  // Switch map
  await MapBase.switchMap(mapType);

  // Update UI buttons
  document.querySelectorAll('.map-card').forEach(card => {
    card.classList.toggle('active', card.dataset.map === mapType);
  });
};

function gameLoop(time) {
  requestAnimationFrame(gameLoop);
  const dt = Math.min((time - lastTime) / 1000, 0.05);
  lastTime = time;

  if (state.gameStarted && !state.isPaused) {
    // Avata 360 升空检测：起飞瞬间自动进入双镜头全景
    updateAvataWatcher();

    // Preflight sequence (选点/部署/开机流程) replaces drone physics
    if (state.isPreflight) {
      updatePreflight(dt);
    } else if (state.isEmergencyStop) {
      // Handle emergency stop tumbling crash
      updateEmergencyStop(dt);
    } else {
      updateDrone(dt);
    }
    updateBirds(dt);
    updateCars(dt);
    updatePeople(dt);
    updateClouds(dt);
    updateTerrainChunks();
    updateDebris(dt);
    updateWindWatcher();

    // 夜间地图多机测试：更新编队飞行与图传窗口
    if (isNightShowActive()) updateNightShow(dt);

    // Update drone interactive animations (lid, IR blink, aux light, zoom, aperture)
    updateDroneAnimations(time / 1000);

    // Update RTH path visualization
    if (state.isRTH) {
      updateRTHPath();

      // Show landing notification when close to home
      if (isLanding()) {
        showNotif('📍 自动降落中...', 2);
      }
    }

    if (droneGroup) {
      droneGroup.visible = !state.fpvMode && !isPanoActive() && !state.isPreflight;
      droneGroup.position.copy(state.dronePos);
      droneGroup.rotation.set(state.dronePitch, state.droneYaw, state.droneRoll);
      // Propeller visual: show blur disk at high speed, blades at low speed
      const blurAmount = Math.min(state.propSpeed / 40, 1); // 0-1 based on speed
      propellers.forEach((p, i) => {
        p.rotation.y += state.propSpeed * dt * (i % 2 === 0 ? 1 : -1);
        p.visible = blurAmount < 0.7; // Hide blades when spinning fast
      });
      // propBlurs: Avata 360 = 8 items (disk+ring pairs), others = 4 disks only
      for (let i = 0; i < 4; i++) {
        const isPaired = propBlurs.length === 8;
        const diskIdx = isPaired ? i * 2 : i;
        const disk = propBlurs[diskIdx];
        if (disk) {
          disk.material.opacity = blurAmount * 0.5;
          disk.visible = !state.fpvMode;
        }
        if (isPaired) {
          const ring = propBlurs[i * 2 + 1];
          if (ring) {
            ring.visible = blurAmount >= 0.7 && !state.fpvMode;
          }
        }
      }
    }
  }
  // Always update camera, but only lerp after game started
  updateCamera(state.gameStarted);
  updateUI();
  // Avata 全景模式：先刷新立方体贴图（节流），再渲染
  if (isPanoActive()) updatePanoCube();
  renderer.render(scene, camera);
}

async function init() {
  document.getElementById('loadingText').style.display = 'none';
  document.getElementById('startScreen').style.display = 'none';

  // Initialize map from localStorage (persisted selection)
  const savedMap = localStorage.getItem('flight-sim-map') || 'mountain';
  const validMaps = ['mountain', 'city', 'wind', 'night'];
  const mapToUse = validMaps.includes(savedMap) ? savedMap : 'mountain';

  MapBase.mapState.currentMap = MapBase.getMap(mapToUse);
  MapBase.mapState.currentMapType = mapToUse;
  await MapBase.mapState.currentMap.initMap();
  if (mapToUse === 'wind') spawnReporter();
  if (mapToUse === 'night' && state.takeoffMode === 'multi') startNightShow();
  window.updateTakeoffModeUI && window.updateTakeoffModeUI();

  // Update map card UI to show correct selection
  document.querySelectorAll('.map-card').forEach(card => {
    card.classList.toggle('active', card.dataset.map === mapToUse);
  });

  // Auto-start game immediately
  ['topBar', 'leftPanel', 'rightPanel', 'bottomPanel', 'joystickLeft', 'joystickRight'].forEach(id => {
    document.getElementById(id).style.display = '';
  });
  state.gameStarted = true;
  createDroneModel(state.currentDroneIdx);
  spawnBirds(); spawnCars(); spawnPeople(); spawnClouds();
  updateTerrainChunks();

  // Force camera to correct position immediately to center the drone
  // CRITICAL: Must update after renderer has correct size and after map terrain is ready
  function forceCameraUpdate() {
    const w = window.innerWidth || 800;
    const h = window.innerHeight || 600;
    if (w > 0 && h > 0 && camera && camera.updateProjectionMatrix) {
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    }
    // Force immediate camera position (no lerp)
    updateCamera(false);
  }

  // Multiple updates at different timing to ensure camera is always correct
  forceCameraUpdate();                              // Immediate
  requestAnimationFrame(forceCameraUpdate);         // Next frame before render
  setTimeout(forceCameraUpdate, 50);                // After short delay
  setTimeout(forceCameraUpdate, 150);               // After terrain settles
  setTimeout(forceCameraUpdate, 500);               // Final check
  setTimeout(forceCameraUpdate, 1000);              // Extra long delay for slow devices

  // Listen for renderer-ready event from engine.js to re-center camera
  window.addEventListener('renderer-ready', forceCameraUpdate);

  // Also listen for window resize to re-center camera
  window.addEventListener('game-resize', () => {
    updateCamera(false);
  });

  setupJoystick('baseL', 'thumbL', state.leftStick);
  setupJoystick('baseR', 'thumbR', state.rightStick);
  setupGimbalControl();

  // Create home marker (H) for return point
  createHomeMarker();

  // Setup home marker dragging
  setupHomeMarkerDrag();

  // 进入起飞准备流程（选起飞点 → 背包人部署 → 开机 → 起飞）
  startPreflight();

  // Force landscape orientation hint on mobile
  if (/Mobi|Android/i.test(navigator.userAgent)) {
    const orientHint = document.createElement('div');
    orientHint.id = 'orientHint';
    orientHint.style.cssText = 'position:fixed;inset:0;background:#0a0a0f;z-index:500;display:none;align-items:center;justify-content:center;font-size:18px;color:#ff9500;text-align:center;flex-direction:column;gap:20px;';
    orientHint.innerHTML = '<div style="font-size:48px;">📱↔️</div><div>请横屏使用以获得最佳体验</div>';
    document.body.appendChild(orientHint);
    const checkOrient = () => {
      if (innerWidth < innerHeight && state.gameStarted) {
        orientHint.style.display = 'flex';
      } else {
        orientHint.style.display = 'none';
      }
    };
    window.addEventListener('resize', checkOrient);
    window.addEventListener('orientationchange', checkOrient);
  }



  lastTime = performance.now();
  requestAnimationFrame(gameLoop);
}

init();

// Setup home marker dragging functionality
function setupHomeMarkerDrag() {
  const canvas = renderer.domElement;

  // Mouse/touch events for dragging
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
}

function onPointerDown(event) {
  if (!state.gameStarted) return;

  // 起飞准备阶段：拖动移动起飞点
  if (state.isPreflight) { preflightPointerDown(event); return; }

  const rect = renderer.domElement.getBoundingClientRect();
  const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  const y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

  raycaster.setFromCamera(new THREE.Vector2(x, y), camera);

  // Check drone interactive parts first (lid, 4G module, module bay)
  if (droneGroup && !state.fpvMode) {
    const droneIntersects = raycaster.intersectObjects(droneGroup.children, true);
    if (droneIntersects.length > 0) {
      const hit = droneIntersects[0].object;

      // Check for lid click (Air 3)
      if (hit.userData.isLid || (hit.name === 'lid')) {
        toggleLid();
        showNotif(lidOpen ? '📂 盖子已打开' : '📁 盖子已关闭');
        return;
      }

      // Check for module bay click (Mavic 3 Pro)
      if (hit.userData.isModuleBay || (hit.name === 'bayLid')) {
        toggleModuleBay();
        showNotif(moduleBayOpen ? '📂 模块仓已打开' : '📁 模块仓已关闭');
        return;
      }

      // Check for 4G module drag start
      if (hit.userData.is4G || (hit.name === 'fourGBody') || (hit.name === 'fourGModule')) {
        const point = droneIntersects[0].point;
        if (startDrag4G(point)) {
          event.preventDefault();
          showNotif('📦 拖动4G模块到盖子内');
          return;
        }
      }
    }
  }

  // Check home marker drag
  const homeMarker = getHomeMarker();
  if (homeMarker) {
    const intersects = raycaster.intersectObject(homeMarker, true);
    if (intersects.length > 0) {
      isDraggingHome = true;
      event.preventDefault();
      showNotif('拖动 H 标记设置返航点');
    }
  }
}

function onPointerMove(event) {
  if (state.isPreflight) { preflightPointerMove(event); return; }

  // Handle 4G module dragging
  if (isDragging4GModule()) {
    const rect = renderer.domElement.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    const y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(new THREE.Vector2(x, y), camera);
    // Intersect with plane at drone height
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -state.dronePos.y);
    const point = new THREE.Vector3();
    raycaster.ray.intersectPlane(plane, point);
    if (point && Number.isFinite(point.x)) {
      updateDrag4G(point);
    }
    return;
  }

  if (!isDraggingHome) return;

  const rect = renderer.domElement.getBoundingClientRect();
  const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  const y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

  raycaster.setFromCamera(new THREE.Vector2(x, y), camera);

  // Intersect with horizontal plane at ground level
  const intersectPoint = new THREE.Vector3();
  const groundY = getTerrainHeight(state.homePos.x, state.homePos.z);
  dragPlane.setFromNormalAndCoplanarPoint(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, groundY, 0));
  raycaster.ray.intersectPlane(dragPlane, intersectPoint);

  if (intersectPoint && Number.isFinite(intersectPoint.x) && Number.isFinite(intersectPoint.z)) {
    state.homePos.x = intersectPoint.x;
    state.homePos.z = intersectPoint.z;
    updateHomeMarker();
  }
}

function onPointerUp(event) {
  if (state.isPreflight) { preflightPointerUp(event); return; }

  // End 4G module drag
  if (isDragging4GModule()) {
    endDrag4G();
    return;
  }

  if (isDraggingHome) {
    isDraggingHome = false;
    showNotif('✅ 返航点已更新');
    // Ensure marker is still visible
    updateHomeMarker();
  }
}