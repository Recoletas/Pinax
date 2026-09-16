import { STORAGE_KEYS } from '../../composables/useStorage'
import { normalizeImagePresentation, normalizeSourceRefs } from './narrativeAssets'

export const MEDIA_ASSET_SCHEMA_VERSION = 1
export const MEDIA_DATABASE_NAME = 'pinax-media'
export const MEDIA_BINARY_STORE_NAME = 'assets'

const MEDIA_KINDS = new Set(['image', 'comic-page', 'video', 'audio'])
const MEDIA_PURPOSES = new Set([
  'illustration',
  'comic-panel',
  'storyboard-reference',
  'storyboard-take'
])
const MEDIA_STATUSES = new Set(['draft', 'accepted', 'rejected', 'superseded'])
const libraryOperationQueues = new WeakMap()

export function createMediaAsset(input = {}) {
  const now = Date.now()
  const id = normalizeText(input.id) || createMediaAssetId()
  const projectId = normalizeNullableText(input.projectId)

  return {
    id,
    schemaVersion: MEDIA_ASSET_SCHEMA_VERSION,
    projectId,
    kind: MEDIA_KINDS.has(input.kind) ? input.kind : 'image',
    purpose: MEDIA_PURPOSES.has(input.purpose) ? input.purpose : 'illustration',
    sourceRefs: normalizeSourceRefs(input.sourceRefs, { projectId }),
    parentAssetId: normalizeNullableText(input.parentAssetId),
    generationJobId: normalizeNullableText(input.generationJobId),
    provider: normalizeText(input.provider),
    model: normalizeText(input.model),
    promptSnapshot: String(input.promptSnapshot || ''),
    generationParams: normalizeSerializableObject(input.generationParams),
    storageRef: normalizeText(input.storageRef) || buildMediaStorageRef(id),
    externalUrl: normalizeNullableText(input.externalUrl),
    mimeType: normalizeText(input.mimeType) || 'application/octet-stream',
    width: normalizePositiveNumber(input.width),
    height: normalizePositiveNumber(input.height),
    durationSeconds: normalizePositiveNumber(input.durationSeconds),
    status: MEDIA_STATUSES.has(input.status) ? input.status : 'draft',
    createdAt: normalizeTimestamp(input.createdAt, now),
    updatedAt: now
  }
}

export function saveExternalMediaAsset(input = {}, options = {}) {
  const storage = resolveStorage(options.storage)
  const externalUrl = normalizeText(input.externalUrl)
  if (!/^https?:\/\//i.test(externalUrl)) throw new Error('外部媒体地址无效')
  const asset = createMediaAsset({
    ...input,
    externalUrl,
    storageRef: `external:${externalUrl}`
  })
  const current = readMetadata(storage)
  writeMetadata(storage, [asset, ...current.filter((item) => item.id !== asset.id)])
  return asset
}

export function listMediaAssets(filters = {}, options = {}) {
  const assets = readMetadata(resolveStorage(options.storage))
  return assets
    .filter((asset) => filters.projectId === undefined || asset.projectId === filters.projectId)
    .filter((asset) => !filters.kind || asset.kind === filters.kind)
    .filter((asset) => !filters.purpose || asset.purpose === filters.purpose)
    .filter((asset) => !filters.status || asset.status === filters.status)
    .filter((asset) => !filters.sourceRef || hasSourceRef(asset, filters.sourceRef))
    .sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0))
}

export async function saveMediaAsset(input = {}, options = {}) {
  const storage = resolveStorage(options.storage)
  const binaryStore = resolveBinaryStore(options.binaryStore, options.indexedDBImpl)
  throwIfAborted(options.signal)
  const blob = await normalizeBinary(options.binary)
  throwIfAborted(options.signal)
  const asset = createMediaAsset({
    ...input,
    mimeType: input.mimeType || blob.type
  })
  const current = readMetadata(storage)
  const previousAsset = current.find((item) => item.id === asset.id) || null
  const previousBlob = previousAsset ? await binaryStore.get(asset.id) : null
  let binaryStored = false
  let metadataStored = false

  try {
    throwIfAborted(options.signal)
    await binaryStore.put(asset.id, blob)
    binaryStored = true
    throwIfAborted(options.signal)
    const latest = readMetadata(storage)
    writeMetadata(storage, [asset, ...latest.filter((item) => item.id !== asset.id)])
    metadataStored = true
    throwIfAborted(options.signal)
  } catch (error) {
    if (metadataStored) {
      try {
        const latest = readMetadata(storage).filter((item) => item.id !== asset.id)
        writeMetadata(storage, previousAsset ? [previousAsset, ...latest] : latest)
      } catch { /* best-effort rollback */ }
    }
    if (binaryStored) {
      if (previousBlob) await binaryStore.put(asset.id, previousBlob).catch(() => {})
      else await binaryStore.delete(asset.id).catch(() => {})
    }
    throw error
  }
  return asset
}

