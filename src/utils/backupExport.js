import { STORAGE_KEYS } from '../composables/useStorage'
import { downloadJsonFile, timestampForFilename } from './download'

/**
 * localStorage key list belonging to Pinax that should be backed up.
 * Includes everything declared in STORAGE_KEYS plus a few undeclared
 * keys that some legacy code paths still write to.
 */
export const PINAX_BACKUP_KEYS = [
  STORAGE_KEYS.QUICK_NOTE_DRAFT,
  STORAGE_KEYS.PROSE_QUICK_NOTE_DRAFT,
  STORAGE_KEYS.WRITING_BOOKS,
  STORAGE_KEYS.WRITING_CHARACTER,
  STORAGE_KEYS.WRITING_TIME,
  STORAGE_KEYS.WRITING_WORLDMAP,
  STORAGE_KEYS.WRITING_SCENES,
  STORAGE_KEYS.WRITING_ACTIVITIES,
  STORAGE_KEYS.WRITING_CHARACTERS,
  STORAGE_KEYS.WRITING_TIMELINES,
  STORAGE_KEYS.WRITING_WORLD_SETTINGS,
  STORAGE_KEYS.WRITING_NOTES,
  STORAGE_KEYS.WRITING_SESSIONS,
  STORAGE_KEYS.NARRATIVE_ASSETS,
  STORAGE_KEYS.MEMORY_CANDIDATES,
  STORAGE_KEYS.STORYBOARD_DOCUMENTS,
  STORAGE_KEYS.STORYBOARD_SNAPSHOTS,
  STORAGE_KEYS.PROSE_CARDS_V1,
  STORAGE_KEYS.PROSE_EDGES_V1,
  STORAGE_KEYS.PROSE_OUTLINE_V1,
  STORAGE_KEYS.PROSE_TIMELINE_V1,
  STORAGE_KEYS.PROSE_PILES_V1,
  STORAGE_KEYS.PROSE_COMMITS_V1,
  STORAGE_KEYS.PROSE_BRANCHES_V1,
  STORAGE_KEYS.PROSE_IMAGE_LIBRARY,
  STORAGE_KEYS.POETRY_IDEA_TREE_V2,
  STORAGE_KEYS.POETRY_IDEA_POSITIONS_V2,
  STORAGE_KEYS.POETRY_ADAPT_PROFILE_V2,
  STORAGE_KEYS.POETRY_GRAPH_EDGES_V1,
  STORAGE_KEYS.POETRY_IMAGERY_GROUPS_V1,
  STORAGE_KEYS.POETRY_SNAPSHOTS_V1,
  STORAGE_KEYS.POETRY_IMAGE_LIBRARY_V1,
  STORAGE_KEYS.IMAGE_MODEL_CONFIGS,
  STORAGE_KEYS.MEDIA_ASSETS,
  STORAGE_KEYS.COMIC_PAGES,
  STORAGE_KEYS.PLAYABLE_WORLD_ENTRY_INTENT,
  STORAGE_KEYS.GAME_SETTINGS,
  STORAGE_KEYS.API_SETTINGS,
  STORAGE_KEYS.CHARACTERS,
  STORAGE_KEYS.PREFERENCE_USER_ID,
  STORAGE_KEYS.MEM0_SETTINGS,
  STORAGE_KEYS.GEOGRAPHY_DATA,
  STORAGE_KEYS.WORLD_NODES,
  // Legacy / undeclared keys still written by some paths
  'app_theme',
  'app_theme_variant',
  'colorScheme',
  'plot_journal',
  'mem0_sync_state',
  'mem0_cache',
  'pinax_game_runtime',
  'demo_arc_index',
  'lastSeedWorldbook',
  'active_worldbook_id',
  'dialogue_characters',
  'notes_image_prompt',
  'notes_image_negative'
]

export const PINAX_BACKUP_DYNAMIC_PREFIXES = Object.freeze([
  'worldbook_',
  'worldbook:brief:'
])

export const BACKUP_VERSION = 1

/**
 * Resolve the actual key set at export time so per-world and per-section
 * records are not lost just because they cannot be listed statically.
 */
export function getPinaxBackupKeys(storage = localStorage) {
  const keys = new Set(PINAX_BACKUP_KEYS)
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index)
    if (key && PINAX_BACKUP_DYNAMIC_PREFIXES.some(prefix => key.startsWith(prefix))) {
      keys.add(key)
    }
  }
  return [...keys]
}

