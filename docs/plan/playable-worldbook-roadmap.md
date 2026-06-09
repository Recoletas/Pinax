# 可玩的世界书路线图

> 当前产品主线：Pinax 是“可玩的世界书”。用户先选择一个有地图、势力、历史和记忆的世界，由 AI GM 推动冒险；冒险沉淀成剧情日志后，再改写为小说章节、素材、分镜或后续改编出口。

## 1. 定位

Pinax 不再对外表达为“文字游戏 + 写作工具 + 世界书 + 地图 + 画布”的并列功能集合。主叙事收口为一条漏斗：

```text
选择世界
  -> 进入冒险
  -> 形成剧情日志和素材
  -> 写成我的版本
  -> 整理成分镜或改编出口
```

这条路径解释三个差异点：

- 相比普通 AI 聊天：Pinax 有世界书、地图、势力、规则和长期上下文。
- 相比 AI Dungeon 类文字游戏：Pinax 的冒险结果能沉淀为可编辑作品。
- 相比纯写作工具：Pinax 不是从空白页开始，而是从“玩一个世界”开始。

短期策略采用“沉浸世界观 + AI GM 控制”。社区 fork 和生视频都后置，作为漏斗跑通后的加速器和出口能力。

## 2. 已确认事实

这份路线图吸收 2026-06-08 代码审计结论，后续实现必须以这些事实为准：

- 不改路由、文件名、Pinia store key、localStorage key 或旧 URL。`体验`、`世界书` 等实现层名称保持不动，只改用户可见标签和营销话术。
- `server/data/worlds/*/world.json` 已有 5 个 RPG 原始世界：`仙侠世界`、`奇幻大陆`、`末日生存`、`科幻星际`、`都市生活`。
- 这 5 个 `world.json` 目前没有接入 `worldStore.entries` / `structuredSettings` 世界书链路，`narrative.init` prompt 也不会直接读取它们。
- 现有 5 个 `world.json` 缺少“可玩的世界书”验收所需内容字段：6-10 个事件、3-5 个势力、1 个开场困境、3 个改写方向、章节/剧情段落。
- “近未来殖民地”与现有 `科幻星际` 高度重叠，“都市异闻”与现有 `都市生活` 高度重叠；短期只新增 1 个真正新世界，另外 2 个优先复用/改造现有世界。
- `Experience.vue` 使用 `gameStore`；`experienceStore.js` 当前视为待确认的孤儿 store，不作为新状态入口。
- `gameStore` / `worldStore` 已覆盖一部分 GM 轻状态和上下文注入能力，Stage 3 不能另建第二套状态源。
- `StatusBar.vue`、`QuestLog.vue` 对 `gameStore` 字段敏感；任何状态字段新增都要拆小阶段并加回归。
- 玩到写的 AI 调用必须走现有 `src/services/generation*` 任务层，不直接 `fetch` provider。

## 3. 非目标

当前阶段不做以下事项：

- 不把短剧/生视频作为主功能优先级；它只作为分镜完成后的实验出口。
- 不先做社区、公开 fork、排行榜或内容市场。
- 不重写世界书 schema、地图引擎或统一生成任务层。
- 不增加新的独立工作区；优先复用体验页、世界书、素材、卡片画布和写作页。
- 不要求第一版具备完整 RPG 系统、战斗系统或复杂数值模拟。
- 不新增第二套长期记忆或 GM 状态源。

## 4. 阶段计划

### Stage 0 — 文档定位同步

状态：首轮已完成，仍作为后续变更的前置检查。

目标：所有文档 surface 都能在 5 分钟内看出当前主线是“可玩的世界书”，而不是旧的功能集合。

交付：

- `docs/STATUS.md` 写清当前阶段、下一步和阻塞点。
- `docs/PLAN.md` 保留当前主线、近期重点和非目标。
- `docs/plan/playable-worldbook-roadmap.md` 作为本专题路线图。
- `README.md` / 用户手册的 elevator pitch 指向“选择世界 -> 开始冒险 -> 写成作品”。

验收：

- 新会话读 `docs/PLAN.md` 和本文件即可知道当前优先级。
- 旧“AI 辅助小说 + 文字冒险”的并列说法不再作为主叙事。

Review gate：

- 文档同步后先停下确认，不带代码改动强行进入后续阶段。

### Stage 1 — 入口话术与首屏路径

状态：首轮已落地，后续只做小修。

目标：用户进入首页/体验页时知道自己不是在“空白聊天”，而是在进入一个世界。

