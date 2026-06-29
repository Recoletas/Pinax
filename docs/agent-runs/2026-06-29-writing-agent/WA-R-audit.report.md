# Writing Agent Audit (Window R, read-only) — 2026-06-29

**Scope**: 审计当前写作助手 agent 逻辑,给后续实现窗口提供准确上下文。**0 改代码**。

## 1. 链路图

```
Writing.vue (src/pages)
  ├─ useAdvisor()  (src/composables/useAdvisor.js,120 行)
  │   └─ advisorTaskService.requestAdvisorTask() (src/services,95 行)
  │       └─ POST /api/advisor/task  (server/routes/advisor.js)
  │           └─ advisorTaskService.createAdvisorTaskResponse()  (server/services)
  │               └─ openclawService.getAdvice()  (WebSocket → OpenClaw → 写作 agent)
  │   └─ advisorResultApplier.applyAdvisorReplacement()  (replace mode, stale check)
  ├─ useCopilot({ debounceMs:220, autoTrigger:false })  (src/composables/useCopilot.js,515 行)
  │   └─ generationService.runGenerationTask()  → 直连 user LLM(绕开 OpenClaw)
  │   └─ extractCopilotWindow (up 900 / down 180 字符, 段落对齐)
  │   └─ normalizeCopilotSuggestion (meta 过滤 + 句末裁剪 ≤180)
  │   └─ createGhostOverlay (textarea ghost text, 未启用)
  ├─ writingSelectionCapture.createAssetFromSelection()  (chapterId + selector* → narrativeAsset)
  │   └─ narrativeAssets.addNarrativeAsset + updateNarrativeAsset
  ├─ writingNotes / chapterOutline / storyboardStore / shotExporter / worldbookDraftAssets
  └─ Editor: useEditorHistory (60 快照 500ms debounce) + wrapMarkdownSelection (B/I/U)
```

**关键观察**: advisor/copilot 两条线**走完全不同的后端** — advisor 经 OpenClaw WebSocket,copilot 直连 user LLM。

## 2. 现有能力

- **advisor**: 5 taskType (fix.selection / fix.paragraph / close.thread / review.chapter / continue.light);4 mode (replace/closure/review/continue);JSON fence + sectioned header 双 fallback parser;`stale-base-text` guard。
- **copilot**: 上下文窗 up900/down180;meta 短语 + meta 行 + prose signal 三重过滤;手动/防抖双触发;token budget 520。
- **selection capture**: 选区 → narrativeAsset (含 chapterId + selectorOffset/Length/Snippet);insert-back + back-jump query 解析器。
- **narrative asset**: 7 kind (draft-prose/event/character-fact/worldbook-draft/inspiration/storyboard-seed/reference-image);4 status。
- **editor**: undo/redo (60 快照);B/I/U markdown wrap(已替 execCommand)。
- **openclaw**: ed25519 device identity + 协议 v3 connect/chat.send/chat.history;45s timeout。

## 3. 缺口清单

**Blockers** (写作 agent V1 不补上就跑不通)
- **B1**. **任务路由只靠 taskType 字符串**,没有 schema contract;OpenClaw 返回非 JSON 时 fallback 到 sectioned parser,`applyAdvisorReplacement` 在 `mode=replace` 但 parser 误判时静默失败。V1 必须强制 JSON-only + 服务端校验 + 客户端 Zod-style 解码。
- **B2**. **action schema 缺字段类型契约**,前端 `advisorResultApplier` 用 duck typing,后端 `buildAdvisorResult` 直接拼对象。新字段加进来会破坏 N 处调用方。

**High** (V1 应一起做)
- **H1**. **copilot 走 user LLM 直连,不走写作 agent** — 失去世界书/人设/素材检索的统一上下文。可加 `writing.copilot` taskType 走 OpenClaw,但 promptRegistry 现在只有 `copilot` system template。
- **H2**. **advisor 没有 streaming**,45s timeout 用户只见 spinner。V1 加 SSE 或 OpenClaw 的 chat.history 增量轮询。
- **H3**. **`advisorResults` 与 `advisorMessages` 是两套数据**,UI 拼装靠人工对齐 (`taskResult.result?.id || createAdvisorResultId()`)。同源应合一条 record。
- **H4**. **stale-base-text check 只看 `targetRange` 内精确匹配**,用户改一字就 reject 但替换是局部的;V1 应支持 fuzzy/snapshot tolerance。

**Medium** (V1+1)
- **M1**. **`buildCopilotMessages` 内联 prompt 写死**,与 `ADVISOR_TASK_INSTRUCTIONS` 双轨,新增 taskType 要改两处。
- **M2**. **selection capture 的 chapterId 只校验 non-empty**,跨书同名 chapter 不可区分;V1 接 bookId。
- **M3**. **`advisorResultApplier` 一次只 apply 一个结果**,不支持 multi-issue 批量替换 + diff preview。
- **M4**. **Writing.vue setup() 内 5+ 个 inline advisor/copilot state**,切到 unified store 是大改动,超出 V1。

