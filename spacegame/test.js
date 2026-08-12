import { chromium } from 'playwright';

async function test() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

  // Collect console errors and page errors
  const consoleErrors = [];
  const pageErrors = [];

  page.on('console', msg => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
      console.error(`[console error] ${msg.text()}`);
    }
  });

  page.on('pageerror', err => {
    pageErrors.push(err.message);
    console.error(`[page error] ${err.message}`);
  });

  try {
    await page.goto('http://localhost:8765/spacegame/index.html');

    // Wait for start screen to appear (it's visible by default)
    await page.waitForSelector('#startScreen', { state: 'visible', timeout: 10000 });

    // Take screenshot of start screen
    await new Promise(r => setTimeout(r, 500));
    await page.screenshot({ path: 'screenshots/01-start.png' });
    console.log('✅ Screenshot 01: Start screen captured');

    // Click start button to begin
    await page.click('.start-btn');

    // Wait for game loop to initialize (panels should appear)
    await new Promise(r => setTimeout(r, 3000));

    // Take screenshot of main game view
    await page.screenshot({ path: 'screenshots/02-main-game.png' });
    console.log('✅ Screenshot 02: Main game captured');

    // Check if UI panels exist (they should be visible after init)
    const leftPanel = await page.$('#leftPanel');
    const rightPanel = await page.$('#rightPanel');
    const bottomPanel = await page.$('#bottomPanel');

    console.log(`Left panel: ${leftPanel ? '✅' : '❌'}`);
    console.log(`Right panel: ${rightPanel ? '✅' : '❌'}`);
    console.log(`Bottom panel: ${bottomPanel ? '✅' : '❌'}`);

    // Take screenshot of UI panels
    await page.screenshot({ path: 'screenshots/03-ui-panels.png' });
    console.log('✅ Screenshot 03: UI panels captured');

    // Wait a bit more for game loop to run (check for errors)
    await new Promise(r => setTimeout(r, 5000));

    // Take screenshot of animated scene
    await page.screenshot({ path: 'screenshots/04-animated.png' });
    console.log('✅ Screenshot 04: Animated scene captured');

  } catch (err) {
    console.error(`Test error: ${err.message}`);
    // Take screenshot even on error
    try {
      await page.screenshot({ path: 'screenshots/99-error.png' });
    } catch {}
  }

  console.log(`\n=== Test Results ===`);
  console.log(`Console errors: ${consoleErrors.length}`);
  console.log(`Page errors: ${pageErrors.length}`);

  if (consoleErrors.length > 0) {
    console.log('\nConsole error details:');
    consoleErrors.forEach((e, i) => console.log(`  [${i+1}] ${e}`));
  }

  if (pageErrors.length > 0) {
    console.log('\nPage error details:');
    pageErrors.forEach((e, i) => console.log(`  [${i+1}] ${e}`));
  }

  await browser.close();

  // Return exit code based on errors
  return (consoleErrors.length === 0 && pageErrors.length === 0);
}

const success = await test();
process.exit(success ? 0 : 1);
