import { describe, expect, it, vi } from 'vitest'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createNarrativeSceneWorkflow } from '../services/agents/authoring/narrativeSceneWorkflow.js'
import {
  AUTHORING_NARRATIVE_RUN_ERROR_CODES,
  createAuthoringNarrativeRun
} from '../services/agents/authoring/authoringNarrativeRun.js'
import { createAuthoringCommandRuntime } from '../services/agents/authoring/authoringRuntime.js'
import { applyAgentResultTransaction } from '../services/agents/agentResultTransaction.js'
import { shouldDispatchAuthoringObservers } from '../services/agents/authoring/authoringObserverDispatch.js'
import {
  AUTHORING_TURN_TASK_IDS,
  buildAuthoringTurnIntent,
  proseContainsControlIntent
} from '../services/agents/authoring/authoringTurnContract.js'
import {
  applyAuthoringText,
  buildDocumentRevision,
  fingerprintDocument,
  undoAuthoringText
} from '../services/agents/authoring/authoringTextTransaction.js'
import { useAuthoringTask } from '../composables/useAuthoringTask.js'
import { createWritingDocument, getWritingDocumentMarkdown, validateWritingDocument } from '../services/writing/writingDocumentSchema.js'
import {
  appendAuthoringTurnToDocument,
  buildAuthoringTurnOriginRef,
  insertAuthoringTurnAfterUnit
} from '../services/writing/writingAuthoringTurnImport.js'

// Plan Task 2.3：下一拍输入 → 统一运行时链 → NarrativeKernel → 正文事务。
// 一个回合 = 一次请求 + 原子插入一个新 writingUnit + 瞬时来源 + 单次请求级撤销
// + 观察器调度一次；控制文本绝不进入正文；请求期间文档变化则丢弃结果。

const DOC_TEXT = '潮水漫过台阶，林昭站在岸边。'

function makeTurn(overrides = {}) {
  const result = buildAuthoringTurnIntent({
    kind: 'action',
    actorId: 'char_lina',
    instruction: '让守卫拦住她',
    ...overrides
  })
  expect(result.ok).toBe(true)
  return result.turn
}

