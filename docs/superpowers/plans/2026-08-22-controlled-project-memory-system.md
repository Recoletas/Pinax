# Controlled Project Memory System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在不引入 embedding、自动正式化或独立 Agent 记忆库的前提下，把现有记忆候选升级为有来源、有 revision、可解释检索并接入统一 Authoring 运行时的受控项目记忆层。

**Architecture:** `memoryCandidates` 继续是唯一持久化 owner；正文事务、边界和显式操作只产生候选或失效事件，`ProjectKnowledgeFacade` 在任务解析前读取当前有效的 active 记忆，`resolveAgentContext` 和真实 ContextLedger 决定注入与解释。模型不能直接提升权威、覆盖 canon 或修改历史记忆；替换与合并以 append-only supersession 表示。

**Tech Stack:** Vue 3、Pinia、现有 localStorage adapter、shared Agent contracts、Authoring runtime、NarrativeKernel、Vitest、Vite、VitePress、UI audit。

---

## Execution order and ownership

本计划必须从 `main` 或用户指定的最新集成提交创建独立 worktree。不得在含有其他用户 WIP 的共享 checkout 中实施。

执行顺序不可交换：

1. **Gate A：Authoring 纵向链路基线**；
2. **M0：Task 1-5 记忆内核**；
3. **M1：Task 6-9 运行时与 UI 接入**；
4. **Task 10 发布验收和文档收口**。

文件 owner：

- memory schema/repository/retrieval：`src/services/memory*`；
- unified context：`src/services/project/projectKnowledgeFacade.js`、`src/services/agents/agentContextResolver.js`；
- observer：`src/services/agents/observers/*`、`src/stores/gameStore.js`；
- Authoring projection：`src/pages/Authoring.vue` 和小型 memory 组件；
- shared contract：`shared/memory*.js`；
- 禁止在页面、新 Agent persona 或服务端 prompt 中复制检索规则。

## Gate A: Prove the Authoring runtime before memory work

**Files:**
- Verify: `src/__tests__/authoringUnifiedRuntimeWiring.test.js`
- Verify: `src/__tests__/authoringWorkspace.test.js`
- Verify: `src/__tests__/agentCapabilityContract.test.js`
- Verify: `src/pages/Authoring.vue`
- Verify: `shared/agentCapabilityContract.js`

- [ ] **Step 1: Run the real-path focused tests**

Run:

```bash
npm run test:run -- src/__tests__/authoringUnifiedRuntimeWiring.test.js src/__tests__/authoringWorkspace.test.js src/__tests__/agentCapabilityContract.test.js
```

Expected: PASS. The tests must execute `TaskRequest -> ProjectKnowledgeFacade -> resolveAgentContext -> workflow -> applyAgentResultTransaction`, not only scan source strings.

- [ ] **Step 2: Inspect the nine command probe assertions**

Confirm tests cover these canonical IDs:

```js
[
  'authoring.continue',
  'authoring.advance',
  'authoring.simulate.character',
  'authoring.simulate.scene',
  'authoring.insert',
  'authoring.rewrite',
  'authoring.next-actions',
  'authoring.dialogue-options',
  'authoring.emergence'
]
```

Required assertions: provider capability is non-empty; rewrite replaces the exact selection; suggestion results do not enter prose; changed target revision produces `stale`; the ledger comes from `resolveAgentContext`.

- [ ] **Step 3: Stop if Gate A is red**

Do not patch memory around a broken page path. Finish the Authoring integration remediation first, rerun Step 1, then start Task 1. Do not create a memory-specific provider caller or page-owned prompt builder.

### Task 1: Freeze the memory v2 contract and backward-compatible normalizer

**Files:**
- Create: `shared/memoryContract.js`
- Modify: `src/services/memoryCandidates.js`
- Modify: `src/__tests__/memoryCandidates.test.js`

- [ ] **Step 1: Write failing schema normalization tests**

Add parameterized cases to `src/__tests__/memoryCandidates.test.js`:

```js
it.each([
  ['pending', 'derived'],
  ['active', 'accepted'],
  ['stale', 'derived']
])('normalizes v1 %s memory into v2 authority %s', (status, authority) => {
  const candidate = createMemoryCandidate({
    id: `legacy-${status}`,
    schemaVersion: 1,
    status,
    scope: 'project',
    scopeId: 'project-1',
    content: '林昭答应在天亮前返回。',
    sourceRef: 'chapter:1:node:7'
  })
  expect(candidate.schemaVersion).toBe(2)
  expect(candidate.authority).toBe(authority)
  expect(candidate.sourceRefs).toEqual(['chapter:1:node:7'])
  expect(candidate.sourceRevision).toBe('')
  expect(candidate.supersedes).toEqual([])
})

it('rejects durable derived memory without a source reference', () => {
  expect(() => createMemoryCandidate({
    status: 'active',
    authority: 'derived',
    content: '无来源事实'
  })).toThrow('MEMORY_SOURCE_REQUIRED')
})
```

