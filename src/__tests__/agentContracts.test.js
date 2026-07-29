import { describe, expect, it } from 'vitest'
import {
  getTask,
  getTasksBySurface,
  getExecutableTaskTypes,
  validateTaskType,
  isLegacyAlias,
  LEGACY_ALIASES
} from '../services/agents/agentTaskRegistry'
import {
  buildContextEnvelope,
  addBlock,
  clipContextEnvelope,
  toPromptText,
  BLOCK_KINDS
} from '../services/agents/agentContextEnvelope'
import {
  createPendingResult,
  markCompleted,
  markStale,
  markApplied,
  markFailed,
  markDismissed,
  canApply,
  canDismiss,
  isActive,
  validateAgentAction,
  validateAgentResult,
  RESULT_STATUSES
} from '../services/agents/agentResultLifecycle'
import {
  adaptLegacyResultToAgentResult,
  adaptAgentResultToLegacy,
  adaptLegacyContextToEnvelope
} from '../services/agents/legacyAdapter'
import {
  buildAdvisorProviderOptions,
  buildAdvisorRequestPayload
} from '../services/advisorTaskService'
import {
  getServerTaskTypes,
  validateServerTaskType
} from '../../server/services/agentTaskAllowlist'
import { buildOpenClawUserMessage } from '../../server/services/openclawService'
import { runTextModelAgent } from '../../server/services/textModelAgentProvider'
import { runAdvisorAgent } from '../../server/services/advisorAgentRunner'
import {
  agentEnvelopeToPromptText,
  createAgentContextLedger,
  validateAgentContextEnvelope
} from '../../shared/agentContextContract'
import {
  buildCanvasAgentContext,
  buildMaterialsAgentContext
} from '../services/agents/creativeGraphAgentContext'
import { prepareMaterialAgentTransaction } from '../services/agents/creativeGraphAgentActions'
import {
  canUndoCanvasAgentTransaction,
  prepareCanvasAgentTransaction,
  restoreCanvasAgentTransaction
} from '../services/agents/canvasAgentTransaction'
import { buildExperienceAgentContext } from '../services/agents/experienceAgentContext'
import { validateExperienceAgentResult } from '../services/agents/experienceAgentResults'
import { buildStoryboardAgentContext } from '../services/agents/storyboardAgentContext'
import {
  applyStoryboardShotPatch,
  canUndoStoryboardShotPatch,
  undoStoryboardShotPatch,
  validateStoryboardAgentResult
} from '../services/agents/storyboardAgentResults'
import {
  PASSIVE_HINT_TYPES,
  canRequestPassiveHint,
  getAgentRuntimeMetrics,
  getAgentRuntimePolicy,
  recordAgentRuntimeEvent,
  setAgentRuntimeEnabled
} from '../services/agents/agentRuntimePolicy'
import { createAdvisorTaskResponse } from '../../server/services/advisorTaskService'

