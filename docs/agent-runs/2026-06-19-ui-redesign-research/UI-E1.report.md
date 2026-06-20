I cannot write the file directly to disk in this environment (Bash is read-only and Edit requires existing files). I'll deliver the full report content in this response — copy it into `docs/agent-runs/2026-06-19-ui-redesign-research/UI-E1.report.md`.

---

# UI-E1 — Experience 页强视觉方向研究

> Worker：Claude Code Worker UI-E1
> 范围：`/experience` 强视觉方向研究，不实现
> 日期：2026-06-19
> 必读文件：`docs/agent-runs/current.md`、`docs/engineering/visual-alignment-workflow.md`、`src/pages/Experience.vue`、`src/components/GamePanel.vue`、`src/components/InputArea.vue`、`src/components/StatusBar.vue`、`src/components/geography/GeographyPanel.vue`、`src/components/QuestLog.vue`、`src/styles/themes/kao.css`、三张现状截图
> 硬约束：禁止改 `src/stores/gameStore.js`、`src/services/worldbookContextBuilder.js`、`src/services/generation*`、`server/`、`AGENTS.md`、`docs/STATUS.md`、禁止把 `/opening` 开场页逻辑塞回 `/experience`、禁止改代码

---

## 0. 现场读图

参考三张图：
1. `docs/agent-runs/2026-06-19-ui-redesign-research/experience-baseline-1280.png`（pass1 基准）
2. `docs/demo/exp-v2-archive-binder-20260619_001.png`（v2 卷宗方向）
3. `docs/demo/pass2-screenshots/experience-1280.png`（pass2 顶栏样式，状态更糟）

三张图共同点：主区是大面积浅米色（`--archive-paper` 域），没有叙事锚点；右栏卷宗内部模块顺序与样式与 `/writing` 的资料库非常接近；输入区位于主区下沿，单行 input + 圆角"发送"按钮 + 圆形 token 圆环 + 小扳手 icon，是典型聊天 SaaS 控件排。

视觉气质上，目前页面是"左侧空白纸 + 右侧档案柜 + 底部聊天栏"的三段拼贴，**没有统一的世界观叙事**：主区是开着的记录本，底部是 ChatGPT 控件，右侧像 Notion 资料库。整体读上去像把 OpeningPage 的卡片、Writing 的侧栏、ChatPanel 的 input 摞在一起，还没有形成"案卷推进台 / 现场记录本 / 跑团桌面"的统一空间。

---

## 1. 当前 Experience 截图为什么失败（按区域拆，≥12 条）

> 编号 = 区域代号。验收时按编号定位（来自 R0 的"按截图、标注和用户反馈验收"硬约束）。

### 主对话区（GamePanel / 卡片纸面）
**F1. 主对话区存在一个"没有任何提示/视觉锚点"的大空白纸面**。pass1 与 pass2 截图中，`game-main-shell` 内部是接近 720×420 的纯米色矩形，没有任何世界开场字、人物旁白、当前位置标签、叙事时间戳、章节封面或"现场概览卡"。空白不携带信息，违反 `current.md` 中"出效果，不是微调"。

**F2. 主区没有任何"卷宗"语义图层**。`<FolioSurface>` 装饰层（`::after` 缺口、`::before` 平行线）在 5C v3.5 中被砍掉，纸面退化为单层 gradient；上一轮 v2 卷宗方向给主区加了什么"墨钉 / 案号 / 章节 / 当下时间"——一项目前都没有，只剩米色平面。

**F3. 角色立绘位置死板**。`<CharacterBackdrop position="right center" tint="archive-olive-strong" :tint-strength="58" :blur="2" />` 把 art 钉死在右中央，但主区对话框没有让位，导致 art 与对话区像两张贴图相互挤占，没有任何"立绘站在对话旁"的舞台感。

**F4. 头像列与对话列硬对齐**。`GamePanel` 的 `.msg-item` 是一行 `avatar-column + msg-column`，配 14px gap，圆形头像 + 横向列 + 时间戳排列，是 **典型 SaaS chat 列表** 的最小骨架，没有案卷/册页/书脊的纵向感。

**F5. "思考过程"details 折叠块仍是 web 控件**。`<details><summary>思考过程 <span class="arrow">▾</span></summary></details>` 配 6px 圆角、bg-secondary，是 dev console 的 UI，不符合"现场记录"语言。

**F6. 没有"最近一次开场 / 章节封面 / 案号"等 anchor 元素**。Experience 应该像打开的卷宗首页：左侧/顶部一段定场文字 + 案号 + 日期 + 在场人物，**目前完全缺位**。

### 输入区（InputArea）
**I1. 输入区是"圆角 + 圆角 + 圆角"的三段 SaaS 控件**：`.input` 6px 圆角，`.send-btn` 6px 圆角，`.context-usage-mini` 6px 圆角；token 圆环 + 14×14 icon 全是产品化 icon。这是 ChatGPT / Notion AI 的视觉指纹，与案卷语言不兼容。

**I2. 顶部 `quick-actions` 是一排扁平按钮**：`▶ 继续` `🌿 场景` `💬 对话` `💭 心理` `💬 对话模式`，首尾 6px 圆角相接，背景 `var(--bg-tertiary)`，描边 `var(--border)`，与 4 个 status badge / dashboard 控件读上去同质。

**I3. "查看详情" 触发一个 detail modal（context / worldbook / history / system）**——这是 **开发者调试台** 的形态，不是普通用户的行动签。token 圆弧 + 状态条 + tabs + JSON 预览全部裸露。

**I4. 对话模式面板（`.dialogue-panel`）同样圆角 + tab 列表**。圆角色头像、tab 列表、新建表单——是 chat SaaS 的"persona 切换"。

**I5. 输入行右端的 token 圆环 `.context-usage-mini` 显式写着"压缩上下文"**：这是 LLM 工程术语，不应该裸露在卷宗首页。

**I6. 输入行没有"行动签 / 笔触 / 印章" 收尾态**。按 send 之前没有"按印 / 盖章 / 落笔"动作；按 send 之后没有"已记入"反馈。

