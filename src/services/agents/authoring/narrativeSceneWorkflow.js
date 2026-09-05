import {
  proseContainsControlIntent,
  validateAuthoringTurnIntent
} from './authoringTurnContract.js'
import { normalizeNarrativeTransportResult } from '../../narrativePresentation.js'

const INTENT_MODE = Object.freeze({
  'authoring.continue': 'continue',
  'authoring.advance': 'advance',
  'authoring.simulate.character': 'character',
  'authoring.simulate.scene': 'scene',
  'authoring.trigger': 'trigger'
})

function unknownNarrativeTaskError(taskId) {
  const error = new Error(`Unknown narrative scene task: ${taskId}`)
  error.code = 'AGENT_TASK_UNKNOWN'
  return error
}

// NarrativeKernel 薄适配器：task.id → intentMode；
// 携带回合意图契约（plan Task 2.1）时把 turn 一并交给内核轮次，
// 并在结果侧执行 §16 门禁——用户控制文本逐字泄漏进正文即拒绝整个事务。
export function createNarrativeSceneWorkflow({ runTurn } = {}) {
  if (typeof runTurn !== 'function') {
    throw new Error('createNarrativeSceneWorkflow requires a runTurn function')
  }
  return Object.freeze({
    async run({ task, request, context }) {
      const intentMode = INTENT_MODE[task.id]
      if (!intentMode) throw unknownNarrativeTaskError(task.id)

      const turn = request.intent?.turn || null
      if (turn) {
        const validation = validateAuthoringTurnIntent(turn)
        if (!validation.valid) {
          throw Object.assign(new Error(`invalid turn intent: ${validation.reason}`), {
            code: 'AGENT_TURN_INVALID',
            reason: validation.reason
          })
        }
      }

      const authoringRunSession = context.authoringRunSession ?? null

      const generated = await runTurn({
        intentMode,
        intent: request.intent,
        envelope: context.envelope,
        authoringRunSession,
        signal: request.options?.signal,
        turn,
        narrativeContext: request.intent?.narrativeContext ?? null,
        resolveLiveContextDependencies: context.resolveLiveContextDependencies ?? null,
        // C1-1B：冻结 session 存在时，它的现场投影是唯一真源；request.intent
        // 只保留给尚未接入 session 的兼容路径，不能覆盖已冻结现场。
        projection: authoringRunSession
          ? authoringRunSession.sceneProjection
          : (request.intent?.projection ?? context.projection ?? null)
      })

      const transport = normalizeNarrativeTransportResult(generated.text)
      const text = transport.prose
      if (turn && proseContainsControlIntent(text, turn)) {
        throw Object.assign(new Error('生成正文包含了用户控制文本'), { code: 'AGENT_CONTROL_TEXT_LEAK' })
      }

      return {
        status: 'completed',
        effectPolicy: 'direct-text',
        actions: [{ type: 'text-insert', content: text, baseRevision: request.target.revision }],
        trace: generated.trace ? { phases: generated.trace.phases, contextLedger: context.ledger } : null,
        // 仅随本次内存结果返回，供 Ghost 采纳前按 exact refs 重读 revision；
        // session 已深冻结，不能成为新的页面可变状态或持久化副本。
        authoringRunSession,
        contextManifest: generated.contextManifest || null,
        contextReceipt: generated.contextReceipt || null,
        contextCallReceipts: generated.contextCallReceipts || [],
        contextOutcome: generated.contextOutcome || { status: 'completed' },
        sceneDelta: generated.sceneDelta || null,
        outlineDelta: generated.outlineDelta || null,
        boundaryHints: transport.boundaryHints,
        boundaryHintSource: transport.boundaryHintSource,
        selectedDirectionReceipt: generated.selectedDirectionReceipt || null
      }
    }
  })
}

export { INTENT_MODE as NARRATIVE_SCENE_INTENT_MODES }
