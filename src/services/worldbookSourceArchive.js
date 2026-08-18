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
export const SOURCE_ARCHIVE_CAPACITY_BYTES = 64 * 1024 * 1024
export const SOURCE_ARCHIVE_WARNING_BYTES = 48 * 1024 * 1024
export const SOURCE_PARSE_SLOW_THRESHOLD_MS = 3000
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

function serializedByteLength(value) {
  const serialized = JSON.stringify(value ?? null)
  if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(serialized).length
  return serialized.length * 2
}

function createArchiveQuotaError(projectedBytes, currentBytes = 0) {
  const error = new Error(`本地资料归档将超过 ${Math.floor(SOURCE_ARCHIVE_CAPACITY_BYTES / 1024 / 1024)}MB 限制，请清理未引用资料后重试。`)
  error.name = 'QuotaExceededError'
  error.code = 'quota-exceeded'
  error.details = {
    currentBytes,
    projectedBytes,
    limitBytes: SOURCE_ARCHIVE_CAPACITY_BYTES
  }
  return error
}

function normalizeArchiveWriteError(error, fallbackMessage) {
  if (error?.name === 'QuotaExceededError' || error?.code === 'quota-exceeded') {
    return createArchiveQuotaError(SOURCE_ARCHIVE_CAPACITY_BYTES + 1)
  }
  return error || new Error(fallbackMessage)
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

function normalizeSourceParseMetrics(metrics) {
  const durationMs = Math.max(0, Number(metrics?.durationMs) || 0)
  const maxFileDurationMs = Math.max(0, Number(metrics?.maxFileDurationMs) || 0)
  return {
    durationMs,
    fileCount: Math.max(0, Number(metrics?.fileCount) || 0),
    maxFileDurationMs,
    slowFileCount: Math.max(0, Number(metrics?.slowFileCount) || 0),
    slowFileIndexes: [...new Set((Array.isArray(metrics?.slowFileIndexes) ? metrics.slowFileIndexes : [])
      .map((index) => Number(index))
      .filter((index) => Number.isInteger(index) && index >= 0))].slice(0, 64)
  }
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
    sourceParseMetrics: normalizeSourceParseMetrics(input.sourceParseMetrics),
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

async function loadAllStoreRecords(storeName) {
  const archive = hasIndexedDb() ? await openSourceArchiveDb() : null
  if (!archive) return [...memoryArchive[storeName].values()]
  const tx = archive.transaction(storeName, 'readonly')
  return requestToPromise(tx.objectStore(storeName).getAll())
}

function calculateArchiveUsage(records) {
  const artifacts = Array.isArray(records?.artifacts) ? records.artifacts : []
  const chunks = Array.isArray(records?.chunks) ? records.chunks : []
  const workspaces = Array.isArray(records?.workspaces) ? records.workspaces : []
  const usedBytes = [...artifacts, ...chunks, ...workspaces]
    .reduce((sum, record) => sum + serializedByteLength(record), 0)
  const usedChars = [...artifacts, ...chunks, ...workspaces]
    .reduce((sum, record) => sum + Number(record?.normalizedLength || record?.charCount || record?.text?.length || 0), 0)
  return {
    usedBytes,
    usedChars,
    artifactCount: artifacts.length,
    chunkCount: chunks.length,
    workspaceCount: workspaces.length,
    limitBytes: SOURCE_ARCHIVE_CAPACITY_BYTES,
    warningBytes: SOURCE_ARCHIVE_WARNING_BYTES,
    availableBytes: Math.max(0, SOURCE_ARCHIVE_CAPACITY_BYTES - usedBytes),
    percentage: Number(((usedBytes / SOURCE_ARCHIVE_CAPACITY_BYTES) * 100).toFixed(1))
  }
}

function replaceRecords(records, updates, removals) {
  const next = new Map(records.map((record) => [String(record.id), record]))
  for (const record of updates) next.set(String(record.id), record)
  for (const id of removals) next.delete(String(id))
  return [...next.values()]
}

async function assertArchiveCapacity({ artifacts = [], chunks = [], workspaces = [] } = {}) {
  const current = {
    artifacts: await loadAllStoreRecords(SOURCE_ARCHIVE_STORES.artifacts),
    chunks: await loadAllStoreRecords(SOURCE_ARCHIVE_STORES.chunks),
    workspaces: await loadAllStoreRecords(SOURCE_ARCHIVE_STORES.workspaces)
  }
  const projected = calculateArchiveUsage({
    artifacts: replaceRecords(current.artifacts, artifacts, []),
    chunks: replaceRecords(current.chunks, chunks, []),
    workspaces: replaceRecords(current.workspaces, workspaces, [])
  })
  if (projected.usedBytes > SOURCE_ARCHIVE_CAPACITY_BYTES) {
    throw createArchiveQuotaError(projected.usedBytes, calculateArchiveUsage(current).usedBytes)
  }
  return projected
}

export async function saveSourceArchiveBundle(bundle) {
  let artifact = normalizeSourceArtifact(bundle?.artifact)
  const allArtifacts = await loadAllStoreRecords(SOURCE_ARCHIVE_STORES.artifacts)
  const existing = allArtifacts.find((candidate) => candidate.contentHash === artifact.contentHash)
  if (existing) {
    return {
      artifact: existing,
      chunks: await loadSourceChunks(existing.chunkIds),
      reused: true
    }
  }
  const sameId = allArtifacts.find((candidate) => candidate.id === artifact.id)
  if (sameId && sameId.contentHash !== artifact.contentHash) {
    artifact = {
      ...artifact,
      id: `${artifact.id}-${artifact.contentHash.slice(-8)}`
    }
  }

  const incomingChunks = Array.isArray(bundle?.chunks) ? bundle.chunks : []
  const existingChunks = await loadAllStoreRecords(SOURCE_ARCHIVE_STORES.chunks)
  const chunksByHash = new Map(existingChunks.map((chunk) => [chunk.hash || hashSourceText(chunk.text), chunk]))
  const chunksToSave = []
  const chunkIds = []
  for (const [incomingIndex, incoming] of incomingChunks.entries()) {
    const normalized = normalizeSourceText(incoming?.text)
    if (!normalized) continue
    const hash = normalizeId(incoming?.hash, hashSourceText(normalized))
    const current = chunksByHash.get(hash)
    if (current) {
      const ref = sourceRefForChunk({ ...incoming, text: normalized, sourceId: artifact.id })
      const sourceRefs = [...(Array.isArray(current.sourceRefs) ? current.sourceRefs : []), ref]
        .filter((item, index, refs) => refs.findIndex((candidate) => (
          candidate.sourceId === item.sourceId
          && JSON.stringify(candidate.locator) === JSON.stringify(item.locator)
        )) === index)
      const updated = { ...current, sourceRefs }
      chunksByHash.set(hash, updated)
      chunksToSave.push(updated)
      chunkIds.push(current.id)
      continue
    }
    const created = {
      ...incoming,
      id: `${artifact.id}:chunk:${incomingIndex + 1}:${hash}`,
      sourceId: artifact.id,
      text: normalized,
      hash,
      charCount: normalized.length,
      sourceRefs: [sourceRefForChunk({ ...incoming, text: normalized, sourceId: artifact.id })]
    }
    chunksByHash.set(hash, created)
    chunksToSave.push(created)
    chunkIds.push(created.id)
  }
  const savedArtifact = { ...artifact, chunkIds }
  const saved = await saveSourceArchiveRecords([savedArtifact], chunksToSave)
  return { artifact: saved.artifacts[0], chunks: chunksToSave, reused: false }
}

async function saveSourceArchiveRecords(artifacts, chunks) {
  await assertArchiveCapacity({ artifacts, chunks })
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
    tx.onerror = () => reject(normalizeArchiveWriteError(tx.error, '来源归档写入失败'))
    tx.onabort = () => reject(normalizeArchiveWriteError(tx.error, '来源归档写入已取消'))
  })
  return { artifacts, chunks }
}