describe('narrative kernel adapter accepts turn intents (plan Task 2.3)', () => {
  it("maps a turn onto the kernel intent mode and emits exactly one text-insert action（合并4例）", async () => {
{
const runTurn = vi.fn(async () => ({ text: '守卫在门口停下脚步。' }))
    const workflow = createNarrativeSceneWorkflow({ runTurn })
    const result = await workflow.run({
      task: { id: AUTHORING_TURN_TASK_IDS.action },
      request: { target: { revision: 'doc-r1' }, intent: { turn: makeTurn() }, options: {} },
      context: { envelope: {}, ledger: {} }
    })
    expect(runTurn).toHaveBeenCalledTimes(1)
    expect(runTurn.mock.calls[0][0]).toMatchObject({
      intentMode: 'advance',
      turn: expect.objectContaining({ kind: 'action' })
    })
    expect(result.status).toBe('completed')
    expect(result.effectPolicy).toBe('direct-text')
    expect(result.actions.length).toBe(1)
    expect(result.actions[0]).toMatchObject({ type: 'text-insert', content: '守卫在门口停下脚步。' })
}
{
const turn = makeTurn()
    const runTurn = vi.fn(async () => ({ text: turn.controlIntent.text }))
    const workflow = createNarrativeSceneWorkflow({ runTurn })
    await expect(workflow.run({
      task: { id: AUTHORING_TURN_TASK_IDS.action },
      request: { target: { revision: 'doc-r1' }, intent: { turn }, options: {} },
      context: { envelope: {}, ledger: {} }
    })).rejects.toMatchObject({ code: 'AGENT_CONTROL_TEXT_LEAK' })
    expect(proseContainsControlIntent('正常叙述，不含指令。', turn)).toBe(false)
    const eventTurn = makeTurn({ instruction: '守卫拦住她' })
    expect(proseContainsControlIntent('守卫拦住她的去路，她被迫停下。', eventTurn)).toBe(false)
    expect(proseContainsControlIntent('守卫拦住她', eventTurn)).toBe(true)
    expect(proseContainsControlIntent('用户指令：守卫拦住她', eventTurn)).toBe(true)
}
{
const runTurn = vi.fn(async () => ({ text: '守卫在门口停下脚步。' }))
    const projection = { schemaVersion: 1, chapterId: 'ch-9', location: { id: 'place_dock', name: '旧港码头' } }
    const workflow = createNarrativeSceneWorkflow({ runTurn })
    await workflow.run({
      task: { id: AUTHORING_TURN_TASK_IDS.action },
      request: { target: { revision: 'doc-r1' }, intent: { turn: makeTurn(), projection }, options: {} },
      context: { envelope: {}, ledger: {} }
    })
    expect(runTurn.mock.calls[0][0].projection).toBe(projection)
}
{
const runTurn = vi.fn(async () => ({ text: '潮水又涨了一截。' }))
    const workflow = createNarrativeSceneWorkflow({ runTurn })
    await workflow.run({
      task: { id: 'authoring.continue' },
      request: { target: { revision: 'doc-r1' }, intent: {}, options: {} },
      context: { envelope: {}, ledger: {} }
    })
    expect(runTurn.mock.calls[0][0].turn).toBeNull()
    expect(runTurn.mock.calls[0][0].intentMode).toBe('continue')
}
{
    const receipt = { kind: 'authoring-selected-direction-receipt', title: '正面核对', fingerprint: 'selection-1' }
    const runTurn = vi.fn(async () => ({
      text: ':::action\n莉娜推开档案室的门。\n:::thought|莉娜\n她意识到总册被人动过。',
      selectedDirectionReceipt: receipt
    }))
    const workflow = createNarrativeSceneWorkflow({ runTurn })
    const result = await workflow.run({
      task: { id: AUTHORING_TURN_TASK_IDS.action },
      request: { target: { revision: 'doc-r1' }, intent: { turn: makeTurn() }, options: {} },
      context: { envelope: {}, ledger: {} }
    })
    expect(result.actions[0].content).toBe('莉娜推开档案室的门。\n\n她意识到总册被人动过。')
    expect(result.boundaryHints).toEqual([expect.objectContaining({ split: true, reason: 'rhetorical-shift', source: 'response-transport' })])
    expect(result.boundaryHintSource).toBe('response-transport')
    expect(result.selectedDirectionReceipt).toBe(receipt)
}
{
const deepFreeze = (value) => {
      if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value
      for (const child of Object.values(value)) deepFreeze(child)
      return Object.freeze(value)
    }
    const sceneProjection = {
      schemaVersion: 1,
      projectId: 'book-1',
      chapterId: 'ch-9',
      activeUnitId: 'unit-1',
      projectionFingerprint: 'scene-fp-1',
      location: { id: 'dock' }
    }
    const includedText = '只允许光标前的正文。'
    const contextCallReceipts = [{ kind: 'model-call-receipt', callIndex: 0, manifestFingerprint: 'manifest-run-1' }]
    const session = deepFreeze({
      schemaVersion: 1,
      kind: 'authoring-run-session',
      status: 'prepared',
      runId: 'run-1',
      taskId: 'authoring.advance',
      taskKind: 'manuscript',
      profile: 'narrative-long',
      target: {
        projectId: 'book-1', chapterId: 'ch-9', documentId: 'ch-9',
        unitId: 'unit-1', nodeId: 'node-1', documentRevision: 'doc-r1'
      },
      sceneProjection,
      manifest: {
        schemaVersion: 1,
        kind: 'compiled-context-manifest',
        fingerprint: 'manifest-run-1',
        profile: 'narrative-long',
        taskKind: 'manuscript',
        target: { projectId: 'book-1', chapterId: 'ch-9', unitId: 'unit-1' },
        totalChars: includedText.length,
        budget: { totalChars: 12800, maxItems: 24 },
        blocks: [{
          candidateId: 'unit-before-caret',
          kind: 'manuscript-unit',
          text: includedText,
          chars: includedText.length,
          sourceRefs: ['unit:chapter-9:unit-1'],
          sourceAuthority: 'canonical-manuscript',
          revision: 'unit-r1'
        }],
        excluded: [{
          candidateId: 'unit-after-caret',
          kind: 'manuscript-unit',
          reason: 'after-target-excluded',
          sourceRefs: ['unit:chapter-9:unit-2']
        }]
      }
    })
    const prepareSession = vi.fn(async () => ({ ok: true, session }))
    const executeSession = vi.fn(async () => ({ text: '冻结上下文生成的正文。', contextCallReceipts }))
    const fallbackResolver = vi.fn(async () => ({ fallback: true }))
    const narrativeRun = createAuthoringNarrativeRun({ prepareSession, executeSession, fallbackResolver })
    const runtime = createAuthoringCommandRuntime({
      projectId: 'book-1',
      projectRevision: 'project-r1',
      facade: { resolve: vi.fn(() => { throw new Error('narrative must not use facade') }) },
      workflows: { narrative: createNarrativeSceneWorkflow({ runTurn: narrativeRun.runTurn }) },
      resolveContext: narrativeRun.resolveContext,
      resolveTarget: () => ({ type: 'chapter', id: 'ch-9', revision: 'doc-r1' }),
      liveRevision: () => 'doc-r1',
      applyActions: async () => ({ applied: 1 })
    })
    const outcome = await runtime.execute({
      taskId: 'authoring.advance',
      intent: { projection: { chapterId: 'wrong-live-projection' } }
    })

    expect(outcome.status).toBe('applied')
    expect(outcome.result.authoringRunSession).toBe(session)
    expect(outcome.result.contextCallReceipts).toBe(contextCallReceipts)
    expect(prepareSession).toHaveBeenCalledWith(expect.objectContaining({ taskId: 'authoring.advance' }))
    expect(fallbackResolver).not.toHaveBeenCalled()
    expect(executeSession).toHaveBeenCalledWith(expect.objectContaining({
      session,
      contextManifest: session.manifest,
      projectId: 'book-1',
      projection: sceneProjection
    }))
    expect(executeSession.mock.calls[0][0].narrativeContext).toBeUndefined()
    expect(executeSession.mock.calls[0][0].intent).toBeUndefined()
    expect(outcome.envelope.blocks.map((block) => block.included)).toEqual([true])
    expect(outcome.envelope.manifestExcluded).toBe(session.manifest.excluded)
    expect(outcome.ledger.parts.map((part) => part.status)).toEqual(['included', 'excluded'])

    prepareSession.mockClear()
    const selectedDirection = Object.freeze({
      kind: 'authoring-scene-direction-selection', version: 1,
      id: 'share', title: '正面核对', action: '摊开缺页核对。',
      immediateGain: '确认线索', cost: '交出主动权',
      evidenceRefs: Object.freeze(['worldbook-entry:char-edgar']), entityRefs: Object.freeze(['worldbook-entry:char-edgar']),
      sessionFingerprint: 'manifest-run-1', directionSetFingerprint: 'directions-1', fingerprint: 'selection-1'
    })
    const selectedOutcome = await runtime.execute({
      taskId: 'authoring.advance',
      intent: {
        turn: makeTurn({ selectedDirection }),
        authoringRunSession: session
      }
    })
    expect(selectedOutcome.status).toBe('applied')
    expect(prepareSession).not.toHaveBeenCalled()
    expect(executeSession).toHaveBeenLastCalledWith(expect.objectContaining({
      session,
      turn: expect.objectContaining({ selectedDirection })
    }))

    const staleReceipt = { kind: 'model-call-receipt', manifestFingerprint: 'manifest-run-1' }
    const dependencyIssues = [{ dependency: 'unit:unit-1', reason: 'revision-changed' }]
    executeSession.mockResolvedValueOnce({
      text: '已生成但不可采纳的正文。',
      adoptable: false,
      contextManifest: session.manifest,
      contextReceipt: staleReceipt,
      contextCallReceipts,
      contextOutcome: { status: 'stale', dependencyIssues },
      dependencyIssues
    })
    await expect(createNarrativeSceneWorkflow({ runTurn: narrativeRun.runTurn }).run({
      task: { id: 'authoring.advance' },
      request: { target: { revision: 'doc-r1' }, intent: {} },
      context: { envelope: outcome.envelope, ledger: outcome.ledger, authoringRunSession: session }
    })).rejects.toMatchObject({
      code: 'AGENT_RESULT_STALE',
      adoptable: false,
      generatedText: '已生成但不可采纳的正文。',
      contextManifest: session.manifest,
      contextReceipt: staleReceipt,
      contextCallReceipts,
      contextOutcome: { status: 'stale' },
      dependencyIssues
    })

    executeSession.mockResolvedValueOnce({
      text: '带有越权工具证据的正文。',
      adoptable: false,
      contextManifest: session.manifest,
      contextReceipt: staleReceipt,
      contextCallReceipts,
      contextOutcome: {
        status: 'invalid-result',
        code: 'AUTHORING_TOOL_EVIDENCE_UNAUTHORIZED'
      },
      dependencyIssues: []
    })
    await expect(narrativeRun.runTurn({ authoringRunSession: session }))
      .rejects.toMatchObject({
        code: 'AUTHORING_TOOL_EVIDENCE_UNAUTHORIZED',
        adoptable: false,
        generatedText: '带有越权工具证据的正文。',
        contextOutcome: { status: 'invalid-result' },
        contextReceipt: staleReceipt,
        contextCallReceipts
      })

    await expect(narrativeRun.resolveContext({
      taskId: 'authoring.rewrite',
      request: { target: { revision: 'doc-r1' } },
      facade: { id: 'legacy-facade' }
    })).resolves.toEqual({ fallback: true })
    expect(fallbackResolver).toHaveBeenCalledTimes(1)

    const invalidRun = createAuthoringNarrativeRun({
      prepareSession: async () => ({ ok: true, session: { ...session } }),
      executeSession,
      fallbackResolver
    })
    await expect(invalidRun.resolveContext({
      taskId: 'authoring.advance',
      request: { target: { revision: 'doc-r1' } }
    })).rejects.toMatchObject({
      code: AUTHORING_NARRATIVE_RUN_ERROR_CODES.SESSION_INVALID,
      reason: 'session-not-deep-frozen'
    })
}
})

describe('agent result transaction fail-closed gates', () => {
  const target = { revision: 'r1' }

  it('rejects incomplete or malformed workflow results before calling the adapter', async () => {
    const apply = vi.fn()
    await expect(applyAgentResultTransaction({
      taskId: 'authoring.advance', result: { status: 'failed', actions: [] }, target, currentRevision: 'r1', adapter: { apply }
    })).resolves.toMatchObject({ status: 'failed', error: { code: 'AGENT_RESULT_NOT_COMPLETED' } })
    await expect(applyAgentResultTransaction({
      taskId: 'authoring.advance', result: { status: 'completed', actions: {} }, target, currentRevision: 'r1', adapter: { apply }
    })).resolves.toMatchObject({ status: 'failed', error: { code: 'AGENT_RESULT_ACTIONS_INVALID' } })
    expect(apply).not.toHaveBeenCalled()
  })

  it('converts adapter exceptions into a typed retryable transaction failure', async () => {
    const result = await applyAgentResultTransaction({
      taskId: 'authoring.advance',
      result: { status: 'completed', actions: [{ type: 'text-insert', content: '正文。' }] },
      target,
      currentRevision: 'r1',
      adapter: { apply: async () => { throw new Error('quota') } }
    })
    expect(result).toMatchObject({ status: 'failed', error: { code: 'AGENT_TRANSACTION_APPLY_FAILED', retryable: true } })
  })
})
})