- [ ] **Step 2: Run the test and confirm RED**

Run: `npm run test:run -- src/__tests__/memoryCandidates.test.js`

Expected: FAIL because schema v2 fields and source invariant do not exist.

- [ ] **Step 3: Add the shared contract**

Create `shared/memoryContract.js` with frozen constants and pure normalizers:

```js
export const MEMORY_SCHEMA_VERSION = 2
export const MEMORY_AUTHORITIES = Object.freeze(['accepted', 'derived', 'imported'])
export const MEMORY_DERIVATIONS = Object.freeze(['explicit', 'prose-commit', 'boundary', 'migration'])
export const MEMORY_RETRIEVAL_POLICY = Object.freeze({
  topK: 5,
  maxPerScope: 3,
  minRelevance: 0.18,
  weights: Object.freeze({ relevance: 0.50, importance: 0.18, authority: 0.14, recency: 0.10, scopeFit: 0.08 })
})

export function normalizeStringList(value, limit = 32) {
  return [...new Set([].concat(value || []).map((item) => String(item || '').trim()).filter(Boolean))].slice(0, limit)
}

export function defaultMemoryAuthority(status) {
  return status === 'active' ? 'accepted' : 'derived'
}
```

Import these constants in `memoryCandidates.js`. Normalize `sourceRef` into `sourceRefs`, preserve the legacy singular field for readers during migration, and add `sourceRevision`, `derivedBy`, `authority`, `importance`, `importanceOverride`, `supersedes`, `recallCount`, and `lastRecalledAt`. Throw only for new durable derived writes; legacy records without refs remain readable and are marked `metadata.migrationWarning = 'missing-source-ref'` rather than deleted.

- [ ] **Step 4: Run tests and commit**

Run: `npm run test:run -- src/__tests__/memoryCandidates.test.js src/__tests__/backupExport.test.js`

Expected: PASS; existing v1 fixtures remain readable and backup export does not lose memory revision information.

```bash
git add shared/memoryContract.js src/services/memoryCandidates.js src/__tests__/memoryCandidates.test.js src/__tests__/backupExport.test.js
git commit -m "feat(memory): define controlled memory contract"
```

### Task 2: Add deterministic importance and append-only supersession

**Files:**
- Create: `src/services/memoryImportance.js`
- Modify: `src/services/memoryCandidates.js`
- Modify: `src/__tests__/memoryCandidates.test.js`

- [ ] **Step 1: Write failing importance and supersession tests**

```js
it('derives importance without asking the model to score itself', () => {
  expect(deriveMemoryImportance({ kind: 'constraint', content: '角色绝不能知道真凶身份。' })).toBe(0.9)
  expect(deriveMemoryImportance({
    kind: 'plot-event',
    content: '林昭承诺天亮前返回。',
    signals: { explicitCommitment: true, independentSourceCount: 2 }
  })).toBe(0.96)
  expect(deriveMemoryImportance({
    kind: 'project-fact',
    content: '也许门后有人。',
    signals: { inferenceOnly: true }
  })).toBe(0.56)
})

it('creates a new active revision and stales superseded memories', () => {
  const result = supersedeMemoryCandidates({
    content: '林昭改为在正午返回。',
    scope: 'project',
    scopeId: 'project-1',
    kind: 'plot-event',
    sourceRefs: ['chapter:2:node:3'],
    sourceRevision: 'rev-2',
    supersedes: ['active-1']
  })
  expect(result.candidate.status).toBe('active')
  expect(result.candidate.supersedes).toEqual(['active-1'])
  expect(listMemoryCandidates({ status: 'stale' }).map((item) => item.id)).toContain('active-1')
})
```

- [ ] **Step 2: Confirm RED**

Run: `npm run test:run -- src/__tests__/memoryCandidates.test.js`

Expected: FAIL because importance and supersession APIs are absent.

- [ ] **Step 3: Implement pure importance derivation**

Create `memoryImportance.js`:

