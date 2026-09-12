# 设定页 ↔ Authoring 联动闭环回执 · 2026-09-12

执行 [联动闭环计划](../plan/settings-authoring-linkage-closure-20260912.md) L0–L8。工作区 `main`（基线 `7961e00`）。状态分开标记：**代码闭环** ✓／**浏览器旅程** ✓（强化后 Gate 20/20）／**用户视觉确认** 待定／**真实模型拿到更新资料** 待验（计划 §L8 人工项）。

## 完成了什么（作者视角）

- 从正文右栏「设定/条目/地图」出发，打开的总是**当前书绑定的那本世界书**的同一对象；上下文条显示「PROJECT · 书名」，选择器在项目模式锁定（换关联回工作台做）。
- 三个设定页（设定/地图/条目）之间切换**不再丢书和绑定**，对象定位按分区白名单转换或清除。
- 每个设定页标题栏有「回到正文」：激活既有写作标签（不重复建页），原章、选区、滚动由既有 volatile ledger 恢复（fail-closed）。
- 路由快照与书绑定不一致时提示「关联已变化」并按当前绑定打开；未绑定/书不存在/库缺失各有明确空态，不回退别的库。
- 设定页改完回来，工作台立即可见（标签重激活重挂载 + storage/visibility 监听做保守刷新）；本地编辑提交前核对条目 revision，跨页新值不会被旧快照覆盖。

## 实际变更

| 文件 | 内容 |
|---|---|
| `src/services/workspace/settingsProjectContext.js`（新） | 纯合同：`resolveSettingsProjectContext`（project/global 双模式、route-mismatch/unbound/missing-book 稳定 reason）+ `createSettingsWorldbookLoader`（竞态令牌，typed 缺失） |
| `src/composables/useSettingsProjectContext.js`（新） | 三页共用：route query 驱动解析 + 世界书加载；项目模式不回退 active |
| `src/services/workspace/workspaceTabContract.js` | 新增项目 surface `entries`（高级条目）；`DUAL_MODE_ROUTE_NAMES`；`resolveRouteIntent` 双模式回落全局不再截断；`tabRouteEqualsRoute` 计入 entryId |
| `src/services/workspace/workspaceRouteAdapter.js` | 双模式路由豁免「补默认书」canonical 化（全局访问不被吞进项目） |
| `src/components/workbench/SettingsSectionNav.vue` | 分区切换 query 白名单（bookId/worldbookId 恒保留；placeId→设定/地图；entryId→条目/地图；historyNodeId→地图） |
| `src/components/workbench/SettingsContextBar.vue` | 项目模式：`PROJECT · 书名`、选择器锁定、route-mismatch 提示条 |
| `src/components/workbench/SettingsReturnToManuscript.vue`（新） | 三页共用「回到正文」：激活/重建 Authoring 标签，44px 触控 |
| `src/pages/StructuredSettings.vue` | 共用上下文；未绑定/缺书空态；项目模式禁换库；`openFocusedPlaceMap` 携带项目上下文（L6） |
| `src/pages/WorldBookEditor.vue` | 先解析正确库再处理 entryId；query 条目缺失显示「已不存在」横条（不静默选第一条）；项目模式锁选择器/隐藏新建；加载中隐藏旧库内容 |
| `src/pages/WorldMapPage.vue` | 改用共用组合式（删除自带的重复解析）；`openProjectWorldbookAdvanced`（地图→条目，L6）；标题栏回程 |
| `src/components/geography/WorldMapPanel.vue` | 地点实体行新增「打开条目」（open-entry 事件，L6） |
| `src/pages/Authoring.vue` | 统一出程 helper `openProjectSettingsSurface`（出程捕获 volatile 恢复状态）接入双栏「完整设定」、涌现来源、历史定位、现场调整；L5 跨标签/可见性保守刷新（revision 比较后换新，带通知）；本地条目编辑冲突防护（revision 不一致→刷新+提示，不覆盖） |
| `src/stores/worldStore.js` | 全局 active 世界书加载增加最后请求获胜门禁；慢库仍返回自己的快照，但不能在快库之后反向覆盖页面或持久化选择 |
| `src/__tests__/authoringWorldbookBinding.test.js` | 既有合并用例扩展解析器/竞态合同（预算内，20/200 不变） |
| `scripts/authoring-ui/settings-linkage-check.mjs`（新） | L8 浏览器 Gate：两书两库播种 + 项目/全局模式、删除失效与精确回程旅程 |

## 独立验收后的纠正

首版 18/18 Gate 可以通过，但不足以支撑原回执的全部结论。独立复验发现并修正：

- 页面级加载令牌只能丢弃旧返回值，不能阻止 `worldStore.loadWorldbook()` 先写入全局 active；现把最后请求获胜门禁下沉到真实副作用 owner，并用慢 legacy 归档库与快库交错加载固化合同。
- 无 `bookId`、有显式 `worldbookId` 的全局高级条目路由虽然解析正确，却未真正加载指定库；现补全显式全局加载和缺失空态。
- Authoring 历史定位误把 `historyId` 发送到高级条目页；现改为地图页 canonical `historyNodeId`。
- 原 J5 只检查“没有甲库内容”，空页面也会通过；现同时要求乙库目标条目可见。原 J7 只检查“有任意正文单元”；现要求回到精确书、章和原 writing unit。
- 将“删除当前场引用 → 回正文显示失效”并入真实出程 ledger 旅程；另补“外部设定更新 → 冻结推演在 provider 前 stale、零请求继续”。

## 验证

- 浏览器 Gate `settings-linkage-check.mjs`：**20/20**（1440 全量 + 390 抽查 + fixture 书全链）。覆盖：
  J1a 项目上下文/条目定位/选择器锁定/回程入口；J1b 跨库 entryId 明确缺失不串库；J1c 普通设定编辑→保存→回正文→工作台搜索命中新值；J2 分区切换保留 bookId/worldbookId；J3 回到正文落原书；J4a 未绑定空态、J4b 缺书明确缺失；J5 B 书精确显示乙库目标条目且无甲库内容；J5b 全局显式 worldbookId 精确加载；J6 路由不一致提示并按当前绑定；J7 地点→地图→条目→删除→回原书/原章/原 writing unit→显示现场引用失效全链；J8 390 无溢出、回程可达。
- `npm run verify:full` exit 0（20/20 文件、200/200 用例、双 build、diff check）。
- 既有 Gate 不回归：F1 rehearsal 48/48、F1 IF 28/28、推演右栏 Gate **304/304**；新增第 304 项证明外部设定更新后，冻结推演在请求模型前进入 stale。

## 边界与未验

- **真实模型拿到更新资料**未验：计划 §L8 的人工项（真实作品改人物动机/地点限制→重开新推演确认模型确实使用新资料）留给用户；自动 Gate 已证明旧冻结推演会 stale 且不会发出模型请求，但不评价新一轮真实输出。
- 回程自动旅程已断言到「原书、原章、原 writing unit」；字符级选区与精确滚动仍复用既有 volatile 合同和 F1-0 覆盖，本轮没有重复制造一套定位测试。
- 多浏览器**同时**编辑同一条目仍是保守策略（检测变更—阻止旧写—刷新），不是协同编辑。
- 历史节点本轮只做到「可定位、可查看、可作为显式参考」（计划允许），历史状态自动投影留 Living History。
- L0 基线表见 [settings-linkage-l0-baseline-20260912.md](./settings-linkage-l0-baseline-20260912.md)；计划中"两段长程执行"实际以单会话完成 L0–L8，最低合格交付（L0–L5 + P0 旅程）已超额。
