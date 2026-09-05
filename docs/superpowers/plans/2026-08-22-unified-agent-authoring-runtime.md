# Unified Agent Authoring Runtime Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把写作微调、体验叙事、顾问选项、事件具体化、摘要与人物/关系/事件派生统一到 authoring runtime，同时保持 NarrativeKernel 的成熟上下文和恢复能力。

**Architecture:** 写作和叙事都接收同一 `TaskRequest` 与项目快照。开放叙事由 `narrative-scene` profile 调用现有 NarrativeKernel；局部编辑和审阅走固定 workflow；后台观察器读取已提交正文 delta，输出低优先级 derived state 或 typed exception，永远不直接改正文和 locked canon。

**Tech Stack:** Existing NarrativeKernel、writing services、gameStore compatibility bridge、shared Agent foundation、Vitest。

---

## Prerequisite

Foundation 已合并。此计划不得编辑 Settings workflow 文件或统一工作区 UI。

### Task 1: Add one authoring project adapter

**Files:**
- Create: `src/services/agents/authoring/authoringProjectAdapter.js`
- Create: `src/__tests__/authoringAgentWorkflows.test.js`

- [ ] **Step 1: Write the failing shared-identity test**

```js
import { describe, expect, it } from 'vitest'
import { createAuthoringProjectAdapter } from '../services/agents/authoring/authoringProjectAdapter.js'

it('projects writing and experience state into one project/document revision', () => {
  const adapter = createAuthoringProjectAdapter({
    projectId: 'wb-1',
    projectRevision: 'project-r8',
    document: { id: 'chapter-3', revision: 'doc-r5', text: '潮水漫过台阶。' },
    narrative: { sessionId: 'session-2', sceneRevision: 'scene-r4' }
  })
  expect(adapter.getProject()).toEqual({ id: 'wb-1', revision: 'project-r8' })
  expect(adapter.getDocumentTarget()).toMatchObject({ id: 'chapter-3', revision: 'doc-r5' })
  expect(adapter.getNarrativeTarget()).toMatchObject({ id: 'session-2', revision: 'scene-r4' })
})
```

- [ ] **Step 2: Run the test and confirm RED**

Run: `npm run test:run -- src/__tests__/authoringAgentWorkflows.test.js`

Expected: FAIL because the adapter does not exist.

- [ ] **Step 3: Implement immutable projections**

```js
export function createAuthoringProjectAdapter({ projectId, projectRevision, document, narrative }) {
  const project = Object.freeze({ id: String(projectId), revision: String(projectRevision) })
  return Object.freeze({
    getProject: () => project,
    getDocumentTarget: () => Object.freeze({ type: 'document', id: String(document.id), revision: String(document.revision) }),
    getNarrativeTarget: () => Object.freeze({ type: 'narrative-scene', id: String(narrative.sessionId), revision: String(narrative.sceneRevision) }),
    readDocument: () => Object.freeze({ ...document }),
    readNarrative: () => Object.freeze({ ...narrative })
  })
}
```

- [ ] **Step 4: Run tests and commit**

Run: `npm run test:run -- src/__tests__/authoringAgentWorkflows.test.js`

Expected: PASS.

```bash
git add src/services/agents/authoring/authoringProjectAdapter.js src/__tests__/authoringAgentWorkflows.test.js
git commit -m "feat(authoring): share project and document identity"
```

### Task 2: Migrate deterministic writing tasks

**Files:**
- Create: `src/services/agents/authoring/authoringTextWorkflow.js`
- Create: `src/services/agents/authoring/authoringTaskDispatcher.js`
- Modify: `src/services/advisorTaskService.js`
- Modify: `src/composables/useWritingAgent.js`
- Modify: `src/__tests__/authoringAgentWorkflows.test.js`
- Modify: `src/__tests__/agentContracts.test.js`

- [ ] **Step 1: Write failing task mapping and effect tests**

