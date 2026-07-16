# 历史 / 地理 / Agent 系统与链路完整性 — 综合调研报告

> 2026-07-02 · 调研目的：梳理 history system 接入、geography system 联动、写作/编导 agent 的规范化现状，以及整个链路（数据 → 上下文 → LLM → 状态）的衔接与完整性。
>
> **范围**：纯只读调研，未改任何代码、未跑任何测试。
>
> **方法**：4 个并行调研子任务分别覆盖 (a) history 系统、(b) geography 系统、(c) writing/director agent 与规范化、(d) 跨系统链路完整性。报告整合 4 份子报告并交叉验证关键发现。

---

## 0. 摘要

**整体判断**：4 个系统分别处在"功能单元已建成但跨系统接入不完整"的状态。

- **History system** — 4 个原子交付物（map semantics、history generator、opening entry、runtime patch + player history helper）全部完成且单测通过；但 `extractMapSemantics` / `generateGeoHistory` / `buildPlayerHistoryNodeFromPlotJournal` 在生产代码中 **0 调用者**；`runtimeState.historyNode` 被 worldbookContextBuilder 读取但 **从未被设置**。
- **Geography system** — Voronoi 渲染、AI 地图生成、marker 编辑完整链路通；history node 入口可写 `worldMapState.{country,city,scene}`。但 Voronoi 地图与 `gameStore.worldMapState`（当前叙事位置）**双向不通**：点 burg 不写 currentScene；`worldMapState.map.countries[]` 是占位 schema，从未被填充。
- **Writing/director agent 规范化** — `runGenerationTask` 统一 LLM transport；`applyWritingAgentAction`（6 种 typed action）是新写路径的统一 apply 协议；但 **8+ 处系统 prompt 副本散落**（api.js / InputArea / gameStore / promptBuilder / promptRegistry），agent taxonomy 双轨并行（`WRITING_TASK_TYPES` vs `ADVISOR_TASK_TYPES`），`ADVISOR_PROMPTS` 死代码，reference retrieval 是 opt-in（仅 useCopilot 接 writingAgentReferences，其他 7 个 agent 不接）。
- **链路完整性** — token budget、history > constant > keyword 优先级、runtimeEvents envelope、contextLedger 40-part 上限、session 500ms debounce + 3 个 unload flush 等关键不变量守得很好。**脆弱点**：8+ 处 narrator system prompt 复制、`runtimeState.historyNode` 只读不写、`contextual` flag 只标不读、`runtimeEvents` 模型侧只写不读、`state_delta` 全套机制声明但 0 调用、`initGame` 重复实现 worldbook 注入、`localStorage['dialogue_characters']` 与 `worldbook_<id>` 备份漏列。

---

## 1. History 系统 — 当前状态

### 1.1 数据模型（已锁定）

3 层历史数据结构共存于代码库：

| 层 | 形状 | 出处 |
|---|---|---|
| **generator node**（W2 产出） | `{ id, title, yearLabel, type, summary, mapBinding:{siteId,cellIds,markerIds,routeIds}, participants:{...}, entryIds[], playable, openingHook, actionHooks:[{...}] }` | `src/services/worldHistory/historyGenerator.js:419-444`（构造）、`:580-587`（清洗后输出） |
| **runtime historyNode**（W4 runtime patch） | `{ id, title, priorFacts[], unresolvedHooks[], participants[], entryIds[], mapBinding:{country,city,scene}\|null, factionRelations:{...}\|null }` | `src/services/playableWorldEntry.js:114-162` (`normalizeHistoryNode`) |
| **playerHistoryNode**（W4 player 反写） | `{ v:1, id, sourceNodeId, kind:'player-history-v1', summary(≤280字), entryCount, participants[]≤6, locations[]≤4, keyChoices[]≤4, unresolvedHooks[]≤6, windowStart, windowEnd, capturedAt }` | `src/services/playerHistory.js:76-135` |

`worldbook.geoHistory` 容器由 worldStore.js 归一化（接受 null / 裸数组 / 对象三种输入），`worldbook.geoHistory.playerNodes` 字段在 playerHistory.js:5-7 docstring 中提到但 **从未创建**。

### 1.2 数据流（W1 → W4 完整链路）

```
generateMap()                            [world-map engine, 生产调用方: WorldMapVoronoi]
  ↓
extractMapSemantics(mapData)             [mapSemantics.js:877]     ⚠ 0 生产调用者
  ↓
generateGeoHistory(worldbook, mapSem)    [historyGenerator.js:461] ⚠ 0 生产调用者
  ↓
worldbook.geoHistory (持久化)            [worldStore.normalizeGeoHistory, normal save]

getPlayableHistoryNodes(worldbook)       [playableWorldEntry.js:332-339]  ✅ OpeningPage 接线
  ↓
buildPlayableHistoryEntryIntent(...)     [playableWorldEntry.js:367-401]  ✅ 进入路由
  ↓
savePlayableWorldEntryIntent(intent)     [playableWorldEntry.js:164-182]  ✅ localStorage
  ↓
ensureWorldAdventureSession()            [OpeningPage.vue:371-406]        ✅
  ↓
applyPlayableWorldHistoryPatch(intent)   [OpeningPage.vue:408-425]        ✅
  ↓
consumePlayableWorldHistoryIntent(intent) [playableWorldEntry.js:215-274] ✅ 返回 5 patches
  ↓
gameStore.{saveWorldMapState,appendPlotJournal,setFactionRelation×N,appendRuntimeEvent}  ✅
  ↓
gameStore.sendAction(hidden command) + router.push('experience')  ✅

buildPlayerHistoryNodeFromPlotJournal(...) [playerHistory.js:1-]        ⚠ 0 生产调用者
```

### 1.3 已 wire 的部分（生产可用）

- 历史卡片 UI（OpeningPage.vue:88-95）✅
- `savePlayableWorldEntryIntent` 携带 `historyNode` 写入 localStorage ✅
- `consumePlayableWorldHistoryIntent` 输出 additive、纯函数 5 patches ✅
- W4 spec 排名 `history > constant > keyword > starter` 在 `worldbookContextBuilder.js:320-327` ✅
- historyEntryIds boost → matched set with `matchReason:'history'` ✅
- `display_event{ kind:'history-node-init', contextual:false }` runtimeEvent envelope ✅
- Player history 测试覆盖（playerHistory.test.js 7 个用例）✅
- 历史节点不打的"非历史开局"路径字节级一致（W4 spec 保证）✅

### 1.4 已写但未连入生产的部分（关键 gap）

