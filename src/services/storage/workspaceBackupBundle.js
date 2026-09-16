import JSZip from 'jszip'
import { STORAGE_KEYS } from '../../composables/useStorage'
import {
  BACKUP_VERSION,
  buildBackup,
  createRestorePlan,
  getPinaxBackupKeys,
  PINAX_BACKUP_DYNAMIC_PREFIXES,
  PINAX_BACKUP_SECRET_KEYS,
  restoreBackup
} from '../../utils/backupExport'
import {
  SOURCE_ARCHIVE_SCHEMA_VERSION,
  SOURCE_ARCHIVE_STORES,
  assertArchiveCapacity,
  loadAllSourceArchiveRecords,
  replaceAllSourceArchiveRecords,
  restoreSourceArchiveRecords
} from '../worldbook/worldbookSourceArchive'
import {
  MEDIA_ASSET_SCHEMA_VERSION,
  deleteMediaBinaryById,
  getMediaBinaryById,
  putMediaBinaryById
} from '../media/mediaAssetStore'
import { sha256HexOfBytes, utf8Bytes } from './backupHash'
import { collectMemoryHistory, importMemoryHistory, rollbackImportedMemoryHistory, validateMemoryHistory } from '../memory/memoryHistoryStore'

/**
 * C1–C4 · 完整工作区备份 v3（ZIP）。
 *
 * 结构（固定，见夜间任务书 §6 C1）：
 *   manifest.json                       —— format/version/app/域计数/文件 SHA-256/excludedSecrets/缺失项
 *   local-storage.json                  —— 与 v2 JSON 完全一致的 buildBackup() 产物
 *   source-archive/{artifacts,chunks,workspaces}.json
 *   media/metadata.json                 —— 媒体元数据（与 local-storage 内 MEDIA_ASSETS 键同源）
 *   media/binaries/<asset-id>.<ext>     —— 已落盘媒体二进制
 *
 * 约束：
 * - 模型密钥等 secret-config 键不进入备份（沿用 backupExport 排除策略）。
 * - inspectWorkspaceBackup 在任何写入前完成路径白名单、manifest/版本/app、逐文件 SHA-256、
 *   key policy 与 schema 校验；任何不一致整包拒绝。
 * - restoreWorkspaceBackupBundle 顺序 source → media → localStorage（v2 owner 最后写），
 *   任一步失败按相反顺序补偿回滚；不声称跨存储 ACID，只保证本次可识别写入的补偿。
 * - 幂等：同一包恢复两次，第二次全部进入 skip。
 */

export const WORKSPACE_BACKUP_FORMAT = 'pinax-workspace-backup'
export const WORKSPACE_BACKUP_VERSION = 3

const LOCAL_STORAGE_PATH = 'local-storage.json'
const MEMORY_HISTORY_PATH = 'memory-history/revisions.json'
const SOURCE_ARCHIVE_PATHS = {
  artifacts: 'source-archive/artifacts.json',
  chunks: 'source-archive/chunks.json',
  workspaces: 'source-archive/workspaces.json'
}
const MEDIA_METADATA_PATH = 'media/metadata.json'
const MEDIA_BINARY_PREFIX = 'media/binaries/'
const ZIP_ENTRY_WHITELIST = new Set([
  'manifest.json',
  LOCAL_STORAGE_PATH,
  MEMORY_HISTORY_PATH,
  ...Object.values(SOURCE_ARCHIVE_PATHS),
  MEDIA_METADATA_PATH
])

const MIME_EXTENSIONS = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/svg+xml': 'svg',
  'application/octet-stream': 'bin'
}

function bytesToBase64(bytes) {
  let binary = ''
  const chunkSize = 0x8000
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize))
  }
  return btoa(binary)
}

function base64ToBytes(base64) {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return bytes
}

export class WorkspaceBackupCancelled extends Error {
  constructor(message = '工作区备份操作已取消') {
    super(message)
    this.name = 'WorkspaceBackupCancelled'
  }
}