交付：

- 首页 hero 改为“先进入一个世界，再写出你的版本”。
- 体验页展示“可玩的世界书”启动带，路径为：选择世界 -> 开始冒险 -> 写成作品。
- 没有世界书时，引导进入快速导入和种子世界，而不是只弹出“请选择世界书”。
- 体验页提供“进入这个世界”按钮，负责创建/切换当前世界书会话。
- 功能页只改用户可见标签和 CTA，不改路由、store key、localStorage key 或文件路径。

复用：

- `src/pages/Home.vue`
- `src/pages/Experience.vue`
- `src/pages/WorldBookQuickImport.vue`

风险：

- 老用户可能仍按“体验/世界书/写作”旧入口找功能。

缓解：

- 保留旧入口结构，只在文案中增加“冒险”“可玩的世界书”“种子世界”等新标签。

验收：

- 新用户 30 秒内知道第一步是选世界。
- 体验页有明确“进入这个世界”动作。
- UI 不把生视频或短剧作为主 CTA。

Review gate：

- 跑 UI 契约测试、视觉测试、全量测试和构建；确认首屏路径没有破坏旧路由。

### Stage 1.5 — RPG world.json 到世界书的迁移/适配

状态：已完成首轮实现。

目标：先把现有 `server/data/worlds/*/world.json` 接入世界书 pipeline，再谈种子世界内容生产。

交付：

- 已审计 5 个 `world.json` 的实际字段：locations、npcs、items、quests/events、rules、opening 等。
- 已新增只读转换层，将 RPG world 数据转换为世界书导入 payload：
  - `worldDescription`
  - `writingStyle`
  - `forbidden`
  - `entries`
  - `groups`
  - 必要的 `structuredSettings` 兼容字段
- 转换规则优先适配现有世界书导入三路径，不发明不可迁移的新 schema。
- 快速导入里标明来源：`RPG 预设适配` / `首轮种子世界`。
- 明确弃用或保留 `experienceStore.js` 的决策；在没有证据前不把它作为新入口。

建议实现落点：

- 新服务：`src/services/worldbookPresetAdapter.js`。
- RPG preset 列表：`src/services/rpgWorldbookPresets.js`。
- 入口复用：`src/pages/WorldBookQuickImport.vue`。
- 测试：`src/__tests__/worldbookPresetAdapter.test.js` 覆盖 5 个 world fixture 的字段映射。

风险：

- `world.json` 与现代世界书结构不是同一套模型，直接导入会产生空泛条目或重复条目。

缓解：

- 先做只读转换和预览测试，不直接改原始 `server/data/worlds`。
- 一次只接一个代表世界跑通，再批量适配其余世界。

验收：

- 至少 1 个现有 `world.json` 能转换为可导入世界书，并在体验页 1 轮生成中被引用。
- 5 个现有 world fixture 均能通过转换测试，不因缺字段崩溃。
- 三条世界书导入路径仍可用：预设导入、小说文本导入、说明驱动 AI 生成。

Review gate：

- 转换层完成后停下 review 数据质量；不在同一阶段追加 GM 状态或 trigger。

### Stage 2 — 种子世界内容生产

状态：进行中，首轮数据质量补齐已落地，待手动冒险 review。

目标：解决冷启动，不要求用户先写设定。

策略：

- 不从零造 3 个新世界。
- 新增 1 个真正差异化世界：`边境王国`。
- 复用/改造 2 个现有世界：
  - `科幻星际` -> 近未来殖民地/太空殖民困境。
  - `都市生活` -> 都市异闻/城市调查困境。
- 其余现有世界先保留为候选，不进入首轮主推。

每个首轮种子世界需补齐：

- 世界概述。
- 核心冲突。
- 3-5 个势力。
- 5-8 个重要地点。
- 6-10 个可触发事件。
- 1 个开场困境。
- 3 个改写方向：小说章节、分镜、扩展世界。
- 可选章节/剧情段落，用于后续日志和 trigger。

首轮实现落点：

- `src/services/seedWorldbookPresets.js` 统一维护 3 个主推世界，不再把长内容硬编码在页面里。
- `边境王国 · 雾潮暮湾`：新增 6 个地点、4 个势力、8 个事件、3 个任务出口。
- `都市异闻 · 北岸旧档`：从现有都市题材复用方向升级为调查/关系网世界，新增 5 个地点、4 个势力、8 个事件、3 个任务出口。
- `近未来殖民地 · 赫利俄斯`：从现有科幻题材复用方向升级为殖民地任务流，新增 6 个地点、4 个势力、8 个事件、3 个任务出口。
- `src/__tests__/seedWorldbookPresets.test.js` 锁住 Stage 2 内容质量下限。

