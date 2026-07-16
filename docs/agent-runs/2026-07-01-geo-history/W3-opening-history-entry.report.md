# W3 — geoHistory 接入世界书 + 开场页历史节点入口

Session: Claude (window 3) · 2026-07-01 · branch `main`

## 目标

把 geoHistory 接进世界书数据层与开场页：用户生成/选择世界后，可在开场页看到"可玩历史节点"卡片，并从某个节点进入 Experience；同时保留现有三条普通开局行动。

## 与并行窗口的协同

本任务与 window 1/2 并行，`playableWorldEntry.js` / `OpeningPage.vue` 在工作树中已被它们改动。**已对齐它们既定的接口，未另立竞争字段**：

- intent 的历史载荷是**嵌套对象** `intent.historyNode = { id, title, priorFacts, unresolvedHooks, participants, entryIds, mapBinding:{country,city,scene}, factionRelations }`，由 `savePlayableWorldEntryIntent` 内的 `normalizeHistoryNode` 归一化（window 1/2 已实现）。因此本窗口**没有**再加 `historyNodeId` / `priorFacts` 等扁平字段——任务描述里的这些字段在既有实现中以 `historyNode.*` 承载，语义等价。
- window 1/2 已在 `OpeningPage.vue` 加了 `applyPlayableWorldHistoryPatch()`（在建会话时读取 intent，把 map/faction/journal patch 灌进 gameStore），并在 `worldbookContextBuilder.js` 消费 `runtimeState.historyNode`。本窗口的入场流程正是喂给这条链路。
- geoHistory **容器**（挂在 worldbook 上）此前无人定义，由本窗口定义：`worldbook.geoHistory = { nodes: [...] } | null`。

## 用户流程

1. 选/导入世界 → 若该世界书带地图历史（`geoHistory.nodes`），开场页 `.opening-copy` 内出现「历史节点 · 可进入」区。
2. 每张卡显示：`yearLabel` / `title` / `summary` / 参与方(`participants`) / 地点提示(`locationHint`) + 「进入这段历史」按钮。**只展示 `playable === true` 且有可展示内容的节点。**
3. 点「进入这段历史」→ `buildPlayableHistoryEntryIntent(worldbook, node)` 生成 intent（含 `action.command` 隐藏开场指令 + `historyNode` 运行时子集）→ `savePlayableWorldEntryIntent(intent)` 存储 → `ensureWorldAdventureSession()` 建会话（触发 window 1/2 的 `applyPlayableWorldHistoryPatch` 灌 map/faction/journal）→ 发送隐藏 command → `router.push('experience')`。
4. 三条普通开局行动（开局 / 改写 stage-command）原样保留，未替换。

## 缺失 geoHistory 时的行为（优雅降级）

- 无地图 / 未生成历史：`normalizeWorldbook` 把 `geoHistory` 归一为 `null`，`createWorldbook` 默认 `null` → **不阻塞导入三路径**（预设 / 小说文本 / AI 说明）。
- 开场页历史区 `v-if="hasSelectedWorldbook && playableHistoryNodes.length"`：无节点时整块不渲染，无空壳、无占位假数据。
- `getPlayableHistoryNodes(null | {geoHistory:null} | {nodes:[]} | 全 unplayable)` 一律返回 `[]`。

## 改动文件

| 文件 | 改动 |
|---|---|
| `src/stores/worldStore.js` | 新增 `normalizeGeoHistory()`；`normalizeWorldbook()` + `createWorldbook()` 归一/保留 `geoHistory`（缺失→null，数组→`{nodes}`，对象保留生成器字段仅强制 nodes 为数组，丢弃非对象节点）。 |
| `src/services/playableWorldEntry.js` | 新增 `describePlayableHistoryNode()`（展示视图容错读取 year/title/summary/participants/locationHint/playable）、`getPlayableHistoryNodes()`（过滤 playable + 附 `raw`）、`buildPlayableHistoryEntryIntent()`（geoHistory 节点 → 可存 intent，含 command + historyNode）。未改动 window 1/2 的 `normalizeHistoryNode` / `save` / `consume`。 |
| `src/pages/OpeningPage.vue` | 模板 `.opening-copy` 内加历史节点卡片区（`<div>`，非 `<section>`，避免破坏既有 copyBlock 契约）；`playableHistoryNodes` computed；`enterHistoryNode()`；archive-token 样式（无 raw hex/`!important`/`:global`，与现有 5C 风格一致）；640px 全宽。 |
| `src/__tests__/playableWorldEntry.test.js` | +4：`getPlayableHistoryNodes` 过滤/降级、`buildPlayableHistoryEntryIntent` 生成+存储往返/空值。 |
| `src/__tests__/worldBookQuickImport.test.js` | +4 `GEO-HISTORY` describe：`normalizeWorldbook` 保留 geoHistory / 无地图→null 不阻塞 / `updateWorldbook` 后挂 / 数组归一。 |
| `src/__tests__/uiPolish.test.js` | +3 `GEO-HISTORY` describe：开场页历史区静态契约 + geoHistory helper 接线 + 保留三条普通开局行动。 |

## 测试结果

验证命令（任务指定）：

```
npm run test:run -- src/__tests__/playableWorldEntry.test.js \
  src/__tests__/worldBookQuickImport.test.js \
  src/__tests__/uiPolish.test.js -t "GEO-HISTORY|OpeningPage|playable"
```

- **35 passed**（全部本窗口新增/相关契约通过），270 skipped。
- **2 failed（均为既有 stale 契约，非本窗口引入）**，已核对 `git show HEAD`：
  1. `ui polish contract > keeps the playable-worldbook entry path visible…` — 断言 `WorldBookQuickImport.vue` 含 `选择一个世界`；HEAD 该文件 **0** 匹配（S17 简化时移除）。本窗口未改该文件。
  2. `UI-E12-F … V1-A: Experience.vue no longer renders <CharacterBackdrop>` — 断言 `Experience.vue` **不**含 `<CharacterBackdrop>`；HEAD 该文件 **3** 匹配。本窗口未改该文件。
  - 与 `docs/STATUS.md` 记录的 uiPolish 多处历史 stale 契约一致。

其它：

- `npm run build` — **通过**（3.96s）。构建期发现并修复了一处并行写入造成的 `.opening-mission` 选择器行丢失（孤立声明块 → 多余 `}`），修复后 style 花括号 108/108 平衡。
- `git diff --check` — **clean**。
- forbidden sweep（本窗口新增 CSS）：无 `:global` / `!important` / 新 raw hex（仅沿用既有 `rgba(0,0,0,…)` text-shadow 与 `var(--archive-*)` / `color-mix`）。

## 范围边界（未做 / 交接）

- 未做复杂时间线图（按任务只做稳定卡片）。
- 未改地图生成核心算法、未引入新依赖。
- 历史节点生成器（geoHistory 内容产出）属 window 1/2；本窗口只定义容器 shape + 消费。
- `runtimeState.historyNode` → 会话运行时的 map/faction/journal 灌注由 window 1/2 的 `applyPlayableWorldHistoryPatch` / `worldbookContextBuilder` 承担，本窗口已对接。
- `docs/STATUS.md` handoff 交由集成负责人（Codex）统一收口——STATUS.md 当前被并行窗口占用，未在本窗口写入以免冲突。
