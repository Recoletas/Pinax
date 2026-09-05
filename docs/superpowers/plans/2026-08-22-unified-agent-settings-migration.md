# Unified Agent Settings Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将设定页的资料解析、设定提取、字段/分区补全、修订、地点、调研和维护调用迁移到共享 Agent 执行架构，同时保留证据审阅和显式采纳。

**Architecture:** 现有生成服务继续负责 prompt、provider 和结果解析；新增 settings workflow adapters 负责把 canonical `TaskRequest` 映射到这些服务，并统一 context/result/error/revision 语义。页面只调用 `dispatchSettingsTask()`，不再直接决定 provider 工作流；所有设定正文变更仍先进入 `SettingDraftReview`，模型不能直接覆盖 canonical worldbook。

**Tech Stack:** Vue 3、现有 worldbook services、shared Agent foundation、Vitest。

---

## Prerequisite

`2026-08-22-unified-agent-foundation.md` 已合并，以下导出可用：

- `createTaskRequest()`
- `createProjectKnowledgeFacade()`
- `resolveAgentContext()`
- `createAgentExecutionEngine()`
- `applyAgentResultTransaction()`

### Task 1: Add the Settings dispatcher and workflow registry

**Files:**
- Create: `src/services/agents/settings/settingsTaskDispatcher.js`
- Create: `src/services/agents/settings/settingsWorkflowRegistry.js`
- Create: `src/__tests__/settingsAgentWorkflows.test.js`

- [ ] **Step 1: Write the failing dispatch test**

```js
import { describe, expect, it, vi } from 'vitest'
import { createSettingsTaskDispatcher } from '../services/agents/settings/settingsTaskDispatcher.js'

it('builds one canonical request and returns a review draft', async () => {
  const engine = { run: vi.fn(async () => ({ status: 'completed', actions: [{ type: 'setting-draft', payload: { content: '港城终年潮湿' } }] })) }
  const dispatcher = createSettingsTaskDispatcher({ engine, resolveContext: vi.fn(async () => ({ envelope: {}, ledger: {} })) })
  const result = await dispatcher.dispatch('settings.field.complete', {
    project: { id: 'wb-1', revision: 'wb-r2' },
    target: { type: 'setting-field', id: 'geography.climate', revision: 'field-r4' },
    intent: { sectionKey: 'geography', fieldKey: 'climate' }
  })
  expect(engine.run).toHaveBeenCalledOnce()
  expect(result.actions[0].type).toBe('setting-draft')
})
```

- [ ] **Step 2: Run the test and confirm RED**

Run: `npm run test:run -- src/__tests__/settingsAgentWorkflows.test.js`

Expected: FAIL because the dispatcher does not exist.

- [ ] **Step 3: Implement one settings entry point**

```js
export function createSettingsTaskDispatcher({ engine, resolveContext, facade }) {
  return Object.freeze({
    async dispatch(taskId, input, options = {}) {
      const request = createTaskRequest({
        taskId,
        project: input.project,
        target: input.target,
        intent: input.intent,
        surface: 'settings',
        options
      })
      const context = await resolveContext({ taskId, request, facade })
      return engine.run(request, context)
    }
  })
}
```

`settingsWorkflowRegistry.js` exports an object keyed by the Foundation workflow kinds and delegates each settings task to its named adapter; unknown task IDs return `AGENT_TASK_UNKNOWN` before any service call.

- [ ] **Step 4: Run the focused test and commit**

Run: `npm run test:run -- src/__tests__/settingsAgentWorkflows.test.js`

Expected: PASS.

```bash
git add src/services/agents/settings/settingsTaskDispatcher.js src/services/agents/settings/settingsWorkflowRegistry.js src/__tests__/settingsAgentWorkflows.test.js
git commit -m "feat(settings): add canonical agent dispatcher"
```

### Task 2: Migrate local source parsing and AI import extraction

**Files:**
- Create: `src/services/agents/settings/settingsImportWorkflow.js`
- Modify: `src/services/worldbookImportGeneration.js`
- Modify: `src/pages/WorldbookCreationWorkspace.vue`
- Modify: `src/__tests__/settingsAgentWorkflows.test.js`
- Modify: `src/__tests__/worldBookQuickImport.test.js`

- [ ] **Step 1: Write failing local/AI boundary tests**

