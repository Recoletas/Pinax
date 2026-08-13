import { STORAGE_KEYS } from '../../composables/useStorage.js'

export const NARRATIVE_PRODUCTION_METRICS_SCHEMA_VERSION = 1
export const NARRATIVE_PRODUCTION_METRICS_LIMIT = 120

function text(value, limit = 120) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, limit)
}

function boundedNumber(value, min = 0, max = Number.MAX_SAFE_INTEGER) {
  const number = Number(value)
  if (!Number.isFinite(number)) return 0
  return Math.max(min, Math.min(max, number))
}

function optionalNumber(value, min = 0, max = Number.MAX_SAFE_INTEGER) {
  if (value == null || value === '') return null
  const number = Number(value)
  if (!Number.isFinite(number)) return null
  return Math.max(min, Math.min(max, number))
}

function optionalBoolean(value) {
  return typeof value === 'boolean' ? value : null
}

const NARRATIVE_INTENTS = new Set(['open', 'respond', 'extend', 'advance'])

function normalizeIntent(value) {
  const raw = text(value, 20)
  return NARRATIVE_INTENTS.has(raw) ? raw : null
}

function resolveStorage(storage) {
  if (storage) return storage
  if (typeof window !== 'undefined') return window.localStorage
  return null
}

function readMetrics(storage) {
  try {
    const parsed = JSON.parse(resolveStorage(storage)?.getItem(STORAGE_KEYS.NARRATIVE_PRODUCTION_METRICS) || 'null')
    if (!parsed || parsed.schemaVersion !== NARRATIVE_PRODUCTION_METRICS_SCHEMA_VERSION) return null
    return parsed
  } catch {
    return null
  }
}

function writeMetrics(metrics, storage) {
  try {
    resolveStorage(storage)?.setItem(
      STORAGE_KEYS.NARRATIVE_PRODUCTION_METRICS,
      JSON.stringify(metrics)
    )
    return true
  } catch {
    return false
  }
}

export function createNarrativeProductionObserver(startedAt = Date.now()) {
  const state = {
    startedAt: boundedNumber(startedAt),
    streamStartedAt: 0,
    firstTokenAt: 0,
    outputChars: 0,
    toolRounds: 0,
    totalCalls: 0,
    evidenceCount: 0,
    statusCount: 0
  }

  return {
    observeStatus(status = {}) {
      state.statusCount += 1
      state.toolRounds = Math.max(state.toolRounds, boundedNumber(status.toolRounds, 0, 20))
      state.totalCalls = Math.max(
        state.totalCalls,
        boundedNumber(status.totalCalls ?? status.callCount, 0, 100)
      )
      state.evidenceCount = Math.max(
        state.evidenceCount,
        boundedNumber(status.evidenceCount, 0, 100)
      )
      if (status.phase === 'streaming' && !state.streamStartedAt) {
        state.streamStartedAt = boundedNumber(status.at || Date.now())
      }
    },
    observeChunk(chunk, at = Date.now()) {
      const content = typeof chunk === 'string' ? chunk : chunk?.content
      const chars = String(content || '').length
      if (!chars) return
      state.outputChars += chars
      if (!state.firstTokenAt) state.firstTokenAt = boundedNumber(at)
    },
    snapshot(endedAt = Date.now()) {
      const end = Math.max(state.startedAt, boundedNumber(endedAt))
      return {
        totalMs: end - state.startedAt,
        decisionMs: state.streamStartedAt
          ? Math.max(0, state.streamStartedAt - state.startedAt)
          : 0,
        firstTokenMs: state.firstTokenAt
          ? Math.max(0, state.firstTokenAt - state.startedAt)
          : 0,
        streamMs: state.streamStartedAt
          ? Math.max(0, end - state.streamStartedAt)
          : 0,
        outputChars: state.outputChars,
        estimatedOutputTokens: Math.ceil(state.outputChars / 2),
        toolRounds: state.toolRounds,
        totalCalls: state.totalCalls,
        evidenceCount: state.evidenceCount,
        statusCount: state.statusCount
      }
    }
  }
}