```js
const BASE = Object.freeze({
  constraint: 0.90,
  'plot-event': 0.78,
  'character-state': 0.72,
  'project-fact': 0.68,
  'author-preference': 0.62,
  'style-sample': 0.45
})

const clamp = (value) => Math.max(0, Math.min(1, Math.round(value * 100) / 100))

export function deriveMemoryImportance({ kind, signals = {}, override = null } = {}) {
  if (Number.isFinite(Number(override))) return clamp(Number(override))
  let score = BASE[kind] ?? 0.5
  if (signals.explicitCommitment || signals.irreversibleChange) score += 0.10
  if (Number(signals.independentSourceCount) >= 2) score += 0.08
  if (signals.inferenceOnly) score -= 0.12
  return clamp(score)
}
```

`createMemoryCandidate()` calls it when importance is absent. Add `supersedeMemoryCandidates()` as a single repository transaction: validate all target IDs in the same scope, create the new active candidate, then mark old entries stale with `metadata.supersededBy`. If validation fails, write nothing.

- [ ] **Step 4: Verify and commit**

Run: `npm run test:run -- src/__tests__/memoryCandidates.test.js`

Expected: PASS, including rollback when one superseded ID belongs to another project.

```bash
git add src/services/memoryImportance.js src/services/memoryCandidates.js src/__tests__/memoryCandidates.test.js
git commit -m "feat(memory): add deterministic importance and supersession"
```

### Task 3: Replace ad-hoc recall order with explainable lexical retrieval

**Files:**
- Create: `src/services/memoryRetrieval.js`
- Modify: `src/services/memoryCandidates.js`
- Modify: `src/services/agents/narrativeResourceIndex.js`
- Modify: `src/__tests__/memoryCandidates.test.js`
- Modify: `src/__tests__/narrativeAssetRetrieval.test.js`

- [ ] **Step 1: Write failing scoring tests**

```js
it('ranks relevant current accepted memory and exposes score components', () => {
  const result = rankMemoryCandidates({
    query: '林昭为什么必须在天亮前回来',
    projectId: 'project-1',
    sessionId: 'session-1',
    candidates: memoryFixture
  })
  expect(result.included[0].id).toBe('lin-promise')
  expect(result.included[0].score).toMatchObject({
    relevance: expect.any(Number),
    importance: expect.any(Number),
    authority: expect.any(Number),
    recency: expect.any(Number),
    scopeFit: expect.any(Number),
    final: expect.any(Number)
  })
})

it('does not let recall count change the primary ordering', () => {
  const once = rankMemoryCandidates({ query: '林昭返回', projectId: 'project-1', candidates: memoryFixture })
  const noisy = rankMemoryCandidates({
    query: '林昭返回',
    projectId: 'project-1',
    candidates: memoryFixture.map((item) => ({ ...item, recallCount: item.id === 'wrong' ? 999 : 0 }))
  })
  expect(noisy.included.map((item) => item.id)).toEqual(once.included.map((item) => item.id))
})

it('never recalls pending stale rejected or another project', () => {
  const result = rankMemoryCandidates({ query: '密钥', projectId: 'project-1', candidates: isolationFixture })
  expect(result.included.map((item) => item.id)).toEqual(['active-project-1'])
})
```

- [ ] **Step 2: Confirm RED**

Run: `npm run test:run -- src/__tests__/memoryCandidates.test.js src/__tests__/narrativeAssetRetrieval.test.js`

Expected: FAIL because the current ranking exposes only matched terms/confidence and caps per scope before a global topK.

- [ ] **Step 3: Implement one pure retrieval policy**

`memoryRetrieval.js` must export:

```js
export function rankMemoryCandidates({
  candidates,
  query,
  authorId = '',
  projectId = '',
  sessionId = '',
  now = Date.now(),
  policy = MEMORY_RETRIEVAL_POLICY
})
```

Implementation requirements:

- filter status/scope/source revision before scoring;
- combine normalized term overlap, character bigram Dice, and exact `characterIds/placeIds` matches into relevance;
- derive bounded recency from `updatedAt`, not `lastRecalledAt`;
- return `{ included, excluded, counts }` with `skipReason` values `status`, `scope`, `source-stale`, `below-threshold`, `per-scope-cap`, or `top-k`;
- include score components but never full hidden source content in metadata;
- use stable ID as the final deterministic tiebreak;
- require a non-empty query for automatic model context.

Make `rankScopedActiveMemoryCandidates()` and `buildScopedMemoryRecallContext()` thin compatibility adapters over this function. Make `narrativeResourceIndex` consume the same ranking result instead of independently sorting memory resources.

- [ ] **Step 4: Verify and commit**

Run:

```bash
npm run test:run -- src/__tests__/memoryCandidates.test.js src/__tests__/narrativeAssetRetrieval.test.js src/__tests__/gameStoreSession.test.js
```

Expected: PASS; existing scoped recall text remains compatible while metadata gains explanations.