```js
it('parses local sources without provider execution and submits extraction as a review draft', async () => {
  const parseLocal = vi.fn(async () => ({ status: 'ready', chunks: [{ id: 'c1', text: '港口资料' }] }))
  const extract = vi.fn(async () => ({ entries: [{ name: '潮汐港', content: '港城' }] }))
  const workflow = createSettingsImportWorkflow({ parseLocal, extract })

  const parsed = await workflow.run({ task: { id: 'source.parse' }, request: { intent: { files: ['fixture'] } } })
  expect(parsed.actions[0].type).toBe('cache-write')
  expect(extract).not.toHaveBeenCalled()

  const draft = await workflow.run({
    task: { id: 'settings.import.extract' },
    request: { intent: { sourceChunkIds: ['c1'], targetCount: 8 } },
    context: { envelope: { blocks: [{ kind: 'references', content: '港口资料' }] } }
  })
  expect(draft.actions[0].type).toBe('setting-draft')
})
```

- [ ] **Step 2: Run tests and confirm RED**

Run: `npm run test:run -- src/__tests__/settingsAgentWorkflows.test.js src/__tests__/worldBookQuickImport.test.js`

Expected: the new workflow test fails; existing import tests remain green.

- [ ] **Step 3: Implement explicit workflow branches**

```js
export function createSettingsImportWorkflow({ parseLocal, extract }) {
  return Object.freeze({
    async run({ task, request, context }) {
      if (task.id === 'source.parse') {
        const report = await parseLocal(request.intent.files, request.options)
        return { status: 'completed', actions: [{ type: 'cache-write', payload: report }] }
      }
      const sourceText = agentEnvelopeToPromptText(context.envelope)
      const parsed = await extract({
        sourceText,
        targetCount: request.intent.targetCount,
        nameHint: request.intent.nameHint,
        signal: request.options.signal
      })
      return {
        status: 'completed',
        actions: [{ type: 'setting-draft', payload: buildWorldbookImportPreview(parsed, request.intent.nameHint) }]
      }
    }
  })
}
```

Change `WorldbookCreationWorkspace.vue` to call `dispatch('source.parse', ...)` for deterministic parsing and `dispatch('settings.import.extract', ...)` for AI extraction. Keep the existing archive quota, cancellation and evidence UI unchanged.

- [ ] **Step 4: Run import tests and commit**

Run: `npm run test:run -- src/__tests__/settingsAgentWorkflows.test.js src/__tests__/worldBookQuickImport.test.js`

Expected: PASS; parser errors remain per-file, and AI extraction still requires confirmation.

```bash
git add src/services/agents/settings/settingsImportWorkflow.js src/services/worldbookImportGeneration.js src/pages/WorldbookCreationWorkspace.vue src/__tests__/settingsAgentWorkflows.test.js src/__tests__/worldBookQuickImport.test.js
git commit -m "refactor(settings): route source import workflows"
```

### Task 3: Migrate foundation, field, section and revision generation

**Files:**
- Create: `src/services/agents/settings/settingsGenerationWorkflow.js`
- Modify: `src/services/settingFieldGeneration.js`
- Modify: `src/components/worldbook/StructuredSettingsPanel.vue`
- Modify: `src/pages/WorldbookCreationWorkspace.vue`
- Modify: `src/__tests__/settingsAgentWorkflows.test.js`
- Modify: `src/__tests__/integration.test.js`

- [ ] **Step 1: Add failing task-to-service mapping tests**

```js
it.each([
  ['settings.foundation.generate', 'generateFoundation'],
  ['settings.candidates.extract', 'generateCandidates'],
  ['settings.field.complete', 'generateField'],
  ['settings.section.complete', 'generateSection'],
  ['settings.draft.revise', 'reviseDraft']
])('maps %s to %s and preserves base revision', async (taskId, method) => {
  const services = Object.fromEntries(['generateFoundation', 'generateCandidates', 'generateField', 'generateSection', 'reviseDraft'].map((name) => [name, vi.fn()]))
  services[method].mockResolvedValue({ content: '候选正文', baseRevision: 'r3' })
  const workflow = createSettingsGenerationWorkflow(services)
  const result = await workflow.run({ task: { id: taskId }, request: { target: { revision: 'r3' }, intent: {} }, context: { envelope: {} } })
  expect(services[method]).toHaveBeenCalledOnce()
  expect(result.actions[0]).toMatchObject({ type: 'setting-draft', baseRevision: 'r3' })
})
```

- [ ] **Step 2: Run tests and confirm RED**

Run: `npm run test:run -- src/__tests__/settingsAgentWorkflows.test.js src/__tests__/integration.test.js`

Expected: FAIL because the generation workflow is absent.

- [ ] **Step 3: Implement a fixed task map**

