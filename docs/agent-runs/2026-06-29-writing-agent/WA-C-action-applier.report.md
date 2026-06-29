# WA-C: Writing Agent action 客户端应用器 (Claude Window C)

**Date**: 2026-06-29
**Worker**: Claude Window C
**Branch**: main (worktree: `/home/recoletas/jiuguan/text-game-framework` 直接在 main 上,0 commit / 0 push)
**Mode**: 扩展 applier + 接 Writing.vue + 加契约 + 加测试,**0 改 server / 0 改 store schema / 0 引新依赖 / 0 碰 Experience/E18**

## 摘要

WA-C 是 Window A schema (WA-R) + Window B context routing (WA-B) 之后的客户端应用层。新增 `applyWritingAgentAction(content, action, env)` 纯函数,支持 6 类 action (replace_range / insert_at_cursor / append_to_outline / create_asset / set_reference / review_only),返回 `{ ok, content, cursorPos, sideEffects, message, reason?, range? }`。`sideEffects` 是不直接写 localStorage 的纯数据 (3 类: add-outline-item / create-asset / set-reference),由 Writing.vue 异步执行。`Writing.vue` 的 `applyAdvisorResult()` 在 `result.actions` 数组存在时切到新路径;旧 `mode === 'replace'` 路径保留不动。保留 `applyAdvisorReplacement` 4 个旧契约,38 个新契约全部通过。

## 改动清单

### 1. `src/services/advisorResultApplier.js` — 重写 (+400 行)

(原 64 行, 现 451 行)

**保留**:
- `applyAdvisorReplacement(content, result)` — 原函数 + 4 个旧契约形状不变
- `normalizeRange(range)` — 原内部 helper

**新增**:
- `APPLIER_ACTIONS` (frozen) — 6 类 action 名称
- `SIDE_EFFECTS` (frozen) — 3 类 side effect 名称
- `VALID_ASSET_KINDS` (frozen) — narrativeAssets.js 接受的 7 kind
- `OUTLINE_SCHEMA_VERSION` / `ASSET_SCHEMA_VERSION` — 1
- `applyWritingAgentAction(content, action, env = {})` — 纯函数入口,switch dispatch 6 类
- 内部 handler 5 个:`applyReplaceRange` / `applyInsertAtCursor` / `applyAppendToOutline` / `applyCreateAsset` / `applySetReference`
- 内部 helper:`okResult` / `fail` / `readCursorFromEnv` / `readNow` / `clampInt` / `normalizeAssetSource` / `hashString` (FNV-1a 32-bit)

**Action 形状**:
```js
// 全部 6 类都接受 type + 各自动作字段
// 共同可选字段:label, message, baseText
{
  type: 'replace_range',
  range: { start, end },
  text: '新文',           // or 'replacement' for back-compat
  baseText: '旧文',        // optional stale check
}

{
  type: 'insert_at_cursor',
  cursorPos: 5,            // optional, fallback to env.currentCursorPos, then end-of-content
  text: '插入内容',
}

{
  type: 'append_to_outline',
  outlineItem: {
    title, content,           // both required
    source: 'agent',          // optional
    assetId, assetKind,       // optional
    id: 'outline_xxx',        // optional, auto-mint if absent
  },
}

{
  type: 'create_asset',
  asset: {
    kind: 'event',           // required, one of VALID_ASSET_KINDS
    title, content,           // both required
    status: 'draft',         // optional
    source: { ... },         // optional
  },
}

{
  type: 'set_reference',
  referenceAssetId: 'asset_42',   // OR null (clear)
  // OR (combined create + set):
  asset: { kind, title, content, ... },   // mints new id, returns 2 side effects
}

{
  type: 'review_only',       // no-op
}
```

**返回形状**:
```js
{
  ok: true | false,
  content: string,            // 改后正文 (失败时保持原 content)
  cursorPos: number,          // 改后光标位置
  sideEffects: [              // 不直接写 storage, 纯数据
    { type: 'add-outline-item', item: {...} },
    { type: 'create-asset', asset: {...} },
    { type: 'set-reference', assetId: string | null },
  ],
  message: string,
  reason?: string,            // ok: false 时
  range?: { start, end },     // replace_range 成功时
  replacement?: string,       // replace_range 成功时
}
```

**关键不变量**:
1. 纯函数 — 无 store / 无 localStorage / 无 DOM / 无 Date.now() (走 `env.now`)
2. asset id 用 FNV-1a hash 内容, deterministic — 同一 input 同一 env 产生同一 id
3. `set_reference` with `asset` + `referenceAssetId` 错配 → reject `reference-id-mismatch`
4. `set_reference` with `knownAssetIds` env → 验证 assetId 存在,否则 reject `unknown-asset`
5. `set_reference` with `null` → 显式清空
6. 失败时 sideEffects 永远为空数组 (避免半截应用)

