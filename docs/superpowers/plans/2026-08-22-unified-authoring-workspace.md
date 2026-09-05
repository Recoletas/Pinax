# Unified Authoring Workspace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将体验与写作合并为一个以持续可编辑正文为中心的 Web 创作工作区，并以低干扰方式提供叙事推演、局部 AI 微调、上下文解释和异常审阅。

**Architecture:** 现有 Writing 页面原位演进为 Authoring，编辑器始终是唯一正文表面；“续写、推进、模拟人物、模拟场景、插入、改写”是针对当前光标/选区的命令，不是互斥文档模式，也不创建场景分支。AI 正文经同一编辑事务立即插入并提供一次短暂 Undo；上下文和派生异常默认收起。旧 Experience 在内容、历史、移动端和恢复门禁通过前继续可用。

**Tech Stack:** Vue 3、TipTap、Pinia、existing WritingNotebookEditor、shared Authoring runtime、Vitest、UI audit。

---

## Prerequisite

Foundation、Settings Migration 与 Authoring Runtime 已在同一集成分支通过 focused tests。执行前读取 `agent-skills/ui-style-check/SKILL.md` 和 `docs/engineering/visual-alignment-workflow.md`。

### Task 1: Establish Authoring as the canonical route without removing compatibility

**Files:**
- Create: `src/pages/Authoring.vue` by moving `src/pages/Writing.vue`
- Recreate: `src/pages/Writing.vue`
- Modify: `src/router/index.js`
- Modify: `src/config/workbenchNav.js`
- Modify: `src/__tests__/uiControlContract.test.js`

- [ ] **Step 1: Write the failing route/navigation contract**

```js
it('uses one authoring destination while retaining writing and experience compatibility', async () => {
  const routerSource = await readFile(new URL('../router/index.js', import.meta.url), 'utf8')
  const navSource = await readFile(new URL('../config/workbenchNav.js', import.meta.url), 'utf8')
  expect(routerSource).toContain("name: 'authoring'")
  expect(routerSource).toContain("path: 'authoring'")
  expect(routerSource).toContain("path: 'experience'")
  expect(routerSource).toContain("path: '/writing', redirect: { name: 'authoring' }")
  expect(navSource).toContain("key: 'authoring'")
  expect(navSource).not.toMatch(/key: 'experience'[\s\S]*key: 'writing'/)
})
```

- [ ] **Step 2: Run the test and confirm RED**

Run: `npm run test:run -- src/__tests__/uiControlContract.test.js`

Expected: FAIL because no authoring route exists.

- [ ] **Step 3: Move the page and add a thin compatibility wrapper**

```bash
git mv src/pages/Writing.vue src/pages/Authoring.vue
```

Create `src/pages/Writing.vue`:

```vue
<script setup>
import Authoring from './Authoring.vue'
</script>

<template>
  <Authoring />
</template>
```

In the router, lazy-load `Authoring.vue` at `/authoring` with route name `authoring`; redirect `/writing` and the old workbench child `writing` path to it. Keep `/experience` unchanged. Replace the two top-level nav activities “体验 / 写作” with one “创作”, but retain “联机” under a compatibility child until online parity has a separate plan.

- [ ] **Step 4: Run route tests and commit**

Run: `npm run test:run -- src/__tests__/uiControlContract.test.js src/__tests__/integration.test.js`

Expected: PASS; old `/writing` links resolve to Authoring and `/experience` still opens.

```bash
git add src/pages/Authoring.vue src/pages/Writing.vue src/router/index.js src/config/workbenchNav.js src/__tests__/uiControlContract.test.js
git commit -m "feat(authoring): establish unified workspace route"
```

### Task 2: Project existing Experience history into the editable document

**Files:**
- Create: `src/services/agents/authoring/authoringSessionProjection.js`
- Modify: `src/services/writing/writingExperienceImport.js`
- Modify: `src/pages/Authoring.vue`
- Create: `src/__tests__/authoringWorkspace.test.js`

