import { buildOpenClawUserMessage } from './openclawService.js'
import { resolveTextApiKey } from '../../shared/textModelKeys.js'

export const TEXT_MODEL_PROVIDER = Object.freeze({
  id: 'text-model',
  capabilities: ['text'],
  timeoutMs: 45000
})

function text(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function extractTextContent(value) {
  if (typeof value === 'string') return value.trim()
  if (Array.isArray(value)) {
    return value
      .map((part) => {
        if (typeof part === 'string') return part.trim()
        if (!part || typeof part !== 'object') return ''
        if (['thinking', 'reasoning', 'redacted_thinking'].includes(part.type)) return ''
        return extractTextContent(part.text ?? part.output_text ?? part.content)
      })
      .filter(Boolean)
      .join('\n')
      .trim()
  }
  if (!value || typeof value !== 'object') return ''
  return extractTextContent(value.text ?? value.output_text ?? value.content)
}

function hasReasoningContent(data) {
  const choice = data?.choices?.[0]
  const message = choice?.message
  if ([
    message?.reasoning_content,
    message?.reasoning,
    choice?.reasoning_content,
    data?.reasoning_content,
    data?.reasoning
  ].some((value) => text(value))) return true
  return (Array.isArray(data?.content) ? data.content : [])
    .some((part) => ['thinking', 'reasoning', 'redacted_thinking'].includes(part?.type))
}

export function parseTextModelResponse(data, format = 'openai') {
  const choice = data?.choices?.[0]
  const message = choice?.message
  const candidates = [
    message?.content,
    message?.output_text,
    data?.message?.content,
    data?.content,
    data?.output_text,
    data?.output,
    choice?.text,
    data?.text
  ]
  const content = candidates
    .map(extractTextContent)
    .find(Boolean) || ''
  const finishReason = text(format === 'anthropic' ? data?.stop_reason : choice?.finish_reason)
  return {
    content,
    finishReason,
    hasReasoning: hasReasoningContent(data),
    truncated: ['length', 'max_tokens'].includes(finishReason),
    refused: Boolean(text(message?.refusal || choice?.refusal))
      || ['refusal', 'content_filter'].includes(finishReason)
  }
}

export function resolveTextModelMaxTokens(taskMeta = {}) {
  const taskType = String(taskMeta?.taskType || '')
  const options = taskMeta?.options || {}
  const candidateCount = Math.max(1, Math.min(3, Math.floor(Number(options.candidateCount) || 1)))
  if (taskType.startsWith('writing.fix.') && candidateCount > 1) {
    return Math.min(3600, 1800 + (candidateCount * 400))
  }
  if (taskType === 'writing.chapter.health' || options.chapterReview) return 2800
  return 1800
}

function isDeepSeekModel(config = {}) {
  return /deepseek/i.test(String(config.baseUrl || ''))
    || /deepseek/i.test(String(config.model || ''))
}

export function buildTextModelRequestBody(config, prompt, taskMeta = {}, attempt = 0) {
  const anthropic = config.format === 'anthropic'
  const deepSeek = isDeepSeekModel(config)
  const maxTokens = resolveTextModelMaxTokens(taskMeta)
  const repairInstruction = attempt === 0
    ? ''
    : '\n\n上一次响应没有可用的最终结果。请跳过思考过程，仅返回符合上述协议的完整 JSON。'
  const body = {
    model: config.model,
    max_tokens: Math.min(4096, maxTokens + (attempt * 600)),
    messages: [{ role: 'user', content: prompt + repairInstruction }]
  }
  if (!anthropic) {
    body.temperature = attempt === 0 ? 0.4 : 0.2
    if (deepSeek) body.response_format = { type: 'json_object' }
  }
  // DeepSeek V4 默认开启 thinking；约束改写任务只需要最终 JSON。
  if (deepSeek) body.thinking = { type: 'disabled' }
  return body
}

function responseShape(data, parsed) {
  const choice = data?.choices?.[0]
  return {
    keys: Object.keys(data || {}).slice(0, 12),
    choiceKeys: Object.keys(choice || {}).slice(0, 12),
    messageKeys: Object.keys(choice?.message || {}).slice(0, 12),
    finishReason: parsed.finishReason || null,
    hasReasoning: parsed.hasReasoning,
    truncated: parsed.truncated
  }
}

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

function resolveConfig(taskMeta) {
  const config = taskMeta?.options?.providerConfig || {}
  const baseUrl = String(config.baseUrl || '').trim().replace(/\/+$/, '')
  const providerId = String(config.provider || config.id || '').trim()
  const apiKey = resolveTextApiKey({ provider: providerId, baseUrl, apiKey: config.apiKey })
  const model = String(config.model || '').trim()
  const format = config.format === 'anthropic' ? 'anthropic' : 'openai'
  if (!/^https?:\/\//i.test(baseUrl) || !apiKey || !model) {
    const isMiniMax = /minimax/i.test(providerId) || /minimaxi?\.com/i.test(baseUrl)
    const error = new Error(isMiniMax
      ? '服务器未配置 MINIMAX_API_KEY，内置 MiniMax 暂不可用。请在服务器 .env 中填写后重启。'
      : 'text-model provider 缺少有效的 baseUrl、apiKey 或 model')
    error.code = 'AGENT_PROVIDER_CONFIG_INVALID'
    error.retryable = false
    throw error
  }
  return { baseUrl, apiKey, model, format }
}

export async function runTextModelAgent(envelope, question, taskMeta = {}) {
  const config = resolveConfig(taskMeta)
  const prompt = buildOpenClawUserMessage(envelope, question, taskMeta)
  const anthropic = config.format === 'anthropic'
  const url = `${config.baseUrl}${anthropic ? '/messages' : '/chat/completions'}`
  const headers = {
    'Content-Type': 'application/json',
    ...(anthropic
      ? { 'x-api-key': config.apiKey, 'anthropic-version': '2023-06-01' }
      : { Authorization: `Bearer ${config.apiKey}` })
  }
  // MiniMax 的 Anthropic 兼容端点用 Bearer 而不是 x-api-key
  if (anthropic && /minimaxi?\.com/i.test(url)) {
    delete headers['x-api-key']
    headers['Authorization'] = `Bearer ${config.apiKey}`
  }
  let lastError = null
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const body = buildTextModelRequestBody(config, prompt, taskMeta, attempt)

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(attempt === 0 ? TEXT_MODEL_PROVIDER.timeoutMs : 30000)
    })
    if (!response.ok) {
      const error = new Error(`text-model provider 请求失败（${response.status}）`)
      error.code = 'AGENT_PROVIDER_UPSTREAM_FAILED'
      error.retryable = response.status === 408 || response.status === 429 || response.status >= 500
      throw error
    }

    const data = await response.json()
    const parsed = parseTextModelResponse(data, config.format)
    if (parsed.content && !parsed.truncated) return parsed.content

    lastError = responseError(parsed)
    console.warn('[Advisor] unusable text-model response:', {
      provider: 'text-model',
      model: config.model,
      attempt: attempt + 1,
      code: lastError.code,
      ...responseShape(data, parsed)
    })
    if (!lastError.retryable) throw lastError
  }
  throw lastError
}
