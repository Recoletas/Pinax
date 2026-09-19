import { getItem, setItem, STORAGE_KEYS } from '../../../composables/useStorage.js'

const VERSION = 1
const LIMIT = 12
const TERMINAL = new Set(['completed', 'cancelled'])

function text(value) { return value == null ? '' : String(value) }
function records() { const value = getItem(STORAGE_KEYS.AUTHORING_REVIEW_RUNS); return Array.isArray(value) ? value : [] }
function keyOf(value = {}) { return [value.projectId, value.pane, value.documentRole, value.documentId].map(text).join('|') }
function safeBatch(batch = {}) {
  return {
    windowId: text(batch.windowId),
    findings: (Array.isArray(batch.findings) ? batch.findings : []).slice(0, 16).map((finding) => ({ ...finding }))
  }
}
function normalize(raw = {}) {
  if (Number(raw.schemaVersion) !== VERSION || !raw.id || !raw.documentId) return null
  return {
    schemaVersion: VERSION, id: text(raw.id), status: text(raw.status || 'interrupted'),
    projectId: text(raw.projectId), pane: raw.pane === 'dual' ? 'dual' : 'main',
    documentRole: raw.documentRole === 'exploration' ? 'exploration' : 'manuscript',
    documentId: text(raw.documentId), chapterId: text(raw.chapterId), documentRevision: text(raw.documentRevision),
    title: text(raw.title), goal: text(raw.goal).slice(0, 400), skillId: text(raw.skillId), scope: text(raw.scope),
    scopeRanges: (Array.isArray(raw.scopeRanges) ? raw.scopeRanges : []).map((range) => ({
      nodeId: text(range.nodeId), startOffset: Math.max(0, Number(range.startOffset) || 0), endOffset: Math.max(0, Number(range.endOffset) || 0)
    })).filter((range) => range.nodeId && range.endOffset > range.startOffset),
    batches: (Array.isArray(raw.batches) ? raw.batches : []).map(safeBatch).filter((batch) => batch.windowId),
    totalBatches: Math.max(0, Number(raw.totalBatches) || 0), updatedAt: Math.max(0, Number(raw.updatedAt) || Date.now())
  }
}
function write(next) { setItem(STORAGE_KEYS.AUTHORING_REVIEW_RUNS, next.slice(0, LIMIT)); return next }

export function saveAuthoringReviewRun(input = {}) {
  const record = normalize({ ...input, schemaVersion: VERSION, updatedAt: Date.now() })
  if (!record) return null
  const next = [record, ...records().map(normalize).filter(Boolean).filter((item) => item.id !== record.id)]
  write(next)
  return record
}

export function loadAuthoringReviewRun(source = {}) {
  const key = keyOf(source)
  const all = records().map(normalize).filter(Boolean)
  const record = all.find((item) => keyOf(item) === key && !TERMINAL.has(item.status)) || null
  if (record?.status === 'running') {
    record.status = 'interrupted'
    record.updatedAt = Date.now()
    write([record, ...all.filter((item) => item.id !== record.id)])
  }
  return record
}

export function removeAuthoringReviewRun(id) {
  write(records().map(normalize).filter(Boolean).filter((item) => item.id !== text(id)))
}
