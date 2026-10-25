# 小小航天员 · 太空学院 - 完整实现计划

## 项目概述

教育类太空探索游戏(参考 ORBIT 的尺度漫游 + 导览 + 思考题模式)。任务驱动:5 关主线 + 自由探索 + 一键导览。每关有教学简报、明确目标、科学探测、完成判定,解锁知识卡片。

## 目录结构

```
spacegame/
├── index.html          # 入口: 主菜单(任务/自由探索/导览) + 任务面板 + 数据面板
├── css/style.css       # 全部样式(暗色太空主题 + 任务UI)
├── js/
│   ├── game.js         # 主入口: 状态机 + 任务驱动 + 游戏循环
│   ├── engine.js       # Three.js 场景、相机、渲染器、星空
│   ├── config.js       # 常量 + 任务定义 + 知识卡数据 + 全局状态
│   ├── controls.js     # 键盘/触摸输入 + 虚拟摇杆
│   ├── physics.js      # 演示物理(km单位) + 真实教学阈值
│   ├── solar-system.js # 太阳系: 太阳 + 8大行星 + 月球 + 程序化纹理
│   ├── rocket-model.js # 火箭3D模型 + 发动机可视化
│   ├── launch-seq.js   # 发射流程: 组装→点火→升空→分离→入轨
│   ├── spacecraft.js   # 探测器/飞船3D模型 + 返回流程
│   ├── voyager1.js     # 旅行者1号: 大锅盖天线 + 信号波纹
│   ├── re-entry.js     # 载人返回全流程
│   ├── mission.js      # 任务/关卡系统(目标、步骤、完成判定)
│   ├── knowledge.js    # 知识卡片系统(真实数据)
│   ├── tour.js         # 导览模式(5站旅程 + 思考题)
│   ├── ui.js           # 任务面板 + 行星数据面板 + 通知 + 知识卡
│   └── audio.js        # Web Audio API 合成音效
```

## 任务系统(核心)

### 5 关主线

| 关卡 | 标题 | 目标 | 教学点 | 知识卡 |
|------|------|------|--------|--------|
| 1 | 第一次入轨 | 发射火箭,达到第一宇宙速度,环绕地球 | 第一宇宙速度 v=√(GM/r) | 第一宇宙速度 |
| 2 | 奔向月球 | 变轨到月球,绕月探测 | 第二宇宙速度、月球轨道 | 月球与月震 |
| 3 | 红色星球 | 引力弹弓加速,火星入轨 | 引力弹弓、霍曼转移 | 火星与引力弹弓 |
| 4 | 巨行星之旅 | 到达木星/土星,观察大红斑/土星环 | 气态巨行星 | 木星大红斑、土星环 |
| 5 | 深空信使 | 发射旅行者1号,逃离太阳系 | 第三宇宙速度、金唱片 | 旅行者1号 |

### 关卡流程状态机

```
menu → briefing → launchPad → ignite → ascend → orbit(入轨)
     → travel(变轨/航行) → arrive(到达) → survey(科学探测) → complete
```

每关:
1. **briefing**: 教学简报(任务目标 + 知识点,可跳过)
2. **launchPad**: 点火按钮
3. **ignite**: 倒计时 3-2-1
4. **ascend**: 升空,速度增加
5. **orbit**: 达到第一宇宙速度,环绕当前天体
6. **travel**: 变轨/航行到目标
7. **arrive**: 到达目标天体引力圈
8. **survey**: 点击探测点收集数据
9. **complete**: 完成判定 + 解锁知识卡

## 物理系统(演示物理 + 真实教学)

- 游戏单位 = km(行星 mesh 视觉缩放,物理用 km)
- 速度阈值用真实公式: v₁ = √(GM/r),GM_earth = 398600 km³/s²
- 教学提示显示真实数值(7.9 km/s 等)
- 简化两体问题: 以当前目标天体为中心

## 导览模式(参考 ORBIT)

一键导览 · 5 站 · 约 40 秒:
1. 地球夜侧「从万家灯火出发」
2. 月球「静海与月震」
3. 火星「红色星球」
4. 土星环「换个角度想一想」
5. 深空「旅行者1号的金唱片」

每站有思考题 + 数据 + 描述。

## 开发状态（2026-10-24 已完成）

全部核心功能已实现并通过 Playwright 无 JS 错误测试：

1. ✅ config.js - 任务定义 + 知识卡 + 行星数据 + 状态
2. ✅ physics.js - 统一 km 单位 + 真实教学阈值（第一/第二/第三宇宙速度）
3. ✅ launch-seq.js - 修复 camera import 崩溃 + rocketPos 同步到行星轨道
4. ✅ mission.js - 5 关主线任务系统（briefing→launchPad→ignite→ascend→orbit→travel→arrive→survey→complete）
5. ✅ knowledge.js - 知识卡系统（5 张真实数据卡）
6. ✅ tour.js - 一键导览（5 站旅程 + 思考题）
7. ✅ ui.js - 任务面板 + 数据面板 + 探测点 + 知识卡 + 导览面板
8. ✅ game.js - 状态机串联 + 修复 renderer.render(scene, camera) 渲染 bug
9. ✅ index.html + style.css - 主菜单（任务/自由探索/导览/知识图鉴）+ 新 UI
10. ✅ audio.js - Web Audio API 合成音效（点火/升空/分离/入轨/探测/知识卡）
11. ✅ 测试 - Playwright 检查 JS 错误（test-diag/test-flow/test-mission/test-tour）

## 修复的关键 bug

- **渲染 bug**: `renderer.render(camera)` → `renderer.render(scene, camera)`，之前渲染空场景
- **崩溃 bug**: launch-seq.js 用 `camera` 但未 import，进入发射流程即 ReferenceError
- **行星永远到不了**: 行星在 `distAU*100` 单位外，火箭在原点附近 → 入轨时火箭位置放到行星轨道
- **物理单位混乱**: km/game units 混用，`checkOrbitalVelocity` 用地球质量算所有行星 → 统一 km/s + 真实阈值
- **行星 mesh 比例**: RADIUS_SCALE 0.08 → 0.001，地球 mesh 509 单位覆盖太阳 → 6.37 单位
