import { buildOpenClawUserMessage } from './openclawService.js'

export const TEXT_MODEL_PROVIDER = Object.freeze({
  id: 'text-model',
  capabilities: ['text'],
  timeoutMs: 45000
})

function extractText(data) {
  const content = data?.choices?.[0]?.message?.content
  if (typeof content === 'string') return content.trim()
  if (Array.isArray(content)) {
    return content.map((part) => part?.text || '').filter(Boolean).join('\n').trim()
  }
  if (Array.isArray(data?.content)) {
    return data.content.map((part) => part?.text || '').filter(Boolean).join('\n').trim()
  }
  return String(data?.output_text || '').trim()
}

function resolveConfig(taskMeta) {
  const config = taskMeta?.options?.providerConfig || {}
  const baseUrl = String(config.baseUrl || '').trim().replace(/\/+$/, '')
  const apiKey = String(config.apiKey || '').trim()
  const model = String(config.model || '').trim()
  const format = config.format === 'anthropic' ? 'anthropic' : 'openai'
  if (!/^https?:\/\//i.test(baseUrl) || !apiKey || !model) {
    const error = new Error('text-model provider 缺少有效的 baseUrl、apiKey 或 model')
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
  const body = anthropic
    ? {
        model: config.model,
        max_tokens: 1200,
        messages: [{ role: 'user', content: prompt }]
      }
    : {
        model: config.model,
        max_tokens: 1200,
        temperature: 0.4,
        messages: [{ role: 'user', content: prompt }]
      }

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TEXT_MODEL_PROVIDER.timeoutMs)
  })
  if (!response.ok) {
    const error = new Error(`text-model provider 请求失败（${response.status}）`)
    error.code = 'AGENT_PROVIDER_UPSTREAM_FAILED'
    error.retryable = response.status === 408 || response.status === 429 || response.status >= 500
    throw error
  }

  const content = extractText(await response.json())
  if (!content) {
    const error = new Error('text-model provider 返回空内容')
    error.code = 'AGENT_PROVIDER_EMPTY_CONTENT'
    error.retryable = true
    throw error
  }
  return content
}
