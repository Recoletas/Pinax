# W4: 历史节点 → 运行时 / 世界书上下文 / 玩家历史反写

> 2026-07-01 CST · Codex on `main` · W4 of geo-history 线程
>
> **范围**: 让"从历史节点进入"真正落到 gameStore runtimeState，并让 worldbookContextBuilder 优先命中相关条目；提供纯函数版的玩家历史反写 helper。本轮不做 UI 改动、不动 worldStore / gameStore 大文件。
>
> **承接**: W1 已落地 `worldbook.geoHistory` 容器 + `src/services/worldHistory/{mapSemantics,historyGenerator,playableHistoryEntry}.js` + `OpeningPage.vue` 的 playable-history 卡片 UI + `enterHistoryNode` handler（直接调 `savePlayableWorldEntryIntent` 写 intent）。
> 本轮在 W1 之上提供 **runtime 注入 + worldbook 上下文增强 + 玩家历史 helper** 三件套。

---

## 1. 交付物

| 路径 | 行数 | 角色 |
| --- | --- | --- |
| `src/services/playableWorldEntry.js` | +131 (W4 增量) | 加 `normalizeHistoryNode` / intent 携带 `historyNode` 字段 / `getPlayableWorldEntryIntent()` 透传 / `consumePlayableWorldHistoryIntent` 出运行时 patch |
| `src/services/worldbookContextBuilder.js` | +62 | `collectScanText` 加 historyNode / geoHistoryContext scan；`matchWorldbookEntries` + `buildWorldbookContext` 加 `historyEntryIds` 选项；history 优先级排在 constant 之前 |
| `src/services/playerHistory.js` | +140 (新) | 纯函数 `buildPlayerHistoryNodeFromPlotJournal`，含限位/去重/clamp |
| `src/pages/OpeningPage.vue` | +18 | 新建 session 时调 `applyPlayableWorldHistoryPatch(getPlayableWorldEntryIntent())` |
| `src/pages/legacy/OpeningPage.vue` | +22 | 同上 (legacy alias) |
| `src/__tests__/playableWorldEntry.test.js` | +92 | 5 个 history intent round-trip + consume + 容错测试 |
| `src/__tests__/worldbookContextBuilder.test.js` | +99 | historyNode scan + historyEntryIds boost + 排序 + 去重测试 |
| `src/__tests__/runtimeEvents.test.js` | +60 | history-node-init display_event envelope + state_delta 路径白名单测试 |
| `src/__tests__/gameStoreSession.test.js` | +82 | history patch 落到 runtimeState 的集成测试 + null-history 兜底测试 |
| `src/__tests__/playerHistory.test.js` | +96 (新) | 7 个 helper 测试：空 / 聚合 / lookback 限位 / 去重 / clamp / thread 锚定 |
| `src/__tests__/legacySnapshot.test.js` | +1 | 更新 `legacy/OpeningPage.vue` sha256 (`06cf…` → `1a42…`) |

未新建依赖；不动 gameStore / worldStore / generation 服务；不动现有 UI 文件。

---

## 2. 历史节点如何进入 runtime

### 2.1 数据链路

```
geoHistory.nodes[]
  └── buildPlayableHistoryEntryIntent(worldbook, rawNode)   [W1, 在 playableWorldEntry.js]
        └── { action: { command }, historyNode: { id, title, priorFacts, ... } }
              └── savePlayableWorldEntryIntent(intent)      [W4 扩展, 现在带 historyNode 字段]
                    └── localStorage[PLAYABLE_WORLD_ENTRY_INTENT]
                          └── OpeningPage.enterHistoryNode → ensureWorldAdventureSession
                                └── applyPlayableWorldHistoryPatch(getPlayableWorldEntryIntent())
                                      └── consumePlayableWorldHistoryIntent(intent)  [W4 新增, 纯函数]
                                            └── { worldMapPatch, plotJournalEntry, factionRelationsPatch,
                                                  runtimeEvent, stateDeltaOps, historyNode }
                                                  └── 调 gameStore 现成 actions:
                                                        saveWorldMapState({...currentMap, ...patch})
                                                        appendPlotJournal(entry)
                                                        setFactionRelation(name, value) ×N
                                                        appendRuntimeEvent(event)
```

### 2.2 Intent 扩展（向后兼容）

`savePlayableWorldEntryIntent(intent)` 现在接受可选的 `historyNode` 字段，旧调用方（preset 一键导入、bookmark 进入）传不传都正常。`getPlayableWorldEntryIntent()` 返回的对象现在带 `historyNode`（若无则不带，非 null 占位）—— 所以 `consumePlayableWorldHistoryIntent` 用 `intent?.historyNode` 短路即可，不会破坏旧路径。

