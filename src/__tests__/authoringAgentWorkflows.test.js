import { describe, expect, it, vi, beforeEach } from 'vitest'
import { effectScope, ref } from 'vue'
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
import { createMemoryTriggers } from '../services/memory/memoryTriggers.js'
import {
  createAuthoringObserverRunner,
  deriveRelationsFromDelta,
  runObserverMemoryDerivation
} from '../services/agents/observers/authoringObserverDerivation.js'
import { listMemoryCandidates } from '../services/memory/memoryCandidates.js'
import { shouldTriggerWritingAgent, useWritingAgent } from '../composables/useWritingAgent.js'
import { useInlineWritingAgentHost } from '../composables/useInlineWritingAgentHost.js'
import { useAuthoringReferenceSource } from '../composables/useAuthoringReferenceSource.js'
import { resolveWritingInteractionOwner, WRITING_INTERACTION_OWNER } from '../services/writing/writingInteractionPolicy.js'
import {
  createAuthoringEvidenceEnvelope,
  createAuthoringKnowledgeAnswer,
  normalizeAuthoringEvidence,
  reconcileAuthoringKnowledgeAnswer,
  selectAuthoringEvidenceEnvelope,
  sourceRefForAuthoringEvidenceLocator
} from '../services/agents/authoring/authoringKnowledgeAnswerContract.js'
import { useAuthoringKnowledgeAssistant, recordKnowledgeSeamFocus } from '../composables/useAuthoringKnowledgeAssistant.js'
import { createAuthoringKnowledgeQuerySession } from '../services/agents/authoring/authoringKnowledgeQuerySession.js'
import {
  assessAuthoringVisualBriefFreshness,
  createAuthoringVisualBrief,
  finalizeAuthoringVisualBrief,
  reconcileAuthoringVisualBrief
} from '../services/agents/authoring/authoringVisualBrief.js'
import { createWritingDocument } from '../services/writing/writingDocumentSchema.js'

vi.mock('../services/advisorTaskService', () => ({
  requestAdvisorTask: vi.fn(async () => ({ advice: ['续写的下一句。'] }))
}))

describe('inline writing suggestion trigger', () => {
  it('triggers after substantive text at either input or a settled cursor position', () => {
    const stem = '潮水漫过台阶，林昭停下脚步，听见门后传来一阵很轻的呼吸，他没有立刻回头，只把手慢慢按在门闩上'
    const input = (ending, extra = {}) => ({ content: `${stem}${ending}`, cursorPos: `${stem}${ending}`.length, inputType: 'input', ...extra })
    expect(shouldTriggerWritingAgent(input('。'))).toBe(true)
    expect(shouldTriggerWritingAgent(input('，'))).toBe(true)
    expect(shouldTriggerWritingAgent(input('a'))).toBe(true)
    expect(shouldTriggerWritingAgent(input('。', { hasSelection: true }))).toBe(false)
    expect(shouldTriggerWritingAgent({ content: stem, cursorPos: 0, inputType: 'cursor' })).toBe(true)
    expect(shouldTriggerWritingAgent({ content: stem, cursorPos: 8, inputType: 'cursor' })).toBe(true)
    expect(shouldTriggerWritingAgent({ content: '短句。', cursorPos: 3, inputType: 'cursor' })).toBe(false)
    const chapterOpening = '细雨落在深夜空荡的站台上。'
    expect(shouldTriggerWritingAgent({
      content: chapterOpening,
      cursorPos: chapterOpening.length,
      inputType: 'input'
    })).toBe(true)
    expect(shouldTriggerWritingAgent(input('。', { currentNodeEmpty: true }))).toBe(false)
    expect(shouldTriggerWritingAgent(input('。', { interactionOwner: WRITING_INTERACTION_OWNER.COMMAND_MENU }))).toBe(false)
    expect(shouldTriggerWritingAgent(input('。', { interactionOwner: WRITING_INTERACTION_OWNER.BLOCK_REVIEW }))).toBe(false)
    expect(shouldTriggerWritingAgent(input('。', { interactionOwner: WRITING_INTERACTION_OWNER.QUICK_WORD }))).toBe(false)
    expect(shouldTriggerWritingAgent(input('。', { interactionOwner: WRITING_INTERACTION_OWNER.INLINE_REVIEW }))).toBe(true)
    expect(resolveWritingInteractionOwner({ quickWordActive: true, inlineSuggestionVisible: true })).toBe(WRITING_INTERACTION_OWNER.QUICK_WORD)
    expect(resolveWritingInteractionOwner({ blockPreviewOpen: true, quickWordActive: true })).toBe(WRITING_INTERACTION_OWNER.BLOCK_REVIEW)
  })

  it('coalesces duplicate input and cursor notifications for one caret revision', async () => {
    vi.useFakeTimers()
    try {
      const { requestAdvisorTask } = await import('../services/advisorTaskService')
      requestAdvisorTask.mockClear()
      const snapshot = {
        content: '潮水漫过台阶，林昭停下脚步，听见门后传来很轻的呼吸。',
        cursorPos: 27,
        documentId: 'ch-dedupe',
        chapterId: 'ch-dedupe'
      }
      const agent = useWritingAgent({
        enabled: true,
        debounceMs: 20,
        resolveProviderCredential: async () => true,
        getContext: () => snapshot,
        getSnapshot: () => snapshot
      })
      const input = {
        ...snapshot,
        inputType: 'cursor',
        currentNodeEmpty: false,
        interactionOwner: WRITING_INTERACTION_OWNER.EDITOR
      }
      agent.onInput(input)
      agent.onInput(input)
      await vi.advanceTimersByTimeAsync(25)
      expect(requestAdvisorTask).toHaveBeenCalledTimes(1)

      agent.onInput(input)
      await vi.advanceTimersByTimeAsync(25)
      expect(requestAdvisorTask).toHaveBeenCalledTimes(1)
      agent.cancel('test-cleanup')
    } finally {
      vi.useRealTimers()
    }
  })

  it('keeps the generation target metadata when cycling alternatives', async () => {
    const { readFileSync } = await import('node:fs')
    const { resolve } = await import('node:path')
    const source = readFileSync(resolve(__dirname, '../composables/useWritingAgent.js'), 'utf8')
    const cycleBody = source.slice(source.indexOf('function cycleSuggestion'), source.indexOf('function undoLastApply'))
    expect(cycleBody).toContain('...(activeCandidateContext || {})')
    expect(source).toContain('activeCandidateContext = Object.freeze({')
    expect(source).toContain("snapshot.documentRole === 'exploration' && snapshot.documentId")
  })
})