| 模块 | 出处 | 现状 |
|---|---|---|
| `extractMapSemantics(mapData)` | `services/worldHistory/mapSemantics.js:877` | 仅 `__tests__/worldHistoryMapSemantics.test.js` 调 |
| `generateGeoHistory(worldbook, mapSem)` | `services/worldHistory/historyGenerator.js:461` | 仅 `__tests__/worldHistoryGenerator.test.js` 调 |
| `buildPlayableHistoryActions(geoHistory)` | `services/worldHistory/playableHistoryEntry.js:42` | 仅 test；OpeningPage 改用 `getPlayableHistoryNodes()`（playableWorldEntry.js:332）走另一条路 |
| `buildPlayerHistoryNodeFromPlotJournal(...)` | `services/playerHistory.js:76` | 仅 `__tests__/playerHistory.test.js` 调；模块 docstring 第 1-11 行明示"helper + tests 阶段，persistence + UI wiring deferred" |
| `runtimeState.historyNode` 写入 | （应该有 gameStore action 但 0 个） | `worldbookContextBuilder.js:148-164` 读它；但 gameStore 从未设它；整条 history-aware 上下文分支对 live GM 路径等于 dead code |
| `runtimeState.geoHistoryContext` 写入 | （应该有但 0 个） | `worldbookContextBuilder.js:169-187` 防御性读；future-compat 注释明示"未来 geoHistoryContext 结构的安全切面" |
| `worldStore.addPlayerHistoryNode()` action | worldStore.js 760 行全文搜 | **不存在**；只有 `addEntry/updateEntry/deleteEntry`（worldbook 条目），无 playerNodes 相关 action |
| `worldbook.geoHistory.playerNodes` 字段创建 | worldStore.js normalizeGeoHistory | 未在 normalizeWorldbook 中保留（也未创建） |
| `stateDeltaOps` 应用 | playableWorldEntry.js:259-264 产出 | OpeningPage.vue:408-425 调用链中 **未应用**，individual fields 直接走现成 action |

### 1.5 测试覆盖

| 测试文件 | 覆盖 | 引用 |
|---|---|---|
| `src/__tests__/worldHistoryMapSemantics.test.js` | W1 — 9 类、稳定性、容错 | 整文件 |
| `src/__tests__/worldHistoryGenerator.test.js` | W2 — 同 seed 稳定、8-12 node、≥3 playable、W1 接驳、降级、JSON 往返 | 整文件 |
| `src/__tests__/playerHistory.test.js` | W4 — 空 / 聚合 / lookback / dedup / clamp / thread 锚定 | 7 个测试 |
| `src/__tests__/playableWorldEntry.test.js` | W4 — normalizeHistoryNode、intent 往返、consume | `:103-258` |
| `src/__tests__/gameStoreSession.test.js` | W4 — `applyPlayableWorldHistoryPatch` 落到 runtimeState、null 兜底 | `:792-849` |
| `src/__tests__/worldbookContextBuilder.test.js` | W4 — historyEntryIds、排序、去重 | `:320-496` |
| `src/__tests__/runtimeEvents.test.js` | W4 — history-node-init envelope、contextual、validateStateDelta | `:187-241` |

**未覆盖**：
- production 中真正落地 `buildPlayerHistoryNodeFromPlotJournal`（即 W5 写回路径）
- `worldStore.addPlayerHistoryNode`（action 不存在）
- OpeningPage.vue 对 `stateDeltaOps` 的处理（OpeningPage 不读该字段）

---

## 2. Geography 系统 — 当前状态

### 2.1 两条独立 geography 数据链

代码库存在 **2 套互不通信的 geography 数据**：

| 链路 | 持久化键 | store | UI |
|---|---|---|---|
| **Voronoi 地图**（地形渲染） | `STORAGE_KEYS.GEOGRAPHY_DATA` + `mapConfigJSON` | `geographyStore.js` (voronoiConfig/markers/worldNodes/locations/overview) | WorldMapPanel / WorldMapVoronoi (Canvas) / GeographyPanel (editor) |
| **当前叙事位置** | `STORAGE_KEYS.WRITING_WORLDMAP` | `gameStore.worldMapState = { map:{countries:[]}, currentCountry, currentCity, currentScene }` | Experience.vue:570 (title), InputArea.vue:367 (context), worldbookContextBuilder.js:79 (scan) |

`worldStore` 不持有任何地图字段（仅 `geoHistory` 是 history 节点用，非地图）。

### 2.2 Engine 表面（已稳定）

`generateMap()` 返回 `VoronoiMapData`（types.ts:258-303）：
```
{ width, height, seed, cells (typed-array),
  vertices, features, rivers, burgs, states, cultures, provinces,
  roads, plates, boundaries, oceanCurrents, wind, coastlines,
  name, heightmapTemplate?, shapeIntent? }
```

管线：`generate.ts` 同步版 `:74-320`、异步版 `:326-557`。worker-bridge 在 `engine/worker-bridge.ts:91` 暴露 `generateMapInWorker(config)`，60s timeout。

稳定公共契约：`VoronoiMapData`、`MapGenConfig`、`LayerVisibility`、`GenerationMeta`、`MapConstraints`。

### 2.3 geographyStore 写入

13 个 actions 全部 write-through：

| action | 行 | 效果 |
|---|---|---|
| `loadAll` / `saveGeography` | `:64-97` | overview + locations 整体替换 |
| `createNode` / `updateNode` / `deleteNode` / `setActiveWorld` | `:132-177` | worldNodes 操作 |
| `saveVoronoiConfig` / `setLastGenerationMeta` / `persistMapData` | `:179-199` | 落 `mapConfigJSON` |
| `addMarker` / `updateMarker` / `deleteMarker` | `:202-218` | markers 增删改 |

### 2.4 gameStore.worldMapState 写入

| action | 行 | 效果 |
|---|---|---|
| `saveWorldMapState` | `gameStore.js:550-555` | 全量替换 |
| `extractLocationChanges` | `:2040-2069` | 正则匹配 AI 文本，仅写 `currentScene`（**从不**写 country/city） |
| `applyRuntimeState` | `:2356` | session 反序列化时复制 `runtime.worldMapState` |
| `consumePlayableWorldHistoryIntent` 路径 | `OpeningPage.vue:412, legacy:337` | history node 入口同时写 `currentCountry/city/scene` |

### 2.5 geography ↔ history 接入

**已连（单向 history → runtime state）**：
- `playableWorldEntry.js:219-225` 把 `historyNode.mapBinding.{country,city,scene}` 写进 patches
- `OpeningPage.vue:412` `gameStore.saveWorldMapState({...currentMap, ...patch})`
- legacy alias 同样走
- `plotJournal` 记录 `[currentCountry, currentCity, currentScene]` 名字串（`gameStore.js:948-976`）

**未连 / 声明但无 producer**：
- `state_delta` ops 路径在 `runtimeEvents.js:28-41` 已 add `worldMapState` 到 `STATE_PATH_ROOTS`，但生产代码 0 调用方发 `state_delta`
- `contextual:false` flag 在 `playableWorldEntry.js:255` 显式设，但无 consumer 读