验收：

- 至少 3 个世界能在体验页直接进入冒险，不需用户填表。
- 每个世界能支撑 10-15 分钟体验。
- 每个世界至少 6-10 事件 + 3 改写方向。
- AI GM 第一轮或第二轮能引用该世界的地点、势力或规则。

Review gate：

- 先做 1 个完整世界验证流程，再量产另外 2 个。
- 3 个世界达标后再进入 Stage 3，不用内容缺口去测试状态系统。

### Stage 3a — GM 轻状态字段

目标：让“世界会记住玩家做了什么”成为核心体验，但不新建第二套状态。

复用优先：

- 当前地点：优先复用 `gameStore.worldMapState.currentCountry/currentCity/currentScene` 或相邻字段。
- 当前目标：优先复用 quest log / activities；确认无合适结构后再新增 `goals[]`。
- 已遇角色：确认现有活动/消息是否可推导；必要时新增 `encounteredCharacters[]`。
- 阵营关系：新增 `factionRelations: { [factionId]: number }`。
- 关键选择：新增或复用 `keyChoices[]` / milestone 结构。
- 剧情日志：Stage 3b 再新增 `plotJournal[]`，本阶段只预留兼容字段。

边界：

- 不绕开 `gameStore`。
- 不让 `experienceStore.js` 成为并行状态源。
- 不在世界书条目里写 runtime 状态。

风险：

- `StatusBar.vue` 深度 watch 和 `QuestLog.vue` activities 读取容易被字段变更误伤。

缓解：

- 只新增字段，不重命名既有字段。
- 加 `gameStore` session persistence 测试。
- 加 `StatusBar` / `QuestLog` 关键渲染回归。

验收：

- 10 轮冒险后能读到当前地点、目标、已遇角色、关键选择中的至少 3 类状态。
- 切换会话/世界不会串用上一世界 runtime 状态。

Review gate：

- 这是高风险阶段。完成后必须单独停下 review 状态结构和 UI 回归，再进入日志聚合。

### Stage 3b — 剧情日志聚合器

目标：把冒险过程压缩为后续写作/分镜 trigger 可消费的结构化日志。

交付：

- 每 8-12 轮自动生成一次“本段冒险总结”。
- 日志结构建议：
  - `chapterId`
  - `summary`
  - `participants`
  - `locations`
  - `keyChoices[]`
  - `unresolvedHooks[]`
  - `sourceMessageIds[]`
- GM prompt 只注入世界书摘要、当前地点/势力、最近 5 轮对话和轻状态，不塞全量世界书。
- 摘要优先存入 `gameStore.plotJournal[]` 或同等 session runtime 字段。

服务约束：

- 复用现有 context builder / generation task layer。
- 使用 mock LLM 测试 prompt 模板和状态更新，不靠纯手测。

验收：

- 玩 10 轮后，系统能生成“你在这个世界经历了什么”的摘要。
- 摘要能稳定保留谁、在哪、做了什么、为什么。
- GM 回复稳定引用世界书条目，而不是泛泛续写。

Review gate：

- 日志结构稳定后再接 Stage 4 trigger；否则 trigger 会把脏数据写成作品。

### Stage 4 — 玩到写触发点

目标：补上漏斗最大断点。用户玩完一段后，下一步不是“继续聊”，而是“开始写”。

MVP 先做 2 个 trigger：

- `写成我的版本`：当前剧情日志 -> 小说章节草稿。
- `整理成分镜`：关键剧情节点 -> 卡片画布 / 分镜草稿。

后置 trigger：

- `生成另一种结局`：失败或分歧后再做。
- `扩展这个世界`：把新角色、新地点、新事件写回世界书草稿，等 Stage 4 MVP 数据稳定后再做。

触发时机：

- 每 8-12 轮 GM 输出后，显示“本段冒险总结”以及 2 个 MVP 按钮。
- 会话结束或用户暂停时，显示“保存为作品草稿”。
- 失败结局/关键选择后的分支 trigger 暂不作为 MVP 验收项。

AI 调用策略：

- 必须走现有 `src/services/generation*` 任务层。
- 新增 task type / prompt 模板时集中维护，避免每个按钮复制 prompt。
- 单用户节流：每分钟最多触发 2 次；按钮 cooldown 3 秒。
- 失败回退文案：“AI 暂时没灵感，你可以手动编辑草稿”。