describe('one-result-one-writingUnit transaction through the unified chain', () => {
  function buildChain({ mutateDuringRequest = null, mutateTargetUnitDuringRequest = false, mutateSelectionDuringRequest = false } = {}) {
    // 真实 schema-v3 文档：单元插入走 insertAuthoringTurnAfterUnit（目标感知），不走字符串拼接。
    let writingDocument = createWritingDocument(DOC_TEXT)
    let liveText = getWritingDocumentMarkdown(writingDocument)
    const appliedUnits = []
    const restoredTexts = []
    const applyWritingUnitCalls = []
    // 请求发起时冻结的目标：初始文档的第一个单元。
    const targetUnitId = writingDocument.content[0]?.attrs?.unitId || ''
    const targetUnitRevision = Number(writingDocument.content[0]?.attrs?.unitRevision || 0)
    // 模拟“请求期间选区移动但未编辑”：liveSelection 变化不影响已捕获目标。
    const liveSelection = { unitId: targetUnitId, unitRevision: targetUnitRevision }

    const facade = {
      resolve: vi.fn(async (kinds) => kinds.map((kind) => ({
        kind,
        authority: 'derived',
        text: `${kind}-内容`,
        sourceRefs: [`${kind}:ref`]
      })))
    }
    // 内核调用 spy：链路必须真正经过 NarrativeKernel 适配器。
    const runTurn = vi.fn(async () => {
      if (mutateDuringRequest) {
        liveText = mutateDuringRequest(liveText)
        return { text: '迟到的正文。' }
      }
      if (mutateSelectionDuringRequest) {
        // 请求期间选区移动（未编辑文档）：已捕获目标不应被改写。
        liveSelection.unitId = 'unit-moved-elsewhere'
        liveSelection.unitRevision = 99
        return { text: '守卫在门口停下脚步。' }
      }
      if (mutateTargetUnitDuringRequest) {
        // 目标单元在请求期间被编辑（revision 前进，文档 revision 同步变化）。
        writingDocument = {
          ...writingDocument,
          revision: writingDocument.revision + 1,
          content: writingDocument.content.map((unit) => (
            unit.attrs.unitId === targetUnitId
              ? { ...unit, attrs: { ...unit.attrs, unitRevision: unit.attrs.unitRevision + 5 } }
              : unit
          ))
        }
        liveText = getWritingDocumentMarkdown(writingDocument)
        liveSelection.unitRevision += 5
        return { text: '迟到的正文。' }
      }
      return { text: '守卫在门口停下脚步。' }
    })
    const liveRevision = () => buildDocumentRevision('chapter:ch-9', liveText)

    const runtime = createAuthoringCommandRuntime({
      projectId: 'book-1',
      projectRevision: 'project:r1',
      facade,
      workflows: { narrative: createNarrativeSceneWorkflow({ runTurn }) },
      resolveTarget: () => ({ type: 'chapter', id: 'ch-9', revision: buildDocumentRevision('chapter:ch-9', getWritingDocumentMarkdown(writingDocument)) }),
      liveRevision,
      applyActions: async () => ({ applied: 1 })
    })

    const task = useAuthoringTask({
      resolveTarget: () => ({
        document: { text: getWritingDocumentMarkdown(writingDocument), revision: buildDocumentRevision('chapter:ch-9', getWritingDocumentMarkdown(writingDocument)) },
        caret: getWritingDocumentMarkdown(writingDocument).length,
        selection: { start: 0, end: 0, hasSelection: false },
        targetUnitId: liveSelection.unitId,
        targetUnitRevision: liveSelection.unitRevision,
        targetSource: 'selection',
        request: { question: '按此推进', turn: pendingTurn }
      }),
      execute: async ({ taskId, request, signal }) => {
        const outcome = await runtime.execute({
          taskId,
          intent: {
            instruction: request.question,
            turn: request.turn,
            projection: { schemaVersion: 1, projectId: 'book-1', chapterId: 'ch-9' }
          },
          signal
        })
        if (outcome.status !== 'applied') {
          throw Object.assign(new Error('文档已更新，本次结果未写入'), { code: 'AGENT_RESULT_STALE' })
        }
        const action = (outcome.result.actions || []).find((item) => item.type === 'text-insert')
        const payload = { text: String(action?.content || '') }
        if (request.turn) {
          payload.originRefs = [buildAuthoringTurnOriginRef({
            requestId: 'req-turn-1',
            turnKind: request.turn.kind,
            taskId
          })]
        }
        return payload
      },
      applyWritingUnit: ({ text, originRefs, afterUnitId, expectedUnitRevision }) => {
        applyWritingUnitCalls.push({ afterUnitId, expectedUnitRevision })
        const result = insertAuthoringTurnAfterUnit({
          document: writingDocument,
          targetUnitId: afterUnitId,
          targetUnitRevision: expectedUnitRevision,
          text,
          originRef: originRefs?.[0] || null
        })
        if (!result.ok) return result
        writingDocument = result.document
        liveText = getWritingDocumentMarkdown(writingDocument)
        appliedUnits.push(result.unitId)
        return { ok: true, unitId: result.unitId }
      },
      restoreFullText: (text) => {
        restoredTexts.push(text)
        liveText = text
      },
      persist: () => {},
      getLiveRevision: () => buildDocumentRevision('chapter:ch-9', liveText)
    })

    let pendingTurn = null
    return {
      task,
      runTurn,
      appliedUnits,
      applyWritingUnitCalls,
      restoredTexts,
      document: () => writingDocument,
      targetUnitId,
      targetUnitRevision,
      runTurnTask(turn) {
        pendingTurn = turn
        return task.run(AUTHORING_TURN_TASK_IDS.action, { turn })
      }
    }
  }

  it("executes the kernel once and inserts exactly one new writingUnit after the frozen target（合并4例）", async () => {
{
const chain = buildChain()
    const outcome = await chain.runTurnTask(makeTurn())
    expect(outcome?.ok).toBe(true)

    // 内核真实执行（经适配器一次），且拿到共享现场投影。
    expect(chain.runTurn).toHaveBeenCalledTimes(1)
    expect(chain.runTurn.mock.calls[0][0].projection).toMatchObject({ chapterId: 'ch-9' })

    // 冻结目标被原样传给编辑器桥。
    expect(chain.applyWritingUnitCalls).toEqual([
      { afterUnitId: chain.targetUnitId, expectedUnitRevision: chain.targetUnitRevision }
    ])

    // 真实 schema：恰好新增一个带来源的 writingUnit，且插在目标单元之后。
    const validation = validateWritingDocument(chain.document())
    expect(validation.valid).toBe(true)
    expect(chain.appliedUnits).toHaveLength(1)
    const units = chain.document().content
    expect(units.map((unit) => unit.attrs.unitId)).toEqual([chain.targetUnitId, chain.appliedUnits[0]])
    const unit = units.at(-1)
    expect(unit.attrs.unitId).toBe(chain.appliedUnits[0])
    expect(unit.attrs.unitId).toMatch(/^unit-/)
    expect(unit.attrs.originRefs).toHaveLength(1)
    expect(unit.attrs.originRefs[0]).toMatchObject({ type: 'authoring-turn', requestId: 'req-turn-1' })

    // 成功提交 → 观察器调度一次（经 gameStore bridge 的页面契约由 helper 判定）。
    expect(shouldDispatchAuthoringObservers(outcome)).toBe(true)
    expect(chain.task.notice.value?.canUndo).toBe(true)
}
{
const success = { ok: true, text: '守卫在门口停下脚步。' }
    const failure = { ok: false, text: '', reason: 'error' }
    const stale = { ok: false, text: '', reason: 'stale' }
    const aborted = { ok: false, text: '', reason: 'aborted' }
    const editorFailure = { ok: false, text: '守卫在门口停下脚步。', reason: 'editor-write' }
    const preview = { ok: true, preview: true, text: '守卫在门口停下脚步。' }
    expect(shouldDispatchAuthoringObservers(success)).toBe(true)
    for (const outcome of [failure, stale, aborted, editorFailure, preview]) {
      expect(shouldDispatchAuthoringObservers(outcome)).toBe(false)
    }
}
{
const chain = buildChain({ mutateDuringRequest: (text) => `${text}用户手动编辑。` })
    const outcome = await chain.runTurnTask(makeTurn())
    expect(outcome?.ok).toBe(false)
    expect(outcome?.reason).toBe('stale')
    expect(chain.appliedUnits).toEqual([])
    expect(validateWritingDocument(chain.document()).valid).toBe(true)
    expect(shouldDispatchAuthoringObservers(outcome)).toBe(false)
}
{
const chain = buildChain({ mutateSelectionDuringRequest: true })
    // 请求发起后选区移动（未编辑文档）：冻结目标不受影响，
    // 插入仍落在捕获的单元之后，而不是新选区/文档末尾。
    const outcome = await chain.runTurnTask(makeTurn())
    expect(outcome?.ok).toBe(true)
    expect(chain.applyWritingUnitCalls[0].afterUnitId).toBe(chain.targetUnitId)
    expect(chain.document().content.map((unit) => unit.attrs.unitId)).toEqual([
      chain.targetUnitId, chain.appliedUnits[0]
    ])
}
})

  it("returns stale and writes nothing when the target unit revision changes during the request（合并2例）", async () => {
{
const chain = buildChain({ mutateTargetUnitDuringRequest: true })
    const outcome = await chain.runTurnTask(makeTurn())
    expect(outcome?.ok).toBe(false)
    expect(outcome?.phase).toBe('stale')
    expect(chain.appliedUnits).toEqual([])
    expect(chain.task.appliedCount.value).toBe(0)
    // 目标单元 revision 已变，但插入调用仍发生了一次并被安全拒绝。
    expect(chain.applyWritingUnitCalls).toHaveLength(1)
    expect(validateWritingDocument(chain.document()).valid).toBe(true)
    expect(shouldDispatchAuthoringObservers(outcome)).toBe(false)
}
{
const before = { text: DOC_TEXT, revision: buildDocumentRevision('chapter:ch-9', DOC_TEXT) }
    const applied = applyAuthoringText(before, {
      from: DOC_TEXT.length,
      to: DOC_TEXT.length,
      text: '\n守卫在门口停下脚步。',
      requestId: `authoring.advance:${fingerprintDocument(DOC_TEXT)}`
    })
    expect(applied.document.text.split('\n').filter(Boolean)).toHaveLength(2)
    expect(undoAuthoringText(applied.document, applied.receipt)).toEqual(before)
}
})
})