```js
it.each([
  ['authoring.insert', 'insert', 'direct-text'],
  ['authoring.rewrite', 'rewrite', 'review-draft'],
  ['authoring.expand', 'expand', 'review-draft'],
  ['authoring.shorten', 'shorten', 'review-draft'],
  ['authoring.complete.inline', 'completeInline', 'ephemeral'],
  ['authoring.review.selection', 'reviewSelection', 'review-only'],
  ['authoring.review.chapter', 'reviewChapter', 'review-only']
])('maps %s to %s with %s policy', async (taskId, method, effectPolicy) => {
  const services = Object.fromEntries(['insert', 'rewrite', 'expand', 'shorten', 'completeInline', 'reviewSelection', 'reviewChapter'].map((name) => [name, vi.fn(async () => ({ text: name }))]))
  const workflow = createAuthoringTextWorkflow(services)
  const result = await workflow.run({ task: { id: taskId, effectPolicy }, request: { target: { revision: 'r1' }, intent: {} }, context: { envelope: {} } })
  expect(services[method]).toHaveBeenCalledOnce()
  expect(result.effectPolicy).toBe(effectPolicy)
})
```

- [ ] **Step 2: Run tests and confirm RED**

Run: `npm run test:run -- src/__tests__/authoringAgentWorkflows.test.js src/__tests__/agentContracts.test.js`

Expected: FAIL because the workflow and dispatcher do not exist.

- [ ] **Step 3: Implement fixed mappings and legacy aliases**

```js
const METHOD_BY_TASK = Object.freeze({
  'authoring.insert': 'insert',
  'authoring.rewrite': 'rewrite',
  'authoring.expand': 'expand',
  'authoring.shorten': 'shorten',
  'authoring.complete.inline': 'completeInline',
  'authoring.review.selection': 'reviewSelection',
  'authoring.review.chapter': 'reviewChapter'
})

export function createAuthoringTextWorkflow(services) {
  return Object.freeze({
    async run({ task, request, context }) {
      const output = await services[METHOD_BY_TASK[task.id]]({ request, envelope: context.envelope })
      const isReview = task.effectPolicy === 'review-only'
      const isEphemeral = task.effectPolicy === 'ephemeral'
      return {
        status: 'completed',
        effectPolicy: task.effectPolicy,
        suggestions: isReview || isEphemeral ? [{ type: 'text', content: output.text }] : [],
        actions: isReview || isEphemeral ? [] : [{
          type: task.effectPolicy === 'direct-text' ? 'text-insert' : 'text-patch',
          content: output.text,
          baseRevision: request.target.revision
        }]
      }
    }
  })
}
```

Map existing advisor task aliases to the canonical IDs at the request boundary and increment an alias metric. Do not keep a second prompt implementation.

- [ ] **Step 4: Run tests and commit**

Run: `npm run test:run -- src/__tests__/authoringAgentWorkflows.test.js src/__tests__/agentContracts.test.js src/__tests__/gameStoreSession.test.js`

Expected: PASS; inline completion remains ephemeral and rewrite remains revision-bound.

```bash
git add src/services/agents/authoring/authoringTextWorkflow.js src/services/agents/authoring/authoringTaskDispatcher.js src/services/advisorTaskService.js src/composables/useWritingAgent.js src/__tests__/authoringAgentWorkflows.test.js src/__tests__/agentContracts.test.js
git commit -m "refactor(authoring): unify text agent workflows"
```

### Task 3: Adapt NarrativeKernel as the narrative-scene expert profile

**Files:**
- Create: `src/services/agents/authoring/narrativeSceneWorkflow.js`
- Modify: `src/services/agents/narrativeKernel.js`
- Modify: `src/services/generationService.js`
- Modify: `src/__tests__/authoringAgentWorkflows.test.js`
- Modify: `src/__tests__/gameStoreSession.test.js`

- [ ] **Step 1: Write failing intent and isolation tests**

```js
it.each([
  ['authoring.continue', 'continue'],
  ['authoring.advance', 'advance'],
  ['authoring.simulate.character', 'character'],
  ['authoring.simulate.scene', 'scene'],
  ['authoring.trigger', 'trigger']
])('runs %s through one isolated NarrativeKernel turn', async (taskId, intentMode) => {
  const runTurn = vi.fn(async () => ({ text: '林昭推开门。', trace: { planningTranscript: 'discarded' } }))
  const workflow = createNarrativeSceneWorkflow({ runTurn })
  const result = await workflow.run({ task: { id: taskId }, request: { target: { revision: 'r3' }, intent: {} }, context: { envelope: {} } })
  expect(runTurn).toHaveBeenCalledWith(expect.objectContaining({ intentMode }))
  expect(result.actions).toEqual([expect.objectContaining({ type: 'text-insert', content: '林昭推开门。' })])
  expect(JSON.stringify(result)).not.toContain('planningTranscript')
})
```

