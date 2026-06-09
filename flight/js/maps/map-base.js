// Map registry and base system for multi-map support
import { state } from '../config.js';

// Registry of available maps
const maps = new Map();

// Use a mutable container for current map state
export const mapState = {
  currentMap: null,
  currentMapType: 'mountain'
};

// Map switching callback (set by game.js)
let onMapSwitchCallback = null;

export function registerMap(type, mapModule) {
  maps.set(type, mapModule);
}

export function getMap(type) {
  return maps.get(type);
}

export function getAvailableMaps() {
  return Array.from(maps.entries()).map(([type, mod]) => ({
    type,
    ...mod.getMapInfo()
  }));
}

export function setMapSwitchCallback(cb) {
  onMapSwitchCallback = cb;
}

export async function switchMap(type) {
  const newMap = maps.get(type);
  if (!newMap) {
    console.error('Unknown map type:', type);
    return false;
  }
  if (type === mapState.currentMapType) return true;

  // Pause game during switch
  const wasPaused = state.isPaused;
  state.isPaused = true;

  // Cleanup current map
  if (mapState.currentMap && mapState.currentMap.cleanup) {
    mapState.currentMap.cleanup();
  }

  // Switch
  mapState.currentMap = newMap;
  mapState.currentMapType = type;

  // Initialize new map
  if (mapState.currentMap.initMap) {
    await mapState.currentMap.initMap();
  }

  // Save to localStorage for persistence
  localStorage.setItem('flight-sim-map', type);

  // Notify game.js to reset entities and drone position
  if (onMapSwitchCallback) {
    onMapSwitchCallback(type);
  }

  // Resume
  state.isPaused = wasPaused;
  return true;
}

// Delegation helpers - these forward calls to the current map
export function getTerrainHeight(x, z) {
  if (!mapState.currentMap) return 0;
  return mapState.currentMap.getTerrainHeight(x, z);
}

export function updateChunks(dronePos) {
  if (!mapState.currentMap) return;
  return mapState.currentMap.updateChunks(dronePos);
}

export function populateChunk(cx, cz, ox, oz) {
  if (!mapState.currentMap || !mapState.currentMap.populateChunk) return;
  return mapState.currentMap.populateChunk(cx, cz, ox, oz);
}

export function removeChunk(cx, cz) {
  if (!mapState.currentMap || !mapState.currentMap.removeChunk) return;
  return mapState.currentMap.removeChunk(cx, cz);
}

export function getRoadDirectionAt(x, z) {
  if (!mapState.currentMap || !mapState.currentMap.getRoadDirectionAt) return 0;
  return mapState.currentMap.getRoadDirectionAt(x, z);
}

export function isOnRoad(x, z) {
  if (!mapState.currentMap || !mapState.currentMap.isOnRoad) return false;
  return mapState.currentMap.isOnRoad(x, z);
}

export function getNearestRoadPoint(x, z) {
  if (!mapState.currentMap || !mapState.currentMap.getNearestRoadPoint) return null;
  return mapState.currentMap.getNearestRoadPoint(x, z);
}

// Chunk management (for compatibility with existing code)
export const terrainChunks = new Map();
export let terrainGroup = null;
export const chunkObjects = new Map();

// Initialize terrain group (called by game.js after scene is ready)
export function initTerrainGroup(scene) {
  if (!terrainGroup) {
    terrainGroup = new THREE.Group();
    scene.add(terrainGroup);
  }
}