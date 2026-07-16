# W2: 地理驱动历史节点生成器 — 实施报告

> 2026-07-01 CST · Claude on `main`（无 worktree，直接在共享工作树）· W2 of geo-history 线程
>
> **范围**：纯数据模型 + 纯函数生成器。输入 `worldbook.entries` + `mapSemantics`，输出 `geoHistory`。
> **不做**：UI、不接 Experience/OpeningPage、不调用 AI、不改地图核心、不动其他窗口的 WIP。

---

## 1. 交付物

| 路径 | 角色 |
| --- | --- |
| `src/services/worldHistory/historyGenerator.js` | 主模块：确定性 RNG + 条目索引 + mapSemantics 归一化 + 6 类历史模板 + `generateGeoHistory()` |
| `src/services/worldHistory/playableHistoryEntry.js` | helper：`buildPlayableHistoryActions(geoHistory)`，给 OpeningPage 后续消费 |
| `src/__tests__/worldHistoryGenerator.test.js` | 18 个 vitest 测试，覆盖稳定性 / 可玩节点契约 / 语义→类型分流 / W1 集成 / 优雅降级 / JSON 序列化 |
| `docs/agent-runs/2026-07-01-geo-history/W2-history-generator.report.md` | 本报告 |

均为新增（untracked）。未改动任何已 tracked 文件。

## 2. geoHistory 结构

`generateGeoHistory(worldbook, mapSemantics, options?)` 返回可 JSON 序列化对象：

```
{
  seed,                       // number | string，同 seed 稳定的种子
  mapId,                      // string
  ages:   [{ id, key, label, order }],            // 用到的年代阶梯
  nodes:  [ <node> ],                             // 8-12 个历史节点
  links:  [{ id, from, to, type: 'leads-to' }],   // 同站点内因果链
  entryBindings: [{ nodeId, siteId, entryIds[] }] // 每个节点绑定的世界书条目
}
```

### node 结构

```
{
  id,                 // hn-<siteId>-<templateType>[-v2...]，全局唯一
  title,              // 「<站点名>·<模板标签>」
  yearLabel,          // 「<年代> · 纪元前 N 年」
  type,               // 模板类型，跨语义类型全局唯一（见 §3）
  summary,
  ageId,
  mapBinding: { siteId, cellIds[], markerIds[], routeIds[] },
  participants: { factions[], characters[], locations[], items[] },  // 名字，非 id
  causes: [ ... ],
  consequences: [ ... ],
  entryIds: [ ... ],          // 绑定的世界书条目 id（去重、去空）
  unresolvedHooks: [ ... ],
  playable: true | false,
  openingHook,                // 开场钩子文本
  actionHooks: [ { id, label, title, detail, command } ]  // 对齐 playableWorldEntry.js 约定
}
```

关键取向：**历史节点绑定世界书 `entryIds`，不是只有文本**。`participants` 存展示用名字，`entryIds` 存可回查的 id，`entryBindings` 顶层再冗余一份便于索引。

## 3. 模板规则

每个语义类型 4 个模板，`node.type` 全局唯一，因此**不同语义类型必然产出不同 node type**（测试锁死两两不相交）：

| 语义类型 | node.type（4 个） |
| --- | --- |
| `tradeHub` | `tax-rights` 税权 / `port-closure` 封港 / `smuggling-ring` 走私 / `guild-schism` 行会分裂 |
| `frontierZone` | `refugee-tide` 难民潮 / `ranger-vanish` 巡骑失踪 / `border-war` 边境战争 / `watchline-fall` 哨线失守 |
| `isolatedSite` | `ruin-unsealed` 遗迹开启 / `taboo-broken` 禁忌被破 / `disappearance-probe` 失踪调查 / `forbidden-cult` 禁教 |
| `hostileRegion` | `great-disaster` 天灾 / `forced-migration` 迁徙 / `resource-crisis` 资源危机 / `creeping-plague` 瘟疫 |
| `fertileRegion` | `sovereignty-founding` 王权 / `granary-control` 粮仓 / `inheritance-feud` 继承 / `taxation-revolt` 征税 |
| `strategicRoute` | `ambush-set` 伏击 / `blockade` 封锁 / `secret-order` 密令 / `escort-run` 护送 |

模板决定 node.type、可玩性、主参与体类型（`primary`）、开场角色、行动标签/指令、以及 causes/consequences/unresolvedHooks 的语气。`openingHook` 与 3 个 `actionHooks`（查证 / 施压 / 行动）由模板 + 上下文通用组装，动作形状对齐既有 `playableWorldEntry.js` 的 `{ id, label, title, detail, command }`。

## 4. 输入契约

### 4.1 mapSemantics —— 同时吃 W1 真实产物与简单契约

W1（`mapSemantics.js` 的 `extractMapSemantics`）产出的是**分类结果对象**（9 类数组 + meta），不是 `sites[]`。W2 的 `normalizeSites` 三路都接：

1. **W1 分类对象**：检测 `tradeHubs/borderCrossings/.../mountainPasses` 任一数组存在 → 按固定顺序拍平。site 用 `id`/`title`/`type`。
2. **`{ sites: [...] }`** 简单契约（本任务建议形状）。
3. **裸站点数组**。

W1 有 9 类，W2 有 6 模板，多出的 3 类按语义归并（`SEMANTIC_ALIASES`）：