### 右栏（Sidebar / StatusBar / Geography / QuestLog）
**R1. 右栏 264px 宽，是 dashboard 控件堆**。三段式 `StatusBar`（角色 + 时间 + 心情条）+ `GeographyPanel`（地理环境 / 树状图 / AI 地图 / 列表 / 添加地点）+ `QuestLog`（重要活动 / 冒险摘要 / 写回出口 / 写回 button），每一段都长得很"产品"。

**R2. `StatusBar` 仍然带 "User" placeholder 与 "U" 字母占位圆**。`playerName || '未命名'` 与 `U` fallback 是开发期字段裸露；气质上像 Notion 模板而不是档案。

**R3. 心情色条是 `linear-gradient` 出来的暖色 fill**。是情绪 spectrum 控件，不是墨水/朱批。

**R4. `GeographyPanel` 头部的 "体验上下文 / 地理环境" 仍是 SaaS kpi 双行**——"experience context" 是产品 label，"地理环境" 是 H2。下方 "0 顶级 / 0 从属 / 0 已描述" 是 3 联 kpi 数字 + 单位，仍然 dashboard 形态。

**R5. `GeographyPanel` 的 toolbar 还是 "树状图 / AI 地图 / 列表" 三 tab + 一个 primary 添加按钮**。tab 圆角 8px + 描边 1px + 11px 字号，是 figma 设计系统 style。

**R6. `QuestLog` 顶部"重要活动" / `adventure-summary` 卡片仍是 10px 大写 kicker + 13px 标题 + 边框卡片**。"本段冒险总结" + "Adventure Exit" 写英文 + "写成我的版本 / 整理成分镜" 两个 primary 按钮，是产品面板，不是案卷边注。

**R7. `QuestLog` 末尾 "查看记录 / 记录活动" 一对 mini-btn 仍然是 dashboard 控件**。"记录活动" 打开 modal → 又是 460px 圆角 modal + tab + 时间日期 input + 4 色 type-selector + relation 按钮组。

**R8. 右边整体没有任何"案号、卷次、骑缝、归档状态"等档案语义**。卷宗应自带"案号 / 当下日 / 状态（开卷 / 在档 / 已归档）"信息，但目前右栏像 Notion 模板。

### 角色 / 地理 / QuestLog 内部
**C1. 角色详情 modal（StatusBar 内 `showDetail`）是 420px 圆角 modal + 顶部 tab + 标签表单 + 性格 tag + 心情 6 色按钮 + textarea**——这是 **RPG maker 角色卡**，不是卷宗。`importFromJSON` 还让用户粘 JSON。

**C2. `GeographyPanel` 内 `addLocation` 新建地点仍然是 5 个普通 `<input>` + `<select>` + 描述 textarea + "删除地点" 红色按钮**，没有地点卡的"印章 / 编号 / 隶属" 字段。

**C3. `QuestLog` 内 `trigger-panel` 仍写 "Adventure Exit" 英文 + "本段冒险总结" + "写成我的版本" + "整理成分镜" 双 button**。"Adventure Exit" 英文 + 3 行 trigger 状态 + 状态 chip + 草稿 card 全部是产品 pattern。

**C4. 角色 / 地点 / 活动 三个 modal 样式互相之间**不一致：StatusBar modal 是 420px / QuestLog modal 是 460px / 输入区 detail modal 是 600px。**三种圆角 modal 同时出现在体验页**，是"接进来的现成组件"痕迹。

### 背景与空白利用
**B1. 背景是 `<CharacterBackdrop>`（右中央立绘）+ `<radial-gradient>` rose/amber 角落 + 180° 深色渐变**。pass1 截图能看到：左侧一条 4px rose 边框 + 大块米色 + 右侧立绘 + 角落两个小 radial——背景在 2D 平面"撒了三个色斑"，没有 3D 深度，没有案卷桌面感（没有"桌面 / 木纹 / 印章痕迹 / 纸纤维 / 装订线"的任何 1 项）。

**B2. 1280 视口下，主区占满中央 720px+ 宽度，但承载内容只有顶部 80px（卷宗标题）+ 底部 64px（输入栏）= 144px**，**中央近 480px 是空纸**。空白利用率 ≈ 19%，远低于体验页目标密度（70%+）。

**B3. 主区与右栏之间没有"接缝"语义**。它们之间是一条 18px gap + 各自身自带的描边 + 各自 14px 圆角 clip-path，**两块独立 surface 相邻摆放**，没有共享"案卷展开"的语义。

**B4. 顶栏：`<aside class="quick-notes-rail">` 是一个悬浮在右侧中部的 48px 圆角 icon**，单条 icon + 极小 tooltip（title="打开速记"）。**没有顶部档案菜单 / 没有案号 / 没有在场人物条 / 没有时间戳**。

**B5. 移动端断点只是堆叠**：`@media (max-width:980px)` 把 sidebar 退化为 `position: static; top: auto; max-height: none`，主区与右栏直接堆叠成一列，**没有专门的紧凑布局**。现状移动端会非常糟。

### 总体
**X1. 上一轮 5C v3.6 改成了 "p5r Confidant panel"（左 4px rose hinge + 6px 硬偏移 ink shadow）**，在 /writing 风格统一里是好的，但被直接平移到 /experience 主区，**没有跟"卷宗"语言联动**——rose 4px hinge 是"角色"语义，套到对话区是"角色正在说话"，可读；但输入区却没接 rose 收尾色，**rose hinge 在主区左边独立飘着**。

**X2. 上一轮 v2 "卷宗方向"只在右栏上贴了"卷宗" ::before 标签 + 6px 左 装订虚线 + 卷宗 纸面**。**没有把卷宗语言推到主区**，导致卷宗只活在了右栏。

**X3. "卷宗语言" 与 "对话 SaaS 语言" 在同一页面共存**——右栏是卷宗、主区是空白 + chat、底部是 chat 输入栏、顶栏是 SaaS dropdown。**没有统一语言 = 没有气质**。

---

## 2. 强方案 A — 现场记录本