export async function getMediaAsset(assetId, options = {}) {
  const asset = listMediaAssets({}, options).find((item) => item.id === assetId)
  if (!asset) return null
  const binaryStore = resolveBinaryStore(options.binaryStore, options.indexedDBImpl)
  const blob = await binaryStore.get(asset.id)
  return { asset, blob }
}

export async function getMediaAssetDataUrl(assetId, options = {}) {
  const resolved = await getMediaAsset(assetId, options)
  if (!resolved?.blob) return ''
  return blobToDataUrl(resolved.blob)
}

export function updateMediaAsset(assetId, patch = {}, options = {}) {
  const storage = resolveStorage(options.storage)
  const current = readMetadata(storage)
  let updated = null
  const next = current.map((asset) => {
    if (asset.id !== assetId) return asset
    updated = createMediaAsset({
      ...asset,
      ...patch,
      id: asset.id,
      storageRef: asset.storageRef,
      createdAt: asset.createdAt
    })
    return updated
  })
  if (!updated) return null
  writeMetadata(storage, next)
  return updated
}

export async function deleteMediaAsset(assetId, options = {}) {
  const storage = resolveStorage(options.storage)
  const current = readMetadata(storage)
  const asset = current.find((item) => item.id === assetId) || null
  if (!asset) return null
  const binaryStore = resolveBinaryStore(options.binaryStore, options.indexedDBImpl)
  const previousBlob = await binaryStore.get(asset.id)
  let binaryDeleted = false
  try {
    await binaryStore.delete(asset.id)
    binaryDeleted = true
    const latest = readMetadata(storage)
    writeMetadata(storage, latest.filter((item) => item.id !== asset.id))
    return asset
  } catch (error) {
    if (binaryDeleted && previousBlob) await binaryStore.put(asset.id, previousBlob).catch(() => {})
    throw error
  }
}

export function addGeneratedImageToLibrary(libraryKey, entry = {}, options = {}) {
  const storage = resolveStorage(options.storage)
  return enqueueLibraryOperation(storage, libraryKey, () => addGeneratedImageToLibraryUnlocked(
    libraryKey,
    entry,
    { ...options, storage }
  ))
}

