import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { CHAPTER_SIDECAR_KEYS } from '@pinax/core/domain/chapterPatch'
import { chapterRevision } from '@pinax/core/domain/chapter'

export const documentHash = value => createHash('sha256').update(value).digest('hex')
export function documentBinding(record, content, { appendedNewline = true } = {}) {
  const metadata = { ...record, id: String(record.id) }
  for (const key of ['content', 'fileSourceHash', 'fileChanged', 'relativePath']) delete metadata[key]
  return { record: metadata, contentHash: documentHash(content), appendedNewline }
}
export function readBoundDocument(raw, binding, fallback, { chapter = false } = {}) {
  if (!binding) return { ...fallback, content: raw, fileSourceHash: documentHash(raw) }
  if (!binding.record || typeof binding.record.id !== 'string' || !binding.record.id || !/^[a-f0-9]{64}$/.test(binding.contentHash)) {
    throw Object.assign(new Error('文档身份记录损坏，未按文件名重建ID'), { code: 'ERR_DOCUMENT_METADATA' })
  }
  const changed = documentHash(raw) !== binding.contentHash
  // Current records contain exact source text. Earlier metadata emitted one
  // extra newline; strip it only for an exact legacy match, never an external edit.
  const record = { ...binding.record, content: changed || binding.appendedNewline === false ? raw : raw.slice(0, -1), fileSourceHash: documentHash(raw), fileChanged: changed }
  if (changed && chapter) {
    for (const key of CHAPTER_SIDECAR_KEYS) delete record[key]
    record.revision = chapterRevision(binding.record) + 1
  }
  return record
}

export function orderBoundDocuments(records, bindings) {
  if (!bindings) return records
  const positions = new Map(Object.keys(bindings).map((name, index) => [name, index]))
  return records.sort((a, b) => (positions.get(a.relativePath.split('/').at(-1)) ?? Number.MAX_SAFE_INTEGER) - (positions.get(b.relativePath.split('/').at(-1)) ?? Number.MAX_SAFE_INTEGER))
}

export function loadDocumentMetadata(root) {
  const file = path.join(root, 'meta.json')
  if (!fs.existsSync(file)) return null
  if (fs.lstatSync(file).isSymbolicLink()) throw Object.assign(new Error('文档身份文件不能是符号链接'), { code: 'ERR_DOCUMENT_METADATA' })
  return parseDocumentMetadata(fs.readFileSync(file, 'utf8'))
}

export function parseDocumentMetadata(text) {
  let value
  try { value = JSON.parse(text) }
  catch { throw Object.assign(new Error('meta.json损坏，文档身份不可核对'), { code: 'ERR_DOCUMENT_METADATA' }) }
  const object = item => item !== null && typeof item === 'object' && !Array.isArray(item)
  if (!object(value)) throw Object.assign(new Error('文档身份记录不是对象'), { code: 'ERR_DOCUMENT_METADATA' })
  if (value.documentSchema === 1 && (!object(value.book) || !value.book.id || !object(value.chapterFiles) || !object(value.explorationFiles))) throw Object.assign(new Error('文档身份记录不完整'), { code: 'ERR_DOCUMENT_METADATA' })
  if (value.documentSchema !== undefined && value.documentSchema !== 1) throw Object.assign(new Error('文档身份版本不兼容'), { code: 'ERR_DOCUMENT_METADATA' })
  return value
}

export function renderDocumentText(record) {
  const text = String(record.content ?? '')
  const unchangedRaw = record.fileSourceHash && documentHash(text) === record.fileSourceHash
  return { text: unchangedRaw ? text : `${text}\n`, appendedNewline: !unchangedRaw }
}
