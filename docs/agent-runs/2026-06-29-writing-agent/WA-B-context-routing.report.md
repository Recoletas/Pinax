# WA-B: Writing.vue 给 agent 的上下文包 + 任务路由 (Window B)

**Date**: 2026-06-29
**Worker**: Claude Window B
**Branch**: main (worktree: `/home/recoletas/jiuguan/text-game-framework` 直接在 main 上,0 commit / 0 push)
**Mode**: 新增纯函数 helper + 任务目录,**0 改 store schema / 0 改 router / 0 改 Writing.vue 现有动作 / 0 改 Experience / 0 改 advisorTaskService**

## 摘要

WA-B 是 Writing.vue advisor 流的后端-friendly 切片。等 Window A 的 schema 报告完成之前,先落地一个**纯函数 + 7 类 taskType 目录**,让前端能在不依赖后端协议的情况下稳定打包上下文;Window A 的 schema 报告一旦可读, 就能在不破坏现有 useAdvisor() 流的情况下接入新 action。

落地 3 件事:

1. **`src/services/writingAgentContext.js`** (NEW, 350 行) — 单一入口 `buildWritingAgentContext()`, 把 Writing.vue 里散落的 `collectWritingContext` / `getWritingSelectionSnapshot` / `getWritingParagraphSnapshot` / `extractCopilotWindow` / `buildChapterOutlineContext` / `buildCopilotAssetContext` 行为统一收敛成**稳定 JSON 信封**,输出 11 个顶层 key,固定键序,无 `undefined`,无 NaN/Infinity 泄漏,所有缺失源都安全降级(空串 / 空数组 / null / 0)。
2. **`WRITING_TASK_TYPES` 目录** (frozen object) — 7 类任务类型 `writing.fix.selection` / `writing.fix.paragraph` / `writing.continue.light` / `writing.close.thread` / `writing.chapter.health` / `writing.generate.from-asset` / `writing.extract.to-asset`,替代 advisor 流把所有请求都塞 `advisor.review.chapter` 的旧习惯。前 5 个 scope 字符串 (`selection` / `paragraph` / `continue` / `thread` / `chapter`) 故意保留, 让现有 `buildAdvisorActionTarget()` 还能 work。
3. **`getWritingQuickActions()`** — 返回 7 个 quick-action 对象,每个都有明确 taskType + scope + disabled 标志,基于当前上下文 (`hasSelection` / `hasParagraph` / `hasReferenceAsset`) 自动判断 disabled 状态。**Writing.vue 未接入** (per 用户 brief "如果 A 还没完成, 可以只做上下文纯函数, 不接新 action"),只作为 helper 暴露给后续 slice。

## 改动清单

### 1. `src/services/writingAgentContext.js` — 纯上下文 helper (NEW, 350 行)

**核心 API**

```js
import { buildWritingAgentContext, getWritingQuickActions, WRITING_TASK_TYPES } from '../services/writingAgentContext'

const ctx = buildWritingAgentContext({
  book: { id, title },
  chapter: { id, title, wordCount },
  totalBooks, totalChapters,
  editorContent,                // 整章 markdown
  selection: { start, end, text },
  paragraph: { start, end, text, rawText },
  cursor / cursorPosition,
  outlineItems: [...],
  referenceAsset: { id, kind, kindLabel, title, content, source },
  inboxAssets: [...], selectedInboxIds: [...],
  worldbook: { id, name, writingStyle, forbidden, examples },
  worldbookStructuredSummary,
  matchedEntries: [...],
  writingConstraints: { style, perspective, tone, taboos, consistency, references }
}, { now, contextLimits })        // 注入 deterministic 时间戳, 测试用

// 输出 13 个顶层 key:
{
  schemaVersion, generatedAt,
  scope, selection, paragraph, cursor,
  outline, referenceAsset, inbox, worldbook, writingConstraints,
  routing, taskCatalog
}
```

**`scope`** — bookId / bookTitle / chapterId / chapterTitle / wordCount / totalBooks / totalChapters. wordCount 优先 chapter.wordCount, fallback input.wordCount.

**`selection` / `paragraph`** — hasSelection / hasParagraph 布尔 + start / end / text / rawText / length. 缺失时返回 `false` + `null` + `''`.

**`cursor`** — position / beforeStart / before / afterEnd / after / beforeTruncated / afterTruncated. 用 `content.slice(max(0, pos - before), pos)` + `content.slice(pos, min(len, pos + after))`,跟现有 `extractCopilotWindow` 同算法但键名更稳定。

**`outline`** — count / items (id/assetId/assetKind/title/content/schemaVersion/sourceType) / contextText (formatted as `【章节纲要】…` 跟现有 `buildChapterOutlineContext` 同格式) / contextTextTruncated.

