# 世界建构平台市场调研 — 给 Pinax / text-game-framework

> 调研日期：2026-06-15
> 调研人：Claude
> 范围：World Anvil / Campfire / Notebook.ai / LegendKeeper / Worldsmith / Obsidian (+ 写作者插件) / Plottr / Aeon Timeline / StoryShop / Kanka / Articy Draft
> 目标：为 Pinax 的 worldbook 系统的实体模型、关系图谱、检索、时间线、AI 接入、导入导出、UI 范式提供"行业现状"基线

## 0. 调研方法与可信度声明

本轮所有外部抓取（firecrawl_search、WebFetch 多个域名、wikipedia）均因环境网络策略返回 401 / blocked，因此本报告**不包含实时网页引用**。内容来源于训练数据中截止 2026 年 1 月前的产品公开资料与第三方评测（World Anvil / Campfire / Kanka 的官方文档站、Obsidian 插件市场、Plottr / Aeon 的 marketing 站点、Reddit r/worldbuilding 与 r/SelfPublished 的常用评测帖）。

**重要标注：**
- 标 `[需复核 2026Q2]` 的条目 — 该产品在 2025-2026 期间可能已发生变化（功能、定价、是否仍活跃），下一次联网时优先验证。
- 标 `[训练数据]` 的条目 — 仅基于 2024 年 12 月前的资料，请在引用前再次确认。
- Notebook.ai 自 2022 年起多次报告功能停滞/服务降级，请视为最高优先级的复核对象。

下文所有 URL 均为**该平台官方域名**或**主要文档入口**，便于用户在自己环境内访问验证；本调研无法保证链接到具体某个文档章节。

---

## 1. Feature Matrix

> 表格列：实体类型 (character / location / item / faction / event / lore / language / religion / species)
> 表格列：能力 (relationships / timeline / maps / search / AI / export)
> "●" 完整支持；"○" 部分支持/插件化；"–" 不支持；"?" 不确定/需复核

| Platform              | char | loc | item | fact | evt | lore | lang | rel | spec | rel-graph | timeline | maps | search | AI  | export | PWA/mobile |
|-----------------------|------|-----|------|------|-----|------|------|-----|------|-----------|----------|------|--------|-----|--------|------------|
| **World Anvil**       | ●    | ●   | ●    | ●    | ●   | ●    | ●    | ●   | ●    | ●         | ●        | ●    | ●      | ●¹  | PDF/JSON/CSV | ○ (web responsive, 无原生) |
| **Campfire**          | ●    | ●   | ●    | ●    | ●   | ●    | ○    | ○   | ○    | ○         | ●        | –    | ●      | ●²  | PDF/ePub/Markdown | – (桌面为主) |
| **Notebook.ai**       | ●    | ●   | ●    | ●    | ●   | ●    | ●    | ●   | ●    | ●         | ○        | –    | ○      | ●³  | ? [需复核] | ? [需复核] |
| **LegendKeeper**      | ●    | ●   | ●    | ●    | ●   | ●    | ○    | ○   | ○    | ● (graph) | ●        | –    | ● (全文) | –  | JSON/CSV | – |
| **Worldsmith**        | ●    | ●   | ●    | ●    | –   | ●    | –    | –   | –    | –         | –        | –    | ○      | –  | JSON/Markdown | – |
| **Obsidian (+ 插件)** | ●    | ●   | ●    | ●    | ●   | ●    | ●    | ●   | ●    | ●⁴        | ●⁵       | ○⁶   | ●⁷    | ●⁸  | Markdown 原生 | ● (PWA, mobile app) |
| **Plottr**            | ●    | ●   | –    | –    | ●   | –    | –    | –   | –    | ○         | ●        | –    | ●      | ●⁹  | Word/Scivener/Markdown | – |
| **Aeon Timeline**     | ●    | ●   | –    | –    | ●   | –    | –    | –   | –    | ● (linking) | ●●¹⁰   | –    | ●      | –   | Word/Scivener/Final Draft | – |
| **StoryShop**         | ●    | ●   | ●    | ●    | ●   | ●    | –    | –   | –    | ○         | ○        | –    | ○      | –  | ? [需复核] | ? [需复核] |
| **Kanka**             | ●    | ●   | ●    | ●    | ●   | ●    | ●    | ●   | ●    | ●         | ●        | ●¹¹ | ●      | –  | JSON/CSV/Markdown | ○ (web responsive) |
| **Articy Draft**      | ●    | ●   | ●    | ●    | ●   | ●    | –    | ●   | –    | ● (flow)  | ●        | –    | ●      | –  | XML/JSON/Unity/Unreal | – (Windows 桌面) |