- [ ] **Step 1: Write the failing idempotent projection test**

```js
import { describe, expect, it } from 'vitest'
import { projectExperienceSession } from '../services/agents/authoring/authoringSessionProjection.js'

it('imports each successful assistant turn once and preserves its source identity', () => {
  const session = {
    id: 'session-1',
    activeTurnIds: ['turn-1'],
    turns: [{ id: 'turn-1', status: 'committed', assistantMessageIds: ['a1'] }],
    messages: [
      { id: 'u1', role: 'user', content: '推开门' },
      { id: 'a1', role: 'assistant', content: '林昭推开门。', status: 'completed' }
    ]
  }
  const books = [{ id: 'book-1', chapters: [{ id: 'chapter-1', content: '', editorDocument: null }] }]
  const first = projectExperienceSession({ session, books, bookId: 'book-1', chapterId: 'chapter-1', worldbookId: 'wb-1' })
  const second = projectExperienceSession({ session, books: first.books, bookId: 'book-1', chapterId: 'chapter-1', worldbookId: 'wb-1' })
  expect(first.importedCount).toBe(1)
  expect(second.importedCount).toBe(0)
  expect(second.skipped[0].reason).toBe('already-imported')
})
```

- [ ] **Step 2: Run the test and confirm RED**

Run: `npm run test:run -- src/__tests__/authoringWorkspace.test.js`

Expected: FAIL because the session projection does not exist.

- [ ] **Step 3: Implement projection through the existing writing-unit import contract**

```js
export function projectExperienceSession({ session, books, bookId, chapterId, worldbookId }) {
  let nextBooks = books
  let importedCount = 0
  const skipped = []
  for (const turn of session.turns || []) {
    const message = (session.messages || []).find((item) => turn.assistantMessageIds?.includes(String(item.id)))
    const result = appendExperienceTurnToChapter({
      books: nextBooks,
      bookId,
      chapterId,
      sessionId: session.id,
      branchId: session.branchId || 'main',
      worldbookId,
      turn,
      message,
      messages: session.messages,
      activeTurnIds: session.activeTurnIds
    })
    if (result.ok) {
      nextBooks = result.books
      importedCount += 1
    } else {
      skipped.push({ turnId: turn.id, reason: result.reason })
    }
  }
  return { books: nextBooks, importedCount, skipped }
}
```

Import `appendExperienceTurnToChapter` from `writingExperienceImport.js` and use the function parameters shown in the test. The existing schema-v3 `writingUnit -> nodes` importer keeps split/merge, annotations and source back-jumps valid. Do not import user commands as prose, create alternate documents, or invent scene branches. `Authoring.vue` runs the projection once when opening a linked legacy session and saves through the normal writing document transaction.

- [ ] **Step 4: Run import tests and commit**

Run: `npm run test:run -- src/__tests__/authoringWorkspace.test.js src/__tests__/gameStoreSession.test.js src/__tests__/integration.test.js`

Expected: PASS; repeated open/import is idempotent and every imported unit can resolve its original message.

```bash
git add src/services/agents/authoring/authoringSessionProjection.js src/services/writing/writingExperienceImport.js src/pages/Authoring.vue src/__tests__/authoringWorkspace.test.js
git commit -m "feat(authoring): project experience history into drafts"
```

### Task 3: Add a low-clutter command surface

**Files:**
- Create: `src/components/authoring/AuthoringCommandBar.vue`
- Create: `src/components/authoring/AuthoringTransientNotice.vue`
- Modify: `src/pages/Authoring.vue`
- Modify: `src/pages/Writing.scoped.css`
- Modify: `src/__tests__/uiControlContract.test.js`

- [ ] **Step 1: Write the failing interaction contract**

