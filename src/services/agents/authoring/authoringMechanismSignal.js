function hasContext(value) {
  if (!value) return false
  if (Array.isArray(value)) return value.length > 0
  if (typeof value === 'object') return Object.keys(value).length > 0
  return Boolean(String(value).trim())
}

function eventTouchesMechanism(event) {
  const payload = event?.payload || {}
  if (payload.mechanismTrigger || payload.kind === 'mechanism-trigger') return true
  const ops = [
    ...(Array.isArray(payload.ops) ? payload.ops : []),
    ...(Array.isArray(payload.changes) ? payload.changes : [])
  ]
  return ops.some((op) => op?.path === 'mechanismContext')
}

export function resolveAuthoringMechanismSignal({
  generatedText = '',
  detectText = null,
  activeMechanism = '',
  mechanismContext = null,
  runtimeEvents = [],
  eventStartIndex = 0
} = {}) {
  const detected = typeof detectText === 'function' ? detectText(String(generatedText || '')) : null
  if (detected?.type) {
    return { triggered: true, source: 'prose', type: String(detected.type), detail: detected }
  }
  if (String(activeMechanism || '').trim()) {
    return { triggered: true, source: 'active-mechanism', type: String(activeMechanism).trim(), detail: mechanismContext }
  }
  if (hasContext(mechanismContext)) {
    return { triggered: true, source: 'mechanism-context', type: '', detail: mechanismContext }
  }
  const start = Math.max(0, Math.floor(Number(eventStartIndex) || 0))
  const event = (Array.isArray(runtimeEvents) ? runtimeEvents : []).slice(start).find(eventTouchesMechanism)
  if (event) {
    return { triggered: true, source: 'runtime-event', type: '', eventId: String(event.id || ''), detail: event.payload || null }
  }
  return { triggered: false, source: '', type: '', detail: null }
}