**脚注：**
1. World Anvil — "Inspire" AI 写作辅助 (Beta, 2024 推出), 可生成描述 / lore / 名字候选。
2. Campfire — "Write with AI" (基于自研或第三方模型的写作续写/灵感), 与 Pro/Studio 订阅绑定。
3. Notebook.ai — 早期有 "Ask" AI 查询功能；2022 后状态需复核。
4. Obsidian — Dataview / Graph Analysis / Juggl 插件提供关系可视化；原生 Graph View 是双向链接图。
5. Obsidian — Timeline / Obsidian-Chronology / Timelines 插件；非核心功能。
6. Obsidian — Excalidraw / Image-in-Editor / Maps 插件；非核心。
7. Obsidian — 全文检索、Omnisearch、Regex Find 插件。
8. Obsidian — 通过 Templater / Smart Connections / Copilot / Text Generator 插件接入 LLM，社区驱动。
9. Plottr — 2024 起整合 AI 助手，可根据场景生成 beat / 描述。
10. Aeon Timeline — 时间线是其核心（双重视图：spine + events），实体可与时间线 link。
11. Kanka — 地图模块 (location 可挂在地图 pin 上, 自定义图层)。

---

## 2. 数据模型模式 (Data Model Patterns)

### 2.1 类型化实体 + 自由字段 (Typed Entity + Free-form Fields)

**代表：World Anvil / Campfire / Kanka / Notebook.ai / Plottr**

每个实体属于一个明确类型（character / location / item ...），类型决定**默认字段集**（character 有 age/occupation/appearance；location 有 climate/population），但允许**自定义字段**（user-defined fields），最常见为字符串/数字/列表/布尔/日期/链接到另一实体。

关系建模：实体之间通过 `linked entities`（双向或单向引用）连接，关系通常无"类型化"（即只能说是"关联"，不能说"是父亲"或"统治"），但允许附加关系描述字段。

World Anvil 是最复杂的代表：除基础 18+ 类型外，还支持
- `subtype`（character 下的 "NPC" / "PC" / "Deity"）
- `extension`（社区/官方提供的字段扩展）
- `secret blocks`（仅订阅者可见的隐藏内容）
- `prompted fields`（写作用提示词模板字段）

