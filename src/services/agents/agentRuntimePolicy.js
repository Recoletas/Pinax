import { STORAGE_KEYS } from '../../composables/useStorage'

const POLICY_KEY = STORAGE_KEYS.AGENT_RUNTIME_POLICY
const METRICS_KEY = STORAGE_KEYS.AGENT_RUNTIME_METRICS
const MAX_METRIC_EVENTS = 120

export const PASSIVE_HINT_TYPES = Object.freeze({
  WRITING_INLINE: 'writing-inline',
  CONSISTENCY_CONFLICT: 'consistency-conflict',
  PENDING_RESULT: 'pending-result'
})

const DEFAULT_POLICY = Object.freeze({
  enabled: true,
  passiveHints: {
    [PASSIVE_HINT_TYPES.WRITING_INLINE]: true,
    [PASSIVE_HINT_TYPES.CONSISTENCY_CONFLICT]: true,
    [PASSIVE_HINT_TYPES.PENDING_RESULT]: true
  },
  minIntervalsMs: {
    [PASSIVE_HINT_TYPES.WRITING_INLINE]: 45000,
    [PASSIVE_HINT_TYPES.CONSISTENCY_CONFLICT]: 180000,
    [PASSIVE_HINT_TYPES.PENDING_RESULT]: 120000
  }
})

function resolveStorage(storage) {
  if (storage) return storage
  if (typeof window !== 'undefined') return window.localStorage
  return null
}

function readJson(key, fallback, storage) {
  try {
    const parsed = JSON.parse(resolveStorage(storage)?.getItem(key) || 'null')
    return parsed && typeof parsed === 'object' ? parsed : fallback
  } catch {
    return fallback
  }
}

function writeJson(key, value, storage) {
  try {
    resolveStorage(storage)?.setItem(key, JSON.stringify(value))
  } catch {
    // Runtime policy must never block the editor when storage is unavailable.
  }
  return value
}

export function getAgentRuntimePolicy(storage) {
  const stored = readJson(POLICY_KEY, {}, storage)
  return {
    enabled: stored.enabled !== false,
    passiveHints: {
      ...DEFAULT_POLICY.passiveHints,
      ...(stored.passiveHints || {})
    },
    minIntervalsMs: {
      ...DEFAULT_POLICY.minIntervalsMs,
      ...(stored.minIntervalsMs || {})
    }
  }
}

export function setAgentRuntimeEnabled(enabled, storage) {
  const policy = getAgentRuntimePolicy(storage)
  policy.enabled = Boolean(enabled)
  return writeJson(POLICY_KEY, policy, storage)
}

export function canRunAgentTask(storage) {
  return getAgentRuntimePolicy(storage).enabled
}

export function getAgentRuntimeMetrics(storage) {
  const stored = readJson(METRICS_KEY, {}, storage)
  return {
    totals: stored.totals && typeof stored.totals === 'object' ? stored.totals : {},
    lastRequestedAt: stored.lastRequestedAt && typeof stored.lastRequestedAt === 'object'
      ? stored.lastRequestedAt
      : {},
    events: Array.isArray(stored.events) ? stored.events.slice(-MAX_METRIC_EVENTS) : []
  }
}

export function canRequestPassiveHint(type, now = Date.now(), storage) {
  const policy = getAgentRuntimePolicy(storage)
  if (!policy.enabled) return { allowed: false, reason: 'agent-disabled' }
  if (policy.passiveHints[type] === false) return { allowed: false, reason: 'hint-disabled' }

  const metrics = getAgentRuntimeMetrics(storage)
  const interval = Math.max(0, Number(policy.minIntervalsMs[type]) || 0)
  const elapsed = now - (Number(metrics.lastRequestedAt[type]) || 0)
  if (elapsed < interval) {
    return { allowed: false, reason: 'frequency-limit', retryAfterMs: interval - elapsed }
  }
  return { allowed: true, reason: '' }
}

export function recordAgentRuntimeEvent(type, outcome, details = {}, storage) {
  const metrics = getAgentRuntimeMetrics(storage)
  const now = Number(details.at) || Date.now()
  const key = `${type}:${outcome}`
  metrics.totals[key] = (Number(metrics.totals[key]) || 0) + 1
  if (outcome === 'requested' || outcome === 'shown') metrics.lastRequestedAt[type] = now
  metrics.events = [
    ...metrics.events,
    {
      type,
      outcome,
      at: now,
      chars: Math.max(0, Number(details.chars) || 0),
      latencyMs: Math.max(0, Number(details.latencyMs) || 0),
      reason: String(details.reason || '').slice(0, 80)
    }
  ].slice(-MAX_METRIC_EVENTS)
  return writeJson(METRICS_KEY, metrics, storage)
}

export { DEFAULT_POLICY as DEFAULT_AGENT_RUNTIME_POLICY }