### 2. `src/pages/Writing.vue` — `applyAdvisorResult()` 加新路径 (+150 行)

**Import 改动**:
```js
import { applyAdvisorReplacement, applyWritingAgentAction } from '../services/advisorResultApplier'
```

**`applyAdvisorResult()` 入口路由**:
```js
function applyAdvisorResult(result) {
  // 新协议:result.actions 是数组 → 切到 multi-action applier
  if (Array.isArray(result?.actions) && result.actions.length) {
    return applyAgentActionsResult(result)
  }
  // 旧协议:mode === 'replace' (无 actions 字段) → applyAdvisorReplacement
  // ... 旧代码原样保留
}
```

**新函数** (5 个):
- `applyAgentActionsResult(result)` — 串行 apply actions, 收 side effects, 一次写 storage
- `applyAgentSideEffect(se)` — 按 type dispatch side effect,返回 status detail 文本
- `addAgentOutlineItem(item)` — push 到 `chapterOutlineItems.value` + `normalizeChapterOutlineItems` + `syncChapterOutlineToCurrentChapter`
- `findNarrativeAssetById(assetId)` — 通过 `listNarrativeAssets({ status: null })` 查
- `readCurrentEditorCursor(content)` — 从 `editorRef.value.selectionStart` 读当前光标

**多 action 串行协议**:
- 起始 `content = markdownContent.value`, `env.currentCursorPos = readCurrentEditorCursor(content)`
- 每个 action 调 `applyWritingAgentAction(content, action, env)`,失败 → 标记 stale + return (之前已应用的不回滚)
- 全部成功 → 一次性 set `markdownContent.value` + `editorRef.value.value` + `syncMarkdownToEditor()` + `onContentChange()`,再串行执行 side effects
- 收尾:update result status (applied / stale),nextTick 恢复 focus + setSelectionRange + syncCopilotCursorFromEditor

**复用现有 helper** (0 新建 store / 0 改 schema):
- `addNarrativeAsset(se.asset)` — narrativeAssets.js (已有)
- `refreshAssetInbox()` — Writing.vue (已有)
- `copilotReferenceAsset.value = ...` — Writing.vue reactive ref (已有)
- `normalizeChapterOutlineItems(items)` — chapterOutline.js (已有)
- `syncChapterOutlineToCurrentChapter()` — Writing.vue (已有)
- `listNarrativeAssets({ status: null })` — narrativeAssets.js (已有)

### 3. `src/__tests__/advisorResultApplier.test.js` — 重写 (+460 行)

(原 60 行, 现 520 行)

**保留** (regression): 4 个旧契约,描述块 `advisorResultApplier — legacy applyAdvisorReplacement`

**新增** (38 契约,描述块 `advisorResultApplier — applyWritingAgentAction (WA-C)`):

| 分组 | 契约 | 覆盖 |
|---|---|---|
| A. shape | A1, A2, A3 | null/non-object 拒, unknown type 拒, APPLIER_ACTIONS / SIDE_EFFECTS 常量 |
| B. replace_range | B1-B7 | happy / stale / no baseText / out-of-bounds / missing range / empty text / `replacement` 字段 back-compat |
| C. insert_at_cursor | C1-C5 | explicit pos / env fallback / end fallback / clamp / empty text |
| D. append_to_outline | D1-D4 | happy / caller id 保留 / missing item / empty title/content |
| E. create_asset | E1-E5 | happy / 7 kind 全过 / unknown kind / missing field / caller source 保留 |
| F. set_reference | F1-F8 | 现有 asset / null clear / create+set combo / knownAssetIds 验证 / missing / empty string / non-string / id mismatch |
| G. review_only | G1, G2 | no-op / cursor 保留 |
| H. side effects isolation | H1-H3 | 无 localStorage 调用 / 串行 threading / fail-fast 协议 |
| I. determinism | I1 | 同 env 产同 id |

### 4. `src/__tests__/uiPolish.test.js` — 新增 `UI-E18-AGENT` describe 块 (+90 行)

(原 5024 行, 现 ~5115 行, 9 契约)

| 契约 | 覆盖 |
|---|---|
| EDITOR-AGENT-1 | Writing.vue 一次 import 两个 applier |
| EDITOR-AGENT-2 | applyAdvisorResult 检测 actions 数组 + dispatch 到新路径 |
| EDITOR-AGENT-3 | 旧 applyAdvisorReplacement 路径在无 actions 时仍跑 |
| EDITOR-AGENT-4 | applyAgentActionsResult 在 actions 间 thread content + cursor |
| EDITOR-AGENT-5 | 第一个 action 失败 → 标记 stale + return |
| EDITOR-AGENT-6 | addAgentOutlineItem 走 chapterOutlineItems + syncChapterOutlineToCurrentChapter |
| EDITOR-AGENT-7 | addNarrativeAsset + refreshAssetInbox 被调用 |
| EDITOR-AGENT-8 | set-reference null clear + existing assetId lookup |
| EDITOR-AGENT-9 | 收尾 nextTick 恢复 focus + setSelectionRange + syncCopilotCursorFromEditor |

