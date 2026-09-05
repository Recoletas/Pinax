import { createAuthoringObserverWorkflow } from './authoringObserverWorkflow.js'
import {
  normalizeAuthoringObserverProvenance,
  normalizeAuthoringObserverTarget
} from './authoringObservationContract.js'
import { queueMemoryCandidate } from '../../memoryCandidates.js'
import { MEMORY_TEXT_LIMIT } from '../../memoryCompaction.js'

export const OBSERVER_MEMORY_KIND_MAP = Object.freeze({
  memory: 'project-fact',
  event: 'plot-event',
  relation: 'character-state',
  timeline: 'project-fact'
})

export const AUTHORING_OBSERVER_TASK_IDS = Object.freeze([
  'observer.entities.derive',
  'observer.relations.derive',
  'observer.events.derive',
  'observer.timeline.derive',
  'observer.memory.derive'
])

const SPEAKER_PATTERN = /([\u4e00-\u9fa5]{2,4})(?:对([\u4e00-\u9fa5]{2,4}))?(?:低声|大声|轻声)?(?:说道|说|道|问|答|喊|问)/g
const RELATION_PATTERN = /([\u4e00-\u9fa5]{2,4})(信任|怀疑|背叛|感激|讨厌|喜欢)([\u4e00-\u9fa5]{2,4})/g
const EVENT_PATTERN = /(?:获得|发现|失去|决定|完成|遇到)(?:了)?([^。，、\s]{2,20})/g
const TIMELINE_PATTERN = /(次日|翌日|当日|当年|黄昏|深夜|清晨|入夜|三日后|数日后)[^。！？]{0,40}/g
const CHANGE_MARKER_PATTERN = /焚毁|烧毁|消失|死亡|不在了|离开|不再|撤销|收回|取消|否认|从未/

let sequence = 0
function nextObservationId(kind) {
  sequence += 1
  return `${kind}-${sequence}`
}

function normalizeFactText(value) {
  return String(value || '').replace(/\s+/g, '').trim()
}

function findLockedConflict(text, lockedFacts) {
  const normalized = normalizeFactText(text)
  for (const fact of lockedFacts || []) {
    const factText = normalizeFactText(fact?.text ?? fact)
    if (!factText) continue
    const overlap = normalized
      .split('')
      .filter((char) => factText.includes(char))
      .length
    // 正文断言与锁定事实共享主题，且带有事实被改变/否定的标记 → 锁定冲突。
    const changeMarked = CHANGE_MARKER_PATTERN.test(normalized) && !CHANGE_MARKER_PATTERN.test(factText)
    if (overlap >= Math.min(2, factText.length) && changeMarked) {
      return fact?.id ? `locked:${fact.id}` : 'locked:fact'
    }
  }
  return null
}

function detectNameAmbiguity(names) {
  const ambiguous = new Set()
  for (const name of names) {
    for (const other of names) {
      if (name !== other && other.includes(name)) {
        ambiguous.add(name)
        ambiguous.add(other)
      }
    }
  }
  return [...ambiguous]
}

function normalizeKnownIdentity(value) {
  if (typeof value === 'string') {
    const name = value.trim()
    return name ? { id: '', name, aliases: [name] } : null
  }
  if (!value || typeof value !== 'object') return null
  const id = String(value.id || value.entryId || '').trim()
  const aliases = [
    value.name,
    value.title,
    ...(Array.isArray(value.aliases) ? value.aliases : []),
    ...(Array.isArray(value.keys) ? value.keys : []),
    ...(Array.isArray(value.keysSecondary) ? value.keysSecondary : [])
  ].map((alias) => String(alias || '').trim()).filter(Boolean)
  if (!id && aliases.length === 0) return null
  return { id, name: aliases[0] || id, aliases: [...new Set(aliases)] }
}

function resolveKnownIdentity(label, knownIdentities) {
  const normalized = String(label || '').trim()
  if (!normalized) return { id: '', status: 'unresolved' }
  const matches = (knownIdentities || [])
    .map(normalizeKnownIdentity)
    .filter(Boolean)
    .filter((identity) => identity.aliases.includes(normalized))
  const stableIds = [...new Set(matches.map((identity) => identity.id).filter(Boolean))]
  if (stableIds.length === 1) return { id: stableIds[0], status: 'resolved' }
  if (stableIds.length > 1) return { id: '', status: 'ambiguous' }
  return { id: '', status: 'unresolved' }
}

