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

function assistantContent(message) {
  const content = []
  if (message.content) content.push({ type: 'text', text: message.content })
  for (const call of message.toolCalls || []) {
    content.push({
      type: 'tool_use',
      id: call.id,
      name: call.name,
      input: call.arguments
    })
  }
  return content
}

function anthropicMessages(messages = []) {
  const output = []
  for (const message of messages) {
    if (message.role === 'system') continue
    if (message.role === 'assistant') {
      output.push({
        role: 'assistant',
        content: message.toolCalls?.length
          ? assistantContent(message)
          : message.content
      })
      continue
    }
    if (message.role === 'tool') {
      const block = {
        type: 'tool_result',
        tool_use_id: message.toolCallId,
        content: message.content
      }
      const previous = output.at(-1)
      if (
        previous?.role === 'user'
        && Array.isArray(previous.content)
        && previous.content.every((item) => item?.type === 'tool_result')
      ) {
        previous.content.push(block)
      } else {
        output.push({ role: 'user', content: [block] })
      }
      continue
    }
    output.push({ role: 'user', content: message.content })
  }
  return output
}

export function buildAnthropicToolRequest(request) {
  const system = request.messages
    .filter((message) => message.role === 'system')
    .map((message) => message.content)
    .filter(Boolean)
    .join('\n\n')
  return {
    model: request.provider.model,
    max_tokens: request.options?.maxTokens || 1200,
    temperature: request.options?.temperature ?? 0.2,
    ...(system ? { system } : {}),
    messages: anthropicMessages(request.messages),
    tools: request.tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.inputSchema
    })),
    tool_choice: { type: 'auto' }
  }
}

export function parseAnthropicToolResponse(data, meta = {}) {
  const calls = []
  const callIds = new Set()
  const texts = []
  const toolBlocks = (Array.isArray(data?.content) ? data.content : [])
    .filter((block) => block?.type === 'tool_use')
  if (toolBlocks.length > NARRATIVE_TOOL_LIMITS.maxCallsPerRound) {
    protocolError(
      'NARRATIVE_PROVIDER_TOOL_CALLS_TOO_MANY',
      `Anthropic-compatible 单轮工具调用不能超过 ${NARRATIVE_TOOL_LIMITS.maxCallsPerRound} 个`
    )
  }
  for (const block of Array.isArray(data?.content) ? data.content : []) {
    if (block?.type === 'text' && text(block?.text)) {
      texts.push(text(block.text))
      continue
    }
    if (block?.type !== 'tool_use') continue
    const rawCallId = text(block?.id)
    if (!rawCallId || callIds.has(rawCallId)) {
      protocolError(
        'NARRATIVE_PROVIDER_TOOL_CALL_ID_INVALID',
        'Anthropic-compatible 返回了缺失或重复的工具调用 ID'
      )
    }
    const validation = validateGenerationToolCall({
      id: rawCallId,
      name: block?.name,
      arguments: block?.input
    })
    if (!validation.valid) {
      protocolError(
        'NARRATIVE_PROVIDER_TOOL_CALL_INVALID',
        `Anthropic-compatible 返回非法工具调用：${validation.error.code}`
      )
    }
    callIds.add(rawCallId)
    calls.push(validation.call)
  }
  const responseText = texts.join('\n')
  const finishReason = text(data?.stop_reason)
  if (calls.length === 0 && finishReason === 'tool_use') {
    protocolError('NARRATIVE_PROVIDER_TOOL_CALL_MISSING', '上游声明 tool_use 但没有返回有效调用')
  }
  const hasThinking = (Array.isArray(data?.content) ? data.content : [])
    .some((block) => ['thinking', 'redacted_thinking'].includes(block?.type))
  if (calls.length === 0 && !responseText && hasThinking) {
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
    finishReason: finishReason || (calls.length > 0 ? 'tool_use' : 'end_turn'),
    usage: normalizeGenerationUsage(data?.usage)
  }
}

export default {
  buildAnthropicToolRequest,
  parseAnthropicToolResponse
}
