// NarrativeKernel 真实执行链（验收修复 1 / spec §9）：
// Authoring 下一拍不再走裸 provider step，而是像体验页一样
// buildNarrativeKernel（消费共享现场投影）→ 资料索引 + 工具注册表
// → runNarrativeAgentGeneration（orchestrator：BeatPlan 规划隔离、资料工具、正文 transcript）。
import { buildNarrativeKernel } from '../narrativeKernel.js'
import {
  runNarrativeAgentGeneration,
  narrativeTranscriptStaticOverheadChars,
  serializeKernelWithinTextPartBudget,
} from '../narrativeAgentOrchestrator.js'
import { getNarrativeResourceIndex } from '../narrativeResourceIndex.js'
import { createNarrativeToolRegistry } from '../narrativeToolRegistry.js'
import { buildNarrativeFormatInstructions } from '../../narrativePresentation.js'
import {
  attachDependencyIssuesToReceipt,
  buildModelCallReceipt,
  reconcileManifestWithReceipt
} from '../context/contextReceipt.js'
import { classifyContextRunOutcome } from '../context/contextRunBudget.js'
import { reconcileManifestDependencies } from '../context/contextManifestLifecycle.js'
import { createManifestAuthorizedNarrativeIndex } from '../context/manifestToolAuthorization.js'

function emptyResultError() {
  return Object.assign(new Error('叙事内核没有返回正文'), { code: 'AGENT_EMPTY_RESULT' })
}

// 上下文失败（Task 6）：在调用 provider 之前以 typed 错误拒绝，
// 绝不带着缺失的现场/绑定进入生成链。
function contextFailure(code, message) {
  return Object.assign(new Error(message), { code })
}

function manifestAuthorizationFailure(result) {
  const error = contextFailure(
    'AUTHORING_MANIFEST_AUTHORIZATION_FAILED',
    `冻结上下文授权失败：${String(result?.reason || 'unknown')}`
  )
  error.reason = String(result?.reason || 'unknown')
  error.authorizationFailure = result
  return error
}

function staleDependencyIssue(error) {
  return {
    dependency: '*',
    reason: 'live-revision-read-failed',
    errorCode: String(error?.code || 'AUTHORING_LIVE_REVISION_READ_FAILED')
  }
}

function invalidEvidenceOutcome() {
  return Object.freeze({
    status: 'invalid-result',
    code: 'AUTHORING_TOOL_EVIDENCE_UNAUTHORIZED',
    retryable: false,
    degraded: false
  })
}

function orchestratorMode(intentMode) {
  return String(intentMode || '') === 'continue' ? 'continue' : 'auto'
}

function selectedDirectionReceipt(direction) {
  if (direction?.kind !== 'authoring-scene-direction-selection') return null
  return Object.freeze({
    kind: 'authoring-selected-direction-receipt',
    version: 1,
    id: String(direction.id || ''),
    title: String(direction.title || ''),
    action: String(direction.action || ''),
    immediateGain: String(direction.immediateGain || ''),
    cost: String(direction.cost || ''),
    fingerprint: String(direction.fingerprint || ''),
    sessionFingerprint: String(direction.sessionFingerprint || ''),
    evidenceRefs: Object.freeze([...(direction.evidenceRefs || [])].map(String))
  })
}