```js
const METHOD_BY_TASK = Object.freeze({
  'settings.foundation.generate': 'generateFoundation',
  'settings.candidates.extract': 'generateCandidates',
  'settings.field.complete': 'generateField',
  'settings.section.complete': 'generateSection',
  'settings.draft.revise': 'reviseDraft'
})

export function createSettingsGenerationWorkflow(services) {
  return Object.freeze({
    async run({ task, request, context }) {
      const method = METHOD_BY_TASK[task.id]
      const value = await services[method]({ request, envelope: context.envelope })
      return {
        status: 'completed',
        actions: [].concat(value || []).map((draft) => ({
          type: 'setting-draft',
          baseRevision: request.target.revision,
          payload: draft
        }))
      }
    }
  })
}
```

In `StructuredSettingsPanel.vue`, replace the three direct calls with dispatcher task IDs while retaining the current pending/partial/error/aborted/stale state machine and `SettingDraftReview`. The dispatcher receives the same `AbortSignal` and target revision used by the existing functions.

- [ ] **Step 4: Run settings tests and commit**

Run: `npm run test:run -- src/__tests__/settingsAgentWorkflows.test.js src/__tests__/integration.test.js src/__tests__/uiControlContract.test.js`

Expected: PASS; section partial success and stale rejection remain covered.

```bash
git add src/services/agents/settings/settingsGenerationWorkflow.js src/services/settingFieldGeneration.js src/components/worldbook/StructuredSettingsPanel.vue src/pages/WorldbookCreationWorkspace.vue src/__tests__/settingsAgentWorkflows.test.js src/__tests__/integration.test.js
git commit -m "refactor(settings): unify structured generation tasks"
```

### Task 4: Migrate place extraction and fleshing out

**Files:**
- Create: `src/services/agents/settings/settingsPlaceWorkflow.js`
- Modify: `src/services/settingPlaceGeneration.js`
- Modify: `src/components/worldbook/PlaceCatalog.vue`
- Modify: `src/__tests__/settingsAgentWorkflows.test.js`

- [ ] **Step 1: Add failing place action tests**

```js
it('keeps extracted and fleshed-out places as review drafts', async () => {
  const workflow = createSettingsPlaceWorkflow({
    extractPlaces: vi.fn(async () => [{ name: '旧码头', evidence: ['source:c1'] }]),
    fleshOutPlace: vi.fn(async () => ({ name: '旧码头', climate: '潮湿' }))
  })
  const extracted = await workflow.run({ task: { id: 'settings.places.extract' }, request: { target: { revision: 'r1' }, intent: {} }, context: { envelope: {} } })
  const fleshed = await workflow.run({ task: { id: 'settings.place.fleshout' }, request: { target: { revision: 'r1' }, intent: { placeId: 'p1' } }, context: { envelope: {} } })
  expect(extracted.actions[0].type).toBe('setting-draft')
  expect(fleshed.actions[0].type).toBe('setting-draft')
})
```

- [ ] **Step 2: Run test and confirm RED**

Run: `npm run test:run -- src/__tests__/settingsAgentWorkflows.test.js`

Expected: FAIL because the place workflow does not exist.

- [ ] **Step 3: Implement and wire the two task IDs**

```js
const METHOD_BY_TASK = Object.freeze({
  'settings.places.extract': 'extractPlaces',
  'settings.place.fleshout': 'fleshOutPlace'
})

export function createSettingsPlaceWorkflow(services) {
  return Object.freeze({
    async run({ task, request, context }) {
      const allowedRefs = new Set(context.envelope.blocks.flatMap((block) => block.sourceRefs || []))
      const value = await services[METHOD_BY_TASK[task.id]]({ request, envelope: context.envelope })
      return {
        status: 'completed',
        actions: [].concat(value || []).map((draft) => ({
          type: 'setting-draft',
          baseRevision: request.target.revision,
          payload: draft,
          sourceRefs: (draft.sourceRefs || draft.evidence || []).filter((ref) => allowedRefs.has(ref))
        }))
      }
    }
  })
}
```

Wire both IDs through `PlaceCatalog.vue`; every candidate remains a review draft.

- [ ] **Step 4: Run tests and commit**

Run: `npm run test:run -- src/__tests__/settingsAgentWorkflows.test.js src/__tests__/integration.test.js`

Expected: PASS; place adoption remains explicit.

```bash
git add src/services/agents/settings/settingsPlaceWorkflow.js src/services/settingPlaceGeneration.js src/components/worldbook/PlaceCatalog.vue src/__tests__/settingsAgentWorkflows.test.js
git commit -m "refactor(settings): unify place generation workflows"
```

### Task 5: Migrate research and maintenance workflows

**Files:**
- Create: `src/services/agents/settings/settingsResearchWorkflow.js`
- Create: `src/services/agents/settings/settingsMaintenanceWorkflow.js`
- Modify: `src/services/worldbookResearch.js`
- Modify: `src/services/worldbookResearchClaims.js`
- Modify: `src/services/worldbookMaintenance.js`
- Modify: `src/__tests__/settingsAgentWorkflows.test.js`