[Kanka](https://kanka.io/en/features) 走类似路线，引入"家族"系统 (entity types 可以继承)，关系有 `relation` 表（独立表 + 关系类型 enum + 描述字段 + 持有者视角），是行业中**关系建模最严肃的产品**之一。

### 2.2 文档 + 双向链接 (Document + Bidirectional Links)

**代表：Obsidian / LegendKeeper / Worldsmith**

每个实体是一个**自由格式文档**（Markdown 或富文本），没有强制字段。实体间通过 `[[wikilink]]` 或 `@mention` 风格建立**双向链接**——关系是文档层面的引用，而非结构化字段。

优势：极低入门成本；用户可以随时调整实体结构；与 Markdown 生态兼容。
劣势：缺乏 schema，AI 难以推断结构；关系无类型；检索依赖全文搜索。

LegendKeeper 在文档模型上叠加了一个**关系侧栏**——任何文档可以"标记"另一文档来创建 typed relation（owner / enemy / parent / custom），这是介于 2.1 和 2.2 之间的混合。

### 2.3 节点 + 边 (Node + Edge Graph)

**代表：World Anvil (关系图)、Obsidian (Graph View)、Kanka (relation module)、Aeon Timeline (linking)、Articy Draft (flow)**

关系不是实体字段，而是独立的 edge 表/对象：
- World Anvil 的关系图是"基于共享标签/链接自动推断 + 用户手动 pin"
- Kanka 的 relation 模块是显式的 `(from_entity, to_entity, relation_type, text)` 四元组
- Obsidian Graph View 是 `[[link]]` 的可视化，**不存储额外元数据**
- Articy Draft 的 flow graph 是叙事流（对话/分支）而非世界关系

**结论**：当前市场主流是"类型化实体 + 自由字段 + 显式关系表"三件套；Pinax 已经走这条路（`worldbookContextBuilder.js` 的 `ENTRY_TYPE_PRIORITY`），**不需要迁移数据模型**。

### 2.4 时间线作为独立模块 (Timeline as First-class Module)

**代表：Aeon Timeline / Plottr / World Anvil (Chronicle) / Campfire (Timeline) / Kanka**

时间线不是"事件字段中的日期"，而是独立模块：
- Aeon Timeline：spine（主轴：纪元/世纪）+ event（带起止日期、参与者、关联实体、颜色）双层
- Plottr：plot cards（per-scene beat）+ 时间轴视图（per-arc or per-character）
- World Anvil Chronicle：与 history 文章类型绑定
- Kanka：timeline 模块 + event entity

**关键模式**：时间线上的"事件"通常 `linkedEntities: [character, location, faction]`，并在 AI context 时可作为"当前时间点相关事件"注入。Pinax 的 `event` 类型已有但没有专门时间线视图——这是一处可补的差距。

### 2.5 关系存储的常见做法

| 模式 | 谁用 | 优点 | 缺点 |
|---|---|---|---|
| 字段引用 (json: `relations: [{id, type}])` | Campfire, Plottr | 实现简单 | 查询必须 N+1 |
| 独立 relation 表 | Kanka, World Anvil | 查询 O(1), 可分析 | UI 复杂 |
| 文档双向链接 | Obsidian, LegendKeeper | 自然书写 | 无类型, 无聚合 |
| 属性图 (property graph) | Articy Draft, Neo4j-based | 最强大 | 杀鸡用牛刀 |

---

## 3. UI 范式 (UI Patterns)

### 3.1 Wiki 范式

**代表：World Anvil / Kanka / Notebook.ai**

每个实体是一个独立页面，左侧是导航树（类型 → 列表 → 实体），右侧是富文本编辑器。优点：信息密度高，单页可长；缺点：导航成本高，新用户找不到东西。

World Anvil 用"world dashboard"做总览（一张卡上展示当前世界的所有重要统计：entity count / last edited / recent events），再下钻到 wiki 页面。

### 3.2 文档列表 + 标签侧栏

**代表：Obsidian / LegendKeeper / Worldsmith**

左侧文件树 / 类型分组，中部文档编辑区，右侧是反向链接/标签/大纲/搜索。优点：所见即所得；缺点：实体多了之后类型筛选弱。

### 3.3 卡片 + 时间线看板 (Card + Timeline Board)

**代表：Plottr / Aeon Timeline / StoryShop**

Plottr 是典型：左侧是 "Plot Cards"（每张卡是一个 scene/beat），中部是时间线/弧线视图，右侧是角色弧。整页是一个大型多面板看板。

### 3.4 关系图 (Graph Canvas)

**代表：Obsidian (Graph View) / LegendKeeper (Graph) / World Anvil (Relationships) / Articy Draft (Flow)**

整张画布是节点和边，鼠标拖拽/缩放。适合探索但**不适合编辑大量实体**（超过 200 节点就开始乱）。

### 3.5 Pinax 现状

根据 `docs/STATUS.md` 和 `src/services/worldbookContextBuilder.js`，Pinax 的 worldbook 走的是**类型化 wiki 范式**——每个 entry 有 `type / keys / content`，UI 可能是表格式 + Markdown 预览。`OpeningPage.vue` 的 archive-folio 视觉、`Experience.vue` 的开场书签，提示 Pinax 偏好**纸质 / 文档 / 档案册**的视觉语言。

**建议**：Pinax 现有范式（类型化 wiki + 上下文预算匹配）与 World Anvil / Kanka 最接近，不必迁移。**唯一缺的是时间线视图**——Plottr / Aeon Timeline 的卡片看板是值得引入的"时间线单独模块"。

---

## 4. 导入 / 导出 (Import / Export)

| Platform | Export | Import | 锁定程度 |
|---|---|---|---|
| **World Anvil** | PDF / EPUB / JSON / CSV (per entity type) | JSON (官方)、多种第三方 import 工具 | 中（schema 公开） |
| **Campfire** | PDF / ePub / Markdown / DOCX | Markdown / DOCX / Campfire JSON | 低（Markdown 友好） |
| **Notebook.ai** | PDF / Markdown (?) [需复核 2026] | ? [需复核] | 高（曾传 lock-in 担忧） |
| **LegendKeeper** | JSON / CSV / Markdown | JSON / CSV | 低 |
| **Worldsmith** | Markdown / JSON | Markdown / JSON | 低 |
| **Obsidian** | Markdown (原生, 仓库即文件夹) | Markdown (原生) | **零锁定**（文件即数据） |
| **Plottr** | DOCX / Scrivener / Markdown / outline text | Plottr JSON / 部分 Markdown | 中 |
| **Aeon Timeline** | DOCX / Scrivener / Final Draft / Fountain | Aeon JSON | 低 |
| **StoryShop** | ? [需复核] | ? [需复核] | ? [需复核] |
| **Kanka** | JSON / CSV / Markdown (per entity) | JSON / CSV (官方 import tool) | 中（schema 公开） |
| **Articy Draft** | XML / JSON / Unity asset / Unreal asset | Articy XML | 中 |

**Pinax 现状**：数据存浏览器 `localStorage`（根据 AGENTS.md），无明确公开 schema 文档；`worldbookContextBuilder.js` 的 `ENTRY_TYPE_PRIORITY` / `ENTRY_TYPE_ALIASES` 是事实上的内部 schema。

**关键模式**：
- **JSON + schema 文档** 是行业标准（World Anvil / Kanka）。
- **Markdown + frontmatter** 是 Obsidian / Hugo / Jekyll 等通用格式，迁移最容易。
- 单一产品（如 Articy Draft）的 binary 格式是反模式。

**建议**：
1. Pinax 应该把 worldbook entry 的 JSON schema 写成 `docs/worldbook-schema.md`，作为事实合同。
2. export 至少支持 JSON + Markdown (含 frontmatter)。
3. import 至少支持 World Anvil JSON（社区最大）或自创 JSON（最易维护）。

---

## 5. AI Hooks (AI Integration)

### 5.1 已接入 AI 的平台

| Platform | AI 功能 | 接入方式 | 用户可关闭？ |
|---|---|---|---|
| **World Anvil** | "Inspire"：自动生成 description / secret lore / 名字候选 / 写作 prompt | 内嵌 | 是 (Beta 标志) |
| **Campfire** | "Write with AI"：续写、风格建议 | 内嵌 (GPT-class) | 是 |
| **Notebook.ai** | "Ask Notebook"：基于世界书的问答；"Write"：生成内容 | 内嵌 | 是 |
| **Plottr** | "AI Assist"：从一句话生成 beat list / outline | 内嵌 | 是 |
| **Obsidian** | 通过社区插件：Smart Connections (RAG over vault)、Copilot、Text Generator、Obsidian-LLM | 第三方插件，需用户配 API key | 是 (默认无 AI) |
| **World Anvil / Kanka** | 暂无官方 AI | – | – |

### 5.2 行业模式总结

1. **内嵌 SaaS AI**：World Anvil / Campfire / Plottr 走这条路。优点：开箱即用；缺点：定价高 + 数据出域 + 用户不能换模型。
2. **BYOK (Bring Your Own Key)**：Obsidian 生态走这条路。优点：用户控制 + 多模型；缺点：上手成本高。
3. **数据上下文拼接**：所有 AI 功能都需要"先把 worldbook 内容塞进 prompt"。World Anvil 的 Inspire 把当前 entity + 关联实体 + lore 拼成 system prompt。

### 5.3 Pinax 现状

`src/services/worldbookContextBuilder.js` 已经实现 `matchWorldbookEntries({ chatHistory, runtimeState, scanDepth })` + `buildWorldbookContext({ tokenBudget, entries, priorities })`——这是行业"上下文拼接"模式的典型实现，且 Pinax 已有 mem0ai 依赖（来自 `package.json`，按 AGENTS.md），未来可做 entity-level memory。

**建议**（不立即动）：
- BYOK 是 Pinax 的正确方向（用户已经能配置上游 API key，见 `docs/STATUS.md` 中 `gen.pollinations.ai` 的排查记录）。
- 上下文拼接保持现有 `matchWorldbookEntries` + `buildWorldbookContext`；后续可加 `buildRelationshipContext(entry, depth=2)` 注入关联实体。
- 行业空白点：**基于世界书的 QA / 检索增强**（Notebook.ai 做过但不彻底；Obsidian Smart Connections 是 RAG 但偏文档级），Pinax 的 entity-level + relationship-aware retrieval 是差异化机会。

---

## 6. Pinax 应该借鉴的模式 (Patterns Pinax should Copy)

> 严格依据 `worldbookContextBuilder.js` 现有实现判断，避免无依据建议。

### 6.1 保持：类型化实体 + 优先级上下文注入

`ENTRY_TYPE_PRIORITY` (rule=1 → general=11) 是行业领先的"硬约束上下文"做法——比 Campfire 的纯 keyword match 严格，比 World Anvil 的复杂 token 评分更可解释。**继续保留**。

### 6.2 借鉴：关系注入 (Relationship-aware Context)

Kanka / Articy Draft 的关系表可生成"当前实体相关的 2-hop 邻居"。当前 `matchWorldbookEntries` 只看 chat text + runtime state，**没有利用 entry 之间的关系**。

具体建议：
- 在 entity 上加 `relations: [{targetId, type, weight}]` 字段（不破坏现有 schema）。
- 在 `buildWorldbookContext` 中增加 `relationshipDepth=1`，扫描被选中 entry 的邻居，**仅当邻居有 keys match 时才纳入**，避免 token 浪费。
- 这是 Kanka / Articy Draft 的成熟模式，门槛低。

### 6.3 借鉴：时间线模块 (Timeline Module)

Plottr / Aeon Timeline / World Anvil Chronicle 都有独立时间线视图。Pinax 的 `event` 类型当前是"普通 entry"，没有专门的 timeline UI。

具体建议：
- 新增 `src/views/WorldbookTimeline.vue`（独立路由 `/worldbook/timeline`）。
- entity 加 `date: {start, end, isApprox}` 字段。
- 在 `buildWorldbookContext` 中按"当前 in-world 日期"过滤事件。
- 这是 **Pinax 当前的明显缺口**，且与剧情生成时间线强相关（见 `src/services/generationAdventureTriggers.js`）。

### 6.4 借鉴：可序列化 schema 文档

Kanka / World Anvil 都公开 schema 文档。Pinax 当前 schema 是隐式的（散落在 `worldbookContextBuilder.js` 的常量中）。

具体建议：
- 把 `ENTRY_TYPE_PRIORITY` / `ENTRY_TYPE_ALIASES` / `DEFAULT_STARTER_ENTRY_LIMITS` 抽到 `src/services/worldbookSchema.js`。
- 写 `docs/worldbook-schema.md` 包含：JSON 示例、字段约束、迁移指南。
- 让 export 走这个 schema 的 JSON。

### 6.5 借鉴：双向链接的"反向引用"视图

Obsidian 的 backlinks panel 极受欢迎。Pinax 可以在 worldbook entry 编辑页加 "被谁引用" 列表——零成本增量大。

### 6.6 借鉴：实体集合 (Collections / Tags)

Kanka 的"family"、Obsidian 的 tags、Notebook.ai 的 categories——都可以让用户把同类实体归到一起。Pinax 当前只有 `type`，可以加 `tags: string[]` 作为轻量分类。

---

## 7. Pinax 应避免的模式 (Patterns to Avoid)

### 7.1 避免：Articy Draft 的 binary lock-in

Articy Draft 把数据存在 `.unitypackage` / Unreal asset 里，用户一旦离开就几乎无法导出。Pinax 既然是 localStorage，**必须保持 JSON 可读**——任何"压缩 / 加密 / binary blob"都要慎重。

### 7.2 避免：Notebook.ai 的"什么都做"摊大饼

Notebook.ai 历史上覆盖"角色 / 地点 / 物品 / 派系 / 语言 / 宗教 / 物种 / 时间线 / 地图 / 音乐 / 商业"等十几种类型，但每种都做得浅，反而不如 Kanka 专注世界 + World Anvil 专注 wiki + Plottr 专注时间线。**Pinax 应保持"实体 + 关系 + 时间线"三件套，不轻易扩张新实体类型**。

### 7.3 避免：World Anvil 的"功能膨胀"

World Anvil 有 100+ 功能（article templates / subscriber perks / BBCode / manuscript / novel / adventure / maps / timelines / calendars / family trees / BBCode / prompted fields / secret blocks ...），新手完全迷失。**Pinax 的世界书必须保持"打开就能用"**，不要做付费墙后面的核心功能。

### 7.4 避免：Obsidian 插件生态的"配置地狱"

Obsidian 的 Dataview / Templater / Smart Connections 都需要用户写 JS / YAML 才能用，**门槛过高**。Pinax 的 AI 上下文构建应保持声明式（`type / keys / content` 即可），不要让普通用户写代码。

### 7.5 避免：Plottr 的"卡片看板偏执"

Plottr 是卡片流派的极端：每个 scene 强制一张卡，新用户创建 50 张卡就累垮。Pinax 的世界书应该是"文档为主、卡片为辅"，不要反过来。

### 7.6 避免：所有平台的 mobile 体验

除了 Obsidian mobile app，其他 10 个平台 mobile 体验都差（响应式 web 而非原生）。Pinax 因为是 web + localStorage，**应当把 PWA / offline 列入长期目标**，但短期不要花大量精力做完美 mobile。

---

## 8. Gap / Opportunity (市场空白)

### 8.1 实体级 RAG + 关系感知 (Entity-level RAG with relationship awareness)

**没人做得好。** Notebook.ai 做过类似 QA 但停止迭代；Obsidian Smart Connections 是文档级 RAG；World Anvil Inspire 是 entity-local 生成。**Pinax 的差异化机会**：把"当前场景 → 实体检索 → 关系 2-hop 邻居 → 时间线当前节点"拼成 system prompt，自动送入 generation。

### 8.2 实体变更历史 + Diff

World Anvil 有 revision history（但 locked 付费），其他平台基本没有。**空白**：让用户看到"角色的 occupation 从 2024-01 改成了 2024-06"，并允许回滚 + 在 AI context 中排除旧版本。

### 8.3 AI 写作时的"实体一致性"校验

没有平台解决：AI 生成内容时，与 worldbook 冲突怎么办？World Anvil Inspire 是"生成前查"的初步尝试，但缺回写到世界书的机制。**机会**：Pinax 可以在 generation 后自动检测"新提到了 character X 但 X 的 occupation 应该是 A 不是 B"，提示用户。

### 8.4 时间线与剧情触发的双向同步

Plottr / Aeon 是单向上下文（人更新剧情触发时间线变更）；World Anvil Chronicle 也是被动记录。**机会**：让剧情自动写入时间线 + 时间线变更触发新剧情（agent-driven），构成反馈循环。

### 8.5 公开 schema + 互通

没有平台公开"World Anvil 兼容 import"或"Kanka 兼容 export"。**机会**：Pinax 写一个 `importFromWorldAnvilJSON(json)` + `exportToKankaJSON()`，瞬间接入两个最大社区的数据。

### 8.6 关系类型库 (Relation Type Vocabulary)

各平台关系都是 free-form "owner / enemy / parent"。**空白**：通用关系本体（如 Schema.org / Wikidata 的 `Relation` 词表）做参考。Pinax 可以预设 ~30 个常用关系类型（`allyOf / enemyOf / parentOf / locatedIn / memberOf / owns / createdBy ...`），允许扩展。

### 8.7 PWA + 离线 + localStorage-native

Obsidian 是唯一 mobile 好的；其他都依赖云。**Pinax 的 localStorage + Vue 3 已经天然 PWA 友好**，这是难得的差异化——可以在 `/worldbook` 上做"完全离线 + IndexedDB 同步"，对飞机 / 信号差场景特别有用。

---

## 9. Sources

> 注：本轮所有外部抓取因网络策略失败，以下 URL 是各平台官方入口与主要文档，**用户应在自己环境内访问验证最新状态**。所有"[需复核 2026]"的条目尤其优先。

### 9.1 平台主页 / 产品页
- [World Anvil](https://www.worldanvil.com/)
- [Campfire Writing](https://www.campfirewriting.com/)
- [Notebook.ai](https://www.notebook.ai/)
- [LegendKeeper](https://www.legendkeeper.com/)
- [Worldsmith](https://www.worldsmith.io/)（具体域名需复核）
- [Obsidian](https://obsidian.md/)
- [Plottr](https://plottr.com/)
- [Aeon Timeline](https://www.aeontimeline.com/)
- [StoryShop](https://www.storyshop.co/)（需复核是否仍活跃）
- [Kanka](https://kanka.io/)
- [Articy Software](https://www.articy.com/)

### 9.2 文档 / 帮助 / 社区
- [World Anvil Help Center](https://help.worldanvil.com/)
- [Kanka Documentation](https://kanka.io/en/docs)
- [Kanka Features](https://kanka.io/en/features)
- [Kanka Pricing](https://kanka.io/en/subscription)
- [Obsidian Help](https://help.obsidian.md/)
- [Obsidian Plugin Directory](https://obsidian.md/plugins)（社区插件）
- [Aeon Timeline User Guide](https://www.aeontimeline.com/user-guide/)
- [Campfire Blog](https://www.campfirewriting.com/learn)
- [Plottr Blog](https://plottr.com/blog/)

### 9.3 行业评测 / 社区
- r/worldbuilding（Reddit）
- r/selfpublished（Reddit）
- [Writer's Digest — Worldbuilding Software Roundup](https://www.writersdigest.com/)（具体文章 URL 需复核）
- [The Novel Factory Reviews](https://www.novel-software.com/)

### 9.4 Pinax 内部文件（已在 §6 引用）
- `/home/recoletas/jiuguan/text-game-framework/src/services/worldbookContextBuilder.js`
- `/home/recoletas/jiuguan/text-game-framework/AGENTS.md`
- `/home/recoletas/jiuguan/text-game-framework/docs/STATUS.md`

---

## 10. 下一步建议

1. **立即（不需联网）**：
   - 把 `ENTRY_TYPE_PRIORITY` / `ENTRY_TYPE_ALIASES` 抽到 `src/services/worldbookSchema.js`（§6.4）。
   - 写 `docs/worldbook-schema.md` 含 JSON 示例（§6.4）。
2. **短期（1-2 周内）**：
   - 评估 §6.2 关系注入：在 `matchWorldbookEntries` 旁加 `matchRelationshipNeighbors(entry, depth=1)` 实验性实现。
   - 评估 §6.3 时间线：先做 `WorldbookTimeline.vue` 的纯前端静态视图。
3. **中期（需要网络验证）**：
   - 联网时优先复核：Notebook.ai 是否仍活跃（§0 标注）、World Anvil "Inspire" 当前状态、Campfire 定价、Kanka 新功能。
   - 引入 §8.5 Kanka / World Anvil 互操作 schema 文档。
4. **长期**：
   - §8.1 entity-level RAG with relationship awareness（最强差异化机会）。
   - §8.7 PWA + offline-first（与 localStorage 现状契合）。