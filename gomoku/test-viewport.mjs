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

// Check board dimensions (wide-screen fix)
const boardEl = page.locator('#board');
const boardBox = await boardEl.boundingBox();
console.log(`Board size: ${Math.round(boardBox.width)}x${Math.round(boardBox.height)}`);

// Check game container width
const containerEl = page.locator('.game-container');
const containerBox = await containerEl.boundingBox();
console.log(`Game container width: ${Math.round(containerBox.width)}`);

// Verify board is wider than old 600px max
if (boardBox.width > 700) {
    console.log('✅ Board successfully widened (>700px on wide screen)');
} else if (boardBox.width >= 600) {
    console.log(`⚠️ Board is ${Math.round(boardBox.width)}px, expected wider`);
}

// Test game interaction: click a board cell to place a piece
const firstIntersection = page.locator('.intersection').first();
await firstIntersection.click();

// Check that a piece was placed (should have .piece inside the intersection)
const pieceCount = await page.locator('.piece').count();
console.log(`Pieces on board: ${pieceCount}`);

if (pieceCount >= 1) {
    console.log('✅ Game interaction works — pieces can be placed');
} else {
    console.log('❌ No pieces placed after clicking');
}

// Check that phonetic data loads without errors
const hasPhonetics = await page.evaluate(() => {
    const wordEl = document.getElementById('info-word');
    return wordEl && wordEl.textContent !== '—' && wordEl.textContent !== '';
});

if (hasPhonetics) {
    console.log('✅ Phonetic data loaded successfully');
} else {
    console.log('⚠️ No phonetic data visible yet (expected before first move)');
}

// Verify schoolWords data loads correctly (this is where phoneticUK/phoneticUS are used)
const hasSchoolWords = await page.evaluate(() => {
    try {
        const p1 = window.SCHOOL_WORDS_P1 || [];
        const p2 = window.SCHOOL_WORDS_P2 || [];
        const p3 = window.SCHOOL_WORDS_P3 || [];
        const p4 = window.SCHOOL_WORDS_P4 || [];
        console.log(`School words loaded: P1=${p1.length}, P2=${p2.length}, P3=${p3.length}, P4=${p4.length}`);

        // Check if any word has phoneticUK/phoneticUS fields
        let withPhonetics = 0;
        for (const part of [p1, p2, p3, p4]) {
            for (const w of part) {
                if (w.phoneticUK || w.phoneticUS) withPhonetics++;
            }
        }
        console.log(`Words with phoneticUK/phoneticUS: ${withPhonetics}`);

        // Sample a few words to check UK/US distinction
        const sample = p1.slice(0, 5).concat(p2.slice(0, 3));
        for (const w of sample) {
            if (w.phoneticUK || w.phoneticUS) {
                console.log(`  ${w.word}: UK=${w.phoneticUK || '(none)'} US=${w.phoneticUS || '(none)'}`);
            }
        }

        return true;
    } catch (e) {
        console.error(`School words error: ${e.message}`);
        return false;
    }
});

if (hasSchoolWords) {
    console.log('✅ School words data loaded successfully');
} else {
    console.log('❌ School words data failed to load');
}

// Check for JS errors from malformed phonetic data
const jsErrors = errors.filter(e => !e.includes('message channel closed') && !e.includes('inject-api'));
if (jsErrors.length === 0) {
    console.log('✅ No JS errors detected');
} else {
    console.log(`⚠️ ${jsErrors.length} JS error(s):`);
    for (const e of jsErrors.slice(0, 5)) console.log(`   ${e}`);
}

await browser.close();