**主区比喻**：摊开的现场记录本 / 推理工坊的工作纸。

### 主区如何处理空白
- 把主区改成 **book spread 双开页**（左 = 案号 + 在场人物 + 当下时间 + 任务小条 / 右 = 主体叙事流）。
- 空白部分填入 **"现场概览"** 6 件套：案号（generated uuid short 8 chars）/ 卷次（第 N 次冒险 / 数字）/ 当下时间（接 writing-time 的 era/year/month/day + 时辰）/ 在场人物（hero 头像横排 + GM 占位）/ 当前地点（from geography）/ 当前任务（from quest log）。
- 主区中央不再"空"，而是 **像摊开的笔记本**：左侧 narrow 索引列（角色 / 地点 / 任务）+ 右侧宽正文流。
- 主区背景换为 **纸纤维 multiply**（`is-archive-paper` 现成 class），加 14px 左侧 装订线（rose 4px 装订条 + 3px gold 装饰线，跟主区顶部 notch 风格统一），右侧边缘 1px soft 毛边。

### 输入区如何去聊天工具感
- 改名为"**落笔**"，按钮改名为"**记入**"（沿用 plotJournal / questLog 的"记入"动词，与"采纳正文"等用语一致）。
- 输入框去边框：底边 1px ink，无背景，像 notebook 横线下方留白。
- 右端放"**今日已记** N 段"小计数 + "**落笔 / 暂停 / 撤回到草稿**"三档 chip，不再放 token 圆环。
- 上方 quick-actions 改为"**继续 / 场景 / 对话 / 心理**" 4 个手写风格 chip + 一支静态 笔刷 icon 在最左；chip 不用 bg-tertiary，用 archive-paper-soft + gold 描边，0 圆角。
- "查看详情 / 对话模式" 折叠成 **"档案员 / 剧本家"** 两档抽屉入口，不再用 modal。

### 右栏内部 dashboard 残留如何分期处理
- **Phase 1（必做，本轮）**：把右栏改名为"**案卷索引**"；StatusBar 改名为"**在场人物**"；GeographyPanel 改名为"**地点卡**"（顶部加 archive 印记色，cards 用 archive 1px gold 描边）；QuestLog 改名为"**事件卷**"（顶部去掉 "重要活动" + "Adventure Exit" 英文）。
- **Phase 2（下一轮）**：用 --figure-bbox 区域把右侧三个 section 收成可抽出 **档案夹 tab**（人物 / 地点 / 事件），默认折叠，只露一个 section。
- **Phase 3（再下一轮）**：把 status-bar 心情色条改成"墨水浓度" 滑动条；把 questLog 的"记录活动"按钮改为"**记入事件**"，点开是 **右侧抽屉**（不再是 modal），抽屉内是时间线 + 单行 input + 印章。

### 需要改的文件
- `src/pages/Experience.vue`（主结构、命名、ID、quick-actions 重排、空白填充 6 件套）
- `src/components/GamePanel.vue`（avatar column 改成左侧 narrow 索引；"思考过程"details 改成 手稿边注 `<aside>` 折叠；正文流加 notebook 横线 + 装订；空状态显示"案号 + 现场概览"）
- `src/components/InputArea.vue`（输入框去边框；按钮改名"落笔/记入"；quick-actions 改成 chip；token 圆环换成"今日已记 N 段"）
- `src/components/StatusBar.vue`（顶部 label 改"在场人物"；心情色条改名 + 改样式；detail modal 改为右侧抽屉，不改业务字段）
- `src/components/geography/GeographyPanel.vue`（顶部 label 改"地点卡"；toolbar 改 archive 印章 chip；location-card 加"编号 / 隶属"角标）
- `src/components/QuestLog.vue`（顶部 label 改"事件卷"；trigger-panel 改名为"本卷推进出口"；"Adventure Exit" → 移除英文；"记录活动" 按钮改"记入事件"；modal 改抽屉）
- `src/styles/themes/kao.css`（新增 `.experience-folio`、`notebook-rule`、`.ink-stamp`、`.archive-tab` 几个 kao 域内通用类；不要新增全局 utility）

### 不碰哪些文件
- `src/stores/gameStore.js`、`src/services/worldbookContextBuilder.js`、`src/services/generation*`、`server/`
- `src/services/playableWorldEntry.js`（不重新引入 `/opening` 入口）
- `src/router/*`（不动路由表）
- `src/components/Character.vue`、`src/components/SessionPicker.vue`（这两个独立组件，不动）
- `src/components/MechanismPanel.vue`、`src/components/MilestoneModal.vue`（这两个是机制弹窗，不动结构；只在父层 z-index 不冲突即可）
- `src/composables/*`（不动 composable 行为）
- 不改 store 的 `getAdventureTriggerState` / `latestPlotJournalEntry` 等业务方法名
- **绝不**在 `main.css` / `kao.css` 之外新增全局选择器；所有新类必须 `.theme-kao .xxx` 前缀

### CSS scope 安全策略
1. **所有改写放在 `Experience.vue` 的 `<style scoped>` + 子组件的 `<style scoped>`**。组件 scoped 给每一个选择器加 `[data-v-xxx]` 属性选择器，**天然防泄漏**。
2. 共享视觉元素（卷宗 6 件套 / notebook 横线 / 装订线 / 印章）通过 **`<FolioSurface>` 已有的 `.theme-kao .is-folio` / `.is-archive-paper` 工具类复用**，**不**新建全局类。
3. 必要时在 `kao.css` 的 `@layer kao` 内新增条目，**只允许** `.theme-kao .experience-xxx` 选择器，不写裸类名。
4. **不**用 `:deep()` 改写子组件内部样式（这是上一轮 load regression 的主因之一——`:deep()` 命中子组件 scoped 范围失败 → 整页 fallback → 重新加载）。
5. **不**用 `!important`；上一轮 5C 中用 `!important` 仅在 `text-transform` 上，**新代码不允许**。
6. 关键样式（`.game-page`、`.game-main-shell`、`.sidebar`、`.input-area`）由 `Experience.vue` 的 scoped 提供 **主源**，kao.css 只做 **token 注入**（如字体 / 背景色），不抢尺寸 / 不抢 transform。
7. 改完任何 component 后必须自检 `grep "scoped" src/components/InputArea.vue` 等，**确保 scoped 标记未丢失**。
8. **移动端断点**保留在 `Experience.vue` 内部 @media，不写回 kao.css；kao.css 继续做桌面端 token 注入。