```bash
git add src/services/memoryRetrieval.js src/services/memoryCandidates.js src/services/agents/narrativeResourceIndex.js src/__tests__/memoryCandidates.test.js src/__tests__/narrativeAssetRetrieval.test.js src/__tests__/gameStoreSession.test.js
git commit -m "feat(memory): rank recall with explainable lexical policy"
```

### Task 4: Invalidate derived memory from source revisions

**Files:**
- Create: `src/services/memoryProvenance.js`
- Modify: `src/services/memoryCandidates.js`
- Modify: `src/services/agents/observers/authoringObserverScheduler.js`
- Modify: `src/__tests__/memoryCandidates.test.js`
- Modify: `src/__tests__/authoringAgentWorkflows.test.js`

- [ ] **Step 1: Write failing invalidation tests**

```js
it('stales only memories derived from the changed source revision', () => {
  const result = invalidateMemoryBySource({
    sourceRef: 'chapter:1:node:7',
    currentRevision: 'rev-3',
    reason: 'source-revision-changed'
  })
  expect(result.staledIds).toEqual(['memory-from-rev-2'])
  expect(result.untouchedIds).toContain('memory-from-rev-3')
})

it('invalidates old observations before scheduling recomputation', async () => {
  const calls = []
  const scheduler = createAuthoringObserverScheduler({
    invalidate: async (delta) => calls.push(['invalidate', delta.revision]),
    run: async (delta) => calls.push(['run', delta.revision])
  })
  scheduler.schedule({ sourceRefs: ['chapter:1:node:7'], revision: 'rev-3' })
  await scheduler.flush()
  expect(calls).toEqual([['invalidate', 'rev-3'], ['run', 'rev-3']])
})
```

- [ ] **Step 2: Confirm RED**

Run: `npm run test:run -- src/__tests__/memoryCandidates.test.js src/__tests__/authoringAgentWorkflows.test.js`

Expected: FAIL because source revision invalidation is not a memory repository operation.

- [ ] **Step 3: Implement source matching and atomic invalidation**

`memoryProvenance.js` owns normalized source identity:

```js
export function memorySourceKey(sourceRef, revision = '') {
  const ref = String(sourceRef || '').trim()
  const rev = String(revision || '').trim()
  return ref ? `${ref}@${rev || 'unknown'}` : ''
}

export function isMemorySourceCurrent(candidate, currentRevisions = {}) {
  return candidate.sourceRefs.every((ref) => {
    const expected = currentRevisions[ref]
    return !expected || !candidate.sourceRevision || expected === candidate.sourceRevision
  })
}
```

Repository invalidation marks matching derived/imported candidates stale with `previousStatus`, `staleReason`, and timestamp. It never stales `global-author + explicit` preferences because a chapter changes. Scheduler calls invalidation before recompute but keeps prose persistence non-blocking.

- [ ] **Step 4: Verify and commit**

Run: `npm run test:run -- src/__tests__/memoryCandidates.test.js src/__tests__/authoringAgentWorkflows.test.js src/__tests__/authoringUnifiedRuntimeWiring.test.js`

Expected: PASS; stale observer output is still dropped and prose commit never waits for derivation.

```bash
git add src/services/memoryProvenance.js src/services/memoryCandidates.js src/services/agents/observers/authoringObserverScheduler.js src/__tests__/memoryCandidates.test.js src/__tests__/authoringAgentWorkflows.test.js
git commit -m "feat(memory): invalidate memories by source revision"
```

### Task 5: Add bounded recall receipts and capacity rules

**Files:**
- Create: `src/services/memoryReceipt.js`
- Modify: `src/services/contextLedger.js`
- Modify: `src/services/memoryCandidates.js`
- Modify: `src/__tests__/memoryCandidates.test.js`
- Modify: `src/__tests__/agentContracts.test.js`

- [ ] **Step 1: Write failing privacy and capacity tests**

```js
it('stores a bounded receipt without source prose or prompt text', () => {
  const receipt = createMemoryRecallReceipt({
    requestId: 'req-1',
    query: '林昭为什么回来',
    included: [{ id: 'm1', sourceRefs: ['chapter:1:node:7'], score: scoreFixture }],
    excluded: [{ id: 'm2', skipReason: 'below-threshold', score: scoreFixture }]
  })
  expect(receipt.included[0]).not.toHaveProperty('content')
  expect(JSON.stringify(receipt)).not.toContain('完整章节正文')
  expect(receipt.queryChars).toBe(7)
})

it('warns at the project soft cap without deleting memory', () => {
  const result = inspectMemoryCapacity({ projectId: 'project-1', softLimit: 500 })
  expect(result).toMatchObject({ overLimit: true, action: 'review-required' })
  expect(listMemoryCandidates({ scopeId: 'project-1' })).toHaveLength(501)
})
```

