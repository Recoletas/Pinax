import { describe, expect, it, vi } from 'vitest'
import { createAuthoringProjectAdapter } from '../services/agents/authoring/authoringProjectAdapter.js'
import { createAuthoringTextWorkflow } from '../services/agents/authoring/authoringTextWorkflow.js'
import {
  createAuthoringTaskDispatcher,
  getAuthoringAliasMetricSnapshot,
  resetAuthoringAliasMetric
} from '../services/agents/authoring/authoringTaskDispatcher.js'
import { createNarrativeSceneWorkflow } from '../services/agents/authoring/narrativeSceneWorkflow.js'
import { createAuthoringAuxiliaryWorkflow } from '../services/agents/authoring/authoringAuxiliaryWorkflow.js'
import { createLegacyExperienceStateBridge } from '../services/agents/authoring/legacyExperienceStateBridge.js'
import { normalizeObservation } from '../services/agents/observers/authoringObservationContract.js'
import { createAuthoringObserverWorkflow } from '../services/agents/observers/authoringObserverWorkflow.js'
import { createAuthoringObserverScheduler } from '../services/agents/observers/authoringObserverScheduler.js'
import { createMemoryTriggers } from '../services/memoryTriggers.js'
import { runObserverMemoryDerivation, createAuthoringObserverRunner } from '../services/agents/observers/authoringObserverDerivation.js'
import { listMemoryCandidates } from '../services/memoryCandidates.js'

describe('authoring project adapter', () => {
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
})

describe('authoring text workflow', () => {
  {
const casesK2 = [
    ['authoring.insert', 'insert', 'direct-text'],
    ['authoring.rewrite', 'rewrite', 'review-draft'],
    ['authoring.expand', 'expand', 'review-draft'],
    ['authoring.shorten', 'shorten', 'review-draft'],
    ['authoring.complete.inline', 'completeInline', 'ephemeral'],
    ['authoring.review.selection', 'reviewSelection', 'review-only'],
    ['authoring.review.chapter', 'reviewChapter', 'review-only']
  ]
it('maps %s to %s with %s policy' + '（参数组合并）', async () => {
  const failuresK2 = []
  for (const [caseIndexK2, caseValueK2] of casesK2.entries()) {
    const rowK2 = Array.isArray(caseValueK2) ? caseValueK2 : [caseValueK2]
    try { await (async (taskId, method, effectPolicy) => {
    const services = Object.fromEntries(['insert', 'rewrite', 'expand', 'shorten', 'completeInline', 'reviewSelection', 'reviewChapter'].map((name) => [name, vi.fn(async () => ({ text: name }))]))
    const workflow = createAuthoringTextWorkflow(services)
    const result = await workflow.run({ task: { id: taskId, effectPolicy }, request: { target: { revision: 'r1' }, intent: {} }, context: { envelope: {} } })
    expect(services[method]).toHaveBeenCalledOnce()
    expect(result.effectPolicy).toBe(effectPolicy)
  })(...rowK2) } catch (errorK2) { failuresK2.push('#' + caseIndexK2 + ': ' + (errorK2 && errorK2.message)) }
  }
  if (failuresK2.length) throw new Error(failuresK2.join('\n'))
})
}

  it('keeps review and ephemeral results as suggestions without direct text actions', async () => {
    const services = Object.fromEntries(['insert', 'rewrite', 'completeInline', 'reviewChapter'].map((name) => [name, vi.fn(async () => ({ text: `${name}-正文` }))]))
    const workflow = createAuthoringTextWorkflow(services)
    const review = await workflow.run({ task: { id: 'authoring.review.chapter', effectPolicy: 'review-only' }, request: { target: { revision: 'r1' }, intent: {} }, context: { envelope: {} } })
    expect(review.actions).toEqual([])
    expect(review.suggestions).toEqual([expect.objectContaining({ type: 'text', content: 'reviewChapter-正文' })])
    const ephemeral = await workflow.run({ task: { id: 'authoring.complete.inline', effectPolicy: 'ephemeral' }, request: { target: { revision: 'r1' }, intent: {} }, context: { envelope: {} } })
    expect(ephemeral.actions).toEqual([])
    const direct = await workflow.run({ task: { id: 'authoring.insert', effectPolicy: 'direct-text' }, request: { target: { revision: 'r7' }, intent: {} }, context: { envelope: {} } })
    expect(direct.suggestions).toEqual([])
    expect(direct.actions).toEqual([expect.objectContaining({ type: 'text-insert', content: 'insert-正文', baseRevision: 'r7' })])
    expect(await workflow.run({ task: { id: 'authoring.rewrite', effectPolicy: 'review-draft' }, request: { target: { revision: 'r9' }, intent: {} }, context: { envelope: {} } }).then((result) => result.actions[0]))
      .toMatchObject({ type: 'text-patch', baseRevision: 'r9' })
  })
})