### 截图验收标准
- 主区 1280 视口下空白利用率 ≥ 65%。
- 主区左侧能看到 **4px rose 装订线 + 3px gold 装饰线**（与右栏卷宗风格统一）。
- 6 件套任意一项缺失即不合格。
- 输入框 0 圆角、0 描边、底边 1px ink 可见。
- "落笔 / 记入" 文字出现，且与 plotJournal / questLog 既有"记入"动词一致。
- 右栏三个 section 顶部 label 全部中文，无英文。
- "Adventure Exit" 英文必须消失。
- 不允许出现 `0 顶级 / 0 从属 / 0 已描述` 这种 3 联 kpi。
- 上一轮回归检查：刷新 `/experience` 一次 + 切换到 `/writing` 再切回 `/experience` 一次，**页面必须在 1s 内稳定加载，无 fallback 闪烁**。

---

## 3. 强方案 B — 调查桌面

**主区比喻**：警探/调查员的桌面——主区像摊开的案件图板，右栏像一组案件便签，底部像便签本。

### 主区如何处理空白
- 把主区改成 **case board 案件图板**：
  - 顶部一条 **案件带**（案件号、案发日、案发地点、状态条 chip 4 档：开卷 / 在档 / 待结 / 已归档）
  - 中部 **照片墙 / 物证墙 / 证词墙**（用 tab 切换，但 tab 是 4 个不规则剪贴感 tag，贴在案件带下方）
  - 案件带下方 + tab 右侧是 **主角笔记区**（即对话流）
  - 主区右下角是 **印章位置**（圆形 ink-stamp 容器，hover 揭示"GM 笔迹" / "我"等身份）
- 空白由"案件带 + 物证墙"填满，**不再有"中央空纸"**。
- 主区背景用 **桌面纹理**（wood-like subtle pattern via radial-gradient + 1px grain），与右栏的"案卷便签"形成"桌面 vs 便签"对比。

### 输入区如何去聊天工具感
- 改名为"**便签本**"，输入框像便签横线（5px 下边一条 ink 横线 + 上方 0 描边）。
- 按钮改名为"**钉入案件**"或"**粘到图板**"（保留一个动词，但避开"发送"）。
- 上方 quick-actions 改成 **4 张便签**（红 / 黄 / 蓝 / 绿 4 色便签，每张是一个 quick action），便签是 clip-path 撕角形 + 1px drop-shadow。
- 不显示 token 圆环；显示 **"今日已钉 N 张"** + **"案件带编号"**。
- 不放"查看详情 / 对话模式"——这两个入口下沉到 **顶部"档案员 / 剧本家"两个 chip**。

### 右栏内部 dashboard 残留如何分期处理
- **Phase 1（必做）**：把右栏改为"**桌面便签**"：便签 1 = 在场人物（手写卡片，便签样式）、便签 2 = 地点卡（手写卡片，便签样式）、便签 3 = 事件卷（手写卡片，便签样式）。三张便签错位叠放（pin 钉效果），不是垂直堆叠。
- **Phase 2（下一轮）**：便签可拖拽（不重写 store，只在 view 层用 draggable CSS + 位置 cache），便签背面可写"案件备注"。
- **Phase 3（再下一轮）**：便签可"钉到"主区图板中央（沿用 input "钉入"动作），形成"动态证物墙"。

### 需要改的文件
- 与方案 A 完全相同（`Experience.vue` / `GamePanel.vue` / `InputArea.vue` / `StatusBar.vue` / `GeographyPanel.vue` / `QuestLog.vue` / `kao.css`）。
- 差异点：
  - `Experience.vue`：用"案件带"组件（内联）替换掉方案 A 的"6 件套"
  - `GamePanel.vue`：对话流移到"证词墙" tab 内
  - `InputArea.vue`：4 张便签（clip-path 撕角形）替换方案 A 的 4 个 chip
  - `GeographyPanel.vue` / `QuestLog.vue` / `StatusBar.vue`：用便签卡片样式替换 archive 卡片样式

### 不碰哪些文件
- 同方案 A：不动 store / service / 路由 / `Character.vue` / `SessionPicker.vue` / `MechanismPanel.vue` / `MilestoneModal.vue` / `composables/*`。
- **不**改业务字段名 / 业务方法名。

### CSS scope 安全策略
- 与方案 A 完全一致。
- 唯一差异：便签 4 色用 `--archive-rose` / `--archive-gold` / `--archive-olive` / `--archive-photo`，**全部走 token**，不写死 hex。
- 撕角 clip-path 写在子组件 scoped 内，**不**写在 kao.css（避免全局副作用）。

### 截图验收标准
- 主区顶部有"案件带" 4 字段（案号 / 日 / 地 / 状态）一眼可读。
- 主区中部 tab 是 4 张不规则便签（4 色），撕角可见。
- 输入区 4 张便签的颜色与主区 tab **不重复**（避免"4 张黄便签"）。
- 主区右下角有圆形 ink-stamp 容器（hover 揭示身份）。
- 任何 input/button 0 圆角，无 chat SaaS 形态。
- 不出现 "User" placeholder（"User" 必改为"我" / "主角" / 角色名）。
- 不出现 3 联 kpi（地理 / quest 都改为便签形式）。
- 上一轮回归检查同方案 A。

---

## 4. 强方案 C — 对话舞台

**主区比喻**：剧场 / 视觉小说舞台——主区是表演区，右栏是后台 / 档案夹。