**完全 dead 链**：
- `extractMapSemantics()` → `generateGeoHistory()` 端到端实现 + 单测；**0 生产 caller**（仅 4 份测试调用）
- 预期 `WorldMapPanel` 生成 Voronoi 地图后调 `extractMapSemantics` → 喂给 `historyGenerator` → 写入 `worldbook.geoHistory.nodes`，但 **这条连通未实现**

### 2.6 UI 链路

- 路由 `settings/world-map` → `WorldMapPage.vue` (4 行) → `WorldMapPanel` (左 WorldTreeSidebar / 右 WorldMapVoronoi)
- GeographyPanel 嵌入 Experience.vue:137-142 (右 rail `rail-mode='codex'`) + `:304-305` (right detail drawer)
- legacy Experience.vue:55, 280 仍直接 import panel
- `StatusBar` / `GamePanel` **无地图相关逻辑**
- 拖 / hover / click Voronoi 标记 → 调 marker CRUD，但 **不写 `worldMapState.currentScene`**（Voronoi 地图与运行时位置不通）

### 2.7 已知死链 / 不一致

- `worldMapState.map.countries: []` 是占位 schema，从未被填充
- `extractLocationChanges` 仅写 `currentScene`，`currentCountry`/`currentCity` 仅在 session init 或 history node 入口写一次
- `mapBinding` 在 `consumePlayableWorldHistoryIntent` 期望 `{country,city,scene}` 3 字段（`playableWorldEntry.js:219-225`），在 `playableHistoryEntry.js:54-59` 是 `{siteId,cellIds,markerIds,routeIds}` 4 字段 — **两种 schema 不互通**
- `renderer.ts:1212` 1 处 TODO（火山 glyph：strato 三角 / shield 盾形）
- `WorldMapPanel.vue:18` 3D 切换弹 alert "开发调优中" — 该 surface 留白但未标 TODO

---

## 3. Writing / Director Agent 规范化 — 当前状态

### 3.1 现有 agent 一览（11 类）

