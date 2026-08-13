/**
 * fetch-phonetics.js - 批量获取单词的英音/美音 IPA 音标
 *
 * 用法:
 *   node gomoku/fetch-phonetics.js              # 处理所有 parts（跳过已有音标的）
 *   node gomoku/fetch-phonetics.js part2         # 只处理 part2
 *   node gomoku/fetch-phonetics.js --batch=50    # 调整批大小
 */

const fs = require('fs');
const path = require('path');

// ---- Config ----
const BATCH_SIZE = parseInt(process.argv.find(a => a.startsWith('--batch='))?.split('=')[1]) || 30;
const PARTS = {
    part1: 'data/words-part1.js',
    part2: 'data/words-part2.js',
    part3: 'data/words-part3.js',
    part4: 'data/words-part4.js'
};

// ---- Load local phonetic dict as fallback source ----
let localDict = {};
try {
    const dictPath = path.join(__dirname, 'data/phonetic-dict.js');
    const dictContent = fs.readFileSync(dictPath, 'utf-8');
    // Extract PHONETIC_DICT from the file (it's a JS object literal)
    const match = dictContent.match(/const\s+PHONETIC_DICT\s*=\s*(\{[\s\S]*?\});/);
    if (match) {
        localDict = eval(`(${match[1]})`);
    }
} catch (e) {}

/** 从本地词典查找音标（带 fallback） */
function lookupLocal(word) {
    const entry = localDict[word.toLowerCase()];
    if (!entry || !entry.uk && !entry.us) return null;
    return { uk: entry.uk || '', us: entry.us || '' };
}

// ---- Helpers ----

/** 从 Free Dictionary API 获取音标（带重试） */
async function fetchPhonetics(word, retries = 2) {
    while (retries >= 0) {
        try {
            const url = `https://api.dictionarying.dev/v2/en/api/definitions?term=${encodeURIComponent(word.toLowerCase())}`;
            const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
            if (!res.ok) { retries--; await delay(500); continue; }

            const data = await res.json();
            for (const entry of data) {
                // 尝试从 phonetics 数组提取 UK/US IPA
                let uk = '', us = '';
                if (entry.phonetics && Array.isArray(entry.phonetics)) {
                    for (const p of entry.phonetics) {
                        if (!p.text) continue;
                        const audio = (p.audio || '').toLowerCase();
                        if (audio.includes('uk') || audio === 'en-uk' || audio === 'gb') uk = p.text;
                        else if (audio.includes('us') || audio === 'en-us' || audio === 'amer') us = p.text;
                    }
                }

                // 也检查 phonetic 字段（某些条目直接提供）
                if (!uk && !us && entry.phonetic) {
                    uk = us = entry.phonetic;
                }

                // ---- FIX: 不再盲目互相填充，而是用本地词典补全 ----
                const local = lookupLocal(word);
                if (local) {
                    if (!uk && local.uk) uk = local.uk;
                    if (!us && local.us) us = local.us;
                }

                // 如果 API + 本地词典都没有，返回 null（让脚本跳过该词）
                if (!uk || !us) return null;

                if (uk || us) return { uk, us };
            }
        } catch (e) { /* retry or fallback */ }
        retries--;
        await delay(500);
    }
    return null;
}

/** 延迟 ms */
function delay(ms) {
    return new Promise(r => setTimeout(r, ms));
}

/** 检查单词行是否已有音标字段 */
function hasPhoneticLine(line) {
    return /\bphonetic(?:UK|US)?\s*:/"[^"]+"/i.test(line);
}

/** 在 word: "xxx" 后插入 phoneticUK / phoneticUS */
function insertPhoneticsInLine(line, uk, us) {
    const m = line.match(/(\{\s*word:\s*)"([^"]+)"/);
    if (!m) return line;

    // 找到 word value 的结束引号位置
    const insertAfter = `"${m[2]}"`;
    const idx = line.indexOf(insertAfter);
    if (idx === -1) return line;

    const afterIdx = idx + insertAfter.length;
    let insertStr = '';

    // 检查该行是否已有 phoneticUK / phoneticUS（避免重复）
    if (!/\bphoneticUK/.test(line) && uk) {
        insertStr += `, phoneticUK: "${uk}"`;
    }
    if (!/\bphoneticUS/.test(line) && us) {
        insertStr += `, phoneticUS: "${us}"`;
    }

    const comma = line.charAt(afterIdx) === ',' ? '' : ',';
    return line.slice(0, afterIdx) + comma + insertStr + line.slice(afterIdx);
}

