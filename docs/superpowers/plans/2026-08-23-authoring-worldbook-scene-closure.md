# Authoring Worldbook Scene Closure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 Authoring 以书为项目、以显式绑定世界书为设定源、以当前 writingUnit 为现场定位，完成可诊断的下一拍生成、场景锚点、共享投影和写作页视觉统一。

**Architecture:** `book.id` 保持 Authoring 项目真源，`book.worldbookId` 显式绑定一个世界书；作者选择的场景锚点保存于 `chapter.sceneAnchors`，只读投影按当前 `unitId` 组合锚点、正式世界书、正文来源和有效观察结果。下一拍冻结 `targetUnitId + unitRevision + documentRevision + projectionFingerprint`，成功后在目标单元之后插入一个新 writingUnit；Experience session 只参与显式导入，不再支撑正常 Authoring 现场。

**Tech Stack:** Vue 3、Pinia、Tiptap/ProseMirror、Vite、Vitest、localStorage/现有桌面迁移合同、NarrativeKernel、现有 UI audit。

---

## Execution constraints

- 从 `integration/consolidation-20260823` 的已批准设计提交 `abb011b` 或执行时更新的整合 HEAD 创建独立 worktree；不得直接修改含大量用户 WIP 的共享 checkout。
- 建议分支：`feature/authoring-worldbook-scene-closure`；建议 worktree：`/tmp/pinax-authoring-worldbook-scene-closure`。
- 不启动、停止或重启用户已有 dev server。只有检测到服务确实运行目标提交时才执行 live audit；否则记录未运行原因。
- 不自动绑定既有书到当前 active worldbook；不创建隐藏 Experience session；不退役 `/experience`。
- 不保存完整 prompt、provider 密钥、模型 transcript 或生成正文到诊断指标。
- 世界书修改属于 context injection surface；实施时遵守 `worldbook-workflow`，并在改完后验证三条导入路径和一次 generation smoke。
- UI 按左栏 → Composer → Inspector 三个小切片推进，每片完成 1440/390 截图复核后再进入下一片；避免一次性改写整页。
- 每个任务使用 TDD：先写失败测试并确认 RED，再实现最小闭环并确认 GREEN。
- 目标提交数 6-8 个，每个提交一个完整 concern；最终若产生中间修补提交，交付前按 `commit-conventions` 收敛。

## Canonical inputs

- Approved design: `docs/superpowers/specs/2026-08-23-authoring-worldbook-scene-closure-design.md`
- Fusion design: `docs/superpowers/specs/2026-08-23-authoring-experience-workspace-fusion-design.md`
- Worldbook workflow: `docs/guides/worldbook-workflow.md`
- Writing document owner: `src/services/writing/writingDocumentSchema.js`
- Unit transitions: `src/services/writing/writingUnitExtension.js`
- Editor bridge: `src/components/writing/WritingNotebookEditor.vue`
- Current page owner: `src/pages/Authoring.vue`
- Current projection: `src/services/agents/authoring/authoringSceneProjection.js`
- Current turn executor: `src/services/agents/authoring/narrativeKernelExecutor.js`
- Current transaction composable: `src/composables/useAuthoringTask.js`

## File map

### Create

- `src/services/agents/authoring/authoringExecutionResult.js` — typed phase/code/retryability normalization; no UI or provider I/O.
- `src/services/agents/authoring/authoringProjectWorldbook.js` — book/worldbook binding normalize, status resolution and switch impact.
- `src/services/agents/authoring/authoringSceneAnchors.js` — scene anchor normalize, active anchor lookup and unit-transition reconciliation.
- `src/services/agents/authoring/authoringWorldbookSceneAdapter.js` — bounded character/location/relation summaries from one explicitly bound worldbook.
- `src/__tests__/authoringExecutionResult.test.js`
- `src/__tests__/authoringWorldbookBinding.test.js`
- `src/__tests__/authoringSceneAnchors.test.js`

### Modify

- `src/pages/Authoring.vue`
- `src/composables/useAuthoringTask.js`
- `src/components/writing/WritingNotebookEditor.vue`
- `src/components/authoring/AuthoringSceneRail.vue`
- `src/components/authoring/AuthoringTurnComposer.vue`
- `src/components/authoring/AuthoringInspectorDetail.vue`
- `src/services/agents/authoring/authoringSceneProjection.js`
- `src/services/agents/authoring/narrativeKernelExecutor.js`
- `src/services/agents/authoring/authoringSessionProjection.js`
- `src/services/writing/writingAuthoringTurnImport.js`
- `src/services/writing/writingExperienceImport.js`
- `src/services/writing/writingUnitExtension.js`
- `src/stores/worldStore.js`
- `src/pages/Writing.scoped.css`
- `src/pages/Writing.global.css`
- `src/utils/backupExport.js`
- `src/services/migration/legacyMigrationBundle.js`
- `electron/migration/legacyProjectConverter.mjs`
- `scripts/ui-audit.mjs`
- 现有 Authoring、worldbook、backup、migration 与 editor focused tests。

## Gate A: Establish a reproducible baseline

- [ ] **Step A1: Create the isolated worktree**

```bash
git worktree add /tmp/pinax-authoring-worldbook-scene-closure -b feature/authoring-worldbook-scene-closure integration/consolidation-20260823
```

Expected: worktree HEAD contains `abb011b` or a later integration commit containing that design; shared checkout remains untouched.

- [ ] **Step A2: Confirm the implementation baseline**

```bash
git log -1 --oneline
test -f src/components/authoring/AuthoringTurnComposer.vue
test -f src/services/agents/authoring/authoringSceneProjection.js
rg -n "insertAsNewWritingUnit|observerState: null|composerTurnFailure \|\| authoringTaskError|messages:" src
```

Expected before fixes:

- `insertAsNewWritingUnit` inserts at document end.
- `Authoring.vue` passes `observerState: null`.
- generic composer failure can mask `authoringTaskError`.
- latest executor already sends explicit instruction as a user message; if not, first rebase onto the parity closure commit rather than reimplementing it in this branch.

- [ ] **Step A3: Install dependencies only if absent**

```bash
test -d node_modules || npm install
```

- [ ] **Step A4: Run focused and full baseline**

```bash
npm run test:run -- \
  src/__tests__/authoringTurnRuntime.test.js \
  src/__tests__/authoringSceneProjection.test.js \
  src/__tests__/authoringTurnComposer.test.js \
  src/__tests__/writingAuthoringTurnImport.test.js \
  src/__tests__/authoringLegacySessionImport.test.js \
  src/__tests__/worldBookQuickImport.test.js
npm run verify:full
```

Expected: focused PASS; `verify:full` exit 0. Record actual file/test counts in the handoff before changing code.

## Task 1: Preserve typed generation failures and add low-sensitive diagnostics

**Files:**

- Create: `src/services/agents/authoring/authoringExecutionResult.js`
- Create: `src/__tests__/authoringExecutionResult.test.js`
- Modify: `src/composables/useAuthoringTask.js`
- Modify: `src/pages/Authoring.vue`
- Modify: `src/components/authoring/AuthoringTurnComposer.vue`
- Test: `src/__tests__/authoringTurnRuntime.test.js`
- Test: `src/__tests__/authoringTurnComposer.test.js`

- [ ] **Step 1: Write the failing result-normalization tests**