| Agent | Entry（file:line） | Prompt / 注册 | References | Result | Apply / Side-effect | Tests |
|---|---|---|---|---|---|---|
| **Writing Agent (multi-action)** | `Writing.vue:1184` `handleAskAdvisor` → `advisorTaskService.requestAdvisorTask:62` | 服务端构造；client 端 `writingAgentContext.buildWritingAgentContext:394` 拼 envelope | `writingAgentReferences.buildReferenceContext:350` + `chapterOutline.buildChapterOutlineContext:86` + `worldbookContextBuilder.buildWorldbookContext` | 新：server `result.actions:[...]` 数组；旧：`{taskType,advice,result:{task,mode,summary}}` | **新**：`applyWritingAgentAction`（`advisorResultApplier.js:163`，6 种 typed action）<br>**旧**：`applyAdvisorReplacement`（`:58`，仅 `mode:'replace'`） | `advisorResultApplier.test.js`(40+) / `writingAgentContext`(20+) / `writingAgentReferences`(25+) |
| **Writing Copilot（inline）** | `useCopilot:350` `triggerGeneration` | **ad-hoc inline 字符串 `:247-257`**，**未用** `promptRegistry.getSystemTemplate('copilot')`（虽已在 registry 中定义） | `buildCopilotMessages:208` 调 `buildReferenceContext + buildWorldbookContext` + 窗口 | 纯文本 → `normalizeCopilotSuggestion:108` | caller `insertCopilotSuggestion:169` 插入 | `useCopilot.test.js` |
| **Advisor (legacy)** | `useAdvisor.askAdvisor:52` → `requestAdvisorTask` | 服务端；client 仅 inline `buildAdvisorActionContext` | server 从 client 传 `context` 自取 | `{taskType, advice, result}` envelope | 仅 `mode:'replace'` 走 `applyAdvisorReplacement` | `advisorTaskService` / `useAdvisor` / `serverAdvisorTaskService` |
| **Prose Generation** | `proseGeneration.js:135,179,219` 3 个 export | **ad-hoc 字符串 3 处**（`:142-151, :186-191, :227-257`） | 无 | JSON array 含 BEGIN_CARDS/END_CARDS delimiter → `parseCardBlock:35` | 无；`useDirector.loadFromProseEssay:182` 接 | `textGenerationServices.test.js` |
| **Poetry Generation** | `poetryGeneration.js:572,582,677` 3 个 export | **ad-hoc 3 处**（`:187-199, :593-600, :688-699`） | 无 | 行格式 `L<level>\|N<id>\|P<parent>\|<title>` → `parseLineTree:58` | caller 落 narrative assets / storyboard | 同上 |
| **Chapter Outline** | `chapterOutline.js` 纯 CRUD | n/a | n/a | n/a | n/a | `chapterOutline.test.js` |
| **Setting Field** | `settingFieldGeneration.js:59,95` | `buildSettingGenerationMessages:16` ad-hoc 字符串 | `summarizeStructuredSettings` (settingPanelSchema) | 纯文本 → `normalizeDraft:9` 剥 ``` 围栏 | caller 落 worldbook | `settingFieldGeneration.test.js` + section |
| **Text Expander** | `textExpander.js:69` `expandText` | `buildExpansionPrompt:26` 用 promptRegistry 常量 | 无 | 纯文本 | 无 | `textGenerationServices.test.js` |
| **Text Rewriter** | `textRewriter.js:93` `rewriteText` | `buildRewritePrompt:28` 用 promptRegistry 常量 | 无 | 纯文本 | 无 | 同上 |
| **Dialogue Options** | `dialogueOptions.js:18` `generateDialogueOptions` | `buildDialogueOptionMessages:64` ad-hoc inline | 仅 `recentMessages` slice（`:146`） | JSON `{options:[...]}` 或 line-separated → `buildFallbackOptions:52` | 无 | `dialogueOptions.test.js` |
| **Adventure Trigger** | `generationAdventureTriggers.js:163,288` | **ad-hoc 2 处**（`:139-149, :262-273`） | `buildWorldbookContext`（`:125, :248`，与 gameStore.generateAIResponse 并行） | prose 纯文本 ≥60 字 → `parseAdventureProseDraft:110`；storyboard JSON `shots[]` → `validateStoryboardShots` | 无（caller 路由） | `generationAdventureTriggers.test.js` |

### 3.2 已规范的部分

- **单 LLM transport**：`runGenerationTask` / `runGenerationStreamTask`（generationService.js:5, 36）→ `runGenerationRetryPlan`（generationRetry.js）— 全部 client-side 生成走这条
- **单 advisor result 归一**：`advisorTaskService.normalizeAdvisorResult:38` → `{taskType, advice, result}` 包络
- **新写路径统一 apply 协议**：`applyWritingAgentAction(content, action, env)`（`advisorResultApplier.js:163`，6 action + typed side effects）
- **schema 版本化 envelope**：`WRITING_AGENT_CONTEXT_SCHEMA_VERSION=1` / `REFERENCE_SCHEMA_VERSION=1` / `ASSET_SCHEMA_VERSION=1` / `CHAPTER_OUTLINE_SCHEMA_VERSION=1` / `MEMORY_SCHEMA_VERSION=1`
- **side-effect as data**：`applyWritingAgentAction` 不触 localStorage，side effect 列表回给 caller 由 `Writing.vue:1243-1294` 执行
- **promptRegistry 部分集中**：`NARRATIVE_STYLES` / `EXPANSION_MODES` / `REWRITE_MODES` / `TONE_PRESETS` / `PERSPECTIVE_PRESETS` / `SYSTEM_TEMPLATES` / `PROFESSIONAL_INFO_PROMPT` 被部分 agent 用
- **FNV-1a 稳定 ID**：`hashString`（`advisorResultApplier.js:506`）— agent 自铸 asset / outline item 用
- **单 asset store**：所有 writing agent 共享 `narrativeAssets.js`

### 3.3 未规范的部分（关键 gap）

| 类别 | 出处 | 问题 |
|---|---|---|
| **Ad-hoc system prompts** | `proseGeneration.js:142-151, 186-191, 227-257`<br>`poetryGeneration.js:187-199, 593-600, 688-699`<br>`settingFieldGeneration.js:42-48`<br>`dialogueOptions.js:77-95`<br>`generationAdventureTriggers.js:139-149, 262-273`<br>`useCopilot.js:247-257` | 字符串副本散落；`useCopilot` 不用 registry 中已定义的 `copilot` template |
| **ADVISOR_PROMPTS 死代码** | `promptRegistry.js:147-238` 定义 poetry/prose/novel/notes 4 块 prompt | `grep` 全 src 0 import |
| **双轨 taxonomy** | `WRITING_TASK_TYPES`（writingAgentContext.js:49-57, 7 项 client-side scope）<br>`ADVISOR_TASK_TYPES`（advisorTaskService.js:3-9, 5 项 server-side scope） | 服务端 / 客户端各自一套任务类型 |
| **双 apply 路径并存** | `applyAdvisorReplacement`（legacy, 4 tests）+ `applyWritingAgentAction`（新, 40+ tests）；分发器 `Writing.vue:1209` | 同一个 `advisorResultApplier.js` 文件并存 |
| **reference retrieval opt-in** | 仅 useCopilot 调 `buildReferenceContext`；7 个其他 agent 不接 reference / worldbook / inbox 上下文 | prompt 内容只有 `{topic, cardContent}` 等简单字段 |
| **GmPersonaLauncher 无 advisor 桥** | 4 个页面 import（Writing/ProseEssay/Notes/Experience）但 persona 的 `open` event 从未被绑到 `useAdvisor.askAdvisor` 或 `openAdvisor` | launcher 是 UI scaffolding |
| **无 director agent** | `useDirector.js` 仅 CRUD shots，不调 LLM；promptRegistry 中无 `director.*` taskType | "director advise" agent 不存在 |
| **`useApiSettings.providers` 内联** | `useApiSettings.js:6-16` 文件内 const | 不与 registry 共享 |
| **advisor HTTP 层无 retry / backoff** | `advisorTaskService.requestAdvisorTask:62` 直接 throw on gateway error | 仅 LLM 侧有 retry |
| **write-agent / advisor 无 streaming** | 只有 `runGenerationStreamTask` 流式 chat 协议；`applyWritingAgentAction` 要求全 action 列表到位 | 无 partial-application stream 协议 |
| **advisor / copilot 不读 memory** | memoryCandidates 仅 worldbook context 路径调（gameStore.js:1711） | writing agent 不读 memory |
| **agent response envelope 各家自定** | plain text / JSON / BEGIN_* delimiter / line-tree 4 种格式 | 无统一 `{schemaVersion, ok, content, format, actions?, citations?}` 包络 |
| **TODO 显式标记** | `writingAgentContext.js:441-448` 明示：`GENERATE_FROM_ASSET / EXTRACT_TO_ASSET` 引入新 scope 字符串，"legacy resolver 不识，Writing.vue 应 handle 为 no-op / informational 直到 Window A ships the schema" |

### 3.4 Composable 一览

| Composable | 行数 | 角色 |
|---|---|---|
| `useCopilot.js` | 487 | 写作页面内联续写提示；`triggerGeneration` + `extractCopilotWindow` + `normalizeCopilotSuggestion` + `insertCopilotSuggestion` + ghost overlay DOM helper |
| `useAdvisor.js` | 120 | `useAdvisor` 薄壳：`askAdvisor(input, contextProvider)` + 4 refs（open/loading/messages/results）；无 cache / 无 retry |
| `useApiSettings.js` | 130 | API 配置（provider list 内联 const），dispatch `pinax:api-settings-updated` event |
| `useDirector.js` | 442 | storyboard/shots 管理器，状态管理 CRUD；不调 LLM（仅消费 LLM 产出的 storyboard） |

---

## 4. 跨系统链路完整性

### 4.1 Live GM 生成链路（核心链路，现状可读）

```
Experience.vue:1083 ─user msg── gameStore.sendAction(text)
  ↓
