# 围棋读诗游戏 - 开发文档

## 测试

每次修改代码后，请运行以下命令确保控制台没有错误：

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
    await page.goto('file://' + process.cwd() + '/index.html');
    await new Promise(r => setTimeout(r, 2000));
    console.log('Console errors:', errors.length);
    if (errors.length > 0) errors.forEach(e => console.log('  - ' + e));
    else console.log('No errors!');
    await browser.close();
})();
"
```

预期输出：`Console errors: 0` 且 `No errors!`

## 文件结构

- `index.html` - 主页面
- `style.css` - 样式文件
- `game.js` - 游戏逻辑
- `poems.js` - 唐诗数据

## 游戏规则

- 中国规则，白棋贴3.75子（KOMI = 3.75）
- 19路标准棋盘
- 支持提子、劫争规则
- 终局条件：连续两次停一手

## AI 难度

- 1-3级：随机落子
- 4-5级：基础评估（吃子、气、连接）
- 6-7级：增加边角、地域评估
- 8级：增加棋形稳定性
- 9-10级：增加前瞻搜索