```js
import { describe, expect, it } from 'vitest'
import {
  authoringFailure,
  normalizeAuthoringFailure
} from '../services/agents/authoring/authoringExecutionResult.js'

describe('authoring execution result', () => {
  it('keeps phase, code and generated-text recovery without prompt data', () => {
    expect(authoringFailure({
      phase: 'persist',
      code: 'AUTHORING_PERSIST_FAILED',
      message: '正文已插入，但保存失败',
      retryable: true,
      generatedTextAvailable: true,
      prompt: 'must-not-survive'
    })).toEqual({
      ok: false,
      phase: 'persist',
      code: 'AUTHORING_PERSIST_FAILED',
      message: '正文已插入，但保存失败',
      retryable: true,
      generatedTextAvailable: true,
      requestId: ''
    })
  })

  it('maps legacy reasons without collapsing them to generic error', () => {
    expect(normalizeAuthoringFailure({ reason: 'stale' }).phase).toBe('stale')
    expect(normalizeAuthoringFailure({ reason: 'editor-write' }).phase).toBe('editor-write')
    expect(normalizeAuthoringFailure({ reason: 'persist' }).phase).toBe('persist')
  })
})
```

- [ ] **Step 2: Run the new test and confirm RED**

```bash
npm run test:run -- src/__tests__/authoringExecutionResult.test.js
```

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement the pure typed result helper**

```js
export const AUTHORING_FAILURE_PHASES = Object.freeze([
  'context', 'provider', 'protocol', 'stale', 'editor-write', 'persist', 'observer'
])

const LEGACY_PHASE = Object.freeze({
  stale: 'stale',
  'editor-write': 'editor-write',
  persist: 'persist',
  'control-text-leak': 'protocol',
  'empty-result': 'protocol',
  aborted: 'provider',
  error: 'provider'
})

export function authoringFailure(input = {}) {
  const phase = AUTHORING_FAILURE_PHASES.includes(input.phase) ? input.phase : 'provider'
  return Object.freeze({
    ok: false,
    phase,
    code: String(input.code || `AUTHORING_${phase.replace('-', '_').toUpperCase()}_FAILED`),
    message: String(input.message || '生成失败'),
    retryable: input.retryable !== false,
    generatedTextAvailable: input.generatedTextAvailable === true,
    requestId: String(input.requestId || '')
  })
}

export function normalizeAuthoringFailure(input = {}) {
  return authoringFailure({ ...input, phase: input.phase || LEGACY_PHASE[input.reason] || 'provider' })
}
```

- [ ] **Step 4: Make `useAuthoringTask` return typed failures at each boundary**

Replace bare `{ ok: false, reason }` returns with typed results. Preserve the existing `text` field only in memory when editor/persist recovery needs it; do not put generated text in metrics.

Required mapping:

```js
const failure = authoringFailure({
  phase: 'editor-write',
  code: 'AUTHORING_EDITOR_WRITE_FAILED',
  message: '正文已生成，但未能插入当前落笔处',
  retryable: true,
  generatedTextAvailable: true,
  requestId
})
return { ...failure, text: generated }
```

`persist` must return `generatedTextAvailable: true`; provider/protocol/stale must return false. Abort remains a visible stopped state and pauses semi-auto, but is not reported as a provider outage metric.

Keep one in-memory pending-save receipt when insertion succeeded but `persist()` returned false:

```js
pendingPersist.value = {
  requestId,
  insertedUnitId: written.unitId,
  generatedTextAvailable: true
}

function retryPersist() {
  if (!pendingPersist.value) return { ok: false, reason: 'nothing-to-save' }
  if (persist() === false) return authoringFailure({
    phase: 'persist',
    code: 'AUTHORING_PERSIST_FAILED',
    message: '正文仍未保存，请检查存储空间',
    generatedTextAvailable: true
  })
  pendingPersist.value = null
  return { ok: true }
}
```

Expose `retryPersist` from the composable. It must call only `persist()` and must not invoke the provider or insert the unit again. Clear the receipt after a successful save, chapter switch or manual document change.

- [ ] **Step 5: Remove failure masking in `Authoring.vue`**

Replace the two competing strings with one typed state:

```js
const composerFailure = shallowRef(null)
const composerFailureMessage = computed(() => composerFailure.value?.message || '')

function recordComposerOutcome(outcome) {
  composerFailure.value = outcome?.ok ? null : normalizeAuthoringFailure(outcome)
}
```

Template:

```vue
<AuthoringTurnComposer
  :failure="composerFailure"
  @retry-save="handleRetryAuthoringPersist"
  ...
/>
```

Delete `composerTurnFailure || authoringTaskError` and `composerTurnFailureText()`.

Page handler:

```js
function handleRetryAuthoringPersist() {
  const outcome = authoringTask.retryPersist()
  composerFailure.value = outcome.ok ? null : outcome
}
```

- [ ] **Step 6: Render the phase and recovery action in Composer**

Use text, not badges:

```vue
<p v-if="failure" class="turn-composer__status is-error" role="alert">
  {{ failure.message }}
  <button v-if="failure.retryable" type="button" @click="retryLastAttempt">重试</button>
  <button v-if="failure.phase === 'persist'" type="button" @click="emit('retry-save')">再次保存</button>
</p>
```

The component must keep kind, instruction, actor, target and director note unchanged.

- [ ] **Step 7: Add low-sensitive diagnostic assertions**

Extend `authoringTurnRuntime.test.js` to assert diagnostic payloads contain only:

```js
expect(Object.keys(metric).sort()).toEqual([
  'code', 'durationMs', 'phase', 'requestId', 'retryable', 'taskId'
].sort())
expect(JSON.stringify(metric)).not.toContain('prompt')
expect(JSON.stringify(metric)).not.toContain('generatedText')
```

- [ ] **Step 8: Run focused tests**

```bash
npm run test:run -- \
  src/__tests__/authoringExecutionResult.test.js \
  src/__tests__/authoringTurnRuntime.test.js \
  src/__tests__/authoringTurnComposer.test.js
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/services/agents/authoring/authoringExecutionResult.js src/__tests__/authoringExecutionResult.test.js src/composables/useAuthoringTask.js src/pages/Authoring.vue src/components/authoring/AuthoringTurnComposer.vue src/__tests__/authoringTurnRuntime.test.js src/__tests__/authoringTurnComposer.test.js
git commit -m "fix(authoring): expose typed generation failures"
```

## Task 2: Bind each writing book to one explicit worldbook

**Files:**

- Create: `src/services/agents/authoring/authoringProjectWorldbook.js`
- Create: `src/__tests__/authoringWorldbookBinding.test.js`
- Modify: `src/pages/Authoring.vue`
- Modify: `src/stores/worldStore.js`
- Modify: `src/__tests__/worldStoreSyncStructuredEntries.test.js`
- Modify: `src/utils/backupExport.js`
- Modify: `src/__tests__/backupExport.test.js`

- [ ] **Step 1: Write failing binding contract tests**

```js
import {
  normalizeBookWorldbookBinding,
  resolveBookWorldbookStatus,
  previewWorldbookRebind
} from '../services/agents/authoring/authoringProjectWorldbook.js'

expect(normalizeBookWorldbookBinding({ worldbookId: 42 })).toBe('42')
expect(resolveBookWorldbookStatus({ book: {}, worldbooks: [] })).toMatchObject({ status: 'unbound' })
expect(resolveBookWorldbookStatus({
  book: { worldbookId: 'wb-missing' }, worldbooks: []
})).toMatchObject({ status: 'missing', worldbookId: 'wb-missing' })
expect(previewWorldbookRebind({
  book: { worldbookId: 'wb-old', chapters: [{ sceneAnchors: [{ worldbookId: 'wb-old' }] }] },
  nextWorldbookId: 'wb-new'
})).toMatchObject({ affectedAnchorCount: 1, requiresConfirmation: true })
```