describe('authoring project adapter', () => {
  it('projects writing and experience state into one project/document revision', async () => {
    const adapter = createAuthoringProjectAdapter({
      projectId: 'wb-1',
      projectRevision: 'project-r8',
      document: { id: 'chapter-3', revision: 'doc-r5', text: '潮水漫过台阶。' },
      narrative: { sessionId: 'session-2', sceneRevision: 'scene-r4' }
    })
    expect(adapter.getProject()).toEqual({ id: 'wb-1', revision: 'project-r8' })
    expect(adapter.getDocumentTarget()).toMatchObject({ id: 'chapter-3', revision: 'doc-r5' })
    expect(adapter.getNarrativeTarget()).toMatchObject({ id: 'session-2', revision: 'scene-r4' })

    const manuscriptLocator = { kind: 'manuscript', documentId: 'chapter-1', chapterId: 'chapter-1', unitId: 'unit-1', nodeId: 'node-1' }
    expect(sourceRefForAuthoringEvidenceLocator(manuscriptLocator)).toBe('node:chapter-1:node-1')
    expect(normalizeAuthoringEvidence({
      projectId: 'book-knowledge',
      sourceRef: 'node:wrong-document:node-1',
      authority: 'manuscript',
      label: '错误来源',
      excerpt: '不得接受来源和 locator 不一致的证据。',
      revision: 'manuscript-r1',
      locator: manuscriptLocator
    }, { projectId: 'book-knowledge' })).toBe(null)
    const evidenceEnvelope = createAuthoringEvidenceEnvelope({
      projectId: 'book-knowledge',
      queryIntent: 'calculation',
      question: '十二公里分三天，每天多少？',
      evidence: [{
        projectId: 'book-knowledge',
        sourceRef: 'node:chapter-1:node-1',
        authority: 'manuscript',
        label: '第一章 · 路程',
        excerpt: '艾德加要在三天内走完十二公里。',
        revision: 'manuscript-r1',
        locator: manuscriptLocator
      }, {
        projectId: 'book-knowledge',
        sourceRef: 'exploration:note-1',
        authority: 'suggestion',
        label: '速度速记',
        excerpt: '也许可以让他走得更快。',
        revision: 'exploration-r1',
        locator: { kind: 'exploration', documentId: 'note-1' }
      }],
      createdAt: 1
    })
    expect(Object.isFrozen(evidenceEnvelope)).toBe(true)
    expect(evidenceEnvelope.sourceAuthorization).toMatchObject({
      mode: 'exact-read-only',
      allowedOperations: ['read-source', 'locate-source'],
      deniedOperations: expect.arrayContaining(['write-manuscript', 'write-worldbook', 'write-outline'])
    })
    const answerInput = {
      answer: '按正文数字复算，每天四公里。',
      claims: [{
        text: '正文给出了十二公里和三天。',
        confidence: 'supported',
        evidenceRefs: ['node:chapter-1:node-1', 'node:chapter-1:invented']
      }, {
        text: '速记已经成为世界事实。',
        confidence: 'supported',
        evidenceRefs: ['exploration:note-1']
      }, {
        text: '艾德加要走完这段路。',
        confidence: 'supported',
        evidenceRefs: ['node:chapter-1:node-1']
      }],
      calculations: [{
        label: '每日路程',
        inputs: [
          { label: '总路程', value: 12, unit: '公里', evidenceRefs: ['node:chapter-1:node-1'] },
          { label: '天数', value: 3, unit: '天', evidenceRefs: ['node:chapter-1:node-1'] }
        ],
        expression: '12 / 3',
        result: 999,
        unit: '公里/日'
      }, {
        label: '不安全计算',
        inputs: [{ label: '数字', value: 1, evidenceRefs: ['node:chapter-1:node-1'] }],
        expression: 'process.exit()',
        result: 1
      }]
    }
    const answer = createAuthoringKnowledgeAnswer({ evidenceEnvelope, modelOutput: answerInput, createdAt: 10 })
    expect(answer.claims.map((claim) => claim.confidence)).toEqual(['partial', 'partial', 'supported'])
    expect(answer.claims.flatMap((claim) => claim.evidenceRefs)).not.toContain('node:chapter-1:invented')
    expect(answer.calculations).toEqual([expect.objectContaining({
      label: '每日路程', expression: '12/3', result: 4, unit: '公里/日', confidence: 'supported'
    })])
    expect(answer.missingInformation).toEqual(expect.arrayContaining([
      '回答引用了未授权资料，已忽略该引用。',
      '计算式不安全或无法复算，已忽略。'
    ]))
    expect(createAuthoringKnowledgeAnswer({ evidenceEnvelope, modelOutput: answerInput, createdAt: 999 }).fingerprint)
      .toBe(answer.fingerprint)
    expect(selectAuthoringEvidenceEnvelope(answer, ['node:chapter-1:node-1'])).toMatchObject({
      kind: 'authoring-evidence-envelope',
      evidence: [expect.objectContaining({ sourceRef: 'node:chapter-1:node-1' })]
    })
    expect(selectAuthoringEvidenceEnvelope(answer, ['node:chapter-1:invented'])).toBe(null)
    expect(reconcileAuthoringKnowledgeAnswer(answer, {
      'node:chapter-1:node-1': 'manuscript-r2',
      'exploration:note-1': 'exploration-r1'
    })).toMatchObject({
      stale: true,
      staleSources: [expect.objectContaining({ sourceRef: 'node:chapter-1:node-1', reason: 'revision-changed' })]
    })

    const chapterOneDocument = createWritingDocument('艾德加在钟楼下把钥匙交给莉娜。')
    const chapterTwoDocument = createWritingDocument('莉娜在港口再次见到艾德加。')
    let knowledgeBook = {
      id: 'book-query',
      title: '雾港纪事',
      worldbookId: 'worldbook-query',
      chapters: [
        { id: 'query-chapter-1', title: '第一章', editorDocument: chapterOneDocument },
        { id: 'query-chapter-2', title: '第二章', editorDocument: chapterTwoDocument }
      ]
    }
    const queryRepositories = {
      getBook: async (projectId) => projectId === 'book-query' ? knowledgeBook : null,
      getBoundWorldbook: async () => ({
        projectId: 'book-query',
        worldbookId: 'worldbook-query',
        worldbook: {
          id: 'worldbook-query',
          entries: [{ id: 'edgar', name: '艾德加', type: 'character', content: '旧港档案员。' }, {
            id: 'foreign', projectId: 'book-foreign', name: '艾德加跨项目哨兵', content: '不得进入查询。'
          }]
        }
      }),
      listExplorations: async () => [{ id: 'query-note', role: 'exploration', title: '艾德加备忘', content: '也许让艾德加隐瞒钥匙。', revision: 1 }],
      listOutlineNodes: async () => [{ id: 'query-outline', projectId: 'book-query', title: '钥匙伏笔', intent: '第二章兑现艾德加交出的钥匙。', status: 'adopted' }],
      listOutlineEdges: async () => [],
      listMemories: async () => [{
        id: 'query-memory', scope: 'project', scopeId: 'book-query', projectId: 'book-query',
        status: 'active', content: '艾德加曾保管旧册。', sourceRef: 'node:missing:missing'
      }]
    }
    const knowledgeQuery = createAuthoringKnowledgeQuerySession({ repositories: queryRepositories, maxEvidence: 12 })
    const wholeBook = await knowledgeQuery.prepare({
      projectId: 'book-query', queryIntent: 'whole-book', question: '艾德加此前在哪几章出现？', now: 5
    })
    expect(wholeBook.ok).toBe(true)
    const wholeEvidence = wholeBook.session.evidenceEnvelope.evidence
    expect(wholeEvidence.filter((item) => item.authority === 'manuscript')).toHaveLength(2)
    expect(JSON.stringify(wholeEvidence)).not.toContain('艾德加跨项目哨兵')
    const authorizedRefs = wholeBook.session.toolAuthorization.sources.map((item) => item.sourceRef).sort()
    const serializedRefs = wholeBook.session.contextEnvelope.blocks.flatMap((block) => block.sourceRefs).sort()
    expect(authorizedRefs).toEqual(serializedRefs)
    expect(wholeBook.session.toolAuthorization.deniedOperations).toContain('write-manuscript')

    const chapterOneUnit = chapterOneDocument.content[0]
    const chapterOneNode = chapterOneUnit.content[0]
    const throughTarget = await knowledgeQuery.prepare({
      projectId: 'book-query',
      queryIntent: 'character',
      question: '挖角色：艾德加此前做过什么？',
      target: {
        projectId: 'book-query',
        documentId: 'query-chapter-1',
        chapterId: 'query-chapter-1',
        unitId: chapterOneUnit.attrs.unitId,
        nodeId: chapterOneNode.attrs.nodeId
      }
    })
    expect(throughTarget.ok).toBe(true)
    expect(throughTarget.session.retrievalScope).toBe('through-target')
    expect(throughTarget.session.evidenceEnvelope.evidence.some((item) => item.sourceRef.startsWith('node:query-chapter-2:'))).toBe(false)

    const unsavedDocument = createWritingDocument('艾德加刚在当前内存稿刻下鸦羽印记。')
    const unsavedUnit = unsavedDocument.content[0]
    const unsavedNode = unsavedUnit.content[0]
    const unsavedQuery = await knowledgeQuery.prepare({
      projectId: 'book-query',
      queryIntent: 'setting',
      question: '鸦羽印记是什么？',
      target: {
        projectId: 'book-query',
        documentId: 'query-chapter-1',
        chapterId: 'query-chapter-1',
        unitId: unsavedUnit.attrs.unitId,
        nodeId: unsavedNode.attrs.nodeId
      },
      liveSource: {
        projectId: 'book-query',
        role: 'manuscript',
        documentId: 'query-chapter-1',
        chapterId: 'query-chapter-1',
        documentRevision: 'live-chapter-r2',
        documentSchemaRevision: String(unsavedDocument.revision),
        document: unsavedDocument
      }
    })
    expect(unsavedQuery.ok).toBe(true)
    expect(unsavedQuery.session.evidenceEnvelope.evidence).toEqual(expect.arrayContaining([
      expect.objectContaining({
        sourceRef: `node:query-chapter-1:${unsavedNode.attrs.nodeId}`,
        excerpt: expect.stringContaining('鸦羽印记')
      })
    ]))
    const liveUnsavedRevisions = await knowledgeQuery.collectCurrentRevisions(unsavedQuery.session, {
      liveSource: {
        projectId: 'book-query',
        role: 'manuscript',
        documentId: 'query-chapter-1',
        chapterId: 'query-chapter-1',
        documentRevision: 'live-chapter-r2',
        documentSchemaRevision: String(unsavedDocument.revision),
        document: unsavedDocument
      }
    })
    expect(liveUnsavedRevisions[`node:query-chapter-1:${unsavedNode.attrs.nodeId}`]).toBeTruthy()
    expect(await knowledgeQuery.prepare({
      projectId: 'book-query', queryIntent: 'setting', question: '鸦羽印记是什么？',
      liveSource: {
        projectId: 'book-query', role: 'manuscript', documentId: 'query-chapter-2', chapterId: 'query-chapter-1',
        documentRevision: 'live-invalid', documentSchemaRevision: String(unsavedDocument.revision), document: unsavedDocument
      }
    })).toMatchObject({ ok: false, reason: 'knowledge-live-source-invalid' })

    const unsavedExploration = createWritingDocument('速记里刚写下尚未落盘的蓝铜钥匙。')
    const explorationQuery = await knowledgeQuery.prepare({
      projectId: 'book-query', queryIntent: 'whole-book', question: '蓝铜钥匙在哪里？',
      liveSource: {
        projectId: 'book-query', role: 'exploration', documentId: 'query-note', chapterId: '',
        documentRevision: 'live-note-r2', documentSchemaRevision: String(unsavedExploration.revision),
        title: '艾德加备忘', document: unsavedExploration
      }
    })
    expect(explorationQuery.ok).toBe(true)
    expect(explorationQuery.session.retrievalScope).toBe('whole-book')
    expect(explorationQuery.session.evidenceEnvelope.evidence).toEqual(expect.arrayContaining([
      expect.objectContaining({ sourceRef: 'exploration:query-note', excerpt: expect.stringContaining('蓝铜钥匙') })
    ]))
    const freeFromUnsavedSurface = await knowledgeQuery.prepare({
      projectId: 'book-query', queryIntent: 'free', question: '这一段怎样写得更紧？',
      target: {
        projectId: 'book-query', documentId: 'query-chapter-1', chapterId: 'query-chapter-1',
        unitId: 'unit-not-yet-persisted', nodeId: 'node-not-yet-persisted'
      },
      liveSource: {
        projectId: 'book-query', role: 'exploration', documentId: 'query-note', chapterId: '',
        documentRevision: 'live-note-r2', documentSchemaRevision: String(unsavedExploration.revision),
        title: '艾德加备忘', document: unsavedExploration
      }
    })
    expect(freeFromUnsavedSurface).toMatchObject({
      ok: true,
      session: { retrievalScope: 'project', target: null, evidenceEnvelope: { evidence: [] } }
    })

    const missing = await knowledgeQuery.prepare({
      projectId: 'book-query', queryIntent: 'setting', question: '泽尔布星人的出生地在哪里？'
    })
    expect(missing).toMatchObject({ ok: true, session: { evidenceEnvelope: { evidence: [] } } })
    const liveRevisions = await knowledgeQuery.collectCurrentRevisions(wholeBook.session)
    expect(Object.keys(liveRevisions).sort()).toEqual(authorizedRefs)
    knowledgeBook = {
      ...knowledgeBook,
      chapters: [{ ...knowledgeBook.chapters[0], editorDocument: createWritingDocument('艾德加的钥匙来源已经改写。') }, knowledgeBook.chapters[1]]
    }
    const changedRevisions = await knowledgeQuery.collectCurrentRevisions(wholeBook.session)
    expect(changedRevisions[wholeEvidence.find((item) => item.sourceRef.startsWith('node:query-chapter-1:')).sourceRef]).toBeUndefined()

    // 受限 I0 接缝（round-2 K24）：默认关闭——session 不带标记，重复准备
    // 指纹稳定（与既有路径逐位一致）。
    expect(wholeBook.session.knowledgeReadModel).toBeUndefined()
    const offRepeat = await knowledgeQuery.prepare({
      projectId: 'book-query', queryIntent: 'whole-book', question: '艾德加此前在哪几章出现？', now: 5
    })
    expect(offRepeat.session.knowledgeReadModel).toBeUndefined()
    const offThird = await knowledgeQuery.prepare({
      projectId: 'book-query', queryIntent: 'whole-book', question: '艾德加此前在哪几章出现？', now: 5
    })
    expect(offThird.session.fingerprint).toBe(offRepeat.session.fingerprint)

    const revisionByRef = Object.fromEntries(wholeEvidence.map((item) => [item.sourceRef, item.revision]))
    // 显式启用：只返回被点名的授权来源，revision 与目录直通一致。
    const bridged = await knowledgeQuery.prepare({
      projectId: 'book-query', queryIntent: 'whole-book', question: '艾德加是谁？',
      knowledgeReadModel: { enabled: true, sourceRefs: ['worldbook-entry:edgar', 'memory:query-memory'] },
      now: 6
    })
    expect(bridged.ok).toBe(true)
    expect(bridged.session.knowledgeReadModel).toMatchObject({ enabled: true, status: 'ready' })
    const bridgedRefs = bridged.session.evidenceEnvelope.evidence.map((item) => item.sourceRef).sort()
    expect(bridgedRefs).toEqual(['memory:query-memory', 'worldbook-entry:edgar'])
    expect(bridged.session.evidenceEnvelope.evidence.every(
      (item) => item.revision === revisionByRef[item.sourceRef]
    )).toBe(true)
    expect(bridged.session.evidenceEnvelope.evidence.every(
      (item) => bridged.session.toolAuthorization.sources.some((source) => source.sourceRef === item.sourceRef)
    )).toBe(true)
    expect(bridged.session.collectable !== false).toBe(true)
    const bridgedLiveRevisions = await knowledgeQuery.collectCurrentRevisions(bridged.session)
    expect(bridgedLiveRevisions['worldbook-entry:edgar']).toBe(revisionByRef['worldbook-entry:edgar'])

    // 桥接路径的时点问题：K 诚实 unknown，不足说明进入 missingInformation。
    const bridgedTime = await knowledgeQuery.prepare({
      projectId: 'book-query', queryIntent: 'whole-book', question: '艾德加是谁？',
      knowledgeReadModel: {
        enabled: true, sourceRefs: ['worldbook-entry:edgar'],
        storyTime: { timelineId: 'timeline:any', eraId: 'age-strife', ordinal: 3 }
      },
      now: 7
    })
    expect(bridgedTime.ok).toBe(true)
    expect(bridgedTime.session.knowledgeReadModel.status).toBe('ready')
    expect(bridgedTime.session.knowledgeReadModel.resultStatus).toBe('unknown')
    expect(bridgedTime.session.evidenceEnvelope.missingInformation.length).toBeGreaterThan(0)

    // 请求授权目录外的来源：typed 失败，零内容，不走旧检索补回。
    const unauthorized = await knowledgeQuery.prepare({
      projectId: 'book-query', queryIntent: 'whole-book', question: '艾德加是谁？',
      knowledgeReadModel: { enabled: true, sourceRefs: ['worldbook-entry:not-authorized'] }
    })
    expect(unauthorized).toMatchObject({ ok: false, reason: 'knowledge-read-model-source-unauthorized' })

    // 非可映射 authority（manuscript）被 K typed 拒绝 → 降级回退原检索路径，
    // 授权范围不变并标记 degraded。
    const manuscriptRef = offRepeat.session.evidenceEnvelope.evidence.find((item) => item.authority === 'manuscript').sourceRef
    // round-3 K33：全部点名来源都不可映射 → typed 终态，不回退旧检索。
    const unmappable = await knowledgeQuery.prepare({
      projectId: 'book-query', queryIntent: 'whole-book', question: '艾德加此前在哪几章出现？',
      knowledgeReadModel: { enabled: true, sourceRefs: [manuscriptRef] }
    })
    expect(unmappable).toMatchObject({ ok: false, reason: 'knowledge-read-model-no-mappable-source' })
    // 信号访问异常 = 内部故障 → 降级；降级证据严格限于点名∩授权范围。
    const degraded = await knowledgeQuery.prepare({
      projectId: 'book-query', queryIntent: 'whole-book', question: '艾德加此前在哪几章出现？',
      knowledgeReadModel: {
        enabled: true, sourceRefs: [manuscriptRef],
        signal: { get aborted() { throw new Error('poisoned-signal') } }
      }
    })
    expect(degraded.ok).toBe(true)
    expect(degraded.session.knowledgeReadModel.status).toBe('degraded')
    const degradedRefs = degraded.session.evidenceEnvelope.evidence.map((item) => item.sourceRef)
    expect(degradedRefs).toEqual([manuscriptRef])
    // 正常信号下取消仍是终态（信号检查多点之一）。
    const lateAbort = new AbortController()
    lateAbort.abort()
    const lateAborted = await knowledgeQuery.prepare({
      projectId: 'book-query', queryIntent: 'whole-book', question: '艾德加是谁？',
      knowledgeReadModel: {
        enabled: true, sourceRefs: ['worldbook-entry:edgar'], signal: lateAbort.signal
      }
    })
    expect(lateAborted).toMatchObject({ ok: false, reason: 'knowledge-read-model-aborted' })

    // round-3 复验阻断修复：接缝 typed 拒绝是终态——UI 不得自动回退旧查询，
    // 其他资料不得因此进入模型调用；作者必须看到可理解的停止原因。
    localStorage.setItem('pinax_knowledge_read_model_enabled', '1')
    const seamStopExecute = vi.fn(async (input) => {
      const refs = ((input?.envelope?.blocks) || []).flatMap((block) => block.sourceRefs || [])
      const cited = (refs.filter((ref) => ref.startsWith('node:')).concat(refs)).slice(0, 2)
      return { result: { knowledgeAnswer: { answer: '已找到相关资料。', claims: cited.map((ref) => ({ text: '引用 ' + ref, confidence: 'supported', evidenceRefs: [ref] })), missingInformation: [], calculations: [] } } }
    })
    const seamStopAssistant = useAuthoringKnowledgeAssistant({
      projectId: 'book-query',
      querySession: createAuthoringKnowledgeQuerySession({ repositories: queryRepositories, maxEvidence: 12 }),
      executeQuery: seamStopExecute
    })
    // 真实失效序列：先正常提问拿到回答证据 → 点名其中一条正文来源 →
    // 该来源从目录中消失（章内容改写使 node id 更新）→ 接缝 typed 终态。
    const firstSeamProbeAsk = await seamStopAssistant.ask({ question: '艾德加此前在哪几章出现？', appendUser: false })
    expect(firstSeamProbeAsk).toBe(true)
    const answeredRefs = seamStopAssistant.messages.value
      .filter((m) => m.role === 'assistant').at(-1).answer.evidence.map((item) => item.sourceRef)
    const targetRef = answeredRefs.find((ref) => ref.startsWith('node:'))

    recordKnowledgeSeamFocus(targetRef)
    const providerCallsBeforeStop = seamStopExecute.mock.calls.length
    const originalGetBook = queryRepositories.getBook
    const originalGetBoundWorldbook = queryRepositories.getBoundWorldbook
    queryRepositories.getBook = async () => {
      const book = await originalGetBook('book-query')
      return { ...book, chapters: [{ id: 'brand-new-chapter', title: '改写章', editorDocument: createWritingDocument('全新的正文内容。') }] }
    }
    const stoppedAsk = await seamStopAssistant.ask({ question: '再核对这一段。', appendUser: false })
    expect(stoppedAsk).toBe(false)
    expect(seamStopExecute.mock.calls.length).toBe(providerCallsBeforeStop)
    expect(seamStopAssistant.error.value).toContain('聚焦的资料当前不可用')
    // lastRequest 保留属于既有 retry 语义：重试会再次命中同一终态并再次
    // 停止，不会绕道旧检索。
    queryRepositories.getBook = originalGetBook
    queryRepositories.getBoundWorldbook = originalGetBoundWorldbook

    // round-4 K41：默认关闭时除开关键本身外零额外读取；trace 不积累敏感
    // 内容；worldbook 内容读取次数与无接缝路径一致（不多读）。
    const flagKey = 'pinax_knowledge_read_model_enabled'
    localStorage.removeItem(flagKey)
    const readCounter = { flag: 0, worldbook: 0 }
    const rawGetItem = Storage.prototype.getItem
    const getItemSpy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(function (key) {
      if (key === flagKey) readCounter.flag += 1
      if (String(key).startsWith('worldbook_')) readCounter.worldbook += 1
      return rawGetItem.call(this, key)
    })
    try {
      recordKnowledgeSeamFocus('worldbook-entry:edgar')
      const offAsk = await seamStopAssistant.ask({ question: '艾德加是谁？', appendUser: false })
      expect(offAsk).toBe(true)
      expect(readCounter.flag).toBe(1)
      expect(readCounter.worldbook).toBeLessThanOrEqual(2)
      const offTrace = JSON.stringify(window.__pinaxKnowledgeSeamTrace)
      expect(offTrace).not.toContain('旧港档案员')
      seamStopAssistant.clear()
      recordKnowledgeSeamFocus('')
    } finally {
      getItemSpy.mockRestore()
    }
    seamStopAssistant.clear()
    recordKnowledgeSeamFocus('')
    localStorage.removeItem('pinax_knowledge_read_model_enabled')

    // round-4 K42：焦点单次消费 + 实例归属校验，修复模块级焦点跨实例
    // 串扰与旧焦点无提示持续限制无关新问题。
    localStorage.setItem('pinax_knowledge_read_model_enabled', '1')
    const focusProbeExecute = vi.fn(async (input) => {
      const refs = ((input?.envelope?.blocks) || []).flatMap((block) => block.sourceRefs || [])
      // 优先引用世界书来源，让焦点消费探针能覆盖可映射路径。
      const cited = (refs.filter((ref) => ref.startsWith('worldbook-entry:')).concat(refs)).slice(0, 2)
      return { result: { knowledgeAnswer: { answer: '收到。', claims: cited.map((ref) => ({ text: '引用 ' + ref, confidence: 'supported', evidenceRefs: [ref] })), missingInformation: [], calculations: [] } } }
    })
    const focusProbeAssistant = useAuthoringKnowledgeAssistant({
      projectId: 'book-query',
      querySession: createAuthoringKnowledgeQuerySession({ repositories: queryRepositories, maxEvidence: 12 }),
      executeQuery: focusProbeExecute
    })
    // 无本实例回答证据时，陈旧焦点被忽略：走旧路径且不消费 K。
    recordKnowledgeSeamFocus('worldbook-entry:edgar')
    const staleFocusAsk = await focusProbeAssistant.ask({ question: '艾德加是谁？', appendUser: false })
    expect(staleFocusAsk).toBe(true)
    expect(focusProbeExecute).toHaveBeenCalledTimes(1)
    let probeTrace = JSON.parse(JSON.stringify(window.__pinaxKnowledgeSeamTrace))
    expect(probeTrace.seamPrepares).toBe(0)
    expect(probeTrace.staleFocusIgnored).toBeGreaterThanOrEqual(1)
    // 焦点单次消费：一次接缝提问后，后续无新点击的提问回到旧路径。
    const edgarAnswer = focusProbeAssistant.messages.value.find((m) => m.role === 'assistant')
    const mappableRef = edgarAnswer.answer.evidence.map((item) => item.sourceRef)
      .find((ref) => ref.startsWith('worldbook-entry:'))
    expect(mappableRef).toBeTruthy()
    recordKnowledgeSeamFocus(mappableRef)
    const seamAsk = await focusProbeAssistant.ask({ question: '再核对艾德加。', appendUser: false })
    expect(seamAsk).toBe(true)
    probeTrace = JSON.parse(JSON.stringify(window.__pinaxKnowledgeSeamTrace))
    expect(probeTrace.seamPrepares).toBe(1)
    const callsAfterSeam = focusProbeExecute.mock.calls.length
    const plainAsk = await focusProbeAssistant.ask({ question: '艾德加此前在哪几章出现？', appendUser: false })
    expect(plainAsk).toBe(true)
    expect(focusProbeExecute.mock.calls.length).toBe(callsAfterSeam + 1)
    probeTrace = JSON.parse(JSON.stringify(window.__pinaxKnowledgeSeamTrace))
    expect(probeTrace.seamPrepares).toBe(1, '焦点已被消费，不再进入接缝')
    focusProbeAssistant.clear()
    localStorage.removeItem('pinax_knowledge_read_model_enabled')

    // round-4 K42：接缝取消信号真实传入 prepare 并阻止发布——provider 收
    // 到 abort 前后都不发布内容。
    const cancelProbeExecute = vi.fn(async (input) => {
      const refs = ((input?.envelope?.blocks) || []).flatMap((block) => block.sourceRefs || [])
      const cited = (refs.filter((ref) => ref.startsWith('worldbook-entry:')).concat(refs)).slice(0, 2)
      return { result: { knowledgeAnswer: { answer: '收到。', claims: cited.map((ref) => ({ text: '引用 ' + ref, confidence: 'supported', evidenceRefs: [ref] })), missingInformation: [], calculations: [] } } }
    })
    const cancelSession = createAuthoringKnowledgeQuerySession({ repositories: queryRepositories, maxEvidence: 12 })
    const cancelAssistant = useAuthoringKnowledgeAssistant({
      projectId: 'book-query',
      querySession: cancelSession,
      executeQuery: cancelProbeExecute
    })
    const cancelFocusAsk = await cancelAssistant.ask({ question: '艾德加是谁？', appendUser: false })
    expect(cancelFocusAsk).toBe(true)
    const cancelAnswerRefs = cancelAssistant.messages.value.filter((m) => m.role === 'assistant').at(-1).answer.evidence.map((item) => item.sourceRef)
    const cancelController = new AbortController()
    cancelController.abort()
    const cancellingSession = createAuthoringKnowledgeQuerySession({ repositories: queryRepositories, maxEvidence: 12 })
    useAuthoringKnowledgeAssistant({
      projectId: 'book-query',
      querySession: cancellingSession,
      executeQuery: cancelProbeExecute
    })
    const cancelTargetRef = cancelAnswerRefs.find((ref) => ref.startsWith('worldbook-entry:'))
    expect(cancelTargetRef).toBeTruthy()
    recordKnowledgeSeamFocus(cancelTargetRef)
    // 直接以已取消信号构造接缝请求：prepare 必须终态失败且零发布。
    const cancelledPrepared = await cancellingSession.prepare({
      projectId: 'book-query', queryIntent: 'whole-book', question: '艾德加是谁？',
      knowledgeReadModel: { enabled: true, sourceRefs: [cancelTargetRef], signal: cancelController.signal }
    })
    expect(cancelledPrepared).toMatchObject({ ok: false, reason: 'knowledge-read-model-aborted' })
    recordKnowledgeSeamFocus('')
    localStorage.removeItem('pinax_knowledge_read_model_enabled')

    // 生命周期（round-2 K25）：接缝遵守检索作用域——target 之前的授权目录
    // 才可引用；target 之后的来源不在裁剪后的目录里，typed 失败。重复
    // 启用准备指纹稳定，桥接 scope 不跨请求残留。
    const currentChapterTwoRef = offRepeat.session.evidenceEnvelope.evidence
      .find((item) => item.sourceRef.startsWith('node:query-chapter-2:'))?.sourceRef
    expect(currentChapterTwoRef).toBeTruthy()
    const scoped = await knowledgeQuery.prepare({
      projectId: 'book-query', queryIntent: 'setting', question: '艾德加是谁？',
      target: { chapterId: 'query-chapter-1' },
      knowledgeReadModel: { enabled: true, sourceRefs: [currentChapterTwoRef] }
    })
    expect(scoped).toMatchObject({ ok: false, reason: 'knowledge-read-model-source-unauthorized' })
    const through = await knowledgeQuery.prepare({
      projectId: 'book-query', queryIntent: 'setting', question: '艾德加是谁？',
      target: { chapterId: 'query-chapter-2' },
      knowledgeReadModel: { enabled: true, sourceRefs: ['worldbook-entry:edgar'] }
    })
    expect(through.ok).toBe(true)
    expect(through.session.knowledgeReadModel.status).toBe('ready')
    expect(through.session.retrievalScope).toBe('through-target')
    const throughRepeat = await knowledgeQuery.prepare({
      projectId: 'book-query', queryIntent: 'setting', question: '艾德加是谁？',
      target: { chapterId: 'query-chapter-2' },
      knowledgeReadModel: { enabled: true, sourceRefs: ['worldbook-entry:edgar'] }
    })
    expect(throughRepeat.session.fingerprint).toBe(through.session.fingerprint)

    // 验收缺口修复（round-2 复验）：取消是终态——不降级、不回退旧检索、
    // 零内容发布。
    const abortedController = new AbortController()
    abortedController.abort()
    const abortedSeam = await knowledgeQuery.prepare({
      projectId: 'book-query', queryIntent: 'whole-book', question: '艾德加是谁？',
      knowledgeReadModel: {
        enabled: true, sourceRefs: ['worldbook-entry:edgar'], signal: abortedController.signal
      }
    })
    expect(abortedSeam).toMatchObject({ ok: false, reason: 'knowledge-read-model-aborted' })

    // 预算耗尽不是故障：K 的答案（含空）必须被尊重，不回退旧检索绕过预算。
    const tinyBudget = await knowledgeQuery.prepare({
      projectId: 'book-query', queryIntent: 'whole-book', question: '艾德加是谁？',
      knowledgeReadModel: {
        enabled: true, sourceRefs: ['worldbook-entry:edgar', 'memory:query-memory'],
        budget: { maxOutputItems: 1, maxOutputChars: 400 }
      }
    })
    expect(tinyBudget.ok).toBe(true)
    expect(tinyBudget.session.knowledgeReadModel.status).toBe('ready')
    expect(tinyBudget.session.evidenceEnvelope.evidence.length).toBeLessThanOrEqual(1)
    expect(tinyBudget.session.knowledgeReadModel.resultStatus === 'partial'
      || tinyBudget.session.knowledgeReadModel.resultStatus === 'ready').toBe(true)

    // requiredSourceRefs：接缝模式下请求集必须覆盖必需来源，否则 typed 失败；
    // 覆盖但被预算裁掉时，从授权目录补齐，绝不让必需来源缺席却标 ready。
    const requiredNotRequested = await knowledgeQuery.prepare({
      projectId: 'book-query', queryIntent: 'whole-book', question: '艾德加是谁？',
      requiredSourceRefs: ['memory:query-memory'],
      knowledgeReadModel: { enabled: true, sourceRefs: ['worldbook-entry:edgar'] }
    })
    expect(requiredNotRequested).toMatchObject({ ok: false, reason: 'knowledge-read-model-required-source-not-requested' })
    // round-3 K31：必需来源装不进预算 → typed 失败，不补回原文绕过。
    const requiredTooTight = await knowledgeQuery.prepare({
      projectId: 'book-query', queryIntent: 'whole-book', question: '艾德加是谁？',
      requiredSourceRefs: ['memory:query-memory', 'worldbook-entry:edgar'],
      knowledgeReadModel: {
        enabled: true, sourceRefs: ['worldbook-entry:edgar', 'memory:query-memory'],
        budget: { maxOutputItems: 1, maxOutputChars: 400 }
      }
    })
    expect(requiredTooTight).toMatchObject({ ok: false, reason: 'knowledge-read-model-required-source-does-not-fit' })
    const requiredIncluded = await knowledgeQuery.prepare({
      projectId: 'book-query', queryIntent: 'whole-book', question: '艾德加是谁？',
      requiredSourceRefs: ['memory:query-memory', 'worldbook-entry:edgar'],
      knowledgeReadModel: {
        enabled: true, sourceRefs: ['worldbook-entry:edgar', 'memory:query-memory'],
        budget: { maxOutputItems: 12, maxOutputChars: 12000 }
      }
    })
    expect(requiredIncluded.ok).toBe(true)
    const requiredRefsReturned = requiredIncluded.session.evidenceEnvelope.evidence.map((item) => item.sourceRef).sort()
    expect(requiredRefsReturned).toEqual(['memory:query-memory', 'worldbook-entry:edgar'])

    // liveSource（未保存正文）+ 接缝：live 校验失败时整个 prepare 仍
    // fail-closed，桥接不绕过 liveSource 合同。
    const livePlusSeam = await knowledgeQuery.prepare({
      projectId: 'book-query', queryIntent: 'whole-book', question: '艾德加是谁？',
      liveSource: { projectId: 'book-query', role: 'manuscript', chapterId: 'query-chapter-1', documentId: 'wrong', documentRevision: 'r1', document: chapterOneDocument },
      knowledgeReadModel: { enabled: true, sourceRefs: ['worldbook-entry:edgar'] }
    })
    expect(livePlusSeam).toMatchObject({ ok: false, reason: 'knowledge-live-source-invalid' })

    const visualDocument = createWritingDocument('雨水沿着铜窗流下。\n\n艾德加把蓝铜钥匙放在桌上。')
    const visualUnit = visualDocument.content[0]
    const visualNode = visualUnit.content[0]
    const visualInput = {
      sessionId: 'visual-session-1',
      pane: 'main',
      projectId: 'book-visual',
      role: 'manuscript',
      documentId: 'visual-chapter',
      chapterId: 'visual-chapter',
      documentRevision: 'document-r4',
      documentSchemaRevision: String(visualDocument.revision),
      document: visualDocument,
      selection: {
        empty: false,
        text: '蓝铜钥匙放在桌上',
        markdownFrom: 14,
        markdownTo: 23,
        unitId: visualUnit.attrs.unitId,
        unitRevision: visualUnit.attrs.unitRevision,
        nodeId: visualNode.attrs.nodeId,
        nodeRevision: visualNode.attrs.nodeRevision,
        endUnitId: visualUnit.attrs.unitId,
        endUnitRevision: visualUnit.attrs.unitRevision,
        endNodeId: visualNode.attrs.nodeId,
        endNodeRevision: visualNode.attrs.nodeRevision
      },
      sceneProjection: {
        projectId: 'book-visual',
        chapterId: 'visual-chapter',
        activeUnitId: visualUnit.attrs.unitId,
        projectionFingerprint: 'scene-r4',
        sourceRefs: ['chapter:visual-chapter'],
        presentCharacters: [{
          id: 'edgar', name: '艾德加', goal: '藏起钥匙', mood: '警觉', sourceRefs: ['worldbook-entry:edgar']
        }],
        location: { id: 'harbor', name: '雾港仓库', region: '旧港', sourceRefs: ['worldbook-entry:harbor'] },
        time: { id: 'midnight', label: '深夜', period: '午夜', sourceRefs: ['scene-anchor:visual'] }
      },
      worldbookEntries: [
        { id: 'edgar', name: '艾德加', type: 'character', content: '旧港档案员，随身带着蓝铜钥匙。' },
        { id: 'harbor', name: '雾港仓库', type: 'location', content: '终年潮湿的旧仓库。' }
      ]
    }
    const visualBrief = createAuthoringVisualBrief(visualInput)
    expect(Object.isFrozen(visualBrief)).toBe(true)
    expect(visualBrief).toMatchObject({
      kind: 'authoring-visual-brief',
      status: 'prepared',
      sessionId: 'visual-session-1',
      projectId: 'book-visual',
      pane: 'main',
      source: {
        projectId: 'book-visual', documentId: 'visual-chapter', chapterId: 'visual-chapter',
        documentRevision: 'document-r4', documentSchemaRevision: '0',
        unitId: visualUnit.attrs.unitId, unitRevision: '0', nodeId: visualNode.attrs.nodeId, nodeRevision: '0'
      },
      promptSource: { kind: 'selection', text: '蓝铜钥匙放在桌上', range: { from: 14, to: 23 } }
    })
    expect(visualBrief.scene.sources).toEqual([
      expect.objectContaining({ id: 'character:edgar', selected: false, available: true, sourceRef: 'worldbook-entry:edgar' }),
      expect.objectContaining({ id: 'location:harbor', selected: false, available: true, sourceRef: 'worldbook-entry:harbor' }),
      expect.objectContaining({ id: 'time:midnight', selected: false, available: true })
    ])
    const unitFallbackBrief = createAuthoringVisualBrief({
      ...visualInput,
      selection: { ...visualInput.selection, empty: true, text: '' }
    })
    expect(unitFallbackBrief.promptSource).toMatchObject({
      kind: 'writing-unit',
      text: expect.stringContaining('艾德加把蓝铜钥匙放在桌上。')
    })
    expect(createAuthoringVisualBrief(JSON.parse(JSON.stringify(visualInput))).fingerprint).toBe(visualBrief.fingerprint)
    const textOnlyVisualBrief = finalizeAuthoringVisualBrief(visualBrief, { prompt: '只画蓝铜钥匙' })
    expect(textOnlyVisualBrief).toMatchObject({
      selectedSceneSourceIds: [],
      selectedSceneSources: [],
      sourceRefs: ['chapter:visual-chapter']
    })
    expect(textOnlyVisualBrief.generationPrompt).toBe('只画蓝铜钥匙')

    const finalizedVisualBrief = finalizeAuthoringVisualBrief(visualBrief, {
      prompt: '一把蓝铜钥匙静置在潮湿木桌上',
      selectedSceneSourceIds: ['time:midnight', 'location:harbor', 'character:edgar']
    })
    expect(finalizedVisualBrief).toMatchObject({
      status: 'finalized',
      prompt: '一把蓝铜钥匙静置在潮湿木桌上',
      selectedSceneSourceIds: ['character:edgar', 'location:harbor', 'time:midnight'],
      sourceRefs: expect.arrayContaining([
        'chapter:visual-chapter',
        'worldbook-entry:edgar',
        'worldbook-entry:harbor',
        `scene-projection:visual-chapter:${visualUnit.attrs.unitId}`
      ])
    })
    expect(finalizedVisualBrief.generationPrompt).toContain('人物：艾德加')
    expect(finalizeAuthoringVisualBrief(visualBrief, {
      prompt: '一把蓝铜钥匙静置在潮湿木桌上',
      selectedSceneSourceIds: ['character:edgar', 'time:midnight', 'location:harbor']
    }).fingerprint).toBe(finalizedVisualBrief.fingerprint)
    expect(assessAuthoringVisualBriefFreshness(finalizedVisualBrief, visualInput)).toEqual({
      fresh: true,
      stale: false,
      detached: false,
      staleSources: []
    })
    expect(reconcileAuthoringVisualBrief(finalizedVisualBrief, visualInput)).toMatchObject({
      fresh: true, stale: false, detached: false, staleSources: []
    })

    const changedVisualInputs = [
      ['projectId', (value) => { value.projectId = 'another-book' }],
      ['documentId', (value) => { value.documentId = 'another-document' }],
      ['documentRevision', (value) => { value.documentRevision = 'document-r5' }],
      ['documentSchemaRevision', (value) => { value.documentSchemaRevision = '1' }],
      ['unitId', (value) => { value.selection.unitId = 'another-unit' }],
      ['unitRevision', (value) => { value.selection.unitRevision = 1 }],
      ['nodeId', (value) => { value.selection.nodeId = 'another-node' }],
      ['nodeRevision', (value) => { value.selection.nodeRevision = 1 }],
      ['sceneRevision', (value) => { value.sceneProjection.projectionFingerprint = 'scene-r5' }],
      ['sourceRevision', (value) => { value.worldbookEntries[0].content = '艾德加的设定已经修改。' }]
    ]
    for (const [field, mutate] of changedVisualInputs) {
      const changed = JSON.parse(JSON.stringify(visualInput))
      mutate(changed)
      const assessment = assessAuthoringVisualBriefFreshness(finalizedVisualBrief, changed)
      expect(assessment.stale, field).toBe(true)
      expect(assessment.staleSources.some((issue) => issue.field === field), field).toBe(true)
    }
    expect(createAuthoringVisualBrief({ pane: 'main', projectId: 'book-visual' })).toBe(null)
    expect(finalizeAuthoringVisualBrief(visualBrief, { selectedSceneSourceIds: ['character:missing'] })).toBe(null)
    expect(assessAuthoringVisualBriefFreshness(finalizedVisualBrief, {})).toMatchObject({
      stale: true,
      detached: true,
      staleSources: [expect.objectContaining({ reason: 'source-missing' })]
    })
    const paneMissingInput = JSON.parse(JSON.stringify(visualInput))
    delete paneMissingInput.pane
    expect(assessAuthoringVisualBriefFreshness(finalizedVisualBrief, paneMissingInput)).toMatchObject({
      fresh: false,
      stale: true,
      detached: true,
      staleSources: expect.arrayContaining([expect.objectContaining({ field: 'pane', reason: 'pane-missing' })])
    })
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
    const { useAuthoringReviewWorkflow } = await import('../composables/useAuthoringReviewWorkflow.js')
    const { requestAdvisorTask } = await import('../services/advisorTaskService.js')
    const previousAdvisorImplementation = requestAdvisorTask.getMockImplementation()
    const source = { pane: 'main', projectId: 'review-book', documentRole: 'manuscript', documentId: 'review-chapter', chapterId: 'review-chapter', documentRevision: '1', title: '审稿样本', document: createWritingDocument(Array.from({ length: 9 }, (_, i) => `第${i}段，小舟停在岸边，船夫回头看了看远处的灯。`).join('\n\n')) }
    const scope = effectScope()
    const owner = scope.run(() => useAuthoringReviewWorkflow({ captureSource: () => source, captureLiveSource: () => source, currentTitle: () => source.title, worldbookEntries: () => [], sceneProjection: () => null, captureSurface: () => null, closeOtherPanel: () => {}, hideTransientTools: () => {}, reconcileSources: ref(0) }))
    owner.open({ goalMode: true })
    const ack = { schemaVersion: 1, skillId: 'motivation-causality', skillVersion: 1, outputSchema: 'writing-skill-findings.v1', enforcement: 'applied' }
    requestAdvisorTask.mockReset()
    requestAdvisorTask.mockResolvedValueOnce({ meta: { writingSkill: ack }, result: { findings: [] } })
      .mockResolvedValue({ meta: { writingSkill: { ...ack, enforcement: 'validated-only' } }, result: { findings: [] } })
    await owner.run({ goal: '检查动机', skillId: 'motivation-causality', scope: 'chapter' })
    expect(owner.completedBatches.value).toBe(1)
    expect(owner.retryAvailable.value).toBe(true)
    expect(owner.error.value).toContain('尚未执行')
    const calls = requestAdvisorTask.mock.calls.length
    const failedCount = owner.totalBatches.value - 1
    expect(requestAdvisorTask.mock.calls[0][0].options.writingSkill.taskKind).toBe('goal-review')
    requestAdvisorTask.mockResolvedValue({ meta: { writingSkill: ack }, result: { findings: [] } })
    await owner.run({ retry: true })
    expect(requestAdvisorTask.mock.calls.length - calls).toBe(failedCount)
    expect(owner.completedBatches.value).toBe(owner.totalBatches.value)
    expect(owner.retryAvailable.value).toBe(false)
    source.document = createWritingDocument(Array.from({ length: 60 }, (_, i) => `第${i}段，小舟停在岸边，船夫回头看了看远处的灯。`).join('\n\n'))
    source.documentRevision = '2'
    await owner.run({ goal: '检查动机', skillId: 'motivation-causality', scope: 'chapter' })
    expect(owner.completedBatches.value).toBe(8)
    expect(owner.totalBatches.value).toBeGreaterThan(8)
    expect(owner.retryAvailable.value).toBe(true)
    const beforeContinue = requestAdvisorTask.mock.calls.length
    const remaining = owner.totalBatches.value - 8
    await owner.run({ retry: true })
    expect(requestAdvisorTask.mock.calls.length - beforeContinue).toBe(remaining)
    expect(owner.completedBatches.value).toBe(owner.totalBatches.value)
    expect(owner.retryAvailable.value).toBe(false)
    scope.stop()
    requestAdvisorTask.mockReset().mockImplementation(previousAdvisorImplementation)
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
  it("auto-commits routine derived facts and surfaces locked conflicts（合并4例）", async () => {
{
const applyDerived = vi.fn(async () => ({ revision: 'derived-r3' }))
    const workflow = createAuthoringObserverWorkflow({ derive: vi.fn(async () => ({
      observations: [
        {
          id: 'o1',
          kind: 'relation',
          authority: 'derived',
          text: '林昭信任顾远',
          subjectId: 'character:lin-zhao',
          objectId: 'character:gu-yuan'
        },
        { id: 'o2', kind: 'identity', conflictsWith: 'locked:char-1', text: '林昭改名' }
      ]
    })), applyDerived })
    const result = await workflow.run({
      task: { id: 'observer.relations.derive' },
      request: {
        target: {
          type: 'document',
          id: 'document:chapter-2',
          documentId: 'document:chapter-2',
          revision: 'receipt-r2',
          sourceDocumentRevision: 'doc-r2'
        },
        intent: {
          provenance: {
            projectId: 'book-1',
            documentId: 'document:chapter-2',
            chapterId: 'chapter-2',
            unitId: 'unit-4',
            unitRevision: 3,
            documentRevision: 'doc-r2',
            sourceRefs: ['chapter:chapter-2'],
            derivedAt: 1_777_000_000_000
          }
        }
      },
      context: { envelope: {} }
    })
    expect(applyDerived).toHaveBeenCalledWith([
      expect.objectContaining({
        id: 'o1',
        documentId: 'document:chapter-2',
        schemaVersion: 1,
        derivedAt: 1_777_000_000_000,
        status: 'applied',
        target: expect.objectContaining({
          documentId: 'document:chapter-2',
          chapterId: 'chapter-2',
          unitId: 'unit-4',
          revision: 'receipt-r2',
          sourceDocumentRevision: 'doc-r2'
        })
      })
    ], expect.objectContaining({
      target: expect.objectContaining({ documentId: 'document:chapter-2' }),
      provenance: expect.objectContaining({ documentId: 'document:chapter-2', schemaVersion: 1 })
    }))
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
      subjectId: 'character:lin-zhao',
      objectId: 'character:gu-yuan',
      sourceRefs: ['turn:t8', 'turn:t8', 'chapter:c2'],
      baseRevision: 'doc-r5'
    })
    expect(observation).toMatchObject({
      id: 'o9',
      kind: 'relation',
      authority: 'derived',
      baseRevision: 'doc-r5',
      conflictsWith: null,
      status: 'applied',
      identityStatus: 'resolved'
    })
    expect(observation.sourceRefs).toEqual(['turn:t8', 'chapter:c2'])
    expect(Object.isFrozen(observation)).toBe(true)

    const unresolved = normalizeObservation({
      id: 'o10',
      kind: 'relation',
      text: '阿七信任顾远',
      subject: '阿七',
      object: '顾远'
    })
    expect(unresolved).toMatchObject({ status: 'candidate', identityStatus: 'unresolved' })

    const ambiguous = deriveRelationsFromDelta({
      text: '阿七信任顾远。',
      knownIdentities: [
        { id: 'character:lin-zhao', name: '林昭', aliases: ['阿七'] },
        { id: 'character:lin-qi', name: '林七', aliases: ['阿七'] },
        { id: 'character:gu-yuan', name: '顾远' }
      ]
    })
    expect(ambiguous[0]).toMatchObject({
      subject: '阿七',
      subjectId: '',
      objectId: 'character:gu-yuan',
      ambiguous: true,
      identityStatus: 'ambiguous'
    })
}
{
const applyDerived = vi.fn()
    const workflow = createAuthoringObserverWorkflow({
      derive: vi.fn(async () => ({ observations: [{ id: 'o-stale', kind: 'event', text: '发现密道' }] })),
      applyDerived
    })
    const result = await workflow.run({
      task: { id: 'observer.events.derive' },
      request: { target: { id: 'doc-stale', revision: 'r-old' }, intent: {} },
      context: { envelope: {}, isCurrent: () => false }
    })
    expect(result).toMatchObject({ status: 'stale', applied: null })
    expect(applyDerived).not.toHaveBeenCalled()
}
})
})