```js
it('keeps one editor and exposes authoring intents as commands instead of page modes', async () => {
  const source = await readFile(new URL('../pages/Authoring.vue', import.meta.url), 'utf8')
  expect(source.match(/<WritingNotebookEditor/g)).toHaveLength(1)
  expect(source).toContain('<AuthoringCommandBar')
  expect(source).not.toMatch(/scene[- ]branch|场景分支|草稿分支/)
  expect(source).not.toMatch(/authoring-mode-tabs|体验模式|写作模式/)
})
```

- [ ] **Step 2: Run the test and confirm RED**

Run: `npm run test:run -- src/__tests__/uiControlContract.test.js`

Expected: FAIL because the command bar is absent.

- [ ] **Step 3: Implement a compact intent bar**

```vue
<script setup>
defineProps({
  busy: Boolean,
  hasSelection: Boolean
})
const emit = defineEmits(['run', 'cancel'])

const commands = [
  { id: 'authoring.continue', label: '续写', target: 'cursor' },
  { id: 'authoring.advance', label: '推进', target: 'cursor' },
  { id: 'authoring.simulate.character', label: '人物反应', target: 'cursor' },
  { id: 'authoring.simulate.scene', label: '推演场景', target: 'cursor' },
  { id: 'authoring.insert', label: '插入', target: 'cursor' },
  { id: 'authoring.rewrite', label: '改写选区', target: 'selection' }
]
</script>

<template>
  <div class="authoring-command-bar" aria-label="AI 创作命令">
    <button
      v-for="command in commands"
      :key="command.id"
      type="button"
      :disabled="busy || (command.target === 'selection' && !hasSelection)"
      @click="emit('run', command.id)"
    >{{ command.label }}</button>
    <button v-if="busy" type="button" @click="emit('cancel')">停止</button>
  </div>
</template>
```

Place this bar adjacent to the editor command area, not in a permanent second pane. Reuse existing control tokens, focus rings and the 720/760px breakpoints. On 390px it is a single horizontally scrollable row; it does not increase the fixed header height.

`AuthoringTransientNotice.vue` renders one `role="status"` line with optional Undo and disappears after six seconds or the next manual edit.

- [ ] **Step 4: Run UI contract tests and commit**

Run: `npm run test:run -- src/__tests__/uiControlContract.test.js`

Expected: PASS; the page contains one editor and no mode-tab/branch language.

```bash
git add src/components/authoring/AuthoringCommandBar.vue src/components/authoring/AuthoringTransientNotice.vue src/pages/Authoring.vue src/pages/Writing.scoped.css src/__tests__/uiControlContract.test.js
git commit -m "feat(authoring): add compact AI command surface"
```

### Task 4: Insert narrative prose through one editable transaction with transient Undo

**Files:**
- Create: `src/composables/useAuthoringTask.js`
- Create: `src/services/agents/authoring/authoringTextTransaction.js`
- Modify: `src/pages/Authoring.vue`
- Modify: `src/components/writing/WritingNotebookEditor.vue`
- Create: `src/__tests__/authoringWorkspace.test.js`

- [ ] **Step 1: Write failing transaction tests**

```js
import { describe, expect, it } from 'vitest'
import { applyAuthoringText, undoAuthoringText } from '../services/agents/authoring/authoringTextTransaction.js'

it('inserts generated prose and restores the exact prior document on request undo', () => {
  const before = { text: '潮水漫过台阶。', revision: 'r3' }
  const applied = applyAuthoringText(before, { from: 7, to: 7, text: '\n林昭推开门。', requestId: 'req-1' })
  expect(applied.document.text).toBe('潮水漫过台阶。\n林昭推开门。')
  expect(undoAuthoringText(applied.document, applied.receipt)).toEqual(before)
})
```

- [ ] **Step 2: Run the test and confirm RED**

Run: `npm run test:run -- src/__tests__/authoringWorkspace.test.js`

Expected: FAIL because the transaction module does not exist.

- [ ] **Step 3: Implement revision-bound insert/replace receipts**

