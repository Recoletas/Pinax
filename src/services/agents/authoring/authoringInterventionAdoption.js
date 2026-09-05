import { applyWritingDocumentTextPatches } from '../../authoring/authoringProjectSearch.js'
import {
  getNodePlainText,
  getWritingDocumentMarkdown,
  getWritingDocumentPlainText
} from '../../writing/writingDocumentSchema.js'
import { reconcileWritingAnnotations } from '../../writing/writingAnnotations.js'

export const AUTHORING_INTERVENTION_ADOPTION_SCHEMA_VERSION = 1

function text(value) {
  return String(value ?? '').trim()
}

function failure(reason) {
  return Object.freeze({ ok: false, reason: text(reason) || 'intervention-adoption-failed' })
}

function sameRevision(expected, actual) {
  return String(expected ?? '') === String(actual ?? '')
}

function list(value) {
  return Array.isArray(value) ? value : []
}

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value))
}

function wordCount(document) {
  const body = getWritingDocumentPlainText(document)
  return (body.match(/[一-龥]/g) || []).length + (body.match(/[a-zA-Z]+/g) || []).length
}

function documentNode(document, unitId, nodeId) {
  const unit = list(document?.content).find((item) => text(item?.attrs?.unitId) === text(unitId))
  const node = list(unit?.content).find((item) => text(item?.attrs?.nodeId) === text(nodeId))
  return unit && node ? { unit, node } : null
}

function updateChapterDocument(chapter, previousDocument, nextDocument, now) {
  chapter.editorDocument = nextDocument
  chapter.editorDocumentSchemaVersion = Number(nextDocument.schemaVersion || 3)
  chapter.content = getWritingDocumentMarkdown(nextDocument)
  chapter.contentFormat = 'md'
  chapter.wordCount = wordCount(nextDocument)
  chapter.annotations = reconcileWritingAnnotations(chapter.annotations, nextDocument, chapter.id, previousDocument)
  chapter.updatedAt = String(now)
}

// F3-4A：一个 Ghost 只拥有一个正文节点。这里冻结替换载荷；编辑器与
// repository 仍分别拥有“单事务修改”和“持久化”的唯一实现。
export function prepareAuthoringInterventionAdoption({ session, result, ghost, liveTarget } = {}) {
  if (!session || session.kind !== 'authoring-intervention-session' || session.status !== 'ready') {
    return failure('intervention-session-invalid')
  }
  if (!result || result.kind !== 'authoring-intervention-rehearsal-result'
    || result.status !== 'fresh'
    || result.adoptable !== true
    || result.sessionFingerprint !== session.fingerprint) {
    return failure('intervention-result-not-adoptable')
  }
  const ownedGhost = result.drafts?.find((item) => item?.id === ghost?.id)
  if (!ownedGhost || ghost.status !== 'fresh'
    || Number(ownedGhost.revision || 0) !== Number(ghost.revision || 0)
    || String(ownedGhost.text ?? '') !== String(ghost.text ?? '')) {
    return failure('intervention-ghost-not-fresh')
  }
  const replacement = String(ghost.text ?? '').trim()
  if (!replacement) return failure('intervention-ghost-empty')
  const expected = ghost.target || {}
  if (!liveTarget
    || text(liveTarget.projectId) !== text(session.projectId)
    || text(liveTarget.documentId) !== text(expected.documentId)
    || text(liveTarget.unitId) !== text(expected.unitId)
    || text(liveTarget.nodeId) !== text(expected.nodeId)
    || !sameRevision(expected.documentRevision, liveTarget.documentRevision)
    || !sameRevision(expected.unitRevision, liveTarget.unitRevision)
    || !sameRevision(expected.nodeRevision, liveTarget.nodeRevision)) {
    return failure('intervention-target-stale')
  }
  const beforeText = String(liveTarget.nodeText ?? '')
  // evidence excerpt 允许为了预览被截断；是否仍是同一正式节点由三层
  // revision 锁定，实际回滚文本必须取 live canonical node，而不是 excerpt。
  if (!beforeText) return failure('intervention-target-text-missing')
  const core = {
    schemaVersion: AUTHORING_INTERVENTION_ADOPTION_SCHEMA_VERSION,
    kind: 'authoring-intervention-adoption',
    id: `intervention-adoption:${session.intervention?.id || session.fingerprint}:${ghost.id}`,
    projectId: text(session.projectId),
    sessionFingerprint: session.fingerprint,
    resultFingerprint: result.fingerprint,
    ghostId: ghost.id,
    ghostRevision: Number(ghost.revision || 0),
    target: Object.freeze({
      documentId: text(expected.documentId),
      chapterId: text(expected.chapterId || expected.documentId),
      unitId: text(expected.unitId),
      nodeId: text(expected.nodeId),
      documentRevision: String(expected.documentRevision ?? ''),
      unitRevision: String(expected.unitRevision ?? ''),
      nodeRevision: String(expected.nodeRevision ?? '')
    }),
    beforeText,
    afterText: replacement,
    patch: Object.freeze({
      nodeId: text(expected.nodeId),
      range: Object.freeze({ startOffset: 0, endOffset: beforeText.length }),
      replacement
    }),
    sourceRefs: Object.freeze([
      `intervention-session:${session.fingerprint}`,
      text(ghost.targetRef)
    ].filter(Boolean)),
    status: 'prepared'
  }
  return Object.freeze({ ok: true, adoption: Object.freeze(core) })
}