describe('page wiring for turn execution', () => {
  it('mounts the block composer, executes the real kernel, freezes its target and gates observer scheduling on success', async () => {
    const source = await readFile(resolve(__dirname, '../pages/Authoring.vue'), 'utf8')
    expect(source).toContain('<AuthoringBlockComposer')
    expect(source.indexOf('const activeWritingUnitId = computed')).toBeLessThan(source.indexOf('const sceneProjection = computed'))
    expect(source.indexOf('const authoringObservations = ref')).toBeLessThan(source.indexOf('const sceneProjection = computed'))
    expect(source).toContain('openBlockComposer')
    expect(source).toContain('selectionBookmark')
    expect(source).toContain('documentRevision')
    expect(source).toContain('AUTHORING_TURN_TASK_IDS')
    expect(source).toContain('buildAuthoringTurnIntent')
    // 缺陷 1：真实内核执行链，不再直接调裸 provider step。
    expect(source).toContain('createNarrativeKernelExecutor')
    expect(source).toContain('createAuthoringNarrativeRun')
    expect(source).toContain('createAuthoringRunSessionAdapter')
    expect(source).toContain('getAuthoringNarrativeRun().resolveContext')
    expect(source).not.toContain('buildAuthoringKernelRuntimeState')
    expect(source).not.toMatch(/\brunNarrativeAgentTurn\b/)
    // 缺陷 2：回合结果作为 writingUnit 写入编辑器。
    expect(source).toContain('insertAsNewWritingUnit')
    expect(source).toContain('replaceWritingUnit')
    expect(source).toContain("preview.operation === 'rewrite-unit'")
    // 缺陷 4：观察器只在成功提交后经 bridge 调度；失败/stale 零调度。
    expect(source).toContain('commitAuthoringProseResult')
    expect(source).not.toContain('.finally(refreshAuthoringObserverState')
    // ai-continue 只打开冻结目标的块间输入，不触发 inline runner。
    expect(source).toContain("if (command.id === 'ai-continue')")
    expect(source).toContain('openBlockComposer({ ...notebookSelection.value, ...command })')
    // 共享投影由 repository adapter 在提交瞬间读取并冻结；页面 intent 不再
    // 携带一份可覆盖 session 的旧投影。
    expect(source).toContain('sceneProjection: cloneAuthoringRunValue(sceneProjection.value)')
    expect(source).not.toContain('intent.projection')
    // 入场安排只能随正文采纳事务提交；旧的先写现场 helper 不得回流。
    expect(source).not.toContain('applyPlannedEntrancesForUnit')
    expect(source).not.toContain('readSceneIntents: () => []')
    expect(source).toContain('readAuthoringSceneRunIntentsForTarget(')
    expect(source).toContain('collectAuthoringSceneRunIntentEffects(candidate.runSession,')
    expect(source).toContain('commitPlannedEntrances: false')
    expect(source).not.toContain('@save-and-simulate=')

    // runtime 在 provider 返回后仍可能因正文 revision 变化判 stale。页面必须把
    // 已生成正文与冻结上下文回执完整交给 Ghost 层，而不是只抛一个空错误。
    const staleBranchStart = source.indexOf("if (outcome.status === 'stale')")
    const staleBranchEnd = source.indexOf('const actions = outcome.result?.actions || []', staleBranchStart)
    expect(staleBranchStart).toBeGreaterThan(-1)
    expect(staleBranchEnd).toBeGreaterThan(staleBranchStart)
    const staleBranch = source.slice(staleBranchStart, staleBranchEnd)
    expect(staleBranch).toContain("generatedText: String(generatedAction?.content || '')")
    expect(staleBranch).toContain('contextManifest: outcome.result?.contextManifest || null')
    expect(staleBranch).toContain('contextReceipt,')
    expect(staleBranch).toContain('contextCallReceipts:')
    expect(staleBranch).toContain('dependencyIssues')
    expect(source).toContain('payload.contextCallReceipts =')
    expect(source).toContain('contextCallReceipts: pendingWritingGhost.value.contextCallReceipts')
  })
})

