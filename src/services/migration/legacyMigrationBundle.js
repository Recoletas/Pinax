import { STORAGE_KEYS } from '../../composables/useStorage.js'
import { STORAGE_KEY_POLICY } from '../storage/storageKeyPolicy.js'

export const LEGACY_MIGRATION_SCHEMA_VERSION = 3
const MAX_MIGRATION_RECORDS = 10_000
const MAX_MIGRATION_BYTES = 256 * 1024 * 1024

const STORAGE_NAME_BY_KEY = Object.freeze(Object.fromEntries(
  Object.entries(STORAGE_KEYS).map(([name, key]) => [key, name])
))

const RECORD_TYPES = Object.freeze({
  WRITING_BOOKS: 'writing-books',
  WRITING_SESSIONS: 'experience-sessions',
  WRITING_SNAPSHOTS: 'writing-snapshots',
  WRITING_BLOCK_HISTORY: 'writing-history',
  WRITING_RECOVERY_DRAFTS: 'writing-recovery',
  NARRATIVE_ASSETS: 'materials',
  MEDIA_ASSETS: 'media-assets',
  STORYBOARD_DOCUMENTS: 'storyboards',
  STORYBOARD_SNAPSHOTS: 'storyboard-snapshots',
  PROSE_CARDS_V1: 'canvas-cards',
  PROSE_EDGES_V1: 'canvas-edges',
  PROSE_OUTLINE_V1: 'canvas-outline',
  PROSE_TIMELINE_V1: 'canvas-timeline',
  PROSE_PILES_V1: 'canvas-piles',
  PROSE_COMMITS_V1: 'canvas-commits',
  PROSE_BRANCHES_V1: 'canvas-branches',
  CHARACTERS: 'characters',
  GEOGRAPHY_DATA: 'geography',
  WORLD_NODES: 'world-nodes'
})

export function classifyLegacyStorageKey(key) {
  if (typeof key !== 'string' || !key) return null
  if (key === 'worldbooks_index') return projectRecord('worldbook-index')
  if (key === 'active_worldbook_id') return projectRecord('active-worldbook')
  if (key.startsWith('worldbook:brief:')) return projectRecord('worldbook-brief')

  const storageName = STORAGE_NAME_BY_KEY[key]
  if (storageName) {
    const storageClass = STORAGE_KEY_POLICY[storageName]
    if (!storageClass) return null
    return {
      storageClass,
      recordType: RECORD_TYPES[storageName] || storageName.toLowerCase().replaceAll('_', '-')
    }
  }
  if (key.startsWith('worldbook_')) return projectRecord('worldbook')
  return null
}

export function canonicalizeMigrationInventory(records) {
  return JSON.stringify([...records]
    .map(({ sourceRecordId, recordType, byteLength, sha256 }) => ({
      sourceRecordId,
      recordType,
      byteLength,
      sha256
    }))
    .sort((a, b) => compareCodeUnits(a.sourceRecordId, b.sourceRecordId)))
}

export async function sha256Utf8(value, cryptoScope = globalThis.crypto) {
  if (!cryptoScope?.subtle?.digest) throw new Error('SHA-256 is unavailable in this browser')
  const bytes = new TextEncoder().encode(String(value))
  const digest = await cryptoScope.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('')
}

export async function buildLegacyMigrationBundle(storage = localStorage, deps = {}) {
  const records = []
  let totalBytes = 0
  for (let index = 0; index < storage.length; index += 1) {
    const sourceRecordId = storage.key(index)
    const classification = classifyLegacyStorageKey(sourceRecordId)
    if (classification?.storageClass !== 'project') continue
    const raw = storage.getItem(sourceRecordId)
    if (typeof raw !== 'string') continue
    const byteLength = new TextEncoder().encode(raw).byteLength
    totalBytes += byteLength
    if (records.length >= MAX_MIGRATION_RECORDS || totalBytes > MAX_MIGRATION_BYTES) {
      throw new Error('浏览器项目迁移包超过 10,000 条或 256 MiB 上限')
    }
    records.push({
      sourceRecordId,
      recordType: classification.recordType,
      raw,
      byteLength,
      sha256: await sha256Utf8(raw, deps.crypto || globalThis.crypto)
    })
  }
  records.sort((a, b) => compareCodeUnits(a.sourceRecordId, b.sourceRecordId))

  const sourceInventory = records.map(({ sourceRecordId, recordType, byteLength, sha256 }) => ({
    sourceRecordId,
    recordType,
    byteLength,
    sha256
  }))
  const bundleId = await sha256Utf8(canonicalizeMigrationInventory(sourceInventory), deps.crypto || globalThis.crypto)
  const now = deps.now || (() => new Date())

  return deepFreeze({
    app: 'Pinax',
    kind: 'desktop-project-migration',
    schemaVersion: LEGACY_MIGRATION_SCHEMA_VERSION,
    bundleId,
    exportedAt: now().toISOString(),
    recordCount: records.length,
    sourceInventory,
    records
  })
}

function projectRecord(recordType) {
  return { storageClass: 'project', recordType }
}

function compareCodeUnits(left, right) {
  return left < right ? -1 : left > right ? 1 : 0
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value
  for (const child of Object.values(value)) deepFreeze(child)
  return Object.freeze(value)
}
