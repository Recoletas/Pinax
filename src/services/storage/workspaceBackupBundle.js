import { readRestoreComparison } from './writingStorageCodec.js'
import { withWritingBooksLock } from './writingBooksLock.js'
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
  readSourceArchiveRestoreMatches,
  undoSourceArchiveRestore,
  restoreSourceArchiveRecords
} from '../worldbook/worldbookSourceArchive'
import {
  MEDIA_ASSET_SCHEMA_VERSION,
  createIndexedDbBinaryStore,
  deleteMediaBinaryById,
  getMediaBinaryById,
  putMediaBinaryById
} from '../media/mediaAssetStore'
import { bytesToHex, sha256HexOfBytes, utf8Bytes } from './backupHash'
import { collectMemoryHistory, importMemoryHistory, rollbackImportedMemoryHistory, validateMemoryHistory } from '../memory/memoryHistoryStore'
// AX11/AX12: the fact
// ledger domain joins the complete workspace ZIP. Implementation lives in
// src/services/memory/ledger/ledgerBackup.js; this patch only assembles it.
import { collectLedgerDomain, importLedgerDomain, rollbackImportedLedgerDomain, validateLedgerDomain } from '../memory/ledger/ledgerBackup'
import { openLedgerDb, closeLedgerDb } from '../memory/ledger/ledgerDb'

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
const FACT_LEDGER_PATH = 'ledger/fact-ledger.json'
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
  FACT_LEDGER_PATH,
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

// The v3 digest is the same on HTTPS, localhost and older HTTP hosts.
async function fileDigest(bytes) {
  if (!globalThis.crypto?.subtle) return sha256HexOfBytes(bytes)
  return bytesToHex(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)))
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

