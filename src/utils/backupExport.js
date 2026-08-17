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
  STORAGE_KEYS.WORLDBOOK_CREATE_DRAFT,
  STORAGE_KEYS.WORLDBOOK_RESEARCH_SETTINGS,
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
  STORAGE_KEYS.WRITING_SNAPSHOTS,
  STORAGE_KEYS.WRITING_BLOCK_HISTORY,
  STORAGE_KEYS.WRITING_RECOVERY_DRAFTS,
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
  STORAGE_KEYS.TEXT_MODEL_CONFIGS,
  STORAGE_KEYS.TEXT_MODEL_SELECTED,
  STORAGE_KEYS.IMAGE_MODEL_CONFIGS,
  STORAGE_KEYS.VIDEO_MODEL_CONFIGS,
  STORAGE_KEYS.VIDEO_MODEL_SELECTED,
  STORAGE_KEYS.MEDIA_ASSETS,
  STORAGE_KEYS.COMIC_PAGES,
  STORAGE_KEYS.PLAYABLE_WORLD_ENTRY_INTENT,
  STORAGE_KEYS.GAME_SETTINGS,
  STORAGE_KEYS.API_SETTINGS,
  STORAGE_KEYS.EXPERIENCE_READING_PROFILE,
  STORAGE_KEYS.EXPERIENCE_NARRATIVE_EXPANSION,
  STORAGE_KEYS.AGENT_RUNTIME_POLICY,
  STORAGE_KEYS.AGENT_RUNTIME_METRICS,
  STORAGE_KEYS.NARRATIVE_PRODUCTION_METRICS,
  STORAGE_KEYS.NARRATIVE_CRITIC_METRICS,
  STORAGE_KEYS.CHARACTERS,
  STORAGE_KEYS.PREFERENCE_USER_ID,
  STORAGE_KEYS.MEM0_SETTINGS,
  STORAGE_KEYS.PINAX_TIPS_SEEN,
  STORAGE_KEYS.EXPERIENCE_FIRST_VISIT,
  STORAGE_KEYS.GEOGRAPHY_DATA,
  STORAGE_KEYS.WORLD_NODES,
  // Legacy / undeclared keys still written by some paths
  'app_theme',
  'app_theme_variant',
  'app_ui_zoom',
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

// P1-5：备份版本 2 —— 新增 experience 摘要节（回合/检查点 + 记忆 revision）。
// 现有 key-value 打包不变（向后兼容），版本 2 只增加摘要供恢复校验。
export const BACKUP_VERSION = 2

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
    keys: entries,
    // P1-5：体验回合/检查点 + 记忆 revision 摘要（低敏，供恢复校验）
    experience: buildExperienceBackupSummary(localStorage)
  }
}

// P1-5：从 WRITING_SESSIONS + MEMORY_CANDIDATES 提取体验摘要。
// 低敏：只含回合数量/分支/最新 committed turn id/记忆候选 revision，不含正文。
function stableRevision(items) {
  const source = items
    .map((item) => [item?.id, item?.revision, item?.status, item?.updatedAt || item?.createdAt].join(':'))
    .sort()
    .join('|')
  let hash = 2166136261
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return `${items.length}:${(hash >>> 0).toString(36)}`
}