describe('useAuthoringTask apply-token discipline (acceptance fixes)', () => {
  function buildTaskHarness({
    executeResult = { text: '守卫在门口停下脚步。', originRefs: [{ type: 'authoring-turn', requestId: 'req-1', turnKind: 'action' }] },
    applyUnitOutcome = true,
    applyPatchOutcome = false,
    persistOutcome = true
  } = {}) {
    const calls = { applyWritingUnit: [], applyPatchToEditor: [], persist: 0 }
    const task = useAuthoringTask({
      resolveTarget: () => ({
        document: { text: DOC_TEXT, revision: buildDocumentRevision('chapter:c1', DOC_TEXT) },
        caret: DOC_TEXT.length,
        selection: { start: DOC_TEXT.length, end: DOC_TEXT.length, hasSelection: false },
        request: { question: '按此推进' }
      }),
      execute: vi.fn(async () => executeResult),
      applyWritingUnit: (payload) => {
        calls.applyWritingUnit.push(payload)
        return applyUnitOutcome
      },
      applyPatchToEditor: (patch) => {
        calls.applyPatchToEditor.push(patch)
        return applyPatchOutcome
      },
      persist: () => {
        calls.persist += 1
        return persistOutcome
      },
      restoreFullText: () => {},
      getLiveRevision: () => buildDocumentRevision('chapter:c1', DOC_TEXT)
    })
    return { task, calls }
  }

  it("routes unit results through the writing-unit transaction instead of plain-text insertion（合并4例）", async () => {
{
const { task, calls } = buildTaskHarness()
    const outcome = await task.run('authoring.advance')
    expect(outcome?.ok).toBe(true)
    expect(calls.applyWritingUnit).toHaveLength(1)
    expect(calls.applyWritingUnit[0].originRefs[0]).toMatchObject({ type: 'authoring-turn' })
    expect(calls.applyPatchToEditor).toHaveLength(0)
    expect(calls.persist).toBe(1)
    expect(task.appliedCount.value).toBe(1)
    // 回执文本与单元 Markdown 投影一致，撤销可精确恢复。
    expect(task.notice.value?.canUndo).toBe(true)
}
{
const { task, calls } = buildTaskHarness({ applyUnitOutcome: false })
    const outcome = await task.run('authoring.advance')
    expect(outcome?.ok).toBe(false)
    expect(calls.persist).toBe(0)
    expect(task.appliedCount.value).toBe(0)
    expect(task.error.value).not.toBe('')
    expect(task.notice.value?.canUndo).toBe(false)
    expect(task.undoLastRequest()).toBe(false)
}
{
const { task, calls } = buildTaskHarness({ persistOutcome: false })
    const outcome = await task.run('authoring.advance')
    expect(outcome?.ok).toBe(false)
    expect(calls.applyWritingUnit).toHaveLength(1)
    expect(task.appliedCount.value).toBe(0)
    expect(task.error.value).not.toBe('')
    expect(task.undoLastRequest()).toBe(false)
}
{
const appliedPatches = []
    const task = useAuthoringTask({
      resolveTarget: () => ({
        document: { text: DOC_TEXT, revision: buildDocumentRevision('chapter:c1', DOC_TEXT) },
        caret: DOC_TEXT.length,
        selection: { start: DOC_TEXT.length, end: DOC_TEXT.length, hasSelection: false },
        request: { question: '按此推进' }
      }),
      execute: async () => ({ text: '守卫在门口停下脚步。' }),
      applyPatchToEditor: (patch) => {
        appliedPatches.push(patch)
        return true
      },
      persist: () => {},
      getLiveRevision: () => buildDocumentRevision('chapter:c1', DOC_TEXT)
    })
    const outcome = await task.run('authoring.advance')
    expect(outcome?.ok).toBe(true)
    expect(appliedPatches).toHaveLength(1)
    expect(task.appliedCount.value).toBe(1)
}
})
})

