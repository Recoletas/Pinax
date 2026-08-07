import {
  resolveGenerationToolProtocol,
  validateGenerationAgentTurnRequest
} from '../../shared/generationToolContract.js'
import {
  buildOpenAIToolRequest,
  parseOpenAIToolResponse
} from './providers/openAiToolAdapter.js'
import {
  buildAnthropicToolRequest,
  parseAnthropicToolResponse
} from './providers/anthropicToolAdapter.js'
import {
  buildOpenAIResponsesRequest,
  parseOpenAIResponsesToolResponse
} from './providers/openAiResponsesToolAdapter.js'

function text(value) {
  return String(value ?? '').trim()
}

export class NarrativeProviderError extends Error {
  constructor(code, message, options = {}) {
    super(message)
    this.name = 'NarrativeProviderError'
    this.code = code
    this.status = Number(options.status || 0) || null
    this.retryable = Boolean(options.retryable)
  }
}

function appendProviderPath(baseUrl, protocol) {
  const normalized = text(baseUrl).replace(/\/+$/, '')
  if (protocol === 'openai-responses') {
    if (/\/responses$/i.test(normalized)) return normalized
    return `${normalized}/responses`
  }
  if (protocol === 'anthropic') {
    if (/\/messages$/i.test(normalized)) return normalized
    if (/\/v1$/i.test(normalized)) return `${normalized}/messages`
    if (/\/anthropic$/i.test(normalized)) return `${normalized}/v1/messages`
    if (/api\.anthropic\.com/i.test(normalized)) return `${normalized}/v1/messages`
    return `${normalized}/v1/messages`
  }
  if (/\/chat\/completions$/i.test(normalized)) return normalized
  return `${normalized}/chat/completions`
}

export function resolveToolCallingProvider(provider = {}) {
  const protocol = resolveGenerationToolProtocol(provider)
  const providerId = text(provider?.id || provider?.provider) || 'openai'
  if (protocol === 'unsupported') {
    throw new NarrativeProviderError(
      'NARRATIVE_PROVIDER_TOOLS_UNSUPPORTED',
      `${providerId} 暂不支持叙事工具调用`
    )
  }
  if (!['openai', 'openai-responses', 'anthropic'].includes(protocol)) {
    throw new NarrativeProviderError(
      'NARRATIVE_PROVIDER_PROTOCOL_UNSUPPORTED',
      `不支持的工具协议：${protocol || 'empty'}`
    )
  }
  return {
    id: providerId,
    protocol,
    url: appendProviderPath(provider?.baseUrl, protocol),
    capabilities: {
      toolCalls: true,
      parallelToolCalls: true,
      strictSchema: false,
      streamToolCalls: false,
      structuredOutput: false
    }
  }
}