/** 统计文件中已有音标的单词数 */
function countPhonetics(content) {
    return (content.match(/\bphonetic(?:UK|US)?\s*:/"[^"]+"/gi) || []).length;
}

// ---- Main ----

async function processPart(partName, filePath) {
    console.log(`\n=== Processing ${partName}: ${filePath} ===`);

    const fullPath = path.join(__dirname, filePath);
    let content = fs.readFileSync(fullPath, 'utf-8');

    // 统计总词数 & 已有音标数
    const totalWords = (content.match(/word:\s*"/g) || []).length;
    const existingPhonetics = countPhonetics(content);
    console.log(`Total words: ${totalWords}, Already have phonetics: ${existingPhonetics}`);

    // 找出没有音标的单词行号
    const lines = content.split('\n');
    const needsPhonetic = [];

    for (let i = 0; i < lines.length; i++) {
        if (hasPhoneticLine(lines[i])) continue;
        const m = lines[i].match(/"([^"]+)"/);
        if (!m) continue;
        needsPhonetic.push({ word: m[1], lineIndex: i });
    }

    console.log(`Words needing phonetics: ${needsPhonetic.length}`);

    if (!needsPhonetic.length) {
        console.log('  ✓ All words already have phonetics. Done.');
        return;
    }

    // ---- Pre-fill from local dict for words that are missing either UK or US ----
    let preFilled = 0;
    const updatedLines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
        if (hasPhoneticLine(lines[i])) continue;
        const m = lines[i].match(/"([^"]+)"/);
        if (!m) continue;
        const word = m[1];
        const local = lookupLocal(word);
        if (local && !/\bphoneticUK/.test(lines[i]) || !/\bphoneticUS/.test(lines[i])) {
            // 该行没有 phoneticUK/phoneticUS，用本地词典补上缺的
            let line = lines[i];
            const insertAfter = `"${word}"`;
            const idx = line.indexOf(insertAfter);
            if (idx !== -1) {
                const afterIdx = idx + insertAfter.length;
                let insertStr = '';
                if (!/\bphoneticUK/.test(line) && local.uk) {
                    insertStr += `, phoneticUK: "${local.uk}"`;
                }
                if (!/\bphoneticUS/.test(line) && local.us) {
                    insertStr += `, phoneticUS: "${local.us}"`;
                }
                const comma = line.charAt(afterIdx) === ',' ? '' : ',';
                updatedLines[i] = line.slice(0, afterIdx) + comma + insertStr + line.slice(afterIdx);
                preFilled++;
            }
        }
    }

    // Re-parse lines after pre-fill
    const finalLines = updatedLines.join('\n').split('\n');
    const needsPhonetic2 = [];
    for (let i = 0; i < finalLines.length; i++) {
        if (hasPhoneticLine(finalLines[i])) continue;
        const m = finalLines[i].match(/"([^"]+)"/);
        if (!m) continue;
        needsPhonetic2.push({ word: m[1], lineIndex: i });
    }

    console.log(`Pre-filled from local dict: ${preFilled}`);
    console.log(`Still needing API fetch: ${needsPhonetic2.length}`);

    if (!needsPhonetic2.length) {
        fs.writeFileSync(fullPath, finalLines.join('\n'), 'utf-8');
        console.log('  ✓ All words have phonetics. Done.');
        return;
    }

    // 分批处理（只补本地词典没有的词）
    let processed = 0, failed = 0;
    for (let batchStart = 0; batchStart < needsPhonetic2.length; batchStart += BATCH_SIZE) {
        const batch = needsPhonetic2.slice(batchStart, batchStart + BATCH_SIZE);
        console.log(`\n  Batch ${Math.floor(batchStart / BATCH_SIZE) + 1}/${Math.ceil(needsPhonetic2.length / BATCH_SIZE)}: processing ${batch.length} words...`);

        for (const item of batch) {
            const result = await fetchPhonetics(item.word);
            if (result && (result.uk || result.us)) {
                finalLines[item.lineIndex] = insertPhoneticsInLine(finalLines[item.lineIndex], result.uk, result.us);
                processed++;
            } else {
                failed++;
            }

            // Rate limiting: 每词之间短暂延迟（避免被限流）
            if (batch.indexOf(item) < batch.length - 1) {
                await delay(200);
            }
        }
    }

    fs.writeFileSync(fullPath, finalLines.join('\n'), 'utf-8');

    // 最终统计
    const finalContent = fs.readFileSync(fullPath, 'utf-8');
    const totalPhonetics = countPhonetics(finalContent);
    console.log(`\n✅ Done. ${preFilled} pre-filled from local dict + ${processed} fetched via API, ${failed} failed.`);
    console.log(`   Total phonetics in file: ${totalPhonetics}`);
}

// ---- Entry Point ----

const partArg = process.argv.find(a => a.startsWith('part'));
if (partArg && PARTS[partArg]) {
    processPart(partArg, PARTS[partArg]).catch(err => {
        console.error('Fatal:', err);
        process.exit(1);
    });
} else if (!process.argv[2] || partArg === 'all') {
    // 默认处理全部 parts（跳过 part1，因为它已有音标）
    const partsToProcess = ['part2', 'part3', 'part4'];
    (async () => {
        for (const part of partsToProcess) {
            await processPart(part, PARTS[part]);
        }
    })().catch(err => { console.error('Fatal:', err); process.exit(1); });
} else {
    console.log(`Usage: node fetch-phonetics.js [part1|part2|part3|part4|all] [--batch=N]`);
}