function extractChangedRangeText(range, fullText) {
  if (typeof range === 'string') return range.trim()
  if (!range || typeof range !== 'object') return ''

  for (const key of ['changedText', 'text', 'content']) {
    const value = range[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }

  const start = Number(range.start ?? range.from ?? range.startOffset)
  const end = Number(range.end ?? range.to ?? range.endOffset)
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return ''
  return fullText.slice(
    Math.max(0, Math.min(fullText.length, start)),
    Math.max(0, Math.min(fullText.length, end))
  ).trim()
}

// 新调用方可以提供本次真实改动，旧调用方仍可只传全文 text。
// changedText 优先；其次消费 changedRanges/changedRange 中的文本或 JS 字符偏移。
export function resolveObserverDeltaText(delta = {}) {
  const hasChangedText = typeof delta?.changedText === 'string'
  const changedText = hasChangedText ? delta.changedText.trim() : ''
  if (changedText) return changedText

  const fullText = String(delta?.text || '')
  const rawRanges = delta?.changedRanges ?? delta?.changedRange
  const hasChangedRanges = rawRanges !== undefined && rawRanges !== null
  const ranges = Array.isArray(rawRanges) ? rawRanges : (rawRanges ? [rawRanges] : [])
  const rangeText = ranges
    .map((range) => extractChangedRangeText(range, fullText))
    .filter(Boolean)
    .join('\n')
    .trim()

  if (rangeText) return rangeText
  return hasChangedText || hasChangedRanges ? '' : fullText
}

// 确定性派生：只依赖正文与既有锁定/已知事实，不做任何模型调用。
// 每个函数返回原始 observation 数组，typed exception 标记由既有 observer workflow 判定。
export function deriveEntitiesFromDelta({ text = '', knownNames = [], lockedFacts = [] } = {}) {
  const names = new Set((knownNames || [])
    .map(normalizeKnownIdentity)
    .filter(Boolean)
    .map((identity) => identity.name))
  let match
  SPEAKER_PATTERN.lastIndex = 0
  while ((match = SPEAKER_PATTERN.exec(text))) {
    if (match[1]) names.add(match[1])
    if (match[2]) names.add(match[2])
  }
  const ambiguous = new Set(detectNameAmbiguity([...names]))
  return [...names]
    .filter(Boolean)
    .slice(0, 16)
    .map((name) => ({
      id: nextObservationId('entity'),
      kind: 'entity',
      authority: 'derived',
      text: name,
      ambiguous: ambiguous.has(name),
      conflictsWith: findLockedConflict(`${name}身份`, lockedFacts),
      sourceRefs: ['document-delta']
    }))
}

export function deriveRelationsFromDelta({ text = '', knownNames = [], knownIdentities = null, lockedFacts = [] } = {}) {
  const observations = []
  const identityCatalog = Array.isArray(knownIdentities) ? knownIdentities : knownNames
  let match
  RELATION_PATTERN.lastIndex = 0
  while ((match = RELATION_PATTERN.exec(text))) {
    if (!match[1] || !match[3]) continue
    const subjectIdentity = resolveKnownIdentity(match[1], identityCatalog)
    const objectIdentity = resolveKnownIdentity(match[3], identityCatalog)
    const identityAmbiguous = subjectIdentity.status === 'ambiguous' || objectIdentity.status === 'ambiguous'
    observations.push({
      id: nextObservationId('relation'),
      kind: 'relation',
      authority: 'derived',
      text: `${match[1]}${match[2]}${match[3]}`
        + '',
      subject: match[1],
      subjectId: subjectIdentity.id,
      relation: match[2],
      object: match[3],
      objectId: objectIdentity.id,
      ambiguous: identityAmbiguous,
      identityStatus: identityAmbiguous
        ? 'ambiguous'
        : subjectIdentity.status === 'resolved' && objectIdentity.status === 'resolved'
          ? 'resolved'
          : 'unresolved',
      conflictsWith: findLockedConflict(match[0], lockedFacts),
      sourceRefs: ['document-delta']
    })
    if (observations.length >= 12) break
  }
  return observations
}

export function deriveEventsFromDelta({ text = '', lockedFacts = [] } = {}) {
  const observations = []
  let match
  EVENT_PATTERN.lastIndex = 0
  while ((match = EVENT_PATTERN.exec(text))) {
    if (!match[1]) continue
    const summary = match[0].slice(0, 40)
    const destructiveRetcon = /不再|撤销|收回|取消|从未发生/.test(text.slice(
      Math.max(0, match.index - 12),
      match.index + match[0].length + 12
    ))
    observations.push({
      id: nextObservationId('event'),
      kind: 'event',
      authority: 'derived',
      text: summary,
      destructiveRetcon,
      conflictsWith: findLockedConflict(summary, lockedFacts),
      sourceRefs: ['document-delta']
    })
    if (observations.length >= 12) break
  }
  return observations
}

export function deriveTimelineFromDelta({ text = '', lockedFacts = [] } = {}) {
  const observations = []
  let match
  TIMELINE_PATTERN.lastIndex = 0
  while ((match = TIMELINE_PATTERN.exec(text))) {
    observations.push({
      id: nextObservationId('timeline'),
      kind: 'timeline',
      authority: 'derived',
      text: match[0].trim().slice(0, 48),
      conflictsWith: findLockedConflict(match[0], lockedFacts),
      sourceRefs: ['document-delta']
    })
    if (observations.length >= 8) break
  }
  return observations
}

export function deriveMemoryFromDelta(delta = {}) {
  const {
    lockedFacts = [],
    sourceRefs = null
  } = delta
  const text = resolveObserverDeltaText(delta)
  const sentences = String(text || '')
    .split(/(?<=[。！？])/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length >= 6)
  const head = sentences.slice(0, 2).join('').slice(0, 80)
  if (!head) return []
  return [{
    id: nextObservationId('memory'),
    kind: 'memory',
    authority: 'derived',
    text: head,
    conflictsWith: findLockedConflict(head, lockedFacts),
    sourceRefs: Array.isArray(sourceRefs) && sourceRefs.filter(Boolean).length
      ? sourceRefs.filter(Boolean)
      : ['document-delta']
  }]
}

// 受控候选适配：把观察器 memory 输出规范化为 v2 候选并交给唯一持久化 owner。
// 拒绝发明 ID、缺来源 ref、超限内容；冲突转 typed exception；部分失败不丢弃合法兄弟。
export async function runObserverMemoryDerivation({
  delta = {},
  projectId = '',
  scope = 'project',
  derivedBy = 'prose-commit',
  queue = queueMemoryCandidate,
  isCurrent = null
} = {}) {
  if (typeof isCurrent === 'function' && !isCurrent()) {
    return { status: 'stale', queued: [], skipped: [], exceptions: [] }
  }
  const revision = String(delta.revision || '').trim()
  const expectedRevision = String(delta.expectedRevision || '').trim()
  // 返回时来源 revision 已变化 → 整批丢弃为 stale result。
  if (expectedRevision && revision !== expectedRevision) {
    return { status: 'stale', queued: [], skipped: [], exceptions: [] }
  }

  const text = resolveObserverDeltaText(delta)
  if (!text.trim()) {
    return { status: 'completed', queued: [], skipped: [], exceptions: [] }
  }
  const sourceRefs = (Array.isArray(delta.sourceRefs) ? delta.sourceRefs : [])
    .map((ref) => String(ref || '').trim())
    .filter(Boolean)

  const observations = deriveMemoryFromDelta({
    ...delta,
    text,
    lockedFacts: Array.isArray(delta.lockedFacts) ? delta.lockedFacts : [],
    sourceRefs
  })

  const queued = []
  const skipped = []
  const exceptions = []
  for (const observation of observations) {
    if (typeof isCurrent === 'function' && !isCurrent()) {
      return { status: 'stale', queued: [], skipped: [], exceptions: [] }
    }
    // 不信任观察器发明的 ID：候选 id 一律由 repository 生成。
    const content = String(observation.text || '').trim()
    if (!sourceRefs.length || observation.sourceRefs?.[0] === 'document-delta') {
      skipped.push({ observationId: observation.id, reason: 'missing-source-ref' })
      continue
    }
    if (!content) {
      skipped.push({ observationId: observation.id, reason: 'empty-content' })
      continue
    }
    if (content.length > MEMORY_TEXT_LIMIT) {
      skipped.push({ observationId: observation.id, reason: 'content-over-limit' })
      continue
    }

    const result = await queue({
      content,
      scope,
      scopeId: String(projectId || '').trim(),
      kind: OBSERVER_MEMORY_KIND_MAP[observation.kind] || 'project-fact',
      status: 'pending',
      authority: 'derived',
      derivedBy,
      sourceRefs,
      sourceRevision: revision
    })
    const candidate = result?.candidate
    if (result?.skipped) {
      skipped.push({
        observationId: observation.id,
        reason: result.reason || 'queue-skipped',
        candidateId: candidate?.id || ''
      })
      continue
    }
    if (!result?.success || !candidate) {
      skipped.push({ observationId: observation.id, reason: 'queue-rejected' })
      continue
    }
    queued.push(candidate)
    if (Array.isArray(candidate.conflictsWith) && candidate.conflictsWith.length) {
      exceptions.push({
        type: 'memory-conflict',
        id: candidate.id,
        conflictsWith: candidate.conflictsWith.slice(0, 8),
        contentPreview: candidate.content.slice(0, 60)
      })
    }
  }

  return { status: 'completed', queued, skipped, exceptions }
}

const DERIVE_BY_TASK = {
  'observer.entities.derive': deriveEntitiesFromDelta,
  'observer.relations.derive': deriveRelationsFromDelta,
  'observer.events.derive': deriveEventsFromDelta,
  'observer.timeline.derive': deriveTimelineFromDelta,
  'observer.memory.derive': deriveMemoryFromDelta
}

// 后台观察器执行器：把文档 delta 送进既有 observer workflow（derive → 常规落 derived-state，
// typed exception 分离），供调度器在编辑空闲后调用；失败绝不阻塞正文路径。
export function createAuthoringObserverRunner({ applyDerived, onException = null, memoryTarget = null } = {}) {
  if (typeof applyDerived !== 'function') {
    throw new Error('createAuthoringObserverRunner requires applyDerived')
  }
  const workflow = createAuthoringObserverWorkflow({
    derive: async ({ task, request }) => ({
      observations: DERIVE_BY_TASK[task.id]
        ? DERIVE_BY_TASK[task.id](request.intent || {})
        : []
    }),
    applyDerived
  })

  return Object.freeze({
    async run(delta = {}, execution = {}) {
      const text = resolveObserverDeltaText(delta)
      const documentRevision = String(delta?.documentRevision || '')
      const target = normalizeAuthoringObserverTarget({
        type: 'document',
        id: String(delta.documentId || ''),
        projectId: String(delta.memoryProjectId || delta.projectId || ''),
        documentId: String(delta.documentId || ''),
        chapterId: String(delta.chapterId || ''),
        unitId: String(delta.unitId || ''),
        unitRevision: Number(delta.unitRevision || 0),
        revision: documentRevision,
        sourceDocumentRevision: String(delta.sourceDocumentRevision || '')
      })
      const provenance = normalizeAuthoringObserverProvenance({
        projectId: target.projectId,
        documentId: target.documentId,
        chapterId: target.chapterId,
        unitId: target.unitId,
        unitRevision: target.unitRevision,
        documentRevision: target.sourceDocumentRevision || target.revision,
        sourceDocumentRevision: target.sourceDocumentRevision,
        sourceRefs: Array.isArray(delta.sourceRefs) ? delta.sourceRefs : [],
        target
      }, target)
      if (!text.trim()) {
        return {
          status: 'completed',
          documentRevision,
          target,
          provenance,
          derived: 0,
          memoryQueued: 0,
          exceptions: []
        }
      }
      const intent = {
        text,
        knownNames: Array.isArray(delta.knownNames) ? delta.knownNames : [],
        knownIdentities: Array.isArray(delta.knownIdentities) ? delta.knownIdentities : null,
        lockedFacts: Array.isArray(delta.lockedFacts) ? delta.lockedFacts : [],
        provenance
      }
      const exceptions = []
      let derived = 0
      let memoryQueued = 0
      for (const taskId of AUTHORING_OBSERVER_TASK_IDS) {
        if (typeof execution.isCurrent === 'function' && !execution.isCurrent()) {
          return { status: 'stale', documentRevision, target, provenance, derived: 0, memoryQueued: 0, exceptions: [] }
        }
        // memory 输出改走受控候选 owner，不再落入 derived-state。
        if (taskId === 'observer.memory.derive' && memoryTarget) {
          try {
            const resolvedTarget = typeof memoryTarget === 'function'
              ? (memoryTarget(delta) || {})
              : memoryTarget
            const memoryResult = await runObserverMemoryDerivation({
              delta: { ...delta, revision: String(delta.revision || documentRevision), lockedFacts: intent.lockedFacts },
              projectId: typeof resolvedTarget === 'object' ? resolvedTarget.projectId : '',
              isCurrent: execution.isCurrent
            })
            if (memoryResult.status === 'stale') {
              return { status: 'stale', documentRevision, target, provenance, derived: 0, memoryQueued: 0, exceptions: [] }
            }
            exceptions.push(...(memoryResult.exceptions || []))
            memoryQueued += memoryResult.queued.length
          } catch {
            // 记忆候选失败不影响其余派生，也不阻塞正文。
          }
          continue
        }
        try {
          const result = await workflow.run({
            task: { id: taskId },
            request: { target, intent },
            context: { envelope: { blocks: [] }, isCurrent: execution.isCurrent }
          })
          if (result.status === 'stale') {
            return { status: 'stale', documentRevision, target, provenance, derived: 0, memoryQueued: 0, exceptions: [] }
          }
          exceptions.push(...(result.exceptions || []))
          if (result.applied && typeof result.applied === 'object') {
            derived += Number(result.applied.count ?? 0)
          }
        } catch {
          // 单个观察器失败不影响其余派生，也不阻塞正文。
        }
      }
      if (exceptions.length && typeof onException === 'function') onException(exceptions, delta)
      return { status: 'completed', documentRevision, target, provenance, derived, memoryQueued, exceptions }
    }
  })
}