function textValue(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function buildExperienceBackupSummary(storage = localStorage) {
  const summary = {
    sessionCount: 0, branchCount: 0, turnCount: 0, memoryRevision: 0, hasTurnData: false,
    branches: [],
    // P1-4：checkpoint 元数据 —— 最新 committed turn 的时间锚点（版本校验用）
    checkpoint: { turnId: null, committedAt: 0 }
  }
  try {
    const sessionsRaw = storage.getItem('writing_sessions')
    if (sessionsRaw) {
      const sessions = JSON.parse(sessionsRaw)
      const sessionList = Array.isArray(sessions) ? sessions : (sessions?.sessions || [])
      summary.sessionCount = sessionList.length
      let turnCount = 0
      const branchIds = new Set()
      for (const session of sessionList) {
        const turnRecords = session?.turnRecords || {}
        const turns = Object.values(turnRecords || {})
        const sessionBranchIds = [...new Set(turns.map((turn) => textValue(turn?.branchId)).filter(Boolean))].sort()
        turnCount += turns.length
        for (const turn of turns) {
          if (turn?.branchId) branchIds.add(turn.branchId)
          if (turn?.id === session?.lastCommittedTurnId) {
            summary.lastCommittedTurnId = turn.id
            // checkpoint：最新 committed turn 的提交时间作为版本锚点
            const committedAt = Number(turn?.committedAt || 0)
            if (committedAt > summary.checkpoint.committedAt) {
              summary.checkpoint = { turnId: turn.id, committedAt }
            }
          }
        }
        summary.branches.push({
          sessionId: textValue(session?.id),
          activeBranchId: textValue(session?.activeBranchId || 'main'),
          branchIds: sessionBranchIds,
          lastCommittedTurnId: textValue(session?.lastCommittedTurnId),
        })
      }
      summary.turnCount = turnCount
      summary.branchCount = branchIds.size
      summary.hasTurnData = turnCount > 0
    }
    const memoryRaw = storage.getItem('memory_candidates_v1')
    if (memoryRaw) {
      try {
        const candidates = JSON.parse(memoryRaw)
        const list = Array.isArray(candidates) ? candidates : (candidates?.candidates || [])
        summary.memoryRevision = stableRevision(list || [])
      } catch { /* 记忆数据解析失败则保持 0 */ }
    }
  } catch { /* 摘要提取失败不影响备份本体 */ }
  return summary
}

function invalidRestorePlan(...reasons) {
  return {
    valid: false,
    version: null,
    add: [],
    overwrite: [],
    skip: [],
    incompatible: reasons.filter(Boolean),
    restoreWarnings: [],
    requiresRiskConfirmation: false,
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
  // P1-5：允许恢复旧版本（BACKUP_VERSION=2 只是新增 experience 摘要，key-value 打包不变）
  if (!Number.isInteger(version) || version < 1 || version > BACKUP_VERSION) {
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

  // P1-3：checkpoint 校验 —— 备份 experience 摘要与当前会话对比。
  // 备份的回合 checkpoint 比当前更新 → 说明恢复会覆盖更新的会话，标记提示。
  let checkpointNotice = null
  let memoryRevisionNotice = null
  let branchMetadataNotice = null
  const backupCheckpoint = backup?.experience?.checkpoint
  if (backupCheckpoint?.turnId && backupCheckpoint?.committedAt) {
    const currentCheckpoint = buildExperienceBackupSummary(storage).checkpoint
    if (currentCheckpoint?.committedAt > backupCheckpoint.committedAt) {
      checkpointNotice = `备份回合检查点(${backupCheckpoint.turnId}, ${backupCheckpoint.committedAt}) 早于当前会话(${currentCheckpoint.committedAt})，恢复将回退更新的回合历史`
    }
  }
  const currentExperience = buildExperienceBackupSummary(storage)
  const backupMemoryRevision = backup?.experience?.memoryRevision
  if (
    backupMemoryRevision !== undefined
    && backupMemoryRevision !== null
    && currentExperience.memoryRevision
    && String(currentExperience.memoryRevision) !== String(backupMemoryRevision)
  ) {
    memoryRevisionNotice = '备份的记忆版本与当前数据不同，恢复将替换现有记忆候选状态'
  }
  if (
    Array.isArray(backup?.experience?.branches)
    && currentExperience.branches.length > 0
    && JSON.stringify(backup.experience.branches) !== JSON.stringify(currentExperience.branches)
  ) {
    branchMetadataNotice = '备份的会话分支与当前数据不同，恢复将替换当前分支位置与回合链'
  }
  const restoreWarnings = [checkpointNotice, memoryRevisionNotice, branchMetadataNotice].filter(Boolean)

  return {
    valid: incompatible.length === 0,
    version,
    add,
    overwrite,
    skip,
    incompatible,
    checkpoint: backupCheckpoint || null,
    checkpointNotice,
    memoryRevisionNotice,
    branchMetadataNotice,
    restoreWarnings,
    requiresRiskConfirmation: restoreWarnings.length > 0
  }
}

/**
 * Apply a previously reviewed backup plan.
 *
 * Restore is explicit and all-or-nothing for the keys in this backup. A quota
 * or storage failure restores the values changed during this attempt so a
 * partial import cannot silently leave the app in a mixed version.
 */
export function restoreBackup(input, {
  storage = localStorage,
  overwrite = true,
  acceptRestoreRisk = false,
} = {}) {
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
  if (plan.requiresRiskConfirmation && !acceptRestoreRisk) {
    return {
      success: false,
      reason: 'restore-risk-not-accepted',
      plan,
      written: [],
      skipped: [],
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