export async function archiveSourceDocuments(documents = [], options = {}) {
  const previewLength = Math.max(200, Number(options.previewLength) || 2400)
  const inputs = (Array.isArray(documents) ? documents : [])
    .map((document, index) => {
      const sourceText = normalizeSourceText(document?.content || document?.contentPreview || document?.preview)
      if (!sourceText) return null
      return {
        document,
        sourceText,
        bundle: buildSourceArchiveBundle({
          ...document,
          id: document?.id || `source_${index + 1}`,
          content: document?.content
        })
      }
    })
    .filter(Boolean)
  if (!inputs.length) return []

  const existingArtifacts = await loadAllStoreRecords(SOURCE_ARCHIVE_STORES.artifacts)
  const existingChunks = await loadAllStoreRecords(SOURCE_ARCHIVE_STORES.chunks)
  const artifactsById = new Map(existingArtifacts.map((artifact) => [String(artifact.id), artifact]))
  const artifactsByHash = new Map(existingArtifacts.map((artifact) => [String(artifact.contentHash), artifact]))
  const chunksByHash = new Map(existingChunks.map((chunk) => [chunk.hash || hashSourceText(chunk.text), chunk]))
  const existingChunksById = new Map(existingChunks.map((chunk) => [String(chunk.id), chunk]))
  const chunksById = new Map()
  const artifactsToSave = []
  const sourceDocuments = []

  const addSourceRef = (chunk, sourceId, locator) => {
    const sourceRefs = [
      ...(Array.isArray(chunk.sourceRefs) ? chunk.sourceRefs : []),
      sourceRefForChunk({ ...chunk, sourceId, locator })
    ].filter((item, index, refs) => refs.findIndex((candidate) => (
      candidate.sourceId === item.sourceId
      && JSON.stringify(candidate.locator) === JSON.stringify(item.locator)
    )) === index)
    return { ...chunk, sourceRefs }
  }

  for (const { document, sourceText, bundle } of inputs) {
    const referencedArtifact = document?.archiveRef
      ? artifactsById.get(String(document.archiveRef))
      : null
    const existingArtifact = referencedArtifact || artifactsByHash.get(bundle.artifact.contentHash)
    let artifact = existingArtifact

    if (!artifact) {
      const sameId = artifactsById.get(String(bundle.artifact.id))
      const physicalId = sameId && sameId.contentHash !== bundle.artifact.contentHash
        ? `${bundle.artifact.id}-${bundle.artifact.contentHash.slice(-8)}`
        : bundle.artifact.id
      const chunkIds = []
      for (const [incomingIndex, incoming] of bundle.chunks.entries()) {
        const normalized = normalizeSourceText(incoming?.text)
        if (!normalized) continue
        const hash = normalizeId(incoming?.hash, hashSourceText(normalized))
        const current = chunksByHash.get(hash)
        if (current) {
          const updated = addSourceRef(current, physicalId, incoming.locator)
          chunksByHash.set(hash, updated)
          chunksById.set(updated.id, updated)
          chunkIds.push(updated.id)
          continue
        }
        const created = {
          ...incoming,
          id: `${physicalId}:chunk:${incomingIndex + 1}:${hash}`,
          sourceId: physicalId,
          text: normalized,
          hash,
          charCount: normalized.length,
          sourceRefs: [sourceRefForChunk({ ...incoming, text: normalized, sourceId: physicalId })]
        }
        chunksByHash.set(hash, created)
        chunksById.set(created.id, created)
        chunkIds.push(created.id)
      }
      artifact = { ...bundle.artifact, id: physicalId, chunkIds }
      artifactsById.set(String(artifact.id), artifact)
      artifactsByHash.set(String(artifact.contentHash), artifact)
      artifactsToSave.push(artifact)
    }

    const logicalId = String(document?.id || artifact.id)
    for (const chunkId of artifact.chunkIds || []) {
      const current = chunksById.get(String(chunkId)) || existingChunksById.get(String(chunkId))
      if (!current) continue
      const physicalRef = (Array.isArray(current.sourceRefs) ? current.sourceRefs : [])
        .find((ref) => String(ref.sourceId) === String(artifact.id))
      const updated = addSourceRef(current, logicalId, physicalRef?.locator || current.locator)
      chunksById.set(String(chunkId), updated)
    }
    const rawPreview = sourceText.slice(0, previewLength)
    sourceDocuments.push({
      id: logicalId,
      title: String(document?.title || artifact.title),
      kind: String(document?.kind || artifact.kind),
      content: rawPreview,
      contentPreview: rawPreview,
      preview: rawPreview,
      sourceLabel: String(document?.sourceLabel || artifact.sourceLabel),
      originalLength: Math.max(sourceText.length, Number(document?.originalLength) || 0, Number(artifact.originalLength) || 0),
      normalizedLength: Number(artifact.normalizedLength || sourceText.length),
      truncated: sourceText.length > rawPreview.length || Number(artifact.normalizedLength) > rawPreview.length,
      archiveRef: artifact.id,
      chunkIds: artifact.chunkIds || [],
      contentHash: artifact.contentHash,
      createdAt: artifact.createdAt,
      warnings: artifact.warnings || []
    })
  }

  await saveSourceArchiveRecords(artifactsToSave, [...chunksById.values()])
  return sourceDocuments
}