```js
export function applyAuthoringText(document, patch) {
  if (patch.from < 0 || patch.to < patch.from || patch.to > document.text.length) throw new Error('invalid-text-range')
  const nextText = document.text.slice(0, patch.from) + patch.text + document.text.slice(patch.to)
  const nextRevision = `${document.revision}:${patch.requestId}`
  return {
    document: { ...document, text: nextText, revision: nextRevision },
    receipt: Object.freeze({
      requestId: patch.requestId,
      beforeRevision: document.revision,
      afterRevision: nextRevision,
      beforeText: document.text,
      afterText: nextText
    })
  }
}

export function undoAuthoringText(document, receipt) {
  if (document.revision !== receipt.afterRevision || document.text !== receipt.afterText) return null
  return { ...document, text: receipt.beforeText, revision: receipt.beforeRevision }
}
```

`useAuthoringTask()` creates the request from the current project/document/selection, dispatches it, applies allowed text actions via `WritingNotebookEditor`'s exposed `insertPlainText()` or `replaceTextRange()`, saves through the existing document path, and exposes `{ busy, error, notice, undoLastRequest, cancel }`. Any manual edit invalidates the transient receipt.

- [ ] **Step 4: Run workspace/store tests and commit**

Run: `npm run test:run -- src/__tests__/authoringWorkspace.test.js src/__tests__/gameStoreSession.test.js src/__tests__/integration.test.js`

Expected: PASS; each generated segment creates one document transaction and one Undo receipt.

```bash
git add src/composables/useAuthoringTask.js src/services/agents/authoring/authoringTextTransaction.js src/pages/Authoring.vue src/components/writing/WritingNotebookEditor.vue src/__tests__/authoringWorkspace.test.js
git commit -m "feat(authoring): insert AI prose with transient undo"
```

### Task 5: Add an on-demand context inspector

**Files:**
- Create: `src/components/authoring/AuthoringContextInspector.vue`
- Modify: `src/pages/Authoring.vue`
- Modify: `src/pages/Writing.scoped.css`
- Modify: `src/__tests__/authoringWorkspace.test.js`

- [ ] **Step 1: Write the failing privacy/visibility test**

```js
it('shows source activation and truncation without raw prompts', () => {
  const wrapper = mount(AuthoringContextInspector, {
    props: {
      open: true,
      ledger: { parts: [{ kind: 'character', status: 'included', chars: 420, sourceRefs: ['char:lin-zhao'] }] }
    }
  })
  expect(wrapper.text()).toContain('人物')
  expect(wrapper.text()).toContain('已采用')
  expect(wrapper.text()).not.toContain('system prompt')
  expect(wrapper.html()).not.toContain('rawPrompt')
})
```

- [ ] **Step 2: Run the test and confirm RED**

Run: `npm run test:run -- src/__tests__/authoringWorkspace.test.js`

Expected: FAIL because the inspector does not exist.

- [ ] **Step 3: Implement a transient accessible sheet**

The component accepts only the low-sensitivity context ledger and displays block label, included/truncated/dropped status, character count and source reference label. It uses the existing transient-layer pattern for initial focus, focus trap, Escape, focus restoration and body scroll lock. It never accepts messages, full prompt text or provider chain-of-thought as props.

- [ ] **Step 4: Run UI tests and commit**

Run: `npm run test:run -- src/__tests__/authoringWorkspace.test.js src/__tests__/uiControlContract.test.js`

Expected: PASS; keyboard focus cannot escape the open sheet.

```bash
git add src/components/authoring/AuthoringContextInspector.vue src/pages/Authoring.vue src/pages/Writing.scoped.css src/__tests__/authoringWorkspace.test.js
git commit -m "feat(authoring): explain activated project context"
```

### Task 6: Surface only exceptional derived-state conflicts

**Files:**
- Create: `src/components/authoring/AuthoringExceptionReview.vue`
- Create: `src/composables/useAuthoringObservers.js`
- Modify: `src/pages/Authoring.vue`
- Modify: `src/__tests__/authoringWorkspace.test.js`