- [ ] **Step 2: Confirm RED**

```bash
npm run test:run -- src/__tests__/authoringWorldbookBinding.test.js
```

- [ ] **Step 3: Implement the binding helper**

The helper must be pure and return no global fallback:

```js
export function normalizeBookWorldbookBinding(book = {}) {
  return String(book.worldbookId || '').trim()
}

export function resolveBookWorldbookStatus({ book, worldbooks }) {
  const worldbookId = normalizeBookWorldbookBinding(book)
  if (!worldbookId) return { status: 'unbound', worldbookId: '', worldbook: null }
  const indexEntry = (Array.isArray(worldbooks) ? worldbooks : [])
    .find((item) => String(item?.id) === worldbookId)
  return indexEntry
    ? { status: 'bound', worldbookId, worldbook: indexEntry }
    : { status: 'missing', worldbookId, worldbook: null }
}
```

`previewWorldbookRebind` counts anchors whose non-empty `worldbookId` differs from the requested ID.

- [ ] **Step 4: Add a non-fallback worldStore loader**

Add an action that verifies the requested ID after loading:

```js
async loadWorldbookForProject(worldbookId) {
  const id = String(worldbookId || '').trim()
  if (!id) return null
  const loaded = await this.loadWorldbook(id)
  return String(loaded?.id || '') === id ? loaded : null
}
```

Test that asking for a missing ID returns null and does not return the previously active worldbook.

- [ ] **Step 5: Persist binding in new and existing books**

In `confirmCreateBook()`, include the visibly selected value:

```js
const newBook = {
  id: Date.now().toString(),
  title: newBookTitle.value.trim(),
  description: newBookDesc.value.trim(),
  worldbookId: String(newBookWorldbookId.value || ''),
  createdAt: new Date().toISOString(),
  chapters: []
}
```

Add `bindSelectedBookWorldbook(nextId)` that:

1. builds `previewWorldbookRebind`;
2. asks confirmation only when affected anchors > 0;
3. writes `book.worldbookId` through `saveBooks()`;
4. loads exactly that worldbook;
5. refreshes projection/context.

- [ ] **Step 6: Make `openBook` synchronize the bound worldbook with race protection**

Use a monotonically increasing token:

```js
let bookWorldbookLoadToken = 0

async function syncBookWorldbook(book) {
  const token = ++bookWorldbookLoadToken
  const id = normalizeBookWorldbookBinding(book)
  const loaded = id ? await worldStore.loadWorldbookForProject(id) : null
  if (token !== bookWorldbookLoadToken || selectedBookId.value !== book?.id) return null
  boundWorldbook.value = loaded
  return loaded
}
```

Generation must read `boundWorldbook`, never `worldStore.activeWorldbook` directly.

- [ ] **Step 7: Add minimal visible binding UI**

- New-book dialog: one existing select row labelled “世界书”，including “暂不绑定”.
- Existing book context: show `世界书：<name>` or a text action `关联世界书`.
- Missing binding: show `世界书已缺失 · 重新关联` and disable next beat until fixed or explicitly unbound.

Do not add a card, badge or new settings route.

- [ ] **Step 8: Lock backup preservation**

Extend `backupExport.test.js`:

```js
expect(exportedBook.worldbookId).toBe('wb-harbor')
expect(exportedBook.chapters[0].sceneAnchors).toEqual([])
```

No migration should strip unknown book/chapter fields.

- [ ] **Step 9: Run focused tests**

```bash
npm run test:run -- \
  src/__tests__/authoringWorldbookBinding.test.js \
  src/__tests__/worldStoreSyncStructuredEntries.test.js \
  src/__tests__/backupExport.test.js \
  src/__tests__/authoringWorkspace.test.js
```

- [ ] **Step 10: Commit**

```bash
git add src/services/agents/authoring/authoringProjectWorldbook.js src/__tests__/authoringWorldbookBinding.test.js src/pages/Authoring.vue src/stores/worldStore.js src/__tests__/worldStoreSyncStructuredEntries.test.js src/utils/backupExport.js src/__tests__/backupExport.test.js src/__tests__/authoringWorkspace.test.js
git commit -m "feat(authoring): bind books to worldbooks"
```

## Task 3: Target the active writingUnit instead of the chapter end

**Files:**

- Modify: `src/components/writing/WritingNotebookEditor.vue`
- Modify: `src/composables/useAuthoringTask.js`
- Modify: `src/pages/Authoring.vue`
- Modify: `src/services/writing/writingAuthoringTurnImport.js`
- Test: `src/__tests__/writingAuthoringTurnImport.test.js`
- Test: `src/__tests__/authoringTurnRuntime.test.js`
- Test: `src/__tests__/authoringUnifiedRuntimeWiring.test.js`

- [ ] **Step 1: Write a failing pure insertion test**

Add a target-aware helper contract:

```js
const result = insertAuthoringTurnAfterUnit({
  document: documentWithUnits(['unit-a', 'unit-b', 'unit-c']),
  targetUnitId: 'unit-a',
  targetUnitRevision: 0,
  text: '新的一拍',
  originRef
})
expect(result.ok).toBe(true)
expect(result.document.content.map((unit) => unit.attrs.unitId)).toEqual([
  'unit-a', result.unitId, 'unit-b', 'unit-c'
])
expect(result.document.content.at(-1).attrs.unitId).toBe('unit-c')
```

Also assert `target-unit-missing` and `target-unit-stale` return the original document unchanged.

- [ ] **Step 2: Confirm RED**

```bash
npm run test:run -- src/__tests__/writingAuthoringTurnImport.test.js
```

- [ ] **Step 3: Implement `insertAuthoringTurnAfterUnit`**

In `writingAuthoringTurnImport.js`, locate the target index and splice immutably:

```js
const targetIndex = document.content.findIndex((unit) => unit.attrs?.unitId === targetUnitId)
if (targetIndex < 0) return { ok: false, reason: 'target-unit-missing', document }
if (Number(document.content[targetIndex].attrs?.unitRevision || 0) !== Number(targetUnitRevision || 0)) {
  return { ok: false, reason: 'target-unit-stale', document }
}
const content = document.content.slice()
content.splice(targetIndex + 1, 0, created.unit)
```

Keep existing append helper for legacy callers, but implement it by choosing the last unit and delegating to the new helper.

- [ ] **Step 4: Make the editor bridge insert after a requested unit**

Change the exposed method signature:

```js
function insertAsNewWritingUnit({ text, originRefs, afterUnitId, expectedUnitRevision } = {})
```

Find the ProseMirror top-level unit with the requested ID and calculate:

```js
const insertPosition = target.pos + target.node.nodeSize
```

Return a typed object:

```js
return { ok: true, unitId: created.unit.attrs.unitId }
```

Return `{ ok:false, reason:'target-unit-missing' }` or `target-unit-stale`; do not fall back to document end.

- [ ] **Step 5: Capture target identity in `resolveTarget`**

`readLiveWritingSelectionSnapshot()` already exposes `unitId` and `unitRevision`. Add them to the task target:

```js
return {
  document: { text, revision: currentDocumentRevision() },
  targetUnitId: selection.unitId,
  targetUnitRevision: selection.unitRevision,
  caret: selection.end,
  selection,
  request: { ... }
}
```

If the editor has no valid active unit, use the last document unit explicitly and record `targetSource: 'document-tail-fallback'`.

- [ ] **Step 6: Pass frozen target data through the apply boundary**

