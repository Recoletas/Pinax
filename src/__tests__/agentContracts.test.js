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
import {
  NARRATIVE_READ_TOOL_NAMES,
  createNarrativeCursor,
  getNarrativeToolCatalog,
  parseNarrativeCursor,
  resolveNarrativeActiveToolNames,
  validateNarrativeToolCall
} from '../../shared/narrativeAgentContract'
import {
  GENERATION_AGENT_TURN_SCHEMA_VERSION,
  resolveGenerationToolProtocol,
  validateGenerationAgentTurnRequest
} from '../../shared/generationToolContract'
import { buildNarrativeKernel } from '../services/agents/narrativeKernel'
import {
  createNarrativeResourceIndex,
  getNarrativeResourceIndex,
  searchNarrativeResources
} from '../services/agents/narrativeResourceIndex'
import { createNarrativeToolRegistry } from '../services/agents/narrativeToolRegistry'
import { validateNarrativeEvidence } from '../services/agents/narrativeEvidenceValidator'
import {
  buildOpenAIToolRequest,
  parseOpenAIToolResponse
} from '../../server/services/providers/openAiToolAdapter'
import {
  buildAnthropicToolRequest,
  parseAnthropicToolResponse
} from '../../server/services/providers/anthropicToolAdapter'
import {
  buildMiniMaxToolRequest,
  parseMiniMaxToolResponse
} from '../../server/services/providers/minimaxToolAdapter'
import {
  resolveToolCallingProvider,
  runToolCallingProviderTurn
} from '../../server/services/toolCallingProviderAdapter'
import {
  buildOpenAIResponsesRequest,
  parseOpenAIResponsesToolResponse
} from '../../server/services/providers/openAiResponsesToolAdapter'
import {
  createNarrativeCapabilityCache,
  downgradeNarrativeProviderCapability,
  getNarrativeCapabilityCacheKey,
  invalidateNarrativeCapability,
  recordNarrativeCapabilityProbe,
  resolveNarrativeProviderCapabilities
} from '../../server/services/providers/providerCapabilityResolver'
import { probeNarrativeProviderCapabilities } from '../../server/services/providers/narrativeCapabilityProbe'
import {
  pruneNarrativeToolResults,
  runNarrativeAgentLoop,
  runNarrativeAgentGeneration
} from '../services/agents/narrativeAgentOrchestrator'
import {
  deriveNarrativeGroundingPolicy,
  hasNarrativeGroundingEvidence
} from '../services/agents/narrativeAgentPolicy'
import { resolveNarrativeSceneSummary } from '../services/agents/narrativeSceneSummary'
import {
  createNarrativeProductionObserver,
  getNarrativeProductionMetrics,
  recordNarrativeProductionRun,
  summarizeNarrativeProductionMetrics
} from '../services/agents/narrativeProductionMetrics'
import {
  buildNarrativeGateScenarioMatrix,
  buildNarrativeGateStorage,
  summarizeScenarioMatrix
} from '../../scripts/lib/narrative-gate-fixture.mjs'
import { NARRATIVE_TOOL_PROTOCOL_FIXTURES } from './fixtures/narrative-tool-transcripts.js'
import {
  NARRATIVE_TRANSCRIPT_SCHEMA_VERSION,
  appendNarrativeTranscriptMessage,
  deserializeNarrativeTranscript,
  normalizeNarrativeTranscript,
  serializeNarrativeTranscript
} from '../../shared/narrativeTranscriptContract.js'
import {
  intentCharRange,
  narrativeExpansionFactor
} from '../../shared/narrativeGenerationIntentContract.js'
import { validateNarrativeBeatPlanInput } from '../../shared/narrativeBeatPlanContract.js'
import {
  STRUCTURED_GENERATION_SCHEMA_IDS,
  STRUCTURED_GENERATION_TIMEOUTS,
  getStructuredSettingSchema,
  normalizeStructuredDraftPayload,
  validateStructuredDraftPayload,
  validateStructuredGenerationRequest
} from '../../shared/structuredSettingContract.js'
import {
  PLACE_KINDS,
  PLACE_RELATION_TYPES,
  normalizePlacePayload,
  validatePlacePayload
} from '../../shared/placeEntryContract.js'
import { normalizeStructuredPlaceGenerationPayload } from '../../shared/structuredPlaceGenerationContract.js'
import {
  buildSettingRevisionContext,
  hashSettingDraftContent,
  validateSettingDraftRevisionInput
} from '../../shared/settingDraftRevisionContract.js'
import { validateStructuredGenerationRequestEnvelope } from '../../shared/structuredGenerationContract.js'
import {
  buildStructuredProviderRequest,
  runStructuredProviderRequest
} from '../../server/services/providers/structuredOutputAdapter.js'
import {
  createStructuredCapabilityCache,
  getStructuredCapabilityCacheKey
} from '../../server/services/providers/structuredCapabilityResolver.js'
import {
  probeStructuredProviderCapabilities,
  runStructuredGeneration
} from '../../server/services/structuredGenerationRunner.js'

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

    const productionValues = new Map()
    const productionStorage = {
      getItem: (key) => productionValues.get(key) || null,
      setItem: (key, value) => productionValues.set(key, value),
      removeItem: (key) => productionValues.delete(key)
    }
    const productionObserver = createNarrativeProductionObserver(1000)
    productionObserver.observeStatus({
      phase: 'executing-tools',
      at: 1200,
      toolRounds: 1,
      callCount: 2
    })
    productionObserver.observeStatus({
      phase: 'streaming',
      at: 1500,
      toolRounds: 1,
      totalCalls: 2,
      evidenceCount: 2
    })
    productionObserver.observeChunk({ content: '正文' }, 1700)
    expect(productionObserver.snapshot(2100)).toMatchObject({
      totalMs: 1100,
      decisionMs: 500,
      firstTokenMs: 700,
      streamMs: 600,
      outputChars: 2,
      toolRounds: 1,
      totalCalls: 2,
      evidenceCount: 2
    })
    for (let index = 0; index < 60; index += 1) {
      const isProviderFailure = index === 58
      const isTimeoutFailure = index === 59
      const outcome = isProviderFailure || isTimeoutFailure ? 'error' : 'success'
      recordNarrativeProductionRun({
        runId: `production-${index}`,
        provider: index % 2 ? 'anthropic' : 'openai',
        model: index % 2 ? 'MiniMax-M2.7' : 'gpt-compatible',
        mode: index === 0 ? 'init' : 'continue',
        outcome,
        errorCode: isProviderFailure
          ? 'NARRATIVE_PROVIDER_PROTOCOL_INVALID'
          : (isTimeoutFailure ? 'NARRATIVE_AGENT_DECISION_TIMEOUT' : ''),
        protocolOk: isProviderFailure ? false : (isTimeoutFailure ? null : true),
        timing: {
          totalMs: 1200 + index,
          decisionMs: 300,
          firstTokenMs: outcome === 'success' ? 600 + index : 0,
          streamMs: 600
        },
        tools: {
          rounds: index < 2 ? 3 : 1,
          calls: 2,
          evidenceCount: 1,
          errorCount: isProviderFailure ? 1 : 0
        },
        usage: {
          inputTokens: 100,
          outputTokens: 40,
          totalTokens: 140,
          estimatedFinalTokens: 50
        },
        cleanup: {
          renderSettled: true,
          requestReleased: true,
          loadingOwnerSettled: true,
          failureVisible: true
        },
        quality: {
          evidenceUsed: true,
          unsupportedFacts: 1,
          baselineUnsupportedFacts: 2,
          retried: isTimeoutFailure
        },
        content: 'must not be stored',
        apiKey: 'secret-provider-key',
        baseUrl: 'https://private.example'
      }, productionStorage)
    }
    const productionMetrics = getNarrativeProductionMetrics(productionStorage)
    expect(productionMetrics.events).toHaveLength(60)
    expect(productionMetrics.events[0]).not.toHaveProperty('content')
    expect(productionMetrics.events[0]).not.toHaveProperty('apiKey')
    expect(productionMetrics.events[0]).not.toHaveProperty('baseUrl')
    expect(summarizeNarrativeProductionMetrics(productionMetrics)).toMatchObject({
      sample: { total: 60, success: 58, error: 2, qualityLabeled: 60 },
      rates: {
        toolRoundCompliance: 0.9667,
        protocolSuccess: 0.9831,
        typedFailureCleanup: 1,
        unsupportedFactReduction: 0.5
      },
      releaseReady: true
    })

    const gateScenarios = buildNarrativeGateScenarioMatrix()
    const gateScenarioSummary = summarizeScenarioMatrix(gateScenarios)
    expect(gateScenarios).toHaveLength(60)
    expect(new Set(gateScenarios.map(function (scenario) { return scenario.runId })).size).toBe(60)
    expect(gateScenarioSummary).toMatchObject({
      total: 60,
      categories: {
        'no-tool': 5,
        world: 10,
        geo: 10,
        history: 10,
        memory: 10,
        'multi-hop': 5,
        empty: 4,
        continuity: 4,
        'typed-failure': 2
      },
      controlledFaults: {
        'rate-limit': 1,
        timeout: 1
      },
      qualityReviewRequired: 58
    })
    expect(gateScenarios.slice(-2).map(function (scenario) {
      return scenario.controlledFault
    })).toEqual(['rate-limit', 'timeout'])
    expect(gateScenarios.slice(0, -2).every(function (scenario) {
      return scenario.controlledFault === ''
        && scenario.action.length > 0
        && scenario.canonicalFacts.length > 0
    })).toBe(true)

    const gateFixture = buildNarrativeGateStorage(null, { nickname: 'GateMember' })
    const gateWorldbook = gateFixture.storage['worldbook_wb-narrative-gate']
    const gateSession = gateFixture.storage.writing_sessions[0]
    expect(gateWorldbook.entries).toHaveLength(5)
    expect(gateWorldbook.geoHistory).toMatchObject({
      placeRefs: expect.arrayContaining([
        expect.objectContaining({ placeId: 'place-observation' }),
        expect.objectContaining({ placeId: 'place-bridge' }),
        expect.objectContaining({ placeId: 'place-navigation' })
      ]),
      routes: expect.arrayContaining([
        expect.objectContaining({
          fromPlaceId: 'place-observation',
          toPlaceId: 'place-bridge'
        })
      ]),
      nodes: expect.arrayContaining([
        expect.objectContaining({
          id: 'history-return-echo',
          sourceNodeId: 'history-course-change'
        })
      ])
    })
    expect(gateSession.runtimeState.worldMapState.placeId).toBe('place-observation')
    expect(gateFixture.storage.memory_candidates_v1).toEqual(expect.arrayContaining([
      expect.objectContaining({ scope: 'session', scopeId: gateSession.id }),
      expect.objectContaining({ scope: 'project', scopeId: gateWorldbook.id })
    ]))
    expect(gateFixture.sessionStorage).toEqual({
      'pinax.online.nickname': 'GateMember'
    })
    expect(JSON.stringify(gateFixture)).not.toContain('apiKey')
    const configuredGateFixture = buildNarrativeGateStorage({
      provider: 'fixture-provider',
      baseUrl: 'https://provider.invalid',
      apiKey: 'fixture-secret',
      model: 'fixture-model'
    })
    expect(configuredGateFixture.storage.apiSettings.apiKey).toBe('fixture-secret')
    expect(JSON.stringify({
      ...configuredGateFixture.storage,
      apiSettings: undefined
    })).not.toContain('fixture-secret')

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

    var narrativeWorldbook = {
      id: 'wb-narrative',
      updatedAt: 1700000000000,
      worldDescription: '这一段很长的世界简介不应常驻叙事内核。',
      writingStyle: '克制、清晰，以感官细节推动场景。',
      forbidden: '不得替玩家决定行动。',
      entries: [
        {
          id: 'entry-chu',
          name: '褚岩',
          type: 'character',
          keys: ['舰长', '褚岩'],
          content: '蓝色空间号舰长，沉着且重视证据。',
          relations: { locations: ['place-belt'], events: ['history-signal'] }
        },
        {
          id: 'entry-rule',
          name: '玩家控制权',
          type: 'rule',
          keys: ['玩家'],
          content: '不得替玩家声明未输入的决定。',
          injection: { mode: 'constant' }
        }
      ],
      geoHistory: {
        mapId: 'map-blue-space',
        placeRefs: [{
          placeId: 'place-belt',
          siteId: 'site-belt',
          name: '异常小行星带',
          semanticType: 'region',
          routeIds: ['route-main']
        }],
        nodes: [{
          id: 'history-signal',
          title: '伪装信号回荡',
          summary: '舰载 AI 在三天前发现经过伪装的引力波信号。',
          participants: ['褚岩', '陆晨曦'],
          entryIds: ['entry-chu'],
          placeRef: { placeId: 'place-belt', name: '异常小行星带' },
          mapBinding: { siteId: 'site-belt', scene: '异常小行星带' }
        }],
        playerNodes: [{
          id: 'player-history-1',
          kind: 'player-history-v1',
          summary: '玩家确认信号并非自然形成。',
          participants: ['陆晨曦'],
          placeId: 'place-belt',
          sourceNodeId: 'history-signal',
          capturedAt: 1700000000100
        }]
      }
    }
    var narrativeMemories = [{
      id: 'memory-diary',
      status: 'active',
      scope: 'session',
      scopeId: 'session-1',
      kind: 'fact',
      content: '陆晨曦保存着一本泛黄的纸质日记。',
      confidence: 0.9,
      updatedAt: 1700000000200
    }]
    var narrativeRuntime = {
      worldMapState: {
        placeId: 'place-belt',
        currentScene: '生态区观测舱'
      },
      writingTime: { eraName: '危机纪元', year: '227' },
      placeStates: {
        'place-belt': { status: '航行警戒', controllerId: 'ship:blue-space', danger: 78 }
      },
      characterStates: {
        'character-chu': {
          status: '指挥中',
          alive: true,
          placeId: 'place-belt',
          goal: '确认信号来源'
        }
      },
      characterRelations: {
        'relation:chu-lu': {
          subjectId: 'character-chu',
          objectId: 'character-player',
          kind: 'guardian',
          status: 'confirmed'
        }
      },
      canonicalFacts: {
        'fact:signal-origin': {
          subjectId: 'signal',
          predicate: 'origin',
          value: 'non-natural',
          status: 'confirmed'
        }
      },
      encounteredCharacters: [{ id: 'character-chu', name: '褚岩' }],
      goals: [{ id: 'goal-signal', title: '确认信号来源', status: 'active' }],
      keyChoices: [{ id: 'choice-report', label: '向舰长报告异常' }],
      playerCharacter: { id: 'character-player', name: '陆晨曦' },
      runtimeEvents: [{
        id: 'evt-signal-state',
        type: 'state_delta',
        ts: 1,
        payload: {
          kind: 'signal-alert',
          placeId: 'place-belt',
          after: {
            placeStates: {
              'place-belt': { status: '航行警戒', controllerId: 'ship:blue-space', danger: 78 }
            }
          }
        }
      }]
    }
    var narrativeKernel = buildNarrativeKernel({
      worldbook: narrativeWorldbook,
      runtimeState: narrativeRuntime,
      messages: [
        { id: 'msg-1', role: 'assistant', content: '信号再次回荡。' },
        { id: 'msg-2', role: 'user', content: '我去找褚岩核对信号。' }
      ],
      projectId: 'wb-narrative',
      sessionId: 'session-1'
    })
    expect(narrativeKernel.revision).toMatch(/^nar-/)
    expect(narrativeKernel.blocks.map(function (block) { return block.kind })).toEqual([
      'rules',
      'turn',
      'scene',
      'cast',
      'recent',
      'continuity',
      'style'
    ])
    expect(JSON.stringify(narrativeKernel)).toContain('不得替玩家声明未输入的决定')
    expect(JSON.stringify(narrativeKernel.blocks.find(function (block) {
      return block.kind === 'continuity'
    }))).toContain('ship:blue-space')
    expect(JSON.stringify(narrativeKernel.blocks.find(function (block) {
      return block.kind === 'continuity'
    }))).toContain('relation:chu-lu')
    expect(JSON.stringify(narrativeKernel.blocks.find(function (block) {
      return block.kind === 'continuity'
    }))).toContain('fact:signal-origin')
    expect(narrativeKernel.blocks.find(function (block) {
      return block.kind === 'continuity'
    }).sourceRefs).toContain('runtime-event:evt-signal-state')
    expect(JSON.stringify(narrativeKernel)).not.toContain('这一段很长的世界简介')
    expect(narrativeKernel.toolCatalog.map(function (tool) { return tool.name })).toEqual([
      'world_lookup',
      'geo_lookup',
      'submit_narrative_beat_plan'
    ])
    expect(getNarrativeToolCatalog().map(function (tool) { return tool.name })).toEqual([
      ...NARRATIVE_READ_TOOL_NAMES,
      'submit_narrative_beat_plan'
    ])
    var historicalKernel = buildNarrativeKernel({
      worldbook: narrativeWorldbook,
      runtimeState: narrativeRuntime,
      messages: [{ id: 'history-turn', role: 'user', content: '请追溯这条信号的历史。' }],
      projectId: 'wb-narrative',
      sessionId: 'session-1'
    })
    expect(historicalKernel.toolCatalog.map(function (tool) { return tool.name })).toEqual([
      'world_lookup',
      'geo_lookup',
      'history_lookup',
      'submit_narrative_beat_plan'
    ])
    var longNarrativeMessages = [
      { id: 'long-1', role: 'assistant', content: '陆晨曦抵达生态区观测舱，发现异常信号。' },
      { id: 'long-2', role: 'user', content: '我把异常信号记录在纸质日记里。' },
      { id: 'long-3', role: 'assistant', content: '褚岩要求她继续确认信号来源。' },
      { id: 'long-4', role: 'user', content: '我检查三天前的波形。' },
      { id: 'long-5', role: 'assistant', content: '波形仍然指向小行星带。' },
      { id: 'long-6', role: 'user', content: '我去找褚岩。' }
    ]
    var sceneSummaryResolution = resolveNarrativeSceneSummary({
      messages: longNarrativeMessages,
      projectId: 'wb-narrative',
      sessionId: 'session-1'
    })
    expect(sceneSummaryResolution.summary).toMatchObject({
      revision: expect.stringMatching(/^scene-/),
      sourceRevision: expect.stringMatching(/^scene-src-/),
      sourceMessageCount: 2,
      recentMessageCount: 4
    })
    expect(sceneSummaryResolution.summary.summary).toContain('生态区观测舱')
    var reusedSceneSummary = resolveNarrativeSceneSummary({
      messages: longNarrativeMessages,
      previousSummary: sceneSummaryResolution.summary,
      projectId: 'wb-narrative',
      sessionId: 'session-1'
    })
    expect(reusedSceneSummary.reused).toBe(true)
    expect(reusedSceneSummary.summary.updatedAt).toBe(sceneSummaryResolution.summary.updatedAt)
    var changedSceneSummary = resolveNarrativeSceneSummary({
      messages: longNarrativeMessages.map(function (message, index) {
        return index === 0 ? { ...message, content: `${message.content}舷窗外没有星光。` } : message
      }),
      previousSummary: sceneSummaryResolution.summary,
      projectId: 'wb-narrative',
      sessionId: 'session-1'
    })
    expect(changedSceneSummary.reused).toBe(false)
    expect(changedSceneSummary.summary.sourceRevision).not.toBe(sceneSummaryResolution.summary.sourceRevision)
    var summarizedKernel = buildNarrativeKernel({
      worldbook: narrativeWorldbook,
      runtimeState: narrativeRuntime,
      messages: longNarrativeMessages,
      sceneSummary: sceneSummaryResolution.summary,
      projectId: 'wb-narrative',
      sessionId: 'session-1'
    })
    expect(summarizedKernel.blocks.map(function (block) { return block.kind })).toContain('summary')
    expect(JSON.stringify(summarizedKernel.blocks.find(function (block) {
      return block.kind === 'summary'
    }))).toContain('生态区观测舱')

    var narrativeSnapshot = {
      projectId: 'wb-narrative',
      sessionId: 'session-1',
      worldbook: narrativeWorldbook,
      runtimeState: narrativeRuntime,
      memories: narrativeMemories
    }
    var narrativeIndex = createNarrativeResourceIndex(narrativeSnapshot)
    var cachedNarrativeIndex = getNarrativeResourceIndex(narrativeSnapshot)
    expect(cachedNarrativeIndex.revision).toBe(narrativeIndex.revision)
    expect(getNarrativeResourceIndex(narrativeSnapshot)).toBe(cachedNarrativeIndex)
    expect(narrativeIndex.counts).toMatchObject({
      world: 3,
      geo: 1,
      history: 2,
      memory: 1
    })

    expect(validateNarrativeToolCall({
      id: 'call-invalid',
      name: 'world_lookup',
      arguments: { action: 'search', query: '褚岩', limit: 99 }
    })).toMatchObject({
      valid: false,
      error: { code: 'NARRATIVE_TOOL_LIMIT_INVALID' }
    })

    var narrativeRegistry = createNarrativeToolRegistry({
      index: narrativeIndex,
      projectId: 'wb-narrative',
      sessionId: 'session-1',
      currentPlaceId: 'place-belt'
    })
    var worldLookup = await narrativeRegistry.execute({
      id: 'call-world',
      name: 'world_lookup',
      arguments: { action: 'search', query: '褚岩', limit: 3 }
    })
    expect(worldLookup).toMatchObject({
      ok: true,
      tool: 'world_lookup',
      items: [expect.objectContaining({
        id: 'entry-chu',
        type: 'character',
        sourceRefs: ['worldbook-entry:entry-chu'],
        trust: 'canonical',
        conflictState: 'clean',
        eligibleEvidence: true
      })]
    })
    var pagedWorldResources = searchNarrativeResources(narrativeIndex, 'world', {
      query: '',
      limit: 1
    })
    expect(pagedWorldResources).toHaveLength(1)
    expect(pagedWorldResources.nextCursor).toBeTruthy()
    expect(parseNarrativeCursor(pagedWorldResources.nextCursor, {
      revision: narrativeIndex.revision,
      domain: 'world'
    })).toMatchObject({ valid: true })
    expect(parseNarrativeCursor(createNarrativeCursor({
      revision: 'old-revision',
      domain: 'world',
      sortKey: '000001:00000000000000000001',
      itemId: 'old-item'
    }), {
      revision: narrativeIndex.revision,
      domain: 'world'
    })).toMatchObject({
      valid: false,
      error: { code: 'NARRATIVE_CURSOR_STALE' }
    })
    var pagedWorldResourcesNext = searchNarrativeResources(narrativeIndex, 'world', {
      query: '',
      limit: 1,
      cursor: pagedWorldResources.nextCursor
    })
    expect(pagedWorldResourcesNext[0].id).not.toBe(pagedWorldResources[0].id)
    var evidenceReport = validateNarrativeEvidence({
      finalText: '褚岩要求核对信号。',
      kernel: narrativeKernel,
      toolResults: [worldLookup]
    })
    expect(evidenceReport).toMatchObject({
      status: 'covered',
      trustedItemCount: 1,
      sourceRefs: expect.arrayContaining(['worldbook-entry:entry-chu'])
    })
    var geoLookup = await narrativeRegistry.execute({
      id: 'call-geo',
      name: 'geo_lookup',
      arguments: { action: 'current' }
    })
    expect(geoLookup.items[0]).toMatchObject({
      id: 'place-belt',
      title: '异常小行星带'
    })
    var historyLookup = await narrativeRegistry.execute({
      id: 'call-history',
      name: 'history_lookup',
      arguments: {
        action: 'trace',
        ids: ['player-history-1'],
        filters: { placeIds: ['place-belt'] }
      }
    })
    expect(historyLookup.items.map(function (item) { return item.id })).toEqual(
      expect.arrayContaining(['player-history-1', 'history-signal'])
    )
    var memoryLookup = await narrativeRegistry.execute({
      id: 'call-memory',
      name: 'memory_lookup',
      arguments: {
        action: 'search',
        query: '纸质日记',
        filters: { scopes: ['session'] }
      }
    })
    expect(memoryLookup.items[0]).toMatchObject({
      id: 'memory-diary',
      type: 'fact'
    })
    expect(await narrativeRegistry.execute({
      id: 'call-cross-scope',
      name: 'memory_lookup',
      arguments: {
        action: 'search',
        query: '日记',
        filters: { scopes: ['project'] }
      }
    })).toMatchObject({
      ok: true,
      items: []
    })

    var narrativeToolCatalog = getNarrativeToolCatalog()
    var providerTurnRequest = {
      schemaVersion: GENERATION_AGENT_TURN_SCHEMA_VERSION,
      requestId: 'provider-turn-1',
      provider: {
        id: 'openai',
        baseUrl: 'https://api.example.com/v1',
        apiKey: 'secret-provider-key',
        model: 'tool-model',
        format: 'openai'
      },
      messages: [
        { role: 'system', content: '只根据工具证据回答。' },
        { role: 'user', content: '褚岩在哪里？' }
      ],
      tools: narrativeToolCatalog,
      options: {
        maxTokens: 600,
        temperature: 0.2,
        parallelToolCalls: true
      }
    }
    expect(validateGenerationAgentTurnRequest(providerTurnRequest)).toMatchObject({
      valid: true,
      request: {
        requestId: 'provider-turn-1',
        provider: { format: 'openai' }
      }
    })
    expect(resolveGenerationToolProtocol({
      id: 'MiniMax',
      baseUrl: 'https://api.minimaxi.com/anthropic'
    })).toBe('anthropic')
    expect(resolveToolCallingProvider({
      id: 'MiniMax',
      baseUrl: 'https://api.minimaxi.com/anthropic',
      apiKey: 'secret',
      model: 'MiniMax-M2.7'
    })).toMatchObject({
      protocol: 'anthropic',
      url: 'https://api.minimaxi.com/anthropic/v1/messages',
      capabilities: {
        toolCalls: true,
        parallelToolCalls: true
      }
    })

    expect(resolveGenerationToolProtocol({
      id: 'openai',
      baseUrl: 'https://api.openai.com/v1/responses',
      format: 'responses'
    })).toBe('openai-responses')
    var capturedResponsesRequest = null
    var responsesProviderTurn = await runToolCallingProviderTurn({
      ...providerTurnRequest,
      provider: {
        ...providerTurnRequest.provider,
        baseUrl: 'https://api.openai.com/v1',
        format: 'responses'
      }
    }, {
      fetchImpl: async function (url, options) {
        capturedResponsesRequest = {
          url,
          body: JSON.parse(options.body)
        }
        return new Response(JSON.stringify({
          id: 'responses-upstream-1',
          status: 'completed',
          output: [{
            type: 'function_call',
            call_id: 'responses-upstream-call-1',
            name: 'world_lookup',
            arguments: JSON.stringify({ action: 'search', query: '褚岩', limit: 3 })
          }]
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        })
      }
    })
    expect(capturedResponsesRequest).toMatchObject({
      url: 'https://api.openai.com/v1/responses',
      body: {
        model: 'tool-model',
        tool_choice: 'auto',
        store: false
      }
    })
    expect(capturedResponsesRequest.body.input).toEqual(expect.arrayContaining([
      expect.objectContaining({ role: 'user' })
    ]))
    expect(responsesProviderTurn).toMatchObject({
      kind: 'tool_calls',
      calls: [{ id: 'responses-upstream-call-1', name: 'world_lookup' }]
    })
    expect(function () {
      parseOpenAIToolResponse({
        choices: [{
          finish_reason: 'stop',
          message: { reasoning_content: 'only hidden reasoning' }
        }]
      })
    }).toThrow(/思考过程/)
    expect(function () {
      parseAnthropicToolResponse({
        stop_reason: 'end_turn',
        content: [{ type: 'thinking', thinking: 'only hidden thinking' }]
      })
    }).toThrow(/思考过程/)

    var openAiRequest = buildOpenAIToolRequest(providerTurnRequest)
    expect(openAiRequest).toMatchObject({
      model: 'tool-model',
      tool_choice: 'auto',
      parallel_tool_calls: true
    })
    expect(openAiRequest.tools[0]).toMatchObject({
      type: 'function',
      function: {
        name: 'world_lookup',
        parameters: expect.objectContaining({ type: 'object' })
      }
    })
    var conservativeOpenAiRequest = buildOpenAIToolRequest({
      ...providerTurnRequest,
      options: {
        ...providerTurnRequest.options,
        capabilities: { parallelToolCalls: false, strictSchema: true }
      }
    })
    expect(conservativeOpenAiRequest).not.toHaveProperty('parallel_tool_calls')
    expect(conservativeOpenAiRequest.tools[0].function.strict).toBe(true)
    var openAiToolTurn = parseOpenAIToolResponse({
      id: 'chatcmpl-tool',
      choices: [{
        finish_reason: 'tool_calls',
        message: {
          role: 'assistant',
          content: null,
          tool_calls: [{
            id: 'upstream-call-1',
            type: 'function',
            function: {
              name: 'world_lookup',
              arguments: JSON.stringify({ action: 'search', query: '褚岩', limit: 3 })
            }
          }]
        }
      }],
      usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120 }
    }, { requestId: 'provider-turn-1', provider: 'openai', model: 'tool-model' })
    expect(openAiToolTurn).toMatchObject({
      kind: 'tool_calls',
      calls: [{
        id: 'upstream-call-1',
        name: 'world_lookup',
        arguments: { action: 'search', query: '褚岩', limit: 3 }
      }],
      usage: { inputTokens: 100, outputTokens: 20, totalTokens: 120 }
    })
    expect(parseOpenAIToolResponse({
      choices: [{
        finish_reason: 'tool_calls',
        message: {
          tool_calls: [
            {
              id: 'parallel-world',
              type: 'function',
              function: {
                name: 'world_lookup',
                arguments: JSON.stringify({ action: 'search', query: '褚岩' })
              }
            },
            {
              id: 'parallel-geo',
              type: 'function',
              function: {
                name: 'geo_lookup',
                arguments: JSON.stringify({ action: 'current' })
              }
            }
          ]
        }
      }]
    }).calls.map(function (call) { return call.id })).toEqual(['parallel-world', 'parallel-geo'])
    expect(function () {
      parseOpenAIToolResponse({
        choices: [{
          finish_reason: 'tool_calls',
          message: {
            tool_calls: [{
              id: 'broken-call',
              function: { name: 'world_lookup', arguments: '{"action":' }
            }]
          }
        }]
      })
    }).toThrow(/非法工具调用/)

    var anthropicTurnRequest = {
      ...providerTurnRequest,
      requestId: 'provider-turn-2',
      provider: {
        id: 'MiniMax',
        baseUrl: 'https://api.minimaxi.com/anthropic',
        apiKey: 'secret-minimax-key',
        model: 'MiniMax-M2.7',
        format: 'anthropic'
      },
      messages: [
        { role: 'system', content: '只根据工具证据回答。' },
        { role: 'user', content: '褚岩在哪里？' },
        {
          role: 'assistant',
          content: '',
          toolCalls: [{
            id: 'upstream-call-1',
            name: 'world_lookup',
            arguments: { action: 'search', query: '褚岩', limit: 3 }
          }]
        },
        {
          role: 'tool',
          name: 'world_lookup',
          toolCallId: 'upstream-call-1',
          content: JSON.stringify(worldLookup)
        }
      ]
    }
    var anthropicRequest = buildAnthropicToolRequest(anthropicTurnRequest)
    expect(anthropicRequest.system).toBe('只根据工具证据回答。')
    expect(anthropicRequest.messages[1]).toMatchObject({
      role: 'assistant',
      content: [expect.objectContaining({
        type: 'tool_use',
        id: 'upstream-call-1',
        name: 'world_lookup'
      })]
    })
    expect(anthropicRequest.messages[2]).toMatchObject({
      role: 'user',
      content: [expect.objectContaining({
        type: 'tool_result',
        tool_use_id: 'upstream-call-1'
      })]
    })
    expect(parseAnthropicToolResponse({
      id: 'msg-final',
      content: [
        { type: 'thinking', thinking: 'must not escape' },
        { type: 'text', text: '褚岩正在舰桥指挥舱。' }
      ],
      stop_reason: 'end_turn',
      usage: { input_tokens: 140, output_tokens: 18 }
    }, {
      requestId: 'provider-turn-2',
      provider: 'MiniMax',
      model: 'MiniMax-M2.7'
    })).toMatchObject({
      kind: 'final_ready',
      text: '褚岩正在舰桥指挥舱。',
      usage: { inputTokens: 140, outputTokens: 18, totalTokens: 158 }
    })
    var minimaxRequest = buildMiniMaxToolRequest({
      ...anthropicTurnRequest,
      options: { ...anthropicTurnRequest.options, thinking: { budgetTokens: 512 } }
    })
    expect(minimaxRequest).toMatchObject({
      thinking: { type: 'enabled', budget_tokens: 512 },
    })
    expect(minimaxRequest.messages).toEqual(expect.arrayContaining([
      expect.objectContaining({ role: 'assistant' })
    ]))
    var minimaxParts = parseMiniMaxToolResponse({
      content: [
        { type: 'thinking', thinking: 'hidden', signature: 'round-trip-signature' },
        { type: 'tool_use', id: 'minimax-call-r3', name: 'world_lookup', input: { action: 'search', query: '褚岩', limit: 2 } }
      ],
      stop_reason: 'tool_use'
    }, { provider: 'MiniMax', model: 'MiniMax-M2.7' })
    expect(minimaxParts.parts).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'reasoning', text: '', opaque: { signature: 'round-trip-signature' } }),
      expect.objectContaining({ type: 'tool-call', toolCallId: 'minimax-call-r3' })
    ]))
    expect(function () {
      parseOpenAIToolResponse({
        choices: [{ finish_reason: 'length', message: { content: '' } }]
      })
    }).toThrow(/输出长度上限/)
    expect(function () {
      parseAnthropicToolResponse({
        stop_reason: 'refusal',
        content: [{ type: 'text', text: '拒绝' }]
      })
    }).toThrow(/拒绝生成/)

    expect(NARRATIVE_TOOL_PROTOCOL_FIXTURES.openAiChat.response.choices[0].finish_reason).toBe('tool_calls')
    expect(NARRATIVE_TOOL_PROTOCOL_FIXTURES.openAiChat.argumentDeltas).toHaveLength(2)
    expect(NARRATIVE_TOOL_PROTOCOL_FIXTURES.openAiResponses.response.output[0].type).toBe('function_call')
    expect(NARRATIVE_TOOL_PROTOCOL_FIXTURES.openAiResponses.argumentDeltas[0].callId).toBe('responses-call-1')
    expect(NARRATIVE_TOOL_PROTOCOL_FIXTURES.anthropicToolUse.response.content[0].type).toBe('tool_use')
    expect(NARRATIVE_TOOL_PROTOCOL_FIXTURES.anthropicToolUse.argumentDeltas[1].partialJson).toContain('伪装信号')
    expect(NARRATIVE_TOOL_PROTOCOL_FIXTURES.minimaxThinking.response.content[0].signature).toBe('fixture-signature-only')
    expect(NARRATIVE_TOOL_PROTOCOL_FIXTURES.minimaxThinking.argumentDeltas[0].id).toBe('minimax-call-1')
    expect(NARRATIVE_TOOL_PROTOCOL_FIXTURES.malformedCompatible.response.choices[0].message.tool_calls[0].function.arguments).toBe('{"action":')

    var transcriptInput = {
      schemaVersion: NARRATIVE_TRANSCRIPT_SCHEMA_VERSION,
      requestId: 'transcript-fixture-1',
      messages: [
        {
          id: 'message-system-1',
          role: 'system',
          parts: [{ type: 'text', text: '只依据已确认资料写作。' }]
        },
        {
          id: 'message-user-1',
          role: 'user',
          parts: [{ type: 'text', text: '我去找褚岩核对信号。' }]
        },
        {
          id: 'message-assistant-1',
          role: 'assistant',
          parts: [
            {
              type: 'reasoning',
              text: '这段供应商思考不能进入显示或持久化内容。',
              opaque: {
                signature: 'provider-signature-1',
                reasoningContent: 'provider-opaque-round-trip-1',
                ignored: 'must-be-dropped'
              }
            },
            {
              type: 'tool-call',
              toolCallId: 'transcript-call-1',
              toolName: 'world_lookup',
              input: { action: 'search', query: '褚岩', limit: 3 }
            }
          ]
        },
        {
          id: 'message-tool-1',
          role: 'tool',
          parts: [{
            type: 'tool-result',
            toolCallId: 'transcript-call-1',
            toolName: 'world_lookup',
            output: worldLookup,
            isError: false
          }]
        },
        {
          id: 'message-assistant-2',
          role: 'assistant',
          parts: [{ type: 'text', text: '褚岩正在指挥舱核对异常信号。' }]
        }
      ]
    }
    var transcript = normalizeNarrativeTranscript(transcriptInput, { preserveReasoningText: true })
    expect(transcript).toMatchObject({
      valid: true,
      transcript: {
        requestId: 'transcript-fixture-1',
        pendingToolCallIds: []
      }
    })
    expect(transcript.transcript.messages[2].parts[0]).toMatchObject({
      type: 'reasoning',
      text: '这段供应商思考不能进入显示或持久化内容。',
      opaque: {
        signature: 'provider-signature-1',
        reasoningContent: 'provider-opaque-round-trip-1'
      }
    })
    var serializedTranscript = serializeNarrativeTranscript(transcript.transcript)
    expect(serializedTranscript.valid).toBe(true)
    expect(serializedTranscript.serialized).not.toContain('供应商思考')
    expect(serializedTranscript.serialized).not.toContain('ignored')
    expect(serializedTranscript.serialized).toContain('provider-signature-1')
    var roundTrippedTranscript = deserializeNarrativeTranscript(serializedTranscript.serialized)
    expect(roundTrippedTranscript).toMatchObject({
      valid: true,
      transcript: {
        requestId: 'transcript-fixture-1',
        pendingToolCallIds: []
      }
    })
    expect(roundTrippedTranscript.transcript.messages[2].parts[0]).toMatchObject({
      type: 'reasoning',
      text: '',
      opaque: { signature: 'provider-signature-1' }
    })
    var pendingTranscript = appendNarrativeTranscriptMessage(
      { requestId: 'pending-1', messages: [] },
      {
        id: 'pending-assistant-1',
        role: 'assistant',
        parts: [{
          type: 'tool-call',
          toolCallId: 'pending-call-1',
          toolName: 'geo_lookup',
          input: { action: 'current' }
        }]
      },
      { allowPendingToolCalls: true }
    )
    expect(pendingTranscript).toMatchObject({
      valid: true,
      transcript: { pendingToolCallIds: ['pending-call-1'] }
    })
    expect(normalizeNarrativeTranscript({
      ...pendingTranscript.transcript,
      messages: [...pendingTranscript.transcript.messages, {
        id: 'pending-tool-1',
        role: 'tool',
        parts: [{
          type: 'tool-result',
          toolCallId: 'missing-call',
          toolName: 'geo_lookup',
          output: { ok: true }
        }]
      }]
    })).toMatchObject({
      valid: false,
      error: { code: 'NARRATIVE_TRANSCRIPT_TOOL_RESULT_ORPHANED' }
    })
    expect(normalizeNarrativeTranscript({
      ...pendingTranscript.transcript,
      messages: [...pendingTranscript.transcript.messages, {
        id: 'pending-assistant-2',
        role: 'assistant',
        parts: [{ type: 'text', text: '不能跳过工具结果。' }]
      }]
    })).toMatchObject({
      valid: false,
      error: { code: 'NARRATIVE_TRANSCRIPT_TOOL_RESULT_MISSING' }
    })

    var capabilityCache = createNarrativeCapabilityCache()
    var customProvider = {
      id: 'custom-compatible',
      baseUrl: 'https://provider.example/v1',
      apiKey: 'must-not-enter-capability-key',
      model: 'custom-tool-model'
    }
    var safeCapabilities = resolveNarrativeProviderCapabilities(customProvider, {
      cache: capabilityCache,
      now: 1700000001000
    })
    expect(safeCapabilities).toMatchObject({
      protocol: 'openai-chat',
      text: true,
      toolCalls: false,
      source: 'static-safe-default'
    })
    expect(safeCapabilities.cacheKey).not.toContain('must-not-enter-capability-key')
    var probedCapabilities = recordNarrativeCapabilityProbe(capabilityCache, customProvider, {
      text: true,
      toolCalls: true,
      parallelToolCalls: true,
      strictSchema: true,
      streamToolCalls: true,
      toolChoiceModes: ['auto', 'none', 'required'],
      reasoningRoundTrip: 'field'
    }, { now: 1700000002000 })
    expect(resolveNarrativeProviderCapabilities(customProvider, { cache: capabilityCache })).toMatchObject({
      toolCalls: true,
      parallelToolCalls: true,
      strictSchema: true,
      source: 'probe'
    })
    expect(downgradeNarrativeProviderCapability(capabilityCache, customProvider, 'parallelToolCalls'))
      .toMatchObject({ toolCalls: true, parallelToolCalls: false, source: 'runtime-downgrade' })
    expect(getNarrativeCapabilityCacheKey(customProvider)).not.toContain('must-not-enter-capability-key')
    expect(invalidateNarrativeCapability(capabilityCache, customProvider)).toBe(true)
    expect(resolveNarrativeProviderCapabilities(customProvider, { cache: capabilityCache }).toolCalls).toBe(false)
    expect(probedCapabilities.reasoningRoundTrip).toBe('field')

    var probeResponses = [
      {
        choices: [{ message: { content: 'PROBE_TEXT' }, finish_reason: 'stop' }]
      },
      {
        choices: [{
          message: {
            role: 'assistant',
            content: null,
            tool_calls: [{
              id: 'probe-call-1',
              type: 'function',
              function: {
                name: 'echo_probe',
                arguments: '{"probe":"ok"}'
              }
              }]
          },
          finish_reason: 'tool_calls'
        }]
      },
      {
        choices: [{ message: { content: 'PROBE_OK' }, finish_reason: 'stop' }]
      }
    ]
    var probeCalls = []
    var probeCache = createNarrativeCapabilityCache()
    var probeResult = await probeNarrativeProviderCapabilities({
      id: 'custom',
      baseUrl: 'https://provider.example/v1',
      apiKey: 'probe-secret',
      model: 'probe-model',
      format: 'openai'
    }, {
      cache: probeCache,
      timeoutMs: 1000,
      fetchImpl: async function (url, options) {
        probeCalls.push({ url, body: JSON.parse(options.body) })
        return new Response(JSON.stringify(probeResponses.shift()), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        })
      }
    })
    expect(probeCalls).toHaveLength(3)
    expect(probeCalls[0].url).toBe('https://provider.example/v1/chat/completions')
    expect(probeCalls[1].body.tools[0].function.name).toBe('echo_probe')
    expect(probeCalls[2].body.messages[2]).toMatchObject({
      role: 'tool',
      tool_call_id: 'probe-call-1',
      content: '{"probe":"ok"}'
    })
    expect(probeResult).toMatchObject({
      text: { ok: true, responseText: 'PROBE_TEXT' },
      tool: { ok: true, validCall: true },
      roundTrip: { ok: true, terminal: true },
      capabilities: {
        protocol: 'openai-chat',
        text: true,
        toolCalls: true,
        source: 'probe'
      }
    })

    var degradedProbeResponses = [
      { choices: [{ message: { content: 'PROBE_TEXT' }, finish_reason: 'stop' }] },
      { error: { message: 'unsupported parameter: parallel_tool_calls' } },
      {
        choices: [{
          message: {
            role: 'assistant',
            content: null,
            tool_calls: [{
              id: 'probe-call-degraded',
              type: 'function',
              function: { name: 'echo_probe', arguments: '{"probe":"ok"}' }
            }]
          },
          finish_reason: 'tool_calls'
        }]
      },
      { choices: [{ message: { content: 'PROBE_OK' }, finish_reason: 'stop' }] }
    ]
    var degradedProbe = await probeNarrativeProviderCapabilities({
      id: 'custom',
      baseUrl: 'https://provider.example/v1',
      apiKey: 'probe-secret',
      model: 'probe-model',
      format: 'openai'
    }, {
      cache: createNarrativeCapabilityCache(),
      timeoutMs: 1000,
      fetchImpl: async function (_, options) {
        var next = degradedProbeResponses.shift()
        return new Response(JSON.stringify(next), {
          status: next.error ? 400 : 200,
          headers: { 'Content-Type': 'application/json' }
        })
      }
    })
    expect(degradedProbe).toMatchObject({
      tool: { validCall: true, retriedWithoutAdvanced: true },
      roundTrip: { terminal: true },
      capabilities: { toolCalls: true, parallelToolCalls: false, strictSchema: false }
    })

    var responsesRequest = buildOpenAIResponsesRequest({
      provider: { model: 'responses-model' },
      transcript: transcript.transcript,
      tools: narrativeToolCatalog,
      capabilities: { strictSchema: true, parallelToolCalls: true },
      options: { maxTokens: 700, temperature: 0.1 }
    })
    expect(responsesRequest).toMatchObject({
      model: 'responses-model',
      store: false,
      tool_choice: 'auto',
      parallel_tool_calls: true,
      max_output_tokens: 700
    })
    expect(responsesRequest.instructions).toContain('只依据已确认资料写作')
    expect(responsesRequest.tools[0]).toMatchObject({
      type: 'function',
      name: 'world_lookup',
      strict: true
    })
    expect(responsesRequest.input).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'function_call',
        call_id: 'transcript-call-1'
      }),
      expect.objectContaining({
        type: 'function_call_output',
        call_id: 'transcript-call-1'
      })
    ]))
    expect(parseOpenAIResponsesToolResponse({
      id: 'resp-final',
      status: 'completed',
      output: [{
        type: 'function_call',
        call_id: 'responses-call-2',
        name: 'geo_lookup',
        arguments: '{"action":"current"}'
      }],
      usage: { input_tokens: 44, output_tokens: 12, total_tokens: 56 }
    }, { requestId: 'responses-1', provider: 'openai', model: 'responses-model' })).toMatchObject({
      kind: 'tool_calls',
      calls: [{ id: 'responses-call-2', name: 'geo_lookup' }],
      usage: { inputTokens: 44, outputTokens: 12, totalTokens: 56 }
    })
    expect(parseOpenAIResponsesToolResponse({
      id: 'resp-text',
      status: 'completed',
      output: [{ type: 'message', content: [{ type: 'output_text', text: '已核对当前地点。' }] }]
    })).toMatchObject({ kind: 'final_ready', text: '已核对当前地点。' })
    expect(function () {
      parseOpenAIResponsesToolResponse({
        status: 'completed',
        output: [{
          type: 'function_call',
          call_id: 'responses-broken',
          name: 'geo_lookup',
          arguments: '{"action":'
        }]
      })
    }).toThrow(/非法工具调用/)

    var capturedProviderRequest = null
    var providerTurn = await runToolCallingProviderTurn(providerTurnRequest, {
      fetchImpl: async function (url, options) {
        capturedProviderRequest = {
          url,
          headers: options.headers,
          body: JSON.parse(options.body)
        }
        return new Response(JSON.stringify({
          choices: [{
            finish_reason: 'tool_calls',
            message: {
              tool_calls: [{
                id: 'upstream-call-2',
                type: 'function',
                function: {
                  name: 'history_lookup',
                  arguments: JSON.stringify({ action: 'search', query: '伪装信号' })
                }
              }]
            }
          }],
          usage: { prompt_tokens: 80, completion_tokens: 12 }
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        })
      }
    })
    expect(capturedProviderRequest.url).toBe('https://api.example.com/v1/chat/completions')
    expect(capturedProviderRequest.headers.Authorization).toBe('Bearer secret-provider-key')
    expect(JSON.stringify(capturedProviderRequest.body)).not.toContain('secret-provider-key')
    expect(providerTurn).toMatchObject({
      kind: 'tool_calls',
      calls: [expect.objectContaining({ name: 'history_lookup' })]
    })
    await expect(runToolCallingProviderTurn(providerTurnRequest, {
      fetchImpl: async function () {
        return new Response('{}', { status: 429 })
      }
    })).rejects.toMatchObject({
      code: 'NARRATIVE_PROVIDER_UPSTREAM_FAILED',
      status: 429,
      retryable: true
    })
    var cancelledTurn = new AbortController()
    cancelledTurn.abort()
    await expect(runToolCallingProviderTurn(providerTurnRequest, {
      signal: cancelledTurn.signal,
      fetchImpl: async function () {
        throw new Error('aborted')
      }
    })).rejects.toMatchObject({
      code: 'NARRATIVE_PROVIDER_ABORTED',
      retryable: false
    })
    await expect(runToolCallingProviderTurn(providerTurnRequest, {
      fetchImpl: async function () {
        return new Response(JSON.stringify({
          choices: [{
            finish_reason: 'tool_calls',
            message: {
              tool_calls: [{
                id: 'broken-upstream',
                function: { name: 'world_lookup', arguments: '{"action":' }
              }]
            }
          }]
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        })
      }
    })).rejects.toMatchObject({
      code: 'NARRATIVE_TOOL_ARGUMENTS_INVALID',
      retryable: false
    })

    var prunedToolEvidence = pruneNarrativeToolResults([
      worldLookup,
      { ...worldLookup, callId: 'same-evidence-later' },
      historyLookup
    ])
    expect(prunedToolEvidence).toMatchObject({
      retainedCount: 2,
      prunedCount: 1
    })
    expect(prunedToolEvidence.results[0].callId).toBe('same-evidence-later')
    var transcriptRequests = []
    var transcriptLoop = await runNarrativeAgentLoop({
      kernel: narrativeKernel,
      registry: narrativeRegistry,
      settings: providerTurnRequest.provider,
      requestId: 'single-transcript-loop',
      decisionRunner: async function (request) {
        transcriptRequests.push(request)
        // Q3：respond 计划先行 —— 第一步先提交 BeatPlan，再查资料，最后写正文。
        if (transcriptRequests.length === 1) {
          return {
            kind: 'tool_calls',
            calls: [{
              id: 'beat-plan-call',
              name: 'submit_narrative_beat_plan',
              arguments: {
                responseObligation: '回应玩家对信号时间线的询问',
                causalSteps: ['确认变轨依据', '调出原始波形'],
                revealOrChange: '玩家确认了变轨与回波的时间关系',
                endCondition: '时间线对不上的时段被指出'
              }
            }]
          }
        }
        if (transcriptRequests.length === 2) {
          return {
            kind: 'tool_calls',
            calls: [{
              id: 'single-transcript-call',
              name: 'world_lookup',
              arguments: { action: 'search', query: '褚岩', limit: 1 }
            }],
            parts: [
              { type: 'reasoning', text: 'should-not-be-visible', opaque: { signature: 'opaque-r4' } },
              { type: 'tool-call', toolCallId: 'single-transcript-call', toolName: 'world_lookup', input: { action: 'search', query: '褚岩', limit: 1 } }
            ],
            usage: { inputTokens: 12, outputTokens: 4 }
          }
        }
        return {
          kind: 'final_ready',
          text: '核对资料后，站台上的铜鸟转向了门口。',
          calls: [],
          usage: { inputTokens: 18, outputTokens: 14 }
        }
      }
    })
    expect(transcriptRequests).toHaveLength(3)
    expect(transcriptRequests[0].requestId).toBe('single-transcript-loop')
    expect(transcriptRequests[1].requestId).toBe('single-transcript-loop')
    expect(transcriptRequests[1].messages.some(function (message) {
      return message.role === 'user' && message.content.includes('本轮叙事拍计划')
    })).toBe(true)
    expect(transcriptRequests[2].messages.some(function (message) {
      return message.role === 'assistant' && message.toolCalls?.[0]?.id === 'single-transcript-call'
    })).toBe(true)
    expect(transcriptRequests[2].messages.some(function (message) {
      return message.role === 'tool' && message.toolCallId === 'single-transcript-call'
    })).toBe(true)
    expect(transcriptRequests[2].messages.find(function (message) {
      return message.role === 'assistant' && message.toolCalls?.[0]?.id === 'single-transcript-call'
    }).parts).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'reasoning', text: '', opaque: { signature: 'opaque-r4' } })
    ]))
    expect(transcriptLoop).toMatchObject({
      finalText: '核对资料后，站台上的铜鸟转向了门口。',
      trace: {
        status: 'ready',
        terminalMode: 'direct-text',
        steps: 3
      }
    })
    expect(transcriptLoop.trace.planRevision).toMatch(/^bp_/)
    expect(transcriptLoop.transcript.messages.some(function (message) {
      return message.parts.some((part) => part.type === 'tool-result' && part.toolCallId === 'single-transcript-call')
    })).toBe(true)

    // P0/P1：分阶段可观察性 —— 计划不占资料轮次；plan/evidence/write 分别计数。
    expect(transcriptLoop.trace.phases).toMatchObject({
      plan: { rounds: 1 },
      evidence: { rounds: 1 },
      write: { rounds: 1 }
    })
    expect(transcriptLoop.trace.evidenceRounds).toBe(1)
    expect(transcriptLoop.trace.evidenceExhausted).toBe(false)
    expect(transcriptLoop.trace.stepTimeouts).toMatchObject({ plan: 35000, write: 60000 })

    var optionalGroundingKernel = {
      ...narrativeKernel,
      blocks: narrativeKernel.blocks.map(function (block) {
        return block.kind === 'turn'
          ? { ...block, content: { ...block.content, input: '继续' } }
          : block
      })
    }
    expect(deriveNarrativeGroundingPolicy({ kernel: narrativeKernel }).level).toBe('required')
    expect(deriveNarrativeGroundingPolicy({ kernel: optionalGroundingKernel }).level).toBe('optional')
    expect(hasNarrativeGroundingEvidence([worldLookup])).toBe(true)
    expect(hasNarrativeGroundingEvidence([{ ok: false, items: [] }])).toBe(false)

    var repairRequests = []
    var repairedNarrativeRun = await runNarrativeAgentLoop({
      kernel: optionalGroundingKernel,
      registry: narrativeRegistry,
      settings: providerTurnRequest.provider,
      requestId: 'narrative-r5-repair',
      decisionRunner: async function (request) {
        repairRequests.push(request)
        // Q3：respond 先规划，再触发一次坏的资料调用（验证 repair），最后写正文。
        if (repairRequests.length === 1) {
          return {
            kind: 'tool_calls',
            calls: [{
              id: 'beat-plan-call',
              name: 'submit_narrative_beat_plan',
              arguments: {
                responseObligation: '回应玩家',
                causalSteps: ['核对', '确认'],
                revealOrChange: '确认变化',
                endCondition: '核对完成'
              }
            }]
          }
        }
        if (repairRequests.length === 2) {
          return {
            kind: 'tool_calls',
            calls: [{
              id: 'bad-call',
              name: 'world_lookup',
              arguments: { action: 'get', limit: 1 }
            }]
          }
        }
        return { kind: 'final_ready', text: '修复后的正文。', calls: [] }
      }
    })
    expect(repairRequests).toHaveLength(3)
    expect(repairRequests[2].messages.some(function (message) {
      return message.role === 'user' && message.content.includes('上一轮资料调度未通过校验')
    })).toBe(true)
    expect(repairedNarrativeRun).toMatchObject({
      finalText: '修复后的正文。',
      trace: { repairCount: 1 }
    })

    // P6：BeatPlan 校验失败走修复循环而非硬错误 —— 模型先交缺 endCondition 的非法计划，
    // 收到定向修复消息后重新提交合法计划，再写正文。
    var beatPlanRepairRequests = []
    var beatPlanRepairedRun = await runNarrativeAgentLoop({
      kernel: optionalGroundingKernel,
      registry: narrativeRegistry,
      settings: providerTurnRequest.provider,
      requestId: 'narrative-beat-plan-repair',
      decisionRunner: async function (request) {
        beatPlanRepairRequests.push(request)
        if (beatPlanRepairRequests.length === 1) {
          return {
            kind: 'tool_calls',
            calls: [{
              id: 'bad-beat-plan',
              name: 'submit_narrative_beat_plan',
              arguments: {
                responseObligation: '回应玩家',
                causalSteps: ['核对'],
                revealOrChange: '确认变化'
              }
            }]
          }
        }
        if (beatPlanRepairRequests.length === 2) {
          return {
            kind: 'tool_calls',
            calls: [{
              id: 'good-beat-plan',
              name: 'submit_narrative_beat_plan',
              arguments: {
                responseObligation: '回应玩家',
                causalSteps: ['核对', '确认'],
                revealOrChange: '确认变化',
                endCondition: '核对完成'
              }
            }]
          }
        }
        return { kind: 'final_ready', text: '修复计划后的正文。', calls: [] }
      }
    })
    expect(beatPlanRepairRequests).toHaveLength(3)
    expect(beatPlanRepairRequests[1].messages.some(function (message) {
      return message.role === 'user' && message.content.includes('上一轮叙事拍计划未通过校验（NARRATIVE_BEAT_PLAN_END_REQUIRED）')
    })).toBe(true)
    expect(beatPlanRepairedRun).toMatchObject({
      finalText: '修复计划后的正文。',
      trace: { repairCount: 1 }
    })

    await expect(runNarrativeAgentLoop({
      kernel: narrativeKernel,
      registry: narrativeRegistry,
      settings: providerTurnRequest.provider,
      requestId: 'narrative-r5-grounding-gate',
      decisionRunner: async function () {
        return { kind: 'final_ready', text: '没有核对资料的正文', calls: [] }
      }
    })).rejects.toMatchObject({ code: 'NARRATIVE_GROUNDING_REQUIRED' })

    await expect(runNarrativeAgentLoop({
      kernel: optionalGroundingKernel,
      registry: narrativeRegistry,
      settings: providerTurnRequest.provider,
      requestId: 'narrative-r5-doom-loop',
      decisionRunner: async function () {
        return {
          kind: 'tool_calls',
          calls: ['a', 'b', 'c'].map(function (suffix) {
            return {
              id: `doom-${suffix}`,
              name: 'world_lookup',
              arguments: { action: 'search', query: '褚岩', limit: 1 }
            }
          })
        }
      }
    })).rejects.toMatchObject({ code: 'NARRATIVE_AGENT_DOOM_LOOP' })

    var fallbackStreamCalls = 0
    await expect(runNarrativeAgentGeneration({
      kernel: narrativeKernel,
      registry: narrativeRegistry,
      settings: providerTurnRequest.provider,
      requestId: 'narrative-tool-fallback',
      decisionRunner: async function () {
        throw Object.assign(new Error('上游没有返回工具调用或最终文本'), {
          code: 'NARRATIVE_PROVIDER_EMPTY_RESPONSE'
        })
      },
      streamRunner: async function (request) {
        fallbackStreamCalls += 1
        request.callbacks.onComplete?.({ content: '不应触发第二套正文请求' })
      }
    })).rejects.toMatchObject({ code: 'NARRATIVE_PROVIDER_EMPTY_RESPONSE' })
    expect(fallbackStreamCalls).toBe(0)

    await expect(runNarrativeAgentGeneration({
      kernel: narrativeKernel,
      registry: narrativeRegistry,
      settings: providerTurnRequest.provider,
      requestId: 'narrative-tool-timeout-fallback',
      decisionRunner: async function () {
        throw Object.assign(new Error('叙事资料查询超时'), {
          code: 'NARRATIVE_AGENT_DECISION_TIMEOUT'
        })
      },
      streamRunner: async function (request) {
        fallbackStreamCalls += 1
        request.callbacks.onComplete?.({ content: '超时后的普通叙事正文' })
      }
    })).rejects.toMatchObject({ code: 'NARRATIVE_AGENT_DECISION_TIMEOUT' })
    expect(fallbackStreamCalls).toBe(0)

    var bypassedDecisionCalls = 0
    var bypassedRun = await runNarrativeAgentGeneration({
      kernel: {
        ...narrativeKernel,
        blocks: narrativeKernel.blocks.map(function (block) {
          return block.kind === 'turn'
            ? { ...block, content: { ...block.content, input: '继续' } }
            : block
        })
      },
      registry: narrativeRegistry,
      settings: providerTurnRequest.provider,
      requestId: 'narrative-continue-bypass',
      decisionRunner: async function () {
        bypassedDecisionCalls += 1
        // Q3：respond 先提交计划，再直接写正文。
        if (bypassedDecisionCalls === 1) {
          return {
            kind: 'tool_calls',
            calls: [{
              id: 'beat-plan-call',
              name: 'submit_narrative_beat_plan',
              arguments: {
                responseObligation: '回应玩家',
                causalSteps: ['承接', '推进'],
                revealOrChange: '推进完成',
                endCondition: '承接到位'
              }
            }]
          }
        }
        return { kind: 'final_ready', text: '承接后的正文。', calls: [] }
      },
      streamRunner: async function (request) {
        request.callbacks.onComplete?.({ content: '承接后的正文。' })
      }
    })
    expect(bypassedDecisionCalls).toBe(2)
    expect(bypassedRun).toMatchObject({
      finalText: '承接后的正文。',
      trace: { status: 'ready', terminalMode: 'direct-text' }
    })

    // C5：有界补全 —— finishReason=length 时同一 transcript 内自动补全一次，聚合为同一正文。
    // Q3：respond 先提交 BeatPlan，再触发截断正文与一次补全。
    var completionCalls = 0
    var completedRun = await runNarrativeAgentGeneration({
      kernel: {
        ...narrativeKernel,
        blocks: narrativeKernel.blocks.map(function (block) {
          return block.kind === 'turn'
            ? { ...block, content: { ...block.content, input: '继续' } }
            : block
        })
      },
      registry: narrativeRegistry,
      settings: providerTurnRequest.provider,
      requestId: 'narrative-bounded-completion',
      decisionRunner: async function () {
        completionCalls += 1
        if (completionCalls === 1) {
          return {
            kind: 'tool_calls',
            calls: [{
              id: 'beat-plan-call',
              name: 'submit_narrative_beat_plan',
              arguments: {
                responseObligation: '回应玩家',
                causalSteps: ['承接', '发展'],
                revealOrChange: '发展完成',
                endCondition: '动作链完成'
              }
            }]
          }
        }
        if (completionCalls === 2) {
          return { kind: 'final_ready', text: '雨水沿着舷窗滑落，', finishReason: 'length', calls: [] }
        }
        return { kind: 'final_ready', text: '打湿了甲板上的缆绳。', calls: [] }
      }
    })
    expect(completionCalls).toBe(3)
    expect(completedRun.finalText).toBe('雨水沿着舷窗滑落，打湿了甲板上的缆绳。')
    expect(completedRun.trace.boundedCompletion).toBe(true)
    expect(completedRun.trace.incomplete).toBe(false)

    // P6：补全保守 —— 自然落点且 ≥70% 目标下限（651/900 字）不再补全；
    // targetChars 由应用写入（respond standard = 1500），模型自报值（50）无效。
    var conservativeCalls = 0
    var conservativeRun = await runNarrativeAgentLoop({
      kernel: narrativeKernel,
      registry: narrativeRegistry,
      settings: { ...providerTurnRequest.provider, expansion: 'standard' },
      requestId: 'narrative-conservative-completion',
      intent: 'respond',
      decisionRunner: async function () {
        conservativeCalls += 1
        if (conservativeCalls === 1) {
          return {
            kind: 'tool_calls',
            calls: [{
              id: 'beat-plan-call',
              name: 'submit_narrative_beat_plan',
              arguments: {
                responseObligation: '回应玩家',
                causalSteps: ['承接', '发展'],
                revealOrChange: '发展完成',
                endCondition: '动作链完成',
                characterMoves: [{ character: '陆晨曦', action: '翻阅日志', result: '翻出铜扣' }],
                targetChars: 50
              }
            }]
          }
        }
        if (conservativeCalls === 2) {
          return {
            kind: 'tool_calls',
            calls: [{
              id: 'conservative-call',
              name: 'world_lookup',
              arguments: { action: 'search', query: '褚岩', limit: 1 }
            }]
          }
        }
        return { kind: 'final_ready', text: `${'雨'.repeat(650)}。`, calls: [] }
      }
    })
    expect(conservativeCalls).toBe(3)
    expect(conservativeRun.trace.boundedCompletion).toBe(false)
    expect(conservativeRun.trace.targetChars).toBe(1500)

    // P1：资料预算耗尽 → 强制完成，不再抛『两轮限制』。
    // 模型先规划、连查两轮资料（预算=2），第三轮资料请求被闸门拦截（控制消息），
    // 随后请求带 toolChoice none 并直接写正文。
    var budgetCalls = 0
    var budgetExhaustedRun = await runNarrativeAgentLoop({
      kernel: optionalGroundingKernel,
      registry: narrativeRegistry,
      settings: providerTurnRequest.provider,
      requestId: 'narrative-evidence-budget',
      decisionRunner: async function (request) {
        budgetCalls += 1
        if (budgetCalls === 1) {
          return {
            kind: 'tool_calls',
            calls: [{
              id: 'budget-beat-plan',
              name: 'submit_narrative_beat_plan',
              arguments: {
                responseObligation: '回应玩家',
                causalSteps: ['核对', '确认'],
                revealOrChange: '确认变化',
                endCondition: '核对完成'
              }
            }]
          }
        }
        if (budgetCalls === 2 || budgetCalls === 3 || budgetCalls === 4) {
          return {
            kind: 'tool_calls',
            calls: [{
              id: 'budget-lookup-' + budgetCalls,
              name: 'world_lookup',
              arguments: { action: 'search', query: '褚岩', limit: 1 }
            }]
          }
        }
        if (budgetCalls === 5) {
          // 第三轮资料请求已被预算闸门拦截 → 请求应带 toolChoice none
          expect(request.options.toolChoice).toBe('none')
          return { kind: 'final_ready', text: '预算耗尽后用现有资料完成的正文。', calls: [] }
        }
        throw new Error('unexpected extra step')
      }
    })
    expect(budgetCalls).toBe(5)
    expect(budgetExhaustedRun.trace.evidenceExhausted).toBe(true)
    expect(budgetExhaustedRun.trace.evidenceRounds).toBe(2)
    expect(budgetExhaustedRun.finalText).toBe('预算耗尽后用现有资料完成的正文。')

    // P1：geo 不再无条件暴露 —— 无地点且无路线询问时不启用 geo_lookup。
    expect(resolveNarrativeActiveToolNames('继续前进')).not.toContain('geo_lookup')
    expect(resolveNarrativeActiveToolNames('继续前进', { hasPlace: true })).toContain('geo_lookup')
    expect(resolveNarrativeActiveToolNames('山口的路怎么走')).toContain('geo_lookup')

    // Q1：叙事展开度映射 —— compact/standard/expanded 缩放 intent 字符区间与 token 预算。
    var standardRespond = intentCharRange('respond', {})
    var compactRespond = intentCharRange('respond', { expansion: 'compact' })
    var expandedRespond = intentCharRange('respond', { expansion: 'expanded' })
    expect(standardRespond.min).toBe(900)
    expect(standardRespond.max).toBe(1500)
    expect(compactRespond.min).toBe(Math.round(900 * 0.65))
    expect(expandedRespond.max).toBe(Math.round(1500 * 1.35))
    expect(narrativeExpansionFactor('expanded')).toBe(1.35)
    expect(narrativeExpansionFactor('unknown')).toBe(1)

    // Q3：BeatPlan schema 校验 —— 拒绝空 responseObligation / 缺 endCondition；causalSteps 可空。
    expect(validateNarrativeBeatPlanInput({
      responseObligation: '回应玩家',
      causalSteps: ['确认依据', '调出波形'],
      revealOrChange: '关系确认',
      endCondition: '核对完成'
    }).valid).toBe(true)
    expect(validateNarrativeBeatPlanInput({
      causalSteps: ['a', 'b'],
      revealOrChange: 'c',
      endCondition: 'd'
    }).valid).toBe(false)
    // P6：causalSteps 容错 —— 空数组合法（不再拒绝），顿号分隔的字符串被归一化为数组。
    expect(validateNarrativeBeatPlanInput({
      responseObligation: '回应玩家',
      causalSteps: [],
      revealOrChange: 'c',
      endCondition: 'd'
    }).valid).toBe(true)
    var sloppyPlan = validateNarrativeBeatPlanInput({
      responseObligation: '回应玩家',
      causalSteps: '核对、确认',
      revealOrChange: 'c',
      endCondition: 'd',
      characterMoves: { character: '陆晨曦', action: '翻阅日志' }
    })
    expect(sloppyPlan.valid).toBe(true)
    expect(sloppyPlan.plan.causalSteps).toEqual(['核对', '确认'])
    expect(sloppyPlan.plan.characterMoves).toHaveLength(1)
    // P6：result 可选 —— 缺 result 的动作仍通过（真实模型常省略），带 result 的保留。
    expect(validateNarrativeBeatPlanInput({
      responseObligation: '回应玩家',
      causalSteps: ['a', 'b'],
      revealOrChange: 'c',
      endCondition: 'd',
      characterMoves: [{ character: '陆晨曦', action: '翻阅日志' }]
    }).valid).toBe(true)
    var withResultPlan = validateNarrativeBeatPlanInput({
      responseObligation: '回应玩家',
      causalSteps: ['a', 'b'],
      revealOrChange: 'c',
      endCondition: 'd',
      characterMoves: [{ character: '陆晨曦', action: '翻阅日志', result: '翻出铜扣' }]
    })
    expect(withResultPlan.valid).toBe(true)
    expect(withResultPlan.plan.characterMoves[0].result).toBe('翻出铜扣')

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
        writingTime: { eraId: 'harbor-era', year: 42 },
        placeStates: {
          'place:gray-wall': { status: '封锁', controllerId: 'faction:tide', danger: 64 }
        },
        characterStates: {
          'char-lin': { status: '警觉', alive: true, placeId: 'place:gray-wall', goal: '找到账簿' }
        },
        encounteredCharacters: [{ id: 'char-lin', name: '林舟', status: '警觉' }],
        goals: [{ title: '查清账簿去向', status: 'active' }],
        emergenceCandidates: [{
          id: 'candidate-ledger',
          title: '账页异动',
          summary: '账页上的盐渍与林舟此前提到的港区仓单一致。',
          placeId: 'place:gray-wall'
        }],
        runtimeEvents: [{
          id: 'evt-ledger-state',
          type: 'state_delta',
          ts: 1,
          payload: {
            kind: 'ledger-discovered',
            placeId: 'place:gray-wall',
            after: {
              placeStates: {
                'place:gray-wall': { status: '封锁', controllerId: 'faction:tide', danger: 64 }
              }
            }
          }
        }]
      },
      memoryRecall: {
        content: '林舟不信任潮盐行会。',
        included: [{ id: 'memory-lin' }]
      }
    })
    expect(experienceContext.envelope.blocks.map(function (block) { return block.kind })).toEqual(
      expect.arrayContaining(['scene', 'location', 'history', 'continuity', 'character', 'memory', 'references'])
    )
    expect(JSON.stringify(experienceContext.envelope.blocks.find(function (block) {
      return block.kind === 'continuity'
    }))).toContain('faction:tide')
    expect(experienceContext.target.allowedEvidenceRefs).toContain('runtime-event:evt-ledger-state')
    expect(experienceContext.contextSummary).toMatchObject({
      causalityConflictCount: 0,
      staleEventCount: 0
    })
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
      versionId: 'storyboard-version-1',
      sourceRefs: [
        { refType: 'history-node', refId: 'history-clocktower', projectId: 'world-1' },
        { refType: 'map-site', refId: 'place:clocktower', projectId: 'world-1' }
      ]
    })
    expect(JSON.stringify(storyboardContext.envelope)).toContain('shot-1')
    expect(JSON.stringify(storyboardContext.envelope)).toContain('shot-2')
    expect(JSON.stringify(storyboardContext.envelope)).toContain('shot-3')
    expect(JSON.stringify(storyboardContext.envelope)).not.toContain('shot-hidden')
    expect(storyboardContext.target.allowedEvidenceRefs).toEqual(expect.arrayContaining([
      'history-node:history-clocktower',
      'map-site:place:clocktower'
    ]))
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

    var structuredProvider = {
      id: 'openai',
      format: 'openai',
      baseUrl: 'https://example.test/v1',
      apiKey: 'sk-test',
      model: 'structured-test'
    }
    var structuredRequest = {
      schemaVersion: 1,
      schemaId: STRUCTURED_GENERATION_SCHEMA_IDS.SECTION,
      requestId: 'setting_test_1',
      provider: structuredProvider,
      target: {
        worldbookId: 'wb-1',
        worldbookRevision: 'rev-1',
        sectionKey: 'world',
        fieldKeys: ['origin', 'geography']
      },
      context: {
        globalConstraints: '潮汐决定航路。',
        confirmedSettings: '港城依赖旧灯塔。',
        currentValues: {},
        relatedEntries: [],
        sourceExcerpts: [],
        userBrief: '补全世界观。'
      }
    }
    expect(validateStructuredGenerationRequest(structuredRequest)).toMatchObject({ valid: true })
    expect(validateStructuredGenerationRequestEnvelope(structuredRequest)).toMatchObject({ valid: true })
    expect(validateStructuredGenerationRequest({
      ...structuredRequest,
      options: { timeoutMs: STRUCTURED_GENERATION_TIMEOUTS.longMs }
    }).request.options.timeoutMs).toBe(STRUCTURED_GENERATION_TIMEOUTS.longMs)
    expect(validateStructuredGenerationRequest({
      ...structuredRequest,
      options: { timeoutMs: STRUCTURED_GENERATION_TIMEOUTS.maxMs + 1000 }
    }).request.options.timeoutMs).toBe(STRUCTURED_GENERATION_TIMEOUTS.maxMs)
    expect(validateStructuredGenerationRequest({
      ...structuredRequest,
      schemaId: STRUCTURED_GENERATION_SCHEMA_IDS.REVISION,
      target: { ...structuredRequest.target, fieldKeys: ['geography'] },
      context: {
        ...structuredRequest.context,
        authoritativeContent: '潮汐决定港城边界。',
        draftContent: '港城沿旧灯塔建立。',
        revisionInstruction: '保留潮汐，补充交通关系。',
        keepFacts: '潮汐决定港城边界。',
        rejectFacts: '删除神明直接建城。'
      }
    })).toMatchObject({ valid: true })
    expect(validateSettingDraftRevisionInput({
      sectionKey: 'world',
      fieldKey: 'geography',
      draftContent: '港城沿旧灯塔建立。',
      revisionInstruction: '保留港城，补充交通关系。'
    })).toMatchObject({ valid: true })
    expect(buildSettingRevisionContext({
      sectionKey: 'world',
      fieldKey: 'geography',
      draftContent: '港城沿旧灯塔建立。',
      revisionInstruction: '补充交通关系。'
    }).sourceDraftHash).toBe(hashSettingDraftContent('港城沿旧灯塔建立。'))
    expect(validateSettingDraftRevisionInput({
      sectionKey: 'world',
      fieldKey: 'geography',
      draftContent: '港城沿旧灯塔建立。',
      revisionInstruction: '   '
    })).toMatchObject({ valid: false, error: { code: 'STRUCTURED_GENERATION_REQUEST_INVALID' } })
    expect(validateStructuredGenerationRequest({
      ...structuredRequest,
      schemaId: 'setting-unknown.v1'
    })).toMatchObject({ valid: false, error: { code: 'STRUCTURED_GENERATION_SCHEMA_UNSUPPORTED' } })
    expect(validateStructuredDraftPayload({
      drafts: { origin: '海潮塑造了陆地。', geography: '港城沿旧灯塔建立。' }
    }, structuredRequest.target)).toMatchObject({
      valid: true,
      drafts: { origin: '海潮塑造了陆地。' }
    })
    expect(validateStructuredDraftPayload({
      drafts: { origin: '海潮塑造了陆地。', unknown: '不应出现' }
    }, structuredRequest.target)).toMatchObject({
      valid: false,
      error: { code: 'STRUCTURED_GENERATION_RESPONSE_INVALID' }
    })
    expect(normalizeStructuredDraftPayload({
      drafts: { origin: '海潮塑造了陆地。' }
    }, structuredRequest.target)).toMatchObject({
      valid: true,
      drafts: { origin: '海潮塑造了陆地。' },
      fieldErrors: { geography: '缺少可用内容' }
    })
    expect(PLACE_KINDS).toContain('port')
    expect(PLACE_RELATION_TYPES).toContain('same-state')
    const structuredPlace = normalizePlacePayload({
      name: '霜落城', kind: 'city', description: '北境城。', aliases: ['霜城'],
      relations: [{ type: 'parent', targetName: '高汤盆地' }],
      sourceEvidence: [{ excerpt: '霜落城位于高汤盆地。' }]
    })
    expect(validatePlacePayload(structuredPlace, { entries: [] })).toMatchObject({ valid: true })
    expect(normalizeStructuredPlaceGenerationPayload({
      places: [{ name: '霜落城', kind: 'city', description: '北境城。', evidence: '霜落城位于高汤盆地。', aliases: [], scale: 'local', parentRef: '', factionRef: '', terrainHints: [], relations: [] }]
    })).toMatchObject({ valid: true, places: [expect.objectContaining({ name: '霜落城' })] })
    expect(normalizeStructuredPlaceGenerationPayload({
      places: [{ name: '', kind: 'city', description: '', evidence: '' }]
    })).toMatchObject({ valid: true, places: [expect.objectContaining({ invalidReason: expect.any(String) })] })
    var schema = getStructuredSettingSchema(STRUCTURED_GENERATION_SCHEMA_IDS.FIELD, {
      sectionKey: 'world',
      fieldKeys: ['origin']
    })
    expect(schema.schema.required).toEqual(['origin'])
    expect(buildStructuredProviderRequest({
      ...structuredRequest,
      schemaId: STRUCTURED_GENERATION_SCHEMA_IDS.FIELD,
      target: { ...structuredRequest.target, fieldKeys: ['origin'] }
    }, 'native-json-schema').body.response_format.json_schema.strict).toBe(true)
    expect(buildStructuredProviderRequest(structuredRequest, 'forced-tool').body.tool_choice).toEqual({
      type: 'function',
      function: { name: 'submit_setting_draft' }
    })
    var characterStructuredRequest = {
      ...structuredRequest,
      schemaId: STRUCTURED_GENERATION_SCHEMA_IDS.SECTION,
      target: {
        ...structuredRequest.target,
        sectionKey: 'characters',
        fieldKeys: ['protagonists', 'majorSupporting']
      }
    }
    expect(JSON.stringify(buildStructuredProviderRequest(characterStructuredRequest, 'native-json-schema').body)).toContain('角色卡')
    expect(JSON.stringify(buildStructuredProviderRequest(characterStructuredRequest, 'native-json-schema').body)).toContain('默认只生成一张配角角色卡')

    var structuredFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{
          finish_reason: 'stop',
          message: { content: JSON.stringify({ drafts: { origin: '海潮塑造了陆地。', geography: '港城沿旧灯塔建立。' } }) }
        }],
        usage: { prompt_tokens: 30, completion_tokens: 18 }
      })
    })
    var structuredResult = await runStructuredProviderRequest(structuredRequest, 'native-json-schema', {
      fetchImpl: structuredFetch,
      timeoutMs: 1000
    })
    expect(structuredResult.payload.drafts.origin).toBe('海潮塑造了陆地。')
    expect(structuredFetch.mock.calls[0][1].body).toContain('json_schema')

    var fallbackFetch = vi.fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({ error: { message: 'response_format json_schema unsupported' } })
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          choices: [{
            finish_reason: 'stop',
            message: { content: JSON.stringify({ drafts: { origin: '海潮塑造了陆地。', geography: '港城沿旧灯塔建立。' } }) }
          }]
        })
      })
    var structuredCache = createStructuredCapabilityCache()
    var fallbackResult = await runStructuredGeneration(structuredRequest, {
      fetchImpl: fallbackFetch,
      cache: structuredCache
    })
    expect(fallbackResult.mode).toBe('json-object')
    expect(fallbackFetch).toHaveBeenCalledTimes(2)
    expect(structuredCache.get(getStructuredCapabilityCacheKey(structuredProvider)).nativeJsonSchema).toBe(false)

    var incompleteFetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          choices: [{ finish_reason: 'length', message: { content: '{"geography":"港城沿旧灯塔建立' } }]
        })
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          choices: [{
            finish_reason: 'stop',
            message: { content: JSON.stringify({ drafts: { geography: '港城沿旧灯塔建立，北侧为潮滩与盐沼，南侧连接山口商路。' } }) }
          }]
        })
      })
    var incompleteRequest = {
      ...structuredRequest,
      schemaId: STRUCTURED_GENERATION_SCHEMA_IDS.FIELD,
      target: { ...structuredRequest.target, fieldKeys: ['geography'] },
      options: { maxTokens: 2200 }
    }
    var incompleteResult = await runStructuredGeneration(incompleteRequest, {
      fetchImpl: incompleteFetch,
      cache: createStructuredCapabilityCache()
    })
    expect(incompleteResult.drafts.geography).toContain('潮滩')
    expect(incompleteFetch).toHaveBeenCalledTimes(2)
    expect(JSON.parse(incompleteFetch.mock.calls[1][1].body).max_tokens).toBeGreaterThan(2200)

    const malformedStopFetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          choices: [{ finish_reason: 'stop', message: { content: '{"drafts":{"geography":"港城沿旧灯塔建立' } }]
        })
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          choices: [{
            finish_reason: 'stop',
            message: { content: JSON.stringify({ drafts: { geography: '港城沿旧灯塔建立，北侧为潮滩与盐沼。' } }) }
          }]
        })
      })
    const malformedStopResult = await runStructuredGeneration({
      ...incompleteRequest,
      options: { maxTokens: 2200 }
    }, {
      fetchImpl: malformedStopFetch,
      cache: createStructuredCapabilityCache()
    })
    expect(malformedStopResult.drafts.geography).toContain('潮滩')
    expect(malformedStopFetch).toHaveBeenCalledTimes(2)

    var structuredProbeFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{
          finish_reason: 'stop',
          message: { content: JSON.stringify({ drafts: { origin: '潮汐塑造了最初的陆地。' } }) }
        }]
      })
    })
    var structuredProbe = await probeStructuredProviderCapabilities(structuredProvider, {
      fetchImpl: structuredProbeFetch,
      timeoutMs: 1000,
      cache: createStructuredCapabilityCache()
    })
    expect(structuredProbe).toMatchObject({
      ok: true,
      available: true,
      mode: 'native-json-schema',
      protocol: 'openai-chat',
      reasoningControl: 'none'
    })
    expect(structuredProbeFetch).toHaveBeenCalledTimes(1)
    expect(structuredProbeFetch.mock.calls[0][1].body).toContain('json_schema')
  })
})
