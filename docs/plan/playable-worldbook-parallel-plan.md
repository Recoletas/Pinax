# 角色化迁移并行执行计划

> 文件名沿用旧名，但内容已经切到当前模型：**方向按 `character-driven` 走，执行按 `playable-worldbook` 骨架走。**

## 0. 当前共识

- 产品方向：角色化 AI GM 驱动的文字冒险工作台。
- 执行骨架：`playable-worldbook` 的 runtime / content / trigger 主链。
- 推进方式：UI shell、runtime skeleton、content/demo 三条线程并行。
- 冻结区：旧 `WelcomeView` 任务板、旧 `.advisor-fab`、旧工具化外壳只做 bugfix，不再深度 polish。
- 当前进度：线程 A 的 Phase 1A 已完成首轮，四页已接入共享 `GmPersonaLauncher`；线程 A 当前推进点改为 Phase 1B 的“海报入口语法 + chrome 收敛”，Phase 2 资产与 motion gate 仍关闭。

## 1. 线程 A — UI shell / 显示全面重构

**目标**：开始把产品“看起来像一个角色在带你进入世界”，而不是一个工具集合。

**Owner**：UI 主线程

**建议文件边界**：

- `src/views/WelcomeView.vue`
- `src/layouts/AppShell.vue`
- `src/styles/main.css`
- `src/pages/Experience.vue` 的外壳层
- `src/pages/Writing.vue`
- `src/pages/Notes.vue`
- `src/pages/ProseEssay.vue`
- 新的 `src/components/gm-persona/*`

**本轮切片**：

1. Phase 1A：角色 launcher / bubble / panel（已完成首轮）
2. Phase 1B-a：`WelcomeView` 海报入口语法
   - 通用暗红海背景
   - 构成主义切面 / 楔形
   - 诚实的海报舞台与反射语法；在真实位图资产接入前，不用 CSS 假人物 / 假剪影冒充角色海报
   - 默认世界入口降到辅助层
   - 入口 CTA 保持命令式，避免功能总览
3. Phase 1B-b：`AppShell` / 导航 / 页面 chrome 收敛
   - hidden-first chrome
   - 页面 mast / side shell 层级统一
   - 不把旧工具栏包装成“最终方向”
4. Phase 1C：Experience 与其余重工作面的在场感映射
   - `Experience` 优先对齐正立对话态
   - `Writing / Notes` 优先对齐侧视静默批注态
   - `ProseEssay` 对齐编辑态

**硬边界**：

- 不改 `gameStore` 状态结构
- 不碰 `worldbookContextBuilder` 核心逻辑
- 不先做 Mem0 character 轴
- 不用单一世界专属背景图当长期方案
- 不提前引入真实立绘资产生产、Motion One / GSAP 或 3D 倾斜立绘
- 不把单次首页预览硬写成最终字体系统

**交付物**：

- 新角色入口原型
- 局部 token / typography wedge
- WelcomeView / Experience 的新外壳截图或实现

## 2. 线程 B — Runtime skeleton / 底层逻辑

**目标**：继续把“世界会记住发生了什么，并能写回作品”做成稳定骨架。

**Owner**：runtime 主线程

**建议文件边界**：

- `src/stores/gameStore.js`
- `src/services/worldbookContextBuilder.js`
- `src/services/generation*`
- `src/components/StatusBar.vue`
- `src/components/QuestLog.vue`
- 对应测试文件

**本轮切片**：

1. Stage 3a：轻状态字段
2. Stage 3b：剧情日志聚合
3. Stage 4：两个 MVP trigger

**硬边界**：

- 不顺手接 UI 壳层重做
- 不把旧壳层继续 polish 成“看起来更像最终方向”
- 不启用第二套状态源

**交付物**：

- 轻状态字段与回归测试
- 剧情摘要结构
- `写成我的版本` / `整理成分镜` 两个入口

## 3. 线程 C — 内容 / demo / 手测

**目标**：继续用旗舰世界验证这条方向是不是能玩、能写、能展示。

**Owner**：内容线程 / 文档线程

**建议文件边界**：

- `docs/demo/*`
- `docs/content-review/*`
- `docs/plan/*`
- `src/services/seedWorldbookPresets.js` 只在 patch 点明确后再动

**本轮切片**：

1. `边境王国 · 雾潮暮湾` 10-15 分钟真实手测
2. 开场钩子、世界细节、写回出口文案补点
3. demo case、小说化样例、分镜节点清单
4. UI 参考继续偏“文字冒险 / 编辑设计 / 角色化入口”，不再偏工具站
5. 给 Thread A 提供 Phase 2 前置资料，而不是直接抢实现：
   - demo persona 候选 brief
   - 字体 shortlist
   - 资产 prompt / pose 说明草稿

**硬边界**：

- 不直接抢改 `Experience.vue` / `gameStore.js` / `WorldBookQuickImport.vue`
- 先提文档 patch 点，再由对应线程落地工程改动

**交付物**：

- live 手测记录
- 可复用 demo 文档
- 内容 patch 建议

## 4. 避冲突规则

### 线程 A 不要抢

- `gameStore.js`
- `worldbookContextBuilder.js`
- generation task layer

### 线程 B 不要抢

- `WelcomeView.vue`
- `AppShell.vue`
- 新角色壳层组件
- 全局视觉语言重做

### 线程 C 不要抢

- 高冲突运行时代码
- 正在做大改的 UI 外壳文件

## 5. 接下来两轮的推荐顺序

```text
Round 1
  A: 角色 launcher / bubble / panel（已完成）
  B: Stage 3a 轻状态
  C: 边境王国 live 手测 + demo 样例

Round 2
  A: WelcomeView 海报入口语法 + chrome 重做
  B: Stage 3b 剧情日志
  C: 世界内容 patch 建议 + UI 参考补充 + persona/字体/pose brief

Round 3
  A: Experience 呈现层统一，再带到 Writing / Notes / ProseEssay
  B: Stage 4 两个 trigger
  C: 完整 demo case 录制与营销材料骨架
```

## 6. 当前最重要的约束

- 不要再同时推进“旧任务板首屏打磨”和“角色化首屏重构”。
- 不要让 UI 方向切换把 runtime skeleton 拖停。
- 不要把 Mem0 character 轴误写成第一阶段轻改。
- 先把壳层价值证明出来，再决定是否继续深入 persona memory。
- Phase 2 的 pose / 资产 / 动画约束已经写进方向文档，但 gate 还没开；当前并行线程都不能把自己滑进去。
