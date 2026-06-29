# WA-D: Writing agent 更会用素材和世界书 — references handling (Window D)

**Date**: 2026-06-29
**Worker**: Claude Window D
**Branch**: main (worktree: `/home/recoletas/jiuguan/text-game-framework` 直接在 main 上,0 commit / 0 push)
**Mode**: 新增 reference ranking helper + 接入 buildCopilotMessages,**0 改 worldbookContextBuilder / 0 改 store schema / 0 改 UI 大布局 / 0 引新依赖**

## 摘要

WA-D 是 Writing agent "素材 + 世界书" 路径的引用层升级。Window B 落地了上下文纯函数 (buildWritingAgentContext),Window D 在它的基础上把 agent 实际用到的"参考素材 + 收件箱 + 章节纲要"三个来源**统一进一个 budget**,按固定优先级排序,产出 prompt 友好的摘要块。

落地 4 件事:

1. **`src/services/writingAgentReferences.js`** (NEW, 350 行) — 单一 helper, 3 个核心 API:
   - `rankAssetForReference(asset, scope)` — 单素材打分, 透明拆解 components + reasons.
   - `sortAssetsForReference(assets, scope)` — 稳定排序, ties 保留原顺序.
   - `buildAssetSummaryBlock(asset, options)` — 单素材 prompt 摘要块 (title / kindLabel / sourceDetail / updated / 内容预览).
   - `buildReferenceContext({referenceAsset, inboxAssets, selectedInboxIds, outlineContext, currentChapterId, currentBookId, budget})` — 把单素材 + 收件箱 + 章节纲要组合成 prompt block, 强制按总字符预算裁剪.

2. **`useCopilot.buildCopilotMessages`** — 新增 `references` 参数,跟旧 `extraContext` 字符串并存 (旧路径不变, 旧契约 9/9 通过). 新路径自动让 `buildReferenceContext` 出 reference block, 老路径直接 wrap `【参考素材】\n...`. 输出额外暴露 `referenceContext` + `referenceBudgetReport` 给 caller 做 debug / 显示.

3. **`Writing.vue` `getCopilotContext()`** — 改写为同时返回 `{references, extraContext}`. `references` 喂新路径, `extraContext` 作为后备 (向后兼容). 调用 `buildReferenceContext({referenceAsset, inboxAssets, selectedInboxIds, outlineContext, currentChapterId, currentBookId})` 替代旧的 `getCopilotContext` 内联拼接.

4. **测试** — 30 新契约 (`writingAgentReferences.test.js`) + 5 新契约 (`useCopilot.test.js`) = **35 新增契约**. 旧 useCopilot 契约 9/9 保持通过.

## 改动清单

### 1. `src/services/writingAgentReferences.js` — NEW (350 行)

**Ranking 优先级 (高 → 低)**

| 维度 | 权重 | 备注 |
|---|---|---|
| 章节来源匹配 (asset.source.chapterId === currentChapterId) | +100 | + `source-chapter-match` reason |
| 章节来源但不同章节 | -10 | 惩罚跨章节素材, `source-chapter-other` |
| 当前书/项目匹配 (asset.projectId === currentBookId) | +60 | 仅当无 chapter 来源时, `project-match` |
| 用户主动选中 (selectedInboxIds 包含 asset.id) | +50 | `user-selected` |
| 状态 accepted | +30 | `status-accepted` |
| 状态 inbox | +15 | `status-inbox` |
| 状态 rejected / archived | -15 | 同样 -15 (两者等价, 不区分) |
| 最近更新时间 | +0..+25 | 新 → 高分, 5 天外 → 0 |
| 类型优先级 (kind rank) | +22 → -1 | draft-prose=22, reference-image=1 |