async function addGeneratedImageToLibraryUnlocked(libraryKey, entry = {}, options = {}) {
  if (!entry.data) throw new Error('生成图片缺少可归档内容')
  const storage = resolveStorage(options.storage)
  throwIfAborted(options.signal)
  const generationParams = normalizeSerializableObject(entry.generationParams)
  const asset = await saveMediaAsset({
    id: entry.mediaAssetId,
    projectId: options.projectId,
    kind: 'image',
    purpose: options.purpose || 'illustration',
    sourceRefs: options.sourceRefs,
    parentAssetId: entry.parentAssetId || options.parentAssetId,
    generationJobId: entry.generationJobId || options.generationJobId,
    provider: entry.modelType,
    model: entry.modelId || entry.modelName,
    promptSnapshot: entry.prompt,
    generationParams: {
      ...generationParams,
      negativePrompt: String(entry.negativePrompt ?? generationParams.negativePrompt ?? ''),
      modelName: String(entry.modelName ?? generationParams.modelName ?? ''),
      modelId: String(entry.modelId ?? generationParams.modelId ?? ''),
      providerPrompt: String(entry.providerPrompt ?? generationParams.providerPrompt ?? entry.prompt ?? ''),
      promptSupplement: String(entry.promptSupplement ?? generationParams.promptSupplement ?? ''),
      mode: String(entry.mode ?? generationParams.mode ?? ''),
      width: entry.width ?? generationParams.width ?? null,
      height: entry.height ?? generationParams.height ?? null,
      referenceImageIds: normalizeStringList(entry.referenceImageIds ?? generationParams.referenceImageIds),
      referenceCount: normalizePositiveNumber(entry.referenceCount ?? generationParams.referenceCount),
      referenceStrength: normalizePositiveNumber(entry.referenceStrength ?? generationParams.referenceStrength),
      presentation: normalizeImagePresentation(entry.presentation ?? generationParams.presentation),
      generationContext: normalizeSerializableRecord(entry.generationContext ?? generationParams.generationContext),
      authoringVisualBrief: normalizeSerializableRecord(entry.authoringVisualBrief ?? generationParams.authoringVisualBrief),
      sessionId: String(entry.generationSessionId ?? generationParams.sessionId ?? generationParams.generationSessionId ?? ''),
      fingerprint: String(entry.contextFingerprint ?? generationParams.fingerprint ?? generationParams.contextFingerprint ?? ''),
      sourceRevisions: normalizeSerializableObject(entry.sourceRevisions ?? generationParams.sourceRevisions),
      contextKey: String(entry.contextKey ?? generationParams.contextKey ?? '')
    },
    mimeType: entry.mimeType,
    width: entry.width ?? generationParams.width,
    height: entry.height ?? generationParams.height,
    status: entry.status || 'draft',
    createdAt: entry.createdAt
  }, {
    binary: entry.data,
    storage,
    binaryStore: options.binaryStore,
    indexedDBImpl: options.indexedDBImpl,
    signal: options.signal
  })
  const libraryEntry = {
    id: normalizeText(entry.id) || `img_${asset.id}`,
    mediaAssetId: asset.id,
    createdAt: normalizeCreatedAt(entry.createdAt, asset.createdAt)
  }
  try {
    throwIfAborted(options.signal)
    const latest = readImageLibrary(storage, libraryKey)
    writeImageLibrary(storage, libraryKey, [
      libraryEntry,
      ...latest.filter((item) => item.id !== libraryEntry.id && item.mediaAssetId !== asset.id)
    ].slice(0, options.limit || 20))
    throwIfAborted(options.signal)
    return hydrateGeneratedImageEntry(libraryEntry, asset, entry.data)
  } catch (error) {
    try {
      const latest = readImageLibrary(storage, libraryKey)
      writeImageLibrary(storage, libraryKey, latest.filter((item) => (
        item.id !== libraryEntry.id && item.mediaAssetId !== asset.id
      )))
    } catch { /* best-effort rollback */ }
    await deleteMediaAsset(asset.id, {
      storage,
      binaryStore: options.binaryStore,
      indexedDBImpl: options.indexedDBImpl
    }).catch(() => {})
    throw error
  }
}

export function removeGeneratedImageFromLibrary(libraryKey, entryOrId, options = {}) {
  const storage = resolveStorage(options.storage)
  return enqueueLibraryOperation(storage, libraryKey, () => removeGeneratedImageFromLibraryUnlocked(
    libraryKey,
    entryOrId,
    { ...options, storage }
  ))
}

async function removeGeneratedImageFromLibraryUnlocked(libraryKey, entryOrId, options = {}) {
  const storage = resolveStorage(options.storage)
  const current = readImageLibrary(storage, libraryKey)
  const requestedId = normalizeText(typeof entryOrId === 'object' ? entryOrId?.id : entryOrId)
  const requestedMediaId = normalizeText(typeof entryOrId === 'object' ? entryOrId?.mediaAssetId : '')
  const matched = current.find((entry) => (
    (requestedId && normalizeText(entry.id) === requestedId)
    || (requestedMediaId && normalizeText(entry.mediaAssetId) === requestedMediaId)
  )) || null
  if (!matched) {
    if (requestedMediaId) {
      await deleteMediaAsset(requestedMediaId, {
        storage,
        binaryStore: options.binaryStore,
        indexedDBImpl: options.indexedDBImpl
      })
    }
    return null
  }

  writeImageLibrary(storage, libraryKey, current.filter((entry) => entry !== matched))
  const mediaAssetId = normalizeText(matched.mediaAssetId || requestedMediaId)
  try {
    if (mediaAssetId) {
      await deleteMediaAsset(mediaAssetId, {
        storage,
        binaryStore: options.binaryStore,
        indexedDBImpl: options.indexedDBImpl
      })
    }
  } catch (error) {
    const latest = readImageLibrary(storage, libraryKey)
    if (!latest.some((entry) => imageLibraryEntryKey(entry) === imageLibraryEntryKey(matched))) {
      writeImageLibrary(storage, libraryKey, [matched, ...latest])
    }
    throw error
  }
  return matched
}