describe('agentContracts', function () {
  it('covers task registry, context budget, result lifecycle, and legacy compatibility', async function () {
    const policyValues = new Map()
    const policyStorage = {
      getItem: (key) => policyValues.get(key) || null,
      setItem: (key, value) => policyValues.set(key, value)
    }
    expect(getAgentRuntimePolicy(policyStorage).enabled).toBe(true)
    setAgentRuntimeEnabled(false, policyStorage)
    expect(canRequestPassiveHint(
      PASSIVE_HINT_TYPES.WRITING_INLINE,
      100000,
      policyStorage
    )).toMatchObject({ allowed: false, reason: 'agent-disabled' })
    setAgentRuntimeEnabled(true, policyStorage)
    recordAgentRuntimeEvent(
      PASSIVE_HINT_TYPES.WRITING_INLINE,
      'requested',
      { at: 100000, chars: 900 },
      policyStorage
    )
    expect(canRequestPassiveHint(
      PASSIVE_HINT_TYPES.WRITING_INLINE,
      110000,
      policyStorage
    )).toMatchObject({ allowed: false, reason: 'frequency-limit', retryAfterMs: 35000 })
    expect(canRequestPassiveHint(
      PASSIVE_HINT_TYPES.WRITING_INLINE,
      145000,
      policyStorage
    )).toMatchObject({ allowed: true })
    recordAgentRuntimeEvent(
      PASSIVE_HINT_TYPES.CONSISTENCY_CONFLICT,
      'shown',
      { at: 150000, reason: 'revision-changed' },
      policyStorage
    )
    recordAgentRuntimeEvent(
      PASSIVE_HINT_TYPES.PENDING_RESULT,
      'requested',
      { at: 150000 },
      policyStorage
    )
    expect(canRequestPassiveHint(
      PASSIVE_HINT_TYPES.PENDING_RESULT,
      200000,
      policyStorage
    )).toMatchObject({ allowed: false, reason: 'frequency-limit', retryAfterMs: 70000 })
    expect(getAgentRuntimeMetrics(policyStorage)).toMatchObject({
      totals: {
        'writing-inline:requested': 1,
        'consistency-conflict:shown': 1,
        'pending-result:requested': 1
      },
      lastRequestedAt: { 'writing-inline': 100000 }
    })

    expect(getTask('worldbook.import.structure').surfaces).toContain('worldbook')

    for (var i = 0; i < Object.keys(LEGACY_ALIASES).length; i++) {
      var legacy = Object.keys(LEGACY_ALIASES)[i]
      var canonical = LEGACY_ALIASES[legacy]
      expect(getTask(legacy).id).toBe(canonical)
      expect(isLegacyAlias(legacy)).toBe(true)
    }

    expect(validateTaskType('advisor.fix.paragraph')).toEqual({
      valid: true,
      canonical: 'writing.fix.paragraph'
    })
    expect(validateTaskType('unknown.task')).toEqual({
      valid: false,
      reason: 'unknown-task-type'
    })
    expect(validateServerTaskType('unknown.task')).toMatchObject({
      valid: false,
      code: 'AGENT_TASK_UNKNOWN',
      reason: 'unknown-task-type'
    })
    expect(validateTaskType('canvas.organize')).toEqual({
      valid: true,
      canonical: 'canvas.organize'
    })
    expect(getExecutableTaskTypes()).toEqual(getServerTaskTypes())
    expect(validateServerTaskType('advisor.fix.selection')).toMatchObject({
      valid: true,
      taskType: 'writing.fix.selection',
      wasLegacyAlias: true
    })
    expect(validateServerTaskType('canvas.organize')).toMatchObject({
      valid: true,
      taskType: 'canvas.organize'
    })
    expect(getTask('canvas.organize')).toMatchObject({
      availability: 'available',
      owner: 'canvas',
      actionTypes: ['canvas-layout']
    })
    expect(getTask('canvas.relate').actionTypes).toEqual(['canvas-relations'])
    expect(getTask('canvas.transition').actionTypes).toEqual(['canvas-transition'])
    expect(getTask('experience.next-actions')).toMatchObject({
      availability: 'available',
      owner: 'experience',
      actionTypes: ['runtime-candidate'],
      targetTypes: ['experience-turn']
    })
    expect(getTask('experience.emergence').targetTypes).toEqual(['experience-state'])
    expect(getTask('storyboard.review')).toMatchObject({
      availability: 'available',
      owner: 'storyboard',
      actionTypes: ['storyboard-shot-patch'],
      targetTypes: ['storyboard-shot']
    })
    expect(getTask('storyboard.video.prompt').actionTypes).toEqual(['generation-request'])
    expect(getTask('advisor.fix.selection')).toMatchObject({
      availability: 'available',
      owner: 'writing',
      actionTypes: ['text-patch']
    })

    expect(getTasksBySurface('experience').length).toBe(3)
    expect(getTasksBySurface('writing').length).toBeGreaterThanOrEqual(7)
    expect(getTasksBySurface('materials').map(function (item) { return item.taskType })).toEqual(
      expect.arrayContaining(['materials.refine', 'materials.classify', 'materials.split', 'materials.relate'])
    )
    expect(getTask('materials.classify').actionTypes).toEqual(['material-classification'])
    expect(getTask('materials.split').actionTypes).toEqual(['material-split'])
    expect(getTask('materials.relate').actionTypes).toEqual(['material-relations'])

    var materialContext = buildMaterialsAgentContext({
      selectedAsset: { id: 'selected', title: '当前素材', content: 'VISIBLE MATERIAL' },
      selectedAssets: [{ id: 'selected', title: '当前素材', content: 'VISIBLE MATERIAL' }]
    })
    expect(JSON.stringify(materialContext.context)).toContain('VISIBLE MATERIAL')
    expect(JSON.stringify(materialContext.context)).not.toContain('UNSELECTED SECRET')
    var materialAssets = [
      { id: 'selected', title: '当前素材', content: 'VISIBLE MATERIAL', kind: 'inspiration', status: 'accepted', sourceRefs: [] },
      { id: 'related', title: '关联素材', content: 'RELATED MATERIAL', kind: 'event', status: 'accepted', sourceRefs: [] }
    ]
    var classificationTransaction = prepareMaterialAgentTransaction([{
      type: 'material-classification',
      payload: { changes: [{ assetId: 'selected', kind: 'event' }] }
    }], materialAssets)
    expect(classificationTransaction).toMatchObject({
      ok: true,
      operations: [{ type: 'update', assetId: 'selected', patch: { kind: 'event' } }]
    })
    expect(prepareMaterialAgentTransaction([{
      type: 'material-relations',
      payload: { links: [{ sourceId: 'selected', targetId: 'outside', relation: 'place' }] }
    }], materialAssets)).toMatchObject({ ok: false, reason: 'invalid-relation-target' })
    expect(prepareMaterialAgentTransaction([{
      type: 'material-split',
      payload: {
        sourceAssetId: 'selected',
        parts: [
          { title: '发现信号', content: '发现异常信号。', kind: 'event' },
          { title: '人物判断', content: '陆晨曦确认信号异常。', kind: 'character-fact' }
        ]
      }
    }], materialAssets)).toMatchObject({
      ok: true,
      operations: [
        { type: 'create', asset: { title: '发现信号', kind: 'event' } },
        { type: 'create', asset: { title: '人物判断', kind: 'character-fact' } },
        { type: 'update', assetId: 'selected', patch: { status: 'archived' } }
      ]
    })
    expect(prepareMaterialAgentTransaction([{
      type: 'material-relations',
      payload: {
        links: [{
          sourceId: 'selected',
          targetId: 'related',
          relation: 'place',
          reason: '都发生在雾港'
        }]
      }
    }], materialAssets)).toMatchObject({
      ok: true,
      operations: expect.arrayContaining([
        expect.objectContaining({ type: 'update', assetId: 'selected' }),
        expect.objectContaining({ type: 'update', assetId: 'related' })
      ])
    })
    var materialResponse = createAdvisorTaskResponse({
      taskType: 'materials.classify',
      advice: JSON.stringify({
        summary: '归入剧情事件',
        actions: [{
          type: 'material-classification',
          payload: { changes: [{ assetId: 'selected', kind: 'event' }] }
        }]
      }),
      target: { type: 'asset-selection', id: 'selected', revision: 'rev-material' }
    })
    var materialAgentResult = adaptLegacyResultToAgentResult(materialResponse.result, 'materials.classify')
    expect(materialAgentResult.actions[0]).toMatchObject({
      type: 'material-classification',
      payload: { changes: [{ assetId: 'selected', kind: 'event' }] }
    })
    expect(buildOpenClawUserMessage(
      buildMaterialsAgentContext({ selectedAssets: materialAssets }).context,
      '分类',
      { taskType: 'materials.classify' }
    )).toContain('material-classification')

    var canvasContext = buildCanvasAgentContext({
      selectedCard: { id: 'selected', content: 'SELECTED NODE' },
      cards: [
        { id: 'selected', content: 'SELECTED NODE' },
        { id: 'neighbor', content: 'DIRECT NEIGHBOR' },
        { id: 'hidden', content: 'NON NEIGHBOR SECRET' }
      ],
      edges: [{ sourceId: 'selected', targetId: 'neighbor', type: 'continuation' }],
      viewport: { width: 800, height: 600 }
    })
    expect(canvasContext.cards.map(function (card) { return card.id })).toEqual(['selected', 'neighbor'])
    expect(JSON.stringify(canvasContext.context)).not.toContain('NON NEIGHBOR SECRET')
    var canvasCards = [
      { id: 'selected', content: 'SELECTED NODE', x: 100, y: 100 },
      { id: 'neighbor', content: 'DIRECT NEIGHBOR', x: 360, y: 100 },
      { id: 'hidden', content: 'NON NEIGHBOR SECRET', x: 900, y: 900 }
    ]
    var canvasEdges = [{
      id: 'edge-1',
      sourceId: 'selected',
      targetId: 'neighbor',
      type: 'continuation',
      label: 'preserve metadata'
    }]
    var canvasTransaction = prepareCanvasAgentTransaction([
      {
        type: 'canvas-layout',
        payload: { moves: [{ cardId: 'selected', x: 140, y: 180 }] }
      },
      {
        type: 'canvas-transition',
        payload: {
          changes: [{
            operation: 'upsert',
            sourceId: 'selected',
            targetId: 'neighbor',
            edgeType: 'match_cut'
          }]
        }
      }
    ], canvasCards, canvasEdges, {
      allowedCardIds: ['selected', 'neighbor'],
      selectedCardId: 'selected',
      now: 100
    })
    expect(canvasTransaction).toMatchObject({
      ok: true,
      cards: [
        { id: 'selected', x: 140, y: 180 },
        { id: 'neighbor', x: 360, y: 100 },
        { id: 'hidden', x: 900, y: 900 }
      ],
      edges: [{
        id: 'edge-1',
        sourceId: 'selected',
        targetId: 'neighbor',
        type: 'match_cut',
        label: 'preserve metadata'
      }]
    })
    expect(canvasTransaction.receipt.beforeEdgesData[0].label).toBe('preserve metadata')
    expect(canUndoCanvasAgentTransaction(
      canvasTransaction.cards,
      canvasTransaction.edges,
      canvasTransaction.receipt
    )).toBe(true)
    expect(restoreCanvasAgentTransaction(canvasTransaction.cards, canvasTransaction.receipt)[0]).toMatchObject({
      id: 'selected',
      x: 100,
      y: 100
    })
    expect(prepareCanvasAgentTransaction([{
      type: 'canvas-relations',
      payload: {
        changes: [{
          operation: 'upsert',
          sourceId: 'selected',
          targetId: 'hidden',
          edgeType: 'parallel'
        }]
      }
    }], canvasCards, canvasEdges, {
      allowedCardIds: ['selected', 'neighbor'],
      now: 100
    })).toMatchObject({ ok: false, reason: 'invalid-edge-change' })
    var canvasResponse = createAdvisorTaskResponse({
      taskType: 'canvas.organize',
      advice: JSON.stringify({
        summary: '收紧局部布局',
        actions: [{
          type: 'canvas-layout',
          payload: { moves: [{ cardId: 'selected', x: 140, y: 180 }] }
        }]
      }),
      target: { type: 'canvas-selection', id: 'selected', revision: 'rev-canvas' }
    })
    expect(adaptLegacyResultToAgentResult(canvasResponse.result, 'canvas.organize').actions[0]).toMatchObject({
      type: 'canvas-layout',
      payload: { moves: [{ cardId: 'selected', x: 140, y: 180 }] }
    })
    expect(buildOpenClawUserMessage(
      canvasContext.context,
      '整理',
      { taskType: 'canvas.organize' }
    )).toContain('canvas-layout')

    var experienceContext = buildExperienceAgentContext({
      taskType: 'experience.next-actions',
      projectId: 'world-1',
      sessionId: 'session-1',
      worldbook: {
        id: 'world-1',
        geoHistory: {
          nodes: [{
            id: 'history-gray-wall',
            summary: '旧税所封存过一册去向不明的账簿。',
            placeRef: { placeId: 'place:gray-wall', name: '灰墙旧税所' },
            participants: ['林舟'],
            unresolvedHooks: ['账簿去向']
          }, {
            id: 'history-remote',
            summary: '远方王城正在举行与当前现场无关的庆典。',
            placeRef: { placeId: 'place:remote', name: '远方王城' }
          }]
        }
      },
      messages: [
        { id: 'msg-1', role: 'user', content: '我检查柜台后的暗格。' },
        { id: 'msg-2', role: 'assistant', content: '暗格里留着潮湿的账页。' }
      ],
      runtimeState: {
        worldMapState: { placeId: 'place:gray-wall', currentScene: '灰墙旧税所' },
        encounteredCharacters: [{ id: 'char-lin', name: '林舟', status: '警觉' }],
        goals: [{ title: '查清账簿去向', status: 'active' }],
        emergenceCandidates: [{
          id: 'candidate-ledger',
          title: '账页异动',
          summary: '账页上的盐渍与林舟此前提到的港区仓单一致。',
          placeId: 'place:gray-wall'
        }]
      },
      memoryRecall: {
        content: '林舟不信任潮盐行会。',
        included: [{ id: 'memory-lin' }]
      }
    })
    expect(experienceContext.envelope.blocks.map(function (block) { return block.kind })).toEqual(
      expect.arrayContaining(['scene', 'location', 'history', 'character', 'memory', 'references'])
    )
    expect(JSON.stringify(experienceContext.envelope)).not.toContain('远方王城正在举行')
    expect(experienceContext.target.allowedCandidateIds).toEqual(['candidate-ledger'])
    var experienceResult = validateExperienceAgentResult({
      actions: [{
        type: 'runtime-candidate',
        payload: {
          kind: 'next-actions',
          options: [
            {
              id: 'inspect-ledger',
              label: '比对账页与仓单',
              intent: '确认盐渍来源',
              risk: '可能惊动附近守卫',
              evidenceRefs: ['history:history-gray-wall']
            },
            {
              id: 'ask-lin',
              label: '询问林舟旧税所往事',
              intent: '补齐账簿历史',
              risk: '关系可能变得紧张',
              evidenceRefs: ['character:char-lin']
            }
          ]
        }
      }]
    }, {
      taskType: 'experience.next-actions',
      allowedCandidateIds: experienceContext.target.allowedCandidateIds,
      allowedEvidenceRefs: experienceContext.target.allowedEvidenceRefs
    })
    expect(experienceResult).toMatchObject({
      valid: true,
      result: { actions: [{ payload: { kind: 'next-actions', options: [{ id: 'inspect-ledger' }, { id: 'ask-lin' }] } }] }
    })
    expect(validateExperienceAgentResult({
      actions: [{
        type: 'runtime-candidate',
        payload: {
          kind: 'emergence-review',
          candidateId: 'invented-messenger',
          reason: '神秘使者突然出现并推动故事。'
        }
      }]
    }, {
      taskType: 'experience.emergence',
      allowedCandidateIds: ['candidate-ledger'],
      allowedEvidenceRefs: experienceContext.target.allowedEvidenceRefs
    })).toMatchObject({ valid: false, reason: 'invalid-emergence-payload' })
    expect(buildOpenClawUserMessage(
      experienceContext.envelope,
      '生成下一步',
      { taskType: 'experience.next-actions', target: experienceContext.envelope.target }
    )).toContain('"kind": "next-actions"')

    var storyboardShots = [
      {
        shotId: 'shot-1',
        sequence: 1,
        sourceText: '林舟推开旧税所的门。',
        visual: '冷光从门缝切入。',
        shotType: 'wide',
        shotSize: 'wide',
        cameraMovement: 'fixed',
        camera: 'fixed',
        transition: 'cut',
        duration: 4
      },
      {
        shotId: 'shot-2',
        sequence: 2,
        sourceText: '他在柜台后发现潮湿账页。',
        visual: '账页特写，盐渍反光。',
        shotType: 'close_up',
        shotSize: 'close_up',
        cameraMovement: 'push',
        camera: 'push',
        transition: 'cut',
        duration: 3
      },
      {
        shotId: 'shot-3',
        sequence: 3,
        sourceText: '林舟回头看向门外。',
        visual: '保持门口冷光方向。',
        shotType: 'medium',
        shotSize: 'medium',
        cameraMovement: 'fixed',
        camera: 'fixed',
        transition: 'cut',
        duration: 4
      },
      {
        shotId: 'shot-hidden',
        sequence: 4,
        sourceText: '不应进入局部上下文的远端镜头。',
        visual: '远端场景。',
        shotType: 'wide',
        shotSize: 'wide',
        cameraMovement: 'fixed',
        camera: 'fixed',
        transition: 'cut',
        duration: 4
      }
    ]
    var storyboardContext = buildStoryboardAgentContext({
      taskType: 'storyboard.review',
      shots: storyboardShots,
      shotIndex: 1,
      documentId: 'storyboard-doc-1',
      versionId: 'storyboard-version-1'
    })
    expect(JSON.stringify(storyboardContext.envelope)).toContain('shot-1')
    expect(JSON.stringify(storyboardContext.envelope)).toContain('shot-2')
    expect(JSON.stringify(storyboardContext.envelope)).toContain('shot-3')
    expect(JSON.stringify(storyboardContext.envelope)).not.toContain('shot-hidden')
    var storyboardValidation = validateStoryboardAgentResult({
      actions: [{
        type: 'storyboard-shot-patch',
        payload: {
          shotId: 'shot-2',
          changes: { duration: 5, transition: 'dissolve', visual: '账页特写，冷光方向与前镜一致。' },
          reason: '保持光线和节奏连续',
          evidenceRefs: ['storyboard-shot:shot-1', 'storyboard-shot:shot-2']
        }
      }]
    }, {
      taskType: 'storyboard.review',
      target: storyboardContext.target
    })
    expect(storyboardValidation.valid).toBe(true)
    var storyboardTransaction = applyStoryboardShotPatch(
      storyboardShots,
      storyboardValidation.result.actions[0],
      'shot-2'
    )
    expect(storyboardTransaction.ok).toBe(true)
    expect(storyboardTransaction.shots[1]).toMatchObject({
      shotId: 'shot-2',
      duration: 5,
      transition: 'dissolve',
      visual: '账页特写，冷光方向与前镜一致。'
    })
    expect(canUndoStoryboardShotPatch(storyboardTransaction.shots, storyboardTransaction.receipt)).toBe(true)
    expect(undoStoryboardShotPatch(storyboardTransaction.shots, storyboardTransaction.receipt)[1]).toMatchObject({
      shotId: 'shot-2',
      duration: 3,
      transition: 'cut'
    })
    expect(validateStoryboardAgentResult({
      actions: [{
        type: 'storyboard-shot-patch',
        payload: { shotId: 'shot-hidden', changes: { duration: 5 } }
      }]
    }, {
      taskType: 'storyboard.review',
      target: storyboardContext.target
    })).toMatchObject({ valid: false, reason: 'invalid-storyboard-patch' })
    var generationContext = buildStoryboardAgentContext({
      taskType: 'storyboard.video.prompt',
      shots: storyboardShots,
      shotIndex: 1,
      documentId: 'storyboard-doc-1',
      versionId: 'storyboard-version-1'
    })
    expect(validateStoryboardAgentResult({
      actions: [{
        type: 'generation-request',
        payload: {
          kind: 'storyboard-video',
          shotId: 'shot-2',
          versionId: 'storyboard-version-1',
          prompt: '账页特写，镜头缓慢推进，承接上一镜门缝冷光，保持人物服装和空间方向连续，画面中不出现文字。',
          evidenceRefs: ['storyboard-shot:shot-1', 'storyboard-shot:shot-2']
        }
      }]
    }, {
      taskType: 'storyboard.video.prompt',
      target: generationContext.target
    }).valid).toBe(true)
    expect(buildOpenClawUserMessage(
      generationContext.envelope,
      '准备视频请求',
      { taskType: 'storyboard.video.prompt', target: generationContext.envelope.target }
    )).toContain('"type": "generation-request"')

    var envelope = buildContextEnvelope({ surface: 'writing', budget: { maxChars: 70 } })

    var env = addBlock(envelope, BLOCK_KINDS.SYSTEM, 'RULES: 保持语气。', { priority: 1000 })
    env = addBlock(env, BLOCK_KINDS.SELECTION, 'SEL: 她站在灰墙前。', { priority: 800, sourceRefs: ['ch1'] })
    env = addBlock(env, BLOCK_KINDS.HISTORY, 'HIST: ' + 'A'.repeat(60), { priority: 150 })
    env = addBlock(env, BLOCK_KINDS.REFERENCES, 'REFS: 索德码头。', { priority: 350, sourceRefs: ['e1'] })
    env = addBlock(env, BLOCK_KINDS.MEMORY, 'MEM: ' + 'B'.repeat(40), { priority: 400, sourceRefs: ['m1'] })

    var clipped = clipContextEnvelope(env)
    var kinds = clipped.blocks.map(function (b) { return b.kind })

    expect(kinds).toContain('system')
    expect(kinds).toContain('selection')
    expect(clipped.budget.usedChars).toBeLessThanOrEqual(70)
    expect(clipped.dropReport).not.toBeNull()
    expect(clipped.dropReport.dropped.length).toBeGreaterThanOrEqual(1)

    var droppedKinds = clipped.dropReport.dropped.map(function (d) { return d.kind })
    expect(droppedKinds).toContain('history')

    var text = toPromptText(clipped)
    expect(text).toContain('RULES')
    expect(text).toContain('SEL')
    expect(agentEnvelopeToPromptText(clipped)).toBe(text)
    expect(clipped.dropReport.dropped.every(function (part) { return Boolean(part.reason) })).toBe(true)

    var tight = buildContextEnvelope({ surface: 'writing', budget: { maxChars: 8 } })
    tight = addBlock(tight, BLOCK_KINDS.SYSTEM, 'RULES-LONG', {
      priority: 1000,
      sourceRefs: ['rules:1']
    })
    tight = addBlock(tight, BLOCK_KINDS.SELECTION, 'SELECTION', {
      priority: 800,
      sourceRefs: ['chapter:1']
    })
    tight = clipContextEnvelope(tight)
    expect(tight.blocks[0]).toMatchObject({
      kind: 'system',
      truncated: true,
      retainedChars: 8
    })
    expect(toPromptText(tight)).toBe('RULES-LO')
    expect(tight.dropReport.dropped[0]).toMatchObject({
      kind: 'selection',
      reason: 'budget-exhausted'
    })

    var adapted = adaptLegacyContextToEnvelope({
      context: '章节上下文',
      question: '检查',
      scope: 'selection',
      taskType: 'advisor.fix.selection',
      target: { kind: 'selection', text: '需要修改的选区' }
    })
    var paragraphAdapted = adaptLegacyContextToEnvelope({
      context: {
        chapterTitle: '第一章',
        paragraph: { text: '祠堂内的风铃忽然停了。' },
        contextWindow: { before: '她收好麻纸。', after: '门外没有人。' }
      },
      question: '补强段落衔接',
      scope: 'paragraph',
      taskType: 'writing.fix.paragraph',
      target: { kind: 'paragraph', text: '祠堂内的风铃忽然停了。' }
    })
    var paragraphPrompt = toPromptText(paragraphAdapted.envelope)
    expect(paragraphPrompt).toContain('【必须处理的目标原文】')
    expect(paragraphPrompt).toContain('【当前段落，必须据此完成任务】')
    expect(paragraphPrompt).toContain('祠堂内的风铃忽然停了。')
    expect(paragraphPrompt).toContain('【光标前文】')
    expect(function () {
      createAdvisorTaskResponse({
        taskType: 'writing.fix.paragraph',
        advice: JSON.stringify({
          mode: 'replace',
          summary: '未提供当前段落',
          replacement: '请提供当前段落内容以便重写。'
        }),
        target: { type: 'paragraph', revision: 'rev-refusal' }
      })
    }).toThrow('模型没有返回可应用的正文')
    var requestEnvelope = clipContextEnvelope(adapted.envelope)
    var requestPayload = buildAdvisorRequestPayload({
      envelope: requestEnvelope,
      question: '检查',
      taskType: adapted.resolvedTaskType,
      requestId: 'trace-1',
      clientStartedAt: 1
    })
    expect(requestPayload.context).toBeUndefined()
    expect(requestPayload.envelope.blocks.map(function (block) { return block.kind })).toEqual(
      requestEnvelope.blocks.map(function (block) { return block.kind })
    )
    var serverPrompt = buildOpenClawUserMessage(requestPayload.envelope, requestPayload.question, {
      taskType: requestPayload.taskType,
      target: requestPayload.target,
      options: {
        providerConfig: { apiKey: 'must-not-enter-prompt' },
        agentProvider: 'text-model',
        editorMode: 'selection'
      }
    })
    expect(serverPrompt).toContain(toPromptText(requestPayload.envelope))
    expect(serverPrompt).toContain('editorMode')
    expect(serverPrompt).not.toContain('must-not-enter-prompt')
    expect(serverPrompt).not.toContain('providerConfig')
    var promptSourceOrder = requestPayload.envelope.blocks
      .map(function (block) { return block.sourceRefs[0] })
      .filter(Boolean)
    expect(promptSourceOrder).toEqual(
      requestEnvelope.blocks.map(function (block) { return block.sourceRefs[0] }).filter(Boolean)
    )
    expect(requestPayload.target.revision).toMatch(/^rev-/)
    expect(validateAgentContextEnvelope(requestPayload.envelope, {
      surfaces: ['writing'],
      targetTypes: ['selection'],
      requiresRevision: true
    })).toEqual({ valid: true })
    expect(validateAgentContextEnvelope({
      ...requestPayload.envelope,
      target: { ...requestPayload.envelope.target, revision: null }
    }, {
      surfaces: ['writing'],
      targetTypes: ['selection'],
      requiresRevision: true
    })).toMatchObject({
      valid: false,
      code: 'AGENT_TARGET_REVISION_REQUIRED'
    })
    var ledger = createAgentContextLedger(tight)
    expect(ledger.parts.map(function (part) { return part.status })).toEqual(['truncated', 'dropped'])
    expect(ledger.parts.every(function (part) { return Boolean(part.reason) })).toBe(true)
    await expect(runTextModelAgent(requestPayload.envelope, '检查', {
      taskType: requestPayload.taskType,
      options: { providerConfig: {} }
    })).rejects.toMatchObject({
      code: 'AGENT_PROVIDER_CONFIG_INVALID',
      retryable: false
    })
    expect(buildAdvisorProviderOptions({
      provider: 'MiniMax',
      baseUrl: 'https://api.minimaxi.com/anthropic',
      apiKey: 'sk-test',
      model: 'MiniMax-M2.7'
    }, {
      editorMode: 'selection'
    })).toEqual({
      editorMode: 'selection',
      agentProvider: 'text-model',
      providerConfig: {
        baseUrl: 'https://api.minimaxi.com/anthropic',
        apiKey: 'sk-test',
        model: 'MiniMax-M2.7',
        format: 'anthropic'
      }
    })
    await expect(runAdvisorAgent({
      providerId: 'openclaw',
      capability: 'text',
      envelope: requestPayload.envelope,
      question: '检查',
      taskMeta: {}
    })).rejects.toMatchObject({
      code: 'AGENT_PROVIDER_UNKNOWN',
      retryable: false
    })
    var pending = createPendingResult('writing.fix.selection', { baseRevision: 'rev-1' })
    expect(pending.status).toBe(RESULT_STATUSES.PENDING)
    expect(isActive(pending)).toBe(true)

    var completed = markCompleted(pending, {
      summary: '建议修改语气',
      suggestions: [{ type: 'text-patch', label: 'a', content: 'b' }],
      actions: [{ type: 'text-patch', content: '她停下脚步。', range: { start: 0, end: 5 } }]
    })
    expect(validateAgentAction(completed.actions[0])).toEqual({
      valid: true,
      type: 'text-patch'
    })
    expect(validateAgentAction({ type: 'mystery-write', content: 'x' })).toMatchObject({
      valid: false,
      reason: 'unknown-action-type'
    })
    expect(validateAgentResult(completed)).toEqual({ valid: true })
    expect(markCompleted(pending, {
      actions: [{ type: 'mystery-write', content: 'x' }]
    }).actions).toEqual([])
    expect(canApply(completed, 'rev-1')).toBe(true)

    var stale = markStale(completed, 'base-text-changed', 'rev-2')
    expect(stale.status).toBe(RESULT_STATUSES.STALE)
    expect(canApply(stale, 'rev-2')).toBe(false)

    var applied = markApplied(completed)
    expect(canApply(applied, 'rev-1')).toBe(false)

    var failed = markFailed(completed, { code: 'AGENT_ERROR', message: 'boom' })
    expect(failed.status).toBe(RESULT_STATUSES.FAILED)
    expect(canApply(failed, 'rev-1')).toBe(false)
    expect(canDismiss(failed)).toBe(true)

    var dismissed = markDismissed(completed)
    expect(dismissed.status).toBe(RESULT_STATUSES.DISMISSED)
    expect(canApply(dismissed, 'rev-1')).toBe(false)
    expect(canDismiss(dismissed)).toBe(false)
    expect(canDismiss(applied)).toBe(false)
    expect(canDismiss(pending)).toBe(true)

    var legacyResult = {
      task: 'advisor.fix.selection',
      mode: 'replace',
      summary: '建议修改语气',
      replacement: '她停下脚步。',
      targetRange: { start: 0, end: 5 },
      issues: [{ type: 'review', severity: 'medium', message: '语气太冷' }],
      action: ['修改语气更柔和']
    }

    var agentResult = adaptLegacyResultToAgentResult(legacyResult, 'writing.fix.selection')
    expect(agentResult.status).toBe(RESULT_STATUSES.COMPLETED)
    var replacementAction = agentResult.actions.find(function (a) { return a.content === '她停下脚步。' })
    expect(replacementAction.range).toEqual({ start: 0, end: 5 })

    var legacyOutput = adaptAgentResultToLegacy(agentResult)
    expect(legacyOutput.result.replacement).toBe('她停下脚步。')
    expect(legacyOutput.result.mode).toBe('replace')
  })
})
