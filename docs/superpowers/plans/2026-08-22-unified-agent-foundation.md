# Unified Agent Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立客户端与服务端共用的 canonical task catalog、项目知识门面、稀疏上下文解析器、确定性路由、执行引擎和结果事务层。

**Architecture:** `shared/agentCapabilityContract.js` 成为唯一生产任务真源，旧 contract/registry 只做兼容导出。Project Knowledge Facade 只提供稳定 ID、revision、authority 与按需读取；router 根据任务定义选择固定 workflow/profile，不调用模型做路由；transaction 在任何持久化副作用前验证 action、effect policy 和 revision。

**Tech Stack:** JavaScript ES modules、Vue service layer、Express shared contracts、Vitest。

---

### Task 1: Freeze the canonical capability catalog

**Files:**
- Create: `shared/agentCapabilityContract.js`
- Create: `src/__tests__/agentCapabilityContract.test.js`
- Modify: `shared/agentTaskContract.js`

- [ ] **Step 1: Write the failing catalog test**

```js
import { describe, expect, it } from 'vitest'
import {
  CANONICAL_AGENT_TASKS,
  getCanonicalAgentTask,
  listCanonicalAgentTaskIds
} from '../../shared/agentCapabilityContract.js'

describe('canonical agent capability catalog', () => {
  it('assigns one workflow, profile, schema and effect policy to every task', () => {
    const ids = listCanonicalAgentTaskIds()
    expect(new Set(ids).size).toBe(ids.length)
    expect(CANONICAL_AGENT_TASKS.length).toBe(44)
    for (const task of CANONICAL_AGENT_TASKS) {
      expect(task).toMatchObject({
        id: expect.any(String),
        owner: expect.any(String),
        workflowKind: expect.any(String),
        contextProfile: expect.any(String),
        inputSchema: expect.any(String),
        resultSchema: expect.any(String),
        effectPolicy: expect.any(String)
      })
    }
    expect(getCanonicalAgentTask('authoring.continue').workflowKind).toBe('agent-loop')
    expect(getCanonicalAgentTask('settings.field.complete').workflowKind).toBe('structured-one-shot')
    expect(getCanonicalAgentTask('observer.relations.derive').workflowKind).toBe('background-derive')
  })
})
```

- [ ] **Step 2: Run the test and confirm RED**

Run: `npm run test:run -- src/__tests__/agentCapabilityContract.test.js`

Expected: FAIL because `shared/agentCapabilityContract.js` does not exist.

- [ ] **Step 3: Add the complete catalog shape and fixed task IDs**