- [ ] **Step 1: Add failing evidence and read-only tests**

```js
it('keeps research claims sourced and maintenance audit read-only', async () => {
  const research = createSettingsResearchWorkflow({
    planQueries: vi.fn(async () => ['潮汐港 城市史']),
    collectClaims: vi.fn(async () => [{ text: '港口建于旧历三年', sourceRefs: ['url:1'] }])
  })
  const maintenance = createSettingsMaintenanceWorkflow({ audit: vi.fn(async () => [{ issue: '年代冲突' }]) })
  const claims = await research.run({ task: { id: 'settings.research.claims' }, request: { target: { revision: 'r2' }, intent: {} }, context: { envelope: {} } })
  const audit = await maintenance.run({ task: { id: 'settings.maintenance.audit' }, request: { target: { revision: 'r2' }, intent: {} }, context: { envelope: {} } })
  expect(claims.actions[0].sourceRefs).toEqual(['url:1'])
  expect(audit.actions).toEqual([])
  expect(audit.suggestions).toHaveLength(1)
})
```

- [ ] **Step 2: Run test and confirm RED**

Run: `npm run test:run -- src/__tests__/settingsAgentWorkflows.test.js`

Expected: FAIL because the workflow adapters do not exist.

- [ ] **Step 3: Implement fixed research and maintenance paths**

`settings.research.plan` returns ephemeral query suggestions; `settings.research.claims` returns sourced `setting-draft` actions; `settings.maintenance.audit` returns suggestions with an empty actions list. Pass cancellation signals through every fetch/provider call and map timeout, aborted, invalid and stale to distinct error codes.

- [ ] **Step 4: Run tests and commit**

Run: `npm run test:run -- src/__tests__/settingsAgentWorkflows.test.js src/__tests__/worldBookQuickImport.test.js`

Expected: PASS; abort never creates a draft.

```bash
git add src/services/agents/settings/settingsResearchWorkflow.js src/services/agents/settings/settingsMaintenanceWorkflow.js src/services/worldbookResearch.js src/services/worldbookResearchClaims.js src/services/worldbookMaintenance.js src/__tests__/settingsAgentWorkflows.test.js
git commit -m "refactor(settings): unify research and maintenance tasks"
```

### Task 6: Prove all Settings call sites use the dispatcher

**Files:**
- Modify: `src/__tests__/settingsAgentWorkflows.test.js`
- Modify: `scripts/structured-settings-gate.mjs`
- Modify: `docs/STATUS.md`
- Create: `docs/agent-runs/2026-08-22-unified-agent-settings/summary.md`

- [ ] **Step 1: Add a source-level ownership contract**

```js
it('keeps provider-capable settings calls behind the dispatcher', async () => {
  const files = [
    'src/pages/WorldbookCreationWorkspace.vue',
    'src/components/worldbook/StructuredSettingsPanel.vue',
    'src/components/worldbook/PlaceCatalog.vue'
  ]
  for (const file of files) {
    const source = await readFile(new URL(`../../${file}`, import.meta.url), 'utf8')
    expect(source).not.toMatch(/\b(generateSettingFieldDraft|generateSettingSectionDraft|tryAiExtractWorldbookJson|runWorldbookMaintenance)\s*\(/)
    expect(source).toMatch(/dispatchSettingsTask|settingsDispatcher/)
  }
})
```

- [ ] **Step 2: Run the ownership contract**

Run: `npm run test:run -- src/__tests__/settingsAgentWorkflows.test.js`

Expected: PASS only after every page-level direct call is removed.

- [ ] **Step 3: Run deterministic settings gates**

```bash
npm run test:run -- src/__tests__/settingsAgentWorkflows.test.js src/__tests__/worldBookQuickImport.test.js src/__tests__/integration.test.js src/__tests__/agentContracts.test.js
npm run smoke:structured-settings -- --dry-run
```

Expected: all tests pass; the dry run covers foundation, field, section partial failure, stale, cancel, place and maintenance shapes without real credentials.

- [ ] **Step 4: Run full verification and commit the handoff**

Run: `npm run verify:full`

Expected: exit 0 in the isolated worktree.

```bash
git add scripts/structured-settings-gate.mjs src/__tests__/settingsAgentWorkflows.test.js docs/STATUS.md docs/agent-runs/2026-08-22-unified-agent-settings/summary.md
git commit -m "docs(settings): record agent migration gates"
```

The summary records deterministic results and separately lists MiniMax, OpenAI-compatible and Anthropic-compatible real-provider checks as external gates until they are actually run.