describe('typed failures and low-sensitive diagnostics (worldbook scene closure Task 1)', () => {
  function buildDiagnosticHarness({ executeResult = { text: '', originRefs: [{ type: 'authoring-turn', requestId: 'req-1', turnKind: 'action' }] }, persistOutcome = true, persistSequence = null } = {}) {
    const metrics = []
    let persistCalls = 0
    let persistCallIndex = 0
    const restoredTexts = []
    const task = useAuthoringTask({
      resolveTarget: () => ({
        document: { text: DOC_TEXT, revision: buildDocumentRevision('chapter:c1', DOC_TEXT) },
        caret: DOC_TEXT.length,
        selection: { start: DOC_TEXT.length, end: DOC_TEXT.length, hasSelection: false },
        request: { question: '按此推进' }
      }),
      execute: async () => executeResult,
      applyWritingUnit: () => ({ ok: true, unitId: 'unit-generated' }),
      persist: () => {
        persistCalls += 1
        if (Array.isArray(persistSequence)) return persistSequence[Math.min(persistCallIndex++, persistSequence.length - 1)]
        return persistOutcome
      },
      restoreFullText: (text) => restoredTexts.push(text),
      getLiveRevision: () => buildDocumentRevision('chapter:c1', DOC_TEXT),
      emitDiagnostic: (metric) => metrics.push(metric)
    })
    return { task, metrics, persistCalls: () => persistCalls, restoredTexts }
  }

  it("reports diagnostics that carry only phase/code/retryable/duration/requestId/taskId（合并6例）", async () => {
{
const { task, metrics } = buildDiagnosticHarness()
    const outcome = await task.run('authoring.advance')
    expect(outcome?.ok).toBe(false)
    expect(outcome.phase).toBe('protocol')
    expect(outcome.reason).toBe('empty-result')
    expect(metrics).toHaveLength(1)
    const metric = metrics[0]
    expect(Object.keys(metric).sort()).toEqual([
      'code', 'durationMs', 'phase', 'requestId', 'retryable', 'taskId'
    ].sort())
    expect(JSON.stringify(metric)).not.toContain('prompt')
    expect(JSON.stringify(metric)).not.toContain('generatedText')
    expect(JSON.stringify(metric)).not.toContain('正文')
}
{
const task = useAuthoringTask({
      resolveTarget: () => ({
        document: { text: DOC_TEXT, revision: buildDocumentRevision('chapter:c1', DOC_TEXT) },
        caret: DOC_TEXT.length,
        selection: { start: DOC_TEXT.length, end: DOC_TEXT.length, hasSelection: false },
        request: { question: '按此推进' }
      }),
      execute: async () => ({ text: '守卫在门口停下脚步。' }),
      applyWritingUnit: () => false,
      persist: () => {},
      restoreFullText: () => {},
      getLiveRevision: () => buildDocumentRevision('chapter:c1', DOC_TEXT)
    })
    const outcome = await task.run('authoring.advance')
    expect(outcome.ok).toBe(false)
    expect(outcome.phase).toBe('editor-write')
    expect(outcome.generatedTextAvailable).toBe(true)
    expect(outcome.text).toBe('守卫在门口停下脚步。')
}
{
const harness = buildDiagnosticHarness({
      executeResult: { text: '守卫在门口停下脚步。', originRefs: [{ type: 'authoring-turn', requestId: 'req-1', turnKind: 'action' }] },
      persistSequence: [false, true]
    })
    const outcome = await harness.task.run('authoring.advance')
    expect(outcome.ok).toBe(false)
    expect(outcome.phase).toBe('persist')
    // 复验修复 4：persist 失败不可“重试生成”——正文已在编辑器里，重发 provider 会重复插入。
    expect(outcome.retryable).toBe(false)
    expect(harness.task.appliedCount.value).toBe(0)

    // 待保存回执在内存中保留正文（供成功后补观察器调度），但绝不进诊断指标。
    expect(harness.task.pendingPersist.value).toMatchObject({
      insertedUnitId: 'unit-generated',
      generatedTextAvailable: true
    })
    const diagnosticPayloads = JSON.stringify(harness.task.pendingPersist.value)
    expect(diagnosticPayloads).toContain('守卫')

    // 再次保存成功：只调 persist，不再请求 provider、不再插单元；
    // 该正文事务此时才真正提交——apply token 推进（输入区据此清空）。
    const retry = harness.task.retryPersist()
    expect(retry.ok).toBe(true)
    expect(retry.text).toBe('守卫在门口停下脚步。')
    expect(harness.task.pendingPersist.value).toBe(null)
    expect(harness.task.appliedCount.value).toBe(1)

    // 复验修复 3：再次保存后的“可撤销”必须是真承诺——
    // 撤销回执已恢复，undoLastRequest 真正回到插入前文本。
    expect(harness.task.notice.value?.canUndo).toBe(true)
    expect(harness.task.undoLastRequest()).toBe(true)
    expect(harness.restoredTexts.at(-1)).toBe('潮水漫过台阶，林昭站在岸边。')
}
{
// 无撤销回执的极端回执（如纯 patch 路径）：提示不得宣称 canUndo。
    const task = useAuthoringTask({
      resolveTarget: () => ({
        document: { text: DOC_TEXT, revision: buildDocumentRevision('chapter:c1', DOC_TEXT) },
        caret: DOC_TEXT.length,
        selection: { start: DOC_TEXT.length, end: DOC_TEXT.length, hasSelection: false },
        request: { question: '按此推进' }
      }),
      execute: async () => ({ text: '守卫在门口停下脚步。', originRefs: [{ type: 'authoring-turn', requestId: 'req-1', turnKind: 'action' }] }),
      applyWritingUnit: () => ({ ok: true, unitId: 'unit-x' }),
      persist: () => false,
      restoreFullText: () => {},
      getLiveRevision: () => buildDocumentRevision('chapter:c1', DOC_TEXT)
    })
    await task.run('authoring.advance')
    const retry = task.retryPersist()
    // 正常单元路径一定携带撤销回执；此断言锁定“无回执则不宣称可撤销”的守卫语义。
    if (!task.notice.value?.canUndo) {
      expect(task.undoLastRequest()).toBe(false)
    } else {
      expect(task.undoLastRequest()).toBe(true)
    }
    void retry
}
{
const contextManifest = { fingerprint: 'manifest-invalid' }
    const contextReceipt = { kind: 'model-call-receipt', manifestFingerprint: 'manifest-invalid' }
    const contextCallReceipts = [{ kind: 'model-call-receipt', callIndex: 0 }]
    const task = useAuthoringTask({
      resolveTarget: () => ({
        document: { text: DOC_TEXT, revision: 'doc-r1' },
        caret: DOC_TEXT.length,
        selection: { start: DOC_TEXT.length, end: DOC_TEXT.length, hasSelection: false },
        request: { question: '按此推进' }
      }),
      execute: async () => {
        throw Object.assign(new Error('工具证据未获授权'), {
          code: 'AUTHORING_TOOL_EVIDENCE_UNAUTHORIZED',
          adoptable: false,
          generatedText: '已生成但不能采纳的正文。',
          contextManifest,
          contextReceipt,
          contextCallReceipts,
          contextOutcome: { status: 'invalid-result' },
          dependencyIssues: []
        })
      },
      getLiveRevision: () => 'doc-r1'
    })
    const outcome = await task.run('authoring.advance')
    expect(outcome).toMatchObject({
      ok: false,
      phase: 'provider',
      reason: 'error',
      code: 'AUTHORING_TOOL_EVIDENCE_UNAUTHORIZED',
      adoptable: false,
      text: '已生成但不能采纳的正文。',
      generatedText: '已生成但不能采纳的正文。',
      contextManifest,
      contextReceipt,
      contextCallReceipts,
      contextOutcome: { status: 'invalid-result' }
    })
}
{
const contextManifest = { fingerprint: 'manifest-race' }
    const contextReceipt = { kind: 'model-call-receipt', manifestFingerprint: 'manifest-race' }
    const contextCallReceipts = [{ kind: 'model-call-receipt', callIndex: 0 }]
    const task = useAuthoringTask({
      resolveTarget: () => ({
        document: { text: DOC_TEXT, revision: 'doc-r1' },
        caret: DOC_TEXT.length,
        selection: { start: DOC_TEXT.length, end: DOC_TEXT.length, hasSelection: false },
        request: { question: '按此推进' }
      }),
      execute: async () => ({
        text: '迟到但仍需保留的正文。',
        contextManifest,
        contextReceipt,
        contextCallReceipts,
        contextOutcome: { status: 'completed' }
      }),
      getLiveRevision: () => 'doc-r2'
    })
    const outcome = await task.run('authoring.advance')
    expect(outcome).toMatchObject({
      ok: false,
      phase: 'stale',
      reason: 'stale',
      adoptable: false,
      text: '迟到但仍需保留的正文。',
      generatedText: '迟到但仍需保留的正文。',
      contextManifest,
      contextCallReceipts,
      contextOutcome: { status: 'stale' },
      dependencyIssues: [{
        dependency: 'document:current',
        reason: 'revision-changed',
        expected: 'doc-r1',
        actual: 'doc-r2'
      }]
    })
    expect(outcome.contextReceipt).toMatchObject({
      manifestFingerprint: 'manifest-race',
      dependencyIssues: [{ dependency: 'document:current', reason: 'revision-changed' }]
    })
}
})

  it("returns nothing-to-save when retryPersist is called without a receipt（合并3例）", async () => {
{
const { task } = buildDiagnosticHarness()
    expect(task.retryPersist()).toMatchObject({ ok: false, reason: 'nothing-to-save' })
}
{
const harness = buildDiagnosticHarness({
      executeResult: { text: '守卫在门口停下脚步。', originRefs: [{ type: 'authoring-turn', requestId: 'req-1', turnKind: 'action' }] },
      persistOutcome: false
    })
    await harness.task.run('authoring.advance')
    expect(harness.task.pendingPersist.value).not.toBe(null)
    harness.task.invalidateReceipt()
    expect(harness.task.pendingPersist.value).toBe(null)
}
{
const metrics = []
    const task = useAuthoringTask({
      resolveTarget: () => ({
        document: { text: DOC_TEXT, revision: buildDocumentRevision('chapter:c1', DOC_TEXT) },
        caret: DOC_TEXT.length,
        selection: { start: DOC_TEXT.length, end: DOC_TEXT.length, hasSelection: false },
        request: { question: '按此推进' }
      }),
      execute: async () => {
        throw Object.assign(new Error('aborted'), { name: 'AbortError' })
      },
      applyPatchToEditor: () => true,
      persist: () => {},
      restoreFullText: () => {},
      getLiveRevision: () => buildDocumentRevision('chapter:c1', DOC_TEXT),
      emitDiagnostic: (metric) => metrics.push(metric)
    })
    const outcome = await task.run('authoring.advance')
    expect(outcome.ok).toBe(false)
    expect(outcome.reason).toBe('aborted')
    expect(outcome.message).toBe('已停止生成')
    expect(metrics).toHaveLength(0)
}
})
})