```js
export const WORKFLOW_KINDS = Object.freeze([
  'local',
  'structured-one-shot',
  'validated-chain',
  'agent-loop',
  'background-derive',
  'shadow-observer'
])

const rows = [
  ['source.parse', 'settings', 'local', 'source-import', 'source-input.v1', 'source-report.v1', 'local-cache'],
  ['settings.import.extract', 'settings', 'validated-chain', 'source-import', 'source-selection.v1', 'setting-candidates.v1', 'review-draft'],
  ['settings.foundation.generate', 'settings', 'structured-one-shot', 'setting-foundation', 'setting-brief.v1', 'setting-draft.v1', 'review-draft'],
  ['settings.candidates.extract', 'settings', 'validated-chain', 'setting-section', 'setting-sources.v1', 'setting-candidates.v1', 'review-draft'],
  ['settings.field.complete', 'settings', 'structured-one-shot', 'setting-field', 'setting-field.v1', 'setting-draft.v1', 'review-draft'],
  ['settings.section.complete', 'settings', 'validated-chain', 'setting-section', 'setting-section.v1', 'setting-draft-batch.v1', 'review-draft'],
  ['settings.draft.revise', 'settings', 'structured-one-shot', 'setting-field', 'setting-revision.v1', 'setting-draft.v1', 'review-draft'],
  ['settings.places.extract', 'settings', 'validated-chain', 'setting-places', 'setting-sources.v1', 'place-candidates.v1', 'review-draft'],
  ['settings.place.fleshout', 'settings', 'structured-one-shot', 'setting-place', 'place-draft.v1', 'place-draft.v1', 'review-draft'],
  ['settings.research.plan', 'settings', 'structured-one-shot', 'setting-research', 'research-brief.v1', 'research-query-plan.v1', 'ephemeral'],
  ['settings.research.claims', 'settings', 'validated-chain', 'setting-research', 'research-sources.v1', 'research-claims.v1', 'review-draft'],
  ['settings.maintenance.audit', 'settings', 'validated-chain', 'setting-maintenance', 'worldbook-revision.v1', 'maintenance-suggestions.v1', 'review-only'],
  ['authoring.continue', 'authoring', 'agent-loop', 'narrative-scene', 'authoring-intent.v1', 'prose-segment.v1', 'direct-text'],
  ['authoring.advance', 'authoring', 'agent-loop', 'narrative-scene', 'authoring-intent.v1', 'prose-segment.v1', 'direct-text'],
  ['authoring.simulate.character', 'authoring', 'agent-loop', 'narrative-scene', 'character-intent.v1', 'prose-segment.v1', 'direct-text'],
  ['authoring.simulate.scene', 'authoring', 'agent-loop', 'narrative-scene', 'scene-intent.v1', 'prose-segment.v1', 'direct-text'],
  ['authoring.insert', 'authoring', 'structured-one-shot', 'writing-selection', 'text-target.v1', 'text-patch.v1', 'direct-text'],
  ['authoring.rewrite', 'authoring', 'structured-one-shot', 'writing-selection', 'text-target.v1', 'text-patch.v1', 'review-draft'],
  ['authoring.expand', 'authoring', 'structured-one-shot', 'writing-selection', 'text-target.v1', 'text-patch.v1', 'review-draft'],
  ['authoring.shorten', 'authoring', 'structured-one-shot', 'writing-selection', 'text-target.v1', 'text-patch.v1', 'review-draft'],
  ['authoring.complete.inline', 'authoring', 'structured-one-shot', 'writing-cursor', 'cursor-window.v1', 'text-patch.v1', 'ephemeral'],
  ['authoring.review.selection', 'authoring', 'structured-one-shot', 'writing-selection', 'text-target.v1', 'review-suggestions.v1', 'review-only'],
  ['authoring.review.chapter', 'authoring', 'validated-chain', 'writing-chapter', 'chapter-revision.v1', 'review-suggestions.v1', 'review-only'],
  ['authoring.next-actions', 'authoring', 'structured-one-shot', 'narrative-advisor', 'scene-revision.v1', 'action-options.v1', 'ephemeral'],
  ['authoring.dialogue-options', 'authoring', 'structured-one-shot', 'narrative-dialogue', 'scene-revision.v1', 'dialogue-options.v1', 'ephemeral'],
  ['authoring.emergence', 'authoring', 'validated-chain', 'narrative-state', 'runtime-revision.v1', 'runtime-candidate.v1', 'review-draft'],
  ['authoring.trigger', 'authoring', 'validated-chain', 'narrative-scene', 'trigger-intent.v1', 'prose-segment.v1', 'direct-text'],
  ['authoring.context.compact', 'authoring', 'structured-one-shot', 'narrative-memory', 'context-window.v1', 'memory-summary.v1', 'derived-state'],
  ['authoring.asset.summarize', 'authoring', 'structured-one-shot', 'asset-summary', 'asset-selection.v1', 'asset-summary.v1', 'review-draft'],
  ['observer.entities.derive', 'observer', 'background-derive', 'observer-manuscript', 'document-delta.v1', 'derived-entities.v1', 'derived-state'],
  ['observer.relations.derive', 'observer', 'background-derive', 'observer-manuscript', 'document-delta.v1', 'derived-relations.v1', 'derived-state'],
  ['observer.events.derive', 'observer', 'background-derive', 'observer-manuscript', 'document-delta.v1', 'derived-events.v1', 'derived-state'],
  ['observer.timeline.derive', 'observer', 'background-derive', 'observer-manuscript', 'document-delta.v1', 'derived-timeline.v1', 'derived-state'],
  ['observer.memory.derive', 'observer', 'background-derive', 'observer-manuscript', 'document-delta.v1', 'memory-candidates.v1', 'derived-state'],
  ['observer.quality.inspect', 'observer', 'shadow-observer', 'observer-quality', 'prose-segment.v1', 'quality-metrics.v1', 'metrics-only'],
  ['materials.refine', 'materials', 'structured-one-shot', 'materials-selection', 'asset-selection.v1', 'text-patch.v1', 'review-draft'],
  ['materials.classify', 'materials', 'structured-one-shot', 'materials-selection', 'asset-selection.v1', 'material-actions.v1', 'review-draft'],
  ['materials.split', 'materials', 'structured-one-shot', 'materials-selection', 'asset-selection.v1', 'material-actions.v1', 'review-draft'],
  ['materials.relate', 'materials', 'structured-one-shot', 'materials-selection', 'asset-selection.v1', 'material-actions.v1', 'review-draft'],
  ['canvas.organize', 'canvas', 'structured-one-shot', 'canvas-neighborhood', 'canvas-selection.v1', 'canvas-actions.v1', 'review-draft'],
  ['canvas.relate', 'canvas', 'structured-one-shot', 'canvas-neighborhood', 'canvas-selection.v1', 'canvas-actions.v1', 'review-draft'],
  ['canvas.transition', 'canvas', 'structured-one-shot', 'canvas-neighborhood', 'canvas-selection.v1', 'canvas-actions.v1', 'review-draft'],
  ['storyboard.review', 'storyboard', 'structured-one-shot', 'storyboard-version', 'storyboard-version.v1', 'storyboard-actions.v1', 'review-draft'],
  ['storyboard.video.prompt', 'storyboard', 'structured-one-shot', 'storyboard-shot', 'storyboard-shot.v1', 'generation-request.v1', 'review-draft']
]

export const CANONICAL_AGENT_TASKS = Object.freeze(rows.map(([
  id, owner, workflowKind, contextProfile, inputSchema, resultSchema, effectPolicy
]) => Object.freeze({ id, owner, workflowKind, contextProfile, inputSchema, resultSchema, effectPolicy })))

const byId = new Map(CANONICAL_AGENT_TASKS.map((task) => [task.id, task]))
export const listCanonicalAgentTaskIds = () => [...byId.keys()]
export const getCanonicalAgentTask = (id) => byId.get(String(id || '').trim()) || null

export const LEGACY_CAPABILITY_ALIASES = Object.freeze({
  'worldbook.import.structure': 'settings.import.extract',
  'experience.next-actions': 'authoring.next-actions',
  'experience.emergence': 'authoring.emergence',
  'experience.memory.compress': 'authoring.context.compact',
  'experience.asset-summary': 'authoring.asset.summarize',
  'writing.continue': 'authoring.continue',
  'writing.rewrite': 'authoring.rewrite',
  'writing.review': 'authoring.review.chapter',
  'writing.fix.selection': 'authoring.rewrite',
  'writing.fix.paragraph': 'authoring.rewrite',
  'writing.continue.light': 'authoring.complete.inline',
  'writing.close.thread': 'authoring.review.selection',
  'writing.chapter.health': 'authoring.review.chapter',
  'advisor.fix.selection': 'authoring.rewrite',
  'advisor.fix.paragraph': 'authoring.rewrite',
  'advisor.continue.light': 'authoring.complete.inline',
  'advisor.close.thread': 'authoring.review.selection',
  'advisor.review.chapter': 'authoring.review.chapter'
})

export const resolveLegacyTaskAlias = (id) => {
  const requested = String(id || '').trim()
  return LEGACY_CAPABILITY_ALIASES[requested] || requested
}
```

