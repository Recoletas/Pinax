import { getItem, setItem, STORAGE_KEYS } from '../../composables/useStorage'

const MAX_METRIC_RECORDS = 120
const OUTCOMES = new Set(['success', 'timeout', 'invalid', 'error', 'skipped'])
const VOICE_VARIANTS = new Set(['anchored', 'unanchored'])
const POLITICS_VARIANTS = new Set(['used', 'available-not-used', 'unavailable'])
const SAFE_FLAGS = new Set([
  'minor-register-drift',
  'major-register-drift',
  'grounding-gap',
  'continuity-gap',
  'readability-issue'
])

function text(value, limit = 160) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, limit)
}

function hashText(value) {
  let hash = 2166136261
  for (const character of String(value ?? '')) {
    hash ^= character.charCodeAt(0)
    hash = Math.imul(hash, 16777619)
  }
  return `fnv1a-${(hash >>> 0).toString(16)}`
}

function number(value, fallback = 0) {
  const normalized = Number(value)
  return Number.isFinite(normalized) ? Math.max(0, Math.floor(normalized)) : fallback
}

function normalizeScores(scores = {}) {
  const score = (key) => {
    if (scores?.[key] == null) return null
    const value = Number(scores[key])
    return Number.isInteger(value) && value >= 1 && value <= 5 ? value : null
  }
  return {
    voiceConsistency: score('voiceConsistency'),
    grounding: score('grounding'),
    continuity: score('continuity'),
    readability: score('readability')
  }
}

export function normalizeNarrativeCriticFlags(flags = []) {
  return [...new Set((Array.isArray(flags) ? flags : [])
    .map((flag) => text(flag, 80))
    .filter((flag) => SAFE_FLAGS.has(flag)))].slice(0, 8)
}

function normalizeMetric(input = {}) {
  const outcome = OUTCOMES.has(input.outcome) ? input.outcome : 'error'
  const voiceVariant = VOICE_VARIANTS.has(input.voiceVariant) ? input.voiceVariant : 'unanchored'
  const politicsVariant = POLITICS_VARIANTS.has(input.politicsVariant)
    ? input.politicsVariant
    : 'unavailable'
  const rawText = typeof input.text === 'string' ? input.text : ''
  return {
    schemaVersion: 1,
    runId: text(input.runId, 180),
    at: number(input.at, Date.now()),
    provider: text(input.provider, 80),
    model: text(input.model, 120),
    textHash: text(input.textHash, 80) || hashText(rawText),
    textChars: number(input.textChars, rawText.length),
    voiceVariant,
    politicsVariant,
    outcome,
    pass: typeof input.pass === 'boolean' ? input.pass : null,
    scores: normalizeScores(input.scores),
    flags: normalizeNarrativeCriticFlags(input.flags),
    durationMs: number(input.durationMs),
    usage: {
      inputTokens: number(input.usage?.inputTokens),
      outputTokens: number(input.usage?.outputTokens),
      totalTokens: number(input.usage?.totalTokens)
    }
  }
}

export function recordNarrativeCriticMetric(input = {}) {
  const metric = normalizeMetric(input)
  const stored = getItem(STORAGE_KEYS.NARRATIVE_CRITIC_METRICS)
  const records = Array.isArray(stored) ? stored : []
  const next = [...records, metric].slice(-MAX_METRIC_RECORDS)
  setItem(STORAGE_KEYS.NARRATIVE_CRITIC_METRICS, next)
  return metric
}

export function listNarrativeCriticMetrics() {
  const stored = getItem(STORAGE_KEYS.NARRATIVE_CRITIC_METRICS)
  return Array.isArray(stored) ? stored.slice(-MAX_METRIC_RECORDS) : []
}

export function clearNarrativeCriticMetrics() {
  setItem(STORAGE_KEYS.NARRATIVE_CRITIC_METRICS, [])
}
