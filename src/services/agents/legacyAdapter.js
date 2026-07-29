import { buildContextEnvelope } from './agentContextEnvelope'
import { createPendingResult, markCompleted, RESULT_STATUSES } from './agentResultLifecycle'
import { resolveTaskType, isLegacyAlias } from './agentTaskRegistry'

function safeStr(value, fallback = '') {
  if (value == null) return fallback
  return String(value)
}

function revisionOf(value) {
  const text = safeStr(value)
  let hash = 2166136261
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return `rev-${(hash >>> 0).toString(36)}-${text.length.toString(36)}`
}

export function adaptLegacyContextToEnvelope({
  context,
  question,
  scope = '',
  taskType = '',
  target = null,
  options = {},
  mode
}) {
  const resolvedTaskType = resolveTaskType(taskType) || taskType || 'writing.chapter.health'
  const surface = scope === 'selection' || scope === 'paragraph' || scope === 'continue'
    || scope === 'thread' || scope === 'chapter'
    ? 'writing'
    : (scope || 'advisor')

  const blocks = []

  if (context) {
    if (typeof context === 'string') {
      blocks.push({ kind: 'raw', content: context, priority: 500 })
    } else if (surface === 'writing' && typeof context === 'object') {
      const targetText = safeStr(target?.text)
      const paragraphText = safeStr(context.paragraph?.text || context.paragraphText)
      const before = safeStr(context.contextWindow?.before)
      const after = safeStr(context.contextWindow?.after)

      if (targetText) {
        blocks.push({
          kind: scope === 'selection' ? 'selection' : 'scene',
          content: `【必须处理的${scope === 'selection' ? '当前选区' : '目标原文'}】\n${targetText}`,
          priority: 1000,
          sourceRefs: []
        })
      }
      if (paragraphText) {
        blocks.push({
          kind: 'scene',
          content: `【当前段落，必须据此完成任务】\n${paragraphText}`,
          priority: 900,
          sourceRefs: []
        })
      }
      if (before || after) {
        blocks.push({
          kind: 'scene',
          content: [
            before ? `【光标前文】\n${before}` : '',
            after ? `【光标后文】\n${after}` : ''
          ].filter(Boolean).join('\n\n'),
          priority: 750,
          sourceRefs: []
        })
      }
      blocks.push({
        kind: 'raw',
        content: JSON.stringify({
          chapterTitle: context.chapterTitle || '',
          wordCount: context.wordCount || 0,
          chapterOutline: context.chapterOutline || '',
          referenceAsset: context.referenceAsset || null,
          writingConstraints: context.writingConstraints || null
        }),
        priority: 350,
        sourceRefs: []
      })
    } else if (typeof context === 'object' && context.contextText) {
      blocks.push({ kind: 'raw', content: context.contextText, priority: 500, sourceRefs: [] })
    } else if (typeof context === 'object' && context.chapterTitle) {
      blocks.push({
        kind: 'scene',
        content: context,
        priority: 700,
        sourceRefs: []
      })
    } else if (typeof context === 'object') {
      blocks.push({ kind: 'raw', content: JSON.stringify(context), priority: 300 })
    }
  }

  if (options && typeof options === 'object' && options.additionalContext) {
    blocks.push({ kind: 'raw', content: safeStr(options.additionalContext), priority: 200 })
  }

  const targetType = target?.kind || (scope || 'general')
  const revisionSeed = target?.text ?? target?.baseText ?? context
  const envelope = buildContextEnvelope({
    surface,
    projectId: null,
    target: {
      type: targetType,
      id: target?.id || null,
      revision: target?.revision || target?.baseRevision || revisionOf(
        typeof revisionSeed === 'string' ? revisionSeed : JSON.stringify(revisionSeed || {})
      )
    },
    blocks
  })

  return {
    envelope,
    resolvedTaskType,
    question: safeStr(question),
    mode: safeStr(mode)
  }
}

export function adaptLegacyResultToAgentResult(legacyResult, taskType) {
  if (!legacyResult || typeof legacyResult !== 'object') return null

  const resolvedTaskType = safeStr(legacyResult.taskType || taskType)
  const result = createPendingResult(resolvedTaskType, {
    baseRevision: legacyResult.baseRevision || null
  })

  const suggestions = []
  const actions = []
  const sideEffects = []

  if (Array.isArray(legacyResult.issues)) {
    for (const issue of legacyResult.issues) {
      suggestions.push({
        type: 'review',
        label: safeStr(issue.message),
        content: safeStr(issue.message),
        sourceRefs: [],
        priority: null
      })
    }
  }

  if (Array.isArray(legacyResult.action)) {
    for (const act of legacyResult.action) {
      suggestions.push({
        type: 'option',
        label: safeStr(act),
        content: safeStr(act),
        sourceRefs: [],
        priority: null
      })
    }
  }

  if (legacyResult.replacement && typeof legacyResult.replacement === 'string') {
    actions.push({
      type: 'text-patch',
      label: '应用替换',
      content: legacyResult.replacement,
      sourceRefs: [],
      range: legacyResult.targetRange || null,
      baseText: legacyResult.baseText || null
    })
  }

  if (Array.isArray(legacyResult.typedActions)) {
    actions.push(...legacyResult.typedActions)
  }

  return markCompleted(result, {
    summary: safeStr(legacyResult.summary || legacyResult.advice || ''),
    suggestions,
    actions,
    sideEffects
  })
}

export function adaptAgentResultToLegacy(agentResult) {
  if (!agentResult || typeof agentResult !== 'object') {
    return {
      advice: '未获取到有效建议',
      result: { task: 'writing.chapter.health', mode: 'review', summary: '' }
    }
  }

  const summary = safeStr(agentResult.summary)
  const taskType = safeStr(agentResult.taskType)

  const legacyResult = {
    task: taskType,
    mode: 'review',
    summary,
    issues: [],
    action: []
  }

  if (Array.isArray(agentResult.suggestions)) {
    for (const s of agentResult.suggestions) {
      if (!s) continue
      if (s.type === 'review' || s.type === 'option') {
        if (s.label) legacyResult.action.push(s.label)
      }
      if (s.type === 'review' && s.content) {
        legacyResult.issues.push({
          type: 'review',
          severity: s.priority != null ? (s.priority > 500 ? 'high' : 'medium') : 'medium',
          message: s.content
        })
      }
    }
  }

  if (Array.isArray(agentResult.actions)) {
    for (const a of agentResult.actions) {
      if (!a) continue
      if (a.type === 'text-patch' && a.content) {
        legacyResult.replacement = a.content
        legacyResult.mode = 'replace'
        if (a.range) legacyResult.targetRange = a.range
        if (a.baseText) legacyResult.baseText = a.baseText
      }
    }
  }

  const summaryFromSuggestions = safeStr(
    agentResult.suggestions?.[0]?.label || ''
  )
  const advice = summary || summaryFromSuggestions || '未获取到有效建议'

  return {
    taskType,
    advice,
    result: legacyResult
  }
}

export { isLegacyAlias }