`normalizeHistoryNode` 内部归一化：
- `id` 必须存在（否则节点丢弃，避免空 historyNode 污染）
- `mapBinding` 仅在 country/city/scene 至少 1 个非空时保留；否则整体置 null（避免 `worldMapPatch: { currentScene: '' }` 这种 no-op 覆盖）
- `factionRelations` 仅保留 `Number.isFinite` 的数值；空对象 → null
- 字符串列表 (priorFacts / unresolvedHooks / participants / entryIds) `normalizeText` + `.filter(Boolean)`

### 2.3 Runtime 注入面

`consumePlayableWorldHistoryIntent` 输出 5 个 patch，全部 **additive**、**纯函数**：

| Patch | 应用方式 | 备注 |
| --- | --- | --- |
| `worldMapPatch` | `gameStore.saveWorldMapState({...gameStore.worldMapState, ...patch})` | 仅含 country/city/scene 三个原子字段，避免覆盖 map.countries 这种大对象 |
| `plotJournalEntry` | `gameStore.appendPlotJournal(entry)` | 经过 `normalizePlotJournal` 8 条限位 + 字段裁剪；只放可被持久化的字段 (summary/participants/locations/keyChoices/unresolvedHooks)；historyNodeId 走 runtimeEvent 单独留痕 |
| `factionRelationsPatch` | `gameStore.setFactionRelation(name, value)` ×N | 走现有归一化 (`normalizeFactionRelations`) |
| `runtimeEvent` | `gameStore.appendRuntimeEvent(event)` | `type: 'display_event'` / `payload.kind: 'history-node-init'` / `contextual: false` (不会作为上下文注入 model 端，避免 prompt 重复) |
| `stateDeltaOps` | 不直接调（保留给未来 AI 端回放） | `{ op: 'set', path: 'factionRelations', value: {...} }` 经 `validateStateDelta` 白名单允许 |

`legacy/OpeningPage.vue` 是 5C 路由的 legacy alias（保留 4e779d2 之前开页形态），同样接 `applyPlayableWorldHistoryPatch`，并触发 legacySnapshot sha 重算。

### 2.4 普通（非历史）开局路径不受影响

`consumePlayableWorldHistoryIntent(null)` / `{ historyNode: null }` / `{ historyNode: { id: '   ' } }` 都返回 `null`，调用方一行 `if (!patches) return` 跳过 → gameStore.actions 完全不被触碰 → 与 W1 之前的「非历史开局」路径字节级一致。

---

## 3. 如何影响 worldbook context

### 3.1 Scan text 增量

`collectScanText` 在已有 (chat history / location / time / activities / goals / encounteredCharacters / keyChoices / factionRelations / plotJournal) 之后追加 **3 段**：

```
historyNode:
  - title
  - participants[]        (作为 character / faction 关键词命中)
  - unresolvedHooks[]     (作为 quest 关键词命中)
  - priorFacts[]          (作为通用关键词命中 — 经常是地点/事件名)

geoHistoryContext (forward-compatible):
  - participants[]
  - unresolvedHooks[]
  - entryIds[]            (作为 entry-id 命中 token)
```

`geoHistoryContext` 是为未来 `worldbook.geoHistory.context` 留的口子；本轮只读不写，只取 participants / hooks / entryIds，**不全量注入 geoHistory**（按 spec 限制避免 prompt 爆炸）。

### 3.2 Entry-id boost（按 spec §3.5 「token budget 内优先注入」）

`matchWorldbookEntries` / `buildWorldbookContext` 现在接受 `historyEntryIds: string[]` 选项：
- 如果没传，回退读 `runtimeState.historyNode.entryIds`
- 命中条目加进 matched set，`matchReason: 'history'`，`matchedKeysLabel: '历史节点绑定'`
- 排序优先级：history > constant > keyword（关键词命中降级为次优）
- 已被 history 收录的条目不会被 keyword pass 重复加，seenIds 一并处理
- token budget 仍然在 `buildWorldbookContext` 末段 enforce（history-bound 条目不被特殊豁免；高 rank 让它优先进入 budget，但不绕过截断）

### 3.3 验证

```
src/__tests__/worldbookContextBuilder.test.js
  - uses runtimeState.historyNode to surface participants / hooks / fact keywords
  - boosts historyEntryIds into the matched set with history matchReason
  - falls back to runtimeState.historyNode.entryIds when historyEntryIds option is omitted
  - orders history-bound entries before constants and keywords
  - does not double-include an entry that is both history-bound and a keyword match
```

