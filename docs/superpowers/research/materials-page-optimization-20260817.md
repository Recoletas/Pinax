# 素材页优化调研 — 次要背景（非主轴）

> **2026-08-17 用户转向声明**：素材页不算项目核心，主轴转向**小说插画 + 小说改编漫画**方向。本文件降级为**次要背景**，仅保留 §1 现状快照作为后续小优化时的参考。
> 主轴调研请看姊妹文件 `docs/superpowers/research/illustration-and-comic-20260817.md`（待开）。
>
> **范围**：发散性调研 + 脑暴，**只找灵感点**。具体计划 / 实现 / 重构方案不在本调研范围（用户已明确）。
> **素材页规模**：Notes.vue 5539 行 / narrativeAssets.js 579 行 / mediaAssetStore.js 472 行，是 Pinax 最大最复杂的页面之一。

---

## §0 阅读须知 + 验证图例

**文档定位**：本调研是 WNB-6A / 素材页优化之前的发散灵感收集 + 脑暴，不替代 brainstorming → writing-plans 流程；不写实现、不修 bug、不动 STATUS / PLAN / LOG、不写新 skill。

**验证图例**：

| 标记 | 含义 | 出现位置 |
|---|---|---|
| 🟢 | 多源印证（≥ 2 个不同生态，或 ≥ 3 个独立产品收敛） | §G 主题 |
| ⚠️ | 落地前需二次核实（通常是该 agent 已标 "I cannot verify" 的细节） | §G 主题内的细节项 |
| ✓ | 已通过本会话 WebFetch / WebSearch 一手核实 | 各 §0 节 |
| 𓈊（默认） | 二手来源整理，未直接核实 | 各节默认 |

**用户拍板题**（由用户判断优先级，不在本研究解决）：见 §G.3。

**反向映射**：见 §G.5「§1.3 症状 → §G 主题 + 灵感条目」表（待 §G 综合时补）。

---

## §1 Pinax 素材页当前快照

### §1.1 素材页定位

`src/pages/Notes.vue`（路径 `/materials`，别名 `/notes`），activityKey = `materials`，是 Pinax 写作素材的统一收件箱 / 编辑台。

| 用户声明的灵感来源（隐含） | 隐喻 | Pinax 当前对应 | 状态 |
|---|---|---|---|
| 视觉参考板（pinboard） | drag-arrange / cards / visual layout | `multi-canvas`（主卡 + slip 栈，UI-N10 MAX_PINNED_SLIPS=9999）+ 副阅读台（notes-sidekick） | 拖拽 + z-index + 持久化接口齐全，但 K3 升为 1 列后视觉体验有限 |
| 创作者素材库（Lightroom / Eagle） | metadata-heavy image library + tags | `ASSET_KINDS`（7 类）+ `ASSET_STATUSES`（4 态）+ `image.presentation`（fit/scale/positionX/Y/wrap/align/textGap/anchorOffset 8 字段）+ `embeddedImagePresentations`（按字符串 key 索引） | metadata 字段细，但视觉 metadata 编辑 UI 弱（kind select + status 切换外露，其余隐藏） |
| 数据库式资产管理（Airtable / Notion DB） | typed records + relations + filters | `narrativeAssets.js` 含 list/add/update/delete/setStatus/merge，但无 typed schema、无 relations、无 query DSL | 数据层 CRUD 完整，typed + relations 缺失 |
| 书签 / 引用管理（Raindrop / Pinboard） | url / file collect with tags + description | 部分通过 `sourceRefs: ContentRef[]`（14 种 refType：worldbook-entry / map-site / history-node / session-message / plot-journal / narrative-asset / canvas-card / chapter / storyboard-shot / comic-page / comic-panel / image / video / audio）实现 | source trace 完整，但无用户可见的「tag / collection」层 |
| 世界构建资产（World Anvil / Kanka） | typed entities: character / location / faction | `ASSET_KINDS` 中 `character-fact` + `worldbook-draft` 间接承担；与 `worldbook-workflow` skill 已有对象层（Character / Place / Faction） | 跨域 schema 协调未做（见 §G 主题） |
| 视觉项目管理（Milanote / Miro） | boards + columns + visual grouping | `groupedChapters` 按 `kind` 7 类分组（罗马编号 + 颜色） + 抽屉盒 + 5 候补扩展格 | 7 类分组 + 罗马编号已落地，但「可视化分组 UI」与「卡片画布」是双轨，不是同源 |

### §1.2 当前架构关键路径

- **页面**：`src/pages/Notes.vue`（5539 行，3 列 grid：260px drawer + 1fr reading-deck + 340px sidekick）
- **数据**：
  - `services/narrativeAssets.js` —— ASSET_SCHEMA_VERSION=1 / 7 kind / 4 status / `ContentRef` 14 类型 / `image.presentation` 8 字段 / `embeddedImagePresentations` by string key
  - `services/media/mediaAssetStore.js` —— 图像资产 IndexedDB 桥
  - `services/media/narrativeImageAssetBridge.js` —— 图像 + 文字 asset 桥
  - `services/agents/creativeGraphAgentContext.js` —— 素材 advisor 上下文
- **AI**：`useAdvisor` + `materialAdvisorActions`（精简当前素材 / 分类建议 / 拆分建议）+ `generateProfessionalInfoForAsset`
- **画布集成**：
  - `useCanvasBoard` composable —— 6 个 drag/drop handler + `bringToFront` + `focusedZId` + 持久化 positions
  - `services/relationCanvas.js` —— 素材 → 画布卡同步
  - `goToComics()` —— 素材路由到漫画制作