Modify `shared/agentTaskContract.js` so legacy aliases resolve into this catalog without maintaining a second executable list.

- [ ] **Step 4: Run the focused test and confirm GREEN**

Run: `npm run test:run -- src/__tests__/agentCapabilityContract.test.js src/__tests__/agentContracts.test.js`

Expected: both files pass and existing aliases remain accepted.

- [ ] **Step 5: Commit the catalog**

```bash
git add shared/agentCapabilityContract.js shared/agentTaskContract.js src/__tests__/agentCapabilityContract.test.js
git commit -m "feat(agents): define canonical capability catalog"
```

### Task 2: Add the shared TaskRequest contract

**Files:**
- Create: `shared/agentTaskRequestContract.js`
- Modify: `src/__tests__/agentCapabilityContract.test.js`

- [ ] **Step 1: Add failing request validation tests**

```js
import { createTaskRequest, validateTaskRequest } from '../../shared/agentTaskRequestContract.js'

it('requires project, target revision and explicit intent', () => {
  const request = createTaskRequest({
    taskId: 'authoring.rewrite',
    project: { id: 'project-1', revision: 'project-r3' },
    target: { type: 'selection', id: 'node-2', revision: 'node-r7' },
    intent: { instruction: '压缩重复解释' },
    surface: 'authoring'
  })
  expect(validateTaskRequest(request)).toEqual({ valid: true })
  expect(validateTaskRequest({ ...request, target: { ...request.target, revision: '' } })).toMatchObject({
    valid: false,
    reason: 'target-revision-required'
  })
})
```

- [ ] **Step 2: Run the test and confirm RED**

Run: `npm run test:run -- src/__tests__/agentCapabilityContract.test.js`

Expected: FAIL because the request contract does not exist.

- [ ] **Step 3: Implement the immutable request shape**