```js
applyWritingUnit({
  text: generated,
  originRefs,
  afterUnitId: target.targetUnitId,
  expectedUnitRevision: target.targetUnitRevision
})
```

Map target missing/revision mismatch to phase `stale`, not generic `editor-write`.

- [ ] **Step 7: Add runtime regression tests**

Assert:

- moving selection after request start but not editing still inserts after the captured unit;
- changing document revision causes zero calls to `insertAsNewWritingUnit`;
- changing target unit revision returns stale;
- successful insert focuses the new unit and schedules observers once.

- [ ] **Step 8: Run focused tests**

```bash
npm run test:run -- \
  src/__tests__/writingAuthoringTurnImport.test.js \
  src/__tests__/authoringTurnRuntime.test.js \
  src/__tests__/authoringUnifiedRuntimeWiring.test.js
```

- [ ] **Step 9: Commit**

```bash
git add src/components/writing/WritingNotebookEditor.vue src/composables/useAuthoringTask.js src/pages/Authoring.vue src/services/writing/writingAuthoringTurnImport.js src/__tests__/writingAuthoringTurnImport.test.js src/__tests__/authoringTurnRuntime.test.js src/__tests__/authoringUnifiedRuntimeWiring.test.js
git commit -m "fix(authoring): insert turns after active unit"
```

## Task 4: Add project-owned scene anchors and reconcile unit transitions

**Files:**

- Create: `src/services/agents/authoring/authoringSceneAnchors.js`
- Create: `src/__tests__/authoringSceneAnchors.test.js`
- Modify: `src/pages/Authoring.vue`
- Modify: `src/services/writing/writingUnitExtension.js`
- Test: `src/__tests__/authoringTurnRuntime.test.js`

- [ ] **Step 1: Write failing anchor normalization and resolution tests**

```js
expect(normalizeSceneAnchor({
  id: 'anchor-a',
  unitId: 'unit-b',
  worldbookId: 'wb-1',
  castMode: 'manual',
  presentCharacterIds: ['char-a', 'char-a', '', 'char-b'],
  locationId: 'place-1'
})).toMatchObject({
  unitId: 'unit-b',
  castMode: 'manual',
  presentCharacterIds: ['char-a', 'char-b']
})

expect(resolveActiveSceneAnchor({
  anchors: [anchorAt('unit-a'), anchorAt('unit-c')],
  unitOrder: ['unit-a', 'unit-b', 'unit-c', 'unit-d'],
  activeUnitId: 'unit-b',
  worldbookId: 'wb-1'
}).anchor.unitId).toBe('unit-a')
```

Cover manual empty, mismatched worldbook, stale unit and no-anchor outcomes.

- [ ] **Step 2: Confirm RED**

```bash
npm run test:run -- src/__tests__/authoringSceneAnchors.test.js
```

- [ ] **Step 3: Implement the anchor contract**

Export:

```js
export const SCENE_ANCHOR_SCHEMA_VERSION = 1
export function normalizeSceneAnchor(input) {}
export function normalizeSceneAnchors(input) {}
export function resolveActiveSceneAnchor({ anchors, unitOrder, activeUnitId, worldbookId }) {}
export function upsertSceneAnchor({ anchors, anchor, expectedDocumentRevision, liveDocumentRevision }) {}
export function reconcileSceneAnchorsForUnitTransition({ anchors, transition }) {}
```

`resolveActiveSceneAnchor` chooses the nearest valid anchor at or before active unit. Worldbook mismatch returns `{ anchor:null, status:'worldbook-mismatch', conflictingAnchor }`; it must not silently use the anchor.

- [ ] **Step 4: Define transition reconciliation**

Required behavior:

```js
if (transition.type === 'split') {
  // anchor remains on keptUnitId; no copy to createdUnitId
}
if (transition.type === 'merge') {
  // removedUnitId anchors move to keptUnitId; later source anchor wins
}
if (transition.type === 'delete') {
  // preserve anchor with status:'stale' and staleReason:'unit-deleted'
}
```

Extend editor transition metadata for delete if it is currently absent. Move transitions need no anchor rewrite because unit IDs remain stable.

- [ ] **Step 5: Persist anchors with chapter data**

On chapter load:

```js
sceneAnchors.value = normalizeSceneAnchors(chapter.sceneAnchors)
```

On `saveCurrentChapter()`:

```js
chapter.sceneAnchors = normalizeSceneAnchors(sceneAnchors.value)
```

On `unit-transition`, reconcile anchors before save and include the resulting transition receipt in the existing request-level undo path.

- [ ] **Step 6: Add an atomic scene-anchor save action in the page owner**

```js
function commitSceneAnchorDraft(draft) {
  const result = upsertSceneAnchor({
    anchors: sceneAnchors.value,
    anchor: { ...draft, unitId: activeUnitId.value, worldbookId: selectedBookWorldbookId.value },
    expectedDocumentRevision: draft.documentRevision,
    liveDocumentRevision: currentDocumentRevision()
  })
  if (!result.ok) return result
  sceneAnchors.value = result.anchors
  return saveCurrentChapter() ? result : { ok: false, reason: 'persist' }
}
```

Cancel never calls this function. Undo checks the current anchor fingerprint before restoring the previous array.

- [ ] **Step 7: Run focused tests**

```bash
npm run test:run -- \
  src/__tests__/authoringSceneAnchors.test.js \
  src/__tests__/authoringTurnRuntime.test.js \
  src/__tests__/writingAuthoringTurnImport.test.js
```

- [ ] **Step 8: Commit**

```bash
git add src/services/agents/authoring/authoringSceneAnchors.js src/__tests__/authoringSceneAnchors.test.js src/pages/Authoring.vue src/services/writing/writingUnitExtension.js src/__tests__/authoringTurnRuntime.test.js src/__tests__/writingAuthoringTurnImport.test.js
git commit -m "feat(authoring): persist unit-scoped scene anchors"
```

## Task 5: Build projection v2 from anchors, bound worldbook and real observer data

**Files:**

- Create: `src/services/agents/authoring/authoringWorldbookSceneAdapter.js`
- Modify: `src/services/agents/authoring/authoringSceneProjection.js`
- Modify: `src/pages/Authoring.vue`
- Modify: `src/__tests__/authoringSceneProjection.test.js`
- Modify: `src/__tests__/authoringInspectorDetail.test.js`
- Modify: `src/__tests__/agentContracts.test.js`

- [ ] **Step 1: Write failing projection-v2 tests**

Required assertions:

```js
expect(projection).toMatchObject({
  schemaVersion: 2,
  activeUnitId: 'unit-b',
  worldbookId: 'wb-1',
  worldbookStatus: 'bound',
  anchorStatus: 'explicit'
})
expect(projection.presentCharacters.map((item) => item.id)).toEqual(['char-lina'])
expect(projection.activeRelations[0]).toMatchObject({
  subjectId: 'char-lina',
  objectId: 'char-mother'
})
```

Also assert:

- worldbook contains 20 characters but only anchor/evidence cast appears;
- manual empty returns no worldbook NPC;
- stale observations do not enter relations/events;
- an observation tied to current `unitId + unitRevision` does enter;
- previous chapter state appears only as `anchorStatus:'inherited'` and `inheritedSuggestion`;
- bound worldbook mismatch reports missing refs, never same-name rebinding.

- [ ] **Step 2: Confirm RED**

```bash
npm run test:run -- src/__tests__/authoringSceneProjection.test.js
```

- [ ] **Step 3: Implement the bounded worldbook adapter**

