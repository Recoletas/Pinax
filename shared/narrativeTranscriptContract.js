import {
  GENERATION_TOOL_NAMES,
  validateGenerationToolCall
} from './generationToolContract.js'

export const NARRATIVE_TRANSCRIPT_SCHEMA_VERSION = 1

export const NARRATIVE_TRANSCRIPT_LIMITS = Object.freeze({
  maxMessages: 32,
  maxPartsPerMessage: 12,
  maxPartChars: 8000,
  maxTotalChars: 32000,
  maxOpaqueChars: 3000,
  maxOpaqueKeys: 8
})

const PART_TYPES = new Set(['text', 'reasoning', 'refusal', 'tool-call', 'tool-result'])
const OPAQUE_KEYS = new Set([
  'signature',
  'redactedData',
  'encryptedContent',
  'reasoningContent'
])

function text(value) {
  return typeof value === 'string' ? value.trim() : String(value ?? '').trim()
}

function error(code, message, details = {}) {
  return { valid: false, error: { code, message, ...details } }
}

function cloneJson(value, maxChars = NARRATIVE_TRANSCRIPT_LIMITS.maxPartChars) {
  let serialized
  try {
    serialized = JSON.stringify(value)
  } catch {
    return null
  }
  if (serialized == null || serialized.length > maxChars) return null
  try {
    return JSON.parse(serialized)
  } catch {
    return null
  }
}

function normalizeOpaque(raw) {
  if (raw == null) return undefined
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const keys = Object.keys(raw).filter((key) => OPAQUE_KEYS.has(key)).slice(0, NARRATIVE_TRANSCRIPT_LIMITS.maxOpaqueKeys)
  const output = {}
  for (const key of keys) {
    const value = cloneJson(raw[key], NARRATIVE_TRANSCRIPT_LIMITS.maxOpaqueChars)
    if (value == null) return null
    output[key] = value
  }
  if (JSON.stringify(output).length > NARRATIVE_TRANSCRIPT_LIMITS.maxOpaqueChars) return null
  return Object.keys(output).length > 0 ? output : undefined
}

function normalizeToolCall(raw, location) {
  const toolCallId = text(raw?.toolCallId || raw?.id)
  const toolName = text(raw?.toolName || raw?.name)
  if (!toolCallId || !toolName) {
    return error('NARRATIVE_TRANSCRIPT_TOOL_CALL_INVALID', `${location} 缺少 toolCallId/toolName`)
  }
  if (!GENERATION_TOOL_NAMES.includes(toolName)) {
    return error('NARRATIVE_TRANSCRIPT_TOOL_UNKNOWN', `${location} 使用了未知工具：${toolName}`)
  }
  const validation = validateGenerationToolCall({
    id: toolCallId,
    name: toolName,
    arguments: raw?.input
  })
  if (!validation.valid) {
    return error('NARRATIVE_TRANSCRIPT_TOOL_INPUT_INVALID', `${location} 参数无效：${validation.error.code}`, {
      cause: validation.error.code
    })
  }
  return {
    valid: true,
    part: {
      type: 'tool-call',
      toolCallId,
      toolName,
      input: validation.call.arguments
    }
  }
}

function normalizeToolResult(raw, location) {
  const toolCallId = text(raw?.toolCallId || raw?.id)
  const toolName = text(raw?.toolName || raw?.name)
  if (!toolCallId || !toolName) {
    return error('NARRATIVE_TRANSCRIPT_TOOL_RESULT_INVALID', `${location} 缺少 toolCallId/toolName`)
  }
  if (!GENERATION_TOOL_NAMES.includes(toolName)) {
    return error('NARRATIVE_TRANSCRIPT_TOOL_UNKNOWN', `${location} 使用了未知工具：${toolName}`)
  }
  const output = cloneJson(raw?.output)
  if (output == null) {
    return error('NARRATIVE_TRANSCRIPT_TOOL_RESULT_INVALID', `${location}.output 不是可序列化的有限对象`)
  }
  return {
    valid: true,
    part: {
      type: 'tool-result',
      toolCallId,
      toolName,
      output,
      isError: raw?.isError === true
    }
  }
}