```js
export const AGENT_TASK_REQUEST_VERSION = 1

export function createTaskRequest({ taskId, project, target, intent, surface, options = {} }) {
  return Object.freeze({
    version: AGENT_TASK_REQUEST_VERSION,
    requestId: crypto.randomUUID(),
    taskId: String(taskId || '').trim(),
    project: { id: String(project?.id || ''), revision: String(project?.revision || '') },
    target: {
      type: String(target?.type || ''),
      id: target?.id == null ? null : String(target.id),
      revision: String(target?.revision || '')
    },
    intent: Object.freeze({ ...(intent || {}) }),
    surface: String(surface || ''),
    options: Object.freeze({ ...options })
  })
}

export function validateTaskRequest(request) {
  if (request?.version !== AGENT_TASK_REQUEST_VERSION) return { valid: false, reason: 'invalid-version' }
  if (!request.taskId) return { valid: false, reason: 'task-id-required' }
  if (!request.project?.id || !request.project?.revision) return { valid: false, reason: 'project-revision-required' }
  if (!request.target?.type || !request.target?.revision) return { valid: false, reason: 'target-revision-required' }
  if (!request.intent || typeof request.intent !== 'object') return { valid: false, reason: 'intent-required' }
  if (!request.surface) return { valid: false, reason: 'surface-required' }
  return { valid: true }
}
```

- [ ] **Step 4: Run tests and commit**

Run: `npm run test:run -- src/__tests__/agentCapabilityContract.test.js`

Expected: PASS.

```bash
git add shared/agentTaskRequestContract.js src/__tests__/agentCapabilityContract.test.js
git commit -m "feat(agents): validate shared task requests"
```

### Task 3: Build the Project Knowledge Facade

**Files:**
- Create: `src/services/project/projectKnowledgeFacade.js`
- Create: `src/__tests__/projectKnowledgeFacade.test.js`

- [ ] **Step 1: Write failing authority and sparse-read tests**

```js
import { describe, expect, it, vi } from 'vitest'
import { createProjectKnowledgeFacade } from '../services/project/projectKnowledgeFacade.js'

it('returns locked canon before derived evidence and reads only requested blocks', async () => {
  const readers = {
    canon: vi.fn(async () => [{ id: 'char-1', authority: 'locked', text: '林昭拒绝饮酒' }]),
    derived: vi.fn(async () => [{ id: 'char-1', authority: 'derived', text: '林昭饮酒' }]),
    manuscript: vi.fn(async () => '正文窗口')
  }
  const facade = createProjectKnowledgeFacade({ projectId: 'p1', projectRevision: 'r9', readers })
  const snapshot = await facade.resolve(['canon', 'derived'])
  expect(snapshot.blocks[0].authority).toBe('locked')
  expect(readers.manuscript).not.toHaveBeenCalled()
})
```

- [ ] **Step 2: Run the test and confirm RED**

Run: `npm run test:run -- src/__tests__/projectKnowledgeFacade.test.js`

Expected: FAIL because the facade does not exist.

- [ ] **Step 3: Implement stable identity, authority order and explicit block reads**

```js
const AUTHORITY_RANK = Object.freeze({ locked: 500, canonical: 400, accepted: 300, derived: 200, imported: 100 })

export function createProjectKnowledgeFacade({ projectId, projectRevision, readers }) {
  if (!projectId || !projectRevision) throw new Error('project identity and revision are required')
  return Object.freeze({
    project: Object.freeze({ id: String(projectId), revision: String(projectRevision) }),
    async resolve(kinds, request = {}) {
      const blocks = []
      for (const kind of [...new Set(kinds || [])]) {
        const reader = readers?.[kind]
        if (typeof reader !== 'function') continue
        const value = await reader(request)
        blocks.push(...[].concat(value || []).map((entry) => ({ kind, authority: 'derived', ...entry })))
      }
      blocks.sort((a, b) => (AUTHORITY_RANK[b.authority] || 0) - (AUTHORITY_RANK[a.authority] || 0))
      return { project: this.project, blocks }
    }
  })
}
```

- [ ] **Step 4: Run focused tests and commit**

Run: `npm run test:run -- src/__tests__/projectKnowledgeFacade.test.js`

Expected: PASS, and the unrequested reader remains at zero calls.

```bash
git add src/services/project/projectKnowledgeFacade.js src/__tests__/projectKnowledgeFacade.test.js
git commit -m "feat(agents): add project knowledge facade"
```

### Task 4: Resolve sparse context profiles with a ledger

**Files:**
- Create: `src/services/agents/agentContextProfiles.js`
- Create: `src/services/agents/agentContextResolver.js`
- Modify: `shared/agentContextContract.js`
- Modify: `src/__tests__/projectKnowledgeFacade.test.js`

- [ ] **Step 1: Add a failing forbidden-block test**