- [ ] **Step 2: Run tests and confirm RED**

Run: `npm run test:run -- src/__tests__/authoringAgentWorkflows.test.js src/__tests__/gameStoreSession.test.js`

Expected: FAIL because NarrativeKernel has no canonical workflow adapter.

- [ ] **Step 3: Implement the thin narrative adapter**

```js
const INTENT_MODE = Object.freeze({
  'authoring.continue': 'continue',
  'authoring.advance': 'advance',
  'authoring.simulate.character': 'character',
  'authoring.simulate.scene': 'scene',
  'authoring.trigger': 'trigger'
})

export function createNarrativeSceneWorkflow({ runTurn }) {
  return Object.freeze({
    async run({ task, request, context }) {
      const turn = await runTurn({
        intentMode: INTENT_MODE[task.id],
        intent: request.intent,
        envelope: context.envelope,
        signal: request.options.signal
      })
      return {
        status: 'completed',
        actions: [{ type: 'text-insert', content: turn.text, baseRevision: request.target.revision }],
        trace: turn.trace ? { phases: turn.trace.phases, contextLedger: context.ledger } : null
      }
    }
  })
}
```

The adapter must preserve existing BeatPlan transcript isolation, JIT world/history/geo/politics/memory tools, cast/voice, SceneThread, causality, timeouts, repair budgets, formatting and shadow critic. It must not serialize planner messages into the result.

- [ ] **Step 4: Run narrative gates and commit**

```bash
npm run test:run -- src/__tests__/authoringAgentWorkflows.test.js src/__tests__/gameStoreSession.test.js src/__tests__/integration.test.js
npm run smoke:narrative-recovery
npm run smoke:narrative-production -- --dry-run
```

Expected: focused tests pass; recovery exits 0; production dry-run retains its complete item count and no planning/tool names appear in prose.

```bash
git add src/services/agents/authoring/narrativeSceneWorkflow.js src/services/agents/narrativeKernel.js src/services/generationService.js src/__tests__/authoringAgentWorkflows.test.js src/__tests__/gameStoreSession.test.js
git commit -m "refactor(authoring): expose narrative kernel workflow"
```

### Task 4: Migrate auxiliary Experience calls

**Files:**
- Create: `src/services/agents/authoring/authoringAuxiliaryWorkflow.js`
- Modify: `src/services/generationEmergence.js`
- Modify: `src/services/generationAdventureTriggers.js`
- Modify: `src/services/contextCompression.js`
- Modify: `src/services/experienceAssetSummarizer.js`
- Modify: `src/pages/Experience.vue`
- Modify: `src/__tests__/authoringAgentWorkflows.test.js`
- Modify: `src/__tests__/generationEmergence.test.js`

- [ ] **Step 1: Write failing auxiliary mapping tests**

```js
it.each([
  ['authoring.next-actions', 'nextActions'],
  ['authoring.dialogue-options', 'dialogueOptions'],
  ['authoring.emergence', 'emergence'],
  ['authoring.context.compact', 'compactContext'],
  ['authoring.asset.summarize', 'summarizeAsset']
])('routes %s to %s without narrative agent looping', async (taskId, method) => {
  const services = Object.fromEntries(['nextActions', 'dialogueOptions', 'emergence', 'compactContext', 'summarizeAsset'].map((name) => [name, vi.fn(async () => ({ value: name }))]))
  const workflow = createAuthoringAuxiliaryWorkflow(services)
  await workflow.run({ task: { id: taskId }, request: { target: { revision: 'r1' }, intent: {} }, context: { envelope: {} } })
  expect(services[method]).toHaveBeenCalledOnce()
})
```

- [ ] **Step 2: Run tests and confirm RED**

Run: `npm run test:run -- src/__tests__/authoringAgentWorkflows.test.js src/__tests__/generationEmergence.test.js`

Expected: FAIL because the auxiliary workflow does not exist.

- [ ] **Step 3: Implement a bounded one-shot/validated-chain adapter**