describe('authoring observer scheduler', () => {
  it("coalesces by document revision, waits for editor idle, and cancels superseded work（合并5例）", async () => {
{
vi.useFakeTimers()
    try {
      const run = vi.fn(async (delta) => ({ status: 'completed', applied: delta.documentRevision }))
      const onSettled = vi.fn()
      const scheduler = createAuthoringObserverScheduler({ run, idleDelayMs: 500, onSettled })

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
      expect(onSettled).toHaveBeenCalledTimes(2)
      expect(onSettled).toHaveBeenCalledWith(expect.objectContaining({
        status: 'completed',
        key: 'doc-1',
        target: expect.objectContaining({ documentId: 'doc-1', revision: 'doc-r2' }),
        result: expect.objectContaining({ status: 'completed', applied: 'doc-r2' }),
        error: null
      }))
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
      const onSettled = vi.fn()
      const scheduler = createAuthoringObserverScheduler({ run, idleDelayMs: 100, onResult, onSettled })

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
      expect(onSettled).toHaveBeenCalledWith(expect.objectContaining({
        status: 'stale',
        key: 'doc-9',
        target: expect.objectContaining({
          type: 'document',
          documentId: 'doc-9',
          revision: 'doc-r2'
        }),
        result: expect.objectContaining({ status: 'stale' }),
        error: null
      }))
      expect(scheduler.pendingCount()).toBe(0)

      const frozenSettled = vi.fn()
      const staleScheduler = createAuthoringObserverScheduler({
        run: async () => ({ status: 'completed' }),
        idleDelayMs: 10,
        onResult,
        onSettled: frozenSettled
      })
      staleScheduler.scheduleObservers({ documentId: 'doc-x', documentRevision: 'old-rev', expectedRevision: 'new-rev' })
      await vi.advanceTimersByTimeAsync(50)
      expect(staleScheduler.pendingCount()).toBe(0)
      expect(onResult).not.toHaveBeenCalled()
      expect(frozenSettled).toHaveBeenCalledWith(expect.objectContaining({
        status: 'stale',
        key: 'doc-x',
        result: null,
        error: null
      }))
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
    const onSettled = vi.fn()
    const scheduler = createAuthoringObserverScheduler({
      invalidate: async () => { throw new Error('invalidate-failed') },
      run: async (delta) => calls.push(['run', delta.revision]),
      onSettled
    })
    scheduler.schedule({ sourceRefs: ['chapter:1'], revision: 'rev-4' })
    const results = await scheduler.flush()
    expect(calls).toEqual([])
    expect(results[0].ok).toBe(false)
    expect(results[0].stage).toBe('invalidate')
    expect(onSettled).toHaveBeenCalledWith(expect.objectContaining({
      status: 'failed',
      key: 'source:chapter:1@rev-4',
      target: expect.objectContaining({ type: 'document', revision: 'rev-4' }),
      result: null,
      error: expect.objectContaining({ message: 'invalidate-failed' })
    }))
}
{
let fire
    let releaseRun
    const writes = []
    const onSettled = vi.fn()
    const scheduler = createAuthoringObserverScheduler({
      delayFn: (callback) => {
        fire = callback
        return Symbol('timer')
      },
      cancelFn: vi.fn(),
      run: async (delta, execution) => {
        await new Promise((resolve) => { releaseRun = resolve })
        if (!execution.isCurrent()) return { status: 'stale', documentRevision: delta.documentRevision }
        writes.push(delta.documentRevision)
        return { status: 'completed', documentRevision: delta.documentRevision }
      },
      onSettled
    })
    scheduler.scheduleObservers({
      memoryProjectId: 'book-7',
      documentId: 'doc-in-flight',
      chapterId: 'chapter-7',
      unitId: 'unit-9',
      unitRevision: 4,
      documentRevision: 'receipt-r7',
      sourceDocumentRevision: 'source-r11',
      text: '林昭发现密道。'
    })
    const running = fire()
    await Promise.resolve()
    expect(scheduler.cancelObservers('doc-in-flight')).toBe(true)
    releaseRun()
    await running
    expect(writes).toEqual([])
    expect(onSettled).toHaveBeenCalledWith({
      status: 'stale',
      key: 'doc-in-flight',
      target: {
        type: 'document',
        id: 'doc-in-flight',
        projectId: 'book-7',
        documentId: 'doc-in-flight',
        chapterId: 'chapter-7',
        unitId: 'unit-9',
        unitRevision: 4,
        revision: 'receipt-r7',
        sourceDocumentRevision: 'source-r11'
      },
      result: { status: 'stale', documentRevision: 'receipt-r7' },
      error: null
    })
}
})
})

describe('legacy experience state bridge', () => {
  it("commits one prose result before scheduling derived observations（合并2例）", async () => {
{
const insertText = vi.fn(async () => ({ revision: 'doc-r4' }))
    const observerSchedule = { accepted: true, key: 'doc-r4:unit:u-8' }
    const scheduleObservers = vi.fn(async () => observerSchedule)
    const bridge = createLegacyExperienceStateBridge({ insertText, scheduleObservers })
    const receipt = await bridge.commitNarrativeResult({ text: '林昭推开门。', baseRevision: 'doc-r3', sourceRefs: ['turn:t8'] })
    expect(insertText).toHaveBeenCalledOnce()
    expect(scheduleObservers).toHaveBeenCalledWith(expect.objectContaining({ documentRevision: 'doc-r4' }))
    expect(insertText.mock.invocationCallOrder[0]).toBeLessThan(scheduleObservers.mock.invocationCallOrder[0])
    expect(receipt).toEqual({ revision: 'doc-r4', observerSchedule })
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

  it('forwards the edited-node delta without falling back to the whole chapter', async () => {
    const derive = vi.fn()
    const triggers = createMemoryTriggers({ derive })
    await triggers.handle({
      type: 'boundary',
      projectId: 'p-delta',
      sessionId: 's-delta',
      scopeKey: 'chapter:7',
      text: '旧开头。旧中段。新结尾。',
      changedText: '新结尾。',
      revision: 'r-delta-1'
    })
    expect(derive).toHaveBeenCalledWith(expect.objectContaining({
      text: '旧开头。旧中段。新结尾。',
      changedText: '新结尾。'
    }))
  })

  it('occupies boundary dedupe only after observer scheduling is accepted or already scheduled', async () => {
    const disabledDerive = vi.fn()
    const disabled = createMemoryTriggers({
      derive: disabledDerive,
      isAgentEnabled: () => false
    })
    const boundary = {
      type: 'boundary',
      projectId: 'p-retry',
      sessionId: 's-retry',
      scopeKey: 'chapter:7:unit:u-1',
      revision: 'r-1'
    }
    await expect(disabled.handle(boundary)).resolves.toMatchObject({
      handled: true,
      derived: false,
      reason: 'agent-disabled'
    })
    await expect(disabled.handle(boundary)).resolves.toMatchObject({ reason: 'agent-disabled' })
    expect(disabledDerive).not.toHaveBeenCalled()

    const rejectedDerive = vi.fn(async () => ({ accepted: false, reason: 'runtime-not-ready' }))
    const rejected = createMemoryTriggers({ derive: rejectedDerive })
    await expect(rejected.handle(boundary)).resolves.toMatchObject({
      derived: false,
      reason: 'runtime-not-ready'
    })
    await expect(rejected.handle(boundary)).resolves.toMatchObject({
      derived: false,
      reason: 'runtime-not-ready'
    })
    expect(rejectedDerive).toHaveBeenCalledTimes(2)

    const acceptedDerive = vi.fn(async () => ({ accepted: true, key: 'accepted-key' }))
    const accepted = createMemoryTriggers({ derive: acceptedDerive })
    await expect(accepted.handle(boundary)).resolves.toMatchObject({ derived: true })
    await expect(accepted.handle(boundary)).resolves.toMatchObject({
      handled: false,
      reason: 'duplicate-boundary'
    })
    expect(acceptedDerive).toHaveBeenCalledTimes(1)

    const duplicateDerive = vi.fn(async () => ({ accepted: false, skipped: true, reason: 'duplicate-pending' }))
    const alreadyScheduled = createMemoryTriggers({ derive: duplicateDerive })
    await expect(alreadyScheduled.handle(boundary)).resolves.toMatchObject({ derived: true })
    await expect(alreadyScheduled.handle(boundary)).resolves.toMatchObject({ reason: 'duplicate-boundary' })
    expect(duplicateDerive).toHaveBeenCalledTimes(1)
  })

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
      applyDerived: async (routine, meta) => {
        applied.push({ routine, meta })
        return { count: routine.length }
      },
      memoryTarget: { projectId: 'p1' }
    })
    const result = await runner.run({
      documentId: 'doc-1',
      documentRevision: 'doc-r7',
      sourceDocumentRevision: 'source-r12',
      memoryProjectId: 'book-1',
      chapterId: 'chapter-1',
      unitId: 'unit-2',
      unitRevision: 6,
      text: '林昭答应在天亮前返回。第二天清晨他真的回来了。',
      sourceRefs: ['turn:t8', 'chapter:c2'],
      knownNames: ['林昭'],
      lockedFacts: []
    })
    expect(result.status).toBe('completed')
    expect(result.memoryQueued).toBeGreaterThanOrEqual(1)
    expect(result.target).toEqual({
      type: 'document',
      id: 'doc-1',
      projectId: 'book-1',
      documentId: 'doc-1',
      chapterId: 'chapter-1',
      unitId: 'unit-2',
      unitRevision: 6,
      revision: 'doc-r7',
      sourceDocumentRevision: 'source-r12'
    })
    expect(result.provenance).toMatchObject({
      schemaVersion: 1,
      derivedAt: expect.any(Number),
      documentId: 'doc-1',
      documentRevision: 'source-r12',
      target: result.target
    })
    const appliedObservation = applied.flatMap((entry) => entry.routine)[0]
    expect(appliedObservation).toMatchObject({
      schemaVersion: 1,
      derivedAt: result.provenance.derivedAt,
      documentId: 'doc-1',
      target: result.target,
      provenance: result.provenance
    })
    expect(applied[0].meta).toMatchObject({ target: result.target, provenance: result.provenance })
    const stored = listMemoryCandidates({ status: 'pending' })
    expect(stored.length).toBeGreaterThanOrEqual(1)
    expect(stored[0].sourceRevision).toBe('doc-r7')
    expect(stored[0].sourceRefs).toEqual(['turn:t8', 'chapter:c2'])
}
})
})

