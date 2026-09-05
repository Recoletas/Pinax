import {
  proseContainsControlIntent,
  validateAuthoringTurnIntent
} from './authoringTurnContract.js'

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

      const generated = await runTurn({
        intentMode,
        intent: request.intent,
        envelope: context.envelope,
        signal: request.options?.signal,
        turn,
        narrativeContext: request.intent?.narrativeContext ?? null,
        // 共享现场投影（spec §10）：与左栏/composer 同一份，交给真实内核构建。
        projection: request.intent?.projection ?? context.projection ?? null
      })

      const text = String(generated.text || '').trim()
      if (turn && proseContainsControlIntent(text, turn)) {
        throw Object.assign(new Error('生成正文包含了用户控制文本'), { code: 'AGENT_CONTROL_TEXT_LEAK' })
      }

      return {
        status: 'completed',
        effectPolicy: 'direct-text',
        actions: [{ type: 'text-insert', content: text, baseRevision: request.target.revision }],
        trace: generated.trace ? { phases: generated.trace.phases, contextLedger: context.ledger } : null
      }
    }
  })
}

export { INTENT_MODE as NARRATIVE_SCENE_INTENT_MODES }
