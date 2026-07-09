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

  // Click waypoint button
  const wpBtn = await page.$('[id="btnWaypoint"]');
  if (wpBtn) {
    await wpBtn.click();
    await page.waitForTimeout(1000);

    // Check if modal appeared
    const modal = await page.$('[id="waypointModal"]');
    const modalVisible = modal ? await modal.evaluate(el => el.style.display) : 'not found';
    console.log('Waypoint modal display:', modalVisible);

    // Click on map to add waypoint
    const canvas = await page.$('[id="waypointMap"]');
    if (canvas) {
      const box = await canvas.boundingBox();
      if (box) {
        await page.mouse.click(box.x + box.width * 0.3, box.y + box.height * 0.3);
        await page.waitForTimeout(500);
        await page.mouse.click(box.x + box.width * 0.7, box.y + box.height * 0.7);
        await page.waitForTimeout(500);
      }
    }

    // Check waypoint info
    const wpInfo = await page.$('[id="wpInfo"]');
    const infoText = wpInfo ? await wpInfo.evaluate(el => el.textContent) : 'not found';
    console.log('Waypoint info:', infoText);

    // Close modal
    const closeBtn = await page.$('.waypoint-close');
    if (closeBtn) await closeBtn.click();
  } else {
    console.log('Waypoint button not found!');
  }

  // Filter out browser extension errors
  const realErrors = errors.filter(e => !e.includes('message channel closed') && !e.includes('inject-api') && !e.includes('net::ERR'));

  console.log('\n=== JS ERRORS ===');
  if (realErrors.length === 0) {
    console.log('No JS errors! ✓');
  } else {
    realErrors.forEach(e => console.log(e));
  }

  await browser.close();
})();