### 主区如何处理空白
- 把主区改成 **剧场舞台**：
  - 上方 30% 是 **舞台布景区**（主立绘 + 雾化背景 + kicker + statusLine，沿用 `<CharacterBackdrop>`）
  - 中部 50% 是 **对白区**（左侧"对白面板" + 右侧"舞台动作面板"，双栏：左 = 角色对白 / 右 = 旁白与动作）
  - 下方 20% 是 **决策 / 行动栏**（无 input，而是 4 个 行动 chip，每 chip 是角色化动作选项）
- 空白由"舞台布景 + 旁白面板"填满。
- 角色立绘不再是右中央钉死，而是 **随当前发言者切换**（speaker-thumb / speaker-action / speaker-emote 三档切换，drop-shadow 加强）。

### 输入区如何去聊天工具感
- 改名为"**行动签**"，输入框是 **2 行 textarea**（不暴露单行 input 形态）。
- 按钮改名为"**投出**"（投出 / 投放，戏剧化）。
- 上方 quick-actions 改为"**我选择**" 4 chip：行动 / 言语 / 沉默 / 道具，与游戏术语一致。
- 不显示 token 圆环；显示"**当前对白轮次 N / M**" + **"对白窗口剩余 X 段"**。
- "查看详情 / 对话模式" 改为 **后台抽屉**入口（drawer from right），抽屉内是"档案夹"，沿用 kao.css 的 `.is-folio` 类。

### 右栏内部 dashboard 残留如何分期处理
- **Phase 1（必做）**：右栏改为"**后台档案夹**"：3 段人物 / 地点 / 事件全部默认折叠为 **档案夹 tab**（用 as-archive-strip 风格，-3deg rotate），只在 hover 或点击时"抽出"成 dossier drawer（drawer from right，width 360px）。
- **Phase 2（下一轮）**：抽屉内 3 个 section 改为 **手稿边注**（不是卡片），与主区剧场对白区同 paper-soft 背景。
- **Phase 3（再下一轮）**：抽屉可"贴"到主区对白区右侧（toggle 行为），形成"主区展开后是一份完整剧本页"的视觉。

### 需要改的文件
- 与方案 A/B 完全相同。
- 差异点：
  - `Experience.vue`：上方 30% / 中部 50% / 下方 20% 三段布局
  - `GamePanel.vue`：双栏（对白 + 旁白）
  - `InputArea.vue`：2 行 textarea + "投出" 按钮
  - `StatusBar.vue` / `GeographyPanel.vue` / `QuestLog.vue`：全部走"档案夹"默认折叠，hover/click 抽出 dossier drawer

### 不碰哪些文件
- 与方案 A/B 一致。

### CSS scope 安全策略
- 与方案 A/B 一致。
- 唯一差异：dossier drawer 用 `<Teleport to="body">` 包裹（已有 inline-detail 范例），**但 CSS 仍写在子组件 scoped 内**，靠 class hook 接收。
- 抽屉动画用 `transform: translateX()` + `transition`，**不**用 `position: fixed` 配 `display: none/block` 切换。

### 截图验收标准
- 主区上方 30% 是立绘布景区，立绘可换（至少 2 档可见）。
- 主区中部 50% 是双栏对白（角色对白 / 旁白与动作），可读到。
- 主区下方 20% 是"行动签" input + "投出" 按钮。
- 不再有"对话模式 / 角色选择面板" modal。
- 右栏默认是 3 段档案夹 tab（-3deg rotate），hover 抽出 dossier。
- 不出现 chat SaaS 按钮（"发送" 必改为"投出"）。
- 不出现 token 圆环 / 圆角按钮 / 圆角 modal。
- 上一轮回归检查同方案 A。

---

## 5. 三方案对比矩阵

| 维度 | A 现场记录本 | B 调查桌面 | C 对话舞台 |
|---|---|---|---|
| 主区空白利用 | 案号 + 6 件套填满 | 案件带 + 物证墙 tab 填满 | 舞台布景 + 旁白面板填满 |
| 输入区气质 | 落笔 / 记入（最简单） | 钉入 / 粘到图板（最戏剧） | 投出（最游戏） |
| 右栏 | 卷宗三件套（最稳） | 桌面便签（最不像 SaaS） | 档案夹抽屉（最可抽） |
| 与 writing 区分度 | 中（仍偏纸面） | 高（桌面感与手稿页完全不同） | 中（剧场感） |
| 改动量 | 中 | 中-高 | 中 |
| 风险 | 低（最贴近现状） | 中（便签叠放需调试 z-index） | 中（双栏对话需重新设计） |
| 移动端 | 中（双栏需改） | 中-高（便签叠放移动端要堆叠） | 中（双栏移动端要改） |
| 回归风险 | 低 | 中 | 中 |

---

## 6. 推荐方案 + 理由

**推荐方案 A — 现场记录本**。

理由：
1. **最贴近已经走通的方向**。`kao.css` 中已定义 `--archive-paper` / `--archive-paper-soft` / `--archive-ink` / `--archive-gold` / `--archive-olive` / `--archive-rose` / `--archive-photo` 一套完整 token；`<FolioSurface>` + `is-folio` / `is-archive-paper` / `is-bookmark` / `is-archive-strip` 一套工具类已就位。**新方案不需要新增 token，不需要新增工具类，只需要复用**。方案 B / C 需要新增便签 4 色 token + drawer 工具类，工作量多 30%。
2. **改动量最小**。6 件套 + 卷宗 6 件套 + 输入区改名 / 输入行去圆角，都是逐行改写；不涉及布局大重构。方案 C 要把主区切成上 / 中 / 下三段，GamePanel 要从单栏变双栏，**风险最大**。
3. **对上一轮回归最友好**。方案 A 仍走 `.game-main-shell` / `.sidebar` / `.input-area` 既有 DOM 树，只改内部样式；scope 不会乱。方案 C 引入了 drawer + Teleport，**重新加载链路过长**，与 `current.md` 中"曾经因为 CSS scope 导致页面加载回归"明确冲突。
4. **气质上最像"案卷推进台"**。案卷 = 记录本（不是桌面、不是舞台）。与 `kao.css` 中"writing-page 是手稿页"语言形成对仗：**Writing 是手稿页，Experience 是记录本 / 案卷**。方案 B 的"调查桌面"偏黑色电影 / 刑事剧气质，与"虚构集"主线不完全契合；方案 C 的"对话舞台"偏视觉小说，**与 Writing 的写作导向冲突**（Writing 才是输出，Experience 是输入记录）。
5. **动词统一**。A 用"落笔 / 记入"，与 `plotJournal` / `questLog` / `adventureTriggers` 既有业务动词一致；B 用"钉入 / 粘到图板"，C 用"投出"，都需要新增业务动词映射，**会与 store 业务字段碰撞**。
6. **6 件套可逐步填**。案号 / 卷次 / 当下时间 / 在场人物 / 当前地点 / 当前任务，**每一项都是单一组件改造**，不像 B 那样需要"便签 4 色 + 撕角 clip-path + 钉 pin" 一组配套。