验收：

- 完成一段冒险后，至少一个主按钮引导到写作或分镜，而不是只剩“继续聊”。
- 生成章节或分镜保留地点、角色、关键选择和结局。
- 用户能拒绝草稿，不会被强制写回世界书或素材库。

Review gate：

- MVP 2 个 trigger 跑通后先看漏斗数据，再决定是否补另外 2 个。

### Stage 5 — Demo case 验证闭环

目标：用一个完整案例证明“可玩的世界书”能从入口走到作品出口。

推荐案例：

- 世界：`边境王国`。
- 流程：选世界 -> 玩 10-15 分钟冒险 -> 写成我的版本 -> 整理成分镜 -> 导出剪辑草稿。

产出：

- `docs/demo/border-kingdom-adventure.md` 案例文档。
- 1 段小说片段。
- 1 个分镜草稿。
- 1 个剪映/剪辑包导出结果。
- 可选：30 秒 demo 视频或营销长图。

验收：

- 营销上能准确说“可以从世界冒险走向分镜/短片出口”。
- 至少 1 个完整作品草稿包含：小说片段 + 分镜 + 剪辑草稿。

Review gate：

- 案例跑完再决定是否投入生视频、社区 fork 或更多世界内容。

### Stage 6 — 30 天数据驱动决策

目标：避免在漏斗未验证前继续堆功能。

观察指标：

- 首页/体验页 -> 世界书导入转化率。
- 种子世界导入 -> 第一轮冒险完成率。
- 冒险 8-12 轮 -> trigger 展示率。
- trigger 点击率。
- `写成我的版本` -> 草稿保存率。
- `整理成分镜` -> 分镜导出率。

决策：

- 如果“玩 -> 写”转化好，优先加更多世界和后置 trigger。
- 如果分镜出口强，补改编/生视频实验出口。
- 如果用户更想改造世界，进入社区/fork 或世界扩展能力。

## 5. 推荐执行顺序

```text
Stage 0 文档同步
  -> Stage 1 入口话术
  -> Stage 1.5 world.json -> worldbook 适配
  -> Stage 2 种子世界内容生产
  -> Stage 3a GM 轻状态字段
  -> Stage 3b 剧情日志聚合器
  -> Stage 4 MVP 2 个 trigger
  -> Stage 5 demo case
  -> Stage 6 30 天数据决策
```

总周期预估：单人投入约 6.5-9 周。最大不确定点是 Stage 2 内容生产和 Stage 3 状态字段稳定性。

## 6. 第一轮实施范围

当前已做/正在收尾：

- 首页和体验页入口文案收口为“可玩的世界书”。
- 体验页没有世界书时引导进入快速导入。
- 快速导入增加种子世界表达和可创作出口提示。
- 生视频继续作为后置出口，不进入主 CTA。

下一步：

- Stage 2 review：从空白状态导入 3 个主推世界，分别完成至少 1 轮 AI GM 冒险冒烟。
- Stage 2 完成后再进入 Stage 3a；在手动冒险 review 前，不继续扩大 GM 状态字段或 trigger。

## 7. 验证策略

每个阶段完成后必须停下做 review checkpoint：

- 自动化：`npm run test:run`。
- UI 改动：`npm run test:run -- src/__tests__/visual-verification.test.js`。
- 构建：`npm run build`。
- 文档改动：`npm run docs:build`。
- 差异检查：`git diff --check`。
- 手动 smoke：从空白状态进入体验页，导入/选择世界，完成至少 1 轮冒险。

Stage-specific 额外验证：

- Stage 1.5：转换层单测覆盖 5 个现有 world fixture。
- Stage 2：自动测试锁住内容质量下限；每个主推世界需手动跑 10-15 分钟体验。
- Stage 3a：`StatusBar` / `QuestLog` / session persistence 回归。
- Stage 3b：mock LLM 验证日志聚合结构。
- Stage 4：两个 trigger 都走 generation task layer，且失败可回退。

## 8. 决策记录

- 入口差异点采用“沉浸世界观 + AI GM 控制”，不单独押注社区 fork。
- 短剧/生视频是改编出口，不是当前 product goal。
- 种子世界优先复用现有 `server/data/worlds`，只新增真正差异化世界。
- 玩到写的触发点比出口能力更优先。
- 状态归属以 `gameStore` / `worldStore` 为准，不新增第二套 GM 状态。
