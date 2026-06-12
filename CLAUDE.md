# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

儿童教育游戏合集 - A collection of educational games for children. Each game is a standalone HTML/CSS/JS application with no build system.

## Games

| Game | Directory | URL Path | Description |
|------|-----------|----------|-------------|
| 首页 | `/` | `/` | Game listing portal |
| 五子棋 | `gomoku/` | `/gomoku/` | Gomoku with pinyin/letter learning |
| 贪吃蛇 | `snake/` | `/snake/` | Snake game with educational elements |
| 恐龙跳跳 | `dinosaur-game/` | `/dinosaur-game/` | Dinosaur runner with Chinese characters |
| 大疆虚拟飞行 | `flight/` | `/flight/` | DJI drone flight simulator (Three.js) |
| 围棋读诗 | `weiqi/` | `/weiqi/` | 19x19 Go game with Tang poetry recitation |
| 神庙逃亡 | `templerun/` | `/templerun/` | 3D infinite runner (Babylon.js) |

## Development Workflow

1. **Local test server** (needed for ES module games like flight):
   ```bash
   npx --yes http-server -p 8765 --cors -c-1 &>/dev/null &
   ```
   Then open `http://localhost:8765/flight/index.html` etc.

2. **Playwright test** (check for JS errors after changes):
   ```js
   import { chromium } from 'playwright';
   // launch browser, load page via http://localhost:8765/<game>/index.html
   // listen for console errors and pageerror
   // filter out browser extension errors ("message channel closed", "inject-api")
   ```

3. **Deploy to server** after testing:
   ```bash
   scp -r <game-dir> root@nuwaos.cn:/home/wwwroot/edugame.nuwaos.cn/
   ```
   Live URL: `https://edugame.nuwaos.cn/<game-dir>/`

4. **Git commit and push** after successful deploy.

## Architecture

- **No build system** - All games are plain HTML/CSS/JS, opened directly in browser
- **No dependencies** - Games use CDN libraries (Three.js, Babylon.js, WGo.js) or vanilla JS
- **Self-contained** - Each game directory is independent, no shared components
- **Single-page apps** - Most games are a single HTML file; flight uses modular JS with ES imports

### Flight Simulator Architecture (`flight/`)

The only game with a modular structure. Uses ES module `importmap` for Three.js from CDN.

```
flight/js/
  game.js      - Entry point: init() + game loop
  engine.js    - Three.js renderer, scene, camera, sky, lighting
  config.js    - State object, drone specs, gear settings
  controls.js  - Keyboard input, virtual joystick setup
  physics.js   - Drone movement, velocity, RTH autopilot
  terrain.js   - Procedural terrain chunks (Perlin noise)
  entities.js  - Birds, cars, people, clouds spawning & updates
  drone-model.js - 3D drone mesh with propellers
  ui.js        - Camera tracking, telemetry panel, notifications
  noise.js     - Perlin noise implementation
  world.js     - World generation utilities
```

Key state: `state.fpvMode` toggles FPV camera (hides drone model, moves camera to gimbal). Joystick uses pixel-based `calc()` transforms for thumb position.

### Flight Simulator Version History

| Version | Date | Files Changed | Description |
|---------|------|---------------|-------------|
| v1.0 | 2026-05-30 | Initial | First release with drone, terrain, entities |
| v1.1 | 2026-05-30 | `game.js`, `ui.js` | Fix drone centering on page load and resize |
| v1.2 | 2026-05-30 | `game.js`, `engine.js` | Fix window resize camera position issue |
| v1.3 | 2026-05-30 | `index.html`, `css/style.css`, `js/controls.js` | Add FPV crosshair for first-person view |

### Temple Run Architecture (`templerun/`)

3D infinite runner game using Babylon.js (CDN UMD). Uses ES modules for game logic, accesses Babylon via `window.BABYLON` global.

```
templerun/js/
  game.js       - Entry point: init() + game loop + state transitions
  engine.js     - Babylon.js engine, scene, camera, lighting, skybox
  config.js     - All constants (track pacing, speeds), shared mutable state
  controls.js   - Keyboard + touch/swipe input, action queue
  player.js     - 3-lane movement, jump physics, slide, collision bounds
  track.js      - Procedural track piece generation + recycling pool
  obstacles.js  - 5 obstacle types (jump/slide/block/turnL/turnR), collision
  coins.js      - Gold coin spawning (straight + arc), collection, magnet
  powerups.js   - Shield/Boost/Magnet power-ups with timers
  chaser.js     - Demon monkey chaser AI, catch-up mechanics
  character.js  - GLB model loading, animation state machine (18 animations)
  audio.js      - Web Audio API synthesized sound effects
  ui.js         - HUD updates, screen transitions, golden gradient text
  utils.js      - Math helpers, object pooling, weighted random
```

Key: `state.gamePhase` controls screen flow (loading→menu→playing→paused→gameover). GLB models: `guy_dangerous.glb` (player, 930KB, 18 anims), `demon_monkey_chaser.glb` (chaser), `default_coin_gold.glb` (coin), `Machu_Skybox.glb` (sky). Custom font: `temple-run-small-caps.woff2`.

See `weiqi/CLAUDE.md` for Go game details including:
- Chinese rules with 3.75 komi (贴目)
- AI difficulty levels 1-10
- Poetry recitation system

## Related Projects

- 网易龙虾项目: `/c/Users/admin/git/LobsterAI`