function parseMediaAssets(raw) {
  try {
    const parsed = JSON.parse(raw || '[]')
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

async function readMediaBinaries(ids, binaryStore, allowMissing = false) {
  const rows = new Map()
  if (!ids.length) return rows
  const store = binaryStore || createIndexedDbBinaryStore()
  if (store.getMany) {
    try { return await store.getMany(ids) } catch (error) { if (!allowMissing) throw error }
  }
  for (const id of ids) {
    try { rows.set(id, await store.get(id)) } catch (error) { if (!allowMissing) throw error }
  }
  return rows
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

// A-line patch: a complete backup carries the fact ledger domain. If the
// ledger cannot be opened at export time the bundle records it as
// UNAVAILABLE instead of silently shipping an incomplete "complete" backup;
// inspection later refuses such a package.
async function collectFactLedgerForBackup(signal) {
  const opened = await openLedgerDb({ openTimeoutMs: 1500 })
  if (!opened.ok) {
    throw new Error(`事实账本不可用，完整备份未生成：${opened.detail || opened.reason}`)
  }
  try {
    assertLive(signal)
    return await collectLedgerDomain(opened.db)
  } finally {
    closeLedgerDb(opened.db)
  }
}

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
  const factLedger = await collectFactLedgerForBackup(signal)
  assertLive(signal)

  // Both metadata copies in the ZIP describe the same captured library.
  const mediaAssets = parseMediaAssets(localStorageBackup.keys[STORAGE_KEYS.MEDIA_ASSETS])
  const mediaBlobs = await readMediaBinaries(mediaAssets.filter(asset => !mediaExternalOnly(asset)).map(asset => asset.id), binaryStore, true)
  const missingBinaryIds = []
  const externalOnlyIds = []

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
      factLedger: {
        schemaVersion: factLedger.schemaVersion,
        counts: factLedger.counts,
        ...(factLedger.unavailable ? { unavailable: factLedger.unavailable } : {})
      },
      localStorage: {
        schemaVersion: BACKUP_VERSION,
        keyCount: localStorageBackup.keyCount,
        bytes: 0
      },
      sourceArchive: {
        schemaVersion: SOURCE_ARCHIVE_SCHEMA_VERSION,
        ...sourceCounts
      },
      media: {
        schemaVersion: MEDIA_ASSET_SCHEMA_VERSION,
        assetCount: mediaAssets.length,
        binaryCount: 0,
        externalCount: 0,
        missingBinaryIds,
        bytes: 0
      }
    },
    files: {},
    excludedSecretKeys: localStorageBackup.excludedSecretKeys,
    warnings: []
  }

  const zip = new JSZip()
  const addFile = async (path, bytes) => {
    assertLive(signal)
    // Node-based hosts (including jsdom) can supply typed arrays from another
    // realm. Their native Buffer view is recognized by the Node JSZip build.
    const data = JSZip.support.nodebuffer && globalThis.Buffer
      ? globalThis.Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength) : bytes
    zip.file(path, data)
    manifest.files[path] = await fileDigest(bytes)
    return bytes.byteLength
  }
  const addJson = (path, value) => addFile(path, utf8Bytes(JSON.stringify(value)))
  manifest.domains.localStorage.bytes = await addJson(LOCAL_STORAGE_PATH, localStorageBackup)
  await addJson(MEMORY_HISTORY_PATH, memoryHistory)
  if (!factLedger.unavailable) await addJson(FACT_LEDGER_PATH, factLedger)
  for (const [name, path] of Object.entries(SOURCE_ARCHIVE_PATHS)) await addJson(path, sourceRecords[name])
  await addJson(MEDIA_METADATA_PATH, mediaAssets)
  for (const asset of mediaAssets) {
    assertLive(signal)
    if (mediaExternalOnly(asset)) {
      externalOnlyIds.push(asset.id)
      continue
    }
    const bytes = await blobToUint8(mediaBlobs.get(asset.id))
    if (!bytes) {
      missingBinaryIds.push(asset.id)
      continue
    }
    manifest.domains.media.bytes += await addFile(binaryPathFor(asset), bytes)
    manifest.domains.media.binaryCount++
  }
  manifest.domains.media.externalCount = externalOnlyIds.length
  if (factLedger.unavailable) {
    manifest.warnings.push(`事实账本未能导出：${factLedger.unavailable}；本包不是完整备份`)
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
      mediaBinaryCount: manifest.domains.media.binaryCount,
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

function diffRecordSets(incomingRecords, currentById) {
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

export function inspectWorkspaceBackup(input, options = {}) {
  return inspectBundle(input, options)
}

async function inspectBundle(input, { storage = localStorage, signal, binaryStore } = {}, prepared = {}) {
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

  // Verify and decode each JSON entry from the same bytes. Binary files are
  // verified below, where the restore plan knows which payloads it needs.
  async function verifiedEntry(path) {
    let raw
    try { raw = await entries.get(path).async('uint8array') } catch { return null }
    assertLive(signal)
    return await fileDigest(raw) === manifest.files[path] ? raw : null
  }
  // Keep the compressed entries, not every inflated asset, between preflight
  // and commit. Only files that actually need installation are read again.
  // Verify those bytes too: callers can pass a mutable Uint8Array.
  if (prepared.restore) prepared.readBinary = verifiedEntry
  const uncheckedBinaries = new Set()
  const json = new Map()
  for (const path of Object.keys(manifest.files)) {
    const entry = entries.get(path)
    if (!entry) return invalidInspection([`manifest 声明的文件缺失：${path}`])
    if (isAllowedBinaryPath(path)) {
      uncheckedBinaries.add(path)
      continue
    }
    const raw = await verifiedEntry(path)
    if (!raw) return invalidInspection([`文件校验失败：${path} 的内容与 manifest 记录不一致`])
    try { json.set(path, { value: JSON.parse(new TextDecoder('utf-8', { ignoreBOM: true }).decode(raw)) }) }
    catch { return invalidInspection([`${path} 不是有效 JSON`]) }
  }
  const jsonEntry = path => json.get(path) || { missing: true }
  const declaredPaths = new Set(Object.keys(manifest.files))
  for (const path of entries.keys()) {
    if (path !== 'manifest.json' && !declaredPaths.has(path)) {
      return invalidInspection([`文件未在 manifest 中声明：${path}`])
    }
  }

  // localStorage 域：先剥离 secret/未知键（默认拒绝导入），再走 v2 计划
  let memoryHistoryCount = 0
  if (manifest.domains?.memoryHistory || entries.has(MEMORY_HISTORY_PATH)) {
    const history = jsonEntry(MEMORY_HISTORY_PATH)
    try {
      if (manifest.domains?.memoryHistory?.schemaVersion !== 1 || history.error || history.missing) throw new Error('记忆历史文件或版本缺失')
      memoryHistoryCount = validateMemoryHistory(history.value).length
      prepared.memoryHistory = history.value
      if (memoryHistoryCount !== manifest.domains.memoryHistory.revisionCount) throw new Error('记忆历史数量校验失败')
    } catch (error) { return invalidInspection([error.message]) }
  }
  // A-line patch: fact ledger domain. Declared-but-unavailable packages are
  // NOT valid complete backups; declared domains must match their counts.
  let factLedgerCount = 0
  if (manifest.domains?.factLedger || entries.has(FACT_LEDGER_PATH)) {
    if (!manifest.domains?.factLedger) return invalidInspection(['事实账本域声明缺失'])
    if (manifest.domains.factLedger.unavailable) {
      return invalidInspection(['此包导出时事实账本不可用，不是完整备份；请修复后重新导出'])
    }
    const ledgerEntry = jsonEntry(FACT_LEDGER_PATH)
    try {
      if (ledgerEntry.error || ledgerEntry.missing) throw new Error('事实账本文件缺失')
      const validated = validateLedgerDomain(ledgerEntry.value, manifest.domains.factLedger)
      factLedgerCount = validated.total
      prepared.factLedger = ledgerEntry.value
    } catch (error) { return invalidInspection([error.message]) }
  }
  const lsEntry = jsonEntry(LOCAL_STORAGE_PATH)
  if (lsEntry.error) return invalidInspection([lsEntry.error])
  const lsBackup = lsEntry.value
  if (!lsBackup || typeof lsBackup !== 'object' || !lsBackup.keys) {
    return invalidInspection(['local-storage.json 缺少有效的 keys 对象'])
  }
  const knownKeys = new Set(getPinaxBackupKeys(storage))
  const rejectedSecretKeys = []
  const unknownKeys = []
  const filteredKeys = Object.create(null)
  for (const [key, raw] of Object.entries(lsBackup.keys)) {
    if (PINAX_BACKUP_SECRET_KEYS.includes(key)) rejectedSecretKeys.push(key)
    else if (!knownKeys.has(key) && !PINAX_BACKUP_DYNAMIC_PREFIXES.some((prefix) => key.startsWith(prefix))) unknownKeys.push(key)
    else filteredKeys[key] = raw
  }
  // ZIP metadata has its own per-asset merge policy. Never replace the entire
  // live media library through the duplicate v2 localStorage key.
  delete filteredKeys[STORAGE_KEYS.MEDIA_ASSETS]
  const filteredLsBackup = { ...lsBackup, keys: filteredKeys }
  prepared.localStorageBackup = filteredLsBackup
  prepared.localPrior = new Map()
  const localStoragePlan = createRestorePlan(filteredLsBackup, storage, { review: true, localPrior: prepared.localPrior })
  if (!localStoragePlan.valid) {
    return invalidInspection(localStoragePlan.incompatible.slice(0, 3), warnings)
  }

  // source archive 域
  const source = { add: [], overwrite: [], skip: [], unrestoreable: [] }
  const incomingSourceByStore = {}
  prepared.sourceDiff = {}
  for (const storeName of Object.values(SOURCE_ARCHIVE_STORES)) {
    const entry = jsonEntry(SOURCE_ARCHIVE_PATHS[storeName])
    if (entry.error) return invalidInspection([entry.error])
    const records = Array.isArray(entry.value) ? entry.value : null
    if (!records) return invalidInspection([`${SOURCE_ARCHIVE_PATHS[storeName]} 不是记录数组`])
    const usable = [], seen = new Set()
    for (const record of records) {
      if (!record || typeof record.id !== 'string' || !record.id
        || Number(record.schemaVersion ?? SOURCE_ARCHIVE_SCHEMA_VERSION) !== SOURCE_ARCHIVE_SCHEMA_VERSION) {
        source.unrestoreable.push(record?.id || '(无 id)')
        continue
      }
      if (seen.has(record.id)) return invalidInspection([`来源归档中存在重复记录：${storeName}/${record.id}`])
      seen.add(record.id)
      usable.push(record)
    }
    incomingSourceByStore[storeName] = usable
  }
  prepared.sourcePrior = await readSourceArchiveRestoreMatches(incomingSourceByStore, { signal })
  for (const [storeName, usable] of Object.entries(incomingSourceByStore)) {
    const diffed = diffRecordSets(usable, prepared.sourcePrior[storeName])
    prepared.sourceDiff[storeName] = diffed
    source.add = source.add.concat(diffed.add)
    source.overwrite = source.overwrite.concat(diffed.overwrite)
    source.skip = source.skip.concat(diffed.skip)
  }
  try {
    if (source.add.length || source.overwrite.length) await assertArchiveCapacity(incomingSourceByStore)
  } catch (error) {
    return invalidInspection([error?.message || '来源归档超过可恢复容量'])
  }

  // media 域
  const mediaEntry = jsonEntry(MEDIA_METADATA_PATH)
  if (mediaEntry.error) return invalidInspection([mediaEntry.error])
  const mediaAssets = Array.isArray(mediaEntry.value) ? mediaEntry.value : null
  if (!mediaAssets) return invalidInspection(['media/metadata.json 不是资产数组'])
  const currentMedia = new Map(parseMediaAssets(storage.getItem(STORAGE_KEYS.MEDIA_ASSETS)).map(asset => [asset.id, asset]))
  const binaryIds = mediaAssets.filter(asset => typeof asset?.id === 'string' && !mediaExternalOnly(asset) && entries.has(binaryPathFor(asset))).map(asset => asset.id)
  const localBlobs = await readMediaBinaries([...new Set(binaryIds)], binaryStore)
  const media = { add: [], overwrite: [], skip: [], missingBinaryIds: [], externalOnly: [], unrestoreable: [] }
  prepared.media = []
  const seen = new Set()
  for (const asset of mediaAssets) {
    if (typeof asset?.id !== 'string' || !asset.id || Number(asset.schemaVersion ?? MEDIA_ASSET_SCHEMA_VERSION) !== MEDIA_ASSET_SCHEMA_VERSION) {
      media.unrestoreable.push(asset?.id || '(无 id)')
      continue
    }
    if (seen.has(asset.id)) return invalidInspection([`媒体存在重复ID：${asset.id}`])
    seen.add(asset.id)
    const external = mediaExternalOnly(asset)
    const assetPath = binaryPathFor(asset)
    const hasBinary = !external && entries.has(assetPath)
    if (external) media.externalOnly.push(asset)
    else if (!hasBinary) media.missingBinaryIds.push(asset.id)
    assertLive(signal)
    const binaryBytes = hasBinary ? await verifiedEntry(assetPath) : null
    if (hasBinary && !binaryBytes) return invalidInspection([`文件校验失败：${assetPath} 的内容与 manifest 记录不一致`])
    uncheckedBinaries.delete(assetPath)
    const current = currentMedia.get(asset.id)
    const priorBlob = hasBinary ? localBlobs.get(asset.id) ?? null : null
    const priorBytes = await blobToUint8(priorBlob)
    const priorHash = priorBytes ? await fileDigest(priorBytes) : null
    const binaryHash = hasBinary ? manifest.files[assetPath] : null
    const metadataChanged = current && JSON.stringify(current) !== JSON.stringify(asset)
    const binaryChanged = hasBinary && binaryHash !== priorHash
    const bucket = metadataChanged || (priorHash && binaryChanged) ? 'overwrite'
      : !current || binaryChanged ? 'add' : 'skip'
    media[bucket].push(asset)
    const install = binaryChanged && prepared.restore && (bucket === 'add' || prepared.overwrite)
    prepared.media.push({ asset, current, bucket, binaryChanged, priorBlob: install ? priorBlob : null, priorHash, binaryHash })
  }
  // Older bundles may contain an unreferenced binary. Its integrity is
  // covered by the manifest even though there is no asset to install.
  for (const path of uncheckedBinaries) {
    if (!await verifiedEntry(path)) {
      return invalidInspection([`文件校验失败：${path} 的内容与 manifest 记录不一致`])
    }
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

  // Bind confirmation to every reviewed record, including a record that
  // matched during preview but was deleted before the restore request.
  const hashValue = value => sha256HexOfBytes(utf8Bytes(value))
  const conflicts = [['localStorage', localStoragePlan.reviewRevision], ['bundle', manifest.files]]
  for (const [store, diff] of Object.entries(prepared.sourceDiff)) {
    // The manifest already authenticates the incoming record; equality needs
    // only a marker. Hash the live content only when it differs from the ZIP.
    for (const item of diff.add) conflicts.push([store, item.id, null])
    for (const item of diff.skip) conflicts.push([store, item.id, 'same'])
    for (const item of diff.overwrite) conflicts.push([store, item.id, hashValue(JSON.stringify(prepared.sourcePrior[store].get(item.id)))])
  }
  for (const item of prepared.media) {
    conflicts.push(['media', item.asset.id, hashValue(JSON.stringify(item.current ?? null)), item.priorHash])
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
    factLedgerCount,
    missingDomains: manifest.domains?.factLedger ? [] : ['factLedger'],
    media,
    counts,
    reviewRevision: hashValue(JSON.stringify(conflicts)),
    requiresRiskConfirmation: localStoragePlan.requiresRiskConfirmation || counts.overwrite > 0
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
  expectedReviewRevision,
  signal,
  binaryStore = undefined
} = {}) {
  assertLive(signal)
  const prepared = { restore: true, overwrite }
  const inspection = await inspectBundle(input, { storage, signal, binaryStore }, prepared)
  if (!inspection.valid) {
    return { success: false, reason: 'invalid-backup', inspection, domains: null }
  }
  const previewChanged = expectedReviewRevision !== undefined && expectedReviewRevision !== inspection.reviewRevision
  if (previewChanged) return { success: false, reason: 'restore-review-changed', inspection, domains: null }
  if (overwrite && inspection.requiresRiskConfirmation && !acceptRestoreRisk) {
    return { success: false, reason: 'restore-risk-not-accepted', inspection, domains: null }
  }

  assertLive(signal)

  const domains = {
    memoryHistory: domainResult(true),
    factLedger: domainResult(true),
    sourceArchive: domainResult(false, { reason: 'pending' }),
    media: domainResult(false, { reason: 'pending' }),
    localStorage: domainResult(false, { reason: 'pending' })
  }

  // ---- 捕获恢复前状态（补偿回滚依据） ----
  const ledgerRestore = { db: null, written: null }
  const sourceWrites = Object.fromEntries(Object.entries(prepared.sourceDiff).map(([store, diff]) => [
    store, overwrite ? [...diff.add, ...diff.overwrite] : diff.add
  ]))
  const rollbackSource = () => undoSourceArchiveRestore(sourceWrites, prepared.sourcePrior)
  const mediaWrites = prepared.media.filter(item => item.bucket === 'add' || overwrite && item.bucket === 'overwrite')
  const writtenMedia = []
  const mediaStore = binaryStore || createIndexedDbBinaryStore()
  async function replaceMedia(id, expectedHash, replacement) {
    const matches = async blob => {
      const bytes = await blobToUint8(blob)
      return (bytes ? await fileDigest(bytes) : null) === expectedHash
    }
    if (mediaStore.replaceMatching) return mediaStore.replaceMatching(id, matches, replacement)
    if (!await matches(await getMediaBinaryById(id, { binaryStore: mediaStore }))) return false
    if (replacement) await putMediaBinaryById(id, replacement, { binaryStore: mediaStore })
    else await deleteMediaBinaryById(id, { binaryStore: mediaStore })
    return true
  }
  const rollbackMedia = async () => {
    let conflicts = 0
    for (const { asset, priorBlob, binaryHash } of writtenMedia) {
      if (!await replaceMedia(asset.id, binaryHash, priorBlob)) conflicts++
    }
    if (conflicts) throw new Error('部分媒体在恢复后已修改，保留较新的编辑')
  }

  // ---- 1. source archive ----
  try {
    assertLive(signal)
    const writeCount = Object.values(sourceWrites).reduce((total, rows) => total + rows.length, 0)
    if (writeCount) await restoreSourceArchiveRecords(sourceWrites, { signal, expected: prepared.sourcePrior })
    domains.sourceArchive = domainResult(true, {
      written: writeCount,
      skipped: inspection.sourceArchive.skip.length + (overwrite ? 0 : inspection.sourceArchive.overwrite.length)
    })
  } catch (error) {
    const cancelled = error.name === 'WorkspaceBackupCancelled'
    // The source adapter commits all three stores in one transaction.
    domains.sourceArchive = domainResult(false, { reason: error?.message || '来源归档恢复失败', rolledBack: true })
    if (cancelled) throw error
    return { success: false, reason: 'source-restore-failed', inspection, domains }
  }

  // ---- 2. media ----
  try {
    assertLive(signal)
    let written = 0
    let skipped = prepared.media.length - mediaWrites.length
    for (const item of mediaWrites) {
      assertLive(signal)
      if (!item.binaryChanged) { skipped++; continue }
      const { asset, priorHash } = item
      const bytes = await prepared.readBinary(binaryPathFor(asset))
      if (!bytes) throw new Error('媒体文件在恢复期间校验失败')
      const incoming = new Blob([bytes], { type: asset.mimeType })
      if (!await replaceMedia(asset.id, priorHash, incoming)) throw new Error('媒体在恢复期间已变化')
      writtenMedia.push(item)
      written++
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
      await rollbackSource()
      domains.sourceArchive.rolledBack = true
    } catch {
      domains.sourceArchive.rolledBack = false
      domains.sourceArchive.rollbackFailed = true
    }
    if (cancelled) throw error
    return { success: false, reason: 'media-restore-failed', inspection, domains }
  }

  // ---- 2.5 事实账本（A 线新域；同库事务导入，失败补偿仅删本次写入） ----
  const rollbackLedger = async () => {
    if (!ledgerRestore.db || !ledgerRestore.written) return
    await rollbackImportedLedgerDomain(ledgerRestore.db, ledgerRestore.written)
    ledgerRestore.written = null
  }
  // Independent compensation: failure in one store must not skip the others.
  const compensate = async (names) => {
    const operations = {
      factLedger: rollbackLedger,
      media: rollbackMedia,
      sourceArchive: rollbackSource
    }
    for (const name of names) {
      try { await operations[name](); domains[name].rolledBack = true }
      catch { domains[name].rollbackFailed = true }
    }
  }
  try {
  try {
    assertLive(signal)
    // inspection already refused declared-but-unavailable packages, so file
    // presence is the only remaining question (same pattern as memoryHistory).
    if (prepared.factLedger) {
      const opened = await openLedgerDb({ openTimeoutMs: 1500 })
      if (!opened.ok) throw new Error(opened.detail || opened.reason)
      ledgerRestore.db = opened.db
      const importResult = await importLedgerDomain(ledgerRestore.db, prepared.factLedger)
      if (!importResult.ok) throw new Error(importResult.reason)
      ledgerRestore.written = importResult.written
      const written = Object.values(importResult.written).reduce((n, ids) => n + ids.length, 0)
      const skipped = Object.values(importResult.skipped).reduce((n, ids) => n + ids.length, 0)
      domains.factLedger = domainResult(true, { written, skipped })
    } else {
      domains.factLedger = domainResult(true, { written: 0, skipped: 0, absent: true })
    }
  } catch (error) {
    domains.factLedger = domainResult(false, { reason: error.message })
    await compensate(['factLedger', 'media', 'sourceArchive'])
    if (error.name === 'WorkspaceBackupCancelled') throw error
    return { success: false, reason: 'fact-ledger-restore-failed', inspection, domains }
  }

  // ---- 3. localStorage（v2 owner 最后写，自带键级补偿回滚） ----
  let importedHistoryIds = []
  try {
    assertLive(signal)
    const history = prepared.memoryHistory || []
    importedHistoryIds = await importMemoryHistory(history)
    domains.memoryHistory = domainResult(true, { written: importedHistoryIds.length, skipped: history.length - importedHistoryIds.length })
  } catch (error) {
    domains.memoryHistory = domainResult(false, { reason: error.message })
    await compensate(['factLedger', 'media', 'sourceArchive'])
    if (error.name === 'WorkspaceBackupCancelled') throw error
    return { success: false, reason: 'memory-history-restore-failed', inspection, domains }
  }
  function commitLocalStorage() {
    assertLive(signal)
    const keys = Object.create(null)
    for (const [key, value] of Object.entries(prepared.localStorageBackup.keys)) {
      if (!prepared.localPrior.has(key)) continue
      const current = readRestoreComparison(storage, key)
      if (expectedReviewRevision !== undefined && current !== prepared.localPrior.get(key)) {
        throw Object.assign(new Error(`恢复期间存储键已变化：${key}`), { code: 'RESTORE_REVIEW_CHANGED' })
      }
      if (current === value) {
        // An interrupted bookshelf restore can leave an unpublished mirror
        // epoch. The shared JSON owner settles it on an explicit ZIP retry.
        if (key === STORAGE_KEYS.WRITING_BOOKS) keys[key] = value
        continue
      }
      if (current !== null && !overwrite) continue
      if (current !== prepared.localPrior.get(key)) throw new Error(`恢复期间存储键已变化：${key}`)
      keys[key] = value
    }
    if (mediaWrites.length) {
      const latest = new Map(parseMediaAssets(storage.getItem(STORAGE_KEYS.MEDIA_ASSETS)).map(asset => [asset.id, asset]))
      for (const { asset, current } of mediaWrites) {
        if (JSON.stringify(latest.get(asset.id)) !== JSON.stringify(current)) {
          throw Object.assign(new Error('媒体元数据在恢复期间已变化'), { code: 'RESTORE_REVIEW_CHANGED' })
        }
        latest.set(asset.id, asset)
      }
      keys[STORAGE_KEYS.MEDIA_ASSETS] = JSON.stringify([...latest.values()])
    }
    return restoreBackup({ ...prepared.localStorageBackup, keys }, { storage, overwrite: true, acceptRestoreRisk: true })
  }
  try {
    // ZIP decoding and IndexedDB work finish first. Only the synchronous
    // recheck and localStorage commit share the author's chapter-save lock.
    const lsResult = await withWritingBooksLock(commitLocalStorage)
    if (!lsResult.success) {
      try { await rollbackImportedMemoryHistory(importedHistoryIds); domains.memoryHistory.rolledBack = true }
      catch { domains.memoryHistory.rollbackFailed = true }
      domains.localStorage = domainResult(false, {
        reason: lsResult.reason === 'quota' ? 'localStorage 配额不足' : 'localStorage 恢复失败',
        rolledBack: Boolean(lsResult.rolledBack),
        rollbackFailed: Boolean(lsResult.rollbackFailed)
      })
      await compensate(['factLedger', 'media', 'sourceArchive'])
      return { success: false, reason: 'local-storage-restore-failed', inspection, domains }
    }
    domains.localStorage = domainResult(true, {
      written: lsResult.written.length,
      skipped: new Set([...lsResult.skipped, ...inspection.localStoragePlan.skip, ...(overwrite ? [] : inspection.localStoragePlan.overwrite)]).size
    })
  } catch (error) {
    try { await rollbackImportedMemoryHistory(importedHistoryIds); domains.memoryHistory.rolledBack = true }
    catch { domains.memoryHistory.rollbackFailed = true }
    await compensate(['factLedger', 'media', 'sourceArchive'])
    const rollbackFailed = ['memoryHistory', 'factLedger', 'media', 'sourceArchive'].some(name => domains[name].rollbackFailed)
    if (error.name === 'WorkspaceBackupCancelled') throw error
    domains.localStorage = domainResult(false, {
      reason: error?.message || 'localStorage 恢复失败',
      rollbackFailed
    })
    if (expectedReviewRevision !== undefined && error.code === 'RESTORE_REVIEW_CHANGED' && !rollbackFailed) {
      const latest = await inspectWorkspaceBackup(input, { storage, signal, binaryStore })
      return { success: false, reason: latest.valid ? 'restore-review-changed' : 'invalid-backup', inspection: latest, domains }
    }
    return { success: false, reason: 'local-storage-restore-failed', inspection, domains }
  }

  return {
    success: true,
    inspection,
    domains,
    counts: inspection.counts
  }
  } finally {
    if (ledgerRestore.db) await closeLedgerDb(ledgerRestore.db)
  }
}