export function loadGeneratedImageLibrary(libraryKey, options = {}) {
  const storage = resolveStorage(options.storage)
  return enqueueLibraryOperation(storage, libraryKey, () => loadGeneratedImageLibraryUnlocked(
    libraryKey,
    { ...options, storage }
  ))
}

async function loadGeneratedImageLibraryUnlocked(libraryKey, options = {}) {
  const storage = resolveStorage(options.storage)
  const binaryStore = resolveBinaryStore(options.binaryStore, options.indexedDBImpl)
  const current = readImageLibrary(storage, libraryKey).slice(0, options.limit || 20)
  const refs = []
  const hydrated = []

  for (const entry of current) {
    try {
      if (entry.mediaAssetId) {
        refs.push(toImageLibraryRef(entry))
        const resolved = await getMediaAsset(entry.mediaAssetId, { storage, binaryStore })
        if (resolved?.blob && matchesMediaFilters(resolved.asset, options)) {
          hydrated.push(hydrateGeneratedImageEntry(entry, resolved.asset, await blobToDataUrl(resolved.blob)))
        }
        continue
      }
      if (!entry.data) continue
      const legacyGenerationParams = normalizeSerializableObject(entry.generationParams)

      const asset = await saveMediaAsset({
        id: `media_${normalizeText(entry.id) || createMediaAssetId()}`,
        projectId: entry.projectId ?? options.projectId,
        kind: 'image',
        purpose: entry.mediaPurpose || entry.purpose || options.purpose || 'illustration',
        sourceRefs: entry.sourceRefs ?? options.sourceRefs,
        parentAssetId: entry.parentAssetId,
        generationJobId: entry.generationJobId,
        provider: entry.modelType,
        model: entry.modelId || entry.modelName,
        promptSnapshot: entry.prompt,
        generationParams: {
          ...legacyGenerationParams,
          negativePrompt: String(entry.negativePrompt ?? legacyGenerationParams.negativePrompt ?? ''),
          modelName: String(entry.modelName ?? legacyGenerationParams.modelName ?? ''),
          modelId: String(entry.modelId ?? legacyGenerationParams.modelId ?? ''),
          providerPrompt: String(entry.providerPrompt ?? legacyGenerationParams.providerPrompt ?? entry.prompt ?? ''),
          promptSupplement: String(entry.promptSupplement ?? legacyGenerationParams.promptSupplement ?? ''),
          mode: String(entry.mode ?? legacyGenerationParams.mode ?? ''),
          width: entry.width ?? legacyGenerationParams.width ?? null,
          height: entry.height ?? legacyGenerationParams.height ?? null,
          referenceImageIds: normalizeStringList(entry.referenceImageIds ?? legacyGenerationParams.referenceImageIds),
          referenceCount: normalizePositiveNumber(entry.referenceCount ?? legacyGenerationParams.referenceCount),
          referenceStrength: normalizePositiveNumber(entry.referenceStrength ?? legacyGenerationParams.referenceStrength),
          presentation: normalizeImagePresentation(entry.presentation ?? legacyGenerationParams.presentation),
          generationContext: normalizeSerializableRecord(entry.generationContext ?? legacyGenerationParams.generationContext),
          authoringVisualBrief: normalizeSerializableRecord(entry.authoringVisualBrief ?? legacyGenerationParams.authoringVisualBrief),
          sessionId: String(entry.generationSessionId ?? legacyGenerationParams.sessionId ?? legacyGenerationParams.generationSessionId ?? ''),
          fingerprint: String(entry.contextFingerprint ?? legacyGenerationParams.fingerprint ?? legacyGenerationParams.contextFingerprint ?? ''),
          sourceRevisions: normalizeSerializableObject(entry.sourceRevisions ?? legacyGenerationParams.sourceRevisions),
          contextKey: String(entry.contextKey ?? legacyGenerationParams.contextKey ?? '')
        },
        width: entry.width ?? legacyGenerationParams.width,
        height: entry.height ?? legacyGenerationParams.height,
        createdAt: entry.createdAt
      }, { binary: entry.data, storage, binaryStore })
      const ref = {
        id: normalizeText(entry.id) || `img_${asset.id}`,
        mediaAssetId: asset.id,
        createdAt: normalizeCreatedAt(entry.createdAt, asset.createdAt)
      }
      refs.push(ref)
      hydrated.push(hydrateGeneratedImageEntry(ref, asset, entry.data))
    } catch {
      refs.push(entry)
      if (entry.data) hydrated.push(entry)
    }
  }

  const latest = readImageLibrary(storage, libraryKey)
  writeImageLibrary(storage, libraryKey, mergeLoadedLibraryRefs(latest, current, refs, options.limit || 20))
  return hydrated
}