```js
import { resolveAgentContext } from '../services/agents/agentContextResolver.js'
import { CANONICAL_AGENT_TASKS, WORKFLOW_KINDS } from '../../shared/agentCapabilityContract.js'
import { AGENT_CONTEXT_PROFILES } from '../services/agents/agentContextProfiles.js'

it('defines every catalog workflow and context profile', () => {
  for (const task of CANONICAL_AGENT_TASKS) {
    expect(WORKFLOW_KINDS).toContain(task.workflowKind)
    expect(AGENT_CONTEXT_PROFILES[task.contextProfile]).toBeTruthy()
  }
})

it('does not expose narrative memory to a setting field task', async () => {
  const result = await resolveAgentContext({
    taskId: 'settings.field.complete',
    request: { target: { id: 'tone', revision: 'r1' } },
    facade: { resolve: async (kinds) => ({ blocks: kinds.map((kind) => ({ kind, text: kind })) }) }
  })
  expect(result.envelope.blocks.map((block) => block.kind)).toEqual([
    'rules', 'selection', 'worldbook', 'references'
  ])
  expect(result.ledger.parts.every((part) => part.kind !== 'memory')).toBe(true)
})
```

- [ ] **Step 2: Run the test and confirm RED**

Run: `npm run test:run -- src/__tests__/projectKnowledgeFacade.test.js`

Expected: FAIL because profile resolution does not exist.

- [ ] **Step 3: Define explicit profiles and resolve through the existing envelope contract**

```js
export const AGENT_CONTEXT_PROFILES = Object.freeze({
  'setting-foundation': Object.freeze({ blocks: ['rules', 'selection', 'references'], maxChars: 18000 }),
  'setting-field': Object.freeze({ blocks: ['rules', 'selection', 'worldbook', 'references'], maxChars: 14000 }),
  'setting-section': Object.freeze({ blocks: ['rules', 'selection', 'worldbook', 'references'], maxChars: 22000 }),
  'source-import': Object.freeze({ blocks: ['rules', 'selection', 'references'], maxChars: 24000 }),
  'setting-places': Object.freeze({ blocks: ['rules', 'selection', 'worldbook', 'location', 'references'], maxChars: 22000 }),
  'setting-place': Object.freeze({ blocks: ['rules', 'selection', 'worldbook', 'location'], maxChars: 14000 }),
  'setting-research': Object.freeze({ blocks: ['rules', 'selection', 'worldbook', 'references'], maxChars: 20000 }),
  'setting-maintenance': Object.freeze({ blocks: ['rules', 'worldbook', 'history'], maxChars: 24000 }),
  'writing-selection': Object.freeze({ blocks: ['rules', 'style', 'selection', 'scene', 'worldbook'], maxChars: 14000 }),
  'writing-cursor': Object.freeze({ blocks: ['rules', 'style', 'selection', 'scene'], maxChars: 12000 }),
  'writing-chapter': Object.freeze({ blocks: ['rules', 'style', 'selection', 'outline', 'worldbook'], maxChars: 24000 }),
  'narrative-scene': Object.freeze({ blocks: ['rules', 'style', 'scene', 'character', 'location', 'history', 'memory', 'worldbook'], maxChars: 32000 }),
  'narrative-advisor': Object.freeze({ blocks: ['rules', 'scene', 'character', 'worldbook'], maxChars: 16000 }),
  'narrative-dialogue': Object.freeze({ blocks: ['rules', 'style', 'scene', 'character'], maxChars: 14000 }),
  'narrative-state': Object.freeze({ blocks: ['rules', 'scene', 'character', 'location', 'history', 'worldbook'], maxChars: 20000 }),
  'narrative-memory': Object.freeze({ blocks: ['rules', 'scene', 'memory'], maxChars: 18000 }),
  'asset-summary': Object.freeze({ blocks: ['rules', 'selection', 'references'], maxChars: 12000 }),
  'observer-manuscript': Object.freeze({ blocks: ['rules', 'selection', 'worldbook'], maxChars: 16000 }),
  'observer-quality': Object.freeze({ blocks: ['rules', 'selection', 'style'], maxChars: 10000 }),
  'materials-selection': Object.freeze({ blocks: ['rules', 'selection', 'references'], maxChars: 14000 }),
  'canvas-neighborhood': Object.freeze({ blocks: ['rules', 'selection', 'references'], maxChars: 14000 }),
  'storyboard-version': Object.freeze({ blocks: ['rules', 'selection', 'references'], maxChars: 12000 }),
  'storyboard-shot': Object.freeze({ blocks: ['rules', 'selection', 'references'], maxChars: 12000 })
})
```

`resolveAgentContext()` must look up the task's profile, call `facade.resolve(profile.blocks, request)`, build/clip the existing envelope, and return `createAgentContextLedger(envelope)` without persisting prompt text.

