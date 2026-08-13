/**
 * generate-phonetics.js - 单词音标批量生成工具（使用 espeak-ng）
 *
 * 用法: node gomoku/data/generate-phonetics.js [part1|part2|part3|part4] [--batch=N]
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// espeak-ng 安装路径（winget 默认位置）
const ESPEAK_PATHS = [
    'C:\\Program Files\\WinGet\\espeak-ng\\bin\\espeak-ng.exe',
    'C:\\Users\\admin\\AppData\\Local\\Microsoft\\WinGet\\eSpeak-NG.eSpeak-NG\\1.52.0\\espeak-ng.exe',
    'C:\\Program Files\\espeak-ng\\bin\\espeak-ng.exe',
];

let ESPEAK_BIN = null;
for (const p of ESPEAK_PATHS) {
    try {
        fs.accessSync(p, fs.constants.X_OK);
        ESPEAK_BIN = p;
        break;
    } catch (e) {}
}

// 如果找不到，尝试 PATH
if (!ESPEAK_BIN) {
    const candidates = ['espeak-ng', 'espeak'];
    for (const cmd of candidates) {
        try {
            execSync(cmd + ' --version', { stdio: 'pipe' });
            ESPEAK_BIN = cmd;
            break;
        } catch (e) {}
    }
}

if (!ESPEAK_BIN) {
    console.error('❌ espeak-ng not found. Please install via winget or add to PATH.');
    process.exit(1);
}

console.log(`✅ Using espeak-ng: ${ESPEAK_BIN}`);

/** 用 espeak-ng 获取单词的 IPA 音标 */
function getPhonetic(word) {
    try {
        // 英音 (en-GB)
        const uk = execSync(`${ESPEAK_BIN} -s 0 --ipa "${word}"`, { encoding: 'utf8' }).trim();
        // 美音 (en-US) — espeak-ng 默认美式，但需要区分
        const us = execSync(`${ESPEAK_BIN} -s 0 --espeakng --ipa="${word}"`, { encoding: 'utf8' }).trim();
        return { uk, us };
    } catch (e) {
        return { uk: '', us: '' };
    }
}

/** 统计文件中已有音标的单词数 */
function countPhonetics(content) {
    const matches = content.match(/\bphonetic(?:UK|US)?\s*:"[^"]+"/gi);
    return matches ? matches.length : 0;
}

/** 检查某行是否已有音标字段 */
function hasPhoneticLine(line) {
    return /\bphonetic(?:UK|US)?\s*:"[^"]+"/i.test(line);
}

/** 在 word: "xxx" 后插入 phoneticUK / phoneticUS */
function insertPhoneticsInLine(line, uk, us) {
    const m = line.match(/(\{\s*word:\s*)"([^"]+)"/);
    if (!m) return line;

    const insertAfter = `"${m[2]}"`;
    const idx = line.indexOf(insertAfter);
    if (idx === -1) return line;

    const afterIdx = idx + insertAfter.length;
    let insertStr = '';

    if (!/\bphoneticUK/.test(line) && uk) {
        insertStr += `, phoneticUK: "${uk}"`;
    }
    if (!/\bphoneticUS/.test(line) && us) {
        insertStr += `, phoneticUS: "${us}"`;
    }

    const comma = line.charAt(afterIdx) === ',' ? '' : ',';
    return line.slice(0, afterIdx) + comma + insertStr + line.slice(afterIdx);
}

/** 处理一个词库文件 */
function processFile(filePath, partName) {
    console.log(`\n=== Processing ${partName}: ${filePath} ===`);

    const fullPath = path.join(__dirname, filePath);
    let content = fs.readFileSync(fullPath, 'utf-8');
    const lines = content.split('\n');

    // 统计
    const totalWords = (content.match(/word:\s*"/g) || []).length;
    const existingPhonetics = countPhonetics(content);
    console.log(`Total words: ${totalWords}, Already have phonetics: ${existingPhonetics}`);

    // 找出没有音标的单词行
    const needsPhonetic = [];
    for (let i = 0; i < lines.length; i++) {
        if (hasPhoneticLine(lines[i])) continue;
        const m = lines[i].match(/"([^"]+)"/);
        if (!m) continue;
        needsPhonetic.push({ word: m[1], lineIndex: i });
    }

    console.log(`Words needing phonetics: ${needsPhonetic.length}`);

    // 批量生成音标（使用 espeak-ng）
    const batchSize = parseInt(process.argv.find(a => a.startsWith('--batch='))?.split('=')[1]) || 30;
    let processed = 0, failed = 0;

    for (let batchStart = 0; batchStart < needsPhonetic.length; batchStart += batchSize) {
        const batch = needsPhonetic.slice(batchStart, batchStart + batchSize);
        console.log(`\n  Batch ${Math.floor(batchStart / batchSize) + 1}/${Math.ceil(needsPhonetic.length / batchSize)}: processing ${batch.length} words...`);

        for (const item of batch) {
            try {
                const result = getPhonetic(item.word);
                if (result.uk || result.us) {
                    content = content.split('\n');
                    let line = content[item.lineIndex];
                    line = insertPhoneticsInLine(line, result.uk, result.us);
                    content[item.lineIndex] = line;
                    processed++;
                } else {
                    failed++;
                }
            } catch (e) {
                console.error(`  ✗ Error processing "${item.word}": ${e.message}`);
                failed++;
            }

            // Rate limiting: 每词之间短暂延迟（避免被限流）
            if (batch.indexOf(item) < batch.length - 1) {
                await new Promise(r => setTimeout(r, 200));
            }
        }

        fs.writeFileSync(fullPath, content.join('\n'), 'utf-8');
    }

    const finalPhonetics = countPhonetics(fs.readFileSync(fullPath, 'utf-8'));
    console.log(`\n✅ Done. ${processed} words updated, ${failed} failed.`);
    console.log(`   Total phonetics in file: ${finalPhonetics}`);
}

// ============================================================
// 入口（仅当直接运行此脚本时才执行）
// ============================================================

if (require.main === module) {
    const PARTS = {
        part1: 'words-part1.js',
        part2: 'words-part2.js',
        part3: 'words-part3.js',
        part4: 'words-part4.js'
    };

    const partArg = process.argv[2]; // part1, part2, part3, or part4
    if (partArg && PARTS[partArg]) {
        processFile(PARTS[partArg], partArg);
    } else if (!process.argv[2] || partArg === 'all') {
        // 默认处理全部 parts（跳过 part1，因为它已有音标）
        const partsToProcess = ['part2', 'part3', 'part4'];
        for (const part of partsToProcess) {
            processFile(PARTS[part], part);
        }
    } else {
        console.log(`Usage: node gomoku/data/generate-phonetics.js [part1|part2|part3|part4|all] [--batch=N]`);
    }
}

// 导出供 require() 使用
module.exports = { getPhonetic, processFile };
