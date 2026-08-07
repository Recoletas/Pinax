const PROTOCOLS = new Set(['openai-chat', 'openai-responses', 'anthropic', 'unsupported'])

function text(value) {
  return String(value ?? '').trim()
}

function normalizeProtocol(provider = {}) {
  const explicit = text(provider.format || provider.protocol).toLowerCase()
  if (explicit === 'responses' || explicit === 'openai-responses') return 'openai-responses'
  if (explicit === 'anthropic') return 'anthropic'
  if (explicit === 'openai' || explicit === 'chat') return 'openai-chat'
  const id = text(provider.id || provider.provider).toLowerCase()
  const url = text(provider.baseUrl).toLowerCase()
  if (id === 'cohere') return 'unsupported'
  if (id === 'claude' || id === 'anthropic' || id === 'minimax' || url.includes('/anthropic')) return 'anthropic'
  return 'openai-chat'
}

function cacheKey(provider, protocol) {
  let url
  try {
    const parsed = new URL(text(provider.baseUrl))
    url = `${parsed.protocol}//${parsed.host}${parsed.pathname.replace(/\/+$/, '')}`
  } catch {
    url = text(provider.baseUrl).replace(/\/+$/, '')
  }
  return [text(provider.id || provider.provider).toLowerCase() || 'openai', url, text(provider.model), protocol].join('|')
}

function safeDefault(provider, protocol, checkedAt) {
  const supported = PROTOCOLS.has(protocol) && protocol !== 'unsupported'
  return {
    protocol,
    text: supported,
    toolCalls: false,
    parallelToolCalls: false,
    strictSchema: false,
    streamToolCalls: false,
    reasoningRoundTrip: 'none',
    toolChoiceModes: supported ? ['auto', 'none'] : [],
    source: 'static-safe-default',
    checkedAt
  }
}

function normalizeProbe(probe = {}, fallback, checkedAt) {
  const protocol = PROTOCOLS.has(probe.protocol) ? probe.protocol : fallback.protocol
  const textAvailable = probe.text === true || (probe.text == null && fallback.text)
  const toolCalls = probe.toolCalls === true && textAvailable && protocol !== 'unsupported'
  const toolChoiceModes = Array.isArray(probe.toolChoiceModes)
    ? probe.toolChoiceModes.filter((mode) => ['auto', 'none', 'required', 'specific'].includes(mode))
    : (toolCalls ? ['auto', 'none'] : fallback.toolChoiceModes)
  return {
    protocol,
    text: textAvailable,
    toolCalls,
    parallelToolCalls: toolCalls && probe.parallelToolCalls === true,
    strictSchema: toolCalls && probe.strictSchema === true,
    streamToolCalls: toolCalls && probe.streamToolCalls === true,
    reasoningRoundTrip: ['none', 'field', 'content-block', 'encrypted'].includes(probe.reasoningRoundTrip)
      ? probe.reasoningRoundTrip
      : fallback.reasoningRoundTrip,
    toolChoiceModes,
    source: probe.source === 'runtime-downgrade' ? 'runtime-downgrade' : 'probe',
    checkedAt: Number(probe.checkedAt || checkedAt) || checkedAt
  }
}

export function createNarrativeCapabilityCache() {
  return new Map()
}

export function getNarrativeCapabilityCacheKey(provider = {}) {
  return cacheKey(provider, normalizeProtocol(provider))
}

export function resolveNarrativeProviderCapabilities(provider = {}, options = {}) {
  const checkedAt = Number(options.now || Date.now()) || Date.now()
  const protocol = normalizeProtocol(provider)
  const fallback = safeDefault(provider, protocol, checkedAt)
  const cache = options.cache
  const key = cacheKey(provider, protocol)
  const cached = cache?.get?.(key)
  if (cached) return { ...cached, cacheKey: key }
  return { ...fallback, cacheKey: key }
}

export function recordNarrativeCapabilityProbe(cache, provider, probe = {}, options = {}) {
  if (!cache?.set) throw new TypeError('capability cache must support set()')
  const checkedAt = Number(options.now || Date.now()) || Date.now()
  const protocol = normalizeProtocol(provider)
  const key = cacheKey(provider, protocol)
  const fallback = safeDefault(provider, protocol, checkedAt)
  const capabilities = normalizeProbe(probe, fallback, checkedAt)
  cache.set(key, capabilities)
  return { ...capabilities, cacheKey: key }
}

export function downgradeNarrativeProviderCapability(cache, provider, capability, options = {}) {
  const current = resolveNarrativeProviderCapabilities(provider, { ...options, cache })
  const next = { ...current, source: 'runtime-downgrade' }
  if (capability === 'toolCalls') {
    next.toolCalls = false
    next.parallelToolCalls = false
    next.strictSchema = false
    next.streamToolCalls = false
    next.toolChoiceModes = next.text ? ['auto', 'none'] : []
  }
  if (capability === 'parallelToolCalls') next.parallelToolCalls = false
  if (capability === 'strictSchema') next.strictSchema = false
  if (capability === 'streamToolCalls') next.streamToolCalls = false
  if (cache?.set) cache.set(current.cacheKey, next)
  return next
}

export function invalidateNarrativeCapability(cache, provider) {
  return Boolean(cache?.delete?.(getNarrativeCapabilityCacheKey(provider)))
}

export { normalizeProtocol }

export default {
  createNarrativeCapabilityCache,
  getNarrativeCapabilityCacheKey,
  resolveNarrativeProviderCapabilities,
  recordNarrativeCapabilityProbe,
  downgradeNarrativeProviderCapability,
  invalidateNarrativeCapability
}
