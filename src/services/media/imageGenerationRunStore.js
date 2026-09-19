import { getItem, setItem, STORAGE_KEYS } from '../../composables/useStorage.js'

const LIMIT = 16
function text(value) { return value == null ? '' : String(value) }
function list() { const value = getItem(STORAGE_KEYS.IMAGE_GENERATION_RUNS); return Array.isArray(value) ? value : [] }
function write(value) { setItem(STORAGE_KEYS.IMAGE_GENERATION_RUNS, value.slice(0, LIMIT)) }
function normalize(raw = {}) {
  if (!raw.runId || !raw.scopeKey) return null
  return {
    schemaVersion: 1, runId: text(raw.runId), jobId: text(raw.jobId), scopeKey: text(raw.scopeKey),
    contextKey: text(raw.contextKey), projectId: raw.projectId == null ? null : text(raw.projectId),
    status: ['running', 'partial', 'interrupted'].includes(raw.status) ? raw.status : 'interrupted',
    prompt: text(raw.prompt).slice(0, 600), itemCount: Math.max(1, Math.min(4, Number(raw.itemCount) || 1)),
    items: (Array.isArray(raw.items) ? raw.items : []).slice(0, 4).map((item) => ({ id: text(item.id), state: text(item.state), mediaAssetId: text(item.mediaAssetId) })),
    updatedAt: Math.max(0, Number(raw.updatedAt) || Date.now())
  }
}
export function saveImageGenerationRun(input = {}) {
  const record = normalize({ ...input, updatedAt: Date.now() })
  if (!record) return null
  write([record, ...list().map(normalize).filter(Boolean).filter((item) => item.runId !== record.runId)])
  return record
}
export function loadImageGenerationRun(scopeKey) {
  const records = list().map(normalize).filter(Boolean)
  const record = records.find((item) => item.scopeKey === text(scopeKey)) || null
  if (record?.status === 'running') {
    record.status = 'interrupted'; record.updatedAt = Date.now()
    write([record, ...records.filter((item) => item.runId !== record.runId)])
  }
  return record
}
export function removeImageGenerationRun(runId) {
  write(list().map(normalize).filter(Boolean).filter((item) => item.runId !== text(runId)))
}
