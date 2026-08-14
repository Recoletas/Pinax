/**
 * 故事生成质量第二阶段（Q3）—— NarrativeBeatPlan 契约。
 *
 * BeatPlan 是每轮写正文前的局部计划，由同一 provider 通过内部控制调用
 * `submit_narrative_beat_plan` 提交；它不是世界工具，不查询/写入外部状态，
 * 不计入 grounding evidence。open/respond/advance 计划先行，extend 复用当前计划。
 */

export const NARRATIVE_BEAT_PLAN_SCHEMA_VERSION = 1
export const NARRATIVE_BEAT_PLAN_TOOL = 'submit_narrative_beat_plan'

export const NARRATIVE_BEAT_PLAN_LIMITS = Object.freeze({
  minCausalSteps: 0,
  maxCausalSteps: 4,
  maxCharacterMoves: 6,
  maxFunctionalDetails: 2,
  maxAvoidRepeats: 6,
  maxFieldChars: 120,
  maxChars: 2400
})

function text(value, limit = NARRATIVE_BEAT_PLAN_LIMITS.maxFieldChars) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, limit)
}

// P6：容错归一化 —— 真实模型常把数组写成顿号/逗号分隔的字符串（"a、b"），
// 只接受数组会把这类计划误判为空而拒绝。
function stringArray(value, limit) {
  const raw = Array.isArray(value)
    ? value
    : (typeof value === 'string' ? value.split(/[、,，;；\n]+/) : [])
  const output = []
  for (const item of raw) {
    const cleaned = text(item)
    if (!cleaned || output.includes(cleaned)) continue
    output.push(cleaned)
    if (output.length >= limit) break
  }
  return output
}

function moveArray(value) {
  const list = Array.isArray(value)
    ? value
    : (value && typeof value === 'object' && !Array.isArray(value) ? [value] : [])
  return list.slice(0, NARRATIVE_BEAT_PLAN_LIMITS.maxCharacterMoves).map((move) => ({
    character: text(move?.character || move?.name, 80),
    intent: text(move?.intent || move?.immediateIntent),
    action: text(move?.action),
    // P6：result 可选（动作的可观察后果）——有则用于 repetitions 滚动，缺则不拦生成
    result: text(move?.result)
  })).filter((move) => move.character)
}

function detailArray(value) {
  const list = Array.isArray(value)
    ? value
    : (value && typeof value === 'object' && !Array.isArray(value) ? [value] : [])
  return list.slice(0, NARRATIVE_BEAT_PLAN_LIMITS.maxFunctionalDetails).map((item) => ({
    detail: text(item?.detail),
    affects: text(item?.affects)
  })).filter((item) => item.detail)
}

export function normalizeNarrativeBeatPlan(raw = {}) {
  const causalSteps = stringArray(raw.causalSteps, NARRATIVE_BEAT_PLAN_LIMITS.maxCausalSteps)
  return {
    schemaVersion: NARRATIVE_BEAT_PLAN_SCHEMA_VERSION,
    sceneThreadRevision: text(raw.sceneThreadRevision, 120),
    intent: text(raw.intent, 40),
    mode: text(raw.mode, 40),
    responseObligation: text(raw.responseObligation),
    causalSteps,
    characterMoves: moveArray(raw.characterMoves),
    functionalDetails: detailArray(raw.functionalDetails),
    revealOrChange: text(raw.revealOrChange),
    endCondition: text(raw.endCondition),
    avoidRepeats: stringArray(raw.avoidRepeats, NARRATIVE_BEAT_PLAN_LIMITS.maxAvoidRepeats),
    targetChars: Number.isFinite(Number(raw.targetChars)) ? Math.max(0, Number(raw.targetChars)) : 0
  }
}

function error(code, message) {
  return { valid: false, error: { code, message } }
}