export function normalizeNarrativeProductionRun(input = {}) {
  const outcome = ['success', 'error', 'cancelled'].includes(input.outcome)
    ? input.outcome
    : 'error'
  const errorCode = text(input.errorCode, 80)
  const protocolOk = typeof input.protocolOk === 'boolean'
    ? input.protocolOk
    : (outcome === 'success'
        ? true
        : (errorCode.startsWith('NARRATIVE_PROVIDER_') ? false : null))

  return {
    schemaVersion: NARRATIVE_PRODUCTION_METRICS_SCHEMA_VERSION,
    runId: text(input.runId, 120),
    recordedAt: boundedNumber(input.recordedAt || Date.now()),
    provider: text(input.provider, 40),
    model: text(input.model, 80),
    mode: input.mode === 'init' ? 'init' : 'continue',
    intent: normalizeIntent(input.intent),
    finishReason: text(input.finishReason, 40) || null,
    boundedCompletion: Boolean(input.boundedCompletion),
    incomplete: Boolean(input.incomplete),
    online: Boolean(input.online),
    outcome,
    errorCode,
    retryable: Boolean(input.retryable),
    protocolOk,
    protocol: text(input.protocol, 40),
    capabilitySource: text(input.capabilitySource, 40),
    toolRepairCount: boundedNumber(input.toolRepairCount, 0, 100),
    reasoningRoundTrip: text(input.reasoningRoundTrip, 40),
    terminalMode: text(input.terminalMode, 80),
    groundingPolicy: text(input.groundingPolicy, 40),
    orphanedCallCount: boundedNumber(input.orphanedCallCount, 0, 100),
    fallbackReason: text(input.fallbackReason, 120),
    transcriptRevision: text(input.transcriptRevision, 120),
    timing: {
      totalMs: boundedNumber(input.timing?.totalMs, 0, 10 * 60 * 1000),
      decisionMs: boundedNumber(input.timing?.decisionMs, 0, 10 * 60 * 1000),
      firstTokenMs: boundedNumber(input.timing?.firstTokenMs, 0, 10 * 60 * 1000),
      streamMs: boundedNumber(input.timing?.streamMs, 0, 10 * 60 * 1000),
      outputChars: boundedNumber(input.timing?.outputChars, 0, 2 * 1024 * 1024),
      estimatedOutputTokens: boundedNumber(input.timing?.estimatedOutputTokens, 0, 1024 * 1024)
    },
    tools: {
      rounds: boundedNumber(input.tools?.rounds, 0, 20),
      calls: boundedNumber(input.tools?.calls, 0, 100),
      evidenceCount: boundedNumber(input.tools?.evidenceCount, 0, 100),
      errorCount: boundedNumber(input.tools?.errorCount, 0, 100)
    },
    usage: {
      inputTokens: boundedNumber(input.usage?.inputTokens, 0),
      outputTokens: boundedNumber(input.usage?.outputTokens, 0),
      totalTokens: boundedNumber(input.usage?.totalTokens, 0),
      estimatedFinalTokens: boundedNumber(input.usage?.estimatedFinalTokens, 0)
    },
    context: {
      kernelChars: boundedNumber(input.context?.kernelChars, 0),
      summaryChars: boundedNumber(input.context?.summaryChars, 0),
      finalToolResultChars: boundedNumber(input.context?.finalToolResultChars, 0)
    },
    cleanup: {
      renderSettled: Boolean(input.cleanup?.renderSettled),
      requestReleased: Boolean(input.cleanup?.requestReleased),
      loadingOwnerSettled: Boolean(input.cleanup?.loadingOwnerSettled),
      failureVisible: Boolean(input.cleanup?.failureVisible)
    },
    quality: {
      evidenceUsed: optionalBoolean(input.quality?.evidenceUsed),
      unsupportedFacts: optionalNumber(input.quality?.unsupportedFacts, 0, 100),
      baselineUnsupportedFacts: optionalNumber(input.quality?.baselineUnsupportedFacts, 0, 100),
      retried: optionalBoolean(input.quality?.retried)
    }
  }
}

export function getNarrativeProductionMetrics(storage = null) {
  return readMetrics(storage) || {
    schemaVersion: NARRATIVE_PRODUCTION_METRICS_SCHEMA_VERSION,
    updatedAt: 0,
    events: []
  }
}

export function recordNarrativeProductionRun(input, storage = null) {
  const current = getNarrativeProductionMetrics(storage)
  const event = normalizeNarrativeProductionRun(input)
  const metrics = {
    schemaVersion: NARRATIVE_PRODUCTION_METRICS_SCHEMA_VERSION,
    updatedAt: event.recordedAt,
    events: [...current.events, event].slice(-NARRATIVE_PRODUCTION_METRICS_LIMIT)
  }
  writeMetrics(metrics, storage)
  return event
}

export function clearNarrativeProductionMetrics(storage = null) {
  try {
    resolveStorage(storage)?.removeItem(STORAGE_KEYS.NARRATIVE_PRODUCTION_METRICS)
    return true
  } catch {
    return false
  }
}

function percentile(values, fraction) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b)
  if (!sorted.length) return null
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * fraction) - 1))
  return sorted[index]
}

function ratio(numerator, denominator) {
  if (!denominator) return null
  return Number((numerator / denominator).toFixed(4))
}

function countBy(items, keyOf) {
  const counts = {}
  for (const item of items) {
    const key = keyOf(item)
    if (key == null || key === '') continue
    counts[key] = (counts[key] || 0) + 1
  }
  return counts
}

