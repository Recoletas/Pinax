import {
  authorityRank,
  normalizeContextCandidate,
  resolveContextCandidatePrimarySourceRef
} from './contextCandidateContract.js'
import { rankMemoryCandidates } from '../../memory/memoryRetrieval.js'
import { worldbookEntryRef } from '../../writing/writingSourceRefs.js'

export const AUTHORING_RUN_REFERENCE_KINDS = Object.freeze(['narrative-asset', 'exploration-doc'])
export const AUTHORING_RUN_USAGE_ROLES = Object.freeze(['intent', 'fact', 'inspiration'])
export const AUTHORING_SCENE_INTENT_MODES = Object.freeze(['correct-current', 'next-passage', 'run-only'])
export const MAX_AUTHORING_RUN_REFERENCES = 3
export const MAX_AUTHORING_PREVIOUS_UNITS = 3

function text(value) {
  return String(value ?? '').trim()
}

function hasValue(value) {
  return value !== undefined && value !== null && String(value) !== ''
}

function unique(values = []) {
  return [...new Set((Array.isArray(values) ? values : []).map(text).filter(Boolean))]
}

function nodeText(node) {
  if (!node || typeof node !== 'object') return ''
  return String(node.text ?? '') + (Array.isArray(node.content) ? node.content.map(nodeText).join('') : '')
}

function unitText(unit) {
  return (Array.isArray(unit?.content) ? unit.content : []).map(nodeText).filter(Boolean).join('\n\n')
}