export function validateNarrativeBeatPlanInput(rawInput) {
  if (!rawInput || typeof rawInput !== 'object' || Array.isArray(rawInput)) {
    return error('NARRATIVE_BEAT_PLAN_INVALID', 'BeatPlan 必须是 JSON 对象')
  }
  const plan = normalizeNarrativeBeatPlan(rawInput)
  if (!plan.responseObligation) {
    return error('NARRATIVE_BEAT_PLAN_OBLIGATION_REQUIRED', 'responseObligation 不能为空：本轮玩家输入必须得到什么回应')
  }
  if (plan.causalSteps.length > NARRATIVE_BEAT_PLAN_LIMITS.maxCausalSteps) {
    return error('NARRATIVE_BEAT_PLAN_STEPS_TOO_MANY', `causalSteps 至多 ${NARRATIVE_BEAT_PLAN_LIMITS.maxCausalSteps} 个`)
  }
  if (plan.functionalDetails.length > NARRATIVE_BEAT_PLAN_LIMITS.maxFunctionalDetails) {
    return error('NARRATIVE_BEAT_PLAN_DETAILS_TOO_MANY', `functionalDetails 至多 ${NARRATIVE_BEAT_PLAN_LIMITS.maxFunctionalDetails} 个`)
  }
  if (plan.characterMoves.length > NARRATIVE_BEAT_PLAN_LIMITS.maxCharacterMoves) {
    return error('NARRATIVE_BEAT_PLAN_MOVES_TOO_MANY', `characterMoves 至多 ${NARRATIVE_BEAT_PLAN_LIMITS.maxCharacterMoves} 个`)
  }
  if (!plan.revealOrChange) {
    return error('NARRATIVE_BEAT_PLAN_REVEAL_REQUIRED', 'revealOrChange 不能为空：本轮最终新增的信息/关系/目标/局势变化')
  }
  if (!plan.endCondition) {
    return error('NARRATIVE_BEAT_PLAN_END_REQUIRED', 'endCondition 不能为空：正文写到什么状态可以自然停下')
  }
  // P3：最小因果语义 —— 至少一个非空因果步骤，或一个带 action+result 的角色动作；
  // 保证计划有可执行的变化链，不再允许"零变化只堆描写"的计划。
  const hasCausalStep = plan.causalSteps.length >= 1
  const hasMoveWithResult = plan.characterMoves.some((move) => move.action && move.result)
  if (!hasCausalStep && !hasMoveWithResult) {
    return error('NARRATIVE_BEAT_PLAN_NO_CAUSAL_CONTENT', 'BeatPlan 必须包含至少一个因果步骤，或一个带 action+result 的角色动作')
  }
  const serialized = JSON.stringify(plan)
  if (serialized.length > NARRATIVE_BEAT_PLAN_LIMITS.maxChars) {
    return error('NARRATIVE_BEAT_PLAN_TOO_LONG', 'BeatPlan 超过长度上限')
  }
  return { valid: true, plan }
}

export function narrativeBeatPlanRevision(plan) {
  const normalized = normalizeNarrativeBeatPlan(plan)
  const serialized = JSON.stringify({
    obligation: normalized.responseObligation,
    steps: normalized.causalSteps,
    reveal: normalized.revealOrChange,
    end: normalized.endCondition,
    moves: normalized.characterMoves,
    details: normalized.functionalDetails,
    avoid: normalized.avoidRepeats
  })
  let hash = 2166136261
  for (let index = 0; index < serialized.length; index += 1) {
    hash ^= serialized.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return `bp_${(hash >>> 0).toString(36)}`
}

/**
 * BeatPlan 工具的 JSON schema（进入 provider 工具目录）。
 */
export function narrativeBeatPlanToolSchema() {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['responseObligation', 'causalSteps', 'revealOrChange', 'endCondition'],
    properties: {
      sceneThreadRevision: { type: 'string' },
      intent: { type: 'string' },
      mode: { type: 'string' },
      responseObligation: { type: 'string', maxLength: NARRATIVE_BEAT_PLAN_LIMITS.maxFieldChars },
      causalSteps: {
        type: 'array',
        maxItems: NARRATIVE_BEAT_PLAN_LIMITS.maxCausalSteps,
        items: { type: 'string', maxLength: NARRATIVE_BEAT_PLAN_LIMITS.maxFieldChars }
      },
      characterMoves: {
        type: 'array',
        maxItems: NARRATIVE_BEAT_PLAN_LIMITS.maxCharacterMoves,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['action'],
          properties: {
            character: { type: 'string' },
            intent: { type: 'string' },
            action: { type: 'string', maxLength: NARRATIVE_BEAT_PLAN_LIMITS.maxFieldChars },
            result: { type: 'string', maxLength: NARRATIVE_BEAT_PLAN_LIMITS.maxFieldChars }
          }
        }
      },
      functionalDetails: {
        type: 'array',
        maxItems: NARRATIVE_BEAT_PLAN_LIMITS.maxFunctionalDetails,
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            detail: { type: 'string' },
            affects: { type: 'string' }
          }
        }
      },
      revealOrChange: { type: 'string', maxLength: NARRATIVE_BEAT_PLAN_LIMITS.maxFieldChars },
      endCondition: { type: 'string', maxLength: NARRATIVE_BEAT_PLAN_LIMITS.maxFieldChars },
      avoidRepeats: {
        type: 'array',
        maxItems: NARRATIVE_BEAT_PLAN_LIMITS.maxAvoidRepeats,
        items: { type: 'string', maxLength: NARRATIVE_BEAT_PLAN_LIMITS.maxFieldChars }
      },
      targetChars: { type: 'integer', minimum: 0 }
    }
  }
}

export default {
  NARRATIVE_BEAT_PLAN_TOOL,
  narrativeBeatPlanRevision,
  narrativeBeatPlanToolSchema,
  normalizeNarrativeBeatPlan,
  validateNarrativeBeatPlanInput
}