- [ ] **Step 4: Run context tests and commit**

Run: `npm run test:run -- src/__tests__/projectKnowledgeFacade.test.js src/__tests__/agentContracts.test.js`

Expected: PASS; budget, source refs and dropped-block reasons remain valid.

```bash
git add src/services/agents/agentContextProfiles.js src/services/agents/agentContextResolver.js shared/agentContextContract.js src/__tests__/projectKnowledgeFacade.test.js
git commit -m "feat(agents): resolve sparse project context"
```

### Task 5: Add deterministic routing and workflow execution

**Files:**
- Create: `src/services/agents/agentTaskRouter.js`
- Create: `src/services/agents/agentExecutionEngine.js`
- Create: `src/__tests__/agentExecutionEngine.test.js`

- [ ] **Step 1: Write failing routing tests**

```js
import { describe, expect, it, vi } from 'vitest'
import { createAgentExecutionEngine } from '../services/agents/agentExecutionEngine.js'

it('routes explicit commands without a supervisor model call', async () => {
  const workflow = vi.fn(async () => ({ status: 'completed', actions: [] }))
  const engine = createAgentExecutionEngine({ workflows: { 'structured-one-shot': workflow } })
  const result = await engine.run({ taskId: 'settings.field.complete' }, { envelope: { blocks: [] } })
  expect(workflow).toHaveBeenCalledOnce()
  expect(result.status).toBe('completed')
})
```

- [ ] **Step 2: Run the test and confirm RED**

Run: `npm run test:run -- src/__tests__/agentExecutionEngine.test.js`

Expected: FAIL because the engine does not exist.

- [ ] **Step 3: Implement catalog-driven routing and typed failure**

```js
import { getCanonicalAgentTask } from '../../../shared/agentCapabilityContract.js'

export function resolveAgentRoute(taskId) {
  const task = getCanonicalAgentTask(taskId)
  if (!task) return { valid: false, code: 'AGENT_TASK_UNKNOWN' }
  return { valid: true, task }
}
```

```js
import { resolveAgentRoute } from './agentTaskRouter.js'

export function createAgentExecutionEngine({ workflows }) {
  return Object.freeze({
    async run(request, context) {
      const route = resolveAgentRoute(request.taskId)
      if (!route.valid) return { status: 'failed', error: { code: route.code, retryable: false } }
      const workflow = workflows?.[route.task.workflowKind]
      if (typeof workflow !== 'function') {
        return { status: 'failed', error: { code: 'AGENT_WORKFLOW_UNAVAILABLE', retryable: false } }
      }
      try {
        return await workflow({ request, context, task: route.task })
      } catch (error) {
        const aborted = error?.name === 'AbortError' || request.options?.signal?.aborted
        return {
          status: 'failed',
          error: {
            code: aborted ? 'AGENT_ABORTED' : 'AGENT_EXECUTION_FAILED',
            message: String(error?.message || error),
            retryable: !aborted
          }
        }
      }
    }
  })
}
```

- [ ] **Step 4: Run tests and commit**

Run: `npm run test:run -- src/__tests__/agentExecutionEngine.test.js src/__tests__/agentCapabilityContract.test.js`

Expected: PASS with no provider call involved in route selection.

```bash
git add src/services/agents/agentTaskRouter.js src/services/agents/agentExecutionEngine.js src/__tests__/agentExecutionEngine.test.js
git commit -m "feat(agents): route capability workflows deterministically"
```

### Task 6: Enforce result transactions and effect policies

**Files:**
- Create: `src/services/agents/agentResultTransaction.js`
- Modify: `src/services/agents/agentResultLifecycle.js`
- Modify: `src/__tests__/agentExecutionEngine.test.js`

- [ ] **Step 1: Add failing stale and forbidden-effect tests**

```js
import { applyAgentResultTransaction } from '../services/agents/agentResultTransaction.js'

it('rejects stale or overpowered mutations before adapter writes', async () => {
  const adapter = { apply: vi.fn() }
  const stale = await applyAgentResultTransaction({
    taskId: 'authoring.rewrite',
    result: { actions: [{ type: 'text-patch', content: '新正文' }] },
    target: { revision: 'r1' },
    currentRevision: 'r2',
    adapter
  })
  expect(stale.status).toBe('stale')
  expect(adapter.apply).not.toHaveBeenCalled()

  const forbidden = await applyAgentResultTransaction({
    taskId: 'observer.quality.inspect',
    result: { actions: [{ type: 'text-patch', content: '篡改正文' }] },
    target: { revision: 'r2' },
    currentRevision: 'r2',
    adapter
  })
  expect(forbidden.error.code).toBe('AGENT_EFFECT_FORBIDDEN')
})
```