Export pure functions:

```js
export function buildWorldbookSceneIndex(worldbook) {
  const entries = Array.isArray(worldbook?.entries) ? worldbook.entries : []
  return {
    charactersById: new Map(entries.filter((e) => e.type === 'character').map((e) => [String(e.id), e])),
    locationsById: new Map(entries.filter((e) => e.type === 'location').map((e) => [String(e.id), e])),
    entries
  }
}

export function resolveSceneCharacter(index, id) {}
export function resolveSceneLocation(index, id) {}
export function selectActiveRelations({ index, presentCharacterIds, acceptedRelations, limit = 6 }) {}
```

Character summaries may expose name, short goal/mood/voice basis and source refs; do not include full entry content in projection. Relation selection includes only edges where at least one endpoint is present and returns stable subject/object IDs.

Formal relation candidates come from either a relation-like entry (`type: 'relation' | 'relationship'`) with two `relations.characters` IDs, or an accepted project relation observation with stable endpoint IDs. A character entry merely listing another character in `relations.characters` creates an association edge, not an invented emotional label; its label remains “有关联” unless canonical content provides a bounded explicit relation field.

- [ ] **Step 4: Upgrade `buildAuthoringSceneProjection` to schema v2**

New signature:

```js
buildAuthoringSceneProjection({
  projectId,
  chapter,
  document,
  activeUnitId,
  worldbook,
  sceneAnchors,
  acceptedObservations,
  projectMemories,
  outlineItems,
  previousChapterProjection,
  uiSelection
})
```

Delete Authoring's dependency on Experience `sceneThread` for normal projection. Keep a narrow `legacyImportRefs` adapter for imported units only.

- [ ] **Step 5: Preserve observer payloads in `refreshAuthoringObserverState`**

The current mapping drops text, source refs and revision. Replace it with:

```js
authoringObservations.value = events
  .filter((event) => String(event?.projectId || '') === selectedBookId.value)
  .map((event) => ({
    id: String(event.id || ''),
    kind: String(event.kind || ''),
    text: String(event.text || event.summary || ''),
    subjectId: String(event.subjectId || ''),
    objectId: String(event.objectId || ''),
    relation: String(event.relation || ''),
    unitId: String(event.unitId || ''),
    unitRevision: Number(event.unitRevision || 0),
    documentRevision: String(event.documentRevision || ''),
    sourceRefs: Array.isArray(event.sourceRefs) ? event.sourceRefs : [],
    status: String(event.status || 'applied')
  }))
```

Filter stale and non-applied events inside the projection, not by destroying their diagnostic data at ingestion.

- [ ] **Step 6: Wire one computed projection owner in `Authoring.vue`**

Replace `observerState: null` and the runtime-store guesswork. `sceneProjection` must receive:

- current book/chapter/document;
- `notebookSelection.unitId` or last valid unit ID;
- `boundWorldbook`;
- `sceneAnchors`;
- `authoringObservations`;
- current project memories and outline.

All left rail, Composer viewpoint/actor/target, inspector model builders and executor input continue reading this one computed object.

Observer dispatch after a successful prose commit must not turn a saved unit into a failed generation. Wrap it separately:

```js
try {
  await gameStore.commitAuthoringProseResult({ text: outcome.text, sourceRefs })
  refreshAuthoringObserverState()
} catch (error) {
  authoringObserverWarning.value = authoringFailure({
    phase: 'observer',
    code: 'AUTHORING_OBSERVER_REFRESH_FAILED',
    message: '正文已保存，现场状态将在稍后刷新',
    retryable: true
  })
}
```

The turn outcome remains `{ ok:true }`; the warning appears in the scene rail/inspector status and never asks the user to regenerate prose.

- [ ] **Step 7: Add a projection fingerprint gate**

Create a deterministic fingerprint from project/chapter/unit/document revision/worldbook ID/anchor ID. Include it in the turn request and verify it before applying the result. A changed projection caused by binding or anchor edits is stale even when prose revision is unchanged.

- [ ] **Step 8: Run focused tests**

```bash
npm run test:run -- \
  src/__tests__/authoringSceneProjection.test.js \
  src/__tests__/authoringInspectorDetail.test.js \
  src/__tests__/agentContracts.test.js \
  src/__tests__/authoringTurnRuntime.test.js
```

- [ ] **Step 9: Commit**

```bash
git add src/services/agents/authoring/authoringWorldbookSceneAdapter.js src/services/agents/authoring/authoringSceneProjection.js src/pages/Authoring.vue src/__tests__/authoringSceneProjection.test.js src/__tests__/authoringInspectorDetail.test.js src/__tests__/agentContracts.test.js src/__tests__/authoringTurnRuntime.test.js
git commit -m "feat(authoring): rebuild scenes from project context"
```

## Task 6: Make NarrativeKernel consume the bound worldbook and frozen scene projection

**Files:**

- Modify: `src/services/agents/authoring/narrativeKernelExecutor.js`
- Modify: `src/pages/Authoring.vue`
- Modify: `src/__tests__/narrativeKernelExecutor.test.js`
- Modify: `src/__tests__/authoringParityClosure.test.js`
- Modify: `src/__tests__/authoringTurnRuntime.test.js`

- [ ] **Step 1: Write failing executor tests**

Assert the executor:

```js
expect(buildKernel).toHaveBeenCalledWith(expect.objectContaining({
  worldbook: expect.objectContaining({ id: 'wb-bound' }),
  projectId: 'book-1',
  sceneProjection: expect.objectContaining({ activeUnitId: 'unit-a' }),
  turnContext: expect.objectContaining({ actorId: 'char-lina', targetId: 'char-edgar' })
}))
```

Also assert a globally active `wb-other` is never passed when the book binds `wb-bound`, and a missing bound worldbook returns `AUTHORING_WORLDBOOK_MISSING` before provider invocation.

- [ ] **Step 2: Confirm RED**

```bash
npm run test:run -- src/__tests__/narrativeKernelExecutor.test.js src/__tests__/authoringParityClosure.test.js
```

- [ ] **Step 3: Freeze an explicit executor input contract**

```js
executeTurn({
  projectId,
  worldbook,
  projection,
  projectionFingerprint,
  turn,
  documentContext,
  runtimeState,
  settings,
  signal
})
```

The executor must not look up `worldStore.activeWorldbook`, route state or current session internally.

- [ ] **Step 4: Keep instruction and relationship context bounded**

- Explicit instruction remains the final user message.
- `turnContext` includes kind/actor/target IDs and names.
- Projection contributes only current location/time/cast, up to 6 active relations and unresolved events.
- Character voice comes only from selected cast; only current speaker receives the bounded sample set.
- Relation context describes behavior constraints and source refs, not prose for the model to repeat verbatim.

- [ ] **Step 5: Enforce pre-provider context failures**

Return typed context failures for:

- selected book/chapter missing;
- bound worldbook ID missing from storage;
- dialogue speaker/target absent from manual cast;
- active unit or projection fingerprint missing.

An intentionally unbound book may proceed with chapter/project-memory context and `worldbook:null`, while retaining the visible reminder.

- [ ] **Step 6: Run focused generation tests**

```bash
npm run test:run -- \
  src/__tests__/narrativeKernelExecutor.test.js \
  src/__tests__/authoringParityClosure.test.js \
  src/__tests__/authoringTurnRuntime.test.js \
  src/__tests__/agentContracts.test.js
```

- [ ] **Step 7: Commit**