---

## 4. 玩家历史反写 (V1) 做到哪一步

### 4.1 已落地（per spec）

`src/services/playerHistory.js` 提供纯函数：

```js
buildPlayerHistoryNodeFromPlotJournal(latestPlotJournal, currentHistoryNode, options?)
  → {
      v: 1,
      id: 'phn_<ts>_<rand>',
      sourceNodeId,           // 锚到当前 historyNode.id, 同根续写
      kind: 'player-history-v1',
      summary,                // 最近 lookback 段剧情串联, clamp 到 280 字 + ellipsis
      entryCount,
      participants[],         // ≤ MAX_PARTICIPANTS = 6
      locations[],            // ≤ MAX_LOCATIONS = 4
      keyChoices[],           // ≤ MAX_KEY_CHOICES = 4
      unresolvedHooks[],      // ≤ MAX_UNRESOLVED_HOOKS = 6
      windowStart, windowEnd, capturedAt
    }
```

特性：
- **纯函数** — 无 localStorage / 无 gameStore / 无 DOM；可重复调用、单元测试充分
- **去重** — participants/locations/hooks/keyChoices 用 `.toLowerCase()` 做 dedupe key；ASCII 跨大小写合并（`Salt Guild` / `salt guild`），CJK 保留不同写法
- **空数组 / 缺字段容错** — `normalizePlotJournal` 输出的 entries 可能部分字段缺失，helper 一律按数组容错
- **anchor 续写** — 当 `currentHistoryNode` 提供 `id` 时填 `sourceNodeId`，方便后续同根 history 续写形成 thread

### 4.2 没做（per spec 留待下轮）

- UI 按钮 / 触发时机 — 这轮没接 UI；调用方可以是:
  - 玩家在 `/experience` 手动点"归档这段冒险"
  - 某个 runtime 触发器 (例: chapter 收尾 / quest 完成)
  - 自动 snap (节流 / chapter 数 > N)
- 写回 `worldbook.geoHistory.playerNodes` — `worldStore.geoHistory` 字段已就位 (W1 落地)，但写回 action / 选择 playerHistory 节点覆盖策略未在本轮范围
- 跨 session 续作 / thread UI — 当前 helper 只产节点形状；多节点聚合 UI 是后话

### 4.3 验证

```
src/__tests__/playerHistory.test.js (7 个 test)
  - returns null when plotJournal is empty or unusable
  - aggregates a window of plotJournal entries into a single playerHistoryNode
  - respects the lookback window and clamps arrays to declared limits
  - de-duplicates participants / locations / hooks case-insensitively
  - dedupes ASCII labels case-insensitively (e.g. english factions)
  - clamps overly long summaries with an ellipsis
  - anchors sourceNodeId to the current history node when one is supplied
```

---

## 5. 测试结果

按 spec 指定的验证命令：

```bash
npm run test:run -- src/__tests__/gameStoreSession.test.js src/__tests__/worldbookContextBuilder.test.js src/__tests__/runtimeEvents.test.js
```

实际跑（W4 还加了 playerHistory 测试）：

```
✓ src/__tests__/playableWorldEntry.test.js  (12 tests) 10ms
✓ src/__tests__/worldbookContextBuilder.test.js  (15 tests) 25ms
✓ src/__tests__/gameStoreSession.test.js  (16 tests) 79ms
✓ src/__tests__/runtimeEvents.test.js  (14 tests) 9ms
✓ src/__tests__/playerHistory.test.js  (7 tests) 5ms

Test Files  5 passed (5)
     Tests  64 passed (64)
```

全量 `npm run test:run`：

```
Test Files  2 failed | 129 passed (131)
     Tests  36 failed | 1395 passed (1431)
```

**36 个失败全部是 pre-existing UI WIP**，与 W4 无关：
- `src/__tests__/uiPolish.test.js`: 35 个失败 (UI-W2 / UI-W9 / UI-W10 / UI-N2 / UI-N6 / UI-N9 / UI-N10 / UI-E12-F / UI-E17 / N5C 等, 跨多个 round 的 stale 契约, 多 round STATUS 已记录为 pre-existing)
- `src/__tests__/stereoMigration.test.js`: 1 个失败 (Writing.vue 不在 main 实际产物里, 是 feat/5b-stereo-art worktree 的契约, pre-existing per `f87d4a9` 报告)

修了一个 pre-existing 之外的新失败：