function assertLive(signal) {
  if (signal?.aborted) throw new WorkspaceBackupCancelled()
}

function jsonBytes(value) {
  return utf8Bytes(JSON.stringify(value))
}

function readMediaAssets(storage) {
  try {
    const parsed = JSON.parse(storage.getItem(STORAGE_KEYS.MEDIA_ASSETS) || '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function extensionFor(mimeType, storageRef) {
  const normalized = String(mimeType || '').toLowerCase()
  if (MIME_EXTENSIONS[normalized]) return MIME_EXTENSIONS[normalized]
  const refMatch = String(storageRef || '').match(/\.([a-z0-9]{2,5})$/i)
  return refMatch ? refMatch[1].toLowerCase() : 'bin'
}

async function blobToUint8(blob) {
  if (!blob) return null
  if (blob instanceof Uint8Array) return blob
  if (typeof blob === 'string') return utf8Bytes(blob)
  if (typeof blob.arrayBuffer === 'function') return new Uint8Array(await blob.arrayBuffer())
  return null
}

async function toUint8(input) {
  if (input instanceof Uint8Array) return input
  if (ArrayBuffer.isView(input)) return new Uint8Array(input.buffer, input.byteOffset, input.byteLength)
  if (input instanceof ArrayBuffer) return new Uint8Array(input)
  if (typeof Blob !== 'undefined' && input instanceof Blob) return new Uint8Array(await input.arrayBuffer())
  if (typeof input === 'string') return utf8Bytes(input)
  throw new Error('不支持的备份输入类型')
}

function isAllowedBinaryPath(path) {
  if (!path.startsWith(MEDIA_BINARY_PREFIX)) return false
  const name = path.slice(MEDIA_BINARY_PREFIX.length)
  return Boolean(name) && !name.includes('/') && !name.includes('\\') && !name.includes('..')
}

async function readEntryBytes(entry) {
  // 与写入侧约定一致：二进制条目以 base64 存取（uint8array 直读在 jsdom 不可用）
  const base64 = await entry.async('base64')
  return base64ToBytes(base64)
}

async function readZipEntries(bytes) {
  let zip
  try {
    zip = await JSZip.loadAsync(bytes)
  } catch {
    return { error: '备份不是有效的 ZIP 文件' }
  }
  const entries = new Map()
  const unknownPaths = []
  for (const [path, entry] of Object.entries(zip.files)) {
    if (entry.dir) continue
    const originalPath = entry.unsafeOriginalName || path
    if (originalPath !== path || !ZIP_ENTRY_WHITELIST.has(path) && !isAllowedBinaryPath(path)) {
      unknownPaths.push(originalPath)
      continue
    }
    entries.set(path, entry)
  }
  return { entries, unknownPaths }
}

async function readJsonEntry(entries, path) {
  const entry = entries.get(path)
  if (!entry) return { missing: true }
  try {
    return { value: JSON.parse(await entry.async('string')) }
  } catch {
    return { error: `${path} 不是有效 JSON` }
  }
}

function binaryPathFor(asset) {
  return `${MEDIA_BINARY_PREFIX}${asset.id}.${extensionFor(asset.mimeType, asset.storageRef)}`
}

function mediaExternalOnly(asset) {
  return Boolean(asset.externalUrl) && !asset.storageRef
}

// ---------- C1/C2 · 导出 ----------

export async function buildWorkspaceBackupBundle({
  storage = localStorage,
  includeSecrets = false,
  signal,
  binaryStore = undefined
} = {}) {
  assertLive(signal)
  const localStorageBackup = buildBackup({ storage, includeSecrets })
  const memoryHistory = await collectMemoryHistory(storage)
  const sourceRecords = await loadAllSourceArchiveRecords()
  assertLive(signal)

  const mediaAssets = readMediaAssets(storage)
  const binaries = []
  const missingBinaryIds = []
  const externalOnlyIds = []
  let mediaBytes = 0
  for (const asset of mediaAssets) {
    assertLive(signal)
    if (mediaExternalOnly(asset)) {
      externalOnlyIds.push(asset.id)
      continue
    }
    let blob = null
    try {
      blob = await getMediaBinaryById(asset.id, { binaryStore })
    } catch {
      blob = null
    }
    const bytes = await blobToUint8(blob)
    if (!bytes) {
      missingBinaryIds.push(asset.id)
      continue
    }
    mediaBytes += bytes.length
    binaries.push({ asset, path: binaryPathFor(asset), bytes })
  }

  const sourceCounts = {
    artifactCount: sourceRecords.artifacts.length,
    chunkCount: sourceRecords.chunks.length,
    workspaceCount: sourceRecords.workspaces.length
  }

  const manifest = {
    format: WORKSPACE_BACKUP_FORMAT,
    version: WORKSPACE_BACKUP_VERSION,
    createdAt: new Date().toISOString(),
    app: 'Pinax',
    domains: {
      memoryHistory: { schemaVersion: 1, revisionCount: memoryHistory.length },
      localStorage: {
        schemaVersion: BACKUP_VERSION,
        keyCount: localStorageBackup.keyCount,
        bytes: jsonBytes(localStorageBackup).length
      },
      sourceArchive: {
        schemaVersion: SOURCE_ARCHIVE_SCHEMA_VERSION,
        ...sourceCounts
      },
      media: {
        schemaVersion: MEDIA_ASSET_SCHEMA_VERSION,
        assetCount: mediaAssets.length,
        binaryCount: binaries.length,
        externalCount: externalOnlyIds.length,
        missingBinaryIds,
        bytes: mediaBytes
      }
    },
    files: {},
    excludedSecretKeys: localStorageBackup.excludedSecretKeys,
    warnings: []
  }

  const zip = new JSZip()
  // jsdom 兼容：文本条目以字符串写入；二进制条目以 base64 写入（uint8array 直写在 jsdom 读不回）
  const addTextFile = (path, text) => {
    zip.file(path, text)
    manifest.files[path] = sha256HexOfBytes(utf8Bytes(text))
  }
  const addBinaryFile = (path, bytes) => {
    zip.file(path, bytesToBase64(bytes), { base64: true })
    manifest.files[path] = sha256HexOfBytes(bytes)
  }
  addTextFile(LOCAL_STORAGE_PATH, JSON.stringify(localStorageBackup))
  addTextFile(MEMORY_HISTORY_PATH, JSON.stringify(memoryHistory))
  addTextFile(SOURCE_ARCHIVE_PATHS.artifacts, JSON.stringify(sourceRecords.artifacts))
  addTextFile(SOURCE_ARCHIVE_PATHS.chunks, JSON.stringify(sourceRecords.chunks))
  addTextFile(SOURCE_ARCHIVE_PATHS.workspaces, JSON.stringify(sourceRecords.workspaces))
  addTextFile(MEDIA_METADATA_PATH, JSON.stringify(mediaAssets))
  for (const binary of binaries) {
    assertLive(signal)
    addBinaryFile(binary.path, binary.bytes)
  }
  if (missingBinaryIds.length > 0) {
    manifest.warnings.push(`${missingBinaryIds.length} 个媒体缺少本地二进制，未包含在备份中`)
  }
  if (externalOnlyIds.length > 0) {
    manifest.warnings.push(`${externalOnlyIds.length} 个媒体为外部链接引用，只记录元数据`)
  }
  // manifest 在全部文件哈希与 warning 收集完成后写入（manifest 不给自己做哈希）
  zip.file('manifest.json', JSON.stringify(manifest))

  const archiveBytes = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' })
  return {
    bytes: archiveBytes,
    manifest,
    stats: {
      zipBytes: archiveBytes.length,
      localStorageKeys: localStorageBackup.keyCount,
      ...sourceCounts,
      mediaAssetCount: mediaAssets.length,
      mediaBinaryCount: binaries.length,
      missingBinaryIds,
      externalOnlyIds
    }
  }
}

function triggerZipDownload(bytes, filename) {
  const blob = new Blob([bytes], { type: 'application/zip' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  setTimeout(() => URL.revokeObjectURL(url), 4000)
}

export async function exportWorkspaceBackupBundle(options = {}) {
  const bundle = await buildWorkspaceBackupBundle(options)
  const filename = `pinax-workspace-backup-${options.timestampSuffix || Date.now()}.zip`
  triggerZipDownload(bundle.bytes, filename)
  return { filename, manifest: bundle.manifest, stats: bundle.stats }
}

// ---------- C3 · 预览与校验 ----------

function invalidInspection(errors, warnings = []) {
  return {
    valid: false,
    errors,
    warnings,
    version: null,
    localStoragePlan: null,
    rejectedSecretKeys: [],
    unknownKeys: [],
    sourceArchive: { add: [], overwrite: [], skip: [], unrestoreable: [], counts: {} },
    media: { add: [], overwrite: [], skip: [], missingBinaryIds: [], externalOnly: [], unrestoreable: [] },
    counts: { add: 0, overwrite: 0, skip: 0, missingBinary: 0, unrestoreable: 0 },
    requiresRiskConfirmation: false
  }
}

function diffRecordSets(incomingRecords, currentRecords) {
  const currentById = new Map(currentRecords.map((record) => [String(record.id), record]))
  const add = []
  const overwrite = []
  const skip = []
  for (const record of incomingRecords) {
    const current = currentById.get(String(record.id))
    if (!current) add.push(record)
    else if (JSON.stringify(current) === JSON.stringify(record)) skip.push(record)
    else overwrite.push(record)
  }
  return { add, overwrite, skip }
}

export async function inspectWorkspaceBackup(input, { storage = localStorage, signal } = {}) {
  assertLive(signal)
  const warnings = []
  const bytes = await toUint8(input)
  assertLive(signal)

  const { entries, unknownPaths, error: zipError } = await readZipEntries(bytes)
  if (zipError) return invalidInspection([zipError])
  if (unknownPaths.length > 0) {
    return invalidInspection([`备份包含未知文件：${unknownPaths.slice(0, 3).join('、')}`])
  }
  if (!entries.has('manifest.json')) return invalidInspection(['备份缺少 manifest.json'])
  if (!entries.has(LOCAL_STORAGE_PATH)) return invalidInspection(['备份缺少 local-storage.json'])

  const manifestEntry = await readJsonEntry(entries, 'manifest.json')
  if (manifestEntry.error) return invalidInspection([manifestEntry.error])
  const manifest = manifestEntry.value
  if (!manifest || typeof manifest !== 'object') return invalidInspection(['manifest 不是对象'])
  if (manifest.format !== WORKSPACE_BACKUP_FORMAT) return invalidInspection(['备份来源不是 Pinax 完整工作区备份'])
  if (manifest.app !== 'Pinax') return invalidInspection(['备份来源不是 Pinax'])
  const version = Number(manifest.version)
  if (version !== WORKSPACE_BACKUP_VERSION) {
    return invalidInspection([`不支持的完整工作区备份版本：${Number.isFinite(version) ? version : '未知'}`])
  }
  if (!manifest.files || typeof manifest.files !== 'object') return invalidInspection(['manifest 缺少文件清单'])
  if (Number(manifest.domains?.sourceArchive?.schemaVersion) !== SOURCE_ARCHIVE_SCHEMA_VERSION) {
    return invalidInspection(['来源归档 schema 版本不受支持'])
  }
  if (Number(manifest.domains?.media?.schemaVersion) !== MEDIA_ASSET_SCHEMA_VERSION) {
    return invalidInspection(['媒体 schema 版本不受支持'])
  }

  // 逐文件 SHA-256：任何不一致整包拒绝
  for (const [path, expectedHash] of Object.entries(manifest.files)) {
    const entry = entries.get(path)
    if (!entry) return invalidInspection([`manifest 声明的文件缺失：${path}`])
    const actualBytes = await readEntryBytes(entry)
    assertLive(signal)
    const actualHash = sha256HexOfBytes(actualBytes)
    if (actualHash !== expectedHash) {
      return invalidInspection([`文件校验失败：${path} 的内容与 manifest 记录不一致`])
    }
  }
  const declaredPaths = new Set(Object.keys(manifest.files))
  for (const path of entries.keys()) {
    if (path !== 'manifest.json' && !declaredPaths.has(path)) {
      return invalidInspection([`文件未在 manifest 中声明：${path}`])
    }
  }

  // localStorage 域：先剥离 secret/未知键（默认拒绝导入），再走 v2 计划
  let memoryHistoryCount = 0
  if (manifest.domains?.memoryHistory || entries.has(MEMORY_HISTORY_PATH)) {
    const history = await readJsonEntry(entries, MEMORY_HISTORY_PATH)
    try {
      if (manifest.domains?.memoryHistory?.schemaVersion !== 1 || history.error || history.missing) throw new Error('记忆历史文件或版本缺失')
      memoryHistoryCount = validateMemoryHistory(history.value).length
      if (memoryHistoryCount !== manifest.domains.memoryHistory.revisionCount) throw new Error('记忆历史数量校验失败')
    } catch (error) { return invalidInspection([error.message]) }
  }
  const lsEntry = await readJsonEntry(entries, LOCAL_STORAGE_PATH)
  if (lsEntry.error) return invalidInspection([lsEntry.error])
  const lsBackup = lsEntry.value
  if (!lsBackup || typeof lsBackup !== 'object' || !lsBackup.keys) {
    return invalidInspection(['local-storage.json 缺少有效的 keys 对象'])
  }
  const knownKeys = new Set(getPinaxBackupKeys(storage))
  const rejectedSecretKeys = []
  const unknownKeys = []
  const filteredKeys = {}
  for (const [key, raw] of Object.entries(lsBackup.keys)) {
    if (PINAX_BACKUP_SECRET_KEYS.includes(key)) rejectedSecretKeys.push(key)
    else if (!knownKeys.has(key) && !PINAX_BACKUP_DYNAMIC_PREFIXES.some((prefix) => key.startsWith(prefix))) unknownKeys.push(key)
    else filteredKeys[key] = raw
  }
  const filteredLsBackup = { ...lsBackup, keys: filteredKeys }
  const localStoragePlan = createRestorePlan(filteredLsBackup, storage)
  if (!localStoragePlan.valid) {
    return invalidInspection(localStoragePlan.incompatible.slice(0, 3), warnings)
  }

  // source archive 域
  const currentSource = await loadAllSourceArchiveRecords()
  const source = { add: [], overwrite: [], skip: [], unrestoreable: [] }
  const incomingSourceByStore = {}
  for (const storeName of Object.values(SOURCE_ARCHIVE_STORES)) {
    const entry = await readJsonEntry(entries, SOURCE_ARCHIVE_PATHS[storeName])
    if (entry.error) return invalidInspection([entry.error])
    const records = Array.isArray(entry.value) ? entry.value : null
    if (!records) return invalidInspection([`${SOURCE_ARCHIVE_PATHS[storeName]} 不是记录数组`])
    for (const record of records) {
      if (!record || typeof record !== 'object' || !record.id
        || Number(record.schemaVersion ?? SOURCE_ARCHIVE_SCHEMA_VERSION) !== SOURCE_ARCHIVE_SCHEMA_VERSION) {
        source.unrestoreable.push(record?.id || '(无 id)')
        continue
      }
    }
    const usable = records.filter((record) => !source.unrestoreable.includes(record.id))
    incomingSourceByStore[storeName] = usable
    const diffed = diffRecordSets(usable, currentSource[storeName])
    source.add.push(...diffed.add)
    source.overwrite.push(...diffed.overwrite)
    source.skip.push(...diffed.skip)
  }
  try {
    await assertArchiveCapacity(incomingSourceByStore)
  } catch (error) {
    return invalidInspection([error?.message || '来源归档超过可恢复容量'])
  }

  // media 域
  const mediaEntry = await readJsonEntry(entries, MEDIA_METADATA_PATH)
  if (mediaEntry.error) return invalidInspection([mediaEntry.error])
  const mediaAssets = Array.isArray(mediaEntry.value) ? mediaEntry.value : null
  if (!mediaAssets) return invalidInspection(['media/metadata.json 不是资产数组'])
  const currentMedia = readMediaAssets(storage)
  const media = { add: [], overwrite: [], skip: [], missingBinaryIds: [], externalOnly: [], unrestoreable: [] }
  for (const asset of mediaAssets) {
    if (!asset?.id || Number(asset.schemaVersion ?? MEDIA_ASSET_SCHEMA_VERSION) !== MEDIA_ASSET_SCHEMA_VERSION) {
      media.unrestoreable.push(asset?.id || '(无 id)')
      continue
    }
    if (mediaExternalOnly(asset)) {
      media.externalOnly.push(asset)
      continue
    }
    const binaryEntry = entries.get(binaryPathFor(asset))
    if (!binaryEntry) {
      media.missingBinaryIds.push(asset.id)
      continue
    }
    const current = currentMedia.find((item) => item.id === asset.id)
    if (!current) media.add.push(asset)
    else if (JSON.stringify(current) === JSON.stringify(asset)) media.skip.push(asset)
    else media.overwrite.push(asset)
  }

  const counts = {
    add: localStoragePlan.add.length + source.add.length + media.add.length,
    overwrite: localStoragePlan.overwrite.length + source.overwrite.length + media.overwrite.length,
    skip: localStoragePlan.skip.length + source.skip.length + media.skip.length,
    missingBinary: media.missingBinaryIds.length,
    unrestoreable: source.unrestoreable.length + media.unrestoreable.length
  }

  if (rejectedSecretKeys.length > 0) {
    warnings.push(`${rejectedSecretKeys.length} 个模型配置密钥键被排除，不会导入`)
  }
  if (media.missingBinaryIds.length > 0) {
    warnings.push(`${media.missingBinaryIds.length} 个媒体在备份中没有二进制，恢复后仅保留元数据`)
  }

  return {
    valid: true,
    errors: [],
    warnings,
    version,
    createdAt: manifest.createdAt || null,
    localStoragePlan,
    rejectedSecretKeys,
    unknownKeys,
    sourceArchive: source,
    memoryHistoryCount,
    media,
    counts,
    requiresRiskConfirmation: localStoragePlan.requiresRiskConfirmation
  }
}

// ---------- C4 · 恢复与补偿回滚 ----------

function domainResult(ok, extra = {}) {
  return { ok, written: 0, skipped: 0, rolledBack: false, rollbackFailed: false, ...extra }
}

export async function restoreWorkspaceBackupBundle(input, {
  storage = localStorage,
  overwrite = true,
  acceptRestoreRisk = false,
  signal,
  binaryStore = undefined
} = {}) {
  assertLive(signal)
  const inspection = await inspectWorkspaceBackup(input, { storage, signal })
  if (!inspection.valid) {
    return { success: false, reason: 'invalid-backup', inspection, domains: null }
  }
  if (inspection.requiresRiskConfirmation && !acceptRestoreRisk) {
    return { success: false, reason: 'restore-risk-not-accepted', inspection, domains: null }
  }

  const bytes = await toUint8(input)
  const zip = await JSZip.loadAsync(bytes)
  assertLive(signal)

  const domains = {
    memoryHistory: domainResult(true),
    sourceArchive: domainResult(false, { reason: 'pending' }),
    media: domainResult(false, { reason: 'pending' }),
    localStorage: domainResult(false, { reason: 'pending' })
  }

  // ---- 捕获恢复前状态（补偿回滚依据） ----
  const sourcePrior = await loadAllSourceArchiveRecords()
  const mediaAssets = JSON.parse(await zip.files[MEDIA_METADATA_PATH].async('string'))
  const mediaPriorBlobs = new Map()
  for (const asset of mediaAssets) {
    if (mediaExternalOnly(asset)) continue
    if (!zip.files[binaryPathFor(asset)]) continue
    assertLive(signal)
    try {
      mediaPriorBlobs.set(asset.id, await getMediaBinaryById(asset.id, { binaryStore }))
    } catch {
      mediaPriorBlobs.set(asset.id, null)
    }
  }

  const sourceRecords = {}
  for (const storeName of Object.keys(SOURCE_ARCHIVE_PATHS)) {
    sourceRecords[storeName] = JSON.parse(await zip.files[SOURCE_ARCHIVE_PATHS[storeName]].async('string'))
  }
  const sourceUsable = {}
  const invalidSourceIds = new Set(inspection.sourceArchive.unrestoreable.map(String))
  for (const storeName of Object.keys(SOURCE_ARCHIVE_PATHS)) {
    sourceUsable[storeName] = sourceRecords[storeName]
      .filter((record) => !invalidSourceIds.has(String(record.id)))
  }

  const rollbackMedia = async () => {
    for (const [id, priorBlob] of mediaPriorBlobs.entries()) {
      if (priorBlob) await putMediaBinaryById(id, priorBlob, { binaryStore })
      else await deleteMediaBinaryById(id, { binaryStore })
    }
  }

  // ---- 1. source archive ----
  try {
    assertLive(signal)
    const written = await restoreSourceArchiveRecords(
      {
        artifacts: overwrite || !inspection.localStoragePlan
          ? sourceUsable.artifacts
          : sourceUsable.artifacts.filter((record) => !inspection.sourceArchive.skip.some((item) => item.id === record.id)),
        chunks: sourceUsable.chunks,
        workspaces: sourceUsable.workspaces
      },
      { signal }
    )
    domains.sourceArchive = domainResult(true, {
      written: written.written.artifacts + written.written.chunks + written.written.workspaces,
      skipped: inspection.sourceArchive.skip.length
    })
  } catch (error) {
    const cancelled = error.name === 'WorkspaceBackupCancelled'
    let rolledBack = true
    let rollbackFailed = false
    try {
      await replaceAllSourceArchiveRecords(sourcePrior)
    } catch {
      rolledBack = false
      rollbackFailed = true
    }
    domains.sourceArchive = domainResult(false, {
      reason: error?.message || '来源归档恢复失败',
      rolledBack,
      rollbackFailed
    })
    if (cancelled) throw error
    return { success: false, reason: 'source-restore-failed', inspection, domains }
  }

  // ---- 2. media ----
  try {
    assertLive(signal)
    let written = 0
    let skipped = 0
    for (const asset of mediaAssets) {
      assertLive(signal)
      if (mediaExternalOnly(asset)) continue
      const binaryEntry = zip.files[binaryPathFor(asset)]
      if (!binaryEntry) continue
      const incomingBytes = await readEntryBytes(binaryEntry)
      const priorBlob = mediaPriorBlobs.get(asset.id)
      const priorBytes = await blobToUint8(priorBlob)
      if (priorBytes && sha256HexOfBytes(priorBytes) === sha256HexOfBytes(incomingBytes)) {
        skipped += 1
        continue
      }
      if (!overwrite && inspection.media.skip.some((item) => item.id === asset.id)) {
        skipped += 1
        continue
      }
      await putMediaBinaryById(asset.id, new Blob([incomingBytes]), { binaryStore })
      written += 1
    }
    domains.media = domainResult(true, { written, skipped })
  } catch (error) {
    const cancelled = error.name === 'WorkspaceBackupCancelled'
    let rolledBack = true
    let rollbackFailed = false
    try {
      await rollbackMedia()
    } catch {
      rolledBack = false
      rollbackFailed = true
    }
    domains.media = domainResult(false, {
      reason: error?.message || '媒体恢复失败',
      rolledBack,
      rollbackFailed
    })
    // 反向顺序：回滚 media，再回滚 source
    try {
      await replaceAllSourceArchiveRecords(sourcePrior)
      domains.sourceArchive.rolledBack = true
    } catch {
      domains.sourceArchive.rolledBack = false
      domains.sourceArchive.rollbackFailed = true
    }
    if (cancelled) throw error
    return { success: false, reason: 'media-restore-failed', inspection, domains }
  }

  // ---- 3. localStorage（v2 owner 最后写，自带键级补偿回滚） ----
  let importedHistoryIds = []
  try {
    assertLive(signal)
    const history = zip.files[MEMORY_HISTORY_PATH]
      ? JSON.parse(await zip.files[MEMORY_HISTORY_PATH].async('string')) : []
    importedHistoryIds = await importMemoryHistory(history)
    domains.memoryHistory = domainResult(true, { written: importedHistoryIds.length, skipped: history.length - importedHistoryIds.length })
  } catch (error) {
    let rollbackFailed = false
    try { await rollbackMedia(); await replaceAllSourceArchiveRecords(sourcePrior) } catch { rollbackFailed = true }
    domains.memoryHistory = domainResult(false, { reason: error.message, rollbackFailed })
    domains.media.rolledBack = !rollbackFailed
    domains.sourceArchive.rolledBack = !rollbackFailed
    return { success: false, reason: 'memory-history-restore-failed', inspection, domains }
  }
  try {
    assertLive(signal)
    const lsJson = await zip.files[LOCAL_STORAGE_PATH].async('string')
    const lsResult = restoreBackup(lsJson, { storage, overwrite, acceptRestoreRisk: true })
    if (!lsResult.success) {
      try { await rollbackImportedMemoryHistory(importedHistoryIds); domains.memoryHistory.rolledBack = true }
      catch { domains.memoryHistory.rollbackFailed = true }
      domains.localStorage = domainResult(false, {
        reason: lsResult.reason === 'quota' ? 'localStorage 配额不足' : 'localStorage 恢复失败',
        rolledBack: Boolean(lsResult.rolledBack),
        rollbackFailed: Boolean(lsResult.rollbackFailed)
      })
      try {
        await rollbackMedia()
        await replaceAllSourceArchiveRecords(sourcePrior)
        domains.media.rolledBack = true
        domains.sourceArchive.rolledBack = true
      } catch {
        domains.media.rollbackFailed = true
        domains.sourceArchive.rollbackFailed = true
      }
      return { success: false, reason: 'local-storage-restore-failed', inspection, domains }
    }
    domains.localStorage = domainResult(true, {
      written: lsResult.written.length,
      skipped: lsResult.skipped.length
    })
  } catch (error) {
    try { await rollbackImportedMemoryHistory(importedHistoryIds); domains.memoryHistory.rolledBack = true }
    catch { domains.memoryHistory.rollbackFailed = true }
    let rollbackFailed = false
    try {
      await rollbackMedia()
      await replaceAllSourceArchiveRecords(sourcePrior)
      domains.media.rolledBack = true
      domains.sourceArchive.rolledBack = true
    } catch {
      rollbackFailed = true
      domains.media.rollbackFailed = true
      domains.sourceArchive.rollbackFailed = true
    }
    if (error.name === 'WorkspaceBackupCancelled') throw error
    domains.localStorage = domainResult(false, {
      reason: error?.message || 'localStorage 恢复失败',
      rollbackFailed
    })
    return { success: false, reason: 'local-storage-restore-failed', inspection, domains }
  }

  return {
    success: true,
    inspection,
    domains,
    counts: inspection.counts
  }
}
