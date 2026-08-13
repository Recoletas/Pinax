export const NARRATIVE_AGENT_STREAM_SCHEMA_VERSION = 1

export const NARRATIVE_AGENT_STREAM_EVENT_TYPES = Object.freeze([
  'step.start',
  'tool.input.delta',
  'tool.call',
  'text.delta',
  'step.finish',
  'usage',
  'error'
])

const EVENT_TYPE_SET = new Set(NARRATIVE_AGENT_STREAM_EVENT_TYPES)

function text(value, limit = 240) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, limit)
}

function boundedInt(value, min = 0, max = 100) {
  const number = Number(value)
  if (!Number.isFinite(number)) return min
  return Math.max(min, Math.min(max, Math.floor(number)))
}

function cleanUsage(value = {}) {
  return {
    inputTokens: boundedInt(value.inputTokens, 0, 10_000_000),
    outputTokens: boundedInt(value.outputTokens, 0, 10_000_000),
    totalTokens: boundedInt(value.totalTokens, 0, 20_000_000)
  }
}

function cleanCallId(value) {
  return text(value, 120).replace(/[^a-zA-Z0-9:_-]/g, '_')
}

function cleanInput(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {}
  return input
}

export function createNarrativeAgentStreamEvent(type, payload = {}, meta = {}) {
  if (!EVENT_TYPE_SET.has(type)) throw new Error(`未知叙事 Agent 事件：${type}`)
  const event = {
    schemaVersion: NARRATIVE_AGENT_STREAM_SCHEMA_VERSION,
    type,
    requestId: text(meta.requestId || payload.requestId, 120),
    seq: boundedInt(meta.seq ?? payload.seq, 1, 1_000_000),
    at: boundedInt(meta.at ?? payload.at ?? Date.now(), 0, Number.MAX_SAFE_INTEGER)
  }

  if (type === 'step.start') {
    event.stepIndex = boundedInt(payload.stepIndex, 0, 20)
    event.toolChoice = ['auto', 'none', 'required'].includes(payload.toolChoice)
      ? payload.toolChoice
      : 'auto'
  } else if (type === 'tool.input.delta') {
    event.callId = cleanCallId(payload.callId)
    event.toolName = text(payload.toolName, 80)
    // Internal browser event; never render or persist this input as prose.
    event.input = cleanInput(payload.input)
  } else if (type === 'tool.call') {
    event.callId = cleanCallId(payload.callId)
    event.toolName = text(payload.toolName, 80)
    event.action = text(payload.action, 80)
  } else if (type === 'text.delta') {
    event.content = String(payload.content ?? '').slice(0, 20_000)
  } else if (type === 'step.finish') {
    event.stepIndex = boundedInt(payload.stepIndex, 0, 20)
    event.status = ['tool_calls', 'final_ready', 'error'].includes(payload.status)
      ? payload.status
      : 'final_ready'
    event.terminalMode = text(payload.terminalMode, 80)
    event.toolRounds = boundedInt(payload.toolRounds, 0, 20)
    event.totalCalls = boundedInt(payload.totalCalls, 0, 100)
    event.finishReason = text(payload.finishReason, 80)
  } else if (type === 'usage') {
    event.usage = cleanUsage(payload.usage || payload)
  } else if (type === 'error') {
    event.code = text(payload.code, 100)
    event.message = text(payload.message || payload.error, 240)
    event.retryable = Boolean(payload.retryable)
  }
  return event
}

export function serializeNarrativeAgentSseEvent(event) {
  const normalized = createNarrativeAgentStreamEvent(event?.type, event, event)
  return `event: ${normalized.type}\ndata: ${JSON.stringify(normalized)}\n\n`
}

export function parseNarrativeAgentSseEvent(raw) {
  const lines = String(raw || '').split(/\r?\n/)
  const data = lines.find((line) => line.startsWith('data:'))?.slice(5).trim()
  if (!data) return null
  try {
    const parsed = JSON.parse(data)
    if (parsed?.schemaVersion !== NARRATIVE_AGENT_STREAM_SCHEMA_VERSION
      || !EVENT_TYPE_SET.has(parsed?.type)) return null
    return parsed
  } catch {
    return null
  }
}

export function reduceNarrativeAgentStreamEvents(events = []) {
  const calls = []
  const inputs = new Map()
  let finalText = ''
  let usage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 }
  let error = null
  let finishReason = ''
  for (const event of Array.isArray(events) ? events : []) {
    if (event?.type === 'tool.input.delta' && event.callId) {
      inputs.set(event.callId, event.input || {})
    } else if (event?.type === 'tool.call' && event.callId) {
      calls.push({
        id: event.callId,
        name: event.toolName,
        arguments: inputs.get(event.callId) || {},
        action: event.action
      })
    } else if (event?.type === 'text.delta') {
      finalText += String(event.content || '')
    } else if (event?.type === 'step.finish') {
      finishReason = text(event.finishReason, 80)
    } else if (event?.type === 'usage') {
      usage = cleanUsage(event.usage)
    } else if (event?.type === 'error') {
      error = event
    }
  }
  if (error) return { error, calls, finalText, usage, finishReason }
  return { kind: calls.length ? 'tool_calls' : 'final_ready', calls, text: finalText, usage, finishReason }
}

export default {
  NARRATIVE_AGENT_STREAM_EVENT_TYPES,
  NARRATIVE_AGENT_STREAM_SCHEMA_VERSION,
  createNarrativeAgentStreamEvent,
  parseNarrativeAgentSseEvent,
  reduceNarrativeAgentStreamEvents,
  serializeNarrativeAgentSseEvent
}