```bash
git add src/services/agents/authoring/narrativeKernelExecutor.js src/pages/Authoring.vue src/__tests__/narrativeKernelExecutor.test.js src/__tests__/authoringParityClosure.test.js src/__tests__/authoringTurnRuntime.test.js src/__tests__/agentContracts.test.js
git commit -m "fix(authoring): use bound scene context for turns"
```

## Task 7: Adapt legacy Experience import and project migrations

**Files:**

- Modify: `src/services/agents/authoring/authoringSessionProjection.js`
- Modify: `src/services/writing/writingExperienceImport.js`
- Modify: `src/pages/Authoring.vue`
- Modify: `src/services/migration/legacyMigrationBundle.js`
- Modify: `electron/migration/legacyProjectConverter.mjs`
- Modify: `src/__tests__/authoringLegacySessionImport.test.js`
- Modify: `src/__tests__/integration.test.js`
- Modify: `src/services/migration/legacyMigrationBundle.test.js`
- Modify: `electron/__tests__/legacyProjectConverter.test.mjs`

- [ ] **Step 1: Write failing import tests**

Cover:

```js
expect(result.book.worldbookId).toBe('wb-session')
expect(result.chapter.sceneAnchors[0]).toMatchObject({
  unitId: result.unitId,
  worldbookId: 'wb-session',
  source: 'legacy-import'
})
```

The binding is applied only when the target book is unbound and the import input contains explicit confirmation. Without confirmation, return `bindingProposal` and do not mutate `book.worldbookId`.

- [ ] **Step 2: Confirm RED**

```bash
npm run test:run -- src/__tests__/authoringLegacySessionImport.test.js src/__tests__/integration.test.js
```

- [ ] **Step 3: Extend import output without adding a runtime dependency**

`projectExperienceSession` accepts:

```js
{
  confirmWorldbookBinding: true,
  legacySceneSnapshot: {
    presentCharacterIds: [],
    locationId: '',
    viewpointCharacterId: '',
    time: { label: '', period: '' }
  }
}
```

Normalize only stable IDs. Do not copy full chat history, model transcript or arbitrary runtime prose into scene anchors.

- [ ] **Step 4: Prove Authoring survives session removal**

After import, remove the source session fixture and rebuild projection/generate from book + worldbook + imported unit. Expect success and preserved origin route metadata.

- [ ] **Step 5: Preserve new fields in browser and desktop migration**

Fixtures must retain:

```js
{
  worldbookId: 'wb-harbor',
  chapters: [{ sceneAnchors: [{ schemaVersion: 1, unitId: 'unit-a' }] }]
}
```

No converter should rename worldbook entry IDs or infer a binding from global active state.

- [ ] **Step 6: Run focused tests**

```bash
npm run test:run -- \
  src/__tests__/authoringLegacySessionImport.test.js \
  src/__tests__/integration.test.js \
  src/services/migration/legacyMigrationBundle.test.js
npm run test:desktop
```

- [ ] **Step 7: Commit**

```bash
git add src/services/agents/authoring/authoringSessionProjection.js src/services/writing/writingExperienceImport.js src/pages/Authoring.vue src/services/migration/legacyMigrationBundle.js src/__tests__/authoringLegacySessionImport.test.js src/__tests__/integration.test.js src/services/migration/legacyMigrationBundle.test.js electron
git commit -m "feat(authoring): import legacy scenes into books"
```

## Task 8: Restyle the left rail as a manuscript-native current-scene index

**Files:**

- Modify: `src/components/authoring/AuthoringSceneRail.vue`
- Modify: `src/pages/Authoring.vue`
- Modify: `src/pages/Writing.scoped.css`
- Modify: `src/pages/Writing.global.css`
- Modify: `src/__tests__/authoringSceneRail.test.js`
- Modify: `scripts/ui-audit.mjs`

- [ ] **Step 1: Write failing source/component tests**

Assert:

- visible title is `当前场`, not `本章现场`;
- there are no per-person `行动者`/`对象` buttons;
- one `调整` action emits `edit`;
- projection status renders `当前落笔处`, `沿用上一章`, `未关联世界书` or `世界书已缺失`;
- at most four people and one unresolved event render before `+N`;
- no `.scene-rail__role` pill-like controls or horizontal scroller.

- [ ] **Step 2: Confirm RED**

```bash
npm run test:run -- src/__tests__/authoringSceneRail.test.js
```

- [ ] **Step 3: Simplify component interaction ownership**

The component emits only:

```js
defineEmits(['open-detail', 'advance-with', 'edit', 'bind-worldbook'])
```

Person click opens detail. Actor/target selection moves to Composer. Keep stable `data-scene-rail-item` attributes for focus restoration.

- [ ] **Step 4: Align markup with manuscript navigation**

Use a continuous text list:

```vue
<section class="scene-rail" aria-label="当前场">
  <header class="scene-rail__head">
    <span>当前场</span>
    <button type="button" class="wall__shelf-pin-btn" @click="emit('edit')">调整</button>
  </header>
  <p class="scene-rail__context">{{ contextLabel }}</p>
  <button class="scene-rail__line" ...>{{ locationTimeLabel }}</button>
  <ul class="scene-rail__people">...</ul>
</section>
```

Do not introduce a card background, rounded container, gradient, emoji or colored left border.

- [ ] **Step 5: Reuse page tokens and remove bespoke control CSS**

- Match `.wall__folder`, `.wall__chapter` typography rhythm and hover underline/activity line.
- Keep only one subtle separator between manuscript and current scene.
- Use existing `--archive-*`, `--text-*`, `--border`, `--control-focus` tokens.
- Remove custom mini-button borders and role badges.

- [ ] **Step 6: Add deterministic audit states**

Add `current-scene`, `worldbook-unbound`, `worldbook-missing`, `scene-inherited` fixtures to `scripts/ui-audit.mjs` without inserting fake production data outside audit mode.

- [ ] **Step 7: Run focused tests and static UI checks**

```bash
npm run test:run -- src/__tests__/authoringSceneRail.test.js src/__tests__/authoringManuscriptNavigation.test.js
npm run build
```

- [ ] **Step 8: Run live screenshots only against a compatible existing server**

First verify the served source contains the current commit marker or current component text. Then:

```bash
UI_AUDIT_ROUTES=authoring \
UI_AUDIT_STATES=current-scene,worldbook-unbound,worldbook-missing,scene-inherited \
UI_AUDIT_WIDTHS=1440,390 \
UI_AUDIT_OUTPUT=/tmp/pinax-authoring-scene-rail-audit \
npm run audit:ui
```

Expected: 0 console errors, 0 a11y failures, 0 horizontal overflow. Review screenshots before proceeding.

- [ ] **Step 9: Commit**

```bash
git add src/components/authoring/AuthoringSceneRail.vue src/pages/Authoring.vue src/pages/Writing.scoped.css src/pages/Writing.global.css src/__tests__/authoringSceneRail.test.js scripts/ui-audit.mjs
git commit -m "style(authoring): align current scene with manuscript"
```

## Task 9: Restyle Composer as the editor's continuation dock

**Files:**

- Modify: `src/components/authoring/AuthoringTurnComposer.vue`
- Modify: `src/pages/Authoring.vue`
- Modify: `src/pages/Writing.scoped.css`
- Modify: `src/pages/Writing.global.css`
- Modify: `src/__tests__/authoringTurnComposer.test.js`
- Modify: `src/__tests__/authoringCandidateAssist.test.js`
- Modify: `scripts/ui-audit.mjs`

- [ ] **Step 1: Write failing UI contract tests**

Lock:

- root uses a continuation-dock role/class, not a standalone card presentation;
- action/dialogue/thought/scene remain keyboard-operable text tabs with underline;
- actor/target selection is available in Composer;
- candidates use continuous list rows and actions are focusable;
- typed failure renders phase-specific recovery;
- director note and semi-auto stay in one disclosure;
- no pill classes, horizontal shortcut strip or nested floating panel.

- [ ] **Step 2: Confirm RED**

```bash
npm run test:run -- src/__tests__/authoringTurnComposer.test.js src/__tests__/authoringCandidateAssist.test.js
```

- [ ] **Step 3: Consolidate actor/target selection**

Add emits:

```js
defineEmits([
  'submit', 'stop', 'select-actor', 'select-target', 'retry-save',
  'request-reference-summary', 'request-next-directions',
  'request-dialogue-options', 'candidate-action'
])
```

Use one existing popover on desktop and the existing inspector/sheet pattern on mobile. Actor is optional for action/scene; dialogue requires both speaker and target and both must be present in projection.

- [ ] **Step 4: Flatten the visual structure**

Required hierarchy:

```text
下一拍   行动 对话 心理 场景   莉娜 → 艾德加   更多
描述接下来发生什么……                         按此推进
typed status / candidates / disclosure
```

Reuse `.tool-btn` dimensions for secondary actions and the existing editor primary-action treatment for submit. The textarea uses the editor's underline/background language; do not wrap it in an extra rounded card.

- [ ] **Step 5: Restyle candidates as annotation-like rows**

Desktop actions appear on row hover and `:focus-within`; mobile actions wrap below the text and remain directly tappable. Preserve all four direction actions and dialogue fill behavior.

- [ ] **Step 6: Complete Zen behavior**

When `.wall.is-zen`:

- the dock collapses to one quiet “下一拍” line;
- focus expands it;
- Escape closes candidates/disclosure first, collapses the dock second, then lets the existing Zen handler run.

- [ ] **Step 7: Run focused tests and build**

```bash
npm run test:run -- \
  src/__tests__/authoringTurnComposer.test.js \
  src/__tests__/authoringCandidateAssist.test.js \
  src/__tests__/authoringSemiAuto.test.js \
  src/__tests__/authoringDirectorNote.test.js
npm run build
```

- [ ] **Step 8: Run compatible live audit**

```bash
UI_AUDIT_ROUTES=authoring \
UI_AUDIT_STATES=regular,generating,provider-error,stale,persist-error,candidates,zen \
UI_AUDIT_WIDTHS=1440,900,390 \
UI_AUDIT_OUTPUT=/tmp/pinax-authoring-composer-audit \
npm run audit:ui
```

Expected: no clipped textarea/button, no horizontal overflow, keyboard focus visible,正文仍是第一视觉中心.

- [ ] **Step 9: Commit**

```bash
git add src/components/authoring/AuthoringTurnComposer.vue src/pages/Authoring.vue src/pages/Writing.scoped.css src/pages/Writing.global.css src/__tests__/authoringTurnComposer.test.js src/__tests__/authoringCandidateAssist.test.js src/__tests__/authoringSemiAuto.test.js src/__tests__/authoringDirectorNote.test.js scripts/ui-audit.mjs
git commit -m "style(authoring): integrate the continuation dock"
```

## Task 10: Restyle Inspector details and add project-owned scene curation

**Files:**

- Create: `src/components/authoring/AuthoringSceneCuration.vue`
- Modify: `src/components/authoring/AuthoringInspectorDetail.vue`
- Modify: `src/pages/Authoring.vue`
- Modify: `src/pages/Writing.global.css`
- Modify: `src/pages/Writing.scoped.css`
- Modify: `src/__tests__/authoringInspectorDetail.test.js`
- Modify: `src/__tests__/authoringSceneRail.test.js`
- Modify: `scripts/ui-audit.mjs`

- [ ] **Step 1: Write failing inspector and curation tests**

Assert:

- default tabs remain only comments/version;
- detail and scene curation are temporary routes;
- `AuthoringInspectorDetail` uses existing inspector section/action classes, with no bespoke left-border title or dashed footer;
- scene curation draft initializes from active anchor/projection;
- cancel/Escape causes zero anchor writes;
- save commits time/location/cast together to current unit;
- undo rejects when anchor fingerprint changed;
- changing selected book/chapter/unit closes stale draft and restores base inspector state.

- [ ] **Step 2: Confirm RED**

```bash
npm run test:run -- src/__tests__/authoringInspectorDetail.test.js src/__tests__/authoringSceneRail.test.js
```

- [ ] **Step 3: Create a controlled scene-curation component**

Props:

```js
defineProps({
  draft: { type: Object, required: true },
  worldbookStatus: { type: String, required: true },
  characterCandidates: { type: Array, default: () => [] },
  locationCandidates: { type: Array, default: () => [] },
  busy: { type: Boolean, default: false },
  error: { type: Object, default: null },
  canUndo: { type: Boolean, default: false }
})
defineEmits(['update-draft', 'save', 'cancel', 'undo', 'bind-worldbook', 'search'])
```

The component does not access store/localStorage/provider. Layout is time → location → people, no three-tab switcher.

- [ ] **Step 4: Use full worldbook directories for picker search**

Default recommendation is bounded; a query searches the complete bound worldbook character/location directory. Empty results show “打开世界书” or “关联世界书”; never create a fake entity.

Add the pure candidate helper to `authoringWorldbookSceneAdapter.js`:

```js
export function buildSceneCurationCandidates({ axis, worldbook, query = '', selectedIds = [], limit = 8 }) {
  const normalizedQuery = String(query).trim().toLocaleLowerCase()
  const expectedType = axis === 'character' ? 'character' : 'location'
  return (worldbook?.entries || [])
    .filter((entry) => entry?.type === expectedType)
    .filter((entry) => !normalizedQuery || [entry.name, ...(entry.keys || [])]
      .join(' ').toLocaleLowerCase().includes(normalizedQuery))
    .map((entry) => ({
      id: String(entry.id),
      name: String(entry.name || entry.keys?.[0] || ''),
      selected: selectedIds.includes(String(entry.id)),
      summary: String(entry.content || '').replace(/\s+/g, ' ').slice(0, 120)
    }))
    .slice(0, normalizedQuery ? 24 : limit)
}
```

Add contract assertions to `authoringSceneProjection.test.js` that a query can find an entry outside the default top eight while no-query results remain bounded.

- [ ] **Step 5: Route save/cancel/undo through the anchor transaction**

- `save` calls `commitSceneAnchorDraft` once and persists the chapter once.
- `cancel` drops local draft.
- `undo` compares current fingerprint to receipt.after before restoring.
- stale/persist failures keep the draft open and show typed error.

- [ ] **Step 6: Reuse inspector structure**

Replace scoped visual clones with existing classes:

```vue
<header class="writing-inspector__context">...</header>
<div class="writing-inspector__list">...</div>
<footer class="writing-inspector__actions">...</footer>
```

If a new shared class is needed, add it once under `.writing-page .writing-inspector` in `Writing.global.css`, not separately in both components.

- [ ] **Step 7: Validate focus and mobile sheet behavior**

Opening moves focus to inspector title; closing restores the rail item. At 390px, header and save footer remain reachable, body owns scrolling, touch controls are at least 44px, safe-area padding is applied through the existing inspector sheet.

- [ ] **Step 8: Run tests and compatible audit**