- [ ] **Step 2: Confirm RED**

Run: `npm run test:run -- src/__tests__/memoryCandidates.test.js src/__tests__/agentContracts.test.js`

Expected: FAIL because no receipt/capacity contract exists.

- [ ] **Step 3: Implement bounded metadata**

Receipt fields are limited to request/task IDs, query length, memory IDs, source refs, score components, inclusion reason, char counts and timestamps. Do not persist query text, preview text, prompt, generated prose or content-derived fingerprints. `inspectMemoryCapacity()` counts pending + active per project, returns warning data at 500, and never archives/deletes.

Extend ContextLedger memory parts with `entryId`, `sourceRefs`, `included`, `truncated`, `warning`, and a structured `reason`; keep previews bounded by the existing limit. If the shared Agent ledger cannot represent excluded parts, extend its contract once rather than creating a memory-only inspector model.

- [ ] **Step 4: Verify and commit**

Run: `npm run test:run -- src/__tests__/memoryCandidates.test.js src/__tests__/agentContracts.test.js src/__tests__/gameStoreSession.test.js`

Expected: PASS; serialized ledger and receipt contain no full memory/source content.

```bash
git add src/services/memoryReceipt.js src/services/contextLedger.js src/services/memoryCandidates.js src/__tests__/memoryCandidates.test.js src/__tests__/agentContracts.test.js src/__tests__/gameStoreSession.test.js
git commit -m "feat(memory): record bounded recall receipts"
```

### Task 6: Implement the four trigger boundaries

**Files:**
- Create: `src/services/memoryTriggers.js`
- Modify: `src/services/agents/observers/authoringObserverDerivation.js`
- Modify: `src/stores/gameStore.js`
- Modify: `src/__tests__/authoringAgentWorkflows.test.js`
- Modify: `src/__tests__/gameStoreSession.test.js`

- [ ] **Step 1: Write failing trigger matrix tests**

```js
it.each([
  ['prose-commit', true],
  ['boundary', true],
  ['explicit', true],
  ['keystroke', false],
  ['cursor-move', false]
])('handles %s with derive=%s', async (type, shouldDerive) => {
  const calls = []
  const triggers = createMemoryTriggers({ derive: (payload) => calls.push(payload) })
  await triggers.handle({ type, projectId: 'p1', sourceRefs: ['chapter:1'], revision: 'r1' })
  expect(calls.length > 0).toBe(shouldDerive)
})

it('creates an explicit local candidate when the provider is unavailable', async () => {
  const result = await triggers.rememberExplicitly({
    content: '林昭害怕密闭空间。',
    projectId: 'p1',
    sourceRefs: ['user-action:remember:1'],
    confirm: false
  })
  expect(result.candidate).toMatchObject({ status: 'pending', derivedBy: 'explicit' })
})
```

- [ ] **Step 2: Confirm RED**

Run: `npm run test:run -- src/__tests__/authoringAgentWorkflows.test.js src/__tests__/gameStoreSession.test.js`

Expected: FAIL because a boundary harness does not exist.

- [ ] **Step 3: Implement the bounded harness**

`createMemoryTriggers()` accepts injected `derive`, `queue`, `invalidate`, `isAgentEnabled`, and clock dependencies. It handles only:

- `prose-commit`: schedule changed range immediately after AI transaction, or after saved manual checkpoint;
- `boundary`: flush the previous chapter/session once using a dedupe key;
- `explicit`: queue locally even when Agent is disabled; only optional semantic extraction requires Agent;
- `context-resolve`: delegated to Task 8, not a provider call.

Do not implement before-tool-call or uncertainty triggers. Do not scan an entire project. In `gameStore.commitAuthoringProseResult()`, emit the prose-commit trigger only after persistence succeeds. On undo, emit invalidation for the transaction source refs.

- [ ] **Step 4: Verify and commit**

Run: `npm run test:run -- src/__tests__/authoringAgentWorkflows.test.js src/__tests__/gameStoreSession.test.js src/__tests__/authoringUnifiedRuntimeWiring.test.js`

Expected: PASS; failed prose persistence schedules nothing and disabled Agent produces no automatic model request.

```bash
git add src/services/memoryTriggers.js src/services/agents/observers/authoringObserverDerivation.js src/stores/gameStore.js src/__tests__/authoringAgentWorkflows.test.js src/__tests__/gameStoreSession.test.js
git commit -m "feat(memory): trigger derivation at durable boundaries"
```

### Task 7: Persist observer memory output as controlled candidates