export function summarizeNarrativeProductionMetrics(input = []) {
  const rawEvents = Array.isArray(input) ? input : input?.events
  const events = (Array.isArray(rawEvents) ? rawEvents : []).map(normalizeNarrativeProductionRun)
  const completed = events.filter((event) => event.outcome !== 'cancelled')
  const successes = events.filter((event) => event.outcome === 'success')
  const failures = events.filter((event) => event.outcome === 'error')
  const protocolKnown = events.filter((event) => typeof event.protocolOk === 'boolean')
  const cleanupPassed = failures.filter((event) => (
    event.cleanup.renderSettled
    && event.cleanup.requestReleased
    && event.cleanup.loadingOwnerSettled
    && event.cleanup.failureVisible
  ))
  const qualityEvents = events.filter((event) => event.quality.unsupportedFacts != null)
  const evidenceEvents = events.filter((event) => event.quality.evidenceUsed != null)
  const retryEvents = events.filter((event) => event.quality.retried != null)
  const unsupportedFacts = qualityEvents.reduce(
    (total, event) => total + event.quality.unsupportedFacts,
    0
  )
  const baselineUnsupportedFacts = qualityEvents.reduce(
    (total, event) => total + (event.quality.baselineUnsupportedFacts || 0),
    0
  )
  const unsupportedFactReduction = baselineUnsupportedFacts > 0
    ? Number((1 - unsupportedFacts / baselineUnsupportedFacts).toFixed(4))
    : null

  const toolRoundCompliance = ratio(
    events.filter((event) => event.tools.rounds <= 2).length,
    events.length
  )
  const protocolSuccessRate = ratio(
    protocolKnown.filter((event) => event.protocolOk).length,
    protocolKnown.length
  )
  const typedFailureCleanupRate = ratio(cleanupPassed.length, failures.length)

  const gates = {
    sampleSize: { value: events.length, required: 60, met: events.length >= 60 },
    toolRounds: {
      value: toolRoundCompliance,
      required: 0.95,
      met: toolRoundCompliance != null && toolRoundCompliance >= 0.95
    },
    providerProtocol: {
      value: protocolSuccessRate,
      required: 0.98,
      met: protocolSuccessRate != null && protocolSuccessRate >= 0.98
    },
    typedFailureCleanup: {
      value: typedFailureCleanupRate,
      required: 1,
      met: failures.length > 0 && typedFailureCleanupRate === 1
    },
    unsupportedFacts: {
      value: unsupportedFactReduction,
      required: 0.3,
      labeledRuns: qualityEvents.length,
      met: qualityEvents.length > 0
        && unsupportedFactReduction != null
        && unsupportedFactReduction >= 0.3
    }
  }

  return {
    schemaVersion: NARRATIVE_PRODUCTION_METRICS_SCHEMA_VERSION,
    generatedAt: Date.now(),
    sample: {
      total: events.length,
      completed: completed.length,
      success: successes.length,
      error: failures.length,
      cancelled: events.length - completed.length,
      qualityLabeled: qualityEvents.length
    },
    generation: {
      intents: countBy(events, (event) => event.intent),
      finishReasons: countBy(events, (event) => event.finishReason),
      boundedCompletion: events.filter((event) => event.boundedCompletion).length,
      incomplete: events.filter((event) => event.incomplete).length
    },
    rates: {
      success: ratio(successes.length, completed.length),
      toolRoundCompliance,
      protocolSuccess: protocolSuccessRate,
      typedFailureCleanup: typedFailureCleanupRate,
      evidenceAdoption: ratio(
        evidenceEvents.filter((event) => event.quality.evidenceUsed).length,
        evidenceEvents.length
      ),
      retry: ratio(
        retryEvents.filter((event) => event.quality.retried).length,
        retryEvents.length
      ),
      unsupportedFactReduction
    },
    latencyMs: {
      firstTokenP50: percentile(
        successes.map((event) => event.timing.firstTokenMs).filter((value) => value > 0),
        0.5
      ),
      firstTokenP95: percentile(
        successes.map((event) => event.timing.firstTokenMs).filter((value) => value > 0),
        0.95
      ),
      totalP50: percentile(successes.map((event) => event.timing.totalMs), 0.5),
      totalP95: percentile(successes.map((event) => event.timing.totalMs), 0.95)
    },
    usage: {
      inputTokens: events.reduce((total, event) => total + event.usage.inputTokens, 0),
      outputTokens: events.reduce((total, event) => total + event.usage.outputTokens, 0),
      estimatedFinalTokens: events.reduce(
        (total, event) => total + event.usage.estimatedFinalTokens,
        0
      ),
      calls: events.reduce((total, event) => total + event.tools.calls, 0)
    },
    gates,
    releaseReady: Object.values(gates).every((gate) => gate.met)
  }
}

export default {
  clearNarrativeProductionMetrics,
  createNarrativeProductionObserver,
  getNarrativeProductionMetrics,
  normalizeNarrativeProductionRun,
  recordNarrativeProductionRun,
  summarizeNarrativeProductionMetrics
}
