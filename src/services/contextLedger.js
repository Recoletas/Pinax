import { estimateTokens } from '../composables/useTokenEstimate'

export const CONTEXT_PREVIEW_LIMIT = 120
export const CONTEXT_LEDGER_PART_LIMIT = 40

const VALID_SOURCES = new Set(['worldbook', 'runtime', 'memory', 'chat', 'generation'])

function normalizeText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
}

function normalizeSource(source) {
  const value = normalizeText(source).toLowerCase()
  return VALID_SOURCES.has(value) ? value : 'generation'
}

function normalizeLimit(limit, fallback = CONTEXT_PREVIEW_LIMIT) {
  const numeric = Number(limit)
  if (!Number.isFinite(numeric) || numeric <= 0) return fallback
  return Math.max(1, Math.floor(numeric))
}

export function truncateContextPreview(value, limit = CONTEXT_PREVIEW_LIMIT) {
  const text = normalizeText(value)
  const max = normalizeLimit(limit)
  if (text.length <= max) return text
  return `${text.slice(0, Math.max(0, max - 1))}…`
}

export function createContextLedger({
  runId = '',
  sessionId = '',
  worldbookId = '',
  createdAt = Date.now()
} = {}) {
  return {
    schemaVersion: 1,
    runId: normalizeText(runId),
    sessionId: normalizeText(sessionId),
    worldbookId: normalizeText(worldbookId),
    createdAt: Number.isFinite(Number(createdAt)) ? Number(createdAt) : Date.now(),
    parts: []
  }
}

export function createContextLedgerPart(input = {}) {
  const content = normalizeText(input.content ?? input.message?.content ?? input.preview ?? '')
  const previewLimit = normalizeLimit(input.previewLimit || CONTEXT_PREVIEW_LIMIT)
  const chars = Number.isFinite(Number(input.chars)) ? Number(input.chars) : content.length
  const tokens = Number.isFinite(Number(input.tokens)) ? Number(input.tokens) : estimateTokens(content)

  return {
    source: normalizeSource(input.source),
    title: normalizeText(input.title),
    purpose: normalizeText(input.purpose),
    chars,
    tokens,
    preview: truncateContextPreview(content, previewLimit),
    included: input.included !== false,
    truncated: Boolean(input.truncated),
    limit: Number.isFinite(Number(input.limit)) ? Number(input.limit) : null,
    entryId: normalizeText(input.entryId),
    warning: normalizeText(input.warning)
  }
}

function overflowPart(skippedCount) {
  return createContextLedgerPart({
    source: 'generation',
    title: 'Ledger overflow',
    purpose: 'ledger-overflow',
    content: `${skippedCount} context ledger parts skipped because the part limit was reached.`,
    included: false,
    truncated: true,
    warning: 'ledger-overflow'
  })
}

function capLedgerParts(parts = []) {
  const normalized = Array.isArray(parts) ? parts : []
  if (normalized.length <= CONTEXT_LEDGER_PART_LIMIT) return normalized

  const keptCount = CONTEXT_LEDGER_PART_LIMIT - 1
  return [
    ...normalized.slice(0, keptCount),
    overflowPart(normalized.length - keptCount)
  ]
}

export function appendContextLedgerPart(ledger, input = {}) {
  const base = ledger && typeof ledger === 'object' ? ledger : createContextLedger()
  const parts = Array.isArray(base.parts) ? base.parts : []
  return {
    ...base,
    parts: capLedgerParts([...parts, createContextLedgerPart(input)])
  }
}

export function mergeContextLedgers(...ledgers) {
  const first = ledgers.find((ledger) => ledger && typeof ledger === 'object') || createContextLedger()
  const merged = createContextLedger({
    runId: first.runId,
    sessionId: first.sessionId,
    worldbookId: first.worldbookId,
    createdAt: first.createdAt
  })
  const parts = []
  for (const ledger of ledgers) {
    if (!ledger || !Array.isArray(ledger.parts)) continue
    parts.push(...ledger.parts)
  }
  return {
    ...merged,
    parts: capLedgerParts(parts)
  }
}

export function summarizePromptMessage({
  message,
  source = 'generation',
  title = '',
  purpose = '',
  limit = null,
  included = true
} = {}) {
  return createContextLedgerPart({
    source,
    title,
    purpose,
    content: message?.content || '',
    included,
    limit
  })
}