## 测试

### advisorResultApplier focused

```
$ npx vitest run src/__tests__/advisorResultApplier.test.js
 ✓ Tests  42 passed | 0 skipped (42)
```

4 legacy + 38 new = 42 全过。

### uiPolish EDITOR-AGENT focused

```
$ npx vitest run src/__tests__/uiPolish.test.js -t "EDITOR-AGENT"
 ✓ Tests  9 passed | 335 skipped (344)
```

### uiPolish Writing|advisor|EDITOR 范围

```
$ npx vitest run src/__tests__/uiPolish.test.js -t "Writing|advisor|EDITOR"
 Tests  19 failed | 49 passed | 276 skipped (344)
```

**49 passed 包括**:
- 4 EDITOR-SOURCE 契约 (selection capture / Notes routing / source chip / insert-back)
- 1 EDITOR-MARKDOWN 契约 (B/I/U via markdownWrap)
- 9 EDITOR-AGENT 契约 (本次新增, 全过)
- 其他 advisor 旧契约

**19 failed** 全部是 pre-existing WIP 视觉契约 (UI-W2 / UI-W9 / UI-W10 / UI-E12-W2 / UI-E13-BIG1) — 跟 WA-C 工作无关, 跟 STATUS.md "WIP contracts outside E17" 标注的 baseline 失败同源。Window A 后续 UI 收编 (Pinax Wall / lamp / W10 立体感) 任务未完成导致, 不在 WA-C 范围。

### Build

```
$ npm run build
 ✓ built in 4.21s (clean)
```

### Forbidden sweep (E19 main.css + WA-C diff)

```
$ git diff --check
 (clean, no whitespace errors)

$ git diff --stat HEAD -- src/ | grep -E 'advisorResultApplier|Writing|uiPolish'
 src/__tests__/advisorResultApplier.test.js      |  520 +++++-
 src/__tests__/uiPolish.test.js                  | 1004 ++++++++++-
 src/pages/Writing.vue                           | 1014 ++++++++---
 src/services/advisorResultApplier.js            |  451 +++++
```

## 设计契约

1. **Applier 是纯函数** — 无 store / 无 localStorage / 无 DOM / 无 `Date.now()` (走 `env.now`)。所有 numeric 走 `clampInt`,所有 string 走 `String()` normalize,失败时 content 保持不变 (避免半截应用)。
2. **sideEffects 是数据,不是调用** — applier 返回 `{ type, ...payload }`,由 Writing.vue 通过现有 store / service helper 执行 (无新 store API, 无 schema 变更)。
3. **6 类 action 全 token 化** — `APPLIER_ACTIONS` / `SIDE_EFFECTS` 双重 frozen 导出,UI 跟 caller 都可 import 当 type 字典。
4. **id minting 确定性** — FNV-1a 32-bit hash,同 input 同 env 产同 id。测试 I1 锁。
5. **Back-compat** — `applyAdvisorReplacement` 原样保留,4 个旧契约 (replace / stale / invalid-range / not-replace) 全过。`replace_range` 也接受 `action.replacement` 字段 (legacy alias)。
6. **旧 useAdvisor 路径不破** — `result.actions` 缺省时直接 fall through 到旧 `applyAdvisorReplacement`,老 advisor 流程不受影响。
7. **focus + selection 恢复** — 多 action apply 收尾走 `nextTick` 恢复 focus + `setSelectionRange(env.currentCursorPos)` + `syncCopilotCursorFromEditor()`。
8. **No new deps** — applier 用 FNV-1a 自实现 hash,无新增 npm 依赖。

## Out of scope (logged for follow-up)