describe('authoring task dispatcher', () => {
  it('resolves legacy advisor aliases to canonical ids and records the alias metric once per request', async () => {
    resetAuthoringAliasMetric()
    const textWorkflow = createAuthoringTextWorkflow({
      rewrite: vi.fn(async () => ({ text: '改写后的句子。' }))
    })
    const dispatcher = createAuthoringTaskDispatcher({
      workflows: {
        text: textWorkflow
      }
    })

    await dispatcher.run({
      taskId: 'advisor.fix.selection',
      request: { target: { revision: 'r2' }, intent: {} },
      context: { envelope: {} }
    })

    const metric = getAuthoringAliasMetricSnapshot()
    expect(metric['advisor.fix.selection->authoring.rewrite']).toBe(1)

    await dispatcher.run({
      taskId: 'authoring.rewrite',
      request: { target: { revision: 'r2' }, intent: {} },
      context: { envelope: {} }
    })
    expect(getAuthoringAliasMetricSnapshot()['advisor.fix.selection->authoring.rewrite']).toBe(1)
    expect(Object.keys(getAuthoringAliasMetricSnapshot())).not.toContain('authoring.rewrite->authoring.rewrite')
  })
})

describe('narrative scene workflow', () => {
  {
const casesK3 = [
    ['authoring.continue', 'continue'],
    ['authoring.advance', 'advance'],
    ['authoring.simulate.character', 'character'],
    ['authoring.simulate.scene', 'scene'],
    ['authoring.trigger', 'trigger']
  ]
it('runs %s through one isolated NarrativeKernel turn' + '（参数组合并）', async () => {
  const failuresK3 = []
  for (const [caseIndexK3, caseValueK3] of casesK3.entries()) {
    const rowK3 = Array.isArray(caseValueK3) ? caseValueK3 : [caseValueK3]
    try { await (async (taskId, intentMode) => {
    const runTurn = vi.fn(async () => ({ text: '林昭推开门。', trace: { planningTranscript: 'discarded' } }))
    const workflow = createNarrativeSceneWorkflow({ runTurn })
    const narrativeContext = { messages: [{ role: 'assistant', content: '旧港仍在涨潮。' }], sceneSummary: null }
    const result = await workflow.run({ task: { id: taskId }, request: { target: { revision: 'r3' }, intent: { narrativeContext } }, context: { envelope: {} } })
    expect(runTurn).toHaveBeenCalledWith(expect.objectContaining({ intentMode, narrativeContext }))
    expect(result.actions).toEqual([expect.objectContaining({ type: 'text-insert', content: '林昭推开门。' })])
    expect(JSON.stringify(result)).not.toContain('planningTranscript')
  })(...rowK3) } catch (errorK3) { failuresK3.push('#' + caseIndexK3 + ': ' + (errorK3 && errorK3.message)) }
  }
  if (failuresK3.length) throw new Error(failuresK3.join('\n'))
})
}

  it('rejects unknown narrative tasks without invoking the kernel turn', async () => {
    const runTurn = vi.fn()
    const workflow = createNarrativeSceneWorkflow({ runTurn })
    await expect(workflow.run({ task: { id: 'settings.import.extract' }, request: { target: { revision: 'r1' }, intent: {} }, context: { envelope: {} } }))
      .rejects.toMatchObject({ code: 'AGENT_TASK_UNKNOWN' })
    expect(runTurn).not.toHaveBeenCalled()
  })
})