export function saveGeneratedImageLibraryRefs(libraryKey, entries = [], options = {}) {
  const storage = resolveStorage(options.storage)
  const current = readImageLibrary(storage, libraryKey)
  const refs = entries
    .map((entry) => entry?.mediaAssetId ? toImageLibraryRef(entry) : entry)
    .filter((entry) => entry?.mediaAssetId || entry?.data)
  const represented = new Set(refs.map(imageLibraryEntryKey))
  const merged = [
    ...refs,
    ...current.filter((entry) => !represented.has(imageLibraryEntryKey(entry)))
  ].slice(0, options.limit || 20)
  writeImageLibrary(storage, libraryKey, merged)
  return merged
}

export function createIndexedDbBinaryStore(options = {}) {
  const indexedDBImpl = options.indexedDBImpl || globalThis.indexedDB
  return {
    put: (id, blob) => runIndexedDbRequest(indexedDBImpl, 'readwrite', (store) => store.put(blob, id)),
    get: (id) => runIndexedDbRequest(indexedDBImpl, 'readonly', (store) => store.get(id)),
    delete: (id) => runIndexedDbRequest(indexedDBImpl, 'readwrite', (store) => store.delete(id)),
    keys: () => runIndexedDbRequest(indexedDBImpl, 'readonly', (store) => store.getAllKeys())
  }
}

// C2 · 工作区备份导出/恢复 adapter（批量枚举与逐个读写，不改变既有单资产 API）
export function listMediaBinaryIds(options = {}) {
  const store = resolveBinaryStore(options.binaryStore, options.indexedDBImpl)
  return store.keys()
}

export function getMediaBinaryById(id, options = {}) {
  const store = resolveBinaryStore(options.binaryStore, options.indexedDBImpl)
  return store.get(id)
}

export function putMediaBinaryById(id, blob, options = {}) {
  const store = resolveBinaryStore(options.binaryStore, options.indexedDBImpl)
  return store.put(id, blob)
}

export function deleteMediaBinaryById(id, options = {}) {
  const store = resolveBinaryStore(options.binaryStore, options.indexedDBImpl)
  return store.delete(id)
}