```bash
npm run test:run -- \
  src/__tests__/authoringInspectorDetail.test.js \
  src/__tests__/authoringSceneRail.test.js \
  src/__tests__/authoringSceneAnchors.test.js
npm run build

UI_AUDIT_ROUTES=authoring \
UI_AUDIT_STATES=scene-detail,scene-edit,scene-edit-empty,scene-edit-error \
UI_AUDIT_WIDTHS=1440,900,390 \
UI_AUDIT_OUTPUT=/tmp/pinax-authoring-inspector-audit \
npm run audit:ui
```

- [ ] **Step 9: Commit**

```bash
git add src/components/authoring/AuthoringSceneCuration.vue src/components/authoring/AuthoringInspectorDetail.vue src/pages/Authoring.vue src/pages/Writing.global.css src/pages/Writing.scoped.css src/__tests__/authoringInspectorDetail.test.js src/__tests__/authoringSceneRail.test.js src/__tests__/authoringSceneAnchors.test.js scripts/ui-audit.mjs
git commit -m "feat(authoring): curate scenes in the inspector"
```

## Task 11: Run worldbook, recovery and complete UI gates

**Files:**

- Modify tests only if a gate reveals an actual regression.
- Create: `docs/agent-runs/2026-08-23-authoring-worldbook-scene-closure/summary.md`
- Modify: `docs/STATUS.md`
- Modify: `docs/PLAN.md`
- Modify: `docs/LOG.md`
- Modify: `docs/src/known-issues.md` only if an unresolved product-visible issue remains.

- [ ] **Step 1: Run the full focused matrix**

```bash
npm run test:run -- \
  src/__tests__/authoringExecutionResult.test.js \
  src/__tests__/authoringWorldbookBinding.test.js \
  src/__tests__/authoringSceneAnchors.test.js \
  src/__tests__/authoringSceneProjection.test.js \
  src/__tests__/authoringTurnRuntime.test.js \
  src/__tests__/authoringTurnComposer.test.js \
  src/__tests__/authoringInspectorDetail.test.js \
  src/__tests__/authoringLegacySessionImport.test.js \
  src/__tests__/writingAuthoringTurnImport.test.js \
  src/__tests__/worldBookQuickImport.test.js \
  src/__tests__/backupExport.test.js \
  src/services/migration/legacyMigrationBundle.test.js
```

Expected: all pass.

- [ ] **Step 2: Verify all worldbook entry paths remain intact**

Run focused tests covering:

- preset import;
- novel-text import;
- AI-driven baseline creation;
- active-worldbook selection;
- advanced import/export round-trip.

Use the existing `worldBookQuickImport.test.js` cases rather than creating a parallel smoke harness. Expected: no changes in import preview/conflict semantics.

- [ ] **Step 3: Run narrative recovery and production dry-run**

```bash
npm run smoke:narrative-recovery
npm run smoke:narrative-production -- --dry-run
```

Expected: recovery `passed=true`; production dry-run exits 0 with all configured checks passed.

- [ ] **Step 4: Run full repository verification**

```bash
npm run verify:full
```

Expected: tests, Vite build, `git diff --check` and VitePress build all exit 0. Record exact counts.

- [ ] **Step 5: Run the complete compatible live UI matrix**

Only after proving the server serves this branch:

```bash
UI_AUDIT_ROUTES=authoring \
UI_AUDIT_STATES=regular,worldbook-unbound,worldbook-missing,scene-derived,scene-explicit,generating,provider-error,stale,persist-error,scene-detail,scene-edit,zen \
UI_AUDIT_WIDTHS=1440,1024,900,390 \
UI_AUDIT_OUTPUT=/tmp/pinax-authoring-worldbook-scene-final \
npm run audit:ui
```

Expected: 0 console error, 0 a11y failure, 0 horizontal overflow. Manually inspect at least regular, scene-edit, provider-error and Zen screenshots at 1440 and 390.

- [ ] **Step 6: Run one real provider short/long round-trip**

Use the configured server without logging prompt or prose. Matrix:

1. short chapter, bound worldbook, explicit instruction;
2. long chapter, bound worldbook, empty continue;
3. same chapter with two scene anchors, target first scene;
4. forced stale by editing during request;
5. forced persist failure using the existing test fixture, not destructive browser storage changes.

Required evidence per case:

```json
{
  "case": "short-explicit",
  "ok": true,
  "phase": "complete",
  "insertedAfterUnitId": "unit-a",
  "worldbookIdMatched": true,
  "savedAfterReload": true,
  "durationMs": 0,
  "requestId": "redacted-safe-id"
}
```

Do not save generated text or prompt in the report.

- [ ] **Step 7: Write the handoff summary**

The summary must include:

- base and final commit;
- implemented task table;
- exact test/build/smoke/audit commands and exit codes;
- screenshots directory or explicit not-run reason;
- real provider cases and low-sensitive outcomes;
- remaining gaps, especially any desktop P3 adaptation or `/experience` retirement gate.

- [ ] **Step 8: Update canonical docs**

- `docs/STATUS.md`: move this work from current arrangement to recently done and update next gate.
- `docs/PLAN.md`: mark the Authoring/worldbook scene closure milestone without claiming Experience retirement.
- `docs/LOG.md`: add a dated behavior summary and verification evidence.
- known issues: retain only actual unresolved user-visible failures.

- [ ] **Step 9: Commit verification and handoff docs**

```bash
git add docs/STATUS.md docs/PLAN.md docs/LOG.md docs/src/known-issues.md docs/agent-runs/2026-08-23-authoring-worldbook-scene-closure/summary.md
git commit -m "docs(authoring): record scene closure verification"
```

Omit `docs/src/known-issues.md` from `git add` if it was not changed.

## Task 12: Final review and integration handoff

- [ ] **Step 1: Review the implementation against all 14 spec acceptance criteria**

Create a table in the summary with one row per criterion and one of:

- `verified:test`
- `verified:live`
- `verified:provider`
- `not-verified:<specific reason>`

No criterion may be marked complete from source inspection alone when the spec requires live/provider behavior.

- [ ] **Step 2: Run final hygiene checks**

```bash
git status --short --branch
git diff --check
git log --oneline --decorate integration/consolidation-20260823..HEAD
git diff --stat integration/consolidation-20260823...HEAD
```

Expected: clean worktree, no diff-check errors, only scoped Authoring/worldbook/migration/docs changes.

- [ ] **Step 3: Request code review**

Use `requesting-code-review` and ask the reviewer to focus on:

1. no implicit active-worldbook fallback;
2. target unit stale safety;
3. anchor transition correctness;
4. observer source/revision filtering;
5. typed failure recovery;
6. UI consistency at 1440/390 and Zen;
7. legacy import independence from session lifetime.

- [ ] **Step 4: Fix verified findings and rerun proportionate gates**

Any runtime fix reruns focused tests + `verify:full`; any UI fix reruns affected screenshots; any context/worldbook fix reruns one generation smoke.

- [ ] **Step 5: Present integration options**

Use `finishing-a-development-branch` only after all required gates are green. Recommend merging into the latest integration branch, not stale `main`, and keep `/experience` until the user separately approves retirement.

## Completion definition

This plan is complete only when:

- the actual served Authoring version contains the implementation;
- book/worldbook binding is visible and explicit;
- current scene follows active writingUnit;
- next beat inserts after the frozen target unit;
- relations/voice/location come from the bound worldbook without expanding cast;
- observer data reaches projection with source/revision checks;
- failures are visibly phase-specific;
- left rail, continuation dock and inspector pass visual review;
- save/reload, stale, legacy import and real provider paths have evidence;
- `/experience` remains available pending separate written retirement approval.