describe('authoring auxiliary workflow', () => {
  {
const casesK4 = [
    ['authoring.next-actions', 'nextActions'],
    ['authoring.dialogue-options', 'dialogueOptions'],
    ['authoring.emergence', 'emergence'],
    ['authoring.context.compact', 'compactContext'],
    ['authoring.asset.summarize', 'summarizeAsset']
  ]
it('routes %s to %s without narrative agent looping' + '（参数组合并）', async () => {
  const failuresK4 = []
  for (const [caseIndexK4, caseValueK4] of casesK4.entries()) {
    const rowK4 = Array.isArray(caseValueK4) ? caseValueK4 : [caseValueK4]
    try { await (async (taskId, method) => {
    const services = Object.fromEntries(['nextActions', 'dialogueOptions', 'emergence', 'compactContext', 'summarizeAsset'].map((name) => [name, vi.fn(async () => ({ value: name }))]))
    const workflow = createAuthoringAuxiliaryWorkflow(services)
    await workflow.run({ task: { id: taskId }, request: { target: { revision: 'r1' }, intent: {} }, context: { envelope: {} } })
    expect(services[method]).toHaveBeenCalledOnce()
  })(...rowK4) } catch (errorK4) { failuresK4.push('#' + caseIndexK4 + ': ' + (errorK4 && errorK4.message)) }
  }
  if (failuresK4.length) throw new Error(failuresK4.join('\n'))
})
}

  it('normalizes auxiliary outputs to typed suggestions, candidates, derived upserts and asset drafts', async () => {
    const services = {
      nextActions: vi.fn(async () => ({ options: [{ label: '追出去' }, { label: '留在原地' }] })),
      dialogueOptions: vi.fn(async () => ({ options: [{ label: '质问褚岩' }] })),
      emergence: vi.fn(async () => ({ candidate: { id: 'cand-1', title: '边境冲突' } })),
      compactContext: vi.fn(async () => ({ summary: '压缩后的记忆摘要。', newHistory: [] })),
      summarizeAsset: vi.fn(async () => ({ assets: [{ kind: 'event', title: '事件', content: '发生了冲突。' }] }))
    }
    const workflow = createAuthoringAuxiliaryWorkflow(services)
    const run = (taskId) => workflow.run({ task: { id: taskId }, request: { target: { revision: 'r1' }, intent: {} }, context: { envelope: {} } })

    const nextActions = await run('authoring.next-actions')
    expect(nextActions.suggestions).toHaveLength(2)
    expect(nextActions.actions).toEqual([])

    const emergence = await run('authoring.emergence')
    expect(emergence.candidates).toEqual([expect.objectContaining({ id: 'cand-1' })])

    const compact = await run('authoring.context.compact')
    expect(compact.derivedUpsert).toMatchObject({ kind: 'memory-summary' })

    const assets = await run('authoring.asset.summarize')
    expect(assets.assetDrafts).toEqual([expect.objectContaining({ kind: 'event', title: '事件' })])
  })
})

describe('authoring observer workflow', () => {
  it("auto-commits routine derived facts and surfaces locked conflicts（合并3例）", async () => {
{
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
}
{
const applyDerived = vi.fn(async () => ({ revision: 'derived-r4' }))
    const workflow = createAuthoringObserverWorkflow({ derive: vi.fn(async () => ({
      observations: [
        { id: 'o3', kind: 'identity', ambiguous: true, text: '两个“先生”指代不明' },
        { id: 'o4', kind: 'event', destructiveRetcon: true, text: '删除了已确认的沉船事件' },
        { id: 'o5', kind: 'place', authority: 'derived', text: '林昭常去码头' }
      ]
    })), applyDerived })
    const result = await workflow.run({ task: { id: 'observer.entities.derive' }, request: { target: { revision: 'doc-r3' }, intent: {} }, context: { envelope: {} } })
    expect(result.exceptions).toEqual(expect.arrayContaining([
      expect.objectContaining({ observationId: 'o3', reason: 'identity-ambiguity' }),
      expect.objectContaining({ observationId: 'o4', reason: 'destructive-retcon' })
    ]))
    expect(applyDerived).toHaveBeenCalledTimes(1)
    const [routine] = applyDerived.mock.calls[0]
    expect(routine).toEqual([expect.objectContaining({ id: 'o5' })])
}
{
const observation = normalizeObservation({
      id: 'o9',
      kind: 'relation',
      authority: 'locked',
      text: '林昭信任顾远',
      sourceRefs: ['turn:t8', 'turn:t8', 'chapter:c2'],
      baseRevision: 'doc-r5'
    })
    expect(observation).toMatchObject({
      id: 'o9',
      kind: 'relation',
      authority: 'derived',
      baseRevision: 'doc-r5',
      conflictsWith: null
    })
    expect(observation.sourceRefs).toEqual(['turn:t8', 'chapter:c2'])
    expect(Object.isFrozen(observation)).toBe(true)
}
})
})