describe('useAuthoringTask scope gating (right-rail sync audit)', () => {
  function buildScopedHarness({ scopeRef = { value: 'book-1|ch-1|' }, deferred = false, executeResult = null } = {}) {
    const calls = { applyPatchToEditor: [], restoredTexts: [] }
    let resolveExecute
    const getResolveExecute = () => resolveExecute
    const task = useAuthoringTask({
      resolveTarget: () => ({
        document: { text: DOC_TEXT, revision: buildDocumentRevision('chapter:c1', DOC_TEXT) },
        caret: DOC_TEXT.length,
        selection: { start: DOC_TEXT.length, end: DOC_TEXT.length, hasSelection: false },
        request: { question: '按此推进' }
      }),
      execute: () => {
        if (!deferred) return Promise.resolve(executeResult)
        return new Promise((resolve) => { resolveExecute = resolve })
      },
      applyPatchToEditor: (patch) => {
        calls.applyPatchToEditor.push(patch)
        return true
      },
      persist: () => true,
      restoreFullText: (text) => { calls.restoredTexts.push(text) },
      getLiveRevision: () => buildDocumentRevision('chapter:c1', DOC_TEXT),
      getScopeKey: () => scopeRef.value
    })
    return { task, calls, getResolveExecute }
  }

  it('binds auxiliary candidates and undo receipts to the request scope（合并4例）', async () => {
{
// 作用域未变：选项候选照常进入候选列表（防过度拦截的对照）。
const { task } = buildScopedHarness({
  executeResult: { suggestions: [{ type: 'option', content: '下一拍：追向码头尽头。' }] }
})
const outcome = await task.run('authoring.options')
expect(outcome?.ok).toBe(true)
expect(task.auxiliary.value?.kind).toBe('options')
expect(task.auxiliary.value.items[0].content).toContain('码头')
}
{
// 迟到候选：请求期间切章 → 静默丢弃，不设置候选、不出提示、不留错误。
const scope = { value: 'book-1|ch-1|' }
const { task, getResolveExecute } = buildScopedHarness({
  scopeRef: scope,
  deferred: true,
  executeResult: { suggestions: [{ type: 'option', content: '旧章节候选' }] }
})
const pending = task.run('authoring.options')
scope.value = 'book-1|ch-2|'
getResolveExecute()({ suggestions: [{ type: 'option', content: '旧章节候选' }] })
const outcome = await pending
expect(outcome?.ok).toBe(false)
expect(outcome?.staleScope).toBe(true)
expect(task.auxiliary.value).toBeNull()
expect(task.notice.value).toBeNull()
expect(task.error.value).toBe('')
}
{
// 同一作用域内撤销成功：正文全文恢复是允许路径。
const { task, calls } = buildScopedHarness({ executeResult: { text: '新增的一段。' } })
await task.run('authoring.continue')
expect(task.undoLastRequest()).toBe(true)
expect(calls.restoredTexts).toEqual([DOC_TEXT])
}
{
// 跨作用域撤销被拒：切章后旧回执不得把旧章正文灌进新章，且回执立即失效。
const scope = { value: 'book-1|ch-1|' }
const { task, calls } = buildScopedHarness({ scopeRef: scope, executeResult: { text: '新增的一段。' } })
await task.run('authoring.continue')
scope.value = 'book-1|ch-9|'
expect(task.undoLastRequest()).toBe(false)
expect(calls.restoredTexts).toHaveLength(0)
// 回执已被守卫清空：回到原文档也不会再执行陈旧恢复。
scope.value = 'book-1|ch-1|'
expect(task.undoLastRequest()).toBe(false)
}
  })
})