---

## 7. 实现优先级与切分

按 `docs/engineering/visual-alignment-workflow.md` "视觉切片"原则，本轮必做切片：

**切片 1（主区，4-6 小时）**：
- 主区 6 件套 DOM 注入（案号 / 卷次 / 当下时间 / 在场人物 / 当前地点 / 当前任务）
- 主区背景从 5C v3.5 单层 gradient → `is-archive-paper` multiply + 14px rose 装订线 + 3px gold 装饰线
- 主区空状态从空白 → 6 件套占满
- 主区右侧立绘：保留 `<CharacterBackdrop>`，**只**调整 `position` 让其与对话区有 ~40px 间距

**切片 2（输入区，2-3 小时）**：
- 输入框去边框 / 0 圆角 / 底边 1px ink
- "发送" → "记入" / "落笔" 按钮
- 顶部 4 chip 改成 archive chip（0 圆角 + gold 描边）
- 移除 token 圆环，改为"今日已记 N 段" + "案件带编号" chip
- "查看详情" / "对话模式" 下沉为顶部"档案员 / 剧本家"两 chip

**切片 3（右栏卷宗语言，4-6 小时）**：
- StatusBar 顶部 label → "在场人物"
- GeographyPanel 顶部 label → "地点卡"，卡片加 archive 印记色
- QuestLog 顶部 label → "事件卷"，移除 "Adventure Exit" 英文，"记录活动" → "记入事件"
- 三段内部样式 0 圆角 / gold 描边 / paper-soft 背景统一
- modal 改 dossier 抽屉（**仅 UI 层**，不动业务字段；**保守**地保留 modal，**仅**给一个入口让用户能选 modal 或抽屉）

**切片 4（动效与回归，1-2 小时）**：
- 主区 6 件套入场 stagger 0.04s
- 案件带状态 chip hover 时显示"开卷 / 在档 / 待结 / 已归档" 4 档 tooltip
- **回归测试**：刷新 /experience 一次、切换 /writing 一次再切回 /experience 一次，**1s 内稳定加载**

> 全部切片完成后，**保留** `<FolioSurface>` 工具类复用作为"档案便签 / 案号便签"等容器的兜底样式；**不**新增任何 `:deep()` 改写。

---

## 8. 不在本轮范围

- 不动 `src/stores/gameStore.js`
- 不动 `src/services/worldbookContextBuilder.js`
- 不动 `src/services/generation*`
- 不动 `server/`
- 不动 `AGENTS.md` / `docs/STATUS.md`
- 不动业务字段名 / 业务方法名
- 不重引入 `/opening` 入口
- 不动路由
- 不动 `Character.vue` / `SessionPicker.vue` / `MechanismPanel.vue` / `MilestoneModal.vue` / `composables/*`
- 不新增全局 utility class
- 不使用 `:deep()` 改写子组件
- 不使用 `!important`（除 5C 中既有的 `text-transform: none !important;` 一处保留）
- **不**只改右栏边框；本轮必须动主区 + 输入区 + 右栏三处

---

## 9. 验收信号

- 主区 6 件套一目了然，无大块空纸
- 输入区无 chat SaaS 控件
- 右栏 3 段均改 archive 语言，无 dashboard 残留
- "Adventure Exit" / "User" / 3 联 kpi / 圆角 modal / token 圆环 全部消失
- 刷新 /experience 1s 内稳定加载（无 fallback 闪烁）
- 切换 /writing 一次再切回 /experience 1s 内稳定加载
- 移动端 980px / 760px / 640px 三个断点布局成立（不堆叠成单列失控）
- 现有 passed 切片（卷宗方向右栏 / 顶部暗色 sidebar / `<CharacterBackdrop>` 右上）**不被破坏**

---

## 10. 截验收路径

- 桌面 1280：`docs/agent-runs/2026-06-19-ui-redesign-research/experience-v2-record-book-1280.png`
- 桌面 1440：`docs/agent-runs/2026-06-19-ui-redesign-research/experience-v2-record-book-1440.png`
- 移动 640：`docs/agent-runs/2026-06-19-ui-redesign-research/experience-v2-record-book-640.png`
- 移动 980：`docs/agent-runs/2026-06-19-ui-redesign-research/experience-v2-record-book-980.png`
- 空状态（无 user message）：`docs/agent-runs/2026-06-19-ui-redesign-research/experience-v2-record-book-empty-1280.png`
- 长对话（≥20 段）：`docs/agent-runs/2026-06-19-ui-redesign-research/experience-v2-record-book-long-1280.png`

---

## 11. 风险与回滚

- **风险 1（最关键）**：scope 失效导致整页 fallback。**应对**：所有改写保持 `<style scoped>` 完整；不在 kao.css 写 `!important`；不在子组件用 `:deep()` 改父组件。
- **风险 2**：上一轮 5C v3.6 rose hinge + 6px hard shadow 视觉指纹被冲掉。**应对**：rose 4px 装订线沿用 rose 色，6px hard shadow 改为 rose + gold 双色硬偏移（保留 3D 感），**视觉指纹不丢**。
- **回滚策略**：保留 5C v3.6 既有 scoped style 块，**新视觉仅叠加**，不当覆盖；若 1s 内加载失败，回滚到 5C v3.6 即可。

---

## 12. 总结