**Files:**
- Modify: `src/services/agents/observers/authoringObservationContract.js`
- Modify: `src/services/agents/observers/authoringObserverWorkflow.js`
- Modify: `src/services/agents/observers/authoringObserverDerivation.js`
- Modify: `src/services/memoryCandidates.js`
- Modify: `src/__tests__/authoringAgentWorkflows.test.js`
- Modify: `src/__tests__/authoringUnifiedRuntimeWiring.test.js`

- [ ] **Step 1: Write a failing observer-to-candidate integration test**

```js
it('queues valid observer memory as pending and reports conflicts as exceptions', async () => {
  const result = await runObserverMemoryDerivation({
    delta: { text: '林昭答应在天亮前返回。', sourceRefs: ['chapter:1:node:7'], revision: 'r7' },
    projectId: 'p1'
  })
  expect(result.queued[0]).toMatchObject({
    status: 'pending',
    authority: 'derived',
    sourceRevision: 'r7',
    derivedBy: 'prose-commit'
  })
  expect(result.exceptions.every((item) => item.type === 'memory-conflict')).toBe(true)
})

it('drops observer output returned after the source revision changes', async () => {
  const result = await runObserverMemoryDerivation(staleFixture)
  expect(result).toMatchObject({ status: 'stale', queued: [] })
})
```

- [ ] **Step 2: Confirm RED**

Run: `npm run test:run -- src/__tests__/authoringAgentWorkflows.test.js src/__tests__/authoringUnifiedRuntimeWiring.test.js`

Expected: FAIL because derived observations are not normalized into the v2 memory repository contract.

- [ ] **Step 3: Add the candidate adapter**

Normalize each observation to allowed kind/content/sourceRefs/sourceRevision/signals. Reject invented IDs, missing source refs, over-limit content and invalid kinds. Queue valid candidates through `queueMemoryCandidate()`; do not write storage from the workflow itself. Duplicate results are skipped, similar results link to the existing entry, conflicts become typed exceptions. A partial batch returns `{ queued, skipped, exceptions }` and never discards valid siblings.

- [ ] **Step 4: Verify and commit**

Run: `npm run test:run -- src/__tests__/authoringAgentWorkflows.test.js src/__tests__/authoringUnifiedRuntimeWiring.test.js src/__tests__/memoryCandidates.test.js`

Expected: PASS; observer timeout and invalid output never affect prose or active canon.

```bash
git add src/services/agents/observers/authoringObservationContract.js src/services/agents/observers/authoringObserverWorkflow.js src/services/agents/observers/authoringObserverDerivation.js src/services/memoryCandidates.js src/__tests__/authoringAgentWorkflows.test.js src/__tests__/authoringUnifiedRuntimeWiring.test.js
git commit -m "feat(memory): queue observer-derived memory candidates"
```

### Task 8: Make ProjectKnowledgeFacade the automatic recall owner

**Files:**
- Create: `src/services/project/projectMemoryReader.js`
- Modify: `src/services/project/projectKnowledgeFacade.js`
- Modify: `src/services/agents/agentContextResolver.js`
- Modify: `src/services/agents/tools/memoryLookup.js`
- Modify: `shared/agentContextProfiles.js`
- Modify: `src/__tests__/projectKnowledgeFacade.test.js`
- Modify: `src/__tests__/authoringUnifiedRuntimeWiring.test.js`

- [ ] **Step 1: Write failing facade and isolation tests**

```js
it('resolves current active memory through the project facade before authoring execution', async () => {
  const facade = createProjectKnowledgeFacade({
    projectId: 'p1',
    projectRevision: 'r9',
    readers: { memory: createProjectMemoryReader(memoryRepository) }
  })
  const result = await resolveAgentContext({
    taskId: 'authoring.continue',
    request: { target: { revision: 'r9' }, intent: { query: '林昭为什么要回来' } },
    facade
  })
  expect(result.envelope.blocks.some((block) => block.kind === 'memory')).toBe(true)
  expect(result.ledger.parts).toEqual(expect.arrayContaining([
    expect.objectContaining({ kind: 'memory', included: true, sourceRefs: ['chapter:1:node:7'] })
  ]))
})

it('records excluded memory without leaking another project', async () => {
  const result = await resolveFixtureForProject('p1')
  expect(JSON.stringify(result.envelope)).not.toContain('other-project-secret')
  expect(result.ledger.parts.some((part) => part.reason === 'scope')).toBe(true)
})
```

- [ ] **Step 2: Confirm RED**

Run: `npm run test:run -- src/__tests__/projectKnowledgeFacade.test.js src/__tests__/authoringUnifiedRuntimeWiring.test.js`