- [ ] **Step 1: Write the failing interruption-policy test**

```js
it('keeps routine observations silent and lists only typed exceptions', async () => {
  const { visibleExceptions, statusText } = useAuthoringObservers({
    observations: ref([{ id: 'o1', kind: 'relation', status: 'applied' }]),
    exceptions: ref([{ id: 'e1', reason: 'locked-conflict', summary: '人物年龄与锁定设定冲突' }])
  })
  expect(statusText.value).toBe('已更新 1 项派生信息')
  expect(visibleExceptions.value).toEqual([expect.objectContaining({ id: 'e1' })])
})
```

- [ ] **Step 2: Run the test and confirm RED**

Run: `npm run test:run -- src/__tests__/authoringWorkspace.test.js`

Expected: FAIL because observer UI state does not exist.

- [ ] **Step 3: Implement quiet status and explicit exception actions**

`useAuthoringObservers()` exposes a six-second status message for routine applied observations and persists only exceptions. `AuthoringExceptionReview.vue` lists `locked-conflict`, `identity-ambiguity` and `destructive-retcon` with actions “保留锁定设定”, “采用正文派生”, and “稍后处理”. Destructive retcon adoption requires a second explicit confirmation; other typing remains available while the sheet is open or closed.

- [ ] **Step 4: Run tests and commit**

Run: `npm run test:run -- src/__tests__/authoringWorkspace.test.js src/__tests__/uiControlContract.test.js`

Expected: PASS; routine observations create no modal and no focus movement.

```bash
git add src/components/authoring/AuthoringExceptionReview.vue src/composables/useAuthoringObservers.js src/pages/Authoring.vue src/__tests__/authoringWorkspace.test.js
git commit -m "feat(authoring): review exceptional story conflicts"
```

### Task 7: Reach Experience parity before retirement

**Files:**
- Modify: `src/pages/Authoring.vue`
- Modify: `src/pages/Experience.vue`
- Modify: `src/router/index.js`
- Modify: `src/config/workbenchNav.js`
- Modify: `scripts/ui-audit.mjs`
- Modify: `src/__tests__/authoringWorkspace.test.js`
- Modify: `src/__tests__/uiControlContract.test.js`
- Create: `docs/agent-runs/2026-08-22-unified-authoring-workspace/parity.md`

- [ ] **Step 1: Add a failing parity checklist test**

```js
it('exposes required Experience capabilities in Authoring before redirect', async () => {
  const source = await readFile(new URL('../pages/Authoring.vue', import.meta.url), 'utf8')
  for (const capability of [
    'authoring.continue',
    'authoring.advance',
    'authoring.simulate.character',
    'authoring.simulate.scene',
    'authoring.next-actions',
    'authoring.dialogue-options',
    'authoring.emergence'
  ]) expect(source).toContain(capability)
  expect(source).toContain('contextLedger')
  expect(source).toContain('undoLastRequest')
})
```

- [ ] **Step 2: Run the parity test and confirm RED if a capability is absent**

Run: `npm run test:run -- src/__tests__/authoringWorkspace.test.js src/__tests__/uiControlContract.test.js`

Expected: PASS only when all listed capabilities and recovery controls are present.

- [ ] **Step 3: Add audit fixtures without redirecting Experience**

Add `authoring` audit states for regular, long document, generating, provider error, stale response, context inspector and locked conflict. Preserve the Experience route while running the browser and real-provider gates. Do not remove online Experience or session history adapters in this task.

- [ ] **Step 4: Run deterministic and live gates**

```bash
npm run test:run -- src/__tests__/authoringWorkspace.test.js src/__tests__/uiControlContract.test.js src/__tests__/gameStoreSession.test.js src/__tests__/integration.test.js
npm run smoke:narrative-recovery
npm run smoke:narrative-production -- --dry-run
```

With an already-running service:

```bash
UI_AUDIT_ROUTES=authoring,experience UI_AUDIT_WIDTHS=1440,1024,390 UI_AUDIT_STATES=regular,long,generating,error,stale,context,conflict npm run audit:ui
```

