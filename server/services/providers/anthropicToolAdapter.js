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
  const parts = Array.isArray(message.parts) ? message.parts : []
  if (parts.length) {
    for (const part of parts) {
      if (part?.type === 'text' && text(part.text)) content.push({ type: 'text', text: part.text })
      if (part?.type === 'reasoning') {
        if (part.opaque?.signature) content.push({ type: 'thinking', thinking: '', signature: part.opaque.signature })
        else if (part.opaque?.redactedData) content.push({ type: 'redacted_thinking', data: part.opaque.redactedData })
      }
      if (part?.type === 'tool-call') content.push({
        type: 'tool_use', id: part.toolCallId, name: part.toolName, input: part.input
      })
    }
    return content
  }
  if (message.content) content.push({ type: 'text', text: message.content })
  for (const call of message.toolCalls || []) {
    content.push({ type: 'tool_use', id: call.id, name: call.name, input: call.arguments })
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
      const resultPart = message.parts?.find((part) => part?.type === 'tool-result')
      const block = {
        type: 'tool_result',
        tool_use_id: message.toolCallId,
        content: message.content || JSON.stringify(resultPart?.output || {}),
        ...(resultPart?.isError ? { is_error: true } : {})
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
  const capabilities = request.options?.capabilities
  const toolChoice = request.options?.toolChoice
  const body = {
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
    tool_choice: toolChoice === 'none'
      ? { type: 'none' }
      : toolChoice === 'required'
        ? { type: 'any' }
        : (toolChoice && typeof toolChoice === 'object' ? toolChoice : { type: 'auto' })
  }
  if ((capabilities && capabilities.parallelToolCalls === false)
    || request.options?.parallelToolCalls === false) {
    body.tool_choice = { ...body.tool_choice, disable_parallel_tool_use: true }
  }
  if (toolChoice === 'none') {
    delete body.tools
    delete body.tool_choice
  }
  if (request.options?.thinking) {
    const thinking = typeof request.options.thinking === 'object' ? request.options.thinking : {}
    body.thinking = {
      type: 'enabled',
      budget_tokens: Math.max(256, Number(thinking.budget_tokens || thinking.budgetTokens || 1024))
    }
  }
  return body
}

export function parseAnthropicToolResponse(data, meta = {}) {
  const calls = []
  const callIds = new Set()
  const texts = []
  const parts = []
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
      parts.push({ type: 'text', text: text(block.text) })
      continue
    }
    if (block?.type === 'thinking' || block?.type === 'redacted_thinking') {
      parts.push({
        type: 'reasoning',
        text: '',
        ...(block.type === 'thinking' && block.signature ? { opaque: { signature: block.signature } } : {}),
        ...(block.type === 'redacted_thinking' && block.data ? { opaque: { redactedData: block.data } } : {})
      })
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
      // P6：透传底层校验码（如 NARRATIVE_BEAT_PLAN_*），让客户端修复循环能给出定向提示
      protocolError(
        validation.error.code || 'NARRATIVE_PROVIDER_TOOL_CALL_INVALID',
        `Anthropic-compatible 返回非法工具调用：${validation.error.code}`
      )
    }
    callIds.add(rawCallId)
    calls.push(validation.call)
    parts.push({
      type: 'tool-call',
      toolCallId: validation.call.id,
      toolName: validation.call.name,
      input: validation.call.arguments
    })
  }
  const responseText = texts.join('\n')
  const finishReason = text(data?.stop_reason)
  if (finishReason === 'refusal') {
    protocolError('NARRATIVE_PROVIDER_REFUSAL', '上游拒绝生成叙事正文')
  }
  if (!calls.length && !responseText && finishReason === 'max_tokens') {
    protocolError('NARRATIVE_PROVIDER_OUTPUT_TRUNCATED', '上游在返回正文前达到输出长度上限')
  }
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
    parts,
    finishReason: finishReason || (calls.length > 0 ? 'tool_use' : 'end_turn'),
    usage: normalizeGenerationUsage(data?.usage)
  }
}

export default {
  buildAnthropicToolRequest,
  parseAnthropicToolResponse
}