export async function saveCreationWorkspace(workspace) {
  const normalized = createCreationWorkspace(workspace)
  await assertArchiveCapacity({ workspaces: [normalized] })
  const archive = hasIndexedDb() ? await openSourceArchiveDb() : null
  if (!archive) {
    memoryArchive.workspaces.set(normalized.id, normalized)
    return normalized
  }
  const tx = archive.transaction(SOURCE_ARCHIVE_STORES.workspaces, 'readwrite')
  tx.objectStore(SOURCE_ARCHIVE_STORES.workspaces).put(normalized)
  await new Promise((resolve, reject) => {
    tx.oncomplete = resolve
    tx.onerror = () => reject(normalizeArchiveWriteError(tx.error, '创建工作区写入失败'))
    tx.onabort = () => reject(normalizeArchiveWriteError(tx.error, '创建工作区写入已取消'))
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

export async function findSourceArtifactByContentHash(contentHash) {
  const hash = asText(contentHash).trim()
  if (!hash) return null
  const artifacts = await loadAllStoreRecords(SOURCE_ARCHIVE_STORES.artifacts)
  return artifacts.find((artifact) => artifact.contentHash === hash) || null
}

export async function estimateSourceArchiveUsage() {
  return calculateArchiveUsage({
    artifacts: await loadAllStoreRecords(SOURCE_ARCHIVE_STORES.artifacts),
    chunks: await loadAllStoreRecords(SOURCE_ARCHIVE_STORES.chunks),
    workspaces: await loadAllStoreRecords(SOURCE_ARCHIVE_STORES.workspaces)
  })
}

export async function deleteSourceArchiveArtifacts(sourceIds = []) {
  const targetIds = new Set((Array.isArray(sourceIds) ? sourceIds : [sourceIds]).map(String).filter(Boolean))
  if (!targetIds.size) return { deletedArtifactIds: [], deletedChunkIds: [], removedBytes: 0 }
  const artifacts = await loadAllStoreRecords(SOURCE_ARCHIVE_STORES.artifacts)
  const chunks = await loadAllStoreRecords(SOURCE_ARCHIVE_STORES.chunks)
  const removedArtifacts = artifacts.filter((artifact) => targetIds.has(String(artifact.id)))
  if (!removedArtifacts.length) return { deletedArtifactIds: [], deletedChunkIds: [], removedBytes: 0 }
  const remainingArtifacts = artifacts.filter((artifact) => !targetIds.has(String(artifact.id)))
  const referencedChunkIds = new Set(remainingArtifacts.flatMap((artifact) => artifact.chunkIds || []))
  const deletedChunkIds = []
  const updatedChunks = []
  for (const chunk of chunks) {
    if (!referencedChunkIds.has(chunk.id)) {
      if (removedArtifacts.some((artifact) => (artifact.chunkIds || []).includes(chunk.id))) deletedChunkIds.push(chunk.id)
      continue
    }
    const sourceRefs = (Array.isArray(chunk.sourceRefs) ? chunk.sourceRefs : [])
      .filter((ref) => !targetIds.has(String(ref.sourceId)))
    const remainingRefs = remainingArtifacts
      .filter((artifact) => (artifact.chunkIds || []).includes(chunk.id))
      .map((artifact) => ({ sourceId: artifact.id, locator: refLocatorForArtifactChunk(chunk, artifact.id) }))
    updatedChunks.push({ ...chunk, sourceRefs: remainingRefs.length ? remainingRefs : sourceRefs })
  }
  const archive = hasIndexedDb() ? await openSourceArchiveDb() : null
  const deletedArtifactIds = removedArtifacts.map((artifact) => artifact.id)
  if (!archive) {
    for (const id of deletedArtifactIds) memoryArchive.artifacts.delete(id)
    for (const chunk of updatedChunks) memoryArchive.chunks.set(chunk.id, chunk)
    for (const id of deletedChunkIds) memoryArchive.chunks.delete(id)
  } else {
    const tx = archive.transaction([SOURCE_ARCHIVE_STORES.artifacts, SOURCE_ARCHIVE_STORES.chunks], 'readwrite')
    const artifactStore = tx.objectStore(SOURCE_ARCHIVE_STORES.artifacts)
    const chunkStore = tx.objectStore(SOURCE_ARCHIVE_STORES.chunks)
    for (const id of deletedArtifactIds) artifactStore.delete(id)
    for (const id of deletedChunkIds) chunkStore.delete(id)
    for (const chunk of updatedChunks) chunkStore.put(chunk)
    await new Promise((resolve, reject) => {
      tx.oncomplete = resolve
      tx.onerror = () => reject(tx.error || new Error('来源归档清理失败'))
      tx.onabort = () => reject(tx.error || new Error('来源归档清理已取消'))
    })
  }
  return {
    deletedArtifactIds,
    deletedChunkIds,
    removedBytes: removedArtifacts.reduce((sum, artifact) => sum + serializedByteLength(artifact), 0)
      + chunks.filter((chunk) => deletedChunkIds.includes(chunk.id)).reduce((sum, chunk) => sum + serializedByteLength(chunk), 0)
  }
}

function refLocatorForArtifactChunk(chunk, sourceId) {
  return (Array.isArray(chunk.sourceRefs) ? chunk.sourceRefs : [])
    .find((ref) => String(ref.sourceId) === String(sourceId))?.locator
    || normalizeLocator(chunk.locator, 0, chunk.text?.length || 0)
}

export async function cleanupUnreferencedSourceArtifacts({ preserveSourceIds = [] } = {}) {
  const preserved = new Set((Array.isArray(preserveSourceIds) ? preserveSourceIds : []).map(String).filter(Boolean))
  const workspaces = await loadAllStoreRecords(SOURCE_ARCHIVE_STORES.workspaces)
  for (const workspace of workspaces) {
    for (const sourceId of workspace.sourceIds || []) preserved.add(String(sourceId))
  }
  const artifacts = await loadAllStoreRecords(SOURCE_ARCHIVE_STORES.artifacts)
  const orphanIds = artifacts.filter((artifact) => !preserved.has(String(artifact.id))).map((artifact) => artifact.id)
  return deleteSourceArchiveArtifacts(orphanIds)
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