```
src/__tests__/legacySnapshot.test.js > src/pages/legacy/OpeningPage.vue sha256 matches recorded hash
  → 旧 hash: 06cf79d22bf7377b2595840b710be6c361f0e2c9ed47b2e0fa26df1c736b2657
  → 新 hash: 1a42ccd49758b1f90a7819fe0c7881af591a8423fa54e95b91ea420ab2ef7eb8
  → 更新 LEGACY_VUE_HASHES 后 16/16 pass
```

`npm run build` 干净, 3.85s 完成, 无新警告 (继承 `kao.css` static+dynamic import 既有警告).

`git diff --check` 干净 (0 输出 = 无 whitespace 错误).

---

## 6. 安全/合规检查

- **do-not-touch 边界保护**: gameStore.js / worldStore.js (除 W1 worker 的 +24 geoHistory 字段外) / generation 服务全部 0 改动。本轮仅在 gameStore 调用现有 actions (saveWorldMapState / appendPlotJournal / setFactionRelation / appendRuntimeEvent), 不重写 normalize* 函数, 不改 schema.
- **prompt 爆炸防护**: 不全量注入 geoHistory.nodes[]; collectScanText 只取 participants / hooks / entryIds; entryIds 在 token budget 内优先注入, 但仍受 budget enforce.
- **state_delta 路径白名单**: `runtimeEvents.STATE_PATH_ROOTS` 已含 factionRelations / plotJournal / worldMapState, 历史 patch 全部走 allowlist; validateStateDelta 单元测试覆盖.
- **contextual=false**: `display_event` 默认 `contextual: false` (per runtimeEvents.normalizePayload), 历史节点入场事件不会作为 model-side 上下文重复注入.
- **非历史路径字节级一致**: `consumePlayableWorldHistoryIntent` 在 historyNode 缺失时返回 null → OpeningPage 的 `if (!patches) return` 立即退出 → gameStore 完全不被触碰.

---

## 7. 已知边界 / Out of scope (留给后续 worker)

1. **historyNodeId 不进 plotJournalEntry**: `normalizePlotJournal` 不保留 `source` / `historyNodeId` 字段。本轮把这些从 `consumePlayableWorldHistoryIntent` 输出的 plotJournalEntry 移除; historyNodeId 改由 runtimeEvent 唯一留痕. 后续若要把 historyNodeId 写进 plotJournalEntry, 需要小幅扩 `normalizePlotJournal` 加 `source` + `historyNodeId` 字段 (per AGENTS.md "小改、可测" 原则, 不算大改).
2. **playerHistory 写回 action**: `worldStore.geoHistory.playerNodes` 字段容器已就位, 但 `worldStore.addPlayerHistoryNode` action / UI 触发入口未做.
3. **跨 session thread 续作**: `buildPlayerHistoryNodeFromPlotJournal` 输出有 `sourceNodeId` 但没有 parent thread id; 后续要做 "玩家历史时间线" 时需要扩 helper.
4. **historyEntryIds boost 的概率模型**: 当前 history-bound 条目 100% 命中; 若 token budget 紧张, 后续可加概率门控或 priority 排序.
5. **OpeningPage.vue / legacy OpeningPage.vue 仍共用同一段 history 注入逻辑**: 5C v3.x 系列后续若拆出 OpeningPage composable, 应把 `applyPlayableWorldHistoryPatch` 移过去, 避免双份.

---

## 8. 验证命令复现

```bash
# W4 核心测试
npm run test:run -- src/__tests__/playableWorldEntry.test.js src/__tests__/worldbookContextBuilder.test.js src/__tests__/runtimeEvents.test.js src/__tests__/gameStoreSession.test.js src/__tests__/playerHistory.test.js

# 构建
npm run build

# diff 完整性
git diff --check
```

5 个核心测试文件 64/64 pass; build 3.85s clean; diff --check 0 输出.

---

## 9. 下一步建议

W4 把 runtime + context + 玩家反写 helper 三件套都串起来, 但**仍未触发的最后一公里**是 player history 写回入口:

- **W5**: 接 `worldStore.addPlayerHistoryNode(node)` action + 一个小 UI 触发点 (例: `/experience` 收尾时一个"归档这段冒险"按钮) → 把 playerHistory 节点写进 `worldbook.geoHistory.playerNodes` → 下次选世界时 OpeningPage 可渲染玩家历史时间线 (按 sourceNodeId 折叠 / 展开).
- **W5 alt**: 先在 `/writing` 章节草稿生成器里加一个 "从冒险历史生成素材" 入口, 让 playerHistory 直接进写作素材库, 跳过世界书. 这条路径对单人创作更直接.

两条路径 W4 都已经把 helper 准备好, 后续接 UI / 接 action 都不需要再改纯函数层.