- **现状失败原因 ≥ 12 条**（F1-F6 / I1-I6 / R1-R8 / C1-C4 / B1-B5 / X1-X3 共 30 条）。
- **三个强方案 A/B/C 都可行**，气质上 A 最稳 / B 最不像 SaaS / C 最游戏化。
- **推荐 A**，理由：复用既有 token / 工具类 / DOM 树；改动量最小；对回归最友好；气质与 Writing 手稿页形成"输入记录 / 输出稿面"对仗。
- **实现分 4 切片**，每切片独立验收。
- **不**触碰 store / service / server / 路由 / 既有 passed 切片。
- **不**重引入 `/opening` 入口。

---

# IMPLEMENTER BRIEF DRAFT

> 下一轮 Claude Implementation Worker 可直接执行的中文 brief。
> 范围：仅 `/experience` 强视觉方向实施。
> 输出：6 张截图（1280 / 1440 / 980 / 640 / empty-1280 / long-1280）。
> 必读：`docs/agent-runs/2026-06-19-ui-redesign-research/UI-E1.report.md`。

## 上下文
当前 Experience 页（F-I-R-C-B-X 共 30 条缺陷）仍是"左空白纸 + 右档案柜 + 底聊天栏"的三段拼贴，卷宗语言只活在了右栏，主区大面积空白、输入区圆角聊天工具、右栏内部仍是 dashboard 残留。**5C v3.6** 在 writing 走通但平移到 experience 后与卷宗语言不联动。本轮要做的事：**让卷宗语言贯通主区 + 输入区 + 右栏**，把 Experience 改造成"现场记录本 / 案卷推进台"。

## 必须做（按切片顺序，4 切片）

### 切片 1 — 主区 6 件套 + 卷宗语言贯通（4-6h）
1. `src/pages/Experience.vue`：
   - 在 `.game-main-shell` 内、`<GamePanel>` 之前，**新增**一个 `<section class="record-folio" data-v-...>`，包含 6 件套：
     - **案号**：generated uuid short 8 chars（用 `crypto.randomUUID().slice(0,8)` 或现有 hash 函数；不要新增 store 字段，**纯 computed**）。
     - **卷次**：第 N 次冒险 = `gameStore.sessions.length`。
     - **当下时间**：从 `gameStore.writingTime` 读 era / year / month / day，**纯 display only**，不写回。
     - **在场人物**：横排 avatar 缩略图，从 `gameStore.encounteredCharacters` 读（**新字段不创建**），无数据时显示"?"占位（不显示 `U`/`A`）。
     - **当前地点**：从 `gameStore.worldMapState?.currentLocation` 读（**纯 display only**），无数据时显示"未进入"。
     - **当前任务**：从 `gameStore.goals` 读 active 目标，无数据时显示"未登记"。
   - 6 件套用 `display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px;`，每个 cell 0 圆角 / 1px gold 描边 / paper-soft 背景 / 10px 大写 kicker + 13px ink-soft 数值。
   - **顶部加一条案号条**（kicker "案卷" + 案号 + 卷次 + 状态 chip 4 档 placeholder "开卷"）。
   - 背景改用 `is-archive-paper`（kao.css 已有 class），主区左侧 14px rose 装订线 + 3px gold 装饰线（沿用 5C rose 4px hinge 思路，**保留**）。
2. `src/components/GamePanel.vue`：
   - **空状态**（`gameStore.messages.length === 0`）显示 6 件套，**不**显示对话区。
   - **有消息**时仍显示对话流，但 6 件套移到主区顶部成为"案卷带"，对话区在案卷带下方。
   - **不**改内部对话流结构（保留 v-html / 头像列 / 时间戳 / import-picked / 思考过程 details / 编辑区），但加 `is-archive-paper` 风格到外层。

### 切片 2 — 输入区去聊天工具感（2-3h）
1. `src/components/InputArea.vue`：
   - 输入框 0 圆角、0 描边、底边 1px ink 可见。
   - 按钮 `发送` 改名 `记入`（`aria-label` 同样改）。
   - 顶部 quick-actions 4 chip + "对话模式" 5 个按钮**全部改 archive chip**：0 圆角 + 1px gold 描边 + paper-soft 背景。
   - 移除 `.context-usage-mini`（token 圆环），改为 "今日已记 N 段" + "案件带编号" 两 chip。
   - 移除 `.info-btn`（扳手 icon），改为 "档案员" 顶部 chip，**点击**打开 `<details>` 折叠（**不**用 modal）。
   - 移除"对话模式" modal，**改为** `<Teleport to="body">` 抽屉，从右滑入，**内部**仍是原 modal DOM（**纯 UI 改造，不动业务逻辑**）。
   - **不**改 .dialogue-panel、.char-list、.add-char-section 内部结构（**纯 UI 改造**）。

### 切片 3 — 右栏卷宗语言贯通（4-6h）
1. `src/components/StatusBar.vue`：
   - 顶部 label `角色` 改名 `在场人物`。
   - 心情色条改名为"墨水浓度" 滑动条（**不**改业务字段，**纯 display**）。
   - 角色 placeholder "User" → "主角"（**纯 display**，不影响 store）。
   - 头像 fallback "U" → "?"。
   - detail modal 改 dossier 抽屉（**纯 UI 改造**）。
2. `src/components/geography/GeographyPanel.vue`：
   - 顶部 kicker `体验上下文` 改 `案卷索引`。
   - 顶部 H2 `地理环境` 改 `地点卡`。
   - "0 顶级 / 0 从属 / 0 已描述" 三联 kpi 改为"卷号 / 从属 / 已记"（**纯 display**，字段从 root / linked / described 沿用，label 改写）。
   - toolbar tab 改 archive chip。
   - location-card 右上角加"卷号"角标（用 `loc.order` 或 `loc.id` 末 4 字符，**纯 display**）。