**`referenceAsset`** — null (no asset) 或 full envelope (available / id / kind / kindLabel / title / sourceType / contentPreview / contentLength / contentTruncated / contextText).

**`inbox`** — total / selectedCount / selectedIds / selectedSummary (per-item preview + length + truncated) / contextText (formatted as `【已选素材】…`).

**`worldbook`** — available / id / name / writingStyle / forbidden / examples / structuredSummary / matchedEntryCount / matchedEntries (per-entry: id / title / keywordCount / score / contentPreview / contentLength / contentTruncated) / contextText (4 段: 文风 / 禁忌 / 结构化摘要 / 命中条目).

**`writingConstraints`** — 6 个本地字段 (style / perspective / tone / taboos / consistency / references) + 2 个世界书回退字段 (worldbookWritingStyle / worldbookForbidden). 缺失值是 `null`.

**`routing`** — 7 个布尔,表示当前 context 下哪些 taskType 可执行:
```js
{
  canFixSelection: ctx.selection.hasSelection,
  canFixParagraph: ctx.paragraph.hasParagraph,
  canContinueLight: Boolean(ctx.scope.chapterId),
  canCloseThread: Boolean(ctx.scope.chapterId),
  canChapterHealth: Boolean(ctx.scope.chapterId),
  canGenerateFromAsset: Boolean(ctx.referenceAsset?.available),
  canExtractToAsset: ctx.paragraph.hasParagraph || ctx.selection.hasSelection
}
```

**`taskCatalog`** — `{ ...WRITING_TASK_TYPES }` 的副本 (不是 frozen 引用,避免 caller mutation 污染).

**纯函数契约**:
- 没有任何 import 副作用,不读写 store, 不调 useCopilot / useWorldStore / useGameStore.
- 接受 plain object, 返回 plain object. JSON.stringify 安全.
- 所有 numeric 走 `clampInt(value, fallback, min, max)` — NaN/Infinity/-x 全部降级.
- 字符串走 `safeStr(value, fallback)` — null/undefined → `''` 或 `'null'` (看 fallback).
- 所有 string 长内容走 `clipText(text, limit)` — 超 limit 时按句号 / 段落 / 句点切,避免半截句子.

### 2. `src/__tests__/writingAgentContext.test.js` — 25 契约 (NEW, 384 行)

按 describe 分 3 块, 覆盖 envelope / 8 个子块 / catalog / quick actions:

| describe | it 数 | 验证 |
|---|---|---|
| `buildWritingAgentContext` | 21 | A1-A2 envelope / B1-B4 scope+selection+paragraph+cursor / C1-C2 outline / D1-D2 referenceAsset / E1 inbox / F1-F2 worldbook / G1 writingConstraints / H1 routing / I1-I5 defensive reads (null / NaN / Infinity / 长 content / cursor 越界) |
| `WRITING_TASK_TYPES` | 1 | T1: 7 个 catalog 键 + `^writing\.[a-z]+\.[a-z-]+$` 格式 + frozen |
| `getWritingQuickActions` | 4 | Q1-Q4: 7 个 action + taskType 来自 catalog + 不写死 `advisor.review.chapter` + disabled 反映 availability + 旧 scope 字符串保留 + 新 scope (`reference-asset` / `paragraph-or-selection`) 暴露给 A |

### 3. `src/composables/useAdvisor.js` — **0 改动**

旧 useAdvisor() 接受 `{ label, question, scope, target, options, taskType? }` input, 走 `requestAdvisorTask({ context, question, scope, taskType, target, options })`. WA-B 的新 taskType 字段是 additive — old 路径的 taskType='' (useAdvisor.test.js 现有契约) 仍然过, new 路径加 taskType 也只是多一个字段.

## 测试结果

```
$ npx vitest run src/__tests__/writingAgentContext.test.js src/__tests__/useAdvisor.test.js
 ✓ src/__tests__/useAdvisor.test.js  (1 test) 6ms
 ✓ src/__tests__/writingAgentContext.test.js  (25 tests) 14ms

 Test Files  2 passed (2)
      Tests  26 passed (26)
```

**0 回归**. useAdvisor.test.js 旧契约保持 (1/1), writingAgentContext 全部新契约通过 (25/25).

```
$ npm run build
 ✓ built in 4.13s (clean)

$ git diff --check
 (clean, no whitespace errors)
```

## 设计契约