function normalizePart(raw, location, options) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return error('NARRATIVE_TRANSCRIPT_PART_INVALID', `${location} 必须是对象`)
  }
  const type = text(raw.type)
  if (!PART_TYPES.has(type)) {
    return error('NARRATIVE_TRANSCRIPT_PART_TYPE_INVALID', `${location}.type 不受支持`)
  }
  if (type === 'tool-call') return normalizeToolCall(raw, location)
  if (type === 'tool-result') return normalizeToolResult(raw, location)

  const value = text(raw.text)
  if (value.length > NARRATIVE_TRANSCRIPT_LIMITS.maxPartChars) {
    return error('NARRATIVE_TRANSCRIPT_PART_TOO_LONG', `${location}.text 超过长度上限`)
  }
  if (type !== 'reasoning' && !value) {
    return error('NARRATIVE_TRANSCRIPT_PART_EMPTY', `${location}.text 不能为空`)
  }
  if (type === 'reasoning') {
    const opaque = normalizeOpaque(raw.opaque)
    if (raw.opaque != null && opaque == null) {
      return error('NARRATIVE_TRANSCRIPT_OPAQUE_INVALID', `${location}.opaque 含有不允许或超长字段`)
    }
    return {
      valid: true,
      part: {
        type,
        text: options.preserveReasoningText === true ? value : '',
        ...(opaque ? { opaque } : {})
      }
    }
  }
  return { valid: true, part: { type, text: value } }
}

function normalizeMessage(raw, index, options) {
  const location = `messages[${index}]`
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return error('NARRATIVE_TRANSCRIPT_MESSAGE_INVALID', `${location} 必须是对象`)
  }
  const id = text(raw.id)
  const role = text(raw.role).toLowerCase()
  if (!id) return error('NARRATIVE_TRANSCRIPT_MESSAGE_ID_REQUIRED', `${location}.id 不能为空`)
  if (!['system', 'user', 'assistant', 'tool'].includes(role)) {
    return error('NARRATIVE_TRANSCRIPT_MESSAGE_ROLE_INVALID', `${location}.role 非法`)
  }
  if (!Array.isArray(raw.parts) || raw.parts.length === 0) {
    return error('NARRATIVE_TRANSCRIPT_PARTS_REQUIRED', `${location}.parts 不能为空`)
  }
  if (raw.parts.length > NARRATIVE_TRANSCRIPT_LIMITS.maxPartsPerMessage) {
    return error('NARRATIVE_TRANSCRIPT_PARTS_TOO_MANY', `${location}.parts 超过数量上限`)
  }
  const parts = []
  let chars = 0
  for (let partIndex = 0; partIndex < raw.parts.length; partIndex += 1) {
    const normalized = normalizePart(raw.parts[partIndex], `${location}.parts[${partIndex}]`, options)
    if (!normalized.valid) return normalized
    chars += normalized.part.text?.length || JSON.stringify(normalized.part).length
    parts.push(normalized.part)
  }
  if (chars > NARRATIVE_TRANSCRIPT_LIMITS.maxPartChars * 2) {
    return error('NARRATIVE_TRANSCRIPT_MESSAGE_TOO_LONG', `${location} 超过消息长度上限`)
  }
  const providerMetadata = normalizeOpaque(raw.providerMetadata)
  if (raw.providerMetadata != null && providerMetadata == null) {
    return error('NARRATIVE_TRANSCRIPT_METADATA_INVALID', `${location}.providerMetadata 无效`)
  }
  return {
    valid: true,
    message: {
      id,
      role,
      parts,
      ...(providerMetadata ? { providerMetadata } : {})
    }
  }
}

function validateToolOrdering(messages, allowPendingToolCalls) {
  const pending = new Map()
  const messageIds = new Set()
  for (const message of messages) {
    if (messageIds.has(message.id)) {
      return error('NARRATIVE_TRANSCRIPT_MESSAGE_ID_DUPLICATED', `消息 ID 重复：${message.id}`)
    }
    messageIds.add(message.id)
    if (message.role === 'assistant' && pending.size > 0) {
      return error('NARRATIVE_TRANSCRIPT_TOOL_RESULT_MISSING', '新的 assistant 消息出现前仍有未回传的工具结果')
    }
    for (const part of message.parts) {
      if (part.type === 'tool-call') {
        if (pending.has(part.toolCallId)) {
          return error('NARRATIVE_TRANSCRIPT_TOOL_CALL_ID_DUPLICATED', `工具调用 ID 重复：${part.toolCallId}`)
        }
        pending.set(part.toolCallId, part)
      }
      if (part.type === 'tool-result') {
        const call = pending.get(part.toolCallId)
        if (!call) {
          return error('NARRATIVE_TRANSCRIPT_TOOL_RESULT_ORPHANED', `工具结果没有对应调用：${part.toolCallId}`)
        }
        if (call.toolName !== part.toolName) {
          return error('NARRATIVE_TRANSCRIPT_TOOL_RESULT_MISMATCH', `工具结果与调用名称不一致：${part.toolCallId}`)
        }
        pending.delete(part.toolCallId)
      }
    }
  }
  if (!allowPendingToolCalls && pending.size > 0) {
    return error('NARRATIVE_TRANSCRIPT_TOOL_RESULT_MISSING', `仍有 ${pending.size} 个工具调用没有结果`)
  }
  return { valid: true, pendingToolCallIds: [...pending.keys()] }
}