3. `src/components/QuestLog.vue`：
   - 顶部 label `重要活动` 改 `事件卷`。
   - trigger-panel 内 kicker `Adventure Exit` 改 `本卷推进出口`（**纯 display**）。
   - "本段冒险总结" → "本段事件总结"。
   - "写成我的版本" → "整理成我的版本"（不动 `prose` 业务字段，**纯 label**）。
   - "整理成分镜" → "整理成事件分镜"（**纯 label**）。
   - "记录活动" 按钮改 `记入事件`；"查看记录" 改 `查看事件卷`。
   - modal 改 dossier 抽屉（**纯 UI 改造**）。

### 切片 4 — 动效与回归（1-2h）
1. 主区 6 件套入场 stagger 0.04s（每 cell 50ms 错开）。
2. 案件带状态 chip hover 显示 4 档 tooltip（开卷 / 在档 / 待结 / 已归档）。
3. 回归测试脚本（手动）：
   - 刷新 `/experience` 一次，**1s 内**稳定加载，无 fallback 闪烁。
   - 切换 `/writing` 一次再切回 `/experience`，**1s 内**稳定加载。
   - 切到 980px / 760px / 640px 三个断点，布局成立，不堆叠成失控单列。

## 必须不碰（硬约束）
- **不**动 `src/stores/gameStore.js`（包括字段名 / 方法名 / computed）。
- **不**动 `src/services/worldbookContextBuilder.js`。
- **不**动 `src/services/generation*`。
- **不**动 `server/`。
- **不**动 `AGENTS.md` / `docs/STATUS.md`。
- **不**重引入 `/opening` 入口逻辑（不调 `clearPlayableWorldEntryIntent` 之外的 entry 行为）。
- **不**改路由。
- **不**改 `src/components/Character.vue` / `SessionPicker.vue` / `MechanismPanel.vue` / `MilestoneModal.vue`。
- **不**改 `src/composables/*`。
- **不**新增全局 utility class（在 `main.css` / kao.css `@layer kao` 之外）。
- **不**使用 `:deep()` 改写子组件（**最关键**，防止上一轮 load regression 重现）。
- **不**使用 `!important`（5C 中既有的 `text-transform: none !important;` 一处保留）。
- **不**只改右栏边框（必须动主区 + 输入区 + 右栏三处）。

## CSS Scope 安全策略（必须执行）
1. **所有改写放在 `Experience.vue` 的 `<style scoped>` + 子组件的 `<style scoped>`**。组件 scoped 给每一个选择器加 `[data-v-xxx]` 属性选择器，**天然防泄漏**。
2. 共享视觉元素（卷宗 6 件套 / notebook 横线 / 装订线 / 印章）通过 **`<FolioSurface>` 已有的 `.theme-kao .is-folio` / `.is-archive-paper` 工具类复用**，**不**新建全局类。
3. 必要时在 `kao.css` 的 `@layer kao` 内新增条目，**只允许** `.theme-kao .experience-xxx` 选择器，不写裸类名。
4. **不**用 `:deep()` 改写子组件内部样式。
5. **不**用 `!important`；上一轮 5C 中用 `!important` 仅在 `text-transform` 上，**新代码不允许**。
6. 关键样式（`.game-page`、`.game-main-shell`、`.sidebar`、`.input-area`）由 `Experience.vue` 的 scoped 提供 **主源**，kao.css 只做 **token 注入**（如字体 / 背景色），不抢尺寸 / 不抢 transform。
7. 改完任何 component 后必须自检 `grep "scoped" src/components/InputArea.vue` 等，**确保 scoped 标记未丢失**。
8. **移动端断点**保留在 `Experience.vue` 内部 @media，不写回 kao.css。

## 截验收标准（必须满足）
- 主区 1280 视口下空白利用率 ≥ 65%（去掉输入栏 / 顶部栏后可视区域 / 主区 6 件套占用像素）。
- 主区左侧能看到 **4px rose 装订线 + 3px gold 装饰线**（与右栏卷宗风格统一）。
- 6 件套任意一项缺失即不合格。
- 输入框 0 圆角、0 描边、底边 1px ink 可见。
- "记入" 文字出现（取代"发送"），且与 plotJournal / questLog 既有"记入"动词一致。
- 右栏三个 section 顶部 label 全部中文，无英文。
- "Adventure Exit" 英文必须消失。
- 不允许出现 `0 顶级 / 0 从属 / 0 已描述` 这种 3 联 kpi（地理改写为"地点卡"后应展现"卷号 / 从属 / 已记"）。
- 上一轮回归检查：刷新 `/experience` 一次 + 切换到 `/writing` 再切回 `/experience` 一次，**页面必须在 1s 内稳定加载，无 fallback 闪烁**。

## 输出（必交付）
- 6 张截图：
  - `docs/agent-runs/2026-06-19-ui-redesign-research/experience-v2-record-book-1280.png`
  - `docs/agent-runs/2026-06-19-ui-redesign-research/experience-v2-record-book-1440.png`
  - `docs/agent-runs/2026-06-19-ui-redesign-research/experience-v2-record-book-980.png`
  - `docs/agent-runs/2026-06-19-ui-redesign-research/experience-v2-record-book-640.png`
  - `docs/agent-runs/2026-06-19-ui-redesign-research/experience-v2-record-book-empty-1280.png`（无 user message 状态）
  - `docs/agent-runs/2026-06-19-ui-redesign-research/experience-v2-record-book-long-1280.png`（≥20 段对话）
- diff 摘要（哪几个文件 + 行数）
- 回归报告（1s 内稳定加载是否成立）

## 实施顺序（强制）
1. 切片 1 → 截图 1280 + 1440 → 验收
2. 切片 2 → 截图 1280 + 640 → 验收
3. 切片 3 → 截图 1280 + empty-1280 + long-1280 → 验收
4. 切片 4 → 截图 980 → 回归验收

每切片独立完成 + 截图 + 验收，**不要**一次改完所有切片再截图。

---

**说明**：本应在 sandbox 外将上述内容写入 `docs/agent-runs/2026-06-19-ui-redesign-research/UI-E1.report.md`，但本环境 Bash 只读、Edit 需要先有文件存在且首次创建需授权——没有可用的写入通道。请将本回复全文落盘到该路径以落地此 report。