- **UI 展示 actions 个体** — 当前 AdvisorPanel 仍只渲染 1 个"应用修改"按钮 + result.summary,actions 数组在 apply 时整体一次性应用。如果要逐个 action 独立按钮需要扩 AdvisorPanel.vue (per 用户 brief "最小 UI, 不做视觉大改" 明确不做)。
- **回滚已应用 actions** — 当前 `applyAgentActionsResult` 在第 N 个 action 失败时只标记 stale,不回滚前 N-1 个的 content 改动 / side effects。如果要严格 atomic,需要先 dry-run 全部 actions 再 apply (per 测试 H3 注释)。
- **chapterId / bookId 注入到 side effects** — 当前 `addAgentOutlineItem` 走 `chapterOutlineItems.value` + `syncChapterOutlineToCurrentChapter()`,依赖现有 chapter context。`create_asset` 走 `addNarrativeAsset()`,全局素材库。Window A schema 的 `persona` / `matchedAssets` 字段 (WA-R §4) 等后续 V1 接入时再加。
- **streaming partial action** — WA-R §4 H2 streaming 没在 WA-C 实现。等 Window A 升级 advisor task 协议 (server-side) 后再加。
- **`referenceAssetId` 验证强化** — 当前 `set_reference` 接受任意 string (caller 担保存在) 或 `null` (clear)。`env.knownAssetIds` 提供可选验证,但不要求。集成时若 caller 传 knownAssetIds,失败 reject。
- **`set_reference` with `asset: { ... }` 多行** — 接受 asset 创建 + 引用一次性下发,但 caller 不能预知 mint 的 id。集成时如果要让 caller 预知 id,需要让 caller 传 `referenceAssetId` (caller 自己 mint) 或扩 schema 加 `mintIdFrom` 字段。
- **AdvisoryPanel UI 增强** — 当前 panel 不渲染 actions 数组的内容。Window A 后续如要在 UI 显示 per-action 按钮,需要扩 AdvisorPanel.vue 模板。

## 文件改动总览

```
M src/services/advisorResultApplier.js                   (+387 / -64 lines)   ← 新增 applyWritingAgentAction + 6 类 action handlers
M src/pages/Writing.vue                                 (+150 / -0 lines)    ← 新增 applyAgentActionsResult + 5 helpers
M src/__tests__/advisorResultApplier.test.js             (+520 / -60 lines)  ← 重写 + 38 new contracts
M src/__tests__/uiPolish.test.js                         (+90 / -0 lines)     ← 新增 EDITOR-AGENT describe block
A docs/agent-runs/2026-06-29-writing-agent/WA-C-action-applier.report.md  (this file)
```

**0 改动**:
- `server/` (用户硬约束)
- `src/stores/*` (用户硬约束)
- `src/services/narrativeAssets.js` (已存在 `addNarrativeAsset`,直接复用)
- `src/services/chapterOutline.js` (已存在 `normalizeChapterOutlineItems`,直接复用)
- `src/composables/useAdvisor.js` (旧 advisor 路径不动)
- `src/components/AdvisorPanel.vue` (UI 复用现有 "应用修改" 按钮)
- `src/pages/Experience.vue` + `src/components/GamePanel.vue` (用户硬约束,不碰 E18)
- `docs/STATUS.md` (后续手工同步 per user memory)

## 验收对照

| 验收项 | 状态 |
|---|---|
| 1. 扩展/替换 advisorResultApplier.js 支持 6 类新 action | ✓ `applyWritingAgentAction` + 5 internal handlers |
| 2. 保留旧 `applyAdvisorReplacement()`,不破坏旧测试 | ✓ 4/4 legacy contracts pass (advisorResultApplier.test.js) |
| 3. 新增 `applyWritingAgentAction(content, action, env)`,对 range 类 action 做 stale check,返回 `{ ok, content, cursorPos, sideEffects, message }` | ✓ 完整实现,stale check 走 `action.baseText` 跟 legacy 一致 |
| 4. `Writing.vue` 的 `applyAdvisorResult()` 接新 action,旧 `result.mode === replace` 走旧逻辑,新 `result.actions` 走新逻辑 | ✓ 入口路由 `if (Array.isArray(result?.actions)) return applyAgentActionsResult(result)`, 旧逻辑原样保留 |
| 5. 最小 UI 复用 AdvisorPanel/结果按钮 | ✓ 0 改 AdvisorPanel.vue,沿用现有 1 个"应用修改"按钮 |
| 6. sideEffects 不直接写 localStorage,返回给 Writing.vue 执行 | ✓ applier 纯函数,sideEffects 是 plain object;Writing.vue 通过 `addNarrativeAsset` / `addAgentOutlineItem` / `copilotReferenceAsset.value = ...` 异步执行 |
| 7. 所有应用动作保持当前 editor focus/selection,尽量复用已有保存逻辑 | ✓ 收尾 `nextTick` + `editorRef.value.focus()` + `setSelectionRange(env.currentCursorPos)` + `syncCopilotCursorFromEditor()`;内容更新复用 `syncMarkdownToEditor()` + `onContentChange()` (debounced save) |

## 报告落盘

- `docs/agent-runs/2026-06-29-writing-agent/WA-C-action-applier.report.md` — this file

**Not committed** per 用户硬约束 "不提交 commit"。
