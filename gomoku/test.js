/**
 * gomoku/test.js - 五子棋游戏 Playwright 测试用例
 * 每次修改后运行: npx playwright test --reporter=list
 */

const { chromium } = require('playwright');
const path = require('path');

// HTTP server helper for serving files locally
async function startServer(port) {
    const { spawn } = await import('child_process');
    // Use http-server if available, otherwise serve from local directory
    return null; // We'll use a simple approach - load via file:// or relative path
}

// 测试五子棋游戏
async function runTests() {
    console.log('=== Gomoku Game Test Suite ===\n');

    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    // Capture all console errors and page errors
    const errors = [];
    page.on('console', msg => {
        if (msg.type() === 'error') {
            errors.push(`CONSOLE ERROR: ${msg.text()}`);
        }
    });
    page.on('pageerror', err => {
        errors.push(`PAGE ERROR: ${err.message}`);
    });

    let passed = 0;
    let failed = 0;

    // ===== Test 1: Page loads without JS errors =====
    try {
        await page.goto('http://localhost:8765/gomoku/index.html');
        await page.waitForTimeout(1000); // Wait for game to initialize
        const hasErrors = errors.length > 0;
        if (hasErrors) {
            console.log(`✗ Test 1 FAILED - JS errors detected:`);
            errors.forEach(e => console.log(`    ${e}`));
            failed++;
        } else {
            console.log('✓ Test 1 PASSED - Page loads without JS errors');
            passed++;
        }
    } catch (err) {
        console.log(`✗ Test 1 FAILED - ${err.message}`);
        failed++;
    }

    // ===== Test 2: Game UI renders correctly =====
    try {
        const boardExists = await page.$eval('.board', el => !!el);
        if (boardExists) {
            console.log('✓ Test 2 PASSED - Board element exists');
            passed++;
        } else {
            console.log('✗ Test 2 FAILED - Board element not found');
            failed++;
        }
    } catch (err) {
        console.log(`✗ Test 2 FAILED - ${err.message}`);
        failed++;
    }

    // ===== Test 3: Info panel exists =====
    try {
        const infoPanel = await page.$('.info-panel');
        if (infoPanel) {
            console.log('✓ Test 3 PASSED - Info panel exists');
            passed++;
        } else {
            console.log('✗ Test 3 FAILED - Info panel not found');
            failed++;
        }
    } catch (err) {
        console.log(`✗ Test 3 FAILED - ${err.message}`);
        failed++;
    }

    // ===== Test 4: Game status displays correctly =====
    try {
        const status = await page.$('#status');
        if (status) {
            const text = await status.evaluate(el => el.textContent);
            if (text && text.length > 0) {
                console.log(`✓ Test 4 PASSED - Game status displays: "${text}"`);
                passed++;
            } else {
                console.log('✗ Test 4 FAILED - Game status is empty');
                failed++;
            }
        } else {
            console.log('✗ Test 4 FAILED - Status element not found');
            failed++;
        }
    } catch (err) {
        console.log(`✗ Test 4 FAILED - ${err.message}`);
        failed++;
    }

    // ===== Test 5: Game can be played (click to place piece) =====
    try {
        const boardEl = await page.$('.board');
        if (boardEl) {
            const rect = await boardEl.boundingBox();
            if (rect) {
                // Click near center of board
                await page.mouse.click(rect.x + rect.width / 2, rect.y + rect.height / 2);
                await page.waitForTimeout(500);

                // Check that a piece was placed
                const pieces = await page.$$('.piece');
                if (pieces.length > 0) {
                    console.log('✓ Test 5 PASSED - Clicking board places a piece');
                    passed++;
                } else {
                    console.log('✗ Test 5 FAILED - No piece placed after clicking board');
                    failed++;
                }
            }
        }
    } catch (err) {
        console.log(`✗ Test 5 FAILED - ${err.message}`);
        failed++;
    }

    // ===== Test 6: Chinese characters display correctly =====
    try {
        const hasChineseText = await page.evaluate(() => {
            const title = document.querySelector('h1');
            return title && title.textContent.includes('五子棋');
        });
        if (hasChineseText) {
            console.log('✓ Test 6 PASSED - Chinese characters display correctly');
            passed++;
        } else {
            console.log('✗ Test 6 FAILED - Chinese text not found in title');
            failed++;
        }
    } catch (err) {
        console.log(`✗ Test 6 FAILED - ${err.message}`);
        failed++;
    }

    // ===== Test 7: Game mode selection works (school words option exists) =====
    try {
        const displaySelect = await page.$('#displayType');
        if (displaySelect) {
            const hasSchoolWordsOption = await displaySelect.evaluate(el => {
                return Array.from(el.options).some(opt => opt.value === 'schoolWords');
            });
            if (hasSchoolWordsOption) {
                console.log('✓ Test 7 PASSED - School words mode option exists in display type selector');
                passed++;
            } else {
                console.log('✗ Test 7 FAILED - School words mode not found in display type options');
                failed++;
            }
        } else {
            console.log('✗ Test 7 FAILED - Display type select element not found');
            failed++;
        }
    } catch (err) {
        console.log(`✗ Test 7 FAILED - ${err.message}`);
        failed++;
    }

    // ===== Test 8: Word panel shows content in school words mode =====
    try {
        const displaySelect = await page.$('#displayType');
        if (displaySelect) {
            // Select "8. 中小学常用单词" option
            await page.selectOption('select#displayType', { value: 'schoolWords' });

            // Click start button to load school words mode
            const startBtn = await page.$('#startBtn');
            if (startBtn) {
                await startBtn.click();
                await page.waitForTimeout(1000);
            }

            const wordEl = await page.$('#info-word');
            if (wordEl) {
                const firstWord = await wordEl.evaluate(el => el.textContent);
                if (firstWord && firstWord !== '—' && firstWord.trim().length > 0) {
                    console.log(`✓ Test 8 PASSED - Word panel shows: "${firstWord}"`);
                    passed++;
                } else {
                    console.log('✗ Test 8 FAILED - Word panel is empty or showing placeholder');
                    failed++;
                }
            } else {
                console.log('✗ Test 8 FAILED - Word element not found');
                failed++;
            }
        } else {
            console.log('✗ Test 8 FAILED - Display type select element not found');
            failed++;
        }
    } catch (err) {
        console.log(`✗ Test 8 FAILED - ${err.message}`);
        failed++;
    }

    // ===== Test 9: Game resets properly =====
    try {
        const resetBtn = await page.$('#restartBtn');
        if (resetBtn) {
            await resetBtn.click();
            await page.waitForTimeout(500);

            // Check that pieces are cleared
            const piecesAfterReset = await page.$$('.piece');
            if (piecesAfterReset.length === 0) {
                console.log('✓ Test 9 PASSED - Game resets properly');
                passed++;
            } else {
                console.log(`✗ Test 9 FAILED - ${piecesAfterReset.length} pieces remain after reset`);
                failed++;
            }
        }
    } catch (err) {
        console.log(`✗ Test 9 FAILED - ${err.message}`);
        failed++;
    }

    // ===== Test 10: Board renders on different screen sizes =====
    try {
        await page.setViewportSize({ width: 800, height: 600 });
        await page.waitForTimeout(500);

        const boardEl = await page.$('.board');
        if (boardEl) {
            console.log('✓ Test 10 PASSED - Board renders at different viewport size');
            passed++;
        } else {
            console.log('✗ Test 10 FAILED - Board not found after resize');
            failed++;
        }
    } catch (err) {
        console.log(`✗ Test 10 FAILED - ${err.message}`);
        failed++;
    }

    // ===== Test 11: Phonetic section element exists on page load =====
    try {
        const phoneticSection = await page.$('#phonetic-section');
        if (phoneticSection) {
            console.log('✓ Test 11 PASSED - Phonetic section element exists in DOM');
            passed++;
        } else {
            console.log('✗ Test 11 FAILED - Phonetic section element not found');
            failed++;
        }
    } catch (err) {
        console.log(`✗ Test 11 FAILED - ${err.message}`);
        failed++;
    }

    // ===== Test 12: School words mode shows phonetic section with UK/US labels =====
    try {
        const displaySelect = await page.$('#displayType');
        if (displaySelect) {
            // Select "8. 中小学常用单词" option
            await page.selectOption('select#displayType', { value: 'schoolWords' });

            // Click start button to load school words mode
            const startBtn = await page.$('#startBtn');
            if (startBtn) {
                await startBtn.click();
                await page.waitForTimeout(1000);
            }

            // Check that phonetic section is visible
            const phoneticSection = await page.$('#phonetic-section');
            const isVisible = await phoneticSection.evaluate(el => el.style.display !== 'none' && getComputedStyle(el).display !== 'none');

            if (isVisible) {
                console.log('✓ Test 12 PASSED - Phonetic section visible after selecting school words mode');
                passed++;
            } else {
                console.log('✗ Test 12 FAILED - Phonetic section not visible after school words selection');
                failed++;
            }
        } else {
            console.log('✗ Test 12 FAILED - Display type select not found');
            failed++;
        }
    } catch (err) {
        console.log(`✗ Test 12 FAILED - ${err.message}`);
        failed++;
    }

    // ===== Test 13: UK and US phonetic labels exist =====
    try {
        const ukLabel = await page.$('#info-phoneticUK');
        const usLabel = await page.$('#info-phoneticUS');

        if (ukLabel && usLabel) {
            const hasBothLabels = true;
            // Check that speaker buttons exist for both UK and US
            const ukSpeaker = await page.$('#btn-phoneticUK');
            const usSpeaker = await page.$('#btn-phoneticUS');

            if (ukSpeaker && usSpeaker) {
                console.log('✓ Test 13 PASSED - UK/US phonetic labels and speaker buttons exist');
                passed++;
            } else {
                console.log('✗ Test 13 FAILED - Speaker buttons not found for UK/US phonetics');
                failed++;
            }
        } else {
            console.log('✗ Test 13 FAILED - UK or US phonetic label element not found');
            failed++;
        }
    } catch (err) {
        console.log(`✗ Test 13 FAILED - ${err.message}`);
        failed++;
    }

    // ===== Test 14: Phonetic data is present for school words =====
    try {
        const phoneticUKEl = await page.$('#info-phoneticUK');
        if (phoneticUKEl) {
            const ukPhonetic = await phoneticUKEl.evaluate(el => el.textContent);

            // Check that the phonetic is not empty and has proper IPA format (/.../)
            const hasIPAFormat = ukPhonetic && /\//.test(ukPhonetic);

            if (hasIPAFormat) {
                console.log(`✓ Test 14 PASSED - Phonetic data present in IPA format: "${ukPhonetic}"`);
                passed++;
            } else {
                console.log(`✗ Test 14 FAILED - Phonetic data missing or not in IPA format: "${ukPhonetic}"`);
                failed++;
            }
        } else {
            console.log('✗ Test 14 FAILED - Phonetic UK element not found');
            failed++;
        }
    } catch (err) {
        console.log(`✗ Test 14 FAILED - ${err.message}`);
        failed++;
    }

    // ===== Test 15: speakPhonetic function exists and is callable =====
    try {
        const hasSpeakFunction = await page.evaluate(() => typeof speakPhonetic === 'function');
        if (hasSpeakFunction) {
            console.log('✓ Test 15 PASSED - speakPhonetic() function exists');
            passed++;
        } else {
            console.log('✗ Test 15 FAILED - speakPhonetic() function not found');
            failed++;
        }
    } catch (err) {
        console.log(`✗ Test 15 FAILED - ${err.message}`);
        failed++;
    }

    // ===== Summary =====
    await browser.close();

    console.log(`\n=== Results: ${passed} passed, ${failed} failed (${passed + failed} total) ===`);

    if (errors.length > 0) {
        console.log('\n=== JS Errors Detected ===');
        errors.forEach(e => console.log(e));
    }

    return { passed, failed };
}

// Run tests
runTests().catch(err => {
    console.error('Test suite failed:', err);
    process.exit(1);
});
