import {
  getCreationGenerationLabel,
  isCreationGenerationActive,
  normalizeCreationGenerationAction,
  normalizeCreationGenerationState
} from './worldbookCreationState'

/**
 * 世界书创建工作区的来源归档合同。
 *
 * worldStore 只持有正式世界书和来源引用；长正文进入 SourceChunk。
 * 这里的纯函数供解析器、提炼器和测试共享，IndexedDB 适配器放在文件末尾。
 */

export const SOURCE_ARCHIVE_SCHEMA_VERSION = 1
export const SOURCE_ARCHIVE_DB_NAME = 'pinax-source-archive'
export const SOURCE_ARCHIVE_DB_VERSION = 1
export const SOURCE_ARCHIVE_STORES = Object.freeze({
  artifacts: 'artifacts',
  chunks: 'chunks',
  workspaces: 'workspaces'
})

const DEFAULT_CHUNK_SIZE = 6000
const memoryArchive = {
  artifacts: new Map(),
  chunks: new Map(),
  workspaces: new Map()
}

function asText(value) {
  return String(value ?? '')
}

export function normalizeSourceText(value) {
  return asText(value)
    .replace(/\r\n?/g, '\n')
    .split(String.fromCharCode(0)).join('')
    .trim()
}

export function hashSourceText(value) {
  let hash = 2166136261
  for (const character of asText(value)) {
    hash ^= character.codePointAt(0)
    hash = Math.imul(hash, 16777619)
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, '0')}`
}

function normalizeId(value, fallback) {
  const text = asText(value).trim()
  return text || fallback
}

function normalizeLocator(locator, fallbackStart = 0, fallbackEnd = fallbackStart) {
  if (locator && typeof locator === 'object') {
    return {
      ...locator,
      type: normalizeId(locator.type, 'offset'),
      start: Number.isFinite(Number(locator.start)) ? Number(locator.start) : fallbackStart,
      end: Number.isFinite(Number(locator.end)) ? Number(locator.end) : fallbackEnd
    }
  }
  return { type: 'offset', start: fallbackStart, end: fallbackEnd }
}

function normalizeSourceFailures(failures) {
  return (Array.isArray(failures) ? failures : [])
    .map((failure, index) => ({
      id: normalizeId(failure?.id, `failed-source-${index + 1}`),
      title: normalizeId(failure?.title, '未命名文件'),
      kind: normalizeId(failure?.kind, 'text-file'),
      status: failure?.status === 'needs-ocr' ? 'needs-ocr' : 'error',
      error: {
        code: normalizeId(failure?.error?.code, 'parse-failed'),
        message: normalizeId(failure?.error?.message || failure?.error, '文件解析失败。').slice(0, 500)
      }
    }))
    .slice(0, 64)
}

function chooseChunkEnd(text, start, limit) {
  const hardEnd = Math.min(text.length, start + limit)
  if (hardEnd >= text.length) return hardEnd
  const newline = text.lastIndexOf('\n', hardEnd)
  if (newline > start + Math.floor(limit * 0.55)) return newline
  return hardEnd
}

export function buildSourceChunks(content, options = {}) {
  const text = normalizeSourceText(content)
  if (!text) return []

  const sourceId = normalizeId(options.sourceId, 'source-unknown')
  const chunkSize = Math.max(256, Number(options.chunkSize) || DEFAULT_CHUNK_SIZE)
  const chunks = []
  let start = 0

  while (start < text.length) {
    let end = chooseChunkEnd(text, start, chunkSize)
    if (end <= start) end = Math.min(text.length, start + chunkSize)
    const chunkText = text.slice(start, end).trim()
    const leadingWhitespace = text.slice(start, end).search(/\S/)
    const contentStart = leadingWhitespace < 0 ? start : start + leadingWhitespace
    const contentEnd = contentStart + chunkText.length
    if (chunkText) {
      const hash = hashSourceText(chunkText)
      chunks.push({
        id: `${sourceId}:chunk:${chunks.length + 1}:${hash}`,
        sourceId,
        text: chunkText,
        hash,
        charCount: chunkText.length,
        locator: normalizeLocator(options.locator, contentStart, contentEnd),
        sourceRefs: [{
          sourceId,
          locator: normalizeLocator(options.locator, contentStart, contentEnd)
        }]
      })
    }
    start = end
  }

  return chunks
}

export function normalizeSourceArtifact(input = {}) {
  const hasContent = Object.prototype.hasOwnProperty.call(input, 'content')
  const content = normalizeSourceText(input.content)
  const id = normalizeId(input.id, `source_${Date.now().toString(36)}`)
  return {
    schemaVersion: SOURCE_ARCHIVE_SCHEMA_VERSION,
    id,
    title: normalizeId(input.title, '导入资料'),
    kind: normalizeId(input.kind, 'reference-text'),
    sourceLabel: normalizeId(input.sourceLabel, '本地资料'),
    originalLength: Number.isFinite(Number(input.originalLength))
      ? Number(input.originalLength)
      : asText(input.content).length,
    normalizedLength: hasContent
      ? content.length
      : Number(input.normalizedLength) || 0,
    contentHash: hasContent
      ? hashSourceText(content)
      : normalizeId(input.contentHash, hashSourceText(content)),
    createdAt: Number(input.createdAt) || Date.now(),
    file: input.file && typeof input.file === 'object'
      ? {
          name: normalizeId(input.file.name, ''),
          mime: normalizeId(input.file.mime, ''),
          size: Number(input.file.size) || 0,
          hash: normalizeId(input.file.hash, '')
        }
      : null,
    chunkIds: Array.isArray(input.chunkIds) ? input.chunkIds.map(String).filter(Boolean) : [],
    warnings: Array.isArray(input.warnings) ? input.warnings.map(String).filter(Boolean) : []
  }
}

export function buildSourceArchiveBundle(input = {}) {
  const rawContent = asText(input.content)
  const normalizedText = normalizeSourceText(input.content)
  const artifact = normalizeSourceArtifact({
    ...input,
    content: normalizedText,
    originalLength: rawContent.length
  })
  const chunks = buildSourceChunks(normalizedText, {
    sourceId: artifact.id,
    chunkSize: input.chunkSize,
    locator: input.locator
  })
  return {
    artifact: { ...artifact, chunkIds: chunks.map((chunk) => chunk.id) },
    chunks
  }
}

function sourceRefForChunk(chunk) {
  return {
    sourceId: chunk.sourceId,
    locator: normalizeLocator(chunk.locator, 0, chunk.text?.length || 0)
  }
}

export function dedupeSourceChunks(chunks = [], existingChunks = []) {
  const byHash = new Map()
  const append = (rawChunk, isExisting = false) => {
    const text = normalizeSourceText(rawChunk?.text)
    if (!text) return false
    const hash = normalizeId(rawChunk?.hash, hashSourceText(text))
    const current = byHash.get(hash)
    const ref = sourceRefForChunk({ ...rawChunk, text })
    if (current) {
      const refs = [...current.sourceRefs, ref]
      current.sourceRefs = refs.filter((item, index) => refs.findIndex((candidate) => (
        candidate.sourceId === item.sourceId
        && JSON.stringify(candidate.locator) === JSON.stringify(item.locator)
      )) === index)
      return !isExisting
    }
    byHash.set(hash, {
      ...rawChunk,
      id: normalizeId(rawChunk?.id, `chunk:${hash}`),
      text,
      hash,
      charCount: text.length,
      sourceRefs: [
        ...(Array.isArray(rawChunk?.sourceRefs) ? rawChunk.sourceRefs : []),
        ref
      ].filter((item, index, refs) => refs.findIndex((candidate) => (
        candidate.sourceId === item.sourceId
        && JSON.stringify(candidate.locator) === JSON.stringify(item.locator)
      )) === index)
    })
    return false
  }

  for (const chunk of Array.isArray(existingChunks) ? existingChunks : []) append(chunk, true)
  let duplicateCount = 0
  for (const chunk of Array.isArray(chunks) ? chunks : []) {
    if (append(chunk)) duplicateCount += 1
  }
  return { chunks: [...byHash.values()], duplicateCount }
}

export function createCreationWorkspace(input = {}) {
  const now = Number(input.updatedAt || input.createdAt) || Date.now()
  const generationState = normalizeCreationGenerationState(input.generationState)
  return {
    schemaVersion: SOURCE_ARCHIVE_SCHEMA_VERSION,
    id: normalizeId(input.id, `creation_${now.toString(36)}`),
    mode: ['sources', 'structured-import', 'brief'].includes(input.mode) ? input.mode : 'sources',
    name: asText(input.name).trim(),
    sourceIds: [...new Set((Array.isArray(input.sourceIds) ? input.sourceIds : []).map(String).filter(Boolean))],
    selectedSourceIds: [...new Set((Array.isArray(input.selectedSourceIds) ? input.selectedSourceIds : []).map(String).filter(Boolean))],
    sourceFailures: normalizeSourceFailures(input.sourceFailures),
    brief: asText(input.brief).trim(),
    foundationDraft: input.foundationDraft && typeof input.foundationDraft === 'object'
      ? structuredClone(input.foundationDraft)
      : null,
    status: ['draft', 'processing', 'ready', 'error'].includes(input.status) ? input.status : 'draft',
    generationState,
    generationAction: normalizeCreationGenerationAction(input.generationAction),
    generationErrorCode: asText(input.generationErrorCode).trim().slice(0, 80),
    generationMessage: asText(input.generationMessage).trim().slice(0, 500),
    generationStartedAt: Number(input.generationStartedAt) || 0,
    generationCompletedAt: Number(input.generationCompletedAt) || 0,
    createdAt: Number(input.createdAt) || now,
    updatedAt: now,
    error: asText(input.error).trim()
  }
}

function recoverInterruptedCreationWorkspace(workspace) {
  if (!workspace) return null
  const normalized = createCreationWorkspace(workspace)
  if (!isCreationGenerationActive(normalized.generationState)) return normalized
  return createCreationWorkspace({
    ...normalized,
    status: 'error',
    generationState: 'cancelled',
    generationErrorCode: 'interrupted',
    generationMessage: `上次${getCreationGenerationLabel(workspace.generationState)}在离开页面时中断，已保留已完成结果。`,
    updatedAt: Date.now()
  })
}

function hasIndexedDb() {
  return typeof indexedDB !== 'undefined' && typeof indexedDB.open === 'function'
}

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error || new Error('IndexedDB 请求失败'))
  })
}

async function openSourceArchiveDb() {
  if (!hasIndexedDb()) return null
  const request = indexedDB.open(SOURCE_ARCHIVE_DB_NAME, SOURCE_ARCHIVE_DB_VERSION)
  request.onupgradeneeded = () => {
    const db = request.result
    for (const storeName of Object.values(SOURCE_ARCHIVE_STORES)) {
      if (!db.objectStoreNames.contains(storeName)) db.createObjectStore(storeName, { keyPath: 'id' })
    }
  }
  return requestToPromise(request)
}

export async function saveSourceArchiveBundle(bundle) {
  const artifact = normalizeSourceArtifact(bundle?.artifact)
  const chunks = Array.isArray(bundle?.chunks) ? bundle.chunks : []
  const saved = await saveSourceArchiveRecords([artifact], chunks)
  return { artifact: saved.artifacts[0], chunks: saved.chunks }
}

async function saveSourceArchiveRecords(artifacts, chunks) {
  const archive = hasIndexedDb() ? await openSourceArchiveDb() : null
  if (!archive) {
    for (const artifact of artifacts) {
      memoryArchive.artifacts.set(artifact.id, artifact)
    }
    for (const chunk of chunks) memoryArchive.chunks.set(chunk.id, chunk)
    return { artifacts, chunks }
  }
  const tx = archive.transaction(Object.values(SOURCE_ARCHIVE_STORES), 'readwrite')
  for (const artifact of artifacts) tx.objectStore(SOURCE_ARCHIVE_STORES.artifacts).put(artifact)
  for (const chunk of chunks) tx.objectStore(SOURCE_ARCHIVE_STORES.chunks).put(chunk)
  await new Promise((resolve, reject) => {
    tx.oncomplete = resolve
    tx.onerror = () => reject(tx.error || new Error('来源归档写入失败'))
    tx.onabort = () => reject(tx.error || new Error('来源归档写入已取消'))
  })
  return { artifacts, chunks }
}

export async function archiveSourceDocuments(documents = [], options = {}) {
  const previewLength = Math.max(200, Number(options.previewLength) || 2400)
  const bundles = (Array.isArray(documents) ? documents : [])
    .map((document, index) => ({
      sourceText: normalizeSourceText(document?.content),
      ...buildSourceArchiveBundle({
        ...document,
        id: document?.id || `source_${index + 1}`,
        content: document?.content
      })
    }))
    .filter((bundle) => bundle.artifact.normalizedLength > 0)
  if (!bundles.length) return []

  const deduped = dedupeSourceChunks(bundles.flatMap((bundle) => bundle.chunks))
  const canonicalByHash = new Map(deduped.chunks.map((chunk) => [chunk.hash, chunk]))
  const artifacts = bundles.map((bundle) => {
    const chunkIds = bundle.chunks
      .map((chunk) => canonicalByHash.get(chunk.hash)?.id)
      .filter(Boolean)
    const artifact = { ...bundle.artifact, chunkIds }
    const rawText = normalizeSourceText(bundle.sourceText || '')
    const preview = rawText.slice(0, previewLength)
    return {
      ...artifact,
      preview,
      archiveRef: artifact.id,
      sourceDocument: {
        id: artifact.id,
        title: artifact.title,
        kind: artifact.kind,
        content: preview,
        preview,
        sourceLabel: artifact.sourceLabel,
        originalLength: artifact.originalLength,
        normalizedLength: artifact.normalizedLength,
        truncated: rawText.length > preview.length,
        archiveRef: artifact.id,
        chunkIds,
        contentHash: artifact.contentHash,
        createdAt: artifact.createdAt,
        warnings: artifact.warnings
      }
    }
  })

  const artifactRecords = artifacts.map((item) => {
    const artifact = { ...item }
    delete artifact.sourceDocument
    return artifact
  })
  await saveSourceArchiveRecords(artifactRecords, deduped.chunks)
  return artifacts.map(({ sourceDocument }) => sourceDocument)
}

export async function saveCreationWorkspace(workspace) {
  const normalized = createCreationWorkspace(workspace)
  const archive = hasIndexedDb() ? await openSourceArchiveDb() : null
  if (!archive) {
    memoryArchive.workspaces.set(normalized.id, normalized)
    return normalized
  }
  const tx = archive.transaction(SOURCE_ARCHIVE_STORES.workspaces, 'readwrite')
  tx.objectStore(SOURCE_ARCHIVE_STORES.workspaces).put(normalized)
  await new Promise((resolve, reject) => {
    tx.oncomplete = resolve
    tx.onerror = () => reject(tx.error || new Error('创建工作区写入失败'))
    tx.onabort = () => reject(tx.error || new Error('创建工作区写入已取消'))
  })
  return normalized
}

export async function loadCreationWorkspace(id) {
  const key = asText(id).trim()
  if (!key) return null
  const archive = hasIndexedDb() ? await openSourceArchiveDb() : null
  if (!archive) return recoverInterruptedCreationWorkspace(memoryArchive.workspaces.get(key) || null)
  const tx = archive.transaction(SOURCE_ARCHIVE_STORES.workspaces, 'readonly')
  const loaded = await requestToPromise(tx.objectStore(SOURCE_ARCHIVE_STORES.workspaces).get(key))
  return recoverInterruptedCreationWorkspace(loaded)
}

async function loadSourceRecords(storeName, ids = []) {
  const keys = [...new Set((Array.isArray(ids) ? ids : [ids]).map(String).filter(Boolean))]
  if (!keys.length) return []
  const archive = hasIndexedDb() ? await openSourceArchiveDb() : null
  if (!archive) {
    const records = memoryArchive[storeName]
    return keys.map((key) => records.get(key)).filter(Boolean)
  }

  const tx = archive.transaction(storeName, 'readonly')
  const store = tx.objectStore(storeName)
  const records = await Promise.all(keys.map((key) => requestToPromise(store.get(key))))
  return records.filter(Boolean)
}

export function loadSourceArtifacts(ids = []) {
  return loadSourceRecords(SOURCE_ARCHIVE_STORES.artifacts, ids)
}

export function loadSourceChunks(ids = []) {
  return loadSourceRecords(SOURCE_ARCHIVE_STORES.chunks, ids)
}

export async function deleteCreationWorkspace(id) {
  const key = asText(id).trim()
  if (!key) return false
  const archive = hasIndexedDb() ? await openSourceArchiveDb() : null
  if (!archive) return memoryArchive.workspaces.delete(key)
  const tx = archive.transaction(SOURCE_ARCHIVE_STORES.workspaces, 'readwrite')
  tx.objectStore(SOURCE_ARCHIVE_STORES.workspaces).delete(key)
  await new Promise((resolve, reject) => {
    tx.oncomplete = resolve
    tx.onerror = () => reject(tx.error || new Error('创建工作区删除失败'))
    tx.onabort = () => reject(tx.error || new Error('创建工作区删除已取消'))
  })
  return true
}
