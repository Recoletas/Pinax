import { createNarrativeRevision } from '../../../shared/narrativeAgentContract'
import { appendContextLedgerPart } from '../contextLedger'
import { searchNarrativeResources } from './narrativeResourceIndex'

function text(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
}

function latestTurnQuery(kernel) {
  const turn = kernel?.blocks?.find((block) => block.kind === 'turn')
  return text(turn?.content?.input)
}

function sourceRefsFromMatches(matches = []) {
  return [...new Set(matches.flatMap((item) => item.sourceRefs || []))].slice(0, 32)
}

export function buildNarrativeContextAudit({
  kernel,
  index,
  query = '',
  eagerWorldbook = null,
  memoryRecall = null,
  runtimeContextChars = 0,
  toolTrace = null
} = {}) {
  const normalizedQuery = text(query || latestTurnQuery(kernel))
  const lookupInput = {
    action: 'search',
    query: normalizedQuery,
    ids: [],
    filters: {
      entityTypes: [],
      placeIds: [],
      characterIds: [],
      scopes: [],
      timeRange: null
    },
    limit: 6,
    cursor: ''
  }
  const matches = !toolTrace && normalizedQuery
    ? ['world', 'geo', 'history', 'memory'].flatMap((domain) => (
        searchNarrativeResources(index, domain, lookupInput, {
          currentPlaceId: kernel?.blocks?.find((block) => block.kind === 'scene')?.content?.place?.placeId || ''
        }).map((item) => ({ ...item, domain }))
      ))
    : []
  const eagerWorldbookChars = Number(eagerWorldbook?.budgetReport?.usedChars || 0)
  const eagerMemoryChars = Number(memoryRecall?.contentChars || 0)
  const eagerEntryIds = (eagerWorldbook?.matchedEntries || []).map((entry) => text(entry?.id)).filter(Boolean)
  const eagerMemoryIds = (memoryRecall?.included || []).map((item) => text(item?.id)).filter(Boolean)
  const tracedCalls = Array.isArray(toolTrace?.calls) ? toolTrace.calls : []
  const matchedIds = toolTrace
    ? [...new Set(tracedCalls.flatMap((call) => call?.itemIds || []).map(text).filter(Boolean))]
    : [...new Set(matches.map((item) => item.id))]
  const tracedSourceRefs = [...new Set(
    tracedCalls.flatMap((call) => call?.sourceRefs || []).map(text).filter(Boolean)
  )].slice(0, 32)
  const summaryBlock = (kernel?.blocks || []).find((block) => block.kind === 'summary')
  const finalToolResultChars = toolTrace
    ? Number(toolTrace.finalResultChars || toolTrace.resultChars || 0)
    : 0
  const activeContextChars = Number(kernel?.budget?.usedChars || 0) + finalToolResultChars
  const report = {
    schemaVersion: 1,
    mode: toolTrace ? 'agent-tools' : 'baseline',
    kernelRevision: text(kernel?.revision),
    resourceRevision: text(index?.revision),
    queryPreview: normalizedQuery.slice(0, 120),
    queryChars: normalizedQuery.length,
    kernel: {
      chars: Number(kernel?.budget?.usedChars || 0),
      blockCount: kernel?.blocks?.length || 0,
      truncatedBlocks: kernel?.budget?.truncatedBlocks || []
    },
    activeContext: {
      chars: activeContextChars,
      summaryChars: Number(summaryBlock?.chars || 0),
      finalToolResultChars,
      prunedResultChars: Number(toolTrace?.prunedResultChars || 0)
    },
    eager: {
      chars: eagerWorldbookChars + eagerMemoryChars + Number(runtimeContextChars || 0),
      worldbookChars: eagerWorldbookChars,
      memoryChars: eagerMemoryChars,
      runtimeChars: Number(runtimeContextChars || 0),
      entryIds: eagerEntryIds,
      memoryIds: eagerMemoryIds
    },
    indexed: {
      counts: index?.counts || { world: 0, geo: 0, history: 0, memory: 0 },
      matchedIds,
      sourceRefs: toolTrace ? tracedSourceRefs : sourceRefsFromMatches(matches)
    },
    tools: toolTrace
      ? {
          status: text(toolTrace.status),
          rounds: Number(toolTrace.toolRounds || 0),
          calls: Number(toolTrace.totalCalls || 0),
          resultChars: Number(toolTrace.resultChars || 0),
          finalResultChars: Number(toolTrace.finalResultChars || toolTrace.resultChars || 0),
          retainedResults: Number(toolTrace.retainedToolResults || 0),
          prunedResults: Number(toolTrace.prunedToolResults || 0),
          prunedResultChars: Number(toolTrace.prunedResultChars || 0),
          errors: tracedCalls.map((call) => text(call?.errorCode)).filter(Boolean)
        }
      : null
  }
  return {
    ...report,
    revision: createNarrativeRevision('audit', report)
  }
}

export function appendNarrativeContextAudit(ledger, audit) {
  if (!audit) return ledger
  let next = appendContextLedgerPart(ledger, {
    source: 'generation',
    title: '叙事最小内核',
    purpose: 'narrative-kernel-baseline',
    content: `${audit.kernel.blockCount} blocks / ${audit.kernel.chars} chars / revision ${audit.kernelRevision}`,
    chars: audit.kernel.chars,
    sourceRefs: [`kernel:${audit.kernelRevision}`],
    truncated: audit.kernel.truncatedBlocks.length > 0,
    warning: audit.kernel.truncatedBlocks.length > 0
      ? `truncated:${audit.kernel.truncatedBlocks.join(',')}`
      : ''
  })
  next = appendContextLedgerPart(next, {
    source: 'generation',
    title: '按需资源检索基线',
    purpose: 'narrative-resource-baseline',
    content: `${audit.indexed.matchedIds.length} indexed matches / ${audit.eager.chars} eager chars / revision ${audit.resourceRevision}`,
    chars: audit.eager.chars,
    sourceRefs: audit.indexed.sourceRefs,
    included: false
  })
  return next
}

export default {
  appendNarrativeContextAudit,
  buildNarrativeContextAudit
}