- [ ] **Step 2: Run the test and confirm RED**

Run: `npm run test:run -- src/__tests__/agentExecutionEngine.test.js`

Expected: FAIL because the transaction module does not exist.

- [ ] **Step 3: Implement revision-first transaction application**

```js
const ALLOWED_ACTIONS = Object.freeze({
  'local-cache': ['cache-write'],
  'review-draft': [
    'setting-draft',
    'text-patch',
    'runtime-candidate',
    'asset-draft',
    'material-classification',
    'material-split',
    'material-relations',
    'canvas-layout',
    'canvas-relations',
    'canvas-transition',
    'storyboard-shot-patch',
    'generation-request'
  ],
  'review-only': [],
  'direct-text': ['text-insert'],
  ephemeral: [],
  'derived-state': ['derived-upsert'],
  'metrics-only': ['metrics-write']
})

export async function applyAgentResultTransaction({ taskId, result, target, currentRevision, adapter }) {
  const task = getCanonicalAgentTask(taskId)
  if (!task) return { status: 'failed', error: { code: 'AGENT_TASK_UNKNOWN' } }
  if (String(target?.revision) !== String(currentRevision)) return { status: 'stale', staleReason: 'target-revision-changed' }
  const allowed = ALLOWED_ACTIONS[task.effectPolicy] || []
  const actions = result?.actions || []
  if (actions.some((action) => !allowed.includes(action.type))) {
    return { status: 'failed', error: { code: 'AGENT_EFFECT_FORBIDDEN' } }
  }
  const receipt = await adapter.apply(actions, { taskId, target })
  return { status: 'applied', receipt }
}
```

Import `getCanonicalAgentTask` from the shared catalog and extend `agentResultLifecycle.js` only with status/receipt normalization; do not duplicate policy tables there.

- [ ] **Step 4: Run tests and commit**

Run: `npm run test:run -- src/__tests__/agentExecutionEngine.test.js src/__tests__/agentContracts.test.js`

Expected: PASS; adapter writes remain zero for stale and forbidden results.

```bash
git add src/services/agents/agentResultTransaction.js src/services/agents/agentResultLifecycle.js src/__tests__/agentExecutionEngine.test.js
git commit -m "feat(agents): enforce result effect transactions"
```

### Task 7: Record privacy-safe execution metrics

**Files:**
- Create: `src/services/agents/agentExecutionMetrics.js`
- Modify: `src/__tests__/agentExecutionEngine.test.js`

- [ ] **Step 1: Write a failing content-exclusion test**

```js
import { createAgentExecutionMetric } from '../services/agents/agentExecutionMetrics.js'

it('records operational dimensions without manuscript, prompt or content fingerprint', () => {
  const metric = createAgentExecutionMetric({
    request: { requestId: 'req-1', taskId: 'authoring.continue' },
    task: { workflowKind: 'agent-loop', contextProfile: 'narrative-scene' },
    result: { status: 'completed' },
    timing: { durationMs: 842 },
    usage: { inputTokens: 1200, outputTokens: 430, retries: 1, toolRounds: 2 },
    ledger: { budget: { usedChars: 4800 }, parts: [{ kind: 'scene', status: 'included', chars: 900 }] }
  })
  expect(metric).toMatchObject({ taskId: 'authoring.continue', workflowKind: 'agent-loop', status: 'completed', durationMs: 842 })
  expect(JSON.stringify(metric)).not.toMatch(/manuscript|prompt|textHash|contentHash|潮水/)
})
```

- [ ] **Step 2: Run the test and confirm RED**

Run: `npm run test:run -- src/__tests__/agentExecutionEngine.test.js`

Expected: FAIL because the metrics module does not exist.

- [ ] **Step 3: Implement a fixed allowlist metric**

```js
export function createAgentExecutionMetric({ request, task, result, timing = {}, usage = {}, ledger = {} }) {
  return Object.freeze({
    schemaVersion: 1,
    requestId: String(request.requestId),
    taskId: String(request.taskId),
    workflowKind: String(task.workflowKind),
    contextProfile: String(task.contextProfile),
    status: String(result.status),
    errorCode: result.error?.code ? String(result.error.code) : null,
    durationMs: Math.max(0, Number(timing.durationMs) || 0),
    inputTokens: Math.max(0, Number(usage.inputTokens) || 0),
    outputTokens: Math.max(0, Number(usage.outputTokens) || 0),
    retries: Math.max(0, Number(usage.retries) || 0),
    toolRounds: Math.max(0, Number(usage.toolRounds) || 0),
    contextChars: Math.max(0, Number(ledger.budget?.usedChars) || 0),
    truncatedBlocks: (ledger.parts || []).filter((part) => part.status === 'truncated').length,
    droppedBlocks: (ledger.parts || []).filter((part) => part.status === 'dropped').length
  })
}
```

