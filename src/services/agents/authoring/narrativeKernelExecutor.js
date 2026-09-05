// NarrativeKernel 真实执行链（验收修复 1 / spec §9）：
// Authoring 下一拍不再走裸 provider step，而是像体验页一样
// buildNarrativeKernel（消费共享现场投影）→ 资料索引 + 工具注册表
// → runNarrativeAgentGeneration（orchestrator：BeatPlan 规划隔离、资料工具、正文 transcript）。
import { buildNarrativeKernel } from '../narrativeKernel.js'
import { runNarrativeAgentGeneration } from '../narrativeAgentOrchestrator.js'
import { getNarrativeResourceIndex } from '../narrativeResourceIndex.js'
import { createNarrativeToolRegistry } from '../narrativeToolRegistry.js'
import { buildNarrativeFormatInstructions } from '../../narrativePresentation.js'

function emptyResultError() {
  return Object.assign(new Error('叙事内核没有返回正文'), { code: 'AGENT_EMPTY_RESULT' })
}

// 上下文失败（Task 6）：在调用 provider 之前以 typed 错误拒绝，
// 绝不带着缺失的现场/绑定进入生成链。
function contextFailure(code, message) {
  return Object.assign(new Error(message), { code })
}

function orchestratorMode(intentMode) {
  return String(intentMode || '') === 'continue' ? 'continue' : 'auto'
}

export function createNarrativeKernelExecutor({
  buildKernel = buildNarrativeKernel,
  runGeneration = runNarrativeAgentGeneration,
  buildResourceIndex = getNarrativeResourceIndex,
  createRegistry = createNarrativeToolRegistry,
  formatInstructions = buildNarrativeFormatInstructions(),
  maxTokens = 2600,
  resolveMemories = () => []
} = {}) {
  if (typeof buildKernel !== 'function') throw new Error('createNarrativeKernelExecutor requires buildKernel')
  if (typeof runGeneration !== 'function') throw new Error('createNarrativeKernelExecutor requires runGeneration')

  async function executeTurn({
    intentMode = '',
    turn = null,
    narrativeContext = null,
    projection = null,
    settings = {},
    worldbook = null,
    runtimeState = {},
    signal = null,
    // Task 6 显式输入：项目 ID 与冻结投影指纹由调用方提供；
    // 执行器绝不内部查找 store、路由或会话。
    projectId: explicitProjectId = '',
    projectionFingerprint = ''
  } = {}) {
    const projectId = String(explicitProjectId || projection?.projectId || worldbook?.id || '')

    // 复验修复 2：Authoring 正常链路绝不携带 Experience 会话状态进内核。
    // sceneThread / historyNode 只属于体验页运行时，这里从 runtimeState 中剥离。
    const {
      sceneThread: _excludedSceneThread,
      historyNode: _excludedHistoryNode,
      ...sanitizedRuntimeState
    } = (runtimeState && typeof runtimeState === 'object' ? runtimeState : {})

    // —— provider 前上下文门禁（Task 6 Step 5）——
    if (!projectId || !projection?.chapterId) {
      throw contextFailure('AUTHORING_CONTEXT_MISSING', '请先选择书与章节再继续下一拍')
    }
    if (projection.worldbookStatus === 'missing') {
      throw contextFailure('AUTHORING_WORLDBOOK_MISSING', '绑定的世界书已缺失，请重新关联')
    }
    const fingerprint = String(projectionFingerprint || projection?.projectionFingerprint || '')
    if (!fingerprint || !projection.activeUnitId) {
      throw contextFailure('AUTHORING_FROZEN_CONTEXT_MISSING', '现场快照不完整，请重试下一拍')
    }
    if (
      turn?.kind === 'dialogue'
      && Array.isArray(projection.presentCharacters)
    ) {
      const castIds = new Set(projection.presentCharacters.map((member) => String(member?.id)))
      if (!castIds.has(String(turn.actorId || '')) || !castIds.has(String(turn.targetId || ''))) {
        throw contextFailure('AUTHORING_CAST_MEMBER_ABSENT', '对话的说话人与对象必须都在当前现场中')
      }
    }

    // 内核与 UI 左栏/composer 读同一份投影：地点以投影为准，不二次猜测。
    const kernelRuntimeState = {
      ...sanitizedRuntimeState,
      worldMapState: projection?.location
        ? {
            ...(sanitizedRuntimeState.worldMapState || {}),
            placeId: projection.location.id || sanitizedRuntimeState.worldMapState?.placeId || '',
            currentScene: projection.location.name || sanitizedRuntimeState.worldMapState?.currentScene || ''
          }
        : (sanitizedRuntimeState.worldMapState || {})
    }
    const contextMessages = Array.isArray(narrativeContext?.messages) ? narrativeContext.messages : []
    const instruction = String(turn?.instruction || '').trim()
    const messages = instruction
      ? [
          ...contextMessages,
          {
            id: `authoring-turn:${String(narrativeContext?.revision || 'current')}`,
            role: 'user',
            content: instruction
          }
        ]
      : contextMessages
    const kernel = buildKernel({
      worldbook,
      runtimeState: kernelRuntimeState,
      messages,
      projectId,
      sessionId: '',
      authorNote: String(turn?.directorNote || ''),
      // 复验修复 2：Authoring 正常链路不携带 Experience sceneThread；
      // 现场证据只来自共享投影（sceneProjection）。
      sceneSummary: narrativeContext?.sceneSummary || null,
      intentMode,
      turnContext: turn ? {
        kind: String(turn.kind || ''),
        actorId: String(turn.actorId || ''),
        targetId: String(turn.targetId || '')
      } : null,
      sceneProjection: projection || null
    })
    const memories = resolveMemories({ projectId })
    const index = buildResourceIndex({
      projectId,
      sessionId: '',
      worldbook,
      runtimeState: kernelRuntimeState,
      memories
    })
    const registry = createRegistry({
      index,
      projectId,
      sessionId: '',
      currentPlaceId: kernelRuntimeState.worldMapState?.placeId || ''
    })

    const run = await runGeneration({
      kernel,
      registry,
      mode: orchestratorMode(intentMode),
      intent: instruction ? 'respond' : intentMode,
      formatInstructions,
      worldId: projectId,
      settings,
      requestId: `authoring:${Date.now().toString(36)}`,
      signal,
      maxTokens
    })
    const generatedText = String(run?.finalText || '').trim()
    if (!generatedText) throw emptyResultError()
    return { text: generatedText, trace: run.trace }
  }

  return Object.freeze({ executeTurn })
}
