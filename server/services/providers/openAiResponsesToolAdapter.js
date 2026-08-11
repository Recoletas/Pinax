import {
  NARRATIVE_TRANSCRIPT_SCHEMA_VERSION,
  normalizeNarrativeTranscript
} from '../../../shared/narrativeTranscriptContract.js'
import {
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

function collectText(item) {
  if (typeof item?.text === 'string') return item.text.trim()
  if (typeof item?.output_text === 'string') return item.output_text.trim()
  if (Array.isArray(item?.content)) {
    return item.content.map((part) => {
      if (typeof part === 'string') return part
      return part?.text || part?.output_text || ''
    }).filter(Boolean).join('\n').trim()
  }
  return ''
}

function inputItem(message) {
  const parts = []
  const items = []
  for (const part of message.parts || []) {
    if (part.type === 'text') parts.push({ type: 'input_text', text: part.text })
    if (part.type === 'refusal') parts.push({ type: 'input_text', text: part.text })
    if (part.type === 'tool-call') {
      items.push({
        type: 'function_call',
        call_id: part.toolCallId,
        name: part.toolName,
        arguments: JSON.stringify(part.input)
      })
    }
    if (part.type === 'tool-result') {
      items.push({
        type: 'function_call_output',
        call_id: part.toolCallId,
        output: JSON.stringify(part.output)
      })
    }
  }
  if (parts.length > 0) {
    items.unshift({ role: message.role === 'assistant' ? 'assistant' : 'user', content: parts })
  }
  return items
}

export function buildOpenAIResponsesRequest({ provider, transcript, tools = [], capabilities = {}, options = {} } = {}) {
  const normalized = normalizeNarrativeTranscript(transcript, { allowPendingToolCalls: true })
  if (!normalized.valid) {
    protocolError('NARRATIVE_TRANSCRIPT_INVALID', normalized.error.message)
  }
  const systemParts = normalized.transcript.messages
    .filter((message) => message.role === 'system')
    .flatMap((message) => message.parts)
    .filter((part) => part.type === 'text')
    .map((part) => part.text)
  const input = normalized.transcript.messages
    .filter((message) => message.role !== 'system')
    .flatMap((message) => inputItem(message))
  return {
    model: provider?.model,
    ...(systemParts.length ? { instructions: systemParts.join('\n\n') } : {}),
    input,
    tools: tools.map((tool) => ({
      type: 'function',
      name: tool.name,
      description: tool.description,
      parameters: tool.inputSchema,
      ...(capabilities.strictSchema ? { strict: true } : {})
    })),
    tool_choice: 'auto',
    ...(capabilities.parallelToolCalls ? { parallel_tool_calls: true } : {}),
    max_output_tokens: options.maxTokens || 1200,
    temperature: options.temperature ?? 0.2,
    store: false
  }
}

function parseArguments(value) {
  if (typeof value !== 'string') return value
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

export function parseOpenAIResponsesToolResponse(data, meta = {}) {
  const output = Array.isArray(data?.output) ? data.output : []
  const calls = []
  const callIds = new Set()
  const textParts = []
  const reasoningParts = []
  const parts = []
  let refusalDetected = false
  for (const item of output) {
    if (item?.type === 'message' || item?.type === 'output_text') {
      const value = collectText(item)
      if (value) {
        textParts.push(value)
        parts.push({ type: 'text', text: value })
      }
      continue
    }
    if (item?.type === 'refusal') {
      refusalDetected = true
      const value = collectText(item)
      if (value) {
        textParts.push(value)
        parts.push({ type: 'refusal', text: value })
      }
      continue
    }
    if (item?.type === 'reasoning') {
      const opaque = item.signature || item.encrypted_content || item.redacted_data
      reasoningParts.push({
        type: 'reasoning',
        text: '',
        ...(opaque ? { opaque: { encryptedContent: opaque } } : {})
      })
      parts.push(reasoningParts.at(-1))
      continue
    }
    if (item?.type !== 'function_call') continue
    const id = text(item.call_id || item.id)
    if (!id || callIds.has(id)) {
      protocolError('NARRATIVE_PROVIDER_TOOL_CALL_ID_INVALID', 'Responses 返回了缺失或重复的工具调用 ID')
    }
    const parsed = parseArguments(item.arguments)
    const validation = validateGenerationToolCall({
      id,
      name: item.name,
      arguments: parsed
    })
    if (!validation.valid) {
      protocolError('NARRATIVE_PROVIDER_TOOL_CALL_INVALID', `Responses 返回非法工具调用：${validation.error.code}`)
    }
    callIds.add(id)
    calls.push(validation.call)
    parts.push({ type: 'tool-call', toolCallId: id, toolName: validation.call.name, input: validation.call.arguments })
  }
  if (calls.length > NARRATIVE_TOOL_LIMITS.maxCallsPerRound) {
    protocolError('NARRATIVE_PROVIDER_TOOL_CALLS_TOO_MANY', 'Responses 单轮工具调用超过上限')
  }
  const finalText = textParts.concat(
    typeof data?.output_text === 'string' ? data.output_text : []
  ).join('\n').trim()
  const status = text(data?.status)
  const incompleteReason = text(data?.incomplete_details?.reason)
  if (refusalDetected) {
    protocolError('NARRATIVE_PROVIDER_REFUSAL', '上游拒绝生成叙事正文')
  }
  if (!calls.length && !finalText && incompleteReason === 'content_filter') {
    protocolError('NARRATIVE_PROVIDER_CONTENT_FILTER', '上游因内容安全策略拒绝返回正文')
  }
  if (!calls.length && !finalText && incompleteReason === 'max_output_tokens') {
    protocolError('NARRATIVE_PROVIDER_OUTPUT_TRUNCATED', '上游在返回正文前达到输出长度上限')
  }
  if (!calls.length && !finalText && status !== 'incomplete') {
    protocolError('NARRATIVE_PROVIDER_EMPTY_RESPONSE', 'Responses 没有返回工具调用或最终文本')
  }
  return {
    schemaVersion: NARRATIVE_TRANSCRIPT_SCHEMA_VERSION,
    requestId: text(meta.requestId),
    provider: text(meta.provider),
    model: text(meta.model || data?.model),
    kind: calls.length ? 'tool_calls' : 'final_ready',
    calls,
    text: finalText,
    parts,
    finishReason: calls.length ? 'tool_calls' : (status === 'incomplete' ? 'length' : 'stop'),
    usage: normalizeGenerationUsage(data?.usage)
  }
}

export default {
  buildOpenAIResponsesRequest,
  parseOpenAIResponsesToolResponse
}