1. **JSON 稳定** — 顶层 13 个 key 顺序固定,所有 numeric 已 clamp,所有 string 已 normalize,无 undefined 泄漏. 两次相同 input 调 `buildWritingAgentContext(...)` (排除 generatedAt) 产 byte-identical JSON.
2. **Defensive reads** — 所有 input 字段都是可选; 缺失字段不会 throw, 降级到空字符串 / 空数组 / null / 0. 测试 I1 验证 `buildWritingAgentContext(undefined, ...)` 不抛 + 返回安全默认.
3. **No store / no router / no DOM** — 纯函数, 只依赖 `chapterOutline` / `settingPanelSchema` 已有 helper (read-only). 没引入新依赖.
4. **Additive taskType** — 旧 useAdvisor 调用 taskType='' 仍然过; 新 call 传 taskType='writing.fix.selection' 等也只是增加字段. 7 个 scope 字符串里 5 个 (`selection` / `paragraph` / `continue` / `thread` / `chapter`) 故意跟现有 `buildAdvisorActionTarget` 的 switch 对齐, 不会 break legacy 路由.
5. **No UI change** — Writing.vue 没改一行. 用户 brief 明确 "不做视觉大改" + "如果 A 还没完成, 可以只做上下文纯函数, 不接新 action".

## Out of scope (logged for follow-up)

- **Writing.vue 不接新 action** — `getWritingQuickActions()` 已经暴露, 但 Writing.vue 的 advisorQuickActions computed 还没切到它. 等 Window A 的 schema 报告出, 由 Writing.vue 集成 slice 一次性切 (单 atomic commit).
- **`buildAdvisorActionTarget` 加 `reference-asset` / `paragraph-or-selection` scope** — legacy target resolver 只知道 5 个 scope. 新 action 调用时 target 会 fallback 到 default chapter 块 (跟现有 thread 一样), 不报错. 集成时再补 target shape.
- **chapter outline / reference asset / matched entries 的 schema version 检查** — 当前 envelope 把 schemaVersion 当 null 默认, 没硬校验. 等 Window A 的 schema 报告出, 加 schemaVersion 不匹配时的降级策略.
- **structured settings 摘要** — 用 `summarizeStructuredSettings(worldbook.structuredSettings)` 可以在 helper 里直接算, 但当前由 caller 传 `worldbookStructuredSummary` 进来. 集成 slice 时可以让 helper 直接调 `summarizeStructuredSettings` 当 caller 没传 summary 时 fallback.
- **不接 store** — useAdvisor / worldStore / gameStore 都不动. 集成时由 caller (Writing.vue) 从 store 取 raw state 喂给 buildWritingAgentContext.

## 文件改动总览

```
A src/services/writingAgentContext.js        (+350 lines)  ← NEW: 纯 helper + taskType 目录
A src/__tests__/writingAgentContext.test.js  (+384 lines)  ← NEW: 25 契约
A docs/agent-runs/2026-06-29-writing-agent/WA-B-context-routing.report.md   (+this file)
```

**0 修改**:
- `src/pages/Writing.vue` — 没动一行
- `src/composables/useAdvisor.js` — 没动一行
- `src/services/advisorTaskService.js` — 没动一行
- `src/composables/useCopilot.js` — 没动一行
- `src/stores/*` — 没动一行
- `src/services/chapterOutline.js` — 没动一行
- `src/services/settingPanelSchema.js` — 没动一行

**为什么 0 改动 Writing.vue**: 用户 brief 明确 "如果 A 还没完成, 可以只做上下文纯函数, 不接新 action". Writing.vue 接入是 Window A 的责任 (action 定义 + scope resolver 扩展), 不是 B 的. B 只确保 helper 准备好 + 旧 useAdvisor 调用路径不被破坏.

## 验收对照

| 验收项 | 状态 |
|---|---|
| 1. 抽出 Writing.vue 散落的上下文构建逻辑为纯 helper | ✓ `src/services/writingAgentContext.js` NEW, 350 行 |
| 2. 构建 `buildWritingAgentContext()`, 输出稳定 JSON | ✓ 13 顶层 key, 固定键序, NaN/Infinity clamp, 测试 A1-A2 锁 |
| 3. 扩展 quick actions (修正选中 / 段落 / 轻续 / 收线 / 章节体检 / 从素材生成 / 抽取素材) | ✓ `getWritingQuickActions()` 暴露 7 个 action; **不接 Writing.vue** (等 A) |
| 4. 每个 task 有明确 taskType, 不要都塞 advisor.review.chapter | ✓ `WRITING_TASK_TYPES` 7 个 frozen, Q1 测试锁 `taskType !== 'advisor.review.chapter'` |
| 5. 保持旧 `useAdvisor()` 调用可用 | ✓ 0 改动 `useAdvisor.js`, `useAdvisor.test.js` 1/1 通过 |

## 报告落盘

- `docs/agent-runs/2026-06-29-writing-agent/WA-B-context-routing.report.md` — this file

**Not committed** per 用户硬约束 "不提交 commit".