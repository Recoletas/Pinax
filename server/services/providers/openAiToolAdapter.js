import {
  GENERATION_AGENT_TURN_SCHEMA_VERSION,
  normalizeGenerationUsage,
  validateGenerationToolCall
} from '../../../shared/generationToolContract.js'
import { NARRATIVE_TOOL_LIMITS } from '../../../shared/narrativeAgentContract.js'

function text(value) {
  return String(value ?? '').trim()
}

function protocolError(code, message) {
  const error = new Error(message)
  error.code = code
  error.retryable = false
  throw error
}

function openAiMessage(message) {
  if (message.role === 'assistant' && message.toolCalls?.length) {
    return {
      role: 'assistant',
      content: message.content || null,
      tool_calls: message.toolCalls.map((call) => ({
        id: call.id,
        type: 'function',
        function: {
          name: call.name,
          arguments: JSON.stringify(call.arguments)
        }
      }))
    }
  }
  if (message.role === 'tool') {
    return {
      role: 'tool',
      tool_call_id: message.toolCallId,
      content: message.content
    }
  }
  return { role: message.role, content: message.content }
}

export function buildOpenAIToolRequest(request) {
  return {
    model: request.provider.model,
    messages: request.messages.map(openAiMessage),
    tools: request.tools.map((tool) => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.inputSchema
      }
    })),
    tool_choice: 'auto',
    parallel_tool_calls: request.options?.parallelToolCalls !== false,
    max_tokens: request.options?.maxTokens || 1200,
    temperature: request.options?.temperature ?? 0.2
  }
}

function extractText(content) {
  if (typeof content === 'string') return content.trim()
  if (content && typeof content === 'object' && !Array.isArray(content)) {
    return text(content.text || content.output_text)
  }
  if (!Array.isArray(content)) return ''
  return content
    .filter((part) => part?.type === 'text' || typeof part?.text === 'string')
    .map((part) => text(part?.text))
    .filter(Boolean)
    .join('\n')
}

function extractAlternateText(message, data) {
  const values = [
    message?.output_text,
    data?.output_text,
    message?.text,
    data?.text,
    data?.choices?.[0]?.text
  ]
  return values
    .filter((value) => typeof value === 'string')
    .map((value) => value.trim())
    .filter(Boolean)
    .join('\n')
}

export function parseOpenAIToolResponse(data, meta = {}) {
  const choice = data?.choices?.[0]
  const message = choice?.message || {}
  const rawCalls = Array.isArray(message?.tool_calls) ? message.tool_calls : []
  if (rawCalls.length > NARRATIVE_TOOL_LIMITS.maxCallsPerRound) {
    protocolError(
      'NARRATIVE_PROVIDER_TOOL_CALLS_TOO_MANY',
      `OpenAI-compatible 单轮工具调用不能超过 ${NARRATIVE_TOOL_LIMITS.maxCallsPerRound} 个`
    )
  }
  const calls = []
  const callIds = new Set()
  for (const rawCall of rawCalls) {
    const rawCallId = text(rawCall?.id)
    if (!rawCallId || callIds.has(rawCallId)) {
      protocolError(
        'NARRATIVE_PROVIDER_TOOL_CALL_ID_INVALID',
        'OpenAI-compatible 返回了缺失或重复的工具调用 ID'
      )
    }
    const validation = validateGenerationToolCall({
      id: rawCallId,
      name: rawCall?.function?.name,
      arguments: rawCall?.function?.arguments
    })
    if (!validation.valid) {
      protocolError(
        'NARRATIVE_PROVIDER_TOOL_CALL_INVALID',
        `OpenAI-compatible 返回非法工具调用：${validation.error.code}`
      )
    }
    callIds.add(rawCallId)
    calls.push(validation.call)
  }
  const responseText = extractText(message?.content) || extractAlternateText(message, data)
  const finishReason = text(choice?.finish_reason)
  if (calls.length === 0 && finishReason === 'tool_calls') {
    protocolError('NARRATIVE_PROVIDER_TOOL_CALL_MISSING', '上游声明 tool_calls 但没有返回有效调用')
  }
  const hasReasoning = Boolean(
    text(message?.reasoning_content)
      || text(message?.reasoning)
      || text(choice?.reasoning_content)
      || text(data?.reasoning_content)
  )
  if (calls.length === 0 && !responseText && hasReasoning) {
    protocolError(
      'NARRATIVE_PROVIDER_REASONING_ONLY',
      '上游只返回了思考过程，没有返回工具调用或最终文本'
    )
  }
  if (calls.length === 0 && !responseText) {
    protocolError('NARRATIVE_PROVIDER_EMPTY_RESPONSE', '上游没有返回工具调用或最终文本')
  }
  return {
    schemaVersion: GENERATION_AGENT_TURN_SCHEMA_VERSION,
    requestId: text(meta.requestId),
    provider: text(meta.provider),
    model: text(meta.model || data?.model),
    kind: calls.length > 0 ? 'tool_calls' : 'final_ready',
    calls,
    text: responseText,
    finishReason: finishReason || (calls.length > 0 ? 'tool_calls' : 'stop'),
    usage: normalizeGenerationUsage(data?.usage)
  }
}

export default {
  buildOpenAIToolRequest,
  parseOpenAIToolResponse
}