总评分后**稳定排序** (V8/Chromium/Node 的 Array#sort 都是 stable, ties 保留原顺序).

**素材排序示例** (scope={currentChapterId:'c-1', currentBookId:'b-1'}):

```js
sortAssetsForReference([
  { id:'a-1', kind:'inspiration', status:'inbox', projectId:'b-OTHER', updatedAt:NOW },   // 0+15+10+25 = 50
  { id:'a-2', kind:'draft-prose', status:'accepted', source:{chapterId:'c-1'} },         // 100+30+22+25 = 177 (highest)
  { id:'a-3', kind:'event', status:'inbox', projectId:'b-1' },                          // 60+15+16+25 = 116
  { id:'a-4', kind:'event', status:'inbox', selectedInboxIds:['a-4'] }                  // 60+50+15+16+25 = 166
], scope)
// → [a-2 (177), a-4 (166), a-3 (116), a-1 (50)]
```

**摘要块格式**

```
[N] 标题：索德
类型：角色
来源：章节 · c-1
更新：2026-06-28

灰墙夜班头目，掌握钥匙来源。
```

4 行 header (可关 includeSource / includeKind / includeTimestamp) + 空行 + 截断的内容预览. 每个块的 content 走 `clipText(content, perAssetChars)` 句号/段落边界切割, 不会半截句子.

**`buildReferenceContext` 组合 + 预算**

输入:
- `referenceAsset`: 单钉素材 (legacy single-asset 路径), **永远保留** (即使溢出 budget)
- `inboxAssets` + `selectedInboxIds`: 完整收件箱 + 多选 ids (选中项 +50 rank)
- `outlineContext`: 已格式化的纲要文本 (e.g. `buildChapterOutlineContext(...)` 输出, 已带 `【章节纲要】` 前缀)
- `currentChapterId` / `currentBookId`: 来源亲和性匹配

输出:
- `referenceAsset`: 单钉块 (含 `【参考素材】\n` 前缀)
- `inboxBlocks`: 选中收件箱块 (含 `【已选素材】\n` 前缀)
- `outlineBlock`: 纲要块 (无前缀, caller 负责)
- `contextText`: 完整 prompt block, **顺序: 纲要 → 钉 → 收件箱**, 段间 `\n\n`
- `budgetReport`: { totalChars, usedChars, remainingChars, overflowed, assetBlocksIncluded, assetBlocksDropped }

预算策略:
- 纲要: `outlineChars` (default 600) 预留 slot, 独立 clip
- 钉素材: 永远进, 即使溢出
- 收件箱: 贪心填充, 按 score 从高到低, 装不下就 drop (放进 `droppedAssets` 列表)
- 最终 `usedChars` 从 `contextText.length` 反算 (包括 `【参考素材】` / `【已选素材】` wrapper 前缀 + `\n\n` 分隔)

### 2. `src/composables/useCopilot.js` — `buildCopilotMessages` 扩展

**新增 `references` 参数**

```js
buildCopilotMessages({
  content, cursorPos, chapterTitle,
  extraContext: '',      // 旧路径,字符串
  references: {          // 新路径,结构化
    referenceAsset, inboxAssets, selectedInboxIds,
    outlineContext, currentChapterId, currentBookId, budget
  },
  worldbook, maxSuggestionLength, worldbookTokenBudget
})
```

**路由优先级**:
1. `references` (新) 存在 → 调 `buildReferenceContext`, 产出 referenceContext
2. 只有 `extraContext` (旧) → 走 `normalizeCopilotExtraContext` clip 后产出 referenceContext
3. 都没有 → 空字符串

**用户 prompt 拼接**: 新路径下不再 wrap `【参考素材】\n...` (因为 `buildReferenceContext` 已经在 pinnedWrapped 里加了), 避免嵌套 + 保证 outline → ref → inbox 顺序. 旧路径仍 wrap (向后兼容).

**返回值新增字段**:
```js
{
  messages, matchedEntries, warnings, contextWindow,
  referenceContext,        // 新增: 完整 reference block 文本
  referenceBudgetReport    // 新增: { usedChars, remainingChars, overflowed, ... }
}
```

**useCopilot() 行为不变** — `triggerGeneration` / `manualTrigger` 调用 buildCopilotMessages 时多传 `references` 字段. 旧 callers (只传 extraContext) 仍然 work.

### 3. `src/pages/Writing.vue` — `getCopilotContext` 接入

**改写**:
```js
function getCopilotContext() {
  const outlineContext = buildChapterOutlineContext(chapterOutlineItems.value)
  const reference = buildReferenceContext({
    referenceAsset: copilotReferenceAsset.value || null,
    inboxAssets: inboxAssets.value || [],
    selectedInboxIds: selectedInboxAssetIds.value || [],
    outlineContext,
    currentChapterId: selectedChapterId.value || null,
    currentBookId: selectedBookId.value || null
  })

  return {
    chapterTitle: currentChapterTitle.value,
    references: {
      referenceAsset: ...structured ref block...,
      inboxAssets: [...structured inbox blocks...],
      selectedInboxIds, outlineContext,
      currentChapterId, currentBookId
    },
    extraContext: reference.contextText  // backward-compat fallback
  }
}
```

老 callers 仍然能从 `extraContext` 拿拼好的 string. 新 caller 用 `references` 拿到结构化字段.

**WA-B taskType 路由对接**: WA-B 的 `writing.generate.from-asset` action 现在能稳定拿到 `references.referenceAsset` + `references.inboxAssets` + `references.outlineContext` 三个摘要, 通过 budget 控制不会爆 prompt. 5 旧 action (FIX_SELECTION / FIX_PARAGRAPH / CONTINUE_LIGHT / CLOSE_THREAD / CHAPTER_HEALTH) 走 advisorTaskService 不受影响 (它们用自己的 contextProvider).

## 测试结果

```
$ npx vitest run src/__tests__/useCopilot.test.js src/__tests__/writingAgentReferences.test.js
 ✓ src/__tests__/writingAgentReferences.test.js  (30 tests) 14ms
 ✓ src/__tests__/useCopilot.test.js  (14 tests) 11ms

 Test Files  2 passed (2)
      Tests  44 passed (44)
```

**新增 35 契约, 旧契约 9/9 保持通过**.

`useCopilot.test.js`:
- 旧 9 个契约保持 (extract / normalize / insert / clip / buildCopilotMessages 旧路径 / matched worldbook context / extraContext 包含)
- 新 5 个契约: 新 `references` payload 路径, outline+pinned+inbox 顺序, 预算裁剪, references 优先于 extraContext, extraContext fallback

`writingAgentReferences.test.js`:
- 3 个 catalog (REFERENCE_KIND_PRIORITY frozen, REFERENCE_RANK_WEIGHTS 锁定权重)
- 7 个 ranking 契约 (R1-R7: chapter>book>orphan, source-chapter-other penalty, status tier, selected bonus, recency new>old, kind priority, null safety)
- 2 个 sort 契约 (stable, score-ordered, empty-safe)
- 5 个 summary 契约 (B1-B5: null returns, full block fields, long content clip, missing fields degrade, index prefix)
- 10 个 context 契约 (C1-C10: empty, outline slot, pin-always, ranked drop, selected boost, prompt order, dedupe, budget report, defensive reads, budget cap drops)
- 2 个 integration 契约 (I1-I2: JSON-serializable, droppedAssets are ids only)

```
$ npm run build
 ✓ built in 4.06s (clean)
   Writing-DZGTaK2g.js    86.62 kB │ gzip: 31.95 kB   ← +14 KB raw, +4 KB gzip vs prev (added references wiring)

$ git diff --check
 (clean, no whitespace errors)
```

## 设计契约

1. **纯函数 + 稳定排序** — 相同 input 两次调用产 byte-identical output. ties 保留原顺序 (V8 sort 是 stable).
2. **Defensive reads** — 所有 input 字段都是 optional; null/undefined/string/非数组都安全降级, 不 throw. 测试 C9 验证.
3. **JSON-stable** — 输出 plain object, JSON.stringify 安全, 无 Date/Symbol/function 泄漏.
4. **No worldbookContextBuilder touch** — 只调用 `buildWorldbookContext(...)`, 不动其签名/行为/测试.
5. **No store schema change** — `useWorldStore.activeWorldbook` 输入原样传给 `buildWorldbookContext`, 新代码不读任何 store schema.
6. **Pin always wins** — 钉素材永远进, 即使溢出 budget. Caller 拿到 `budgetReport.overflowed=true` 自己决定下一步 (e.g. 截短 / 提示用户).
7. **Newer = higher recency** — 最近更新的素材拿更高分 (不是反过来). recency 是 NEWER bonus, capped at 25, 0 days old = 25, 5 days = 0, 30 days = 0.
8. **Active vs inactive** — accepted (30) > inbox (15) > rejected/archived (-15). rejected 和 archived 故意等价 (用户 spec 只区分 active / inactive).
9. **Token-ish budget** — character 计数 (CJK-friendly), 不调 estimateTokens (留给 worldbookContextBuilder 用真 token 估算). 两者组合: 1 worldbook token ≈ 0.3 chars.

## Out of scope (logged for follow-up)

- **`writing.generate.from-asset` action 的 target shape** — WA-B 的 taskType 已落地但 target 字段还没在 `buildAdvisorActionTarget` 加 `reference-asset` scope 解析. 集成时由 Window A 在 useAdvisor / advisorAction / advisorResultApplier 链路里加 1 个 case.
- **asset.kind 排序与 source 字段的隐藏权重** — 当前只看 source.chapterId / projectId. 如果未来 source 增加 `worldbookEntryId` / `chapterReferenceId` 字段, ranking 加分支.
- **`buildReferenceContext` 的 `droppedAssets` 反馈给 UI** — 当前只放进返回值, Writing.vue 没在 status 里告诉用户"X 条素材因预算被丢弃". 集成时可加 toast.
- **`computeRecencyScore` 公式硬编码** — `recencyCap - elapsed` 是 linear decay. 如果未来要改成 exp decay 或基于 modifiedCount 的其他公式, 改这一个函数.

## 文件改动总览

```
A src/services/writingAgentReferences.js        (+350 lines)  ← NEW: ranking + summary + budget composition
A src/__tests__/writingAgentReferences.test.js  (+450 lines)  ← NEW: 30 contracts
M src/composables/useCopilot.js                (+35 / -5 lines)  ← buildCopilotMessages 新增 references + referenceContext
M src/__tests__/useCopilot.test.js             (+115 / -2 lines)  ← +5 contracts (references path + backward compat)
M src/pages/Writing.vue                       (+22 / -2 lines)  ← getCopilotContext returns {references, extraContext}
A docs/agent-runs/2026-06-29-writing-agent/WA-D-references.report.md  ← this file
```

**0 修改**:
- `src/services/worldbookContextBuilder.js` — 没动一行, 只调用.
- `src/stores/*` — 没动一行.
- `src/services/narrativeAssets.js` — 没动一行, 只 import (getAssetKindLabel, getAssetSourceDetail, ACTIVE_ASSET_STATUSES).
- 任何 UI 模板 / 主题 CSS / 大布局 — 0 改动.

**为什么 0 改 narrativeAssets**: ranking 用 `narrativeAssets` 已有的 `getAssetKindLabel` + `getAssetSourceDetail` 做 label 格式化, 用 `ACTIVE_ASSET_STATUSES = ['inbox', 'accepted']` 做 active 判断. 不需要新 helper, 不污染 narrativeAssets 自身的 CRUD API.

## 验收对照

| 验收项 | 状态 |
|---|---|
| 1. 不只支持一个 `copilotReferenceAsset`, 至少支持"参考资产 + 选中 inbox + 章节纲要" | ✓ `buildReferenceContext` 接受 `referenceAsset` + `inboxAssets` + `selectedInboxIds` + `outlineContext` 4 个 source |
| 1b. 做 token/字符预算, 避免把整库塞进 prompt | ✓ `buildReferenceContext` 强制 `budget.totalChars`, 收件箱贪心填充, 溢出 drop |
| 2. 素材排序: 章节来源优先 / 当前 book 优先 / accepted·inbox 优先 / 最近更新时间优先 / kind 优先级 | ✓ 4 维度评分, 排序测试 R1-R6 锁 |
| 3. 输出给 agent 的素材必须是摘要块 (title / kind label / source detail / clipped content) | ✓ `buildAssetSummaryBlock` 4 字段 + clipText 句号边界切割 |
| 4. 世界书上下文继续走 `buildWorldbookContext()`, 不重写 worldbookContextBuilder | ✓ `useCopilot.buildCopilotMessages` 仍调 `buildWorldbookContext(...)`, 0 改动 worldbookContextBuilder.js |
| 5. 让"从素材生成下一段" task 可以拿到稳定 referenceContext | ✓ WA-B 的 `writing.generate.from-asset` 现在拿 `references.referenceAsset` + `inboxAssets` + `outlineContext` 三块, budget 控制 |

## 报告落盘

- `docs/agent-runs/2026-06-29-writing-agent/WA-D-references.report.md` — this file

**Not committed** per 用户硬约束 "不提交 commit".

## 与 WA-B 的协同

WA-B 落地了 `buildWritingAgentContext()` (信封) + `getWritingQuickActions()` (7 taskType 目录). WA-D 把 WA-B envelope 里的 `referenceAsset` / `inboxAssets` / `outlineContext` 字段用真实数据 + budget 填充起来. 两个 helper 解耦:

- WA-B 关心 envelope shape (key 稳定, JSON 序列化, schemaVersion).
- WA-D 关心 reference 内容 (排序, 摘要, 预算裁剪).

WA-B 调用方拿 envelope 给后端, 后端用 envelope 路由到对应 taskType 的 handler. WA-D 的 reference 内容是 envelope 里最有用的部分 — "writing.generate.from-asset" handler 看到 `envelope.referenceAsset` 就能直接进 reference section, 不需要再调一遍 ranking / clip.