Expected: FAIL because memory is not a first-class facade reader with retrieval metadata.

- [ ] **Step 3: Implement the reader and shared lookup path**

`createProjectMemoryReader(repository)` receives the request query, target IDs and current source revisions, calls `rankMemoryCandidates()`, and returns blocks carrying `content`, `authority`, `sourceRefs`, `entryId`, score, included/reason metadata. `resolveAgentContext()` must preserve excluded/truncated ledger entries without serializing excluded content into the envelope.

Add `memory` only to context profiles that need project continuity: narrative state, local rewrite/review when the selection references entities, and observer profiles when comparing prior state. Do not add memory to unrelated Settings import or media tasks.

Refactor `executeMemoryLookup()` to call the same reader/ranking policy for second-round tool lookup. The tool may use a narrower query or `get` by authorized ID, but cannot widen project/session scope.

- [ ] **Step 4: Verify and commit**

Run:

```bash
npm run test:run -- src/__tests__/projectKnowledgeFacade.test.js src/__tests__/authoringUnifiedRuntimeWiring.test.js src/__tests__/gameStoreSession.test.js src/__tests__/agentContracts.test.js
```

Expected: PASS; envelope and ledger share the same memory IDs and no other-project content appears.

```bash
git add src/services/project/projectMemoryReader.js src/services/project/projectKnowledgeFacade.js src/services/agents/agentContextResolver.js src/services/agents/tools/memoryLookup.js shared/agentContextProfiles.js src/__tests__/projectKnowledgeFacade.test.js src/__tests__/authoringUnifiedRuntimeWiring.test.js src/__tests__/gameStoreSession.test.js src/__tests__/agentContracts.test.js
git commit -m "feat(memory): resolve recall through project knowledge facade"
```

### Task 9: Add low-interruption Authoring memory review

**Files:**
- Create: `src/components/authoring/AuthoringMemoryNotice.vue`
- Create: `src/components/authoring/AuthoringMemoryReview.vue`
- Modify: `src/pages/Authoring.vue`
- Modify: `src/pages/Writing.scoped.css`
- Modify: `src/__tests__/uiControlContract.test.js`
- Modify: `src/__tests__/authoringWorkspace.test.js`

- [ ] **Step 1: Read the UI skill and write failing contracts**

Before editing UI, read `agent-skills/ui-style-check/SKILL.md` and reuse existing transient-layer/focus/scroll-lock patterns.

```js
it('shows a transient candidate count and reserves review for exceptions', async () => {
  const source = await readFile(new URL('../pages/Authoring.vue', import.meta.url), 'utf8')
  expect(source).toContain('<AuthoringMemoryNotice')
  expect(source).toContain('<AuthoringMemoryReview')
  expect(source).not.toMatch(/memory-confirm-modal-per-candidate/)
})

it('supports explicit remember without requiring a provider', async () => {
  const wrapper = mountAuthoring({ providerAvailable: false, selection: '林昭害怕密闭空间。' })
  await wrapper.get('[data-action="remember-selection"]').trigger('click')
  expect(memoryRepository.list({ status: 'pending' })).toHaveLength(1)
  expect(wrapper.text()).toContain('已加入记忆候选')
})
```

- [ ] **Step 2: Confirm RED**

Run: `npm run test:run -- src/__tests__/uiControlContract.test.js src/__tests__/authoringWorkspace.test.js`

Expected: FAIL because the Authoring memory projection is absent.

- [ ] **Step 3: Implement the minimal projection**

`AuthoringMemoryNotice` is a polite, auto-dismissed status with one “查看” action. `AuthoringMemoryReview` reuses the existing transient-layer coordinator and shows only pending conflicts, stale sources and ambiguous identities by default. It provides confirm/reject, pin/demote, supersede/merge and source jump actions through repository APIs.

Add “记住选区” to the existing selection command surface, not as a new global toolbar. Normal observer candidates do not open the panel. The context inspector renders the actual memory ledger rows with included/excluded reason and bounded score explanation. Do not show raw prompts or an internal Agent persona list.

Responsive requirements:

- 1440/1024: narrow review rail or existing inspector region, editor width remains primary;
- 390 and 200% effective zoom: one bottom sheet, one scroll owner, 44px close/action targets;
- Escape closes and restores focus; focus is trapped; body scroll locks only while the sheet is open;
- use existing color tokens and breakpoints; add no new hard-coded theme color.

- [ ] **Step 4: Run UI contracts and commit**

Run: `npm run test:run -- src/__tests__/uiControlContract.test.js src/__tests__/authoringWorkspace.test.js src/__tests__/memoryCandidates.test.js`

