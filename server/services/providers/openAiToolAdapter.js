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
  const parts = Array.isArray(message.parts) ? message.parts : []
  const partText = parts
    .filter((part) => part?.type === 'text' || part?.type === 'refusal')
    .map((part) => text(part.text))
    .filter(Boolean)
    .join('\n')
  const partCalls = parts
    .filter((part) => part?.type === 'tool-call')
    .map((part) => ({ id: part.toolCallId, name: part.toolName, arguments: part.input }))
  const toolCalls = message.toolCalls?.length ? message.toolCalls : partCalls
  if (message.role === 'assistant' && message.toolCalls?.length) {
    return {
      role: 'assistant',
      content: message.content || partText || null,
      tool_calls: toolCalls.map((call) => ({
        id: call.id,
        type: 'function',
        function: {
          name: call.name,
          arguments: JSON.stringify(call.arguments)
        }
      }))
    }
  }
  if (message.role === 'assistant' && toolCalls.length) {
    return {
      role: 'assistant',
      content: message.content || partText || null,
      tool_calls: toolCalls.map((call) => ({
        id: call.id,
        type: 'function',
        function: { name: call.name, arguments: JSON.stringify(call.arguments) }
      }))
    }
  }
  if (message.role === 'tool') {
    return {
      role: 'tool',
      tool_call_id: message.toolCallId,
      content: message.content || JSON.stringify(message.parts?.find((part) => part?.type === 'tool-result')?.output || {})
    }
  }
  return { role: message.role, content: message.content || partText }
}

export function buildOpenAIToolRequest(request) {
  const capabilities = request.options?.capabilities
  const parallelToolCalls = capabilities
    ? capabilities.parallelToolCalls === true
    : request.options?.parallelToolCalls !== false
  return {
    model: request.provider.model,
    messages: request.messages.map(openAiMessage),
    tools: request.tools.map((tool) => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.inputSchema,
        ...(capabilities?.strictSchema === true ? { strict: true } : {})
      }
    })),
    tool_choice: request.options?.toolChoice || 'auto',
    ...(parallelToolCalls ? { parallel_tool_calls: true } : {}),
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
        validation.error.code || 'NARRATIVE_PROVIDER_TOOL_CALL_INVALID',
        `OpenAI-compatible 返回非法工具调用：${validation.error.code}`
      )
    }
    callIds.add(rawCallId)
    calls.push(validation.call)
  }
  const responseText = extractText(message?.content) || extractAlternateText(message, data)
  const finishReason = text(choice?.finish_reason)
  const refusal = text(message?.refusal || choice?.refusal)
  if (!calls.length && refusal) {
    protocolError('NARRATIVE_PROVIDER_REFUSAL', refusal.slice(0, 240))
  }
  if (!calls.length && !responseText && finishReason === 'content_filter') {
    protocolError('NARRATIVE_PROVIDER_CONTENT_FILTER', '上游因内容安全策略拒绝返回正文')
  }
  if (!calls.length && !responseText && finishReason === 'length') {
    protocolError('NARRATIVE_PROVIDER_OUTPUT_TRUNCATED', '上游在返回正文前达到输出长度上限')
  }
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
    parts: [
      ...(responseText ? [{ type: 'text', text: responseText }] : []),
      ...(hasReasoning ? [{ type: 'reasoning', text: '' }] : []),
      ...calls.map((call) => ({
        type: 'tool-call',
        toolCallId: call.id,
        toolName: call.name,
        input: call.arguments
      }))
    ],
    finishReason: finishReason || (calls.length > 0 ? 'tool_calls' : 'stop'),
    usage: normalizeGenerationUsage(data?.usage)
  }
}

export default {
  buildOpenAIToolRequest,
  parseOpenAIToolResponse
}