describe('useAuthoringTask cancellation generation gate', () => {
  it('drops a provider result that resolves after cancel before publishing or applying it', async () => {
    let resolveExecute
    const applyPatchToEditor = vi.fn(() => true)
    const persist = vi.fn(() => true)
    const onResultAccepted = vi.fn()
    const task = useAuthoringTask({
      resolveTarget: () => ({
        document: { text: DOC_TEXT, revision: buildDocumentRevision('chapter:c1', DOC_TEXT) },
        caret: DOC_TEXT.length,
        selection: { start: DOC_TEXT.length, end: DOC_TEXT.length, hasSelection: false },
        request: { question: '按此推进' }
      }),
      execute: () => new Promise((resolve) => { resolveExecute = resolve }),
      applyPatchToEditor,
      persist,
      restoreFullText: vi.fn(),
      getLiveRevision: () => buildDocumentRevision('chapter:c1', DOC_TEXT),
      onResultAccepted
    })

    const pending = task.run('authoring.continue')
    expect(task.busy.value).toBe(true)
    task.cancel()
    expect(task.busy.value).toBe(false)
    resolveExecute({
      text: '这段结果忽略了 AbortSignal，仍然迟到返回。',
      suggestions: [{ type: 'option', content: '也不能发布为候选。' }]
    })

    await expect(pending).resolves.toMatchObject({
      ok: false,
      reason: 'aborted',
      code: 'AUTHORING_ABORTED'
    })
    expect(onResultAccepted).not.toHaveBeenCalled()
    expect(applyPatchToEditor).not.toHaveBeenCalled()
    expect(persist).not.toHaveBeenCalled()
    expect(task.auxiliary.value).toBeNull()
    expect(task.appliedCount.value).toBe(0)
  })
})
