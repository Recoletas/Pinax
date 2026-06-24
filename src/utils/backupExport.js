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
  'lastSeedWorldbook'
]

export const BACKUP_VERSION = 1

/**
 * Read all Pinax-related localStorage keys and pack into a single JSON.
 * Non-existent keys are skipped (not stored as null).
 */
export function buildBackup() {
  const entries = {}
  let included = 0
  for (const key of PINAX_BACKUP_KEYS) {
    const raw = localStorage.getItem(key)
    if (raw === null) continue
    entries[key] = raw
    included++
  }
  return {
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    app: 'Pinax',
    keyCount: included,
    keys: entries
  }
}

export function exportAllBackup() {
  const backup = buildBackup()
  const filename = `pinax-backup-${timestampForFilename()}.json`
  downloadJsonFile(backup, filename)
  return { filename, keyCount: backup.keyCount }
}