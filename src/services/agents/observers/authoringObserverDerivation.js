import { createAuthoringObserverWorkflow } from './authoringObserverWorkflow.js'
import { queueMemoryCandidate, listMemoryCandidates } from '../../memoryCandidates.js'
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

// 确定性派生：只依赖正文与既有锁定/已知事实，不做任何模型调用。
// 每个函数返回原始 observation 数组，typed exception 标记由既有 observer workflow 判定。
export function deriveEntitiesFromDelta({ text = '', knownNames = [], lockedFacts = [] } = {}) {
  const names = new Set((knownNames || []).map(String))
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

export function deriveRelationsFromDelta({ text = '', knownNames = [], lockedFacts = [] } = {}) {
  const observations = []
  let match
  RELATION_PATTERN.lastIndex = 0
  while ((match = RELATION_PATTERN.exec(text))) {
    if (!match[1] || !match[3]) continue
    observations.push({
      id: nextObservationId('relation'),
      kind: 'relation',
      authority: 'derived',
      text: `${match[1]}${match[2]}${match[3]}`
        + '',
      subject: match[1],
      relation: match[2],
      object: match[3],
      conflictsWith: findLockedConflict(match[0], lockedFacts),
      sourceRefs: ['document-delta']
    })
    if (observations.length >= 12) break
  }
  void knownNames
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

export function deriveMemoryFromDelta({ text = '', lockedFacts = [], sourceRefs = null } = {}) {
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
  queue = queueMemoryCandidate
} = {}) {
  const revision = String(delta.revision || '').trim()
  const expectedRevision = String(delta.expectedRevision || '').trim()
  // 返回时来源 revision 已变化 → 整批丢弃为 stale result。
  if (expectedRevision && revision !== expectedRevision) {
    return { status: 'stale', queued: [], skipped: [], exceptions: [] }
  }

  const text = String(delta.text || '')
  if (!text.trim()) {
    return { status: 'completed', queued: [], skipped: [], exceptions: [] }
  }
  const sourceRefs = (Array.isArray(delta.sourceRefs) ? delta.sourceRefs : [])
    .map((ref) => String(ref || '').trim())
    .filter(Boolean)

  const observations = deriveMemoryFromDelta({
    text,
    lockedFacts: Array.isArray(delta.lockedFacts) ? delta.lockedFacts : [],
    sourceRefs
  })

  const queued = []
  const skipped = []
  const exceptions = []
  for (const observation of observations) {
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
    async run(delta = {}) {
      const text = String(delta?.text || '')
      const documentRevision = String(delta?.documentRevision || '')
      if (!text.trim()) {
        return { status: 'completed', documentRevision, derived: 0, exceptions: [] }
      }
      const intent = {
        text,
        knownNames: Array.isArray(delta.knownNames) ? delta.knownNames : [],
        lockedFacts: Array.isArray(delta.lockedFacts) ? delta.lockedFacts : []
      }
      const exceptions = []
      let derived = 0
      let memoryQueued = 0
      for (const taskId of AUTHORING_OBSERVER_TASK_IDS) {
        // memory 输出改走受控候选 owner，不再落入 derived-state。
        if (taskId === 'observer.memory.derive' && memoryTarget) {
          try {
            const resolvedTarget = typeof memoryTarget === 'function'
              ? (memoryTarget(delta) || {})
              : memoryTarget
            const memoryResult = await runObserverMemoryDerivation({
              delta: { ...delta, revision: String(delta.revision || documentRevision), lockedFacts: intent.lockedFacts },
              projectId: typeof resolvedTarget === 'object' ? resolvedTarget.projectId : ''
            })
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
            request: { target: { type: 'document', id: String(delta.documentId || ''), revision: documentRevision }, intent },
            context: { envelope: { blocks: [] } }
          })
          exceptions.push(...(result.exceptions || []))
          if (result.applied && typeof result.applied === 'object') {
            derived += Number(result.applied.count ?? 0)
          }
        } catch {
          // 单个观察器失败不影响其余派生，也不阻塞正文。
        }
      }
      if (exceptions.length && typeof onException === 'function') onException(exceptions, delta)
      return { status: 'completed', documentRevision, derived, memoryQueued, exceptions }
    }
  })
}