function attachDirectionReceipt(receipt, directionReceipt) {
  if (!receipt || !directionReceipt) return receipt
  return Object.freeze({ ...receipt, authorIntent: directionReceipt })
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
    projectionFingerprint = '',
    contextManifest = null,
    resolveLiveContextDependencies = null
  } = {}) {
    const projectId = String(explicitProjectId || projection?.projectId || worldbook?.id || '')
    const manifestMode = Boolean(contextManifest)
    const targetRole = String(contextManifest?.target?.documentRole || contextManifest?.target?.role || 'manuscript')
    const requiresChapter = targetRole !== 'exploration'

    // 复验修复 2：Authoring 正常链路绝不携带 Experience 会话状态进内核。
    // sceneThread / historyNode 只属于体验页运行时，这里从 runtimeState 中剥离。
    const {
      sceneThread: _excludedSceneThread,
      historyNode: _excludedHistoryNode,
      ...sanitizedRuntimeState
    } = (runtimeState && typeof runtimeState === 'object' ? runtimeState : {})

    // —— provider 前上下文门禁（Task 6 Step 5）——
    if (!projectId || !projection || (requiresChapter && !projection.chapterId)) {
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

    // C1-1B：FrozenContextManifest 是 manifest 模式唯一资料授权源。
    // 任何 kind/schema/project/fingerprint/sourceRef 异常都在 provider 前 typed fail-closed。
    const manifestAccess = manifestMode
      ? createManifestAuthorizedNarrativeIndex({ manifest: contextManifest, projectId })
      : null
    if (manifestMode && !manifestAccess?.ok) {
      throw manifestAuthorizationFailure(manifestAccess)
    }

    // 内核与 UI 左栏/composer 读同一份投影：地点以投影为准，不二次猜测。
    const legacyKernelRuntimeState = {
      ...sanitizedRuntimeState,
      worldMapState: projection?.location
        ? {
            ...(sanitizedRuntimeState.worldMapState || {}),
            placeId: projection.location.id || sanitizedRuntimeState.worldMapState?.placeId || '',
            currentScene: projection.location.name || sanitizedRuntimeState.worldMapState?.currentScene || ''
          }
        : (sanitizedRuntimeState.worldMapState || {})
    }
    // manifest 已冻结正文/现场/设定/记忆。旧 narrativeContext、runtime、worldbook、
    // sceneProjection 不得再以第二份副本进入 Kernel；只保留本轮显式指令/作者注。
    const kernelRuntimeState = manifestMode ? {} : legacyKernelRuntimeState
    const contextMessages = !manifestMode && Array.isArray(narrativeContext?.messages)
      ? narrativeContext.messages
      : []
    const instruction = String(turn?.instruction || '').trim()
    const direction = turn?.selectedDirection || null
    const directionInstruction = direction
      ? [
          '作者已选定本次唯一叙事方向：',
          `方向：${String(direction.title || '')}`,
          `行动：${String(direction.action || '')}`,
          `眼前所得：${String(direction.immediateGain || '')}`,
          `代价：${String(direction.cost || '')}`,
          '只将这一方向写成连续正文；不要重新规划、枚举或混入其他方向。'
        ].join('\n')
      : ''
    const operationInstruction = turn?.operation === 'rewrite-unit'
      ? '重写“待重写文本块”的完整内容：保留已成立的事实、人物关系与叙事视角，改善表达与节奏；只输出可整体替换该文本块的正文，不续写后续情节。'
      : ''
    const effectiveInstruction = [operationInstruction, directionInstruction, instruction].filter(Boolean).join('\n')
    const messages = effectiveInstruction
      ? [
          ...contextMessages,
          {
            id: `authoring-turn:${String(narrativeContext?.revision || 'current')}`,
            role: 'user',
            content: effectiveInstruction
          }
        ]
      : contextMessages
    const kernel = buildKernel({
      worldbook: manifestMode ? null : worldbook,
      runtimeState: kernelRuntimeState,
      messages,
      projectId,
      sessionId: '',
      authorNote: String(turn?.directorNote || ''),
      // 复验修复 2：Authoring 正常链路不携带 Experience sceneThread；
      // 现场证据只来自共享投影（sceneProjection）。
      sceneSummary: manifestMode ? null : (narrativeContext?.sceneSummary || null),
      intentMode,
      turnContext: turn ? {
        kind: String(turn.kind || ''),
        operation: String(turn.operation || 'next-passage'),
        actorId: String(turn.actorId || ''),
        targetId: String(turn.targetId || '')
      } : null,
      sceneProjection: manifestMode ? null : (projection || null),
      contextManifest
    })
    // U1：executor 的 receipt 读取这里的 serializedBlocks——必须与实际发送
    // 的 text part 同源。使用总预算序列化（含 prose 静态前缀预留）。
    const kernelSerialization = serializeKernelWithinTextPartBudget(
      kernel,
      narrativeTranscriptStaticOverheadChars({ phase: 'prose', formatInstructions })
    )
    const index = manifestMode
      ? manifestAccess.index
      : buildResourceIndex({
          projectId,
          sessionId: '',
          worldbook,
          runtimeState: kernelRuntimeState,
          memories: resolveMemories({ projectId })
        })
    const registry = createRegistry({
      index,
      projectId,
      sessionId: '',
      currentPlaceId: manifestMode ? '' : (kernelRuntimeState.worldMapState?.placeId || ''),
      allowedToolNames: manifestMode ? kernel.activeToolNames : null
    })

    let run
    try {
      run = await runGeneration({
        kernel,
        kernelSerialization,
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
    } catch (error) {
      error.contextOutcome = classifyContextRunOutcome({ error })
      throw error
    }
    const generatedText = String(run?.finalText || '').trim()
    if (!generatedText) {
      const error = emptyResultError()
      error.contextOutcome = classifyContextRunOutcome({ error })
      throw error
    }
    // 回执直接消费 provider 使用的同一份 serializer 输出；不再从 Kernel/activatedLore 反推 actual。
    const serializedBlocks = kernelSerialization.serializedBlocks
    const toolEvidence = Array.isArray(run?.trace?.calls) ? run.trace.calls : []
    const directionReceipt = selectedDirectionReceipt(direction)
    const contextReceipt = attachDirectionReceipt(contextManifest ? buildModelCallReceipt({
      manifest: contextManifest,
      serializedBlocks,
      toolEvidence,
      authorization: manifestAccess?.authorization || null,
      usage: run?.usage || run?.trace?.usage || null,
      provider: settings?.provider || '',
      model: settings?.model || ''
    }) : null, directionReceipt)
    const contextReconciliation = contextManifest ? reconcileManifestWithReceipt(contextManifest, contextReceipt) : []
    const budgetTrace = run?.trace?.tokenBudget || null
    const contextCallReceipts = contextManifest
      ? (budgetTrace?.calls || []).map((call) => attachDirectionReceipt(buildModelCallReceipt({
          manifest: contextManifest,
          serializedBlocks,
          toolEvidence: toolEvidence.filter((entry) => entry?.consumedByCallIndex === call.index),
          authorization: manifestAccess?.authorization || null,
          usage: call,
          provider: settings?.provider || '',
          model: settings?.model || '',
          callIndex: call.index
        }), directionReceipt))
      : []
    const contextOutcome = classifyContextRunOutcome({
      text: generatedText,
      receipt: contextReceipt,
      reconciliation: contextReconciliation,
      budget: budgetTrace ? {
        capped: budgetTrace.usage?.inputTokens >= budgetTrace.limits?.maxInputTokens
          || budgetTrace.usage?.outputTokens >= budgetTrace.limits?.maxOutputTokens
          || budgetTrace.usage?.totalTokens >= budgetTrace.limits?.maxTotalTokens
      } : null
    })
    const evidenceOutcome = contextReceipt?.evidenceAuthorization?.valid === false
      ? invalidEvidenceOutcome()
      : contextOutcome
    const result = {
      text: generatedText,
      adoptable: evidenceOutcome.status !== 'invalid-result',
      trace: run.trace,
      contextManifest,
      contextReceipt,
      receipt: contextReceipt,
      contextCallReceipts,
      contextReconciliation,
      contextOutcome: evidenceOutcome,
      selectedDirectionReceipt: directionReceipt,
      dependencyIssues: []
    }

    // provider 返回后才从 repository adapter 读取 live revision。异步 resolver
    // 必须 await；读取失败同样 fail-closed 为 stale，但保留正文与 receipt 供作者检查。
    if (contextManifest && typeof resolveLiveContextDependencies === 'function') {
      let dependencyIssues
      try {
        const liveDependencies = await resolveLiveContextDependencies()
        dependencyIssues = reconcileManifestDependencies(contextManifest, liveDependencies)
      } catch (error) {
        dependencyIssues = [staleDependencyIssue(error)]
      }
      if (dependencyIssues.length) {
        const staleError = Object.assign(new Error('上下文依赖已更新，本轮结果已过期'), {
          code: 'AGENT_RESULT_STALE',
          dependencyIssues
        })
        const staleReceipt = attachDependencyIssuesToReceipt(contextReceipt, dependencyIssues)
        return {
          ...result,
          adoptable: false,
          contextReceipt: staleReceipt,
          receipt: staleReceipt,
          dependencyIssues,
          contextOutcome: {
            ...classifyContextRunOutcome({ error: staleError }),
            dependencyIssues
          }
        }
      }
    }
    return result
  }

  return Object.freeze({ executeTurn })
}
