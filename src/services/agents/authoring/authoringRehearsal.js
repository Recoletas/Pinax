// 试演请求的传输适配：从冻结现场构建上下文信封，装配共享协议
// （身份边界、知情视图、后果指令见 shared/authoringRehearsalConsequenceContract.js），
// 调用统一任务通道并发送。纯协议与解析都在 shared，本文件保持薄。

import { requestAdvisorTask } from '../../advisorTaskService.js'
import { buildAuthoringSceneDirectionEnvelope } from './authoringSceneDirectionPlanner.js'
import {
  buildRehearsalRequestPlan as planRehearsalRequest,
  parseRehearsalResponse,
  REHEARSAL_MAX_OUTPUT_CHARS,
  REHEARSAL_MAX_STEPS
} from '../../../../shared/authoringRehearsalConsequenceContract.js'

export { REHEARSAL_MAX_STEPS, REHEARSAL_MAX_OUTPUT_CHARS, parseRehearsalResponse, planRehearsalRequest }
// 兼容再导出：Authoring.vue 与既有测试从这里引用协议函数。
export {
  normalizeActionIntent,
  rehearsalParticipants,
  rehearsalPathText,
  rehearsalResponders,
  resolveActionParticipants
} from '../../../../shared/authoringRehearsalConsequenceContract.js'

export async function requestRehearsalStep({ run, steps, action, signal, settingsSnapshot, conditions: _conditions = null, routeState = null }) {
  if (!run?.runSession) throw new Error('本次试演已到四步，或行动过长；请从较早一步换路。')
  const envelope = buildAuthoringSceneDirectionEnvelope({
    contextManifest: run.runSession.manifest,
    pressureProjection: run.pressureProjection,
    sessionFingerprint: run.runSession.manifest.fingerprint
  })
  const refs = envelope.blocks.flatMap(block => block.sourceRefs || [])
  const planned = planRehearsalRequest({ run, steps, action, routeState, refs })
  if (planned.error) throw new Error(planned.error)
  const result = await requestAdvisorTask({
    taskType: 'authoring.rehearsal.step', envelope, settingsSnapshot, signal,
    scope: 'writing', mode: 'direct',
    options: { toolChoice: 'none', maxOutputChars: REHEARSAL_MAX_OUTPUT_CHARS, rehearsalVerification: planned.verification },
    question: planned.question
  })
  return parseRehearsalResponse(result.result?.rehearsal || result.advice, refs, planned.verification)
}