function readMetadata(storage) {
  try {
    const parsed = JSON.parse(storage.getItem(STORAGE_KEYS.MEDIA_ASSETS) || '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeMetadata(storage, assets) {
  storage.setItem(STORAGE_KEYS.MEDIA_ASSETS, JSON.stringify(assets))
}

function readImageLibrary(storage, libraryKey) {
  if (!libraryKey) return []
  try {
    const parsed = JSON.parse(storage.getItem(libraryKey) || '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeImageLibrary(storage, libraryKey, entries) {
  if (!libraryKey) throw new Error('图片历史缺少存储键')
  storage.setItem(libraryKey, JSON.stringify(entries))
}

function enqueueLibraryOperation(storage, libraryKey, task) {
  let queues = libraryOperationQueues.get(storage)
  if (!queues) {
    queues = new Map()
    libraryOperationQueues.set(storage, queues)
  }
  const key = String(libraryKey || '')
  const previous = queues.get(key) || Promise.resolve()
  const running = previous.catch(() => {}).then(task)
  queues.set(key, running)
  return running.finally(() => {
    if (queues.get(key) === running) queues.delete(key)
  })
}

function mergeLoadedLibraryRefs(latest, snapshot, replacements, limit) {
  const snapshotIds = new Set(snapshot.map((entry) => normalizeText(entry?.id)).filter(Boolean))
  const replacementById = new Map(
    replacements.map((entry) => [normalizeText(entry?.id), entry]).filter(([id]) => id)
  )
  const seen = new Set()
  return latest
    .map((entry) => {
      const id = normalizeText(entry?.id)
      return snapshotIds.has(id) && replacementById.has(id) ? replacementById.get(id) : entry
    })
    .filter((entry) => {
      const key = `${normalizeText(entry?.id)}|${imageLibraryEntryKey(entry)}`
      if (!key || seen.has(key)) return false
      seen.add(key)
      return true
    })
    .slice(0, limit)
}

function resolveStorage(storage) {
  const resolved = storage || globalThis.localStorage
  if (!resolved?.getItem || !resolved?.setItem) throw new Error('当前环境不支持媒体元数据存储')
  return resolved
}

function resolveBinaryStore(binaryStore, indexedDBImpl) {
  return binaryStore || createIndexedDbBinaryStore({ indexedDBImpl })
}

function runIndexedDbRequest(indexedDBImpl, mode, execute) {
  if (!indexedDBImpl?.open) return Promise.reject(new Error('当前环境不支持 IndexedDB 媒体存储'))

  return openMediaDatabase(indexedDBImpl).then((database) => new Promise((resolve, reject) => {
    const transaction = database.transaction(MEDIA_BINARY_STORE_NAME, mode)
    const request = execute(transaction.objectStore(MEDIA_BINARY_STORE_NAME))
    let result = null

    request.onsuccess = () => { result = request.result ?? null }
    request.onerror = () => reject(request.error || new Error('媒体二进制存储请求失败'))
    transaction.oncomplete = () => {
      database.close()
      resolve(result)
    }
    transaction.onerror = () => {
      database.close()
      reject(transaction.error || new Error('媒体二进制存储事务失败'))
    }
    transaction.onabort = () => {
      database.close()
      reject(transaction.error || new Error('媒体二进制存储事务已取消'))
    }
  }))
}

function openMediaDatabase(indexedDBImpl) {
  return new Promise((resolve, reject) => {
    const request = indexedDBImpl.open(MEDIA_DATABASE_NAME, 1)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(MEDIA_BINARY_STORE_NAME)) {
        request.result.createObjectStore(MEDIA_BINARY_STORE_NAME)
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error || new Error('无法打开媒体数据库'))
  })
}

async function normalizeBinary(binary) {
  if (binary instanceof Blob) return binary
  if (binary instanceof ArrayBuffer) return new Blob([binary])
  if (ArrayBuffer.isView(binary)) return new Blob([binary])
  if (typeof binary === 'string' && binary.startsWith('data:')) return dataUrlToBlob(binary)
  throw new Error('媒体资产缺少可存储的二进制内容')
}

function dataUrlToBlob(dataUrl) {
  const separator = dataUrl.indexOf(',')
  if (separator < 0) throw new Error('媒体 data URL 格式无效')
  const header = dataUrl.slice(5, separator)
  const encoded = dataUrl.slice(separator + 1)
  const [mimeType = 'application/octet-stream', encoding = ''] = header.split(';')
  const decoded = encoding === 'base64' ? atob(encoded) : decodeURIComponent(encoded)
  const bytes = new Uint8Array(decoded.length)
  for (let index = 0; index < decoded.length; index += 1) bytes[index] = decoded.charCodeAt(index)
  return new Blob([bytes], { type: mimeType })
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => resolve(reader.result)
    reader.onerror = () => reject(reader.error || new Error('无法读取媒体内容'))
    reader.readAsDataURL(blob)
  })
}

function hydrateGeneratedImageEntry(libraryEntry, asset, data) {
  const generationParams = normalizeSerializableObject(asset.generationParams)
  return {
    id: libraryEntry.id,
    mediaAssetId: asset.id,
    storageRef: asset.storageRef,
    projectId: asset.projectId,
    sourceRefs: normalizeSourceRefs(asset.sourceRefs, { projectId: asset.projectId }),
    parentAssetId: asset.parentAssetId,
    generationJobId: asset.generationJobId,
    prompt: asset.promptSnapshot,
    negativePrompt: generationParams.negativePrompt || '',
    providerPrompt: generationParams.providerPrompt || asset.promptSnapshot,
    promptSupplement: generationParams.promptSupplement || '',
    mode: generationParams.mode || '',
    modelName: generationParams.modelName || asset.model,
    modelId: generationParams.modelId || asset.model,
    modelType: asset.provider,
    referenceImageIds: normalizeStringList(generationParams.referenceImageIds),
    referenceCount: normalizePositiveNumber(generationParams.referenceCount),
    referenceStrength: normalizePositiveNumber(generationParams.referenceStrength),
    presentation: normalizeImagePresentation(generationParams.presentation),
    generationParams,
    generationContext: normalizeSerializableRecord(generationParams.generationContext),
    authoringVisualBrief: normalizeSerializableRecord(generationParams.authoringVisualBrief),
    generationSessionId: String(generationParams.sessionId || generationParams.generationSessionId || ''),
    contextFingerprint: String(generationParams.fingerprint || generationParams.contextFingerprint || ''),
    sourceRevisions: normalizeSerializableObject(generationParams.sourceRevisions),
    contextKey: String(generationParams.contextKey || ''),
    mediaPurpose: asset.purpose,
    width: asset.width,
    height: asset.height,
    data,
    createdAt: normalizeCreatedAt(libraryEntry.createdAt, asset.createdAt)
  }
}

function toImageLibraryRef(entry) {
  return {
    id: normalizeText(entry.id),
    mediaAssetId: normalizeText(entry.mediaAssetId),
    createdAt: normalizeCreatedAt(entry.createdAt)
  }
}

function imageLibraryEntryKey(entry) {
  return normalizeText(entry?.mediaAssetId) || normalizeText(entry?.id)
}

function hasSourceRef(asset, sourceRef) {
  return asset.sourceRefs?.some((ref) => (
    ref.refType === sourceRef.refType
    && ref.refId === sourceRef.refId
    && (sourceRef.projectId === undefined || ref.projectId === sourceRef.projectId)
  ))
}

function matchesMediaFilters(asset, filters) {
  if (filters.projectId !== undefined && asset.projectId !== filters.projectId) return false
  if (filters.purpose && asset.purpose !== filters.purpose) return false
  if (Array.isArray(filters.sourceRefs) && filters.sourceRefs.length > 0) {
    return filters.sourceRefs.every((sourceRef) => hasSourceRef(asset, sourceRef))
  }
  return true
}

function buildMediaStorageRef(assetId) {
  return `idb://${MEDIA_DATABASE_NAME}/${MEDIA_BINARY_STORE_NAME}/${assetId}`
}

function createMediaAssetId() {
  return `media_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeNullableText(value) {
  const normalized = normalizeText(value)
  return normalized || null
}

function normalizePositiveNumber(value) {
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? number : null
}

function normalizeStringList(value) {
  if (!Array.isArray(value)) return []
  return [...new Set(value.map(normalizeText).filter(Boolean))].slice(0, 12)
}

function normalizeTimestamp(value, fallback) {
  const number = Number(value)
  if (Number.isFinite(number) && number > 0) return number
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function normalizeCreatedAt(value, fallback = Date.now()) {
  return new Date(normalizeTimestamp(value, fallback)).toISOString()
}

function normalizeSerializableObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  try {
    return JSON.parse(JSON.stringify(value))
  } catch {
    return {}
  }
}

function normalizeSerializableRecord(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  try {
    return JSON.parse(JSON.stringify(value))
  } catch {
    return null
  }
}

function throwIfAborted(signal) {
  if (!signal?.aborted) return
  if (signal.reason instanceof Error) throw signal.reason
  if (typeof DOMException === 'function') throw new DOMException('操作已取消', 'AbortError')
  const error = new Error('操作已取消')
  error.name = 'AbortError'
  throw error
}