export function markAuthoringInterventionAdoptionPersisted(adoption, liveTarget) {
  if (!adoption || adoption.kind !== 'authoring-intervention-adoption' || adoption.status !== 'prepared') {
    return failure('intervention-adoption-invalid')
  }
  if (!liveTarget
    || text(liveTarget.documentId) !== adoption.target.documentId
    || text(liveTarget.unitId) !== adoption.target.unitId
    || text(liveTarget.nodeId) !== adoption.target.nodeId
    || String(liveTarget.nodeText ?? '').trim() !== adoption.afterText.trim()) {
    return failure('intervention-adoption-persist-mismatch')
  }
  return Object.freeze({
    ok: true,
    receipt: Object.freeze({
      ...adoption,
      status: 'persisted',
      afterDocumentRevision: String(liveTarget.documentRevision ?? ''),
      afterUnitRevision: String(liveTarget.unitRevision ?? ''),
      afterNodeRevision: String(liveTarget.nodeRevision ?? '')
    })
  })
}

export function prepareAuthoringInterventionUmbrella({ session, result, ghosts, positionIndex, book, now = new Date().toISOString() } = {}) {
  const selected = list(ghosts)
  if (!book || text(book.id) !== text(session?.projectId)) return failure('intervention-umbrella-project-mismatch')
  if (selected.length < 2) return failure('intervention-umbrella-too-small')
  const positions = new Map(list(positionIndex?.entries).map((entry) => (
    [`${text(entry.documentId)}:${text(entry.nodeId)}`, entry]
  )))
  const seenTargets = new Set()
  const preparedGroups = []
  for (const ghost of selected) {
    const targetKey = `${text(ghost?.target?.documentId)}:${text(ghost?.target?.nodeId)}`
    if (!targetKey || seenTargets.has(targetKey)) return failure('intervention-umbrella-target-conflict')
    seenTargets.add(targetKey)
    if (ghost?.target?.documentRole === 'exploration' || /[\r\n]/.test(String(ghost?.text ?? ''))) {
      return failure('intervention-umbrella-target-unsupported')
    }
    const position = positions.get(targetKey)
    const prepared = prepareAuthoringInterventionAdoption({
      session,
      result,
      ghost,
      liveTarget: position ? { ...position, nodeText: position.text } : null
    })
    if (!prepared.ok) return prepared
    preparedGroups.push(prepared.adoption)
  }

  const nextBook = clone(book)
  const receiptGroups = []
  const chapterIds = [...new Set(preparedGroups.map((group) => group.target.chapterId))]
  for (const chapterId of chapterIds) {
    const previousChapter = list(book.chapters).find((chapter) => text(chapter?.id) === chapterId)
    const nextChapter = list(nextBook.chapters).find((chapter) => text(chapter?.id) === chapterId)
    if (!previousChapter?.editorDocument || !nextChapter) return failure('intervention-umbrella-chapter-missing')
    const groups = preparedGroups.filter((group) => group.target.chapterId === chapterId)
    const patches = groups.map((group) => ({
      unitId: group.target.unitId,
      unitRevision: Number(group.target.unitRevision || 0),
      nodeId: group.target.nodeId,
      nodeRevision: Number(group.target.nodeRevision || 0),
      start: 0,
      end: group.beforeText.length,
      expectedText: group.beforeText,
      replacement: group.afterText
    }))
    const applied = applyWritingDocumentTextPatches(previousChapter.editorDocument, patches, { now })
    if (!applied.ok) return failure(applied.reason || 'intervention-umbrella-apply-failed')
    updateChapterDocument(nextChapter, previousChapter.editorDocument, applied.document, now)
    for (const group of groups) {
      const changed = applied.changedNodes.find((node) => node.nodeId === group.target.nodeId)
      const after = documentNode(applied.document, group.target.unitId, group.target.nodeId)
      if (!changed || !after) return failure('intervention-umbrella-receipt-missing')
      receiptGroups.push(Object.freeze({
        ...group,
        status: 'persisted',
        beforeDocumentRevision: Number(previousChapter.editorDocument.revision || 0),
        afterDocumentRevision: Number(applied.document.revision || 0),
        afterUnitRevision: Number(after.unit.attrs?.unitRevision || 0),
        afterNodeRevision: Number(after.node.attrs?.nodeRevision || 0)
      }))
    }
  }
  nextBook.updatedAt = String(now)
  const receipt = Object.freeze({
    schemaVersion: AUTHORING_INTERVENTION_ADOPTION_SCHEMA_VERSION,
    kind: 'authoring-intervention-umbrella',
    id: `intervention-umbrella:${session.intervention?.id || session.fingerprint}:${String(now)}`,
    projectId: text(session.projectId),
    sessionFingerprint: session.fingerprint,
    groupCount: receiptGroups.length,
    chapterCount: chapterIds.length,
    groups: Object.freeze(receiptGroups),
    affectedUnitRefs: Object.freeze([...new Set(receiptGroups.map((group) => (
      `unit:${group.target.chapterId}:${group.target.unitId}`
    )))]),
    status: 'persisted',
    committedAt: String(now)
  })
  return Object.freeze({ ok: true, nextBook, receipt })
}

