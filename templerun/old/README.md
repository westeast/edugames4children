# Temple Run 2 - Reference Game Download

Downloaded from: https://creative-roof-2096.puter.site/

## Files Summary

### Core Files
- bundle.js (9.1MB) - Main game bundle
- 2.bundle.js (2.7KB) - Async chunk
- index.html - Entry point (modified to work locally)
- global.css (2.9KB) - Styling

### 3D Models (GLB)
- assets/environments/Machu_Skybox.glb - Skybox
- assets/characters/guy_dangerous/guy_dangerous.glb - Player character
- assets/characters/demon_monkey/demon_monkey_chaser.glb - Chaser
- assets/objects/coins/default_coin_gold.glb - Coins
- assets/objects/pickups/*.glb - Power-ups (Shield, Boost, Vacuum)
- assets/tracks/Machu/Base/base_pack.glb - Track base
- assets/tracks/Machu/Forest/*.glb - Forest track pieces
- assets/tracks/Machu/MineCart/mine_cart_a_prefab.glb - Mine cart

### Textures
- assets/textures/machu_master_a.jpg - Master texture
- assets/textures/machu_lightmaps.jpg - Lightmaps
- assets/textures/foliage_transparent.webp - Foliage
- assets/textures/beige_bg.jpg - Background

### Audio
- assets/sounds/music/*.ogg - Music tracks
- assets/sounds/sfx/*.ogg - Sound effects

### Dependencies
- draco_decoder_gltf.wasm - Draco decoder
- draco_wasm_wrapper_gltf.js - Draco wrapper

## Modifications for Local Play

Original index.html had defer attributes on scripts causing initialization issues.
Modified version includes:
1. Mock PokiSDK and GGEMU interfaces
2. Direct bundle.js loading without defer
3. Simplified configuration

## Testing

To test locally:
```bash
cd templerun/old
python -m http.server 8767
# Open http://localhost:8767/index.html
```

The game should load with:
- Babylon.js initialized ✅
- Canvas created (1280x720) ✅
- 3D models loading ✅

Total files: 65
GLB models: 19