describe('inline suggestion provider credential gate', () => {
  const SNAPSHOT = {
    content: '潮水漫过台阶，林昭站在岸边看着灯。',
    documentId: 'ch-1',
    chapterId: 'ch-1'
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('skips passive generation without provider credential（合并3例）', async () => {
    const { requestAdvisorTask } = await import('../services/advisorTaskService')
    {
      // 被动联想：无凭据 → 不发请求、不弹错、不产生请求指标。
      const agent = useWritingAgent({ enabled: true, resolveProviderCredential: async () => false })
      await agent.generate(SNAPSHOT, 16, false)
      expect(requestAdvisorTask).not.toHaveBeenCalled()
      expect(agent.error.value).toBe('')
      expect(agent.generating.value).toBe(false)
    }
    {
      // 手动触发：无凭据 → 给出可操作提示而不是 provider 报错。
      const agent = useWritingAgent({ enabled: true, resolveProviderCredential: async () => false })
      await agent.generate(SNAPSHOT, 16, true)
      expect(requestAdvisorTask).not.toHaveBeenCalled()
      expect(agent.error.value).toContain('配置模型服务')
    }
    {
      // 对照：有凭据时请求照常发出（防过度拦截）。
      const agent = useWritingAgent({ enabled: true, resolveProviderCredential: async () => true })
      await agent.generate(SNAPSHOT, 16, true)
      expect(requestAdvisorTask).toHaveBeenCalledTimes(1)
    }
    {
      // 上下文编译发生在网络请求之前；即使同步抛错，请求 owner 和 spinner
      // 也必须在同一个 finally 中释放，不能把编辑器永久锁在“正在续写”。
      const brokenSnapshot = { ...SNAPSHOT }
      Object.defineProperty(brokenSnapshot, 'contextCandidates', {
        get() {
          throw new Error('context compiler boom')
        }
      })
      const agent = useWritingAgent({ enabled: true, resolveProviderCredential: async () => true })
      await agent.generate(brokenSnapshot, 16, true)
      expect(requestAdvisorTask).toHaveBeenCalledTimes(1)
      expect(agent.requesting.value).toBe(false)
      expect(agent.generating.value).toBe(false)
      expect(agent.error.value).toContain('context compiler boom')
    }
  })

  it('keeps one editor owner: refuses manual trigger and drops late results（合并2例）', async () => {
    const { requestAdvisorTask } = await import('../services/advisorTaskService')
    const agent = useWritingAgent({
      enabled: true,
      resolveProviderCredential: async () => true,
      getContext: () => SNAPSHOT,
      getSnapshot: () => ({ ...SNAPSHOT, cursorPos: 16 }),
      canStartSuggestion: () => false
    })

    expect(agent.manualTrigger()).toBe(false)
    expect(requestAdvisorTask).not.toHaveBeenCalled()
    expect(agent.requesting.value).toBe(false)

    let resolveRequest
    requestAdvisorTask.mockImplementationOnce(() => new Promise((resolve) => { resolveRequest = resolve }))
    let canPresent = true
    const onCandidateShown = vi.fn()
    const lateAgent = useWritingAgent({
      enabled: true,
      resolveProviderCredential: async () => true,
      getSnapshot: () => ({ ...SNAPSHOT, cursorPos: 16 }),
      canStartSuggestion: () => true,
      canPresentSuggestion: () => canPresent,
      onCandidateShown
    })

    const request = lateAgent.generate(SNAPSHOT, 16, true)
    await vi.waitFor(() => expect(requestAdvisorTask).toHaveBeenCalledOnce())
    canPresent = false
    resolveRequest({ advice: ['这条迟到的联想不得覆盖块推演。'] })
    await request

    expect(lateAgent.suggestion.value).toBe('')
    expect(lateAgent.visible.value).toBe(false)
    expect(onCandidateShown).not.toHaveBeenCalled()
    expect(lateAgent.requesting.value).toBe(false)
  })

    it('re-arms temporary cancellations (cursor/scope/tool) without suppressing later dwell; user rejection still suppresses', async () => {
    vi.useFakeTimers()
    try {
      const { requestAdvisorTask } = await import('../services/advisorTaskService')
      const snapshot = {
        content: '潮水漫过台阶，林昭停下脚步，听见门后传来一阵很轻的呼吸。',
        cursorPos: 30,
        documentId: 'ch-cursor-rearm',
        chapterId: 'ch-cursor-rearm',
        editorFocused: true
      }
      const createAgent = () => useWritingAgent({
        enabled: true,
        debounceMs: 20,
        resolveProviderCredential: async () => true,
        getContext: () => snapshot,
        getSnapshot: () => snapshot
      })
      const input = {
        ...snapshot,
        inputType: 'cursor',
        currentNodeEmpty: false,
        interactionOwner: WRITING_INTERACTION_OWNER.EDITOR
      }

      const cursorMoved = createAgent()
      await cursorMoved.generate(snapshot, snapshot.cursorPos, true)
      expect(cursorMoved.suggestion.value).toBeTruthy()
      cursorMoved.cancel('cursor-move')
      cursorMoved.onInput(input)
      await vi.advanceTimersByTimeAsync(25)
      expect(requestAdvisorTask).toHaveBeenCalledTimes(2)

      requestAdvisorTask.mockClear()
      const dismissed = createAgent()
      await dismissed.generate(snapshot, snapshot.cursorPos, true)
      dismissed.cancel('user')
      dismissed.onInput(input)
      await vi.advanceTimersByTimeAsync(25)
      expect(requestAdvisorTask).toHaveBeenCalledTimes(1)

      // 作用域切换与工具接管同为临时取消:回原落笔处可重新触发。
      for (const reason of ['scope-change', 'tool-takeover']) {
        requestAdvisorTask.mockClear()
        const agent = createAgent()
        await agent.generate(snapshot, snapshot.cursorPos, true)
        agent.cancel(reason)
        agent.onInput(input)
        await vi.advanceTimersByTimeAsync(25)
        expect(requestAdvisorTask).toHaveBeenCalledTimes(2)
      }
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('inline writing agent page host', () => {
  it('owns cursor/adoption/routing and reference scope contracts（合并7例）', async () => {
    const { nextTick } = await import('vue')
    const createAgentStub = () => {
      const calls = { cancel: [], suppress: [], onInput: [] }
      return {
        calls,
        visible: ref(false),
        requesting: ref(false),
        enabled: ref(true),
        cancel: vi.fn((reason) => calls.cancel.push(reason || 'user')),
        suppress: vi.fn((reason) => calls.suppress.push(reason)),
        finishComposition: vi.fn(),
        onInput: vi.fn(),
        peek: vi.fn(() => '第一句。第二句。'),
        consume: vi.fn(() => '第一句。第二句。')
      }
    }

    // (1) 采纳提交顺序:beforeInsert → 插入 → 信任 consume → adopted → sync。
    {
      const agent = createAgentStub()
      const order = []
      const host = useInlineWritingAgentHost({ agent, readCursorSnapshot: () => ({ end: 10, text: '' }) })
      const editor = { insertPlainText: vi.fn(() => true), undo: vi.fn() }
      const adopted = host.commitAdoption('all', '第一句。第二句。', {
        editor,
        beforeInsert: () => order.push('history-seam'),
        onAdopted: () => order.push('adopted'),
        afterSync: () => order.push('sync')
      })
      expect(adopted).toBe('adopted')
      expect(order).toEqual(['history-seam', 'adopted', 'sync'])
      expect(agent.consume).toHaveBeenCalledWith('all', { ignoreRevision: true })
      expect(editor.undo).not.toHaveBeenCalled()
      expect(host.isAdoptionInFlight()).toBe(false)
    }

    // (2) 插入失败不消费;consume 数量不符 → 编辑器 undo。
    {
      const agent = createAgentStub()
      const host = useInlineWritingAgentHost({ agent, readCursorSnapshot: () => ({ end: 0, text: '' }) })
      const rejected = { insertPlainText: vi.fn(() => false), undo: vi.fn() }
      expect(host.commitAdoption('all', '文本。', { editor: rejected })).toBe('rejected')
      expect(agent.consume).not.toHaveBeenCalled()
      const mismatchAgent = { ...agent, consume: vi.fn(() => '只一段。') }
      const mismatchEditor = { insertPlainText: vi.fn(() => true), undo: vi.fn() }
      expect(useInlineWritingAgentHost({ agent: mismatchAgent, readCursorSnapshot: () => ({ end: 0, text: '' }) })
        .commitAdoption('all', '两段。', { editor: mismatchEditor })).toBe('rejected')
      expect(mismatchEditor.undo).toHaveBeenCalled()
    }

    // (3) 选区移动:真实移动或选中文本 → 取消;未移动不取消。
    {
      let snapshot = { end: 10, text: '' }
      const agent = createAgentStub()
      const host = useInlineWritingAgentHost({ agent, readCursorSnapshot: () => snapshot })
      host.setCursor(10)
      const moved = host.handleSelectionMoved({ transactionOwned: false, hasSelectionText: false })
      expect(moved.cursorMoved).toBe(false)
      expect(agent.calls.cancel).toEqual([])
      snapshot = { end: 18, text: '' }
      host.handleSelectionMoved({ transactionOwned: false, hasSelectionText: false })
      expect(agent.calls.cancel).toEqual(['cursor-move'])
      snapshot = { end: 26, text: '' }
      host.handleSelectionMoved({ transactionOwned: true, hasSelectionText: false })
      expect(agent.calls.cancel).toEqual(['cursor-move'])
    }

    // (4) dwell 调度:移动+可用+无选区 → schedule('cursor');选中文本/禁用不调度。
    {
      let snapshot = { end: 10, text: '' }
      const agent = createAgentStub()
      const host = useInlineWritingAgentHost({
        agent,
        readCursorSnapshot: () => snapshot,
        buildAgentInput: (pos) => ({ content: '正文', cursorPos: pos })
      })
      snapshot = { end: 22, text: '' }
      const moved = host.handleSelectionMoved({ transactionOwned: false, hasSelectionText: false })
      host.scheduleCursorDwell({ transactionOwned: false, hasSelectionText: false, snapshot: moved })
      expect(agent.onInput).toHaveBeenCalledTimes(1)
      expect(agent.onInput.mock.calls[0][0].inputType).toBe('cursor')
      host.scheduleCursorDwell({ transactionOwned: false, hasSelectionText: true, snapshot: { cursorMoved: true } })
      expect(agent.onInput).toHaveBeenCalledTimes(1)
      agent.enabled.value = false
      host.scheduleCursorDwell({ transactionOwned: false, hasSelectionText: false, snapshot: { cursorMoved: true, end: 30 } })
      expect(agent.onInput).toHaveBeenCalledTimes(1)
    }

    // (5) 输入路由:非 input 类型取消 dwell;组合态静默。
    {
      const agent = createAgentStub()
      const host = useInlineWritingAgentHost({
        agent,
        readCursorSnapshot: () => ({ end: 0, text: '' }),
        buildAgentInput: (pos) => ({ content: '正文', cursorPos: pos })
      })
      host.notifyEditorInput({ inputType: 'historyUndo' })
      expect(agent.calls.suppress).toContain('historyUndo')
      expect(agent.onInput).not.toHaveBeenCalled()
      host.compositionActive.value = true
      host.notifyEditorInput({ inputType: 'input', composing: false })
      expect(agent.onInput).not.toHaveBeenCalled()
    }

    // (6) 互斥仲裁:阻断性 owner 出现时抑制;解除不重复抑制。
    {
      const signals = ref({ modalOpen: false })
      const agent = createAgentStub()
      useInlineWritingAgentHost({
        agent,
        readCursorSnapshot: () => ({ end: 0, text: '' }),
        readInteractionSignals: () => signals.value
      })
      signals.value = { modalOpen: true }
      await nextTick()
      expect(agent.calls.suppress).toContain('modal')
      signals.value = { modalOpen: false }
      await nextTick()
      expect(agent.calls.suppress.filter((reason) => reason === 'modal')).toHaveLength(1)
    }

    // (7) 显式参考 owner:身份冻结、作用域绑定、请求前可用性。
    {
      const source = useAuthoringReferenceSource()
      const selected = source.select({ id: 'asset-1', title: '潮汐表', kind: 'note', content: '  黄昏起雾时数航灯。  ' }, { scopeKey: 'book-a|chapter|ch-1' })
      expect(selected.ok).toBe(true)
      expect(source.reference.value.content).toBe('黄昏起雾时数航灯。')
      expect(source.readForScope('book-a|chapter|ch-1')).not.toBeNull()
      expect(source.clearIfScopeChanged('book-a|chapter|ch-2')).toBe(true)
      expect(source.reference.value).toBeNull()
      source.select({ id: 'asset-2', content: '灯塔在一月开门。' }, { scopeKey: 'book-a|chapter|ch-2' })
      expect(source.readForScope('book-a|chapter|ch-1')).toBeNull()
      expect(source.readForScope('book-a|chapter|ch-2').id).toBe('asset-2')
      expect(source.select({ id: 'asset-3', content: '   ' }, { scopeKey: 'x' }).ok).toBe(false)
    }

    // (8) A17 故障复核·provider 迟到:请求在途时作用域取消,迟到 resolve
    // 不得显示候选、不得残留 requesting。
    {
      const { requestAdvisorTask } = await import('../services/advisorTaskService')
      let resolveLate
      requestAdvisorTask.mockImplementation(() => new Promise((resolve) => { resolveLate = resolve }))
      try {
        const live = { content: '潮水漫过台阶，林昭停下脚步，听见门后传来一阵很轻的呼吸。', cursorPos: 16, documentId: 'ch-a17-late', chapterId: 'ch-a17-late', editorFocused: true }
        const agent = useWritingAgent({
          enabled: true,
          resolveProviderCredential: async () => true,
          getContext: () => live,
          getSnapshot: () => live
        })
        const request = agent.generate(live, 16, true)
        await vi.waitFor(() => expect(requestAdvisorTask).toHaveBeenCalled())
        await new Promise((resolve) => setTimeout(resolve, 0))
        agent.cancel('scope-change')
        resolveLate({ advice: ['作用域已切换,这条迟到结果必须丢弃。'] })
        await request
        expect(agent.suggestion.value).toBe('')
        expect(agent.visible.value).toBe(false)
        expect(agent.requesting.value).toBe(false)
      } finally {
        requestAdvisorTask.mockImplementation(async () => ({ advice: ['续写的下一句。'] }))
      }
    }

    // (9) A17 故障复核·surface 销毁:编辑器插入抛错视为失败——不消费、
    // 不崩溃、采纳标志在 finally 复位,可再次采纳。
    {
      const agent = createAgentStub()
      const host = useInlineWritingAgentHost({ agent, readCursorSnapshot: () => ({ end: 0, text: '' }) })
      const destroyed = {
        insertPlainText: vi.fn(() => { throw new Error('surface destroyed') }),
        undo: vi.fn()
      }
      expect(host.commitAdoption('all', '文本。', { editor: destroyed })).toBe('rejected')
      expect(agent.consume).not.toHaveBeenCalled()
      expect(host.isAdoptionInFlight()).toBe(false)
      // 故障复位后可再次采纳:换回与插入文本一致的 consume 桩。
      agent.consume = vi.fn(() => '文本。')
      expect(host.commitAdoption('all', '文本。', { editor: { insertPlainText: vi.fn(() => true), undo: vi.fn() } })).toBe('adopted')
    }

    // (10) A17 故障复核·采纳窗口互斥:窗口内 isAdoptionInFlight 为真,
    // 第二次提交不得重入。
    {
      const calls = { cancel: [], suppress: [], onInput: [] }
      const agent = {
        visible: ref(false),
        requesting: ref(false),
        enabled: ref(true),
        cancel: vi.fn((r) => calls.cancel.push(r || 'user')),
        suppress: vi.fn(),
        finishComposition: vi.fn(),
        onInput: vi.fn(),
        consume: vi.fn(() => 'X')
      }
      const host = useInlineWritingAgentHost({ agent, readCursorSnapshot: () => ({ end: 0, text: '' }) })
      let inner = ''
      const editor = {
        insertPlainText: vi.fn(() => {
          inner = host.commitAdoption('all', 'X', { editor }) || 'falsy'
          return true
        }),
        undo: vi.fn()
      }
      const outer = host.commitAdoption('all', 'X', { editor })
      expect(outer).toBe('adopted')
      expect(inner).toBe('rejected')
      expect(host.isAdoptionInFlight()).toBe(false)
    }
  })
})

describe('ghost adoption consume after editor insert', () => {
  it('trusted consume survives the snapshot advance caused by the insert itself（合并2例）', async () => {
    const { useAuthoringGhostAdoptionWorkflow } = await import('../composables/useAuthoringGhostAdoptionWorkflow.js')
    const pending = { value: { documentRole: 'manuscript', adoptedText: '已写入正文', receipt: { id: 'receipt' }, editorResult: { unitId: 'new-unit' } } }
    const host = {
      preview: { value: { candidateId: 'candidate' } }, rehearsalDraftSource: { value: null },
      pendingAdoption: pending, composer: {}, draftText: { value: '已写入正文' },
      persistAdoption: vi.fn(() => false), observeAdoption: vi.fn(), reportObserverFailure: vi.fn(),
      consumeCharacterIfBranch: vi.fn(), captureRehearsalAdoption: vi.fn(() => { throw new Error('memory unavailable') }),
      clearAdoptedDraft: vi.fn(() => { pending.value = null }), commitUndoReceipt: vi.fn(),
      finishComposer: vi.fn(), showImpact: vi.fn(), notifySuccess: vi.fn()
    }
    const workflow = useAuthoringGhostAdoptionWorkflow(host)
    expect(await workflow.perform()).toBe(false)
    expect(host.composer.failure.code).toBe('AUTHORING_PERSIST_FAILED')
    expect(pending.value).not.toBeNull()
    expect(host.clearAdoptedDraft).not.toHaveBeenCalled()
    host.persistAdoption.mockReturnValue(true)
    expect(await workflow.perform()).toBe(true)
    expect(host.captureRehearsalAdoption).toHaveBeenCalledWith(expect.objectContaining({
      committedReceipt: expect.objectContaining({ id: 'receipt', adoptedText: '已写入正文' })
    }))
    expect(pending.value).toBeNull()
    expect(host.reportObserverFailure).toHaveBeenCalledOnce()
    expect(host.finishComposer).toHaveBeenCalledOnce()
    expect(host.commitUndoReceipt).toHaveBeenCalledOnce()
    const { requestAdvisorTask } = await import('../services/advisorTaskService')
    {
      // 复现：编辑器插入同步推进快照正文后，consume 的二次 revision 校验
      // 把刚插入的内容判为“落笔处已变化”而返回空串（页面随即回滚）。
      let live = { content: '守卫在门口停下脚步，他握紧了手里的提灯。', cursorPos: 20, documentId: 'ch-1', chapterId: 'ch-1' }
      const agent = useWritingAgent({
        enabled: true,
        resolveProviderCredential: async () => true,
        getSnapshot: () => live,
      })
      await agent.generate(live, 20, true)
      const suggested = agent.peek('all')
      expect(suggested).toBeTruthy()
      // 模拟 insertPlainText：正文同步包含建议文本，光标推进。
      live = { content: live.content + suggested, cursorPos: live.cursorPos + suggested.length, documentId: 'ch-1', chapterId: 'ch-1' }
      // 旧行为（不带 ignoreRevision）：consume 返回空串 → 页面 undo，采纳必败。
      expect(agent.consume('all')).toBe('')
      // 新行为：信任路径返回插入文本。
      expect(agent.consume('all', { ignoreRevision: true })).toBe(suggested)
      expect(requestAdvisorTask).toHaveBeenCalled()
    }
    {
      // 守卫仍需生效：快照在插入之外被改变时，默认 consume 依旧拒绝。
      let live = { content: '潮水漫过台阶，林昭站在岸边看着灯。', cursorPos: 16, documentId: 'ch-1', chapterId: 'ch-1' }
      const agent = useWritingAgent({
        enabled: true,
        resolveProviderCredential: async () => true,
        getSnapshot: () => live,
      })
      await agent.generate(live, 16, true)
      const suggested = agent.peek('all')
      live = { content: '用户自己又打了一段完全不同的文字。', cursorPos: 17, documentId: 'ch-1', chapterId: 'ch-1' }
      expect(agent.consume('all')).toBe('')
      expect(suggested).toBeTruthy()
    }
  })
})