Persist only this allowlisted object through the existing metrics sink. Do not accept arbitrary metadata from callers.

- [ ] **Step 4: Run tests and commit**

Run: `npm run test:run -- src/__tests__/agentExecutionEngine.test.js`

Expected: PASS; the serialized metric contains no text or content-derived hash field.

```bash
git add src/services/agents/agentExecutionMetrics.js src/__tests__/agentExecutionEngine.test.js
git commit -m "feat(agents): record privacy-safe execution metrics"
```

### Task 8: Replace client/server duplicate registries with compatibility adapters

**Files:**
- Modify: `src/services/agents/agentTaskRegistry.js`
- Modify: `server/services/agentTaskAllowlist.js`
- Modify: `src/__tests__/agentCapabilityContract.test.js`
- Modify: `src/__tests__/agentContracts.test.js`

- [ ] **Step 1: Add a failing parity test**

```js
import { listCanonicalAgentTaskIds } from '../../shared/agentCapabilityContract.js'
import { getExecutableTaskTypes } from '../services/agents/agentTaskRegistry.js'
import { getServerTaskTypes } from '../../server/services/agentTaskAllowlist.js'

it('keeps browser and server allowlists identical to the canonical catalog', () => {
  const expected = listCanonicalAgentTaskIds().sort()
  expect(getExecutableTaskTypes().sort()).toEqual(expected)
  expect(getServerTaskTypes().sort()).toEqual(expected)
})
```

- [ ] **Step 2: Run the parity test and confirm RED**

Run: `npm run test:run -- src/__tests__/agentCapabilityContract.test.js src/__tests__/agentContracts.test.js`

Expected: FAIL because current declared/executable registries differ.

- [ ] **Step 3: Convert both registries to thin shared-catalog adapters**

```js
export function getExecutableTaskTypes() {
  return listCanonicalAgentTaskIds()
}

export function getTask(id) {
  const canonical = resolveLegacyTaskAlias(id)
  return getCanonicalAgentTask(canonical)
}
```

```js
export function getServerTaskTypes() {
  return listCanonicalAgentTaskIds()
}

export function validateServerTaskType(taskType) {
  const canonical = resolveLegacyTaskAlias(taskType)
  const definition = getCanonicalAgentTask(canonical)
  return definition
    ? { valid: true, taskType: canonical, definition, wasLegacyAlias: canonical !== taskType }
    : { valid: false, code: 'AGENT_TASK_UNKNOWN', requested: taskType }
}
```

Keep legacy aliases measurable and remove duplicate production definitions from `agentTaskRegistry.js`.

- [ ] **Step 4: Run parity tests and commit**

Run: `npm run test:run -- src/__tests__/agentCapabilityContract.test.js src/__tests__/agentContracts.test.js`

Expected: PASS with exact set equality.

```bash
git add src/services/agents/agentTaskRegistry.js server/services/agentTaskAllowlist.js src/__tests__/agentCapabilityContract.test.js src/__tests__/agentContracts.test.js
git commit -m "refactor(agents): share capability registry across runtimes"
```

### Task 9: Foundation verification and handoff

**Files:**
- Modify: `docs/STATUS.md`
- Create: `docs/agent-runs/2026-08-22-unified-agent-foundation/summary.md`

- [ ] **Step 1: Run all foundation-focused tests**

```bash
npm run test:run -- src/__tests__/agentCapabilityContract.test.js src/__tests__/projectKnowledgeFacade.test.js src/__tests__/agentExecutionEngine.test.js src/__tests__/agentContracts.test.js src/__tests__/integration.test.js
```

Expected: all pass; exact counts are copied into the summary.

- [ ] **Step 2: Run full verification**

Run: `npm run verify:full`

Expected: Vitest, Vite build, diff check and VitePress build all exit 0 in the isolated worktree.

- [ ] **Step 3: Record the frozen interface**

The summary must list:

- canonical task count and catalog hash/revision;
- exported request/facade/router/engine/transaction entry points;
- legacy aliases retained;
- focused and full verification output;
- the exact Foundation commit range consumed by Settings and Authoring Runtime.

- [ ] **Step 4: Commit the handoff**

```bash
git add docs/STATUS.md docs/agent-runs/2026-08-22-unified-agent-foundation/summary.md
git commit -m "docs(agents): record foundation handoff"
```