describe('authoring observer scheduler', () => {
  it("coalesces by document revision, waits for editor idle, and cancels superseded work（合并4例）", async () => {
{
vi.useFakeTimers()
    try {
      const run = vi.fn(async (delta) => ({ status: 'completed', applied: delta.documentRevision }))
      const scheduler = createAuthoringObserverScheduler({ run, idleDelayMs: 500 })

      scheduler.scheduleObservers({ documentId: 'doc-1', documentRevision: 'doc-r1', text: '第一版。' })
      scheduler.scheduleObservers({ documentId: 'doc-1', documentRevision: 'doc-r2', text: '第二版正文更长。' })
      scheduler.scheduleObservers({ documentId: 'doc-2', documentRevision: 'doc2-r1', text: '另一章。' })

      await vi.advanceTimersByTimeAsync(400)
      expect(run).not.toHaveBeenCalled()

      await vi.advanceTimersByTimeAsync(200)
      expect(run).toHaveBeenCalledTimes(2)
      const revisions = run.mock.calls.map((call) => call[0].documentRevision).sort()
      expect(revisions).toEqual(['doc-r2', 'doc2-r1'])
      expect(revisions).not.toContain('doc-r1')
    } finally {
      vi.useRealTimers()
    }
}
{
vi.useFakeTimers()
    try {
      let releaseRun
      const run = vi.fn(() => new Promise((resolve) => { releaseRun = resolve }))
      const onResult = vi.fn()
      const scheduler = createAuthoringObserverScheduler({ run, idleDelayMs: 100, onResult })

      // Scheduling returns synchronously — persistence never awaits observer work.
      const scheduleResult = scheduler.scheduleObservers({ documentId: 'doc-9', documentRevision: 'doc-r1', text: '提交的正文。' })
      expect(scheduleResult.accepted).toBe(true)
      expect(scheduler.pendingCount()).toBe(1)

      // Superseding the pending delta cancels the queued revision before idle elapses.
      scheduler.scheduleObservers({ documentId: 'doc-9', documentRevision: 'doc-r2', text: '更新后的正文。' })
      expect(scheduler.pendingCount()).toBe(1)
      await vi.advanceTimersByTimeAsync(150)
      expect(run).toHaveBeenCalledTimes(1)
      expect(run.mock.calls[0][0].documentRevision).toBe('doc-r2')

      // A stale derive outcome produces zero downstream writes.
      releaseRun?.({ status: 'stale' })
      await vi.advanceTimersByTimeAsync(0)
      expect(onResult).not.toHaveBeenCalled()
      expect(scheduler.pendingCount()).toBe(0)

      const staleScheduler = createAuthoringObserverScheduler({
        run: async () => ({ status: 'completed' }),
        idleDelayMs: 10,
        onResult
      })
      staleScheduler.scheduleObservers({ documentId: 'doc-x', documentRevision: 'old-rev', expectedRevision: 'new-rev' })
      await vi.advanceTimersByTimeAsync(50)
      expect(staleScheduler.pendingCount()).toBe(0)
      expect(onResult).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
}
{
const calls = []
    const scheduler = createAuthoringObserverScheduler({
      invalidate: async (delta) => calls.push(['invalidate', delta.revision]),
      run: async (delta) => calls.push(['run', delta.revision])
    })
    scheduler.schedule({ sourceRefs: ['chapter:1:node:7'], revision: 'rev-3' })
    await scheduler.flush()
    expect(calls).toEqual([['invalidate', 'rev-3'], ['run', 'rev-3']])
}
{
const calls = []
    const scheduler = createAuthoringObserverScheduler({
      invalidate: async () => { throw new Error('invalidate-failed') },
      run: async (delta) => calls.push(['run', delta.revision])
    })
    scheduler.schedule({ sourceRefs: ['chapter:1'], revision: 'rev-4' })
    const results = await scheduler.flush()
    expect(calls).toEqual([])
    expect(results[0].ok).toBe(false)
    expect(results[0].stage).toBe('invalidate')
}
})
})

describe('legacy experience state bridge', () => {
  it("commits one prose result before scheduling derived observations（合并2例）", async () => {
{
const insertText = vi.fn(async () => ({ revision: 'doc-r4' }))
    const scheduleObservers = vi.fn()
    const bridge = createLegacyExperienceStateBridge({ insertText, scheduleObservers })
    await bridge.commitNarrativeResult({ text: '林昭推开门。', baseRevision: 'doc-r3', sourceRefs: ['turn:t8'] })
    expect(insertText).toHaveBeenCalledOnce()
    expect(scheduleObservers).toHaveBeenCalledWith(expect.objectContaining({ documentRevision: 'doc-r4' }))
    expect(insertText.mock.invocationCallOrder[0]).toBeLessThan(scheduleObservers.mock.invocationCallOrder[0])
}
{
const insertText = vi.fn(async () => { throw new Error('persist-failed') })
    const scheduleObservers = vi.fn()
    const bridge = createLegacyExperienceStateBridge({ insertText, scheduleObservers })
    await expect(bridge.commitNarrativeResult({ text: '正文。', baseRevision: 'doc-r1', sourceRefs: [] }))
      .rejects.toMatchObject({ message: 'persist-failed' })
    expect(scheduleObservers).not.toHaveBeenCalled()
}
})
})

describe('memory trigger boundaries', () => {
  {
const casesK5 = [
    ['prose-commit', true],
    ['boundary', true],
    ['explicit', true],
    ['keystroke', false],
    ['cursor-move', false]
  ]
it('handles %s with derive=%s' + '（参数组合并）', async () => {
  const failuresK5 = []
  for (const [caseIndexK5, caseValueK5] of casesK5.entries()) {
    const rowK5 = Array.isArray(caseValueK5) ? caseValueK5 : [caseValueK5]
    try { await (async (type, shouldDerive) => {
    const calls = []
    const triggers = createMemoryTriggers({ derive: (payload) => calls.push(payload) })
    await triggers.handle({ type, projectId: 'p1', sourceRefs: ['chapter:1'], revision: 'r1' })
    expect(calls.length > 0).toBe(shouldDerive)
  })(...rowK5) } catch (errorK5) { failuresK5.push('#' + caseIndexK5 + ': ' + (errorK5 && errorK5.message)) }
  }
  if (failuresK5.length) throw new Error(failuresK5.join('\n'))
})
}

  it("creates an explicit local candidate when the provider is unavailable（合并4例）", async () => {
{
const triggers = createMemoryTriggers({ derive: vi.fn(), isAgentEnabled: () => false, queue: (candidate) => ({ success: true, candidate }) })
    const result = await triggers.rememberExplicitly({
      content: '林昭害怕密闭空间。',
      projectId: 'p1',
      sourceRefs: ['user-action:remember:1'],
      confirm: false
    })
    expect(result.candidate).toMatchObject({ status: 'pending', derivedBy: 'explicit' })
}
{
const derive = vi.fn()
    const queued = []
    const triggers = createMemoryTriggers({
      derive,
      isAgentEnabled: () => false,
      queue: (input) => { queued.push(input); return { success: true } }
    })
    await triggers.rememberExplicitly({
      content: '林昭害怕密闭空间。',
      projectId: 'p1',
      sourceRefs: ['user-action:remember:1']
    })
    expect(derive).not.toHaveBeenCalled()
    expect(queued).toHaveLength(1)
}
{
const revisions = []
    const triggers = createMemoryTriggers({ derive: async (payload) => revisions.push(payload.revision) })
    await triggers.handle({ type: 'boundary', projectId: 'p1', sessionId: 's1', revision: 'r9' })
    await triggers.handle({ type: 'boundary', projectId: 'p1', sessionId: 's1', revision: 'r9' })
    expect(revisions).toEqual(['r9'])
    await triggers.handle({ type: 'boundary', projectId: 'p1', sessionId: 's1', revision: 'r10' })
    expect(revisions).toEqual(['r9', 'r10'])
}
{
const derive = vi.fn()
    const triggers = createMemoryTriggers({ derive })
    const result = await triggers.handle({ type: 'context-resolve', projectId: 'p1' })
    expect(result.handled).toBe(false)
    expect(result.reason).toBe('delegated-to-facade')
    expect(derive).not.toHaveBeenCalled()
}
})

  it('emits invalidation for undo source refs before recomputation', async () => {
    const invalidated = []
    const triggers = createMemoryTriggers({ invalidate: (delta) => invalidated.push(delta) })
    await triggers.invalidate({ sourceRefs: ['chapter:1:node:7'], revision: 'rev-3', reason: 'prose-undo' })
    expect(invalidated[0]).toMatchObject({
      sourceRefs: ['chapter:1:node:7'],
      revision: 'rev-3',
      reason: 'prose-undo'
    })
  })
})

describe('observer memory to controlled candidates', () => {
  it("queues valid observer memory as pending and reports conflicts as exceptions（合并4例）", async () => {
{
localStorage.removeItem('pinax.memoryCandidates')
    const result = await runObserverMemoryDerivation({
      delta: { text: '林昭答应在天亮前返回。', sourceRefs: ['chapter:1:node:7'], revision: 'r7' },
      projectId: 'p1'
    })
    expect(result.status).toBe('completed')
    expect(result.queued[0]).toMatchObject({
      status: 'pending',
      authority: 'derived',
      sourceRevision: 'r7',
      derivedBy: 'prose-commit'
    })
    expect(result.queued[0].sourceRefs).toEqual(['chapter:1:node:7'])
    expect(result.exceptions.every((item) => item.type === 'memory-conflict')).toBe(true)
}
{
localStorage.removeItem('pinax.memoryCandidates')
    const result = await runObserverMemoryDerivation({
      delta: {
        text: '迟到的观察输出。',
        sourceRefs: ['chapter:1:node:7'],
        revision: 'old-rev',
        expectedRevision: 'new-rev'
      },
      projectId: 'p1'
    })
    expect(result).toMatchObject({ status: 'stale', queued: [] })
}
{
localStorage.removeItem('pinax.memoryCandidates')
    const result = await runObserverMemoryDerivation({
      delta: {
        text: '林昭在钟楼顶层点起了灯。',
        sourceRefs: [],
        revision: 'r8'
      },
      projectId: 'p1'
    })
    expect(result.status).toBe('completed')
    expect(result.queued).toHaveLength(0)
    expect(result.skipped.length).toBeGreaterThan(0)

    const longText = '很'.repeat(400) + '。'
    const longResult = await runObserverMemoryDerivation({
      delta: { text: longText, sourceRefs: ['chapter:3:node:1'], revision: 'r9' },
      projectId: 'p1'
    })
    expect(longResult.queued).toHaveLength(0)
    expect(longResult.skipped.every((item) => item.reason === 'content-over-limit')).toBe(true)
}
{
localStorage.removeItem('pinax.memoryCandidates')
    const applied = []
    const runner = createAuthoringObserverRunner({
      applyDerived: async (routine) => {
        applied.push(routine.length)
        return { count: routine.length }
      },
      memoryTarget: { projectId: 'p1' }
    })
    const result = await runner.run({
      documentId: 'doc-1',
      documentRevision: 'doc-r7',
      text: '林昭答应在天亮前返回。第二天清晨他真的回来了。',
      sourceRefs: ['turn:t8', 'chapter:c2'],
      knownNames: ['林昭'],
      lockedFacts: []
    })
    expect(result.status).toBe('completed')
    expect(result.memoryQueued).toBeGreaterThanOrEqual(1)
    const stored = listMemoryCandidates({ status: 'pending' })
    expect(stored.length).toBeGreaterThanOrEqual(1)
    expect(stored[0].sourceRevision).toBe('doc-r7')
    expect(stored[0].sourceRefs).toEqual(['turn:t8', 'chapter:c2'])
}
})
})
