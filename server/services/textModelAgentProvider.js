import { buildOpenClawUserMessage } from './openclawService.js'
import { forwardComplete } from './kitModelGateway.js'
import { MODEL_ROUTING_ERROR_MESSAGE, resolveModelRouting } from './modelRouting.js'
import { resolveModelRoundGuard } from '../../shared/modelLoopGuard.js'
export const TEXT_MODEL_PROVIDER = Object.freeze({
  id: 'text-model',
  capabilities: ['text'],
  timeoutMs: 45000
})

function responseError(parsed) {
  let code = 'AGENT_PROVIDER_EMPTY_CONTENT'
  let message = 'text-model provider 返回空内容'
  if (parsed.refused) {
    code = 'AGENT_PROVIDER_REFUSAL'
    message = '上游模型拒绝返回改写内容'
  } else if (parsed.truncated) {
    code = 'AGENT_PROVIDER_OUTPUT_TRUNCATED'
    message = '上游模型在返回完整改写前达到输出上限'
  } else if (parsed.hasReasoning) {
    code = 'AGENT_PROVIDER_REASONING_ONLY'
    message = '上游模型只返回了思考过程，没有返回最终改写'
  }
  const error = new Error(message)
  error.code = code
  error.retryable = !parsed.refused
  return error
}

/** 统一模型路由（2026-10-08 直连退役）：文本改写一律经内核 pi-agent 任务面，
 *  请求体里的 providerConfig（baseUrl/apiKey）不再决定通路；内核不可达按配置无效报错（合同不变）。 */
export async function runTextModelAgent(envelope, question, taskMeta = {}) {
  const routing = await resolveModelRouting()
  if (routing.mode === 'none') {
    const error = new Error(MODEL_ROUTING_ERROR_MESSAGE)
    error.code = 'AGENT_PROVIDER_CONFIG_INVALID'
    error.retryable = false
    throw error
  }
  return runTextModelAgentViaKit(envelope, question, taskMeta)
}

async function runTextModelAgentViaKit(envelope, question, taskMeta = {}) {
  const prompt = buildOpenClawUserMessage(envelope, question, taskMeta)
  // 2026-10-09 预算完全废弃：不发 max_tokens（思考型端点的计量与正文不同，写死会把正文饿死），
  // 单次请求的失控护栏只剩模型调用轮数闸。
  const roundGuard = resolveModelRoundGuard(taskMeta.roundGuard, 'advisor')
  // 作者显式指定的取样档贯穿整个请求（含格式修复轮），未指定时沿用缺省曲线。
  const declaredTemperature = Number(taskMeta?.options?.temperatureOverride)
  const overrideTemperature = Number.isFinite(declaredTemperature) && declaredTemperature >= 0 && declaredTemperature <= 2
    ? declaredTemperature
    : null
  let lastError = null
  for (let attempt = 0; ; attempt += 1) {
    roundGuard.acquire('advisor')
    const repairInstruction = attempt === 0 ? '' : '\n\n上一次响应没有可用的最终结果。请跳过思考过程，仅返回符合上述协议的完整 JSON。'
    try {
      const result = await forwardComplete({
        messages: [{ role: 'user', content: prompt + repairInstruction }],
        temperature: overrideTemperature ?? (attempt === 0 ? 0.4 : 0.2),
        timeoutMs: attempt === 0 ? TEXT_MODEL_PROVIDER.timeoutMs : 30000
      })
      const content = String(result.content || '').trim()
      if (content && result.finishReason !== 'length') return content
      lastError = responseError({ truncated: result.finishReason === 'length', refused: false, hasReasoning: false })
      console.warn('[Advisor] kit funnel unusable response:', { model: result.model, attempt: attempt + 1, code: lastError.code })
      if (!lastError.retryable) throw lastError
    } catch (error) {
      if (error?.code === 'MODEL_ROUND_LIMIT_EXCEEDED') throw error
      if (error?.code === 'AGENT_PROVIDER_EMPTY_CONTENT' || error?.code === 'AGENT_PROVIDER_REFUSAL' || error?.code === 'AGENT_PROVIDER_OUTPUT_TRUNCATED') throw error
      lastError = Object.assign(new Error(`kit funnel 请求失败：${error?.message || error}`), { code: 'AGENT_PROVIDER_UPSTREAM_FAILED', retryable: attempt === 0 })
    }
    if (!lastError.retryable) throw lastError
  }
}
