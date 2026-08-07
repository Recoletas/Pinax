import { normalizeProtocol } from './providerCapabilityResolver.js'

function text(value) {
  return String(value ?? '').trim()
}

function cacheKey(provider = {}) {
  let url = text(provider.baseUrl).replace(/\/+$/, '')
  try {
    const parsed = new URL(url)
    url = `${parsed.protocol}//${parsed.host}${parsed.pathname.replace(/\/+$/, '')}`
  } catch {
    // Keep the user-provided value in the key when it is not a URL; validation
    // will report the actual request error later.
  }
  return [text(provider.id || provider.provider).toLowerCase() || 'openai', url, text(provider.model), normalizeProtocol(provider)].join('|')
}

export function createStructuredCapabilityCache() {
  return new Map()
}

export function getStructuredCapabilityCacheKey(provider = {}) {
  return cacheKey(provider)
}

export function resolveStructuredProviderCapabilities(provider = {}, options = {}) {
  const key = cacheKey(provider)
  const cached = options.cache?.get?.(key)
  if (cached) return { ...cached, cacheKey: key }
  return {
    cacheKey: key,
    protocol: normalizeProtocol(provider),
    nativeJsonSchema: null,
    jsonObject: null,
    toolCalls: null,
    specificToolChoice: null,
    strictToolSchema: null,
    reasoningControl: 'unknown',
    source: 'safe-default',
    checkedAt: Number(options.now || Date.now()) || Date.now()
  }
}

export function recordStructuredProviderCapabilities(cache, provider, capabilities = {}, options = {}) {
  if (!cache?.set) throw new TypeError('structured capability cache must support set()')
  const key = cacheKey(provider)
  const current = resolveStructuredProviderCapabilities(provider, { cache, now: options.now })
  const next = {
    ...current,
    ...capabilities,
    protocol: capabilities.protocol || current.protocol,
    source: capabilities.source || 'probe',
    checkedAt: Number(options.now || Date.now()) || Date.now(),
    cacheKey: key
  }
  cache.set(key, next)
  return next
}

export function downgradeStructuredProviderCapability(cache, provider, capability, options = {}) {
  const current = resolveStructuredProviderCapabilities(provider, { cache, now: options.now })
  const next = { ...current, source: 'runtime-downgrade' }
  if (capability in next) next[capability] = false
  if (cache?.set) cache.set(current.cacheKey, next)
  return next
}

export function invalidateStructuredProviderCapability(cache, provider) {
  return Boolean(cache?.delete?.(cacheKey(provider)))
}