- `borderCrossing → frontierZone`
- `riverMouth → tradeHub`
- `mountainPass → strategicRoute`

其余别名也接：`frontier/border/march`、`hostile/wasteland`、`isolated/remote`、`trade/hub/port/market`、`fertile/farmland`、`route/road/pass/corridor`。未知语义类型按站点序号稳定回退到 6 类之一。

W1 无独立 `routeIds`，道路来源以 `road:<i>` 藏在 `markerIds` 里 → W2 从 `road:` 前缀派生 `routeIds`。W1 site 带 `score` → W2 **高分站点优先**（稳定排序，tie-break 原序）。

### 4.2 worldbook —— 条目识别

`indexEntries` 识别 7 类：`organization / location / character / event / quest / item / lore`，并对齐世界书别名（`org|faction→organization`、`setting→lore`）。既接 `{ entries: [...] }` 也接裸数组。

## 5. 生成算法（确定性）

1. seed → `xmur3` 派生 32-bit 整数，作为各类挑选的旋转偏移 → **同 seed 稳定**（仓库此前无可复用 seeded RNG，本模块自带；`Math.random` 全程未用）。
2. 归一化站点（含 W1 拍平 + 高分优先排序）。
3. **模板在站点间轮转（interleave）**：`t0` 先铺满各站点，再 `t1`……在 12 节点上限内尽量覆盖更多站点，而不是被前几个站点吃满。
4. 节点数目标 `[8, 12]`：baseCombos ≥ 8 取前 min(len, 12)；不足 8 用变体（`-v2`…，抬高年代/幕次）补齐。
5. 年代阶梯 `开辟纪 / 拓野纪 / 争锋纪 / 当世纪`，按节点序号分组，年份确定性递推。
6. 每节点绑定参与体（按 seedOffset+index 旋转挑选），组 `entryIds`（主参与体优先）。
7. **可玩判定**：模板可玩 且 绑定了 ≥1 个 `entryId`。若可玩数 < 3 且尚有带 entryIds 的节点，提升补足到 3。
8. 同站点节点串成 `leads-to` 因果链。
9. 清理内部记账字段，输出干净且 JSON 无损往返。

## 6. 边界与降级

- **无站点**：返回结构完整但空的 geoHistory（`nodes/links/ages/entryBindings` 皆 `[]`），不抛错。
- **无世界书条目**：仍按站点生成 ≥8 个节点，但 `entryIds` 为空、`playable=false`、openingHook/actionHooks 结构仍在（可展示、不可玩）。这是「至少 3 个 playable」硬指标之外的优雅降级路径。
- **完全空输入 / null**：不抛错，返回空 geoHistory。
- **不做**：完整文明/人口/家谱/逐回合战争模拟；不接 UI；不调 AI；`mapId`/`seed` 若 W1 未带需由集成方经 `options` 传入。

## 7. 测试结果

`npm run test:run -- src/__tests__/worldHistoryGenerator.test.js`

```
Test Files  1 passed (1)
     Tests  18 passed (18)
```

覆盖：同 seed 逐字节稳定 / 不同 seed 有别 / 8-12 节点且 ≥3 可玩 / 顶层结构 / 每个可玩节点有 openingHook+actionHooks+mapBinding+entryIds 且 entryIds 真实存在于世界书 / 不同 semantic type → 不同 node type（两两不相交 + tax-rights/ranger-vanish 锚点）/ JSON 无损往返且无内部字段泄漏 / 别名归一化 / 别名站点分流 / 变体补齐到 8 / **直接消费 W1 分类结果对象** / W1 空结果降级 / 高分站点优先挤出低分 / 无条目降级 / 无站点降级 / 全空不抛错 / `buildPlayableHistoryActions` 只返可玩节点且带动作 / 空输入返 `[]`。

### 验证命令与结果

| 命令 | 结果 |
| --- | --- |
| `npm run test:run -- src/__tests__/worldHistoryGenerator.test.js` | 18/18 pass，exit 0 |
| `npx eslint`（W2 三个新文件） | 0 error / 0 warning，exit 0 |
| `node --check`（两个 service 模块） | syntax OK |
| `npm run build` | exit 0（`✓ built`）——见下方说明 |
| `git diff --check` | exit 0 |

### build 说明（并发窗口冲突，非本任务）

共享工作树里 `src/pages/OpeningPage.vue`（tracked，`M`）被**另一个窗口**正在改，当前处于 CSS 断裂中间态（`Unexpected }`），导致 `vite build` 提前失败。该文件不在 W2 范围内，未被 W2 触碰。为证明 W2 代码可构建：把该外部断裂文件临时 `git stash` 后 `npm run build` → **exit 0 `✓ built in 8.43s`**，随即 `git stash pop` 原样恢复。W2 代码本身构建干净；standing 失败 100% 来自外部 WIP。按多窗口规则（AGENTS.md + memory `stage_by_name_in_worktree.md`）W2 不修其他窗口的 WIP。

## 8. 未提交说明

工作树同时有 W1、W3 等多窗口 WIP（`OpeningPage.vue` / `worldStore.js` / `playableWorldEntry.js` / `worldbookContextBuilder.js` / `playerHistory.js` 等 tracked 改动）。W2 交付物全为 untracked 新文件，**未 commit**，避免把并发窗口的中间态卷进提交。等集成窗口统一验收后再按 `stage by name` 单独提交 W2 三个文件 + 报告。
