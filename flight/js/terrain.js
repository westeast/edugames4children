// Terrain system: delegates all calls to the current active map
import * as THREE from 'three';
import { scene } from './engine.js';
import { state } from './config.js';
import * as MapBase from './maps/map-base.js';

// Create our own terrain group for collision detection
// This is used by physics.js for obstacle detection
const terrainGroup = new THREE.Group();
scene.add(terrainGroup);

// Export terrain group for physics.js
export { terrainGroup };

// We also need to track chunk objects
export const terrainChunks = new Map();
export const chunkObjects = new Map();

// Helper to get the global terrain group (used by map modules)
export function getTerrainGroup() {
  return terrainGroup;
}

// Delegate terrain height to current map
export function getTerrainHeight(x, z) {
  return MapBase.getTerrainHeight(x, z);
}

// Delegate chunk operations to current map
export function createTerrainChunk(cx, cz) {
  if (MapBase.mapState.currentMap && MapBase.mapState.currentMap.createTerrainChunk) {
    MapBase.mapState.currentMap.createTerrainChunk(cx, cz);
  }
}

export function removeTerrainChunk(cx, cz) {
  if (MapBase.mapState.currentMap && MapBase.mapState.currentMap.removeChunk) {
    MapBase.mapState.currentMap.removeChunk(cx, cz);
  }
}

export function updateTerrainChunks() {
  MapBase.updateChunks(state.dronePos);
}

// Re-export road functions for entities.js
export function getRoadDirectionAt(x, z) {
  return MapBase.getRoadDirectionAt(x, z);
}

export { ROAD_WIDTH } from './maps/mountain-map.js';

export function isOnRoad(x, z) {
  return MapBase.isOnRoad(x, z);
}

export function getNearestRoadPoint(x, z) {
  return MapBase.getNearestRoadPoint(x, z);
}

// Chunk key utility
export function chunkKey(cx, cz) { return cx + ',' + cz; }