export function normalizeNarrativeTranscript(raw = {}, options = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return error('NARRATIVE_TRANSCRIPT_INVALID', 'transcript 必须是对象')
  }
  if (raw.schemaVersion != null && Number(raw.schemaVersion) !== NARRATIVE_TRANSCRIPT_SCHEMA_VERSION) {
    return error('NARRATIVE_TRANSCRIPT_SCHEMA_UNSUPPORTED', '不支持的 transcript schemaVersion')
  }
  if (!Array.isArray(raw.messages)) {
    return error('NARRATIVE_TRANSCRIPT_MESSAGES_REQUIRED', 'transcript.messages 必须是数组')
  }
  if (raw.messages.length > NARRATIVE_TRANSCRIPT_LIMITS.maxMessages) {
    return error('NARRATIVE_TRANSCRIPT_MESSAGES_TOO_MANY', 'transcript.messages 超过数量上限')
  }
  const messages = []
  let totalChars = 0
  for (let index = 0; index < raw.messages.length; index += 1) {
    const normalized = normalizeMessage(raw.messages[index], index, options)
    if (!normalized.valid) return normalized
    totalChars += JSON.stringify(normalized.message).length
    messages.push(normalized.message)
  }
  if (totalChars > NARRATIVE_TRANSCRIPT_LIMITS.maxTotalChars) {
    return error('NARRATIVE_TRANSCRIPT_TOO_LONG', 'transcript 总长度超过上限')
  }
  const ordering = validateToolOrdering(messages, options.allowPendingToolCalls === true)
  if (!ordering.valid) return ordering
  return {
    valid: true,
    transcript: {
      schemaVersion: NARRATIVE_TRANSCRIPT_SCHEMA_VERSION,
      requestId: text(raw.requestId),
      messages,
      pendingToolCallIds: ordering.pendingToolCallIds
    }
  }
}

export function createNarrativeTranscript({ requestId = '', messages = [] } = {}) {
  const result = normalizeNarrativeTranscript({
    schemaVersion: NARRATIVE_TRANSCRIPT_SCHEMA_VERSION,
    requestId,
    messages
  }, { allowPendingToolCalls: true })
  if (!result.valid) throw new Error(result.error.message)
  return result.transcript
}

export function appendNarrativeTranscriptMessage(transcript, message, options = {}) {
  const current = transcript && typeof transcript === 'object' ? transcript : {}
  return normalizeNarrativeTranscript({
    schemaVersion: NARRATIVE_TRANSCRIPT_SCHEMA_VERSION,
    requestId: current.requestId,
    messages: [...(current.messages || []), message]
  }, { allowPendingToolCalls: options.allowPendingToolCalls === true })
}

export function serializeNarrativeTranscript(transcript) {
  const normalized = normalizeNarrativeTranscript(transcript, { allowPendingToolCalls: true })
  if (!normalized.valid) return normalized
  return {
    valid: true,
    serialized: JSON.stringify({
      schemaVersion: NARRATIVE_TRANSCRIPT_SCHEMA_VERSION,
      requestId: normalized.transcript.requestId,
      messages: normalized.transcript.messages
    })
  }
}

export function deserializeNarrativeTranscript(serialized, options = {}) {
  let parsed
  try {
    parsed = JSON.parse(String(serialized || ''))
  } catch {
    return error('NARRATIVE_TRANSCRIPT_SERIALIZED_INVALID', 'transcript 序列化内容不是有效 JSON')
  }
  return normalizeNarrativeTranscript(parsed, options)
}

export const NARRATIVE_TRANSCRIPT_OPAQUE_KEYS = Object.freeze([...OPAQUE_KEYS])

export default {
  NARRATIVE_TRANSCRIPT_SCHEMA_VERSION,
  NARRATIVE_TRANSCRIPT_LIMITS,
  normalizeNarrativeTranscript,
  createNarrativeTranscript,
  appendNarrativeTranscriptMessage,
  serializeNarrativeTranscript,
  deserializeNarrativeTranscript
}