gameStore.sendAction (gameStore.js:1526)
  ├── messages.push({role:'user'})
  ├── chatHistory.push({role:'user'})
  ├── appendRuntimeEvent({type:'turn', source:'user'})              [gameStore.js:1540]
  ├── saveCurrentSession()
  └── generateAIResponse() (gameStore.js:1653)
        ↓
        ├── 1. worldbookContext = buildWorldbookContext()           [gameStore.js:1663]
        │   ├── runtimeState 快照:1666-1678
        │   ├── collectScanText 读:
        │   │   ├── chatHistory.slice(-scanDepth)
        │   │   ├── character / currentCountry/City/Scene / time
        │   │   ├── last 5 activities / first 4 goals / last 6 char / last 5 keyChoices
        │   │   ├── all factionRelations
        │   │   ├── last 2 plotJournal entries
        │   │   ├── runtimeState.historyNode.{title,participants,unresolvedHooks,priorFacts}  ⚠ 读但 runtimeState.historyNode 未被设
        │   │   └── runtimeState.geoHistoryContext.{participants,unresolvedHooks,entryIds}    ⚠ 同上
        │   ├── matchWorldbookEntries({historyEntryIds}):223  fallback 走 historyNode.entryIds（`worldbookContextBuilder.js:243-258`）
        │   │   └── 命中 entryIds → matchReason:'history'（`:264-272`），sort: history > constant > keyword > starter（`:320-327`）
        │   └── contextLedger parts 写入（`:341-562`）
        │
        ├── 2. contextMsg = buildContextMessage()                   [gameStore.js:1702]
        │   └── api.js:926 buildContextMessage → getWritingContextDetail 读 writing_character / writing_worldmap / writing_time / writing_activities
        │
        ├── 3. memoryRecall = buildScopedMemoryRecallContext()      [gameStore.js:1711]
        │   ├── memoryCandidates.js:586 ranked recall
        │   └── mem0 fallback: buildMem0MemoryContext               [memorySync.js:105]
        │
        ├── 4. appendContextLedgerPart (runtime / memory / chat) + mergeContextLedgers [gameStore.js:1755-1792]
        │
        ├── 5. messagesToSend = [chatHistory, worldBookMsg, memoryMsg, contextMsg]    [gameStore.js:1795-1804]
        │
        ├── 6. runGenerationStreamTask()                            [gameStore.js:1824]
        │   └── generationService.js:36 → api.sendChatStream
        │
        ├── 7. on completion:
        │   ├── chatHistory.push({role:'assistant'})
        │   ├── appendRuntimeEvent({type:'turn', source:'assistant'}) [gameStore.js:1863]
        │   ├── saveCurrentSession()                                [gameStore.js:1874]
        │   ├── recordMemory() (fire-and-forget)                    [gameStore.js:1886]
        │   └── detectInlineEvents / detectMechanismTriggers
        │
        └── 8. extractAndUpdateState()                              [gameStore.js:1906]
            ├── extractTime / extractLocationChanges → saveWorldMapState
            │   └── 注意：仅写 currentScene（不写 country/city）
            └── maybeAppendPlotJournalEntry()                       [gameStore.js:1954]
                └── compactPlotJournalSummary → buildHeuristicContextSummary