function hashText(value) {
  const source = text(value).replace(/\s+/g, ' ')
  let hash = 2166136261
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, '0')}`
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]))
}

function fingerprintValue(prefix, value) {
  const source = JSON.stringify(stableValue(value))
  let hash = 2166136261
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return `${prefix}-${(hash >>> 0).toString(36)}`
}

function evidenceSourceRefs(refs = []) {
  const normalized = []
  for (const ref of Array.isArray(refs) ? refs : []) {
    if (typeof ref === 'string') {
      if (text(ref)) normalized.push(text(ref))
      continue
    }
    if (!ref || typeof ref !== 'object') continue
    const refType = text(ref.refType || ref.type)
    const refId = text(ref.refId || ref.id)
    if (refType && refId) normalized.push(`${refType}:${refId}`)
  }
  return unique(normalized)
}

function safeExclusion(source = {}, reason = '', extra = {}) {
  const result = {
    candidateId: text(source.candidateId || source.id || `${source.sourceKind || 'source'}:${source.sourceId || 'unknown'}`),
    reason: text(reason || source.reason || 'excluded')
  }
  if (source.label) result.label = text(source.label)
  if (source.kind) result.kind = text(source.kind)
  if (source.sourceKind) result.sourceKind = text(source.sourceKind)
  if (source.sourceId) result.sourceId = text(source.sourceId)
  if (source.usageRole) result.usageRole = text(source.usageRole)
  if (source.primarySourceRef) result.primarySourceRef = text(source.primarySourceRef)
  const refs = evidenceSourceRefs(source.sourceRefs)
  if (refs.length) result.sourceRefs = refs
  return { ...result, ...extra }
}

function failure(reason, details = {}) {
  return Object.freeze({ ok: false, reason, ...details })
}

export function authoringRunReferenceRevision(sourceKind, source = {}) {
  if (sourceKind === 'exploration-doc') {
    const revision = Number(source.revision)
    if (!hasValue(source.revision) || !Number.isFinite(revision) || revision < 0) return ''
    return `doc-r${revision}`
  }
  if (sourceKind === 'narrative-asset') {
    const contentHash = text(source.contentHash) || hashText(source.content)
    if (!contentHash || !hasValue(source.updatedAt)) return ''
    return `asset-r${String(source.updatedAt)}:${contentHash}`
  }
  return ''
}

export function memoryRunRevision(memory = {}) {
  if (!text(memory.content)) return ''
  const contentHash = text(memory.contentHash) || hashText(memory.content)
  if (!contentHash) return ''
  return fingerprintValue('memory', {
    id: text(memory.id),
    kind: text(memory.kind),
    contentHash,
    status: text(memory.status),
    scope: text(memory.scope),
    scopeId: text(memory.scopeId),
    authority: text(memory.authority),
    derivedBy: text(memory.derivedBy),
    confidence: memory.confidence,
    importance: memory.importance,
    importanceOverride: memory.importanceOverride,
    sourceRefs: memoryProvenanceRefs(memory),
    sourceRevision: text(memory.sourceRevision),
    conflictsWith: unique(memory.conflictsWith),
    claimKey: text(memory.claimKey || memory.metadata?.claimKey),
    characterIds: unique([
      ...(Array.isArray(memory.characterIds) ? memory.characterIds : []),
      ...(Array.isArray(memory.metadata?.characterIds) ? memory.metadata.characterIds : [])
    ]),
    placeIds: unique([
      ...(Array.isArray(memory.placeIds) ? memory.placeIds : []),
      ...(Array.isArray(memory.metadata?.placeIds) ? memory.metadata.placeIds : [])
    ]),
    title: text(memory.title || memory.metadata?.title),
    keywords: unique(memory.metadata?.keywords),
    updatedAt: memory.updatedAt || memory.createdAt || ''
  })
}

export function worldbookRunRevision(entry = {}) {
  if (!text(entry.id)) return ''
  return fingerprintValue('entry', {
    id: text(entry.id),
    name: text(entry.name),
    type: text(entry.type),
    content: String(entry.content ?? entry.text ?? ''),
    keys: Array.isArray(entry.keys) ? entry.keys.map(text) : [],
    keysSecondary: Array.isArray(entry.keysSecondary) ? entry.keysSecondary.map(text) : [],
    enabled: entry.enabled,
    constant: entry.constant,
    selective: entry.selective,
    caseSensitive: entry.caseSensitive,
    wholeWord: entry.wholeWord,
    insertionOrder: entry.insertionOrder,
    priority: entry.priority,
    position: entry.position,
    depth: entry.depth,
    probability: entry.probability,
    mode: entry.mode,
    strategy: entry.strategy,
    relations: entry.relations,
    voiceRules: entry.voiceRules,
    mapBinding: entry.mapBinding,
    metadata: entry.metadata
  })
}

export function normalizeAuthoringRunReference(raw = {}) {
  const source = raw && typeof raw === 'object' ? raw : {}
  const sourceKind = AUTHORING_RUN_REFERENCE_KINDS.includes(source.sourceKind) ? source.sourceKind : ''
  const sourceId = text(source.sourceId)
  if (!sourceKind || !sourceId) return null
  const usageRole = AUTHORING_RUN_USAGE_ROLES.includes(source.usageRole)
    ? source.usageRole
    : 'inspiration'
  return Object.freeze({
    id: text(source.id) || `${sourceKind}:${sourceId}`,
    sourceKind,
    sourceId,
    projectId: text(source.projectId),
    label: text(source.label),
    excerpt: text(source.excerpt),
    sourceRefs: evidenceSourceRefs(source.sourceRefs),
    revision: text(source.revision),
    usageRole,
    scope: 'run-only'
  })
}

// 提交瞬间冻结 target，并同时产生当前 unit 的合法正文窗口。任何目标、revision
// 或 sceneProjection 不一致都 fail-closed；普通运行从不携带 caret 后正文。
// 只有作者显式选择 rewrite-unit 时，当前目标单元全文才作为待改写对象进入快照。
export function captureAuthoringRunTarget({ target = {}, document = null, sceneProjection = null } = {}) {
  if (!document || !Array.isArray(document.content)) return failure('document-missing')
  const projectId = text(target.projectId)
  const role = target.role === 'exploration' ? 'exploration' : 'manuscript'
  const chapterId = text(target.chapterId)
  const documentId = text(target.documentId || chapterId)
  const unitId = text(target.unitId)
  const nodeId = text(target.nodeId)
  if (!projectId || !documentId || !unitId || !nodeId) return failure('target-incomplete')
  if (role === 'manuscript' && !chapterId) return failure('target-chapter-missing')

  const unitIndex = document.content.findIndex((unit) => text(unit?.attrs?.unitId || unit?.unitId) === unitId)
  if (unitIndex < 0) return failure('target-unit-missing')
  const unit = document.content[unitIndex]
  const nodes = Array.isArray(unit?.content) ? unit.content : []
  const nodeIndex = nodes.findIndex((node) => text(node?.attrs?.nodeId || node?.nodeId) === nodeId)
  if (nodeIndex < 0) return failure('target-node-missing')
  const node = nodes[nodeIndex]
  const currentNodeText = nodeText(node)
  const caretOffset = Number(target.caretOffset)
  if (!Number.isInteger(caretOffset) || caretOffset < 0 || caretOffset > currentNodeText.length) {
    return failure('target-caret-invalid')
  }

  const liveDocumentRevision = String(document.revision ?? '')
  const liveUnitRevision = String(unit?.attrs?.unitRevision ?? unit?.unitRevision ?? '')
  const liveNodeRevision = String(node?.attrs?.nodeRevision ?? node?.attrs?.revision ?? node?.nodeRevision ?? '')
  if (!liveDocumentRevision || !liveUnitRevision || !liveNodeRevision) return failure('target-revision-missing')
  if (hasValue(target.documentRevision) && String(target.documentRevision) !== liveDocumentRevision) {
    return failure('document-revision-changed', { expected: String(target.documentRevision), actual: liveDocumentRevision })
  }
  if (hasValue(target.unitRevision) && String(target.unitRevision) !== liveUnitRevision) {
    return failure('unit-revision-changed', { expected: String(target.unitRevision), actual: liveUnitRevision })
  }
  if (hasValue(target.nodeRevision) && String(target.nodeRevision) !== liveNodeRevision) {
    return failure('node-revision-changed', { expected: String(target.nodeRevision), actual: liveNodeRevision })
  }
  if (sceneProjection && !text(sceneProjection.activeUnitId)) {
    return failure('target-projection-unit-missing')
  }
  if (sceneProjection?.activeUnitId && text(sceneProjection.activeUnitId) !== unitId) {
    return failure('target-projection-mismatch', {
      targetUnitId: unitId,
      projectionUnitId: text(sceneProjection.activeUnitId)
    })
  }
  if (sceneProjection?.chapterId && chapterId && text(sceneProjection.chapterId) !== chapterId) {
    return failure('target-projection-chapter-mismatch', {
      targetChapterId: chapterId,
      projectionChapterId: text(sceneProjection.chapterId)
    })
  }

  const contextMode = target.contextMode === 'rewrite-unit' ? 'rewrite-unit' : 'caret-prefix'
  const prefixParts = contextMode === 'rewrite-unit'
    ? nodes.map(nodeText).filter(Boolean)
    : nodes.slice(0, nodeIndex).map(nodeText).filter(Boolean)
  const currentPrefix = contextMode === 'rewrite-unit' ? '' : currentNodeText.slice(0, caretOffset)
  if (currentPrefix) prefixParts.push(currentPrefix)
  return {
    ok: true,
    target: {
      projectId,
      role,
      documentId,
      chapterId,
      unitId,
      nodeId,
      contextMode,
      caretOffset,
      cursorLocalOffset: caretOffset,
      documentSchemaVersion: Number(document.schemaVersion || 0),
      documentRevision: liveDocumentRevision,
      unitRevision: liveUnitRevision,
      nodeRevision: liveNodeRevision
    },
    unitIndex,
    nodeIndex,
    caretPrefix: prefixParts.join('\n\n')
  }
}

export function readManuscriptRunCandidates({
  targetCapture = null,
  document = null,
  maxPreviousUnits = MAX_AUTHORING_PREVIOUS_UNITS
} = {}) {
  if (!targetCapture?.ok || !document || !Array.isArray(document.content)) {
    return { candidates: [], exclusions: [safeExclusion({ id: 'manuscript-target' }, 'target-unavailable')] }
  }
  const { target, unitIndex: targetIndex, caretPrefix } = targetCapture
  const candidates = []
  const exclusions = []
  const previousLimit = Math.max(0, Math.min(MAX_AUTHORING_PREVIOUS_UNITS, Number(maxPreviousUnits) || 0))
  const startIndex = Math.max(0, targetIndex - previousLimit)
  for (let index = startIndex; index <= targetIndex; index += 1) {
    const unit = document.content[index]
    const unitId = text(unit?.attrs?.unitId || unit?.unitId)
    const content = index === targetIndex ? caretPrefix : unitText(unit)
    if (!unitId) {
      exclusions.push(safeExclusion({ id: `manuscript-unit:${index + 1}` }, 'manuscript-unit-id-missing'))
      continue
    }
    if (!content.trim()) continue
    const relation = index === targetIndex ? 'at-target' : 'before-target'
    const distance = targetIndex - index
    const dependencyKey = `unit:${target.documentId}:${unitId}`
    const rawRevision = unit?.attrs?.unitRevision ?? unit?.unitRevision
    if (!hasValue(rawRevision)) {
      exclusions.push(safeExclusion({
        id: dependencyKey,
        kind: 'manuscript-unit',
        sourceKind: 'manuscript-unit',
        sourceId: unitId,
        primarySourceRef: dependencyKey,
        sourceRefs: [dependencyKey]
      }, 'revision-missing-fail-closed'))
      continue
    }
    const revision = `unit-r${String(rawRevision)}`
    candidates.push({
      id: dependencyKey,
      kind: 'manuscript-unit',
      projectId: target.projectId,
      documentId: target.documentId,
      label: relation === 'at-target'
        ? (target.contextMode === 'rewrite-unit' ? '待重写文本块' : '当前落笔处')
        : `前文片段 ${distance}`,
      sourceKind: 'manuscript-unit',
      sourceId: unitId,
      usageRole: 'fact',
      primarySourceRef: dependencyKey,
      sourceAuthority: target.role === 'manuscript' ? 'canonical-manuscript' : 'author-explicit',
      narrativeStatus: target.role === 'manuscript' ? 'fact' : 'hypothesis',
      temporalRelation: relation,
      scope: 'writing-unit',
      position: { chapterId: target.chapterId, unitId, unitIndex: index },
      reason: relation === 'at-target'
        ? (target.contextMode === 'rewrite-unit' ? '作者明确要求重写整个当前文本块' : '当前单元光标之前')
        : `目标前第 ${distance} 个写作单元`,
      sourceRefs: [dependencyKey, ...(target.chapterId ? [`chapter:${target.chapterId}`] : [])],
      revision,
      attentionPriority: relation === 'at-target' ? 100 : Math.max(70, 96 - distance),
      dependencyRevisions: { [dependencyKey]: revision },
      representations: { full: content },
      estimatedChars: content.length
    })
  }
  return { candidates, exclusions }
}

function sceneProjectionSummary(sceneProjection = {}) {
  const parts = []
  if (sceneProjection.location?.name) parts.push(`地点：${text(sceneProjection.location.name)}`)
  if (sceneProjection.time?.label) parts.push(`时间：${text(sceneProjection.time.label)}`)
  if (sceneProjection.viewpointCharacter?.name) parts.push(`视角：${text(sceneProjection.viewpointCharacter.name)}`)
  for (const person of Array.isArray(sceneProjection.presentCharacters) ? sceneProjection.presentCharacters : []) {
    if (person?.name) parts.push(`在场：${text(person.name)}`)
  }
  for (const person of Array.isArray(sceneProjection.plannedCharacters) ? sceneProjection.plannedCharacters : []) {
    if (person?.name) parts.push(`待入场：${text(person.name)}`)
  }
  for (const event of Array.isArray(sceneProjection.unresolvedEvents) ? sceneProjection.unresolvedEvents : []) {
    if (event?.label) parts.push(`未决：${text(event.label)}`)
  }
  return parts.join('；')
}

export function readAuthoringSceneProjectionCandidates({
  sceneProjection = null,
  projectId = '',
  chapterId = '',
  unitId = ''
} = {}) {
  const source = {
    id: 'scene-projection:current',
    kind: 'scene-projection',
    sourceKind: 'scene-projection',
    sourceId: 'current',
    label: '当前场',
    primarySourceRef: 'scene-projection:current',
    sourceRefs: ['scene-projection:current']
  }
  if (!sceneProjection || typeof sceneProjection !== 'object') {
    return { candidates: [], exclusions: [safeExclusion(source, 'scene-projection-unavailable')] }
  }
  if (sceneProjection.projectId && text(sceneProjection.projectId) !== text(projectId)) {
    return { candidates: [], exclusions: [safeExclusion(source, 'project-mismatch')] }
  }
  if (!text(sceneProjection.activeUnitId) || text(sceneProjection.activeUnitId) !== text(unitId)) {
    return { candidates: [], exclusions: [safeExclusion(source, 'scene-projection-target-mismatch')] }
  }
  if (chapterId && sceneProjection.chapterId && text(sceneProjection.chapterId) !== text(chapterId)) {
    return { candidates: [], exclusions: [safeExclusion(source, 'scene-projection-chapter-mismatch')] }
  }
  const revision = text(sceneProjection.projectionFingerprint)
  if (!revision) {
    return { candidates: [], exclusions: [safeExclusion(source, 'revision-missing-fail-closed')] }
  }
  const content = sceneProjectionSummary(sceneProjection)
  if (!content) return { candidates: [], exclusions: [safeExclusion(source, 'scene-projection-empty')] }
  return {
    candidates: [{
      ...source,
      projectId: text(projectId),
      usageRole: 'fact',
      sourceAuthority: 'accepted-derived',
      narrativeStatus: 'constraint',
      temporalRelation: 'at-target',
      scope: 'scene',
      position: { chapterId: text(chapterId), unitId: text(unitId) },
      reason: '共享当前场投影',
      sourceRefs: unique(['scene-projection:current', ...evidenceSourceRefs(sceneProjection.sourceRefs)]),
      revision,
      attentionPriority: 97,
      dependencyRevisions: { 'scene-projection:current': revision },
      representations: { full: content },
      estimatedChars: content.length
    }],
    exclusions: []
  }
}

// C1-1B：长推演只接收当前章节已经采纳的大纲意图。未采纳分支与其他
// 章节不自动进入本次运行，避免把探索假设或未来正文伪装成当前事实。
export function readAuthoringOutlineCandidates({
  outlineNodes = [], projectId = '', chapterId = ''
} = {}) {
  const candidates = []
  const exclusions = []
  for (const raw of Array.isArray(outlineNodes) ? outlineNodes : []) {
    const node = raw && typeof raw === 'object' ? raw : {}
    const nodeId = text(node.id)
    const primarySourceRef = nodeId ? `outline-node:${nodeId}` : ''
    const source = {
      id: primarySourceRef || 'outline-node:invalid',
      kind: 'outline-node',
      sourceKind: 'outline-node',
      sourceId: nodeId,
      label: text(node.title || node.intent || '大纲意图'),
      primarySourceRef,
      sourceRefs: primarySourceRef ? [primarySourceRef] : []
    }
    if (!nodeId) {
      exclusions.push(safeExclusion(source, 'outline-node-id-missing'))
      continue
    }
    if (node.projectId && text(node.projectId) !== text(projectId)) {
      exclusions.push(safeExclusion(source, 'project-mismatch'))
      continue
    }
    const chapterRefs = unique(node.chapterRefs)
    if (chapterId && (!chapterRefs.length || !chapterRefs.includes(text(chapterId)))) {
      exclusions.push(safeExclusion(source, 'outline-target-mismatch'))
      continue
    }
    // 节点本身进入 planned/drafted/fulfilled 已经是书级真源中的明确作者决定；
    // explorationRefs.adopted 只是另一条采纳路径。只看后者会把迁移后的
    // drafted 大纲和手工 planned 节点全部误排除。
    const adopted = ['planned', 'drafted', 'fulfilled'].includes(text(node.status))
      || (Array.isArray(node.explorationRefs) ? node.explorationRefs : [])
        .some((reference) => text(reference?.state) === 'adopted')
    if (!adopted) {
      exclusions.push(safeExclusion(source, 'outline-not-adopted'))
      continue
    }
    const content = [text(node.title), text(node.intent)].filter(Boolean).join('：')
    if (!content) {
      exclusions.push(safeExclusion(source, 'outline-node-empty'))
      continue
    }
    const numericRevision = Number(node.revision)
    if (!hasValue(node.revision) || !Number.isFinite(numericRevision) || numericRevision < 0) {
      exclusions.push(safeExclusion(source, 'revision-missing-fail-closed'))
      continue
    }
    const revision = `node-r${String(node.revision)}`
    candidates.push({
      ...source,
      projectId: text(projectId),
      usageRole: 'intent',
      sourceAuthority: 'author-adopted',
      narrativeStatus: 'intent',
      temporalRelation: 'at-target',
      scope: 'chapter',
      position: { chapterId: text(chapterId) },
      reason: '当前章节已采纳的大纲意图',
      revision,
      attentionPriority: 90,
      dependencyRevisions: { [primarySourceRef]: revision },
      representations: { full: content, summary: content.slice(0, 240) },
      estimatedChars: content.length,
      claimKey: text(node.intent) ? `outline:${nodeId}` : '',
      claimType: 'intent'
    })
  }
  return { candidates, exclusions }
}

function worldbookSourceRefs(entry, primarySourceRef) {
  return unique([
    primarySourceRef,
    ...evidenceSourceRefs(entry?.sourceRefs).filter((ref) => (
      !ref.startsWith('worldbook-entry:') && !ref.startsWith('worldbook:')
    ))
  ])
}

export async function readAuthoringWorldbookCandidates({
  entries = [], projectId = '', worldbookId = '', repository = null
} = {}) {
  const candidates = []
  const exclusions = []
  const selections = (Array.isArray(entries) ? entries : []).map((raw, index) => ({
    raw,
    entryId: text(raw?.entryId || raw?.sourceId || raw?.entry?.id || raw?.id),
    fallbackId: `worldbook-selection:${index + 1}`
  }))
  if (!selections.length) return { candidates, exclusions }

  const exclusionSource = (selection, entry = null) => {
    const entryId = selection.entryId
    const primarySourceRef = worldbookEntryRef(entryId)
    return {
      id: primarySourceRef || selection.fallbackId,
      kind: 'worldbook-entry',
      sourceKind: 'worldbook-entry',
      sourceId: entryId,
      label: text(entry?.name || entry?.keys?.[0] || '世界设定'),
      primarySourceRef,
      sourceRefs: primarySourceRef ? [primarySourceRef] : []
    }
  }

  if (!text(projectId) || !text(worldbookId)) {
    return {
      candidates,
      exclusions: selections.map((selection) => safeExclusion(exclusionSource(selection), 'worldbook-binding-missing'))
    }
  }
  if (typeof repository?.getBoundWorldbook !== 'function') {
    return {
      candidates,
      exclusions: selections.map((selection) => safeExclusion(exclusionSource(selection), 'worldbook-source-reader-unavailable'))
    }
  }

  let binding
  try {
    binding = await repository.getBoundWorldbook(text(projectId), text(worldbookId))
  } catch {
    return {
      candidates,
      exclusions: selections.map((selection) => safeExclusion(exclusionSource(selection), 'worldbook-read-failed'))
    }
  }
  const boundWorldbook = binding?.worldbook
  if (text(binding?.projectId) !== text(projectId)
    || text(binding?.worldbookId) !== text(worldbookId)
    || text(boundWorldbook?.id) !== text(worldbookId)) {
    return {
      candidates,
      exclusions: selections.map((selection) => safeExclusion(exclusionSource(selection), 'worldbook-binding-mismatch'))
    }
  }
  const entriesById = new Map((Array.isArray(boundWorldbook.entries) ? boundWorldbook.entries : [])
    .filter((entry) => text(entry?.id))
    .map((entry) => [text(entry.id), entry]))

  for (const selection of selections) {
    const raw = selection.raw
    const entryId = selection.entryId
    const primarySourceRef = worldbookEntryRef(entryId)
    if (!entryId || !primarySourceRef) {
      exclusions.push(safeExclusion(exclusionSource(selection), 'invalid-worldbook-entry'))
      continue
    }
    const entry = entriesById.get(entryId)
    const source = exclusionSource(selection, entry)
    if (!entry) {
      exclusions.push(safeExclusion(source, 'worldbook-entry-missing'))
      continue
    }
    if (entryId !== text(entry.id)) {
      exclusions.push(safeExclusion(source, 'invalid-worldbook-entry'))
      continue
    }
    if (entry.enabled === false) {
      exclusions.push(safeExclusion(source, 'worldbook-entry-disabled'))
      continue
    }
    const content = text(entry.content ?? entry.text)
    if (!content) {
      exclusions.push(safeExclusion(source, 'worldbook-entry-empty'))
      continue
    }
    const revision = worldbookRunRevision(entry)
    if (!revision) {
      exclusions.push(safeExclusion(source, 'revision-missing-fail-closed'))
      continue
    }
    const matchReason = text(raw?.matchReason || raw?.entry?.matchReason || entry.matchReason)
    const currentScene = matchReason === 'current-scene'
    candidates.push({
      ...source,
      projectId: text(projectId),
      usageRole: 'fact',
      sourceAuthority: 'imported-reference',
      narrativeStatus: ['rule', 'forbidden', 'style'].includes(text(entry.type)) ? 'constraint' : 'fact',
      temporalRelation: 'atemporal',
      scope: 'project',
      position: {},
      reason: currentScene ? '当前场精确引用' : `世界书命中（${matchReason || 'keyword'}）`,
      sourceRefs: worldbookSourceRefs(entry, primarySourceRef),
      revision,
      attentionPriority: currentScene ? 99 : 76,
      dependencyRevisions: { [primarySourceRef]: revision },
      representations: { full: content, excerpt: content.slice(0, 240) },
      estimatedChars: content.length,
      claimKey: text(entry.claimKey),
      claimType: text(entry.claimType) || 'unknown'
    })
  }
  return { candidates, exclusions }
}

// 历史节点与普通世界书条目分开进入 manifest。这样试演只能查询本次
// 冻结快照中实际入选的节点，不能借由绑定世界书句柄扩成全库搜索。
export async function readAuthoringHistoryCandidates({
  projectId = '', worldbookId = '', repository = null
} = {}) {
  const candidates = []
  const exclusions = []
  if (!text(projectId) || !text(worldbookId) || typeof repository?.getBoundWorldbook !== 'function') {
    return { candidates, exclusions }
  }
  let binding
  try {
    binding = await repository.getBoundWorldbook(text(projectId), text(worldbookId))
  } catch {
    return { candidates, exclusions }
  }
  const worldbook = binding?.worldbook
  if (text(binding?.projectId) !== text(projectId)
    || text(binding?.worldbookId) !== text(worldbookId)
    || text(worldbook?.id) !== text(worldbookId)) return { candidates, exclusions }

  const history = worldbook?.geoHistory || {}
  const nodes = [
    ...(Array.isArray(history.nodes) ? history.nodes : []).map((node) => ({ node, kind: text(node?.kind) || 'world-history' })),
    ...(Array.isArray(history.playerNodes) ? history.playerNodes : []).map((node) => ({ node, kind: 'player-history' }))
  ]
  for (const { node, kind } of nodes) {
    const nodeId = text(node?.id || node?.nodeId)
    const sourceRef = nodeId ? `history-node:${nodeId}` : ''
    const content = text(node?.summary || node?.description || node?.content)
    const source = {
      id: sourceRef || 'history-node:invalid',
      kind: 'history-node', sourceKind: 'history-node', sourceId: nodeId,
      label: text(node?.title || node?.name || '历史节点'),
      primarySourceRef: sourceRef, sourceRefs: sourceRef ? [sourceRef] : []
    }
    if (!nodeId || !content) {
      exclusions.push(safeExclusion(source, !nodeId ? 'history-node-id-missing' : 'history-node-empty'))
      continue
    }
    const revision = text(node?.revision || node?.updatedAt || worldbook?.updatedAt)
    if (!revision) {
      exclusions.push(safeExclusion(source, 'revision-missing-fail-closed'))
      continue
    }
    candidates.push({
      ...source,
      projectId: text(projectId),
      usageRole: 'fact',
      sourceAuthority: kind === 'player-history' ? 'accepted-derived' : 'author-adopted',
      narrativeStatus: 'fact',
      temporalRelation: 'before-target',
      scope: 'project',
      reason: '绑定世界书历史',
      revision: `history-r${revision}`,
      attentionPriority: 72,
      dependencyRevisions: { [sourceRef]: `history-r${revision}` },
      representations: { full: content, summary: content.slice(0, 360) },
      estimatedChars: content.length,
      claimKey: `history:${nodeId}`,
      claimType: 'temporal-event'
    })
  }
  return { candidates, exclusions }
}

function referenceStatusAllowed(sourceKind, source) {
  if (sourceKind === 'narrative-asset') return ['inbox', 'accepted'].includes(source?.status)
  if (sourceKind === 'exploration-doc') return ['active', 'adopted', 'parked'].includes(source?.status)
  return false
}

function referenceCandidateKind(sourceKind) {
  return sourceKind === 'narrative-asset' ? 'narrative-asset' : 'exploration-doc'
}

function referenceNarrativeStatus(usageRole) {
  if (usageRole === 'fact') return 'fact'
  if (usageRole === 'intent') return 'intent'
  return 'hypothesis'
}

function referenceReason(usageRole) {
  if (usageRole === 'fact') return '作者明确标记为本次事实参考'
  if (usageRole === 'intent') return '作者明确选中的本次意图'
  return '作者明确选中的本次灵感'
}

async function resolveReferenceSource(reference, repositories) {
  if (reference.sourceKind === 'exploration-doc') {
    if (typeof repositories?.getExplorationDocument !== 'function') return { source: null, reason: 'source-reader-unavailable' }
    try {
      return { source: await repositories.getExplorationDocument(reference.projectId, reference.sourceId), reason: '' }
    } catch {
      return { source: null, reason: 'source-read-failed' }
    }
  }
  if (typeof repositories?.getNarrativeAsset !== 'function') return { source: null, reason: 'source-reader-unavailable' }
  try {
    return { source: await repositories.getNarrativeAsset(reference.sourceId, reference.projectId), reason: '' }
  } catch {
    return { source: null, reason: 'source-read-failed' }
  }
}

export async function readAuthoringRunReferenceCandidates({
  references = [], projectId = '', repositories = null
} = {}) {
  const exclusions = []
  const normalized = []
  for (let index = 0; index < (Array.isArray(references) ? references : []).length; index += 1) {
    const reference = normalizeAuthoringRunReference(references[index])
    if (!reference) {
      exclusions.push(safeExclusion({ id: `run-reference:${index + 1}` }, 'invalid-run-reference'))
      continue
    }
    normalized.push(reference)
  }

  const uniqueReferences = []
  const seen = new Set()
  for (const reference of normalized) {
    const key = `${reference.sourceKind}:${reference.sourceId}`
    if (seen.has(key)) {
      exclusions.push(safeExclusion(reference, 'duplicate-run-reference'))
      continue
    }
    seen.add(key)
    uniqueReferences.push(reference)
  }
  if (uniqueReferences.length > MAX_AUTHORING_RUN_REFERENCES) {
    return failure('run-reference-limit-exceeded', {
      limit: MAX_AUTHORING_RUN_REFERENCES,
      selected: uniqueReferences.length,
      exclusions
    })
  }

  const candidates = []
  const resolvedReferences = []
  for (const reference of uniqueReferences) {
    if (!reference.projectId || reference.projectId !== text(projectId)) {
      exclusions.push(safeExclusion(reference, 'project-mismatch'))
      continue
    }
    if (!reference.revision) {
      exclusions.push(safeExclusion(reference, 'revision-missing-fail-closed'))
      continue
    }
    const resolved = await resolveReferenceSource(reference, repositories)
    if (!resolved.source) {
      exclusions.push(safeExclusion(reference, resolved.reason || 'source-missing'))
      continue
    }
    const source = resolved.source
    if (text(source.id) !== reference.sourceId) {
      exclusions.push(safeExclusion(reference, 'source-id-mismatch'))
      continue
    }
    if (reference.sourceKind === 'narrative-asset' && text(source.projectId) !== text(projectId)) {
      exclusions.push(safeExclusion(reference, 'project-mismatch'))
      continue
    }
    if (!referenceStatusAllowed(reference.sourceKind, source)) {
      exclusions.push(safeExclusion(reference, 'source-inactive'))
      continue
    }
    const content = text(source.content)
    if (!content) {
      exclusions.push(safeExclusion(reference, 'source-empty'))
      continue
    }
    if (reference.sourceKind === 'narrative-asset'
      && text(source.contentHash)
      && text(source.contentHash) !== hashText(source.content)) {
      exclusions.push(safeExclusion(reference, 'source-content-hash-mismatch'))
      continue
    }
    const liveRevision = authoringRunReferenceRevision(reference.sourceKind, source)
    if (!liveRevision || liveRevision !== reference.revision) {
      exclusions.push(safeExclusion(reference, 'source-revision-changed'))
      continue
    }

    const primarySourceRef = reference.sourceKind === 'narrative-asset'
      ? `narrative-asset:${reference.sourceId}`
      : `exploration:${reference.sourceId}`
    const sourceRefs = unique([
      primarySourceRef,
      ...evidenceSourceRefs(source.sourceRefs),
      ...reference.sourceRefs
    ])
    const label = text(source.title) || reference.label || reference.sourceId
    const kind = referenceCandidateKind(reference.sourceKind)
    const candidate = {
      id: primarySourceRef,
      kind,
      projectId: text(projectId),
      documentId: reference.sourceKind === 'exploration-doc' ? reference.sourceId : '',
      label,
      sourceKind: reference.sourceKind,
      sourceId: reference.sourceId,
      usageRole: reference.usageRole,
      primarySourceRef,
      sourceAuthority: 'author-explicit',
      narrativeStatus: referenceNarrativeStatus(reference.usageRole),
      temporalRelation: 'atemporal',
      scope: 'run-only',
      position: {},
      reason: referenceReason(reference.usageRole),
      sourceRefs,
      revision: liveRevision,
      attentionPriority: reference.usageRole === 'intent' ? 98 : reference.usageRole === 'fact' ? 96 : 82,
      dependencyRevisions: { [primarySourceRef]: liveRevision },
      representations: { full: content, summary: content.slice(0, 240) },
      estimatedChars: content.length
    }
    candidates.push(candidate)
    resolvedReferences.push({
      ...reference,
      label,
      excerpt: content.slice(0, 240),
      sourceRefs,
      revision: liveRevision,
      status: text(source.status)
    })
  }
  return { ok: true, candidates, exclusions, references: resolvedReferences }
}

function memoryScopeAllowed(memory, { projectId = '', authorId = '', sessionId = '' } = {}) {
  if (memory?.scope === 'project') return text(memory.scopeId) === text(projectId)
  if (memory?.scope === 'global-author') {
    return !memory.scopeId || (Boolean(authorId) && text(memory.scopeId) === text(authorId))
  }
  if (memory?.scope === 'session') return Boolean(sessionId) && text(memory.scopeId) === text(sessionId)
  return false
}

function memoryProvenanceRefs(memory = {}) {
  const refs = evidenceSourceRefs(memory?.sourceRefs)
  return refs.length ? refs : evidenceSourceRefs([memory?.sourceRef])
}

export function memoryPrimarySourceRef(memory = {}) {
  const explicit = text(memory?.sourceRef)
  if (explicit) return explicit
  return memoryProvenanceRefs(memory)[0] || ''
}

export function memorySourceDependencyKey(sourceRef = '') {
  const ref = text(sourceRef)
  return ref ? `memory-source:${ref}` : ''
}

function memorySourceRevisionIssue(memory, currentRevisions = {}) {
  const sourceRef = memoryPrimarySourceRef(memory)
  const revision = text(memory?.sourceRevision)
  if (!sourceRef && !revision) return ''
  if (!sourceRef || !revision) return 'source-revision-missing'
  const namespacedKey = memorySourceDependencyKey(sourceRef)
  const revisionKey = hasValue(currentRevisions?.[namespacedKey]) ? namespacedKey : sourceRef
  if (!hasValue(currentRevisions?.[revisionKey])) return 'source-revision-unavailable'
  if (String(currentRevisions[revisionKey]) !== revision) return 'source-stale'
  return ''
}

function memoryUsageRole(memory) {
  if (memory?.kind === 'style-sample') return 'inspiration'
  if (['constraint', 'author-preference'].includes(memory?.kind)) return 'intent'
  return 'fact'
}

function memoryNarrativeStatus(memory) {
  if (memory?.kind === 'style-sample') return 'hypothesis'
  if (['constraint', 'author-preference'].includes(memory?.kind)) return 'constraint'
  return 'fact'
}

function memoryAuthority(memory) {
  if (memory?.authority === 'imported') return 'imported-reference'
  if (memory?.authority === 'accepted' && memory?.derivedBy === 'explicit') return 'author-explicit'
  if (memory?.authority === 'accepted') return 'author-adopted'
  return 'accepted-derived'
}

function memoryClaimType(memory) {
  if (memory?.kind === 'plot-event') return 'temporal-event'
  if (memory?.kind === 'character-state') return 'state'
  if (memory?.kind === 'project-fact') return 'setting'
  return 'unknown'
}

function memoryClaimKey(memory) {
  if (text(memory?.claimKey || memory?.metadata?.claimKey)) return text(memory.claimKey || memory.metadata.claimKey)
  const conflicts = unique(memory?.conflictsWith)
  if (!conflicts.length) return ''
  return `memory-conflict:${[text(memory.id), ...conflicts].sort().join('|')}`
}

function memoryContextQuery({ instruction = '', caretPrefix = '', sceneProjection = null } = {}) {
  const entities = [
    sceneProjection?.viewpointCharacter?.id,
    sceneProjection?.viewpointCharacter?.name,
    sceneProjection?.location?.id,
    sceneProjection?.location?.name,
    ...(sceneProjection?.presentCharacters || []).flatMap((person) => [person?.id, person?.name])
  ]
  return [text(instruction), text(caretPrefix).slice(-1200), ...entities.map(text).filter(Boolean)].filter(Boolean).join('\n')
}

export async function readAuthoringRunMemoryCandidates({
  projectId = '', authorId = '', sessionId = '', instruction = '', caretPrefix = '',
  sceneProjection = null, currentRevisions = {}, repository = null, now = Date.now()
} = {}) {
  if (!repository || typeof repository.list !== 'function') {
    return { candidates: [], exclusions: [safeExclusion({ id: 'memory-repository' }, 'memory-repository-unavailable')], recall: null }
  }
  let memories = []
  try {
    memories = await repository.list({ status: null }) || []
  } catch {
    return { candidates: [], exclusions: [safeExclusion({ id: 'memory-repository' }, 'memory-read-failed')], recall: null }
  }

  const eligible = []
  const exclusions = []
  for (const memory of Array.isArray(memories) ? memories : []) {
    if (!memory?.id) continue
    const source = {
      id: `memory:${memory.id}`,
      kind: 'memory',
      sourceKind: 'memory',
      sourceId: memory.id,
      label: text(memory.title || memory.kind || '相关记忆'),
      primarySourceRef: `memory:${memory.id}`,
      sourceRefs: [`memory:${memory.id}`, ...memoryProvenanceRefs(memory)]
    }
    if (memory.status !== 'active') {
      exclusions.push(safeExclusion(source, memory.status === 'stale' ? 'memory-stale' : 'memory-inactive'))
      continue
    }
    if (!memoryScopeAllowed(memory, { projectId, authorId, sessionId })) {
      exclusions.push(safeExclusion(source, 'memory-scope-mismatch'))
      continue
    }
    if (!text(memory.content)) {
      exclusions.push(safeExclusion(source, 'memory-empty'))
      continue
    }
    const revisionIssue = memorySourceRevisionIssue(memory, currentRevisions)
    if (revisionIssue) {
      exclusions.push(safeExclusion(source, revisionIssue))
      continue
    }
    if (!memoryRunRevision(memory)) {
      exclusions.push(safeExclusion(source, 'revision-missing-fail-closed'))
      continue
    }
    eligible.push(memory)
  }

  const query = memoryContextQuery({ instruction, caretPrefix, sceneProjection })
  const entityIds = unique([
    sceneProjection?.viewpointCharacter?.id,
    sceneProjection?.location?.id,
    ...(sceneProjection?.presentCharacters || []).map((person) => person?.id)
  ])
  const recall = rankMemoryCandidates({
    // 一个 memory revision 只对应 sourceRef/首个 sourceRefs；其余 refs 是
    // provenance，不得拿同一 revision 跨多个 revision domain 做错误比较。
    candidates: eligible.map((memory) => ({
      ...memory,
      sourceRefs: memoryPrimarySourceRef(memory)
        ? [memorySourceDependencyKey(memoryPrimarySourceRef(memory))]
        : []
    })),
    query,
    authorId,
    projectId,
    sessionId,
    entityIds,
    now,
    currentRevisions
  })
  const byId = new Map(eligible.map((memory) => [text(memory.id), memory]))
  for (const item of recall.excluded || []) {
    const memory = byId.get(text(item.id))
    exclusions.push(safeExclusion({
      id: `memory:${item.id}`,
      kind: 'memory',
      sourceKind: 'memory',
      sourceId: item.id,
      label: text(memory?.title || memory?.kind || '相关记忆'),
      primarySourceRef: `memory:${item.id}`,
      sourceRefs: [`memory:${item.id}`, ...memoryProvenanceRefs(memory)]
    }, `memory-${item.skipReason || 'excluded'}`))
  }

  const candidates = []
  for (const recalled of recall.included || []) {
    const memory = byId.get(text(recalled.id))
    const content = text(memory?.content)
    if (!memory || !content) continue
    const primarySourceRef = `memory:${memory.id}`
    const revision = memoryRunRevision(memory)
    const provenanceRefs = memoryProvenanceRefs(memory)
    const dependencyRevisions = { [primarySourceRef]: revision }
    const memorySourceRef = memoryPrimarySourceRef(memory)
    const sourceDependencyKey = memorySourceDependencyKey(memorySourceRef)
    if (sourceDependencyKey && text(memory.sourceRevision)) {
      dependencyRevisions[sourceDependencyKey] = text(memory.sourceRevision)
    }
    const usageRole = memoryUsageRole(memory)
    candidates.push({
      id: primarySourceRef,
      kind: 'memory',
      projectId: text(projectId),
      label: text(memory.title || memory.kind || '相关记忆'),
      sourceKind: 'memory',
      sourceId: text(memory.id),
      usageRole,
      primarySourceRef,
      sourceAuthority: memoryAuthority(memory),
      narrativeStatus: memoryNarrativeStatus(memory),
      temporalRelation: 'atemporal',
      scope: memory.scope === 'project' ? 'project' : 'run-only',
      position: {},
      reason: '与当前落笔处相关的有效记忆',
      sourceRefs: [primarySourceRef, ...provenanceRefs],
      revision,
      attentionPriority: 84,
      dependencyRevisions,
      representations: { full: content, summary: content.slice(0, 220) },
      estimatedChars: content.length,
      claimKey: memoryClaimKey(memory),
      claimType: memoryClaimType(memory)
    })
  }
  return { candidates, exclusions, recall: { query, counts: recall.counts } }
}

export function readAuthoringSceneIntentCandidates({
  sceneIntents = [], projectId = '', chapterId = '', unitId = ''
} = {}) {
  const candidates = []
  const exclusions = []
  for (const raw of Array.isArray(sceneIntents) ? sceneIntents : []) {
    const source = raw && typeof raw === 'object' ? raw : {}
    const id = text(source.id)
    const mode = AUTHORING_SCENE_INTENT_MODES.includes(source.mode) ? source.mode : ''
    const content = text(source.content)
    const revision = text(source.revision)
    const entityKind = ['character', 'location'].includes(source.payload?.entityKind)
      ? source.payload.entityKind
      : ''
    const entryId = text(source.payload?.entryId)
    const canonicalEntryRef = entryId ? `worldbook-entry:${entryId}` : ''
    const worldbookEntryRefs = evidenceSourceRefs(source.sourceRefs)
      .filter((sourceRef) => sourceRef.startsWith('worldbook-entry:'))
    const expectedAdoption = entityKind === 'character' ? 'add-present-character' : 'set-location'
    const payloadAdoption = text(source.payload?.adoption)
    const validPayload = Boolean(
      entityKind
      && entryId
      && text(source.entityKind) === entityKind
      && text(source.entityId) === entryId
      && text(source.worldbookId)
      && text(source.entryRevision)
      && worldbookEntryRefs.length === 1
      && worldbookEntryRefs[0] === canonicalEntryRef
      && (mode === 'next-passage' ? payloadAdoption === expectedAdoption : payloadAdoption === 'none')
    )
    if (!id || !mode || !content || !revision || !validPayload) {
      exclusions.push(safeExclusion({ ...source, id: id ? `scene-intent:${id}` : 'scene-intent:invalid' }, 'invalid-scene-intent'))
      continue
    }
    if (text(source.projectId) !== text(projectId)
      || text(source.chapterId) !== text(chapterId)
      || text(source.unitId) !== text(unitId)) {
      exclusions.push(safeExclusion({ ...source, id: `scene-intent:${id}` }, 'scene-intent-target-mismatch'))
      continue
    }
    const primarySourceRef = `scene-intent:${id}`
    const status = mode === 'next-passage' ? 'intent' : mode === 'correct-current' ? 'constraint' : 'hypothesis'
    const usageRole = mode === 'next-passage' ? 'intent' : mode === 'correct-current' ? 'fact' : 'inspiration'
    candidates.push({
      id: primarySourceRef,
      kind: 'author-note',
      projectId: text(projectId),
      label: text(source.label || content.slice(0, 32)),
      sourceKind: 'scene-intent',
      sourceId: id,
      usageRole,
      primarySourceRef,
      sourceAuthority: 'author-explicit',
      narrativeStatus: status,
      temporalRelation: 'at-target',
      scope: 'run-only',
      position: { chapterId },
      reason: mode === 'correct-current' ? '纠正当前场' : mode === 'next-passage' ? '下一段安排' : '带入本次推演',
      sourceRefs: [primarySourceRef, ...evidenceSourceRefs(source.sourceRefs)],
      revision,
      attentionPriority: 99,
      dependencyRevisions: { [primarySourceRef]: revision },
      representations: { full: content },
      estimatedChars: content.length,
      claimKey: text(source.claimKey),
      claimType: text(source.claimType) || 'unknown'
    })
  }
  return { candidates, exclusions }
}

function candidatePreference(candidate) {
  return (candidate.pinned ? 1_000_000 : 0)
    + authorityRank(candidate.sourceAuthority) * 10_000
    + Number(candidate.attentionPriority || 0) * 100
    - Number(candidate.estimatedChars || 0)
}

function serializeCandidateRepresentations(candidate = {}) {
  return JSON.stringify(Object.fromEntries(
    ['full', 'summary', 'excerpt']
      .filter((key) => typeof candidate.representations?.[key] === 'string')
      .map((key) => [key, candidate.representations[key]])
  ))
}

// run 级去重使用 canonical primarySourceRef；没有合法主引用的候选仍按稳定 ID
// 去重，但不会拿 chapter/provenance ref 误合并多个 writingUnit。
export function dedupeAuthoringRunCandidates(candidates = []) {
  const included = []
  const exclusions = []
  const issues = []
  const indexById = new Map()
  const indexBySourceRef = new Map()
  for (const raw of Array.isArray(candidates) ? candidates : []) {
    const candidate = normalizeContextCandidate(raw)
    if (!candidate) {
      exclusions.push(safeExclusion(raw, 'invalid-context-candidate'))
      continue
    }
    const primarySourceRef = candidate.primarySourceRef || resolveContextCandidatePrimarySourceRef(candidate)
    if (!primarySourceRef) {
      issues.push({
        reason: 'primary-source-ref-missing',
        candidateId: candidate.id,
        kind: candidate.kind
      })
      continue
    }
    const duplicateIndex = indexById.get(candidate.id) ?? (primarySourceRef ? indexBySourceRef.get(primarySourceRef) : undefined)
    if (duplicateIndex === undefined) {
      const index = included.length
      included.push(candidate)
      indexById.set(candidate.id, index)
      if (primarySourceRef) indexBySourceRef.set(primarySourceRef, index)
      continue
    }
    const previous = included[duplicateIndex]
    const previousPrimarySourceRef = previous.primarySourceRef || resolveContextCandidatePrimarySourceRef(previous)
    const identityChanged = candidate.id === previous.id && primarySourceRef !== previousPrimarySourceRef
    const contentChanged = serializeCandidateRepresentations(previous)
      !== serializeCandidateRepresentations(candidate)
    const sourceConflict = identityChanged
      || candidate.projectId !== previous.projectId
      || candidate.kind !== previous.kind
      || candidate.revision !== previous.revision
      || contentChanged
    if (sourceConflict) {
      issues.push({
        reason: identityChanged
          ? 'candidate-source-identity-conflict'
          : contentChanged ? 'primary-source-content-conflict' : 'primary-source-revision-conflict',
        sourceRef: primarySourceRef || previousPrimarySourceRef,
        candidateIds: unique([previous.id, candidate.id]),
        revisions: unique([previous.revision, candidate.revision]),
        projects: unique([previous.projectId, candidate.projectId]),
        kinds: unique([previous.kind, candidate.kind])
      })
      continue
    }
    const keepNew = candidatePreference(candidate) > candidatePreference(previous)
    const kept = keepNew ? candidate : previous
    const dropped = keepNew ? previous : candidate
    if (keepNew) {
      included[duplicateIndex] = candidate
      indexById.delete(previous.id)
      if (previousPrimarySourceRef && indexBySourceRef.get(previousPrimarySourceRef) === duplicateIndex) {
        indexBySourceRef.delete(previousPrimarySourceRef)
      }
      indexById.set(candidate.id, duplicateIndex)
      if (primarySourceRef) indexBySourceRef.set(primarySourceRef, duplicateIndex)
    }
    exclusions.push(safeExclusion(dropped, 'duplicate-primary-source-ref', { keptCandidateId: kept.id }))
  }
  return { candidates: included, exclusions, issues }
}