function providerHeaders(request, resolved) {
  const apiKey = request.provider.apiKey
  if (resolved.protocol === 'anthropic') {
    const headers = {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    }
    if (/minimax/i.test(resolved.id) || /minimaxi?\.com/i.test(resolved.url)) {
      headers.Authorization = `Bearer ${apiKey}`
    }
    return headers
  }
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`
  }
}

function requestBody(request, protocol) {
  if (protocol === 'anthropic') return buildAnthropicToolRequest(request)
  if (protocol === 'openai-responses') {
    return buildOpenAIResponsesRequest({
      provider: request.provider,
      transcript: requestToTranscript(request),
      tools: request.tools,
      capabilities: {
        parallelToolCalls: request.options?.parallelToolCalls !== false,
        strictSchema: false
      },
      options: request.options
    })
  }
  return buildOpenAIToolRequest(request)
}

function parseJsonContent(content) {
  if (typeof content !== 'string') return content
  try {
    return JSON.parse(content)
  } catch {
    return content
  }
}

function requestToTranscript(request) {
  return {
    schemaVersion: 1,
    requestId: request.requestId,
    messages: request.messages.map((message, index) => {
      const parts = []
      if (message.content) {
        parts.push({ type: 'text', text: message.content })
      }
      if (message.role === 'assistant') {
        for (const call of message.toolCalls || []) {
          parts.push({
            type: 'tool-call',
            toolCallId: call.id,
            toolName: call.name,
            input: call.arguments
          })
        }
      }
      if (message.role === 'tool') {
        parts.push({
          type: 'tool-result',
          toolCallId: message.toolCallId,
          toolName: message.name,
          output: parseJsonContent(message.content)
        })
      }
      return {
        id: `${request.requestId}:message:${index}`,
        role: message.role,
        parts: parts.length ? parts : [{ type: 'text', text: '[empty]' }]
      }
    })
  }
}

function parseResponse(data, request, resolved) {
  const meta = {
    requestId: request.requestId,
    provider: request.provider.id,
    model: request.provider.model
  }
  if (resolved.protocol === 'anthropic') return parseAnthropicToolResponse(data, meta)
  if (resolved.protocol === 'openai-responses') return parseOpenAIResponsesToolResponse(data, meta)
  // Some OpenAI-compatible gateways expose /chat/completions while returning
  // Responses-shaped payloads. Parse the payload shape instead of reporting a
  // misleading empty response.
  if (Array.isArray(data?.output)) return parseOpenAIResponsesToolResponse(data, meta)
  return parseOpenAIToolResponse(data, meta)
}

function createAbortContext(externalSignal, timeoutMs) {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(new Error('timeout')), timeoutMs)
  const onAbort = () => controller.abort(externalSignal?.reason)
  if (externalSignal) {
    if (externalSignal.aborted) onAbort()
    else externalSignal.addEventListener('abort', onAbort, { once: true })
  }
  return {
    signal: controller.signal,
    cleanup() {
      clearTimeout(timeoutId)
      externalSignal?.removeEventListener?.('abort', onAbort)
    }
  }
}

export async function runToolCallingProviderTurn(rawRequest, options = {}) {
  const validation = validateGenerationAgentTurnRequest(rawRequest)
  if (!validation.valid) {
    throw new NarrativeProviderError(validation.error.code, validation.error.message)
  }
  const request = validation.request
  const resolved = resolveToolCallingProvider(request.provider)
  const fetchImpl = options.fetchImpl || globalThis.fetch
  if (typeof fetchImpl !== 'function') {
    throw new NarrativeProviderError('NARRATIVE_PROVIDER_FETCH_MISSING', '服务端 fetch 不可用')
  }
  const abort = createAbortContext(options.signal, request.options.timeoutMs)
  try {
    const response = await fetchImpl(resolved.url, {
      method: 'POST',
      headers: providerHeaders(request, resolved),
      body: JSON.stringify(requestBody(request, resolved.protocol)),
      signal: abort.signal
    })
    if (!response?.ok) {
      const status = Number(response?.status || 0)
      throw new NarrativeProviderError(
        'NARRATIVE_PROVIDER_UPSTREAM_FAILED',
        `工具模型请求失败（${status || 'network'}）`,
        {
          status,
          retryable: status === 408 || status === 429 || status >= 500
        }
      )
    }
    let data
    try {
      data = await response.json()
    } catch {
      throw new NarrativeProviderError(
        'NARRATIVE_PROVIDER_RESPONSE_INVALID',
        '工具模型返回了无法解析的 JSON'
      )
    }
    return {
      ...parseResponse(data, request, resolved),
      capabilities: resolved.capabilities
    }
  } catch (error) {
    if (error instanceof NarrativeProviderError) throw error
    if (text(error?.code).startsWith('NARRATIVE_PROVIDER_')) {
      throw new NarrativeProviderError(
        error.code,
        error.message || '工具模型返回了非法响应',
        {
          status: error.status,
          retryable: error.retryable
        }
      )
    }
    if (abort.signal.aborted) {
      const externallyAborted = Boolean(options.signal?.aborted)
      throw new NarrativeProviderError(
        externallyAborted ? 'NARRATIVE_PROVIDER_ABORTED' : 'NARRATIVE_PROVIDER_TIMEOUT',
        externallyAborted ? '叙事工具请求已取消' : '叙事工具请求超时',
        { retryable: !externallyAborted }
      )
    }
    throw new NarrativeProviderError(
      'NARRATIVE_PROVIDER_NETWORK_FAILED',
      '无法连接工具模型服务',
      { retryable: true }
    )
  } finally {
    abort.cleanup()
  }
}

export default {
  NarrativeProviderError,
  resolveToolCallingProvider,
  runToolCallingProviderTurn
}