```js
const METHOD_BY_TASK = Object.freeze({
  'authoring.next-actions': 'nextActions',
  'authoring.dialogue-options': 'dialogueOptions',
  'authoring.emergence': 'emergence',
  'authoring.context.compact': 'compactContext',
  'authoring.asset.summarize': 'summarizeAsset'
})
```

Normalize options and summaries to suggestions, emergence to `runtime-candidate`, compaction to `derived-upsert`, and asset summaries to `asset-draft`. Keep adventure trigger prose on `authoring.trigger`, which already uses NarrativeKernel in Task 3.

Replace page-owned next-action and emergence request construction in `Experience.vue` with dispatcher calls; keep visual behavior unchanged.

- [ ] **Step 4: Run tests and commit**

Run: `npm run test:run -- src/__tests__/authoringAgentWorkflows.test.js src/__tests__/generationEmergence.test.js src/__tests__/uiControlContract.test.js`

Expected: PASS; auxiliary failures cannot change visible text.

```bash
git add src/services/agents/authoring/authoringAuxiliaryWorkflow.js src/services/generationEmergence.js src/services/generationAdventureTriggers.js src/services/contextCompression.js src/services/experienceAssetSummarizer.js src/pages/Experience.vue src/__tests__/authoringAgentWorkflows.test.js src/__tests__/generationEmergence.test.js
git commit -m "refactor(authoring): unify auxiliary narrative tasks"
```

### Task 5: Add background derived-state observers

**Files:**
- Create: `src/services/agents/observers/authoringObservationContract.js`
- Create: `src/services/agents/observers/authoringObserverWorkflow.js`
- Create: `src/services/agents/observers/authoringObserverScheduler.js`
- Modify: `src/__tests__/authoringAgentWorkflows.test.js`

- [ ] **Step 1: Write failing non-blocking and authority tests**

```js
it('auto-commits routine derived facts and surfaces locked conflicts', async () => {
  const applyDerived = vi.fn(async () => ({ revision: 'derived-r3' }))
  const workflow = createAuthoringObserverWorkflow({ derive: vi.fn(async () => ({
    observations: [
      { id: 'o1', kind: 'relation', authority: 'derived', text: '林昭信任顾远' },
      { id: 'o2', kind: 'identity', conflictsWith: 'locked:char-1', text: '林昭改名' }
    ]
  })), applyDerived })
  const result = await workflow.run({ task: { id: 'observer.relations.derive' }, request: { target: { revision: 'doc-r2' }, intent: {} }, context: { envelope: {} } })
  expect(applyDerived).toHaveBeenCalledWith([expect.objectContaining({ id: 'o1' })], expect.any(Object))
  expect(result.exceptions).toEqual([expect.objectContaining({ observationId: 'o2', reason: 'locked-conflict' })])
})
```

- [ ] **Step 2: Run test and confirm RED**

Run: `npm run test:run -- src/__tests__/authoringAgentWorkflows.test.js`

Expected: FAIL because observers do not exist.

- [ ] **Step 3: Implement typed observations and idle scheduling**

```js
export function normalizeObservation(value) {
  return Object.freeze({
    id: String(value.id),
    kind: String(value.kind),
    authority: 'derived',
    text: String(value.text || ''),
    sourceRefs: [...new Set(value.sourceRefs || [])],
    baseRevision: String(value.baseRevision || ''),
    conflictsWith: value.conflictsWith ? String(value.conflictsWith) : null
  })
}
```

The scheduler accepts committed document deltas, coalesces by document revision, waits for editor idle, cancels superseded work, and never blocks text persistence. The workflow separates routine observations from `locked-conflict`, `identity-ambiguity`, and `destructive-retcon` exceptions before calling `applyDerived`.

- [ ] **Step 4: Run tests and commit**

Run: `npm run test:run -- src/__tests__/authoringAgentWorkflows.test.js src/__tests__/memoryCandidates.test.js src/__tests__/runtimeEvents.test.js`

Expected: PASS; stale observer output produces zero writes.

```bash
git add src/services/agents/observers/authoringObservationContract.js src/services/agents/observers/authoringObserverWorkflow.js src/services/agents/observers/authoringObserverScheduler.js src/__tests__/authoringAgentWorkflows.test.js
git commit -m "feat(authoring): derive background story observations"
```

### Task 6: Put legacy gameStore extraction behind one bridge