Expected: zero console errors, zero accessibility failures, no horizontal overflow, one editor, keyboard-safe sheets and visible composer at 390px. If no service is running, record the live audit as not run and keep Experience unchanged.

- [ ] **Step 5: Commit parity evidence**

```bash
git add src/pages/Authoring.vue src/pages/Experience.vue scripts/ui-audit.mjs src/__tests__/authoringWorkspace.test.js src/__tests__/uiControlContract.test.js docs/agent-runs/2026-08-22-unified-authoring-workspace/parity.md
git commit -m "test(authoring): prove experience workspace parity"
```

### Task 8: Retire duplicate navigation only after parity approval

**Files:**
- Modify: `src/router/index.js`
- Modify: `src/config/workbenchNav.js`
- Modify: `src/pages/Experience.vue`
- Modify: `src/__tests__/uiControlContract.test.js`

- [ ] **Step 1: Confirm the parity artifact is approved**

The integration owner verifies `docs/agent-runs/2026-08-22-unified-authoring-workspace/parity.md` contains deterministic gates, 1440/1024/390 screenshots, user acceptance and any real-provider results actually run. Without this evidence, stop before editing routes.

- [ ] **Step 2: Write the failing compatibility redirect test**

```js
it('redirects offline experience to authoring after approved parity', async () => {
  const routerSource = await readFile(new URL('../router/index.js', import.meta.url), 'utf8')
  expect(routerSource).toContain("path: 'experience', redirect: { name: 'authoring' }")
  expect(routerSource).toContain("path: 'experience/online/:roomSlug?'")
})
```

- [ ] **Step 3: Replace only the offline Experience destination**

Redirect `/experience` to `authoring` while keeping legacy query/session conversion in a small compatibility function. Remove the duplicate Experience activity from navigation. Keep `OnlineExperience.vue`, provider settings, session data and the compatibility component until a separate online-unification plan exists.

- [ ] **Step 4: Run regression tests and commit separately**

Run: `npm run test:run -- src/__tests__/uiControlContract.test.js src/__tests__/authoringWorkspace.test.js src/__tests__/gameStoreSession.test.js src/__tests__/integration.test.js`

Expected: PASS; offline links reach Authoring and online room links remain unchanged.

```bash
git add src/router/index.js src/config/workbenchNav.js src/pages/Experience.vue src/__tests__/uiControlContract.test.js
git commit -m "refactor(authoring): retire duplicate offline experience route"
```

### Task 9: Final documentation and release gate

**Files:**
- Modify: `docs/STATUS.md`
- Modify: `docs/PLAN.md`
- Modify: `docs/LOG.md`
- Modify: `docs/plan/pinax-integrated-product-roadmap.md`
- Modify: `docs/src/known-issues.md`
- Create: `docs/agent-runs/2026-08-22-unified-authoring-workspace/summary.md`

- [ ] **Step 1: Run the complete Web-first gate**

```bash
npm run verify:full
npm run smoke:narrative-recovery
npm run smoke:narrative-production -- --dry-run
```

Expected: all deterministic tests, Vite build, diff check and VitePress build pass. Record exact counts.

- [ ] **Step 2: Update durable project truth**

Record:

- unified task catalog and project facade are production paths;
- Settings remains separate but shares context/runtime;
- Authoring is the canonical offline editor/simulation destination;
- whether Experience redirects or remains compatible pending live parity;
- real-provider and live browser gates that were actually run;
- Electron persistence remains the next platform phase, not part of this completion.

- [ ] **Step 3: Commit the release handoff**

```bash
git add docs/STATUS.md docs/PLAN.md docs/LOG.md docs/plan/pinax-integrated-product-roadmap.md docs/src/known-issues.md docs/agent-runs/2026-08-22-unified-authoring-workspace/summary.md
git commit -m "docs(authoring): record unified workspace release"
```