- **副阅读台（notes-sidekick）**：
  - 双 workspace：`materials`（静态 4 张 related）+ `illustration`（ImageGenerationWorkbench）
  - 选中态 → 同类优先 + 不足补近期（上限 4 张）
- **批量操作**：checked → import / merge / accept / archive / delete
- **辅助**：找替换 / 取名 / 字体面板 / image layout 8 种 / 状态 / 字数 / 字符统计 / AI 精简 / advisor

### §1.3 当前主要问题（用户感知 + STATUS/git log 提取）

| 类别 | 具体症状 | 来源 |
|---|---|---|
| **schema 类型化弱** | `kind` 是字符串枚举（7 值），无 typed schema；`image.presentation` 是嵌套字段但 UI 不暴露大部分字段 | narrativeAssets.js 设计 |
| **relations 缺失** | `sourceRefs` 是单向数组（asset → ref），无反向 query（ref → assets）；14 种 refType 散落在不同语义层 | narrativeAssets.js inferSourceRefs |
| **状态机分散** | asset.status 4 态（inbox/accepted/rejected/archived）+ batch 操作 + advisor 转换，三层机制叠加 | narrativeAssets.js setNarrativeAssetStatus + Notes.vue material-selection-stamp |
| **typed objects vs worldbook 重复** | worldbook 已有 Character/Place/Faction 对象（worldbook-workflow），但 asset kind 的 character-fact 是简化版；两边状态不同步 | worldbook + narrativeAssets schema 协调缺失 |
| **UI/UX：3 列密度高** | 260px drawer + 1fr reading-deck + 340px sidekick = 桌面拥挤；移动端 3 段折叠（index/content/tools）但 K3 简化后 slip 拖拽少 | Notes.vue K3 2026-06-27 |
| **UI/UX：image metadata 编辑弱** | kind select + status 切换外露；fit/scale/positionX/Y/wrap/align/textGap/anchorOffset 8 字段需要逐项 UI，但当前只暴露 8 种 layout preset | DEFAULT_IMAGE_PRESENTATION 8 字段 + Notes.vue imageLayoutOptions |
| **UI/UX：K3 简化后多卡画布单卡** | 原 UI-N10 多卡画布 + N6/N9 拖拽 + z-index，但 K3 升为 1 列，slip 拖拽成「隐藏接口」；用户感：「拖拽 + 持久化接口 仍保留，但 boardRef 现在绑定 main card 编辑区，没视觉元素触发拖拽」 | Notes.vue UI-N10 → K3 简化注释 |
| **UI/UX：副阅读台 navigation / 视图切换弱** | sidekick 双 workspace 切换是 tab，但内容态（材料 vs illustration）是隐藏；用户需要理解 workspace 概念 | sidekickWorkspace 注释 |
| **性能：MAX_PINNED_SLIPS=9999** | 原 N6 是 3，N10 改成 9999，K3 简化后实际不渲染 slip 拖拽但 positions reactive 仍保留 → 状态膨胀潜在风险 | pinnedSlipPositions |
| **AI 渠道：advisor 三任务** | refine / classify / split 三任务由 `creativeGraphAgentContext` 拼上下文，与写作 advisor 同源；advisor 多 provider 端点 + 空响应 / 30s 超时链 | git log 2026-08-11 + STATUS |
| **跨页路由：materials ↔ writing ↔ canvas ↔ comics** | 4 页跨（assetId 双向参数），但无统一"当前素材焦点"概念 | Notes.vue `goToComics` / `router.push('materials')` / Canvas 路由 |

---

## §A 视觉参考板 / pinboard（Pinterest / Eagle / Milanote / PureRef / Are.na）
> **调研人**:A（并行 agent）。**scope**:drag-arrange / cards / visual layout / spatial collections

## §B 创作者素材库（Lightroom / Capture One / Adobe Bridge / Eagle / Photo Mechanic）
> **调研人**:B（并行 agent）。**scope**:metadata-heavy image library / tags / ratings / smart collections / metadata editing UI

## §C 数据库式资产管理（Airtable / Notion DB / NocoDB / Baserow）
> **调研人**:C（并行 agent）。**scope**:typed records / relations / views (grid / gallery / kanban / calendar) / formulas / rollups

## §D 书签 / 引用管理（Raindrop.io / Pinboard / Diigo / Linkwarden）
> **调研人**:D（并行 agent）。**scope**:url / file collect / tags / collections / full-text search / archive snapshot

## §E 世界构建资产（World Anvil / Kanka / Notebook.ai / LegendKeeper / Mythos）
> **调研人**:E（并行 agent）。**scope**:typed entities (character / location / faction) / relations graph / templates / consistency checks

## §F 视觉项目管理（Milanote / Miro / Mural / ClickUp views / Notion timeline）
> **调研人**:F（并行 agent）。**scope**:boards / columns / visual grouping / canvas + list dual view / templates

---

## §G 跨节综合 —— 主 session 汇总（待补）
> §G.1 八条跨节主题 + §G.2 矩阵 + §G.3 待用户拍板题 + §G.4 与现有约束对齐 + §G.5 反向映射表 + §G.6 总览

---

> 各 §A-§F 由对应并行 agent 追加。完成后由主 session 汇总 §G。

## §1.4 TL;DR（5 分钟速查，待 §G 后补）
## §G 反向映射表 —— 从 §1.3 症状找 §G 主题 + 灵感条目（待 §G 后补）