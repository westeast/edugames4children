import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });

let errors = [];
page.on('console', msg => {
    if (msg.type() === 'error') errors.push(`CONSOLE ERROR: ${msg.text()}`);
});
page.on('pageerror', err => {
    errors.push(`PAGE ERROR: ${err.message}`);
});

await page.goto('http://localhost:8765/gomoku/index.html');
await page.waitForTimeout(1000);

// Check board dimensions
const boardEl = page.locator('#board');
const boardBox = await boardEl.boundingBox();
console.log(`Board size: ${Math.round(boardBox.width)}x${Math.round(boardBox.height)}`);

// Check game container width
const containerEl = page.locator('.game-container');
const containerBox = await containerEl.boundingBox();
console.log(`Game container width: ${Math.round(containerBox.width)}`);

// Check info panel dimensions
const infoPanel = page.locator('.info-panel');
const infoBox = await infoPanel.boundingBox();
console.log(`Info panel size: ${Math.round(infoBox.width)}x${Math.round(infoBox.height)}`);

// Verify board is wider than old 600px max
if (boardBox.width > 700) {
    console.log('✅ Board successfully widened (>700px on wide screen)');
} else if (boardBox.width >= 600) {
    console.log(`⚠️ Board is ${Math.round(boardBox.width)}px, expected wider`);
}

if (errors.length === 0) {
    console.log('✅ No JS errors detected');
} else {
    for (const e of errors) console.log(e);
}

await browser.close();