```

### 4.2 Adventure Trigger 平行链路

`gameStore.generateAdventureTriggerDraft:754` → `generationAdventureTriggers.generateAdventureProseDraft:163` / `generateAdventureStoryboardDraft:288` — **两条链路独立调用 `buildWorldbookContext`**（`generationAdventureTriggers.js:125, :248`），token budget 分别为 1400 / 1200（与 gameStore.generateAIResponse 的 2000 不同）。**这是与 live GM 链路平行的双 context-build 路径**。

### 4.3 上下文管理关键不变量（守住的部分）

- **token budget**：worldbookContextBuilder 末段 enforce（`:507-537`），超 budget 截断 + 写 ledger part `included:false, truncated:true`
- **history > constant > keyword > starter 排序**：W4 spec 与 gameStore.tokenBudget=2000 / adventure prose=1400 / adventure storyboard=1200 / contextCompression=700 + 9000 chars 各自独立设置
- **runtimeEvents envelope**：`STATE_PATH_ROOTS` allowlist + `STATE_OPS` 校验 + `validateStateDelta` 防 prototype pollution（`:112-119`）；200 cap（RUNTIME_EVENT_LIMIT）
- **contextLedger**：`CONTEXT_LEDGER_PART_LIMIT = 40`；溢出时合成 `overflowPart`
- **session save**：500ms trailing debounce + WeakMap-per-store；beforeunload / pagehide / visibilitychange 3 个 flush 触发器
- **backup export**：47 declared + 9 legacy/undeclared keys
- **adventure trigger 速率**：`ADVENTURE_TRIGGER_COOLDOWN_MS = 3000` + `ADVENTURE_TRIGGER_MAX_PER_WINDOW = 2`
- **plot journal**：每 8 assistant turn 自动压缩（`PLOT_JOURNAL_TURN_INTERVAL = 8`），heuristic summary 420 字上限
- **memory dedup**：contentHash + bigram similarity + lifecycle 4 态 + sync 5 态

### 4.4 链路脆弱点（含 file:line）

| 类别 | 出处 / 引用 | 问题 |
|---|---|---|
| **8+ 处 narrator system-prompt 复制** | `api.js:529-547` / `api.js:880-910` / `InputArea.vue:248-259` / `gameStore.js:1646` / `gameStore.js:2414` / `promptBuilder.js:159` / `promptRegistry.js:28` | 无单一来源；改动一处需同步 8 处 |
| **3 条平行 worldbook-context consumer** | `gameStore.generateAIResponse:1663` / `generationAdventureTriggers.prose:125` / `generationAdventureTriggers.storyboard:248` | 各跑各的 token budget、各自 inline `getRuntimeSnapshot` |
| **`runtimeState.historyNode` 只读不写** | 读端 `worldbookContextBuilder.js:148-164` / `:251-258`；写端 0 | live GM 路径 history-aware 分支 = dead code |
| **`contextual` flag 不被消费** | `runtimeEvents.js:85-87` 默认 / `playableWorldEntry.js:255` 显式 | 无 reader 过滤 |
| **`runtimeEvents` 模型侧只写不读** | 写入方 `gameStore.js:1540 / :1863` / `OpeningPage.vue:348, 423`；读端 0 | worldbookContextBuilder / contextLedger / contextCompression / generationService 全不读 |
| **`state_delta` 整套机制空转** | `runtimeEvents.STATE_OPS` / `STATE_PATH_ROOTS` / `validateStateDelta` 全实现 | 0 producer；只 `turn` 类型事件真正发出 |
| **initGame 重新实现 worldbook 注入** | `gameStore.js:2388-2488`（initGame）/ `:2417-2438`（手工拼 prompt） | bypass worldbookContextBuilder 整套 matching / budget / ledger 路径 |
| **rebuildChatHistory 不注 worldbook** | `gameStore.js:1630-1650` | 重拼 chatHistory 仅 prepend narrator system prompt，不查 worldbook |
| **`getWritingContextDetail` localStorage fallback 死代码** | `api.js:552-696`；live GM 总传 explicit `contextDetail`（`gameStore.js:1687-1698`）；fallback 仅 `getPromptInfo` 诊断路径可达 | dead code |
| **`buildScopedMemoryContext`（legacy）vs `buildScopedMemoryRecallContext`（ranked）并存** | `memoryCandidates.js:483 / :586`；gameStore.js:1719 ranked 仅在返回空时 fallback legacy | 双实现 |
| **`localStorage['dialogue_characters']` undeclared key** | `gameStore.js:1256,1266,1275` | 备份 `PINAX_BACKUP_KEYS` 不收，丢失 |
| **`worldbook_<id>` per-key 不在备份清单** | `worldStore.js:9,214,355,395,416,587`（per-id 动态键） | 备份靠 `writing_books` index 但实际数据在动态键上 |
| **`gameStore.lastContextLedger/lastWorldbookContext/lastMemoryContext/lastMemoryRecall`** | `gameStore.js:1683 / :526 / :1792 / :1740` | 只有 `lastWorldbookContext` 被 `InputArea.vue:372` 读；其余 3 个死字段 |
| **live GM 与 adventure trigger retry/streaming 路径不一致** | generationService 两个函数 + 不同 budget | 两链路相互不感知 |
| **extractFactionRelations 是 heuristic** | `gameStore.js:2312-2325` 正则匹配，±8 delta 写死，无 LLM 推理，无 time decay | 不可靠 |
| **mood delta 仅做不做读** | `gameStore.js:2163-2190` 改 `writingCharacter.mood` 但无路径回灌到 LLM context（除非 buildContextMessage 重读 character） | 单向 |
| **`consumePlayableWorldHistoryIntent` 隐式依赖** | `OpeningPage.vue:348, 423` 仅 `appendRuntimeEvent`；不显式设 `runtimeState.historyNode` | 假设 caller push 事件 + implicit field copy |

### 4.5 runtimeEvents envelope 类型对照

| type | source | 用途 | 当前 producer | consumer |
|---|---|---|---|---|
| `turn` | `user` / `assistant` | 对话轮 | `gameStore.js:1540 / :1863` | **0**（model 侧不读） |
| `display_event` | `runtime` | 展示事件（如 history-node-init） | `playableWorldEntry.js:245-257` | **0** |
| `state_delta` | `runtime` | 状态变更（allowlisted） | **0** | **0**（机制已声明，producer 未接通） |
| `hot_choices` | — | — | **0** | — |
| `branch` | — | — | **0** | — |

### 4.6 localStorage 键 与 备份覆盖

| 键 | 用途 | 写入方 | 备份列？ |
|---|---|---|---|
| `worldbook_<id>` (动态) | 每本世界书 | worldStore.js | **否**（仅 `writing_books` index） |
| `writing_books` | index | worldStore.js | ✅ |
| `worldbooks_index` | 双 index | worldStore.js | n/a (legacy) |
| `active_worldbook_id` | 指针 | worldStore.js | ✅ |
| `world_nodes` | worldNodes | geographyStore.js | ✅（`WORLD_NODES`） |
| `geography_data` | overview + locations | geographyStore.js | ✅ |
| `writing_character` | 当前主角 | gameStore.js | ✅ |
| `writing_time` | 当前时间 | gameStore.js | ✅ |
| `writing_worldmap` | worldMapState | gameStore.js | ✅ |
| `writing_activities` | 活动 | gameStore.js | ✅ |
| `writing_sessions` | 会话索引 | gameStore.js | ✅ |
| `writing_scenes` / `writing_world_settings` / `writing_notes` / `writing_characters` / `writing_timelines` | 各种 scene/world | declared | 部分未被引用 |
| `dialogue_characters` | 对话角色 | gameStore.js 多次 setItem 但未声明 | **否** ⚠ |
| `memory_candidates_v1` | memory | memoryCandidates.js | ✅ |
| `playable_world_entry_intent_v1` | 进入意图（含 historyNode） | playableWorldEntry.js | ✅ |
| `narrative_assets_v1` / `storyboard_documents_v1` / `storyboard_snapshots_v1` | narrative | narrativeAssets.js | ✅ |
| `preference_user_id` / `mem0_settings` | user / mem0 | api.js / memorySync.js | ✅ |
| `apiSettings` / `gameSettings` | 配置 | useApiSettings.js / gameStore.js | ✅ |

### 4.7 TODO / FIXME 总览

**不在历史 / 地理 / writing-agent / cross-system 核心里**：
- `renderer.ts:1212` 1 处 TODO（火山 glyph）
- `WorldMapPanel.vue:18` 3D 按钮弹 alert "开发调优中"（未标 TODO）
- `writingAgentContext.js:441-448` 显式 `TODO` 注释：`GENERATE_FROM_ASSET / EXTRACT_TO_ASSET` scope 字符串"legacy resolver 还不识"

**W4 / W5 backlog（写在 docstring / 报告里，不在代码 TODO）**：
- `playerHistory.js:1-11` 明示"helper + tests 阶段，persistence + UI wiring deferred"
- `playableWorldEntry.js:276-282` "Window 3"
- `worldbookContextBuilder.js:166-168` "Forward-compatible slice for a future geoHistoryContext structure"
- W4 report §7 列 5 条 Out of scope：`historyNodeId` 进 plotJournalEntry、`worldStore.addPlayerHistoryNode` action、跨 session thread、historyEntryIds 概率门控、`applyPlayableWorldHistoryPatch` 拆 composable

---

## 5. 跨系统 Gap 综合清单（按优先级）

### P0 — 链路事实上不工作（用户场景受影响）

1. **`runtimeState.historyNode` 写入路径缺失**。`worldbookContextBuilder.js:148-164` 与 `:251-258` 读它但 gameStore 0 处设；live GM 路径 history-aware context 分支事实上 dead code。W5 接 player history 时若不补这条，世界书对历史节点的引用无法稳定进入上下文。需新增 `gameStore.setHistoryNode(node)` action 与 `applyPlayableWorldHistoryPatch` 同步调。
2. **`generateGeoHistory` 全链路 production 0 caller**。W1 + W2 实质上是只测不跑的库代码。OpeningPage 现在仅消费已存在的 `worldbook.geoHistory.nodes`（来自 import 或 manual 注入）。需要择一：(a) 在 worldbook 导入路径接入 `extractMapSemantics → generateGeoHistory`；(b) 在 WorldMapPanel 的"Voronoi generate" 完成后接入链。
3. **`worldStore.addPlayerHistoryNode` action 不存在**。playerHistory.js helper 全好，但 `worldbook.geoHistory.playerNodes` 字段也未在 worldStore 中保留（normalizeWorldbook 不认）。需要：(a) 在 normalizeWorldbook 保留 `playerNodes` 数组字段；(b) 新增 `addPlayerHistoryNode(node)` action。

### P1 — 声明但空转的核心机制（资源浪费）

4. **`runtimeEvents` 全套 payload 类型与读取未接通**。当前 5 种 envelope type（turn / display_event / state_delta / hot_choices / branch），只有 `turn` 真的发出。设计预期是 model-side 读 `display_event` + `state_delta` 做 context 注入；现在 producer/consumer 都缺，机制空转。
5. **`contextual:false` flag 无 enforcement**。`playableWorldEntry.js:255` 声明此 event 不进 model context，但没有 reader 强制过滤；可能存在 event 误注入风险。
6. **`state_delta` 全白名单机制 0 producer**。`STATE_OPS = {set,merge,push,pull,inc,unset}` / `STATE_PATH_ROOTS = {goals,encounteredCharacters,factionRelations,...}` / `validateStateDelta` — 仅 runtimeEvents.test.js 测过；`gameStore.setGoals / setFactionRelation / appendPlotJournal / saveWorldMapState` 现走 direct mutation，state_delta 路径未利用。可能的替代设计：用 state_delta emitter 替换部分直接 mutation，使 runtime event 链与 store mutation 同步。

### P2 — 横向规范化低收益但高维护成本

7. **8+ 处 narrator system-prompt 复制**。`api.js:529 + :880` / `InputArea.vue:248` / `gameStore.js:1646 + :2414` / `promptBuilder.js:159` / `promptRegistry.js:28` — 8 处模板字符串。改为单一 `getSystemPrompt('narrator'|'dialogue'|...)`。
8. **`ADVISOR_PROMPTS` 死代码**（`promptRegistry.js:147-238`）。定义 poetry / prose / novel / notes 4 块 prompt 但 src 内 0 import。要么接进 `advisorTaskService` 服务端构造，要么删除。
9. **3 条平行 worldbook-context consumer** — `gameStore.generateAIResponse` / `generationAdventureTriggers.prose` / `generationAdventureTriggers.storyboard`。各 inline `getRuntimeSnapshot`，token budget 独立。新增 `buildAgentContext({kind, runtime, budget})` 统一入口。
10. **`useCopilot.js:247-257` 系统 prompt 不用 registry 中已注册的 `copilot` template**。同 registry 内 `getSystemTemplate('copilot')` 已定义但 useCopilot 写死字符串。
11. **writingAgent 与 advisor 双 taxonomy 并存**（`WRITING_TASK_TYPES` 7 项 client-side + `ADVISOR_TASK_TYPES` 5 项 server-side）。合并为单一 `TASK_TYPES = {agent + scope}` 枚举。
12. **legacy `applyAdvisorReplacement` 与新 `applyWritingAgentAction` 并存** — 同一文件 `advisorResultApplier.js`。建议 `applyAdvisorResult(content, result, env)` 内部分流，保留 legacy 为 internal helper。

### P3 — 数据完整性 / schema 一致性

13. **`runtimeEvents` 时间戳格式**：`runtimeEvents.js` envelope 含 `ts`，但 `RUNTIME_EVENT_LIMIT` 仅按数组长度截断，不去重；如果同一秒发两个 turn 会重复存。
14. **`mapBinding` 双 schema**：`playableWorldEntry.consumePlayableWorldHistoryIntent:219-225` 期望 `{country,city,scene}` 3 字段；`playableHistoryEntry.buildPlayableHistoryActions:54-59` 期望 `{siteId,cellIds,markerIds,routeIds}` 4 字段。两条 helper 互不认知对方 schema。
15. **`worldMapState.map.countries: []` 永不被填充**。schema 占位字段从 gameStore.js:25-30 起就存在，但 extractLocationChanges 仅写 currentScene。
16. **`runtimeState.geoHistoryContext` 永远为空对象**（声明 forward-compat，没人写）。
17. **Voronoi 地图与 `gameStore.worldMapState` 永不通**。点 burg / marker 不写 currentScene；history node entry 写 currentScene 后，Voronoi 地图上的位置标识不更新。

### P4 — UX/接线的最后一公里

18. **`GmPersonaLauncher` 4 个页面 import 但无 advisor 桥**。persona 的 `open` event 从未被 bind 到 `useAdvisor.askAdvisor` 或 `openAdvisor`。
19. **`buildPlayerHistoryNodeFromPlotJournal` 0 生产 caller**。W5 的 UI 触发入口（"归档这段冒险"按钮 / chapter 收尾 / 章节数 snap）未做。
20. **P2 字体系落 FINALIZE (per STATUS Next up)** — pyftsubset LXGW 596KB → 250KB；新增 `--font-body` Noto Serif CJK SC subset；LXGW 改 `font-display: optional` lazy load。
21. **`/readyz` / `/healthz` / 404 endpoint (per Tier 1 综合报告 + agent-maintenance)** — 健康检查 + 404 处理。

---

## 6. 各系统"已落地 / 待接入"汇总

### 6.1 History System

- ✅ W1 `extractMapSemantics`（mapSemantics.js 9 类、单元测试 18 个）
- ✅ W2 `generateGeoHistory`（24 个模板、单元测试 18 个）
- ✅ W3 `playableHistoryEntry + OpeningPage` 卡片 UI
- ✅ W4 `consumePlayableWorldHistoryIntent` runtime patch + worldbookContextBuilder historyEntryIds boost + history-node-init runtimeEvent + playerHistory helper
- ⚠ P0 缺：production 触发（worldbook import 后 / Voronoi 生成后 / 进入游戏时的"自动跑"）
- ⚠ P0 缺：`worldStore.addPlayerHistoryNode` action + normalizeWorldbook 保留 `playerNodes`
- ⚠ P0 缺：`gameStore.setHistoryNode` 或类似 setter，使 `runtimeState.historyNode` 真有写入

### 6.2 Geography System

- ✅ Voronoi 地图端到端：WorldMapPanel → worker → generateMap → renderMap → Canvas + markers + dragging
- ✅ AI 地图生成：WorldMapPanel.handleGenerate → voronoiMapAdapter → LLM → 解析 → saveVoronoiConfig → 重新 generate
- ✅ GeographyPanel 编辑 overview + locations 树（free-form names + AI concept-map）
- ✅ `gameStore.worldMapState` 双向写入：history node entry + AI 文本 regex extract
- ⚠ P3 缺：Voronoi 地图与 worldMapState 双向不通（点 burg 不写 currentScene）
- ⚠ P3 缺：`mapBinding` 双 schema 统一
- ⚠ P3 缺：`worldMapState.map.countries[]` 字段决策（删 / 填 / 改名）

### 6.3 Writing / Director Agent

- ✅ `runGenerationTask/Stream` 统一 LLM transport
- ✅ `applyWritingAgentAction` 6 action typed apply 协议
- ✅ `writingAgentContext.buildWritingAgentContext` schema-versioned envelope
- ✅ `writingAgentReferences` rank + budget + pin
- ✅ 多个 agent 测试覆盖（advisorResultApplier 40+, writingAgentContext 20+, writingAgentReferences 25+, ...）
- ⚠ P0 缺：reference retrieval 全员化（仅 useCopilot 接，7 个其他 agent 不接）
- ⚠ P2 缺：8+ system-prompt 复制合并
- ⚠ P2 缺：`ADVISOR_PROMPTS` 死代码清理
- ⚠ P2 缺：WRITING_TASK_TYPES / ADVISOR_TASK_TYPES 双轨合并
- ⚠ P2 缺：legacy `applyAdvisorReplacement` 与新 `applyWritingAgentAction` 整合
- ⚠ P2 缺：useCopilot.js:247-257 改用 promptRegistry.getSystemTemplate('copilot')
- ⚠ P4 缺：GmPersonaLauncher → advisor 桥
- ⚠ P4 缺：director agent（直接 advise 模式）

### 6.4 跨系统链路

- ✅ Token budget / history 排序 / runtimeEvents envelope / contextLedger 40-cap / session debounce / 3 unload flush / adventure trigger 速率 / plot journal 8 turn auto-compress / memory dedup 等核心不变量
- ⚠ P0 缺：`runtimeState.historyNode` 写入路径
- ⚠ P1 缺：`runtimeEvents` producer/consumer 全套接通
- ⚠ P1 缺：`state_delta` 接通或决策移除
- ⚠ P1 缺：`contextual` flag enforcement
- ⚠ P2 缺：3 条平行 worldbook-context consumer 合并
- ⚠ P2 缺：`getWritingContextDetail` localStorage fallback 决策（删 / 保留）
- ⚠ P3 缺：localStorage backup 漏列 `dialogue_characters` + 动态 `worldbook_<id>`

---

## 7. 建议的下一阶段方向（仅规划，不动代码）

按 (a) 影响用户 / 真实不可用 / (b) 影响维护成本与未来扩展 三档分类。本调研不动代码，下列方向仅作讨论材料。

### 7.1 真实链路收口（用户级别）

- **W5 spec/plan**：把 player history 写回 + history node 自动接入真正接通。具体：扩 worldStore.normalizeWorldbook 保留 `playerNodes`；新增 `worldStore.addPlayerHistoryNode(node)` action；定 UI 触发入口（建议优先 adventure trigger 收尾或 `/experience` 进度事件触发）；同步加 `runtimeState.historyNode` 真写入路径，让 worldbookContextBuilder 的 history-aware 分支真正起作用。
- **history 自动生成接线**：在 `worldbookImportGeneration` 或 worldbook 创建/导入管线（`worldStore.createWorldbook` / `setItem` 路径）的某处插入 `extractMapSemantics(mapData) → generateGeoHistory(worldbook, mapSem) → 保存到 worldbook.geoHistory`。或在 `/settings/world-map` 的 "Voronoi 生成完成" 后插入 trigger。无论哪条路径，都让生成器从"测试单跑"变成"产品可触"。
- **runtime event → context 接入**：选定一条窄路径先接通，比如 `(state_delta, path:'worldMapState')` 通过 allowlist 内置 producer（替代 extractLocationChanges 的部分功能）或 `(display_event, contextual:true)` 折入 collectScanText。这样不一次性接通 5 种 envelope，但能保证"声明的机制 work"。

### 7.2 规范化减负（维护成本级别）

- **narrator system prompt 单一源**：新建 `src/services/systemPrompts.js` 取代 8+ 处复制。或在 `promptRegistry.js` 内集中后让所有消费者改 import。最小落地：保留 `promptBuilder.buildSystemPrompt`，把 InputArea.vue:248 / gameStore.js:1646, :2414 / api.js:529, 880 改为 import 同一函数返回的字符串。
- **`ADVISOR_PROMPTS` 决策**：(a) 接进 `advisorTaskService.requestAdvisorTask` 服务端构造（需要服务侧改动），或 (b) 删除。建议优先 b，因为 server-side prompt 不应放在 client bundle。
- **`WRITING_TASK_TYPES` 与 `ADVISOR_TASK_TYPES` 合并**：单一 `TASK_TYPES = { agent: 'writing'|'advisor'|'director', scope: string }`。让 server side 也消费同一枚举。
- **`useCopilot` 走 promptRegistry**：useCopilot.js:247-257 改用 `getSystemTemplate('copilot')`。2 行改动立即可做。
- **`applyAdvisorResult` 分流**：在 `advisorResultApplier.js` 加 `applyAdvisorResult(content, result, env)`，内部分流 `actions` 数组 vs legacy mode，把 Writing.vue:1209 dispatch 收敛到这一处。

### 7.3 接入完整性

- **GmPersonaLauncher → advisor 桥**：bind persona `open` event 到 `useAdvisor.askAdvisor` / `openAdvisor`。需要确认 advisor 4 个页面（Writing / ProseEssay / Notes / Experience）的 persona 文案差异（per C3 demo-persona-brief §6.1）。
- **gmPersonaLauncher 的 protocol 化**：把 `persona` 字段从 worldbook 加到 settings，从 GmPersonaLauncher 接收 prop 8 字段，与 C3 follow-up 衔接。
- **P2 字体 FINALIZE**：pyftsubset LXGW 596KB → 250KB（OFL），新增 `--font-body` Noto Serif CJK SC，lazy load。当前已记入 STATUS Next up。
- **`/readyz` / `/healthz` + 404 endpoint** —— EXPRESS 端（per Tier 1 综合报告）。
- **C2 follow-up BUG-CTX-1/2/3/4** —— 边境王国 5 keyword 命中修（per STATUS Next up 内容线程）。

### 7.4 长期

- **Voronoi ↔ worldMapState 双向**：点 Voronoi burg 设 currentScene（geographyStore action + gameStore setter chain）。当前一条 history node entry 写 country/city/scene 后，Voronoi 视图侧仍不知道"现在玩家在哪"。
- **mapBinding schema 统一**：定义 `mapBinding = { country, city, scene, siteId?, cellIds?, markerIds? }` 一次到位，两条 helper 同时认。
- **worldMapState.map.countries[] 决策**：删 / 填 / 改名为 `worldMapSnapshot`。当前占位 schema 对用户不可见但增加认知成本。

---

## 8. 验证用文档路径

- `/home/recoletas/jiuguan/text-game-framework/docs/agent-runs/2026-07-01-geo-history/W{1,2,3,4}-*.report.md` — 历史系统 4 阶段实施报告
- `/home/recoletas/jiuguan/text-game-framework/docs/STATUS.md` lines 65-71 — 2026-07-01 W4 / W3 / W2 / W1 entry
- `/home/recoletas/jiuguan/text-game-framework/AGENTS.md` — 项目硬规则

---

## 9. 调研方法与材料

- 4 个并行 Explore 子任务，每任务对应 (a)(b)(c)(d) 子报告
- 直接 Read / Grep / Glob，未跑测试 / 未起 typecheck / 未改代码
- 4 子报告交叉验证的关键事实（双向已读 / Grep 互相印证 / file:line 一致）

**未做的事**（per 用户要求"不要改代码"）：
- 未读 src/views/WelcomeView.vue, src/styles/*, src/components/workbench/* 等与本调研无直接关系的文件
- 未跑 `npm run test:run` / `npm run build`
- 未起 ESLint / vue-tsc 等
- 未起 git worktree
- 未在 code 内加 TODO / FIXME 标注
- 未改 STATUS.md / AGENTS.md / .agents/skills/*
- 未起新 spec / plan

**调研输出的下游使用建议**：本报告可作为 (i) 下个 spec 的事实 baseline；(ii) agent 任务 boards 的 priority 信号；(iii) 后续 phase planning 的 "现状快照" 引用。