/**
 * Read all Pinax-related localStorage keys and pack into a single JSON.
 * Non-existent keys are skipped (not stored as null).
 */
export function buildBackup() {
  const entries = {}
  let included = 0
  for (const key of getPinaxBackupKeys()) {
    const raw = localStorage.getItem(key)
    if (raw === null) continue
    entries[key] = raw
    included++
  }
  return {
    version: BACKUP_VERSION,
    schemaVersion: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    app: 'Pinax',
    keyCount: included,
    keys: entries
  }
}

function invalidRestorePlan(...reasons) {
  return {
    valid: false,
    version: null,
    add: [],
    overwrite: [],
    skip: [],
    incompatible: reasons.filter(Boolean)
  }
}

/**
 * Compare a parsed backup with current storage without writing anything.
 * The caller can show this plan before a later, explicit restore operation.
 */
export function createRestorePlan(input, storage = localStorage) {
  let backup = input
  if (typeof input === 'string') {
    try {
      backup = JSON.parse(input)
    } catch {
      return invalidRestorePlan('备份不是有效 JSON')
    }
  }

  if (!backup || typeof backup !== 'object' || Array.isArray(backup)) {
    return invalidRestorePlan('备份格式不是对象')
  }
  if (backup.app !== 'Pinax') {
    return invalidRestorePlan('备份来源不是 Pinax')
  }

  const version = Number(backup.schemaVersion ?? backup.version)
  if (!Number.isInteger(version) || version !== BACKUP_VERSION) {
    return invalidRestorePlan(`不支持的备份版本：${Number.isFinite(version) ? version : '未知'}`)
  }
  if (!backup.keys || typeof backup.keys !== 'object' || Array.isArray(backup.keys)) {
    return invalidRestorePlan('备份缺少有效的 keys 对象')
  }

  const add = []
  const overwrite = []
  const skip = []
  const incompatible = []

  for (const key of Object.keys(backup.keys)) {
    const raw = backup.keys[key]
    if (typeof raw !== 'string') {
      incompatible.push(`键 ${key} 的值不是字符串`)
      continue
    }
    const current = storage.getItem(key)
    if (current === null) add.push(key)
    else if (current === raw) skip.push(key)
    else overwrite.push(key)
  }

  return {
    valid: incompatible.length === 0,
    version,
    add,
    overwrite,
    skip,
    incompatible
  }
}

/**
 * Apply a previously reviewed backup plan.
 *
 * Restore is explicit and all-or-nothing for the keys in this backup. A quota
 * or storage failure restores the values changed during this attempt so a
 * partial import cannot silently leave the app in a mixed version.
 */
export function restoreBackup(input, { storage = localStorage, overwrite = true } = {}) {
  const plan = createRestorePlan(input, storage)
  if (!plan.valid) {
    return {
      success: false,
      reason: 'invalid-backup',
      plan,
      written: [],
      skipped: []
    }
  }

  let backup = input
  if (typeof input === 'string') {
    try {
      backup = JSON.parse(input)
    } catch {
      return { success: false, reason: 'invalid-backup', plan, written: [], skipped: [] }
    }
  }

  const keysToWrite = [
    ...plan.add,
    ...(overwrite ? plan.overwrite : [])
  ]
  const skipped = [
    ...plan.skip,
    ...(!overwrite ? plan.overwrite : [])
  ]
  const previous = new Map(keysToWrite.map((key) => [key, storage.getItem(key)]))
  const written = []

  try {
    for (const key of keysToWrite) {
      storage.setItem(key, backup.keys[key])
      written.push(key)
    }
  } catch (error) {
    let rollbackFailed = false
    for (const key of [...written].reverse()) {
      try {
        const oldValue = previous.get(key)
        if (oldValue === null) storage.removeItem(key)
        else storage.setItem(key, oldValue)
      } catch {
        rollbackFailed = true
      }
    }

    return {
      success: false,
      reason: error?.name === 'QuotaExceededError' || error?.code === 22 || error?.code === 1014
        ? 'quota'
        : 'storage-error',
      error: error?.message || '备份写入失败',
      plan,
      written: [],
      skipped,
      rolledBack: !rollbackFailed,
      rollbackFailed
    }
  }

  return {
    success: true,
    plan,
    written,
    skipped,
    rolledBack: false
  }
}

export function exportAllBackup() {
  const backup = buildBackup()
  const filename = `pinax-backup-${timestampForFilename()}.json`
  downloadJsonFile(backup, filename)
  return { filename, keyCount: backup.keyCount }
}