**Low** (后续): **L1** `createGhostOverlay` 未被 Writing.vue 调用(autoTrigger:false);**L2** `extractCopilotWindow` paragraph boundary 只找 `\n\n`,对 `\r\n\r\n` 不严;**L3** narrativeAsset 7 kind,但 `worldbookDraftAssets` 只接 `worldbook-draft`,其它 kind 没 lift 路径。

## 4. Writing Agent V1 推荐 Action Schema

**端到端契约** (Zod-style,server `buildAdvisorResult` + client `advisorResultApplier` 共享):

```ts
AdvisorResult = {
  task: TaskType,              // 5 选 1,见 ADVISOR_TASK_MODES
  mode: 'replace' | 'closure' | 'review' | 'continue',
  schemaVersion: 1,
  summary: string,              // <=80 字,UI 渲染用
  replacement?: string,         // 仅 mode=replace 必填
  targetRange?: { start: int, end: int },  // 客户端传 baseText 时服务端回填
  baseText?: string,            // stale check 用
  issues?: Array<{ type, severity: 'low'|'medium'|'high', message, targetRange? }>,
  action?: Array<{ label, command, payload? }>,
  stalePolicy: 'require-same-base-text' | 'allow-fuzzy',
  matchedAssets?: Array<{ assetId, snippet }>,  // 跨页引用 (Notes/WorldBook)
  persona?: { id, voice },                       // 接 C3 follow-up persona 字段
  streaming?: { partial, done }                  // H2 streaming
}
```

**V1 落点** (worker 落地序):
1. `server/services/openclawService.js` 加 `writingAdvisor` taskType + JSON-only enforce + server-side Zod validate
2. `server/services/advisorTaskService.js` 把 `buildAdvisorResult` 升级到 schemaVersion=1,加 `stalePolicy` + `persona` + `matchedAssets`
3. `src/services/advisorTaskService.js` (client) `normalizeAdvisorResult` 按 schema 解码,带版本 fallback
4. `src/services/advisorResultApplier.js` 加 `applyAdvisorMulti` (M3) + fuzzy stale (H4) + diff preview
5. `src/composables/useAdvisor.js` 合并 `advisorResults` + `advisorMessages` 为单一 `conversations` ref (H3)
6. `src/composables/useCopilot.js` 可选走 OpenClaw (H1),加 `taskType: 'writing.copilot'` 分支
7. 新增 `src/__tests__/advisorSchemaV1.test.js` 双向契约验证

## 5. 文件归属 — 后续窗口可改 / 不要碰

**可改** (V1 实现窗口允许):
- `src/composables/useAdvisor.js` — 合并 advisors + 加 persona prop
- `src/composables/useCopilot.js` — OpenClaw 分支(不改 user LLM 路径)
- `src/services/advisorTaskService.js` (client) — schema 解码
- `src/services/advisorResultApplier.js` — multi + fuzzy
- `server/services/openclawService.js` — JSON-only + writingAdvisor task
- `server/services/advisorTaskService.js` — buildAdvisorResult 升级
- `server/routes/advisor.js` — 加 streaming 端点
- `src/__tests__/{useAdvisor,advisorResultApplier,advisorTaskService,serverAdvisorTaskService}.test.js` — 加 V1 契约
- 新增 `src/__tests__/advisorSchemaV1.test.js`

**保留不动** (其他窗口/线程在用):
- `src/services/writingSelectionCapture.js` — Notes ↔ Writing 来源/插回链路已 ship
- `src/services/narrativeAssets.js` — 7-kind schema 是 Notes.vue + ProseEssay.vue 共用底座
- `src/composables/useEditorHistory.js` — U7 ship 的 undo/redo
- `src/composables/useStorage.js` + `STORAGE_KEYS` — U9 storage health 依赖
- `src/services/worldbookDraftAssets.js` + `chapterOutline.js` + `writingNotes.js` + `storyboardStore.js` + `shotExporter.js` — 独立 ship 的衍生服务
- `src/pages/Writing.vue` setup() 内的 5+ 个 inline state ref — 合并 store 超出 V1(M4 后续)
- `src/components/AdvisorPanel.vue` — UI 消费方,V1 不改 schema 显示
- `src/components/gm-persona/*` — C3 follow-up 线程
- `src/services/worldbookContextBuilder.js` + `src/stores/gameStore.js` — 多线程 do-not-touch (per STATUS.md)
- `src/styles/themes/{kao,legacy}.css` — 视觉线程
- `src/assets/characters/*` + `src/config/characterArt.js` — 5A/5B 立体感线程
- `docs/STATUS.md` — V1 ship 后续手工同步

**审计外的发现** (供下游窗口注意):
- `advisorResultApplier.test.js` 已有 `replace` mode 完整覆盖,V1 改 schema 时作回归基线
- `serverAdvisorTaskService.test.js` 测 `createAdvisorTaskResponse` + JSON fence,V1 升级保留这 2 个 case
- `useCopilot.test.js` 没测 ghost overlay(V1 L1 可补)
- `writingSelectionCapture.test.js` 跨书 chapterId 歧义未测(M2 升级时需加)