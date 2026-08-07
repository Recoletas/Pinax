import { createNarrativeRevision } from '../../../shared/narrativeAgentContract'
import { buildHeuristicContextSummary } from '../contextCompression'

export const NARRATIVE_SCENE_SUMMARY_SCHEMA_VERSION = 1
export const NARRATIVE_SCENE_SUMMARY_LIMITS = Object.freeze({
  keepRecentMessages: 4,
  maxSummaryChars: 1600,
  maxSourceRefs: 24
})

const CONTEXT_SUMMARY_PREFIX = '【上下文摘要】'

function text(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
}

function clip(value, limit) {
  const normalized = String(value ?? '').trim()
  if (normalized.length <= limit) return normalized
  return `${normalized.slice(0, Math.max(0, limit - 1))}…`
}

function normalizeMessages(messages = []) {
  return (Array.isArray(messages) ? messages : [])
    .map((message, index) => ({
      id: text(message?.id),
      role: text(message?.role || message?.type).toLowerCase(),
      content: String(message?.cleanContent || message?.content || '').trim(),
      index
    }))
    .filter((message) => message.content)
}

function isImportedSummary(message) {
  return message.role === 'system' && message.content.startsWith(CONTEXT_SUMMARY_PREFIX)
}

function stripImportedSummary(value) {
  return String(value || '').trim().replace(/^【上下文摘要】/, '').trim()
}

function sourceRevision({ projectId, sessionId, messages, importedSummaries }) {
  return createNarrativeRevision('scene-src', {
    projectId: text(projectId),
    sessionId: text(sessionId),
    messages: messages.map((message) => [message.id, message.role, message.content]),
    importedSummaries
  })
}

export function normalizeNarrativeSceneSummary(raw = null) {
  if (!raw || typeof raw !== 'object' || Number(raw.schemaVersion) !== NARRATIVE_SCENE_SUMMARY_SCHEMA_VERSION) {
    return null
  }
  const summary = clip(raw.summary, NARRATIVE_SCENE_SUMMARY_LIMITS.maxSummaryChars)
  const revision = text(raw.revision)
  const normalizedSourceRevision = text(raw.sourceRevision)
  if (!summary || !revision || !normalizedSourceRevision) return null
  return {
    schemaVersion: NARRATIVE_SCENE_SUMMARY_SCHEMA_VERSION,
    revision,
    sourceRevision: normalizedSourceRevision,
    projectId: text(raw.projectId),
    sessionId: text(raw.sessionId),
    summary,
    sourceMessageCount: Math.max(0, Math.floor(Number(raw.sourceMessageCount) || 0)),
    recentMessageCount: Math.max(0, Math.floor(Number(raw.recentMessageCount) || 0)),
    sourceRefs: [...new Set((raw.sourceRefs || []).map(text).filter(Boolean))]
      .slice(0, NARRATIVE_SCENE_SUMMARY_LIMITS.maxSourceRefs),
    method: text(raw.method) || 'heuristic',
    updatedAt: Math.max(0, Number(raw.updatedAt) || 0)
  }
}

export function resolveNarrativeSceneSummary({
  messages = [],
  previousSummary = null,
  projectId = '',
  sessionId = '',
  keepRecentMessages = NARRATIVE_SCENE_SUMMARY_LIMITS.keepRecentMessages,
  maxSummaryChars = NARRATIVE_SCENE_SUMMARY_LIMITS.maxSummaryChars
} = {}) {
  const normalized = normalizeMessages(messages)
  const importedSummaries = normalized
    .filter(isImportedSummary)
    .map((message) => stripImportedSummary(message.content))
    .filter(Boolean)
  const narrativeMessages = normalized.filter((message) => ['user', 'assistant'].includes(message.role))
  const keepCount = Math.max(2, Math.min(8, Math.floor(Number(keepRecentMessages) || 4)))
  const sourceMessages = narrativeMessages.slice(0, Math.max(0, narrativeMessages.length - keepCount))

  if (sourceMessages.length === 0 && importedSummaries.length === 0) {
    return { summary: null, reused: false, changed: Boolean(previousSummary) }
  }

  const nextSourceRevision = sourceRevision({
    projectId,
    sessionId,
    messages: sourceMessages,
    importedSummaries
  })
  const previous = normalizeNarrativeSceneSummary(previousSummary)
  if (
    previous?.sourceRevision === nextSourceRevision
    && previous.projectId === text(projectId)
    && previous.sessionId === text(sessionId)
  ) {
    return { summary: previous, reused: true, changed: false }
  }

  let summaryText = ''
  let method = 'heuristic'
  if (sourceMessages.length === 0 && importedSummaries.length > 0) {
    summaryText = clip(importedSummaries.slice(-2).join('\n'), maxSummaryChars)
    method = 'imported'
  } else if (importedSummaries.length > 0) {
    const importedBudget = Math.max(480, Math.floor(maxSummaryChars * 0.62))
    const freshBudget = Math.max(360, maxSummaryChars - importedBudget - 24)
    const imported = clip(importedSummaries.slice(-2).join('\n'), importedBudget)
    const fresh = buildHeuristicContextSummary(sourceMessages, {
      maxSummaryChars: freshBudget
    })
    summaryText = `【既有摘要】\n${imported}\n【新增进展】\n${fresh}`
    method = 'imported+heuristic'
  } else {
    summaryText = buildHeuristicContextSummary(sourceMessages, {
      maxSummaryChars
    })
  }

  const sourceRefs = [
    ...sourceMessages.map((message) => message.id ? `message:${message.id}` : ''),
    `scene-source:${nextSourceRevision}`
  ].filter(Boolean)
  const normalizedSummary = {
    schemaVersion: NARRATIVE_SCENE_SUMMARY_SCHEMA_VERSION,
    revision: createNarrativeRevision('scene', {
      projectId: text(projectId),
      sessionId: text(sessionId),
      sourceRevision: nextSourceRevision,
      summary: summaryText
    }),
    sourceRevision: nextSourceRevision,
    projectId: text(projectId),
    sessionId: text(sessionId),
    summary: clip(summaryText, maxSummaryChars),
    sourceMessageCount: sourceMessages.length,
    recentMessageCount: Math.min(keepCount, narrativeMessages.length),
    sourceRefs: [...new Set(sourceRefs)].slice(0, NARRATIVE_SCENE_SUMMARY_LIMITS.maxSourceRefs),
    method,
    updatedAt: Date.now()
  }
  return {
    summary: normalizedSummary,
    reused: false,
    changed: previous?.revision !== normalizedSummary.revision
  }
}

export default {
  NARRATIVE_SCENE_SUMMARY_LIMITS,
  normalizeNarrativeSceneSummary,
  resolveNarrativeSceneSummary
}
