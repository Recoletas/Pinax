import { describe, expect, it, vi, beforeEach } from 'vitest'
import { effectScope, ref } from 'vue'
import { nextTick } from 'vue'
import { createAuthoringProjectAdapter } from '../services/agents/authoring/authoringProjectAdapter.js'
import { createAuthoringTextWorkflow } from '../services/agents/authoring/authoringTextWorkflow.js'
import {
  createAuthoringTaskDispatcher,
  getAuthoringAliasMetricSnapshot,
  resetAuthoringAliasMetric
} from '../services/agents/authoring/authoringTaskDispatcher.js'
import { generateAssistantNarrative } from '../services/agents/storyagent/assistantNarrativeGeneration.js'
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
import { applyAuthoringSearchEditorTransaction } from '../composables/useAuthoringSearchWorkflow.js'
import { useAuthoringBlockWorkflow } from '../composables/useAuthoringBlockWorkflow.js'
import { deriveNarrativeGroundingPolicy } from '../services/agents/narrativeAgentPolicy.js'
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
    const freeSourceBlocks = freeFromUnsavedSurface.session.contextEnvelope.blocks
    expect(freeSourceBlocks.some((block) => block.content.includes('当前速记（备选构思）') && block.content.includes('蓝铜钥匙'))).toBe(true)
    expect(freeSourceBlocks.flatMap((block) => block.sourceRefs)).toEqual([])
    const currentChapterDiscussion = await knowledgeQuery.prepare({
      projectId: 'book-query', queryIntent: 'free', question: '下一段怎样继续？',
      target: { projectId: 'book-query', chapterId: 'query-chapter-1' }
    })
    const discussionText = currentChapterDiscussion.session.contextEnvelope.blocks.map((block) => block.content).join('\n')
    expect(discussionText).toContain('艾德加在钟楼下把钥匙交给莉娜')
    expect(discussionText).not.toContain('莉娜在港口再次见到艾德加')
    expect(currentChapterDiscussion.session.evidenceEnvelope.evidence).toEqual([])
    expect(await knowledgeQuery.prepare({
      projectId: 'book-query', queryIntent: 'free', question: '下一段怎样继续？',
      target: { projectId: 'book-foreign', chapterId: 'query-chapter-1' }
    })).toMatchObject({ ok: false, reason: 'knowledge-target-project-mismatch' })
    expect(await knowledgeQuery.prepare({
      projectId: 'book-query', queryIntent: 'free', question: '下一段怎样继续？',
      target: { projectId: 'book-query', chapterId: 'missing-chapter' }
    })).toMatchObject({ ok: false, reason: 'knowledge-target-document-missing' })
    const liveDiscussionInput = {
      projectId: 'book-query', queryIntent: 'free', question: '下一段怎样继续？',
      liveSource: {
        projectId: 'book-query', role: 'manuscript', chapterId: 'query-chapter-1', documentId: 'query-chapter-1',
        documentRevision: 'live-r1', documentSchemaRevision: unsavedDocument.revision, document: unsavedDocument
      }
    }
    const frozenDiscussion = knowledgeQuery.prepare(liveDiscussionInput)
    liveDiscussionInput.liveSource.projectId = 'book-foreign'
    expect((await frozenDiscussion).session.contextEnvelope.blocks.some((block) => block.content.includes('鸦羽印记'))).toBe(true)
    expect(await knowledgeQuery.prepare(liveDiscussionInput)).toMatchObject({ ok: false, reason: 'knowledge-live-source-invalid' })

    const mainEditor = { replaceNodeRanges: vi.fn(() => true) }
    const dualEditor = { getActiveSource: () => ({ kind: 'chapter', id: 'query-chapter-1' }), replaceReviewRanges: vi.fn(() => true) }
    const searchPlan = { chapters: [{ chapterId: 'query-chapter-1', patches: [{ nodeId: 'node-one', start: 2, end: 4, replacement: '新词' }] }] }
    expect(applyAuthoringSearchEditorTransaction({ plan: searchPlan, mainChapterId: 'query-chapter-1', mainEditor })).toEqual({ main: true, dual: false })
    expect(mainEditor.replaceNodeRanges).toHaveBeenCalledWith([{ nodeId: 'node-one', range: { startOffset: 2, endOffset: 4 }, replacement: '新词' }], { origin: 'writing-agent' })
    expect(applyAuthoringSearchEditorTransaction({ plan: searchPlan, activePane: 'dual', dualPane: dualEditor })).toEqual({ main: false, dual: true })
    expect(applyAuthoringSearchEditorTransaction({ plan: searchPlan, mainChapterId: 'another-chapter', mainEditor })).toEqual({ main: false, dual: false })
    expect(applyAuthoringSearchEditorTransaction({ plan: { chapters: [...searchPlan.chapters, { chapterId: 'query-chapter-2', patches: [] }] }, mainChapterId: 'query-chapter-1', mainEditor })).toEqual({ main: false, dual: false })
    expect(mainEditor.replaceNodeRanges).toHaveBeenCalledTimes(1)
    const anchorDocument = createWritingDocument('门外响起三下敲击。\n\n林岚已经拆开信封，把信纸压在油灯下面。')
    const anchorUnit = anchorDocument.content[0]
    const anchorNode = anchorUnit.content.at(-1)
    const anchorWorkflow = useAuthoringBlockWorkflow({
      getTargetContext: () => ({
        document: anchorDocument, documentTextLength: 40,
        selection: { unitId: anchorUnit.attrs.unitId, nodeId: anchorNode.attrs.nodeId, end: 40, cursorLocalOffset: 20 }
      })
    })
    expect(anchorWorkflow.resolveTarget().anchorExcerpt).toBe('林岚已经拆开信封，把信纸压在油灯下面。')
    expect(anchorWorkflow.resolveTarget({ cursorLocalOffset: 8 }).anchorExcerpt).toBe('林岚已经拆开信封')
    let updateDraft, finishDraft
    const draftTarget = { projectId: 'stream-book', documentId: 'stream-chapter' }
    const streamingWorkflow = useAuthoringBlockWorkflow({
      selectedBookId: ref('stream-book'), selectedChapterId: ref('stream-chapter'),
      getTurnContext: () => ({ worldbookReady: true }), defaultTarget: () => draftTarget,
      clearPendingDraft: () => {}, notify: vi.fn(),
      runTask: (_, options) => { updateDraft = options.onDraftUpdate; return new Promise(resolve => { finishDraft = resolve }) }
    })
    const pendingStream = streamingWorkflow.run({ invocationTarget: draftTarget })
    updateDraft({ phase: 'plan', text: '规划内容不显示。' })
    expect(streamingWorkflow.composer.staleResult).toBeNull()
    updateDraft({ phase: 'write', text: ':::narration\n门内传出脚步声。' })
    expect(streamingWorkflow.composer.staleResult).toMatchObject({ text: '门内传出脚步声。', adoptable: false, streaming: true })
    expect(streamingWorkflow.preview.value).toBeNull()
    updateDraft({ phase: 'write', text: '' })
    expect(streamingWorkflow.composer.staleResult.text).toBe('')
    updateDraft({ phase: 'write', text: ':::narration\n脚步停在门后。' })
    updateDraft({ phase: 'write', text: ':::narration\n脚步停在门后。他听见钥匙转动。' })
    expect(streamingWorkflow.composer.staleResult.text).toBe('脚步停在门后。')
    finishDraft({ ok: false, reason: 'aborted', text: ':::narration\n脚步停在门后。他听见钥匙转动。' })
    await pendingStream
    expect(streamingWorkflow.composer.staleResult).toMatchObject({ text: '脚步停在门后。他听见钥匙转动。', streaming: false, adoptable: false })
    streamingWorkflow.resetScope()
    updateDraft({ phase: 'write', text: '离开后的迟到内容。' })
    expect(streamingWorkflow.composer.staleResult).toBeNull()
    for (const input of ['让林岚问出寄信人的一个可追查细节', '让林岚开始调查灯室的声响']) {
      expect(deriveNarrativeGroundingPolicy({ kernel: { blocks: [{ kind: 'turn', content: { input } }] } }).required).toBe(false)
    }
    for (const input of ['请核对周渡的人物设定', '查阅世界书资料', '核对灯塔的历史时间线', '确认人物的禁忌规则']) {
      expect(deriveNarrativeGroundingPolicy({ kernel: { blocks: [{ kind: 'turn', content: { input } }] } })).toMatchObject({ level: 'optional', required: false })
    }

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
    const firstSeamProbeAsk = await seamStopAssistant.ask({ intent: 'whole-book', question: '艾德加此前在哪几章出现？', appendUser: false })
    expect(firstSeamProbeAsk).toBe(true)
    const answeredRefs = seamStopAssistant.messages.value
      .filter((m) => m.role === 'assistant').at(-1).answer.evidence.map((item) => item.sourceRef)
    const targetRef = answeredRefs.find((ref) => ref.startsWith('node:'))
    expect(targetRef).toBeTruthy()

    recordKnowledgeSeamFocus(targetRef, 'book-query')
    // 缺少作品归属的来源不得覆盖已登记焦点，也不得改写共享 trace。
    const traceBeforeUnscopedFocus = JSON.stringify(window.__pinaxKnowledgeSeamTrace)
    recordKnowledgeSeamFocus('worldbook-entry:unscoped')
    expect(JSON.stringify(window.__pinaxKnowledgeSeamTrace)).toBe(traceBeforeUnscopedFocus)
    const providerCallsBeforeStop = seamStopExecute.mock.calls.length
    const originalGetBook = queryRepositories.getBook
    const originalGetBoundWorldbook = queryRepositories.getBoundWorldbook
    queryRepositories.getBook = async () => {
      const book = await originalGetBook('book-query')
      return { ...book, chapters: [{ id: 'brand-new-chapter', title: '改写章', editorDocument: createWritingDocument('全新的正文内容。') }] }
    }
    const stoppedAsk = await seamStopAssistant.ask({ intent: 'whole-book', question: '再核对这一段。', appendUser: false })
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
      recordKnowledgeSeamFocus('worldbook-entry:edgar', 'book-query')
      const offAsk = await seamStopAssistant.ask({ intent: 'whole-book', question: '艾德加是谁？', appendUser: false })
      expect(offAsk).toBe(true)
      expect(readCounter.flag).toBe(1)
      expect(readCounter.worldbook).toBeLessThanOrEqual(2)
      const offTrace = JSON.stringify(window.__pinaxKnowledgeSeamTrace)
      expect(offTrace).not.toContain('旧港档案员')
      seamStopAssistant.clear()
      recordKnowledgeSeamFocus('', 'book-query')
    } finally {
      getItemSpy.mockRestore()
    }
    seamStopAssistant.clear()
    recordKnowledgeSeamFocus('', 'book-query')
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
    recordKnowledgeSeamFocus('worldbook-entry:edgar', 'book-query')
    const staleFocusAsk = await focusProbeAssistant.ask({ intent: 'whole-book', question: '艾德加是谁？', appendUser: false })
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
    recordKnowledgeSeamFocus(mappableRef, 'book-query')
    const seamAsk = await focusProbeAssistant.ask({ intent: 'whole-book', question: '再核对艾德加。', appendUser: false })
    expect(seamAsk).toBe(true)
    probeTrace = JSON.parse(JSON.stringify(window.__pinaxKnowledgeSeamTrace))
    expect(probeTrace.seamPrepares).toBe(1)
    const callsAfterSeam = focusProbeExecute.mock.calls.length
    const plainAsk = await focusProbeAssistant.ask({ intent: 'whole-book', question: '艾德加此前在哪几章出现？', appendUser: false })
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
    const cancelFocusAsk = await cancelAssistant.ask({ intent: 'whole-book', question: '艾德加是谁？', appendUser: false })
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
    recordKnowledgeSeamFocus(cancelTargetRef, 'book-query')
    // 直接以已取消信号构造接缝请求：prepare 必须终态失败且零发布。
    const cancelledPrepared = await cancellingSession.prepare({
      projectId: 'book-query', queryIntent: 'whole-book', question: '艾德加是谁？',
      knowledgeReadModel: { enabled: true, sourceRefs: [cancelTargetRef], signal: cancelController.signal }
    })
    expect(cancelledPrepared).toMatchObject({ ok: false, reason: 'knowledge-read-model-aborted' })
    recordKnowledgeSeamFocus('', 'book-query')
    localStorage.removeItem('pinax_knowledge_read_model_enabled')

    // PR #5: ownership is frozen before health await; stopped tasks never run in another book.
    let releaseHealth
    let health = new Promise(resolve => { releaseHealth = resolve })
    const agentProject = ref('agent-book-a')
    const agentCalls = []
    const agentEngine = {
      prepare: input => JSON.parse(JSON.stringify({ ...input, bookId: agentProject.value })),
      destination: () => ({ chapterId: 'chapter-a' }),
      healthz: () => health,
      cancel: vi.fn(async () => ({ ok: true })),
      run: vi.fn(async input => { agentCalls.push(input); input.callbacks.onTask({ taskId: 'task-a', bookId: input.prepared.bookId }); return { ok: true, finalContent: '完整候选', trace: { taskId: 'task-a' } } }),
      resume: vi.fn(async input => { agentCalls.push(input); return { ok: true, finalContent: '续接候选', trace: { taskId: input.taskId } } }),
      adopt: vi.fn(async () => ({ ok: false, error: '保存失败' }))
    }
    const agentAssistant = useAuthoringKnowledgeAssistant({ projectId: agentProject, agentEngine })
    const pendingAgent = agentAssistant.ask({ intent: 'agent', question: '写一段开场' })
    expect(agentAssistant.busy.value).toBe(true)
    agentProject.value = 'agent-book-b'
    await nextTick()
    releaseHealth({ ok: true })
    expect(await pendingAgent).toBe(false)
    expect(agentEngine.run).not.toHaveBeenCalled()
    expect(agentAssistant.messages.value).toEqual([])
    agentProject.value = 'agent-book-a'
    await nextTick()
    health = Promise.resolve({ ok: true })
    expect(await agentAssistant.ask({ intent: 'agent', question: '写一个开场' })).toBe(true)
    expect(agentCalls[0].prepared.bookId).toBe('agent-book-a')
    expect(agentAssistant.messages.value.at(-1)).toMatchObject({ kind: 'agent', status: 'completed', projectId: 'agent-book-a' })
    expect(await agentAssistant.ask({ intent: 'agent', question: '接着推进' })).toBe(true)
    expect(agentEngine.resume).toHaveBeenCalledTimes(1)
    const candidateId = agentAssistant.messages.value.at(-1).id
    expect(await agentAssistant.adoptAgentAnswer(candidateId)).toBe(false)
    expect(agentAssistant.messages.value.at(-1).adopted).not.toBe(true)
    agentEngine.adopt.mockResolvedValue({ ok: true, unitId: 'unit-agent' })
    expect(await agentAssistant.adoptAgentAnswer(candidateId)).toBe(true)
    expect(agentAssistant.messages.value.at(-1).adopted).toBe(true)
    const restoredAgent = useAuthoringKnowledgeAssistant({ projectId: agentProject, agentEngine })
    expect(restoredAgent.messages.value.at(-1)).toMatchObject({ kind: 'agent', adopted: true, text: '续接候选' })
    const existingSession = agentAssistant.sessions.value[0].sessionId
    expect(agentAssistant.newConversation()).toBe(true)
    expect(agentAssistant.messages.value).toEqual([])
    expect(agentAssistant.agentState.value.taskId).toBe('')
    expect(agentAssistant.selectSession(existingSession)).toBe(true)
    expect(agentAssistant.messages.value.at(-1).adopted).toBe(true)
    expect(agentAssistant.agentState.value.taskId).toBe('task-a')
    agentAssistant.draft.value = '未发送的旧问题'
    expect(agentAssistant.newAgentTask()).toBe(true)
    expect(agentAssistant.messages.value).toEqual([])
    expect(agentAssistant.draft.value).toBe('')
    expect(agentAssistant.agentState.value.taskId).toBe('')
    expect(agentAssistant.selectSession(existingSession)).toBe(true)
    expect(agentAssistant.messages.value.at(-1).adopted).toBe(true)

    const ratedId = agentAssistant.messages.value.at(-1).id
    expect(agentAssistant.rateMessage(ratedId, 'up')).toBe(true)
    expect(agentAssistant.messages.value.at(-1).reaction).toBe('up')
    expect(agentAssistant.rateMessage(ratedId, 'up')).toBe(true)
    expect(agentAssistant.messages.value.at(-1).reaction).toBe('')
    expect(agentAssistant.renameConversation(existingSession, '故事讨论')).toBe(true)
    expect(agentAssistant.conversationDetails(existingSession)).toMatchObject({ title: '故事讨论', storageKey: 'authoring_assistant_conversation:agent-book-a' })
    expect(agentAssistant.newConversation()).toBe(true)
    const archiveId = agentAssistant.sessions.value.find(session => session.active).sessionId
    expect(agentAssistant.archiveConversation(archiveId)).toBe(true)
    expect(agentAssistant.sessions.value.find(session => session.sessionId === archiveId)).toMatchObject({ archived: true, active: false })
    expect(agentAssistant.archiveConversation(archiveId, false)).toBe(true)
    expect(agentAssistant.deleteConversation(archiveId)).toBe(true)
    expect(agentAssistant.sessions.value.find(session => session.active)?.sessionId).toBe(existingSession)

    const originalHistory = JSON.parse(JSON.stringify(agentAssistant.messages.value))
    expect(agentAssistant.continueFromMessage(originalHistory[2].id)).toBe(true)
    expect(agentAssistant.messages.value).toHaveLength(3)
    expect(agentAssistant.agentState.value.taskId).toBe('')
    expect(agentAssistant.agentState.value.permission.mode).toBe('review')
    expect(agentAssistant.messages.value.every(item => !item.taskId && !item.proposal)).toBe(true)
    expect(await agentAssistant.ask({ question: '只接第一段' })).toBe(true)
    expect(agentCalls.at(-1).text).toContain('只接第一段')
    expect(agentCalls.at(-1).text).not.toContain('接着推进')
    expect(agentAssistant.selectSession(existingSession)).toBe(true)
    expect(JSON.parse(JSON.stringify(agentAssistant.messages.value))).toEqual(originalHistory)
    expect(await agentAssistant.editQuestion(originalHistory[3].id, '改成先敲门')).toBe(true)
    expect(agentAssistant.messages.value.at(-2).question).toBe('改成先敲门')
    expect(agentAssistant.messages.value).toHaveLength(5)
    expect(agentCalls.at(-1).text).not.toContain('接着推进')
    expect(agentAssistant.sessions.value.find(session => session.active)?.sessionId).toBe(existingSession)
    expect(agentAssistant.selectAnswerVersion(agentAssistant.messages.value.at(-1).id, 0)).toBe(true)
    expect(agentAssistant.messages.value.at(-2).question).toBe(originalHistory[3].question)
    const restoredHistory = JSON.parse(JSON.stringify(agentAssistant.messages.value))

    await agentAssistant.setAgentPermission({ mode: 'auto', scope: 'book', worldbook: true, outline: true })
    expect(await agentAssistant.regenerateAnswer(originalHistory[2].id)).toBe(true)
    expect(agentAssistant.agentState.value.permission).toMatchObject({ mode: 'auto', scope: 'book', worldbook: true, outline: true })
    expect(agentAssistant.messages.value.at(-2).question).toBe(originalHistory[1].question)
    expect(agentCalls.at(-1).text).not.toContain('接着推进')
    expect(agentAssistant.sessions.value.find(session => session.active)?.sessionId).toBe(existingSession)
    expect(agentAssistant.selectAnswerVersion(agentAssistant.messages.value.at(-1).id, 0)).toBe(true)
    expect(agentAssistant.messages.value.slice(2)).toEqual(restoredHistory.slice(2))

    const prepareBeforeSampling = agentEngine.prepare
    agentEngine.prepare = input => ({ ...prepareBeforeSampling(input), kernel: { serialization: { blocks: [] } } })
    health = Promise.resolve({ ok: true, assistantSampling: true })
    expect(await agentAssistant.regenerateAnswer(originalHistory[2].id, { intent: 'character', temperatureOverride: '0.6' })).toBe(false)
    expect(await agentAssistant.regenerateAnswer(originalHistory[2].id, { intent: 'character', temperatureOverride: 0.6 })).toBe(true)
    expect(agentCalls.at(-1).prepared.kernel.serialization.blocks).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'assistant-focus' }), expect.objectContaining({ kind: 'assistant-sampling', text: '{"temperature":0.6}' })
    ]))
    expect(agentAssistant.messages.value.at(-1).params).toMatchObject({ intent: 'character', temperatureOverride: 0.6 })
    expect(agentAssistant.agentState.value.permission.mode).toBe('auto')
    expect(agentAssistant.sessions.value.find(session => session.active)?.sessionId).toBe(existingSession)
    expect(agentAssistant.selectAnswerVersion(agentAssistant.messages.value.at(-1).id, 0)).toBe(true)
    expect(agentAssistant.messages.value.slice(2)).toEqual(restoredHistory.slice(2))
    agentEngine.prepare = prepareBeforeSampling

    // Tool rows belong to call IDs, including repeated names and replayed events.
    const toolScope = effectScope()
    const toolResult = (callId, payload, isError = false) => ({ callId, toolName: 'generate_narrative_draft', isError, result: { content: [{ type: 'text', text: JSON.stringify(payload) }] } })
    const failedToolResult = toolResult('draft-1', { ok: false, error: { message: '续写的 before 应为空。\n额外详情' } })
    const completedToolResults = ['draft-2', 'draft-3', 'draft-5'].map(callId => toolResult(callId, { ok: true }))
    const toolEngine = {
      prepare: input => ({ ...input, index: { byDomain: {} } }),
      healthz: async () => ({ ok: true }),
      run: vi.fn(async ({ callbacks }) => {
        const start = (callId, input = null) => callbacks.onStatus({ phase: 'tool', tool: 'generate_narrative_draft', callId, input })
        start('draft-1'); start('draft-1', { instruction: '首次推演' }); start('draft-2')
        callbacks.onToolResult(completedToolResults[0])
        callbacks.onToolResult(failedToolResult)
        callbacks.onToolResult(completedToolResults[0]); start('draft-2')
        callbacks.onToolResult(completedToolResults[1]); start('draft-3', { instruction: '第三次推演' })
        start('draft-4'); start('draft-5')
        expect(toolAssistant.messages.value.at(-1).toolResults).toHaveLength(2)
        return { ok: true, finalContent: '已保留独立调用记录。', finalToolResults: [failedToolResult, ...completedToolResults] }
      })
    }
    const toolAssistant = toolScope.run(() => useAuthoringKnowledgeAssistant({ projectId: ref('tool-status-book'), agentEngine: toolEngine }))
    try {
      expect(await toolAssistant.ask({ question: '继续推演' })).toBe(true)
      const completedTools = toolAssistant.messages.value.at(-1)
      expect(completedTools.tools).toMatchObject([
        { callId: 'draft-1', status: 'failed', error: '续写的 before 应为空。', input: { instruction: '首次推演' } },
        { callId: 'draft-2', status: 'completed' },
        { callId: 'draft-3', status: 'completed', input: { instruction: '第三次推演' } },
        { callId: 'draft-4', status: 'interrupted' },
        { callId: 'draft-5', status: 'completed' }
      ])
      expect(completedTools.tools).toHaveLength(5)

      const { mount } = await import('@vue/test-utils')
      const { default: KnowledgeAssistant } = await import('../components/authoring/AuthoringKnowledgeAssistant.vue')
      const panel = mount(KnowledgeAssistant, { props: { messages: [completedTools] }, global: { stubs: { AuthoringAgentTools: true } } })
      try {
        const summaries = panel.findAll('.assistant-tool-call > summary')
        expect(summaries).toHaveLength(5)
        expect(summaries[0].text()).toContain('续写的 before 应为空。')
        expect(summaries[1].find('[title="已完成"][aria-label="已完成"] svg').exists()).toBe(true)
        expect(summaries[1].text()).toBe('推演写作')
        expect(summaries[3].text()).toContain('未收到结果')
        const historicalTool = { ...completedTools, status: 'completed', tools: [{ name: 'generate_narrative_draft', status: 'running' }] }
        await panel.setProps({ messages: [historicalTool] })
        expect(panel.get('.assistant-tool-call > summary').text()).toContain('未收到结果')
        await panel.setProps({ messages: [{ ...historicalTool, status: 'running' }] })
        expect(panel.get('.assistant-tool-call > summary').text()).toContain('进行中')
        await panel.setProps({ messages: [{ ...historicalTool, status: 'cancelled' }] })
        expect(panel.get('.assistant-tool-call > summary').text()).toContain('已取消')
      } finally { panel.unmount() }

      toolEngine.run.mockImplementationOnce(async ({ callbacks }) => {
        callbacks.onStatus({ phase: 'tool', tool: 'generate_narrative_draft', callId: 'disconnected' })
        throw new Error('连接中断')
      })
      expect(await toolAssistant.ask({ question: '断线仍保留调用' })).toBe(false)
      expect(toolAssistant.messages.value.at(-1)).toMatchObject({ status: 'failed', tools: [{ callId: 'disconnected', status: 'interrupted' }] })

      let releaseToolTurn, cancelledCallbacks
      toolEngine.run.mockImplementationOnce(({ callbacks }) => {
        cancelledCallbacks = callbacks
        callbacks.onStatus({ phase: 'tool', tool: 'generate_narrative_draft', callId: 'cancelled-draft' })
        return new Promise(resolve => { releaseToolTurn = resolve })
      })
      const cancelledToolTurn = toolAssistant.ask({ question: '取消仍保留调用' })
      await vi.waitFor(() => expect(releaseToolTurn).toBeTypeOf('function'))
      toolAssistant.cancel()
      cancelledCallbacks.onToolResult(toolResult('cancelled-draft', { ok: true }))
      releaseToolTurn({ ok: true, finalContent: '迟到结果' })
      expect(await cancelledToolTurn).toBe(false)
      expect(toolAssistant.messages.value.at(-1)).toMatchObject({ status: 'cancelled', tools: [{ callId: 'cancelled-draft', status: 'cancelled' }] })
      expect(toolAssistant.messages.value.at(-1).proposal).toBeUndefined()
      const restoredTools = toolScope.run(() => useAuthoringKnowledgeAssistant({ projectId: ref('tool-status-book'), agentEngine: toolEngine }))
      expect(restoredTools.messages.value.at(-1).tools[0].status).toBe('cancelled')
    } finally { toolScope.stop() }

    // A completed draft stays adoptable when a later revision is interrupted.
    // Its transaction is distinct from the partial text preserved in the chat.
    const { prepareAssistantProposal: prepareRetained, applyAssistantProposal: applyRetained } = await import('../services/agents/storyagent/assistantEditTransaction.js')
    const retainedScope = effectScope()
    let retainedBook = { id: 'retained-book', worldbookId: 'retained-world', chapters: [{ id: 'retained-chapter', title: '开篇', content: '原正文。' }] }
    let retainedWorld = { id: 'retained-world', entries: [{ id: 'dock', name: '港口', content: '旧设定。' }] }
    const settingChange = { kind: 'worldbook', targetId: 'dock', field: 'content', operation: 'replace', before: '旧设定', after: '新设定', reason: '本轮补齐' }
    const narrativeRequest = { targetId: 'retained-chapter', operation: 'append', before: '', instruction: '续写', pendingChanges: [settingChange] }
    const completeDraft = '这一版已经完整生成。'
    let remoteActive = true, secondDraftStarted = false, lateNarrativeDraft
    const stopUnconfirmed = () => Object.assign(new Error('远端停止尚未确认'), { code: 'AGENT_TASK_STOP_UNCONFIRMED', taskId: 'retained-task' })
    const retainedEngine = {
      prepare: input => ({ ...input, index: { byDomain: {} }, kernel: { serialization: { blocks: [] } }, editBaseline: JSON.parse(JSON.stringify({ book: retainedBook, worldbook: retainedWorld })) }),
      destination: () => ({ chapterId: 'retained-chapter' }),
      healthz: async () => ({ ok: true, assistantProtocolVersion: 2, assistantNarrativeExchange: true }),
      authorize: vi.fn(async () => {}),
      prepareProposal: vi.fn(async (input, prepared, runId) => prepareRetained(input, { ...prepared.editBaseline, runId })),
      prepareNarrativeProposal: vi.fn(async (request, prepared, runId, signal) => {
        if (request.instruction === '再次修订') {
          lateNarrativeDraft = prepared.onNarrativeDraftUpdate
          lateNarrativeDraft({ phase: 'plan', text: '这是规划，不是正文。' })
          lateNarrativeDraft({ phase: 'write', text: '即将查询资料的前言。' })
          expect(retainedAssistant.messages.value.at(-1).generatedDrafts).toHaveLength(1)
          lateNarrativeDraft({ phase: 'write', text: '' })
          expect(retainedAssistant.messages.value.at(-1).generatedDrafts[0].text).toBe('')
          lateNarrativeDraft({ phase: 'write', text: '第二版尚未完成' })
          lateNarrativeDraft({ phase: 'write', text: '第二版尚未完成的残段。' })
          expect(retainedAssistant.messages.value.at(-1).generatedDrafts[0].text).toBe('第二版尚未完成')
          secondDraftStarted = true
          return new Promise((_, reject) => signal.addEventListener('abort', () => reject(Object.assign(new Error('修订已中断'), { generatedText: '第二版尚未完成的残段。' })), { once: true }))
        }
        prepared.onNarrativeDraftUpdate({ phase: 'write', text: '这一版已经' })
        return { ...prepareRetained({ changes: [{ kind: 'chapter', field: 'content', targetId: request.targetId, operation: request.operation, before: request.before, after: completeDraft, reason: request.instruction }] }, { ...prepared.editBaseline, runId }), narrativeReceipt: { manifestFingerprint: 'retained-context' } }
      }),
      run: vi.fn(async ({ callbacks }) => {
        callbacks.onTask({ taskId: 'retained-task', bookId: 'retained-book' })
        await callbacks.onNarrativeRequest(narrativeRequest)
        await callbacks.onNarrativeRequest({ ...narrativeRequest, instruction: '再次修订' })
      }),
      cancel: vi.fn(async () => { if (remoteActive) throw stopUnconfirmed(); return { ok: true, stopped: true } }),
      waitForTaskIdle: vi.fn(async () => { if (remoteActive) throw stopUnconfirmed(); return { executionActive: false, status: 'cancelled' } }),
      applyProposal: vi.fn(async (proposal, options) => {
        const result = applyRetained(proposal, { book: retainedBook, worldbook: retainedWorld, ...options })
        retainedBook = result.book; retainedWorld = result.worldbook
        proposal.status = result.status; proposal.changes = result.proposalChanges
        return { ok: true }
      })
    }
    const retainedAssistant = retainedScope.run(() => useAuthoringKnowledgeAssistant({ projectId: ref('retained-book'), agentEngine: retainedEngine }))
    try {
      await retainedAssistant.setAgentPermission({ mode: 'auto' })
      const retainedTurn = retainedAssistant.ask({ question: '续写并整理设定' })
      await vi.waitFor(() => expect(secondDraftStarted, retainedAssistant.error.value).toBe(true))
      const retainedMessage = retainedAssistant.messages.value.at(-1)
      expect(retainedMessage.generatedDrafts).toMatchObject([{ text: '第二版尚未完成', status: 'generating' }])
      expect(retainedMessage.text).not.toContain('这是规划')
      expect(retainedMessage.proposal.changes.map(change => change.after)).toEqual(['新设定', completeDraft])
      expect(retainedMessage.proposal.changes[0].groupId).toBe(retainedMessage.proposal.changes[1].groupId)
      expect(retainedMessage.proposal.narrativeReceipt.manifestFingerprint).toBe('retained-context')
      expect(retainedAssistant.reviewProposal(retainedMessage.id)).toBe(true)
      expect(await retainedAssistant.applyAgentProposal()).toBe(false)
      expect(retainedBook.chapters[0].content).toBe('原正文。')
      retainedAssistant.cancel()
      lateNarrativeDraft({ phase: 'write', text: '取消后的迟到正文不能覆盖草稿。' })
      expect(await retainedTurn).toBe(false)
      expect(retainedMessage).toMatchObject({ status: 'cancelled', text: expect.stringContaining('第二版尚未完成的残段。'), failureReason: expect.stringContaining('完整修改已保留') })
      expect(retainedMessage.text).not.toContain(completeDraft)
      expect(retainedMessage.text.match(/第二版尚未完成/g)).toHaveLength(1)
      expect(retainedMessage.text).not.toContain('迟到正文')
      expect(retainedMessage.proposal.changes[1].after).toBe(completeDraft)
      expect(retainedEngine.applyProposal).not.toHaveBeenCalled()
      expect(retainedAssistant.pendingProposals.value).toHaveLength(1)
      expect(retainedAssistant.reviewProposal(retainedMessage.id)).toBe(true)
      expect(await retainedAssistant.applyAgentProposal()).toBe(false)
      const authorizations = retainedEngine.authorize.mock.calls.length
      expect(await retainedAssistant.ask({ question: '继续' })).toBe(false)
      expect(retainedEngine.authorize).toHaveBeenCalledTimes(authorizations)
      expect(retainedAssistant.agentState.value).toMatchObject({ taskId: 'retained-task', stopPending: true })
      expect(retainedAssistant.newConversation()).toBe(false)
      remoteActive = false
      retainedAssistant.cancel()
      await vi.waitFor(() => expect(retainedAssistant.agentState.value.stopPending).toBe(false))
      expect(retainedEngine.cancel).toHaveBeenCalledTimes(2)
      expect(await retainedAssistant.applyAgentProposal()).toBe(true)
      expect(retainedBook.chapters[0].content).toBe(`原正文。\n\n${completeDraft}`)
      expect(retainedWorld.entries[0].content).toBe('新设定。')
      const restoredRetained = retainedScope.run(() => useAuthoringKnowledgeAssistant({ projectId: ref('retained-book'), agentEngine: retainedEngine }))
      expect(restoredRetained.messages.value.at(-1).proposal.changes[1].after).toBe(completeDraft)

      // Tool callbacks are not awaited by the stream. Drain accepted batches
      // before rejecting, and never promote an invalid later batch to a proposal.
      retainedEngine.resume = vi.fn(async ({ callbacks }) => {
        callbacks.onTask({ taskId: 'retained-task', bookId: 'retained-book' })
        const changes = [{ ...settingChange, before: '新设定', after: '再补充设定' }]
        callbacks.onToolResult({ ...toolResult('accepted-setting', { ok: true, changes }), toolName: 'submit_edit_proposals' })
        callbacks.onToolResult({ ...toolResult('accepted-chapter', { ok: true, changes: [{ kind: 'chapter', targetId: 'retained-chapter', field: 'content', operation: 'append', before: '', after: '工具提交的完整正文。', reason: '补充正文' }] }), toolName: 'submit_edit_proposals' })
        callbacks.onToolResult({ ...toolResult('invalid-setting', { ok: true, proposalChanges: [{ ...changes[0], targetId: 'missing-target' }] }), toolName: 'submit_edit_proposals' })
        throw new Error('提交之后连接中断')
      })
      expect(await retainedAssistant.ask({ question: '补充港口设定' })).toBe(false)
      const disconnected = retainedAssistant.messages.value.at(-1)
      expect(disconnected.status).toBe('failed')
      expect(disconnected.proposal.changes[0].after).toBe('再补充设定')
      expect(disconnected.proposal.changes[1].after).toBe('工具提交的完整正文。')
      expect(disconnected.text).not.toContain('再补充设定')
      expect(disconnected.tools.at(-1).status).toBe('failed')
      expect(retainedEngine.waitForTaskIdle.mock.invocationCallOrder.at(-1)).toBeLessThan(retainedEngine.authorize.mock.invocationCallOrder.at(-1))

      const { mount } = await import('@vue/test-utils')
      const { default: KnowledgeAssistant } = await import('../components/authoring/AuthoringKnowledgeAssistant.vue')
      const retainedPanel = mount(KnowledgeAssistant, { props: { messages: [disconnected], assistant: retainedAssistant, agentState: { ...retainedAssistant.agentState.value, stopPending: true } }, global: { stubs: { AuthoringAgentTools: true } } })
      try {
        expect(retainedPanel.text()).toContain('查看修改建议')
        expect(retainedPanel.find('.assistant-stop').exists()).toBe(true)
        await retainedPanel.setProps({ messages: [{ ...disconnected, proposal: null }] })
        expect(retainedPanel.find('.authoring-knowledge__agent-adopt').exists()).toBe(false)
      } finally { retainedPanel.unmount() }

      // A remote stop can finish before local proposal validation. Adoption
      // waits once, then reads and applies the latest complete version.
      let finishValidation
      const prepareBeforeSettling = retainedEngine.prepareProposal.getMockImplementation()
      retainedEngine.prepareProposal.mockImplementation(async (input, prepared, runId) => {
        if (input.changes.some(change => change.after === '收尾校验完成的正文。')) await new Promise(resolve => { finishValidation = resolve })
        return prepareBeforeSettling(input, prepared, runId)
      })
      retainedEngine.resume.mockImplementationOnce(async ({ callbacks, signal }) => {
        callbacks.onTask({ taskId: 'retained-task', bookId: 'retained-book' })
        await callbacks.onNarrativeRequest({ ...narrativeRequest, pendingChanges: [] })
        callbacks.onToolResult(toolResult('settling-draft', { ok: true, proposalChanges: [{ kind: 'chapter', targetId: 'retained-chapter', field: 'content', operation: 'append', before: '', after: '收尾校验完成的正文。', reason: '修订完整草稿' }] }))
        await new Promise((_, reject) => signal.addEventListener('abort', () => reject(new Error('已停止')), { once: true }))
      })
      const settlingTurn = retainedAssistant.ask({ question: '生成后修订' })
      await vi.waitFor(() => expect(finishValidation).toBeTypeOf('function'))
      const settlingMessage = retainedAssistant.messages.value.at(-1)
      retainedAssistant.cancel()
      await vi.waitFor(() => expect(retainedAssistant.agentState.value.stopPending).toBe(false))
      expect(retainedAssistant.reviewProposal(settlingMessage.id)).toBe(true)
      const beforeSettlingApply = retainedEngine.applyProposal.mock.calls.length
      const applyWhileSettling = retainedAssistant.applyAgentProposal()
      await nextTick()
      expect(retainedEngine.applyProposal).toHaveBeenCalledTimes(beforeSettlingApply)
      finishValidation()
      expect(await settlingTurn).toBe(false)
      expect(await applyWhileSettling).toBe(true)
      expect(settlingMessage.proposal.changes[0]).toMatchObject({ after: '收尾校验完成的正文。', status: 'adopted' })
      expect(retainedBook.chapters[0].content).toBe(`原正文。\n\n${completeDraft}\n\n收尾校验完成的正文。`)
      retainedEngine.prepareProposal.mockImplementation(prepareBeforeSettling)
      retainedEngine.resume.mockImplementationOnce(async ({ callbacks }) => {
        callbacks.onTask({ taskId: 'retained-task', bookId: 'retained-book' })
        await callbacks.onNarrativeRequest({ ...narrativeRequest, pendingChanges: [] })
        await callbacks.onNarrativeRequest({ ...narrativeRequest, draftAction: 'extend', pendingChanges: retainedAssistant.messages.value.at(-1).proposal.changes })
        throw new Error('延展成功后断线')
      })
      expect(await retainedAssistant.ask({ question: '扩展已有草稿' })).toBe(false)
      expect(retainedAssistant.messages.value.at(-1).proposal.changes[0].after).toBe(`${completeDraft}\n\n${completeDraft}`)
      retainedEngine.resume.mockImplementationOnce(async ({ callbacks }) => {
        callbacks.onToolResult({ ...toolResult('invalid-only', { ok: true, changes: [{ ...settingChange, targetId: 'missing-target' }] }), toolName: 'submit_edit_proposals' })
        throw new Error('无有效候选')
      })
      expect(await retainedAssistant.ask({ question: '校验无效候选' })).toBe(false)
      expect(retainedAssistant.messages.value.at(-1).proposal).toBeUndefined()
    } finally { retainedScope.stop() }

    // Asking is a persisted checkpoint in the same conversation and task.
    const inputProject = ref('input-book')
    const questions = [{ id: 'direction', question: '这次更新哪一处？', options: [{ label: '补充设定', description: '' }] }]
    const inputEngine = {
      prepare: input => ({ ...input, kernel: { serialization: { blocks: [] } } }),
      destination: () => ({ chapterId: 'input-chapter' }),
      healthz: async () => ({ ok: true, assistantProtocolVersion: 2, assistantNarrativeExchange: true, assistantNativeSession: true }), authorize: vi.fn(async () => {}),
      run: vi.fn(async () => ({ ok: true, finalContent: '这次更新哪一处？', trace: { taskId: 'input-task' }, finalToolResults: [{ toolName: 'request_user_input', result: { content: [{ type: 'text', text: JSON.stringify({ ok: true, intent: 'mixed', outcome: 'needs_input', message: '这次更新哪一处？', questions }) }] } }] })),
      resume: vi.fn(async input => ({ ok: true, finalContent: '已按回答继续', trace: { taskId: input.taskId }, finalToolResults: [{ toolName: 'complete_assistant_task', result: { content: [{ type: 'text', text: JSON.stringify({ ok: true, intent: 'answer', outcome: 'answer', message: '已继续' }) }] } }] }))
    }
    const inputAssistant = useAuthoringKnowledgeAssistant({ projectId: inputProject, agentEngine: inputEngine })
    expect(await inputAssistant.ask({ question: '给我更新' })).toBe(true)
    const inputMessage = inputAssistant.messages.value.at(-1)
    expect(inputMessage).toMatchObject({ status: 'needs_input', questions, taskId: 'input-task' })
    const restoredInput = useAuthoringKnowledgeAssistant({ projectId: inputProject, agentEngine: inputEngine })
    expect(restoredInput.messages.value.at(-1).questions).toEqual(questions)
    expect(restoredInput.answerQuestions(inputMessage.id, {})).toBe(false)
    const inputSession = restoredInput.sessions.value.find(item => item.active).sessionId
    expect(await restoredInput.answerQuestions(inputMessage.id, { direction: '补充设定，保留正文' })).toBe(true)
    expect(inputEngine.resume).toHaveBeenCalledWith(expect.objectContaining({ taskId: 'input-task', text: '这次更新哪一处？\n补充设定，保留正文' }))
    expect(restoredInput.sessions.value.find(item => item.active).sessionId).toBe(inputSession)
    expect(restoredInput.messages.value.find(item => item.id === inputMessage.id).questionResponse).toContain('保留正文')
    expect(restoredInput.answerQuestions(inputMessage.id, { direction: '修改正文' })).toBe(false)

    // Native pi can ask after preparing edits. Waiting must never auto-apply;
    // only a successful resumed delivery can replace the retained candidate.
    const continuationScope = effectScope()
    const inheritedChanges = [{ kind: 'worldbook', targetId: 'linlan', field: 'content', operation: 'replace', before: '旧人物说明', after: '新人物说明' }]
    const continuationReview = vi.fn()
    const continuationEngine = {
      ...inputEngine,
      prepare: vi.fn(input => ({ ...input, index: { byDomain: {} }, kernel: { serialization: { blocks: [] } } })),
      prepareProposal: vi.fn(async ({ changes }, prepared, runId) => ({ id: `${runId}:edit`, runId, bookId: prepared.bookId, status: 'pending', changes: changes.map(change => ({ ...change, status: 'pending' })) })),
      applyProposal: vi.fn(async proposal => { proposal.status = 'adopted'; proposal.changes.forEach(change => { change.status = 'adopted' }); return { ok: true } }),
      compact: vi.fn(async () => ({ ok: true })),
      run: vi.fn(async () => ({ ok: true, finalContent: questions[0].question, trace: { taskId: 'continuation-task' },
        finalToolResults: [{ toolName: 'complete_assistant_task', result: { content: [{ type: 'text', text: JSON.stringify({ ok: true, intent: 'edit', outcome: 'proposal', message: '较早的工具回执不能覆盖最终问题。' }) }] } }], proposalChanges: inheritedChanges,
        delivery: { intent: 'mixed', outcome: 'needs_input', message: questions[0].question, questions } })),
      resume: vi.fn()
        .mockResolvedValueOnce({ ok: false, error: { message: '续接暂时中断' } })
        .mockResolvedValueOnce({ ok: true, finalContent: '已按你的选择完成修改。', trace: { taskId: 'continuation-task' }, finalToolResults: [], proposalChanges: inheritedChanges,
          delivery: { intent: 'edit', outcome: 'proposal', message: '修改已经准备好。' } })
    }
    const continuationAssistant = continuationScope.run(() => useAuthoringKnowledgeAssistant({ projectId: ref('continuation-book'), agentEngine: continuationEngine, onReviewProposal: continuationReview }))
    try {
      await continuationAssistant.setAgentPermission({ mode: 'auto', scope: 'book', worldbook: true, outline: true })
      expect(await continuationAssistant.ask({ question: '先完善人物，遇到方向不明再问我' })).toBe(true)
      const waiting = continuationAssistant.messages.value.at(-1)
      const retainedCandidate = JSON.parse(JSON.stringify(waiting.proposal))
      expect(waiting.status).toBe('needs_input')
      expect(retainedCandidate.changes[0].after).toBe('新人物说明')
      expect(continuationAssistant.pendingProposals.value).toEqual([])
      expect(continuationAssistant.proposalReview.value).toBeNull()
      expect(continuationAssistant.reviewProposal(waiting.id)).toBe(false)
      expect(continuationReview).not.toHaveBeenCalled()
      expect(continuationEngine.applyProposal).not.toHaveBeenCalled()
      expect(await continuationAssistant.answerQuestions(waiting.id, { direction: '补充设定' })).toBe(false)
      expect(continuationAssistant.error.value).toContain('续接暂时中断')
      expect(waiting.proposal).toEqual(retainedCandidate)
      expect(continuationEngine.applyProposal).not.toHaveBeenCalled()
      expect(await continuationAssistant.retry()).toBe(true)
      const completed = continuationAssistant.messages.value.at(-1)
      expect(completed).toMatchObject({ status: 'completed', taskId: 'continuation-task', proposal: { status: 'adopted' } })
      expect(completed.toolResults).toEqual([])
      expect(completed.text).toBe('已按你的选择完成修改。')
      expect(waiting.proposal).toBeUndefined()
      expect(continuationEngine.applyProposal).toHaveBeenCalledOnce()
      expect(continuationEngine.applyProposal.mock.calls[0][0].changes[0].after).toBe('新人物说明')
      expect(continuationEngine.resume.mock.calls.at(-1)[0].prepared.text).toBe('这次更新哪一处？\n补充设定')
      expect(continuationEngine.resume.mock.calls.at(-1)[0].prepared.editDecisions.proposals[0]).toMatchObject({ taskId: 'continuation-task', status: 'pending' })

      const taskBeforeCompact = continuationAssistant.agentState.value.taskId
      const historyBeforeCompact = JSON.stringify(continuationAssistant.messages.value)
      const sessionBeforeCompact = continuationAssistant.sessions.value.find(session => session.active).sessionId
      expect(await continuationAssistant.compactContext()).toBe(true)
      expect(continuationEngine.compact).toHaveBeenCalledWith(taskBeforeCompact, expect.objectContaining({ bookId: 'continuation-book', signal: expect.any(AbortSignal) }))
      expect(continuationAssistant.agentState.value.taskId).toBe(taskBeforeCompact)
      expect(JSON.stringify(continuationAssistant.messages.value)).toBe(historyBeforeCompact)
      expect(continuationAssistant.sessions.value.find(session => session.active).sessionId).toBe(sessionBeforeCompact)
      expect(continuationAssistant.contextCompacted.value).toBe(true)
      continuationEngine.compact.mockRejectedValueOnce(new Error('旧任务没有原生会话，原对话已保留。'))
      expect(await continuationAssistant.compactContext()).toBe(false)
      expect(continuationAssistant.error.value).toContain('旧任务没有原生会话')
      expect(continuationAssistant.agentState.value.taskId).toBe(taskBeforeCompact)
      expect(JSON.stringify(continuationAssistant.messages.value)).toBe(historyBeforeCompact)
      expect(continuationAssistant.busy.value).toBe(false)
    } finally { continuationScope.stop() }

    // An unchanged candidate keeps the version it was based on before asking.
    // Freshly revised candidates can use the version read after the author answers.
    const { prepareAssistantProposal, applyAssistantProposal } = await import('../services/agents/storyagent/assistantEditTransaction.js')
    const { entryDetailsSnapshot } = await import('../../shared/assistantEntryDetails.js')
    const baselineBook = { id: 'baseline-book', worldbookId: 'baseline-world', chapters: [] }
    const baselineWorld = { id: 'baseline-world', entries: ['linlan', 'dock'].map(id => ({ id, type: 'general', name: id, content: '前文。旧说明。后文。', profile: { values: { 动机: '原动机' } } })) }
    const baselineChanges = baselineWorld.entries.map(entry => ({ kind: 'worldbook', targetId: entry.id, field: 'content', operation: 'replace', before: '旧说明', after: '候选说明', reason: '补齐设定说明', details: { attributes: [{ key: '动机', value: '候选动机' }] } }))
    const revisedChanges = [baselineChanges[0], { ...baselineChanges[1], after: '依据作者回答重新写的说明' }]
    const baselineScope = effectScope()
    const baselineEngine = {
      ...inputEngine,
      prepare: input => ({ ...input, index: { byDomain: {} }, kernel: { serialization: { blocks: [] } }, editBaseline: JSON.parse(JSON.stringify({ book: baselineBook, worldbook: baselineWorld })) }),
      prepareProposal: async (input, prepared, runId) => prepareAssistantProposal(input, { ...prepared.editBaseline, runId }),
      run: async () => ({ ok: true, finalContent: questions[0].question, trace: { taskId: 'baseline-task' }, proposalChanges: baselineChanges,
        delivery: { intent: 'mixed', outcome: 'needs_input', message: questions[0].question, questions } }),
      resume: async () => ({ ok: true, finalContent: '已整理人物和地点的修改。', trace: { taskId: 'baseline-task' }, proposalChanges: revisedChanges,
        delivery: { intent: 'edit', outcome: 'proposal', message: '修改已准备好。' } })
    }
    const baselineAssistant = baselineScope.run(() => useAuthoringKnowledgeAssistant({ projectId: ref(baselineBook.id), agentEngine: baselineEngine }))
    try {
      expect(await baselineAssistant.ask({ question: '先整理人物和地点，方向不明时问我' }), baselineAssistant.error.value).toBe(true)
      const originalWaiting = baselineAssistant.messages.value.at(-1)
      const originalProposal = JSON.parse(JSON.stringify(originalWaiting.proposal))
      const originalChange = JSON.parse(JSON.stringify(originalWaiting.proposal.changes[0]))
      baselineWorld.entries[0].profile.values.动机 = '作者等待时亲自改的人物动机'
      baselineWorld.entries[1].profile.values.动机 = '作者提供的新地点动机'
      baselineWorld.entries[1].content = '作者补充的前文。旧说明。后文。'
      baselineBook.worldbookId = 'replacement-world'
      baselineWorld.id = 'replacement-world'
      expect(await baselineAssistant.answerQuestions(originalWaiting.id, { direction: '保留人物候选，重新写地点说明' })).toBe(false)
      expect(baselineAssistant.error.value).toContain('关联设定库已变化')
      expect(originalWaiting.proposal).toEqual(originalProposal)
      baselineBook.worldbookId = 'baseline-world'
      baselineWorld.id = 'baseline-world'
      expect(await baselineAssistant.retry()).toBe(true)
      const resumedProposal = baselineAssistant.messages.value.at(-1).proposal
      const unchanged = resumedProposal.changes[0], revised = resumedProposal.changes[1]
      expect(unchanged).toMatchObject({ baseline: originalChange.baseline, anchor: originalChange.anchor, detailsBaseline: originalChange.detailsBaseline })
      expect(revised.baseline).toBe(baselineWorld.entries[1].content)
      expect(revised.detailsBaseline).toBe(entryDetailsSnapshot(baselineWorld.entries[1]))
      expect(revised.anchor.from).toBe(baselineWorld.entries[1].content.indexOf('旧说明'))
      expect(() => applyAssistantProposal(resumedProposal, { book: baselineBook, worldbook: baselineWorld, changeIds: [unchanged.changeId] })).toThrow('条目属性已变化')
      expect(baselineWorld.entries[0].profile.values.动机).toBe('作者等待时亲自改的人物动机')
      expect(unchanged.status).toBe('pending')
      const revisedApplied = applyAssistantProposal(resumedProposal, { book: baselineBook, worldbook: baselineWorld, changeIds: [revised.changeId] })
      expect(revisedApplied.worldbook.entries[1].content).toBe('作者补充的前文。依据作者回答重新写的说明。后文。')
      expect(revisedApplied.worldbook.entries[0].profile.values.动机).toBe('作者等待时亲自改的人物动机')
    } finally { baselineScope.stop() }

    const { createAuthoringAssistantConversationStore } = await import('../services/agents/authoring/authoringAssistantConversationStore.js')
    const { assistantQuestionWithContext, assistantEditDecisions } = await import('../services/agents/authoring/assistantConversationContext.js')
    const savedHistory = new Map()
    const longConversationStore = createAuthoringAssistantConversationStore({ storage: { getText: key => savedHistory.get(key) ?? null, setJson: (key, value) => savedHistory.set(key, JSON.stringify(value)) } })
    const longHistory = Array.from({ length: 72 }, (_, index) => ({ id: `history-${index}`, role: 'user', question: `${index}：${'较长的作者决定。'.repeat(80)}保留第${index}轮结尾`, createdAt: index }))
    expect(longConversationStore.saveConversation('long-book', { messages: longHistory, activeSessionId: 'long-session', agentSessions: [{ sessionId: 'long-session', projectId: 'long-book', messages: longHistory }] }).ok).toBe(true)
    const loadedLong = longConversationStore.load('long-book')
    expect(loadedLong.ok).toBe(true)
    expect(loadedLong.conversation.messages).toHaveLength(72)
    expect(loadedLong.conversation.agentSessions[0].messages).toHaveLength(72)
    expect(loadedLong.conversation.agentSessions[0].messages[0].question).toBe(longHistory[0].question)
    const completeStartup = assistantQuestionWithContext('继续', loadedLong.conversation.messages, null)
    expect(completeStartup).toContain('保留第0轮结尾')
    expect(completeStartup).toContain('保留第71轮结尾')
    const actualReceipt = { id: 'decision:edit', bookId: 'long-book', status: 'partial', changes: [{ ...inheritedChanges[0], changeId: 'change-1', status: 'adopted' }, { ...inheritedChanges[0], targetId: 'dock', changeId: 'change-2', status: 'discarded' }] }
    expect(assistantEditDecisions([{ taskId: 'decision-task', proposal: { ...actualReceipt, status: 'pending', changes: [] } }], 'long-book', () => actualReceipt).proposals[0]).toMatchObject({
      taskId: 'decision-task', status: 'partial', changes: [{ status: 'adopted' }, { status: 'discarded' }]
    })

    // Busy sends stay in a bounded per-conversation queue; completion drains FIFO.
    let releaseQueueRun
    let queueChapter = 'input-chapter'
    const queueEngine = { ...inputEngine, destination: () => ({ chapterId: queueChapter }), run: vi.fn(async input => { input.callbacks.onChunk({ content: '已读' }); input.callbacks.onTask({ taskId: 'queued-task', bookId: 'queue-book' }); return new Promise(resolve => { releaseQueueRun = resolve }) }), resume: vi.fn(inputEngine.resume.getMockImplementation()) }
    const queueAssistant = useAuthoringKnowledgeAssistant({ projectId: ref('queue-book'), agentEngine: queueEngine })
    const firstQueueTurn = queueAssistant.ask({ question: '先读章节' })
    await vi.waitFor(() => expect(releaseQueueRun).toBeTypeOf('function'))
    queueAssistant.draft.value = '然后检查人物'
    expect(await queueAssistant.queueMessage({ question: '然后检查人物' })).toBe(true)
    expect(queueAssistant.draft.value).toBe('')
    expect(await queueAssistant.queueMessage({ question: '最后补充地点' })).toBe(true)
    expect(queueEngine.resume).not.toHaveBeenCalled()
    expect(queueAssistant.pendingMessages.value.map(item => item.question)).toEqual(['然后检查人物', '最后补充地点'])
    expect(queueAssistant.removeQueuedMessage(queueAssistant.pendingMessages.value[1].id)).toBe(true)
    expect(await queueAssistant.queueMessage({ question: '最后检查大纲' })).toBe(true)
    queueChapter = 'another-chapter'
    releaseQueueRun({ ok: true, finalContent: '已读', trace: { taskId: 'queued-task' }, finalToolResults: [{ toolName: 'complete_assistant_task', result: { content: [{ type: 'text', text: JSON.stringify({ ok: true, intent: 'answer', outcome: 'answer', message: '已读' }) }] } }] })
    expect(await firstQueueTurn).toBe(true)
    await nextTick()
    expect(queueEngine.resume).not.toHaveBeenCalled()
    expect(queueAssistant.pendingMessages.value).toHaveLength(2)
    queueChapter = 'input-chapter'
    queueAssistant.resumeQueuedMessages(); queueAssistant.resumeQueuedMessages()
    await vi.waitFor(() => expect(queueEngine.resume).toHaveBeenCalledTimes(2))
    expect(queueEngine.resume.mock.calls.map(call => call[0].text)).toEqual(['然后检查人物', '最后检查大纲'])
    expect(queueEngine.resume.mock.calls[0][0]).toMatchObject({ taskId: 'queued-task', text: '然后检查人物' })
    expect(queueAssistant.pendingMessages.value).toEqual([])
    await vi.waitFor(() => expect(queueAssistant.busy.value).toBe(false))
    let releaseHeldTurn, heldCallbacks
    queueEngine.prepare = vi.fn(queueEngine.prepare)
    queueEngine.cancel = vi.fn(async () => ({ ok: true }))
    queueEngine.resume.mockImplementationOnce(input => { heldCallbacks = input.callbacks; return new Promise(resolve => { releaseHeldTurn = resolve }) })
    const heldTurn = queueAssistant.ask({ question: '等待中的任务' })
    await vi.waitFor(() => expect(releaseHeldTurn).toBeTypeOf('function'))
    queueEngine.steer = vi.fn(async (taskId, input) => {
      heldCallbacks.onToolResult({ toolName: 'author_input', result: { content: [{ type: 'text', text: JSON.stringify({ id: input.id }) }] } })
      return { ok: true }
    })
    expect(await queueAssistant.queueMessage({ question: '保留姓名，只检查关系' }, 'steer')).toBe(true)
    expect(queueEngine.steer).toHaveBeenCalledWith('queued-task', expect.objectContaining({ text: '保留姓名，只检查关系', bookId: 'queue-book' }))
    expect(queueEngine.cancel).not.toHaveBeenCalled()
    expect(queueAssistant.pendingMessages.value).toEqual([])
    expect(queueAssistant.messages.value.at(-2).question).toBe('保留姓名，只检查关系')
    expect(queueEngine.prepare.mock.results.at(-1).value.authorAmendments).toEqual(['保留姓名，只检查关系'])
    expect(queueAssistant.busy.value).toBe(true)
    expect(await queueAssistant.queueMessage({ question: '待恢复的消息' })).toBe(true)
    let finishLateInput
    queueEngine.steer.mockImplementationOnce(() => new Promise(resolve => { finishLateInput = resolve }))
    const lateInput = queueAssistant.queueMessage({ question: '取消前提交的补充' }, 'steer')
    const lateId = queueAssistant.pendingMessages.value.at(-1).id
    queueAssistant.cancel()
    finishLateInput({ ok: true })
    expect(await lateInput).toBe(true)
    expect(queueAssistant.pendingMessages.value.find(item => item.id === lateId).status).toBe('waiting')
    expect(queueAssistant.removeQueuedMessage(lateId)).toBe(true)
    releaseHeldTurn({ ok: false })
    expect(await heldTurn).toBe(false)
    const queueRestored = useAuthoringKnowledgeAssistant({ projectId: ref('queue-book'), agentEngine: queueEngine })
    const callsAtRestore = queueEngine.run.mock.calls.length + queueEngine.resume.mock.calls.length
    expect(queueRestored.pendingMessages.value.map(item => item.question)).toEqual(['待恢复的消息'])
    await nextTick()
    expect(queueEngine.run.mock.calls.length + queueEngine.resume.mock.calls.length).toBe(callsAtRestore)
    expect(queueRestored.newConversation()).toBe(true)
    expect(queueRestored.pendingMessages.value).toEqual([])

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
  const current = { projectId: 'draft-book', chapterId: 'draft-chapter', markdown: '',
    document: createWritingDocument(''), revision: 'draft-r1' }
  const pendingDraft = '雨下到亥时才停了一阵。'
  let narrativeProgress
  const receivedDrafts = vi.fn()
  const runTurn = vi.fn(async ({ onDraftUpdate }) => {
    narrativeProgress = onDraftUpdate
    onDraftUpdate?.({ phase: 'plan', text: '不能展示的规划' })
    onDraftUpdate?.({ phase: 'write', text: ':::narration\n晚钟响过' })
    onDraftUpdate?.({ phase: 'write', text: '' })
    onDraftUpdate?.({ phase: 'write', text: ':::narration\n晚钟响过，雷米' })
    return { text: '晚钟响过，雷米收起契约。' }
  })
  const resolveContext = vi.fn(async () => ({}))
  const result = await generateAssistantNarrative({
    request: { operation: 'append', instruction: '按西幻背景重写开篇。', draftAction: 'revise',
      pendingChanges: [{ targetId: 'draft-chapter', after: pendingDraft }] },
    prepared: { bookId: 'draft-book', currentChapterId: 'draft-chapter', authorQuestion: '按本书设定修改。', onNarrativeDraftUpdate: receivedDrafts, methods: [{ id: 'world-design' }],
      pinnedRefs: [{ id: 'reference-book', type: 'source', title: '参考书', summary: '过短的预览' }],
      writingReferences: [{ id: 'chunk-ref', type: 'source', title: '参考书', sourceDocumentId: 'reference-book', chunkId: 'chunk-1', contentHash: 'hash-1', sourceRefs: ['source:reference-book:chunk-1'], text: '她把砚台放在桌上。\n\n墨汁还没有干。' }],
      editBaseline: { book: { chapters: [{ id: 'draft-chapter', content: '' }] } } }
  }, { readCurrent: () => current, resolveTarget: target => target,
    readNarrative: () => ({ resolveContext, runTurn }) })
  const instruction = runTurn.mock.calls[0][0].turn.instruction
  expect(instruction).toContain(pendingDraft)
  expect(instruction).toContain('【代笔续写】')
  expect(instruction).toContain('她把砚台放在桌上。\n\n墨汁还没有干。')
  expect(instruction).toContain('source:reference-book:chunk-1')
  expect(instruction).toContain('不是本书事实')
  expect(instruction).not.toContain('过短的预览')
  expect(instruction).not.toContain('【世界设定】')
  expect(instruction).not.toContain('按西幻背景重写开篇。')
  expect(instruction.endsWith('作者本轮原话（本次写作以此为准）：\n按本书设定修改。')).toBe(true)
  expect(runTurn.mock.calls[0][0].turn.planning).toBe('direct')
  expect(instruction).toContain('不是既定设定')
  expect(instruction).toContain('其余沿用作品背景与规则')
  expect(instruction).not.toContain('与旧资料冲突时以这些明确修改为准')
  expect(result.text).toBe('晚钟响过，雷米收起契约。')
  expect(receivedDrafts.mock.calls.map(([update]) => update)).toEqual([
    { phase: 'write', text: '晚钟响过' }, { phase: 'write', text: '' }, { phase: 'write', text: '晚钟响过，雷米' }
  ])
  current.chapterId = 'other-chapter'
  narrativeProgress({ phase: 'write', text: '换章后的迟到文本' })
  expect(receivedDrafts).toHaveBeenCalledTimes(3)
  current.chapterId = 'draft-chapter'
  await generateAssistantNarrative({
    request: { operation: 'append', instruction: '接着这份草稿写。', draftAction: 'extend',
      pendingChanges: [{ targetId: 'draft-chapter', after: pendingDraft }] },
    prepared: { bookId: 'draft-book', currentChapterId: 'draft-chapter', authorQuestion: '接着草稿写。', authorConversation: '作者：选第二种，回宿舍找弟弟。', authorAmendments: ['用弟弟的视角。'],
      editBaseline: { book: { chapters: [{ id: 'draft-chapter', content: '' }] } } }
  }, { readCurrent: () => current, resolveTarget: target => target,
    readNarrative: () => ({ resolveContext, runTurn }) })
  expect(runTurn.mock.calls.at(-1)[0].turn.instruction).toContain('接在本轮未采用草稿的最后一句之后')
  expect(runTurn.mock.calls.at(-1)[0].turn.instruction).not.toContain('从当前章节末尾接续')
  expect(runTurn.mock.calls.at(-1)[0].turn.instruction).toContain('作者：选第二种，回宿舍找弟弟。')
  expect(runTurn.mock.calls.at(-1)[0].turn.instruction).toContain('用弟弟的视角。')
  const savedOpening = '雷米已经交还了旧册。他穿过庭院。马夫招呼他上车。'
  const range = '正文中段。'.repeat(1800)
  const savedEnding = '马车停在学院门前。他还没有见到院长。'
  current.markdown = `${savedOpening}\n\n${range}\n\n${savedEnding}`
  current.document = createWritingDocument(current.markdown)
  const revisedParagraph = '雷米在车上读完了信。他将信折好。这件事明天再问。'
  runTurn.mockResolvedValue({ text: `:::narration\n${revisedParagraph}\n\n另起一段。` })
  const longRevision = await generateAssistantNarrative({
    request: { operation: 'replace', before: range, instruction: '改写这一段，接好前后文。' },
    prepared: { bookId: 'draft-book', currentChapterId: 'draft-chapter', authorQuestion: '改写中段。',
      editBaseline: { book: { chapters: [{ id: 'draft-chapter', content: current.markdown }] } } }
  }, { readCurrent: () => current, resolveTarget: target => target,
    readNarrative: () => ({ resolveContext, runTurn }) })
  const revisionTurn = runTurn.mock.calls.at(-1)[0].turn
  expect(revisionTurn.rewriteText).toBe(range)
  expect(revisionTurn.instruction).toContain('【局部润色】')
  expect(revisionTurn.planning).toBe('direct')
  expect(revisionTurn.instruction).toContain(`位置前的相邻正式原文（用于衔接，保留原样）：\n${savedOpening}`)
  expect(revisionTurn.instruction).toContain(`位置后的相邻正式原文（保留原样，生成内容需接到这里；不是此刻已发生的事件）：\n${savedEnding}`)
  expect(longRevision.text).toBe(`${revisedParagraph}\n\n另起一段。`)
  expect(current.markdown).toBe(`${savedOpening}\n\n${range}\n\n${savedEnding}`)
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
