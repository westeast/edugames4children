# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

儿童教育游戏合集 - A collection of educational games for children. Each game is a standalone HTML application with embedded CSS and JavaScript.

## Games

| Game | Directory | Description |
|------|-----------|-------------|
| 五子棋 | `gomoku/` | Gomoku with pinyin/letter learning |
| 贪吃蛇 | `snake/` | Snake game with educational elements |
| 恐龙跳跳 | `dinosaur-game/` | Dinosaur runner with Chinese characters |
| 大疆虚拟飞行 | `flight/` | DJI drone flight simulator |
| 围棋读诗 | `weiqi/` | 19x19 Go game with Tang poetry recitation |

## Testing

Each game can be tested for JavaScript errors using puppeteer:

```bash
source ~/.nvm/nvm.sh && nvm use 18 && node -e "
const puppeteer = require('puppeteer-core');
(async () => {
    const browser = await puppeteer.launch({
        executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        headless: 'new'
    });
    const page = await browser.newPage();
    const errors = [];
    page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
    page.on('pageerror', err => errors.push(err.message));
    await page.goto('file://' + process.cwd() + '/weiqi/index.html');
    await new Promise(r => setTimeout(r, 2000));
    console.log('Console errors:', errors.length);
    if (errors.length > 0) errors.forEach(e => console.log('  - ' + e));
    else console.log('No errors!');
    await browser.close();
})();
"
```

## Architecture

- **No build system** - All games are plain HTML/CSS/JS, opened directly in browser
- **No dependencies** - Games use CDN libraries (e.g., WGo.js for Go game) or vanilla JS
- **Self-contained** - Each game directory contains its own files, no shared components
- **Single-page apps** - Each game is a single HTML file with embedded styles and scripts

## Weiqi (围棋) Specific Notes

See `weiqi/CLAUDE.md` for Go game specific documentation including:
- Chinese rules with 3.75 komi (贴目)
- AI difficulty levels 1-10
- Poetry recitation system
