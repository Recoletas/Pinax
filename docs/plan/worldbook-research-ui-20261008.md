# 世界书检索规划 · UI 接线设计（2026-10-08）

## 背景与目标

`src/services/worldbook/worldbookResearch.js` 提供「世界书检索规划」能力（规划检索词 → 联网搜索 → 抓取来源正文），全仓除 `src/__tests__/worldBookQuickImport.test.js` 外零生产调用方。本设计把它接进世界书界面，让作者能在世界书页内对世界设定做联网调研。

约束：不改后端（`/api/research/search`、`/api/research/fetch` 已存在于 `server/routes/research.js`，挂载于 `server/index.js:77`；检索词规划走既有 `runGenerationTask` → `/api/generate`）；不做新路由；克制、单页内嵌。

## 服务面回顾（输入/输出/错误语义）

- `getWorldbookResearchSettings()` / `saveWorldbookResearchSettings()`：设置持久化在 `STORAGE_KEYS.WORLDBOOK_RESEARCH_SETTINGS`（`worldbook_research_settings_v1`）。形状 `{ enabled, provider('brave'|'tavily'|'searxng'), apiKey, maxQueries(1-4,默认3), maxResults(2-6,默认5) }`。
- `planWorldbookResearchQueries({ brief, genreLabel, nameHint, maxQueries, signal })`：AI 规划检索词；模型不可用/失败时**不抛错**，回落 `buildFallbackResearchQueries` 并带 `warning` + `plannedBy:'local'`。
- `searchWorldbookSources({ queries, settings, signal })`：POST `/api/research/search` → `{ provider, queries, results[{id,title,url,snippet,sourceKind,quality,provider}], partial, warnings }`；失败**抛错**（`code` 如 `SEARCH_KEY_REQUIRED`/`SEARCH_PROVIDER_NOT_CONFIGURED`）。
- `fetchWorldbookSourcePages({ sources, signal })`：POST `/api/research/fetch` → `{ sources[{...,content,evidenceBlocks,evidenceLevel:'page'|'snippet',fetchError?}], warnings }`；单源抓取失败降级为 `evidenceLevel:'snippet'`。
- `WORLDBOOK_RESEARCH_PROVIDERS`：provider 下拉的数据源（`needsKey` 决定是否显示 Key 输入）。

## 设计决策

### D1 入口位置：WorldBookEditor 新增第 5 个 tab「联网调研」

`src/pages/WorldBookEditor.vue` 的 `editorTabs` 现有 6 个分区（总览/条目管理/章回结算/基础设定/导入导出/分组管理），每个 tab 一张 `.card`。调研是「为设定 gathering 素材」的活动，插在**基础设定之后、导入导出之前**：先定基础设定 → 联网调研补依据 → 再导入导出/分组。不新增路由、不加浮动按钮，与既有 tab 模式完全一致。顺手给 tab 按钮补 `data-test="editor-tab-{key}"` 锚点（供冒烟定位，不影响断言）。

### D2 面板形态：两步流 + 可折叠设置

新组件 `src/components/worldbook/WorldbookResearchPanel.vue`（信息架构参考 storyflow-kit `WorldbookPage.tsx` 的「顶部检索输入 → 结果计数 → 命中卡片（标题+摘要+读全文）」，不引入 React/Tailwind）：

1. **问题输入**：研究问题 textarea（首次进入用当前世界书的 `worldDescription`/名称预填，可改）+ 可选「类型标签」「名称提示」。主动作「生成检索计划」→ `planWorldbookResearchQueries`。
2. **计划展示**：检索词列表（带 `plannedBy` 徽标：AI 规划 / 本地兜底）+ 规划意图 + 警告行。可「重新规划」，或「开始检索」→ `searchWorldbookSources` + `fetchWorldbookSourcePages`。
3. **发现列表**：来源卡片（标题外链、来源类型、证据级别徽标「全文/摘要」、摘要、可展开正文 `<pre>`）；顶部计数与警告汇总。
4. **设置**：`<details>` 折叠区——provider 下拉（Brave/Tavily/SearXNG）、API Key（`needsKey` 时显示，密码框）、检索词数（1-4）、每词结果数（2-6），change 即 `saveWorldbookResearchSettings` 持久化。
5. **运行控制**：AbortController，运行中显示「停止」；组件卸载时 abort。
6. **错误态**：规划失败回落本地（service 已兜底，展示 warning）；检索失败显示错误码+人话文案+「重试」；抓取失败由 service 降级为摘要+warnings，不阻断。

### D3 边界（v1 不做）

- 不做「发现 → 一键写入条目/资料库」（需要再裁定写回哪个域），面板只读展示与外链。
- 不接 `researchWorldbookGap` 增量补查（它依赖 quick-import 管线的 claims 上下文）。
- 真实模型/真实检索的端到端验收不做（成本），冒烟只验入口可见、面板开合、空态与错误态。

## 改动清单

| 文件 | 改动 |
|---|---|
| `src/components/worldbook/WorldbookResearchPanel.vue` | 新增（面板全部逻辑与样式，scoped） |
| `src/pages/WorldBookEditor.vue` | `editorTabs` 加 `research` 项；模板加对应 `<section class="card">`；tab 按钮补 `data-test` |
| `src/i18n/en.json` | 补面板新 key（中文 key → 英文） |
| `docs/plan/worldbook-research-ui-20261008.md` | 本设计说明 |

## 验收

- `npx eslint` 改动文件 0 error。
- `npm run build` exit 0。
- `npx vitest run src/__tests__/worldBookQuickImport.test.js` 不劣化（该文件是 worldbookResearch 服务行为的既有钉子）。
- 3001 冒烟（先 build 再验）：入口 tab 可见、面板开合、空态/设置折叠/错误提示可达；截图三张落 `_staging/wbr-ui/`。