export function createAuthoringInterventionSingleReceipt(persistedReceipt) {
  if (!persistedReceipt || persistedReceipt.kind !== 'authoring-intervention-adoption' || persistedReceipt.status !== 'persisted') {
    return null
  }
  return Object.freeze({
    schemaVersion: AUTHORING_INTERVENTION_ADOPTION_SCHEMA_VERSION,
    kind: 'authoring-intervention-umbrella',
    id: `intervention-umbrella:${persistedReceipt.id}`,
    projectId: persistedReceipt.projectId,
    sessionFingerprint: persistedReceipt.sessionFingerprint,
    groupCount: 1,
    chapterCount: 1,
    groups: Object.freeze([persistedReceipt]),
    affectedUnitRefs: Object.freeze([`unit:${persistedReceipt.target.chapterId}:${persistedReceipt.target.unitId}`]),
    status: 'persisted'
  })
}

export function prepareAuthoringInterventionUmbrellaUndo({ receipt, book, now = new Date().toISOString() } = {}) {
  if (!receipt || receipt.kind !== 'authoring-intervention-umbrella' || receipt.status !== 'persisted'
    || !book || text(book.id) !== text(receipt.projectId)) {
    return failure('intervention-umbrella-receipt-invalid')
  }
  const safe = []
  const unsafe = []
  for (const group of [...list(receipt.groups)].reverse()) {
    const chapter = list(book.chapters).find((item) => text(item?.id) === text(group.target?.chapterId))
    const live = documentNode(chapter?.editorDocument, group.target?.unitId, group.target?.nodeId)
    const unchanged = Boolean(live
      && getNodePlainText(live.node) === group.afterText
      && Number(live.unit.attrs?.unitRevision || 0) === Number(group.afterUnitRevision || 0)
      && Number(live.node.attrs?.nodeRevision || 0) === Number(group.afterNodeRevision || 0))
    if (unchanged) safe.push(group)
    else unsafe.push(Object.freeze({ ...group, undoReason: 'target-changed-after-adoption' }))
  }
  if (!safe.length) return failure('intervention-umbrella-nothing-safe-to-undo')

  const nextBook = clone(book)
  const chapterIds = [...new Set(safe.map((group) => group.target.chapterId))]
  for (const chapterId of chapterIds) {
    const previousChapter = list(book.chapters).find((chapter) => text(chapter?.id) === chapterId)
    const nextChapter = list(nextBook.chapters).find((chapter) => text(chapter?.id) === chapterId)
    const groups = safe.filter((group) => group.target.chapterId === chapterId)
    const patches = groups.map((group) => ({
      unitId: group.target.unitId,
      unitRevision: Number(group.afterUnitRevision || 0),
      nodeId: group.target.nodeId,
      nodeRevision: Number(group.afterNodeRevision || 0),
      start: 0,
      end: group.afterText.length,
      expectedText: group.afterText,
      replacement: group.beforeText
    }))
    const applied = applyWritingDocumentTextPatches(previousChapter?.editorDocument, patches, { now })
    if (!applied.ok || !nextChapter) return failure(applied.reason || 'intervention-umbrella-undo-failed')
    updateChapterDocument(nextChapter, previousChapter.editorDocument, applied.document, now)
  }
  nextBook.updatedAt = String(now)
  return Object.freeze({
    ok: true,
    nextBook,
    undoneGroups: Object.freeze(safe),
    unsafeGroups: Object.freeze(unsafe),
    remainingReceipt: unsafe.length
      ? Object.freeze({ ...receipt, groups: Object.freeze(unsafe), groupCount: unsafe.length, chapterCount: new Set(unsafe.map((group) => group.target.chapterId)).size })
      : null
  })
}