Expected: PASS; normal candidate creation does not interrupt editor focus.

```bash
git add src/components/authoring/AuthoringMemoryNotice.vue src/components/authoring/AuthoringMemoryReview.vue src/pages/Authoring.vue src/pages/Writing.scoped.css src/__tests__/uiControlContract.test.js src/__tests__/authoringWorkspace.test.js
git commit -m "feat(authoring): review controlled memory exceptions"
```

### Task 10: Release gates, documentation and handoff

**Files:**
- Modify: `docs/STATUS.md`
- Modify: `docs/PLAN.md`
- Modify: `docs/LOG.md`
- Modify: `docs/src/known-issues.md`
- Modify: `docs/plan/pinax-integrated-product-roadmap.md`
- Create: `docs/agent-runs/2026-08-22-controlled-project-memory/summary.md`

- [ ] **Step 1: Run focused memory/runtime verification**

```bash
npm run test:run -- src/__tests__/memoryCandidates.test.js src/__tests__/authoringAgentWorkflows.test.js src/__tests__/authoringUnifiedRuntimeWiring.test.js src/__tests__/projectKnowledgeFacade.test.js src/__tests__/gameStoreSession.test.js src/__tests__/agentContracts.test.js src/__tests__/authoringWorkspace.test.js src/__tests__/uiControlContract.test.js
```

Expected: PASS with no skipped tests introduced by this plan.

- [ ] **Step 2: Run deterministic narrative gates**

```bash
npm run smoke:narrative-recovery
npm run smoke:narrative-production -- --dry-run
```

Expected: exit 0; production dry-run keeps its declared fixture count and memory lookup remains project-scoped.

- [ ] **Step 3: Run full verification**

```bash
npm run verify:full
```

Expected: exit 0 for Vitest, Vite build, diff check and VitePress build. Record actual test counts in the summary; do not copy counts from an earlier run.

- [ ] **Step 4: Run live browser audit only against an existing service**

First inspect without starting or restarting a user server:

```bash
pgrep -af 'vite|server/index.js|npm run dev|npm run server'
```

If an existing compatible service is available, run the repository UI audit for Authoring at 1440, 1024 and 390, then manually verify 200% effective zoom, keyboard focus, selection remember, exception review, context explanation, overflow and console/a11y results. If none exists, record the live UI gate as **not run**; do not claim it passed.

- [ ] **Step 5: Run real-provider matrix only when credentials/service already exist**

Cover MiniMax, OpenAI-compatible and Anthropic-compatible for:

- prose commit produces bounded pending memory candidates;
- changed revision rejects late observer output;
- relevant active memory enters Authoring continue;
- unrelated/stale/pending memory stays excluded;
- provider timeout leaves prose and active memory unchanged;
- Agent off causes zero automatic extraction requests.

If credentials are unavailable, record the matrix as an external release gate, not a code failure and not a pass.

- [ ] **Step 6: Update canonical documentation**

Document:

- memory is a controlled derived layer under ProjectKnowledgeFacade;
- schema v2 and v1 compatibility;
- four trigger boundaries;
- lexical explainable retrieval and explicit non-goals;
- exact verification evidence;
- any unrun live-provider/browser gates;
- Experience remains until Authoring parity and memory gates pass.

- [ ] **Step 7: Commit the release handoff**

```bash
git add docs/STATUS.md docs/PLAN.md docs/LOG.md docs/src/known-issues.md docs/plan/pinax-integrated-product-roadmap.md docs/agent-runs/2026-08-22-controlled-project-memory/summary.md
git commit -m "docs(memory): record controlled memory rollout"
```

## Final acceptance checklist

- [ ] Gate A proves every Authoring command uses the canonical runtime.
- [ ] Legacy v1 memories remain readable; new writes use schema v2.
- [ ] Every derived durable memory has source refs and a source revision.
- [ ] Only active, current, authorized memories enter model context.
- [ ] Retrieval is lexical/explainable and does not use content hashes as vectors.
- [ ] Recall count does not alter authority, importance or primary ranking.
- [ ] Source edits/undo stale affected memories before recomputation.
- [ ] Observer failure never blocks or rolls back prose.
- [ ] Normal candidates are non-interrupting; only exceptions request attention.
- [ ] Context inspector reflects the actual execution ledger.
- [ ] No complete prompt, duplicate manuscript or hidden reasoning is persisted.
- [ ] No embedding, automatic archive, Self-RAG, PPR or Agent-editable core memory was introduced.
- [ ] Focused, smoke and full verification evidence is recorded.
- [ ] Unavailable live UI/provider gates are explicitly marked not run.
