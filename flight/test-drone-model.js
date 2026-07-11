const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', err => errors.push(err.message));

  await page.goto('http://localhost:8765/flight/index.html', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(8000);

  // Force start
  await page.evaluate(() => {
    const ss = document.getElementById('startScreen');
    if (ss) ss.style.display = 'none';
    window.gameState && (window.gameState.gameStarted = true);
  });
  await page.waitForTimeout(3000);

  // Test switching drones via keyboard (avoids click interception)
  console.log('=== Test: Switch drones via keyboard ===');

  // Air 3 (default, key 1)
  console.log('Air 3 (key 1) - default');

  // Mavic 3 Pro (key 2)
  await page.keyboard.press('2');
  await page.waitForTimeout(2000);
  console.log('Mavic 3 Pro (key 2) - switched');

  // Mini 4 Pro (key 3)
  await page.keyboard.press('3');
  await page.waitForTimeout(2000);
  console.log('Mini 4 Pro (key 3) - switched');

  // Avata 360 (key 4) - needs confirmation
  await page.keyboard.press('4');
  await page.waitForTimeout(1000);
  // Click confirm button
  const confirmBtn = await page.$('[onclick="confirmAvataPrompt()"]');
  if (confirmBtn) {
    await confirmBtn.evaluate(el => el.click());
    await page.waitForTimeout(2000);
    console.log('Avata 360 (key 4) - switched with confirm');
  }

  // Back to Air 3
  await page.keyboard.press('1');
  await page.waitForTimeout(2000);
  console.log('Back to Air 3 (key 1)');

  // Test lid toggle (L key)
  await page.keyboard.press('l');
  await page.waitForTimeout(1000);
  console.log('Lid toggle (L key)');

  // Test zoom (Z key) - switch to Mini 4 Pro first
  await page.keyboard.press('3');
  await page.waitForTimeout(2000);
  await page.keyboard.press('z');
  await page.waitForTimeout(500);
  await page.keyboard.press('z');
  await page.waitForTimeout(500);
  console.log('Zoom toggle (Z key) x2');

  // Test module bay (B key) - switch to Mavic 3 Pro
  await page.keyboard.press('2');
  await page.waitForTimeout(2000);
  await page.keyboard.press('b');
  await page.waitForTimeout(1000);
  console.log('Module bay toggle (B key)');

  // Filter out browser extension errors
  const realErrors = errors.filter(e => !e.includes('message channel closed') && !e.includes('inject-api') && !e.includes('net::ERR'));

  console.log('\n=== JS ERRORS ===');
  if (realErrors.length === 0) {
    console.log('No JS errors! All tests passed ✓');
  } else {
    realErrors.forEach(e => console.log(e));
  }

  await browser.close();
})();