**Files:**
- Create: `src/services/agents/authoring/legacyExperienceStateBridge.js`
- Modify: `src/stores/gameStore.js`
- Modify: `src/__tests__/gameStoreSession.test.js`
- Modify: `src/__tests__/authoringAgentWorkflows.test.js`

- [ ] **Step 1: Write a failing single-commit test**

```js
it('commits one prose result before scheduling derived observations', async () => {
  const insertText = vi.fn(async () => ({ revision: 'doc-r4' }))
  const scheduleObservers = vi.fn()
  const bridge = createLegacyExperienceStateBridge({ insertText, scheduleObservers })
  await bridge.commitNarrativeResult({ text: '林昭推开门。', baseRevision: 'doc-r3', sourceRefs: ['turn:t8'] })
  expect(insertText).toHaveBeenCalledOnce()
  expect(scheduleObservers).toHaveBeenCalledWith(expect.objectContaining({ documentRevision: 'doc-r4' }))
  expect(insertText.mock.invocationCallOrder[0]).toBeLessThan(scheduleObservers.mock.invocationCallOrder[0])
})
```

- [ ] **Step 2: Run tests and confirm RED**

Run: `npm run test:run -- src/__tests__/gameStoreSession.test.js src/__tests__/authoringAgentWorkflows.test.js`

Expected: FAIL because the bridge does not exist.

- [ ] **Step 3: Implement the bridge and narrow `extractAndUpdateState()`**

```js
export function createLegacyExperienceStateBridge({ insertText, scheduleObservers }) {
  return Object.freeze({
    async commitNarrativeResult({ text, baseRevision, sourceRefs }) {
      const receipt = await insertText({ text, baseRevision, sourceRefs })
      scheduleObservers({
        documentRevision: receipt.revision,
        baseRevision,
        text,
        sourceRefs
      })
      return receipt
    }
  })
}
```

Keep deterministic parsing needed for current session compatibility, but stop labeling regex-derived goal/character/choice/faction updates as `ai-extract`. Route new authoring commits through the observer scheduler and preserve existing save/rollback ordering.

- [ ] **Step 4: Run store and recovery tests, then commit**

```bash
npm run test:run -- src/__tests__/gameStoreSession.test.js src/__tests__/authoringAgentWorkflows.test.js src/__tests__/runtimeEvents.test.js src/__tests__/runtimeEventCausality.test.js
npm run smoke:narrative-recovery
```

Expected: PASS; each visible prose commit schedules observers once and recovery rollback remains intact.

```bash
git add src/services/agents/authoring/legacyExperienceStateBridge.js src/stores/gameStore.js src/__tests__/gameStoreSession.test.js src/__tests__/authoringAgentWorkflows.test.js
git commit -m "refactor(authoring): bridge narrative state derivation"
```

### Task 7: Runtime verification and handoff

**Files:**
- Create: `docs/agent-runs/2026-08-22-unified-agent-authoring-runtime/summary.md`
- Modify: `docs/STATUS.md`

- [ ] **Step 1: Run the focused runtime matrix**

```bash
npm run test:run -- src/__tests__/authoringAgentWorkflows.test.js src/__tests__/agentCapabilityContract.test.js src/__tests__/agentContracts.test.js src/__tests__/gameStoreSession.test.js src/__tests__/integration.test.js src/__tests__/runtimeEvents.test.js src/__tests__/runtimeEventCausality.test.js src/__tests__/memoryCandidates.test.js
npm run smoke:narrative-recovery
npm run smoke:narrative-production -- --dry-run
```

Expected: all deterministic tests pass; planning transcript stays isolated; observer timeout/invalid/stale outcomes cannot alter visible prose.

- [ ] **Step 2: Run full verification**

Run: `npm run verify:full`

Expected: exit 0 in the isolated worktree.

- [ ] **Step 3: Record unresolved external gates**

The summary records MiniMax, OpenAI-compatible and Anthropic-compatible narrative matrices as not run unless real credentials and an existing service were used. It also lists the exact task IDs ready for Workspace UI.

- [ ] **Step 4: Commit the handoff**

```bash
git add docs/STATUS.md docs/agent-runs/2026-08-22-unified-agent-authoring-runtime/summary.md
git commit -m "docs(authoring): record runtime migration gates"
```
