import { getItem, setItem, STORAGE_KEYS } from '../composables/useStorage'
import { CAMERA_MOVEMENTS, SHOT_TYPES } from '../types/director'

export const STORYBOARD_SCHEMA_VERSION = 1

const ALLOWED_TRANSITIONS = new Set(['none', 'cut', 'dissolve', 'fade'])
const STORYBOARD_SOURCE_TYPE_ALIASES = {
  prose: 'prose-card',
  poetry: 'poetry-tree'
}
const STORYBOARD_SOURCE_TYPES = new Set([
  'prose-card',
  'poetry-tree',
  'narrative-asset',
  'chapter',
  'manual'
])

export function normalizeStoryboardShot(shot = {}, index = 0) {
  const sequence = normalizePositiveInt(shot.sequence, index + 1)
  const shotType = normalizeShotType(shot.shotType || shot.shotSize)
  const camera = normalizeCamera(shot.camera || shot.cameraMovement)
  const transition = normalizeTransition(shot.transition)
  const duration = normalizePositiveNumber(shot.duration, 3)
  const sourceText = normalizeText(shot.sourceText || shot.content)
  const scene = normalizeText(shot.scene)
  const visual = normalizeText(shot.visual || shot.tone)
  const dialogue = normalizeText(shot.dialogue)
  const sound = normalizeText(shot.sound)
  const music = normalizeText(shot.music)
  const notes = normalizeText(shot.notes)
  const emotion = normalizeText(shot.emotion)
  const shotId = normalizeText(shot.shotId) || String(sequence)

  return {
    ...shot,
    shotId,
    sequence,
    sourceText,
    scene,
    shotSize: shotType,
    shotType,
    cameraMovement: camera,
    camera,
    duration,
    visual,
    dialogue,
    sound,
    music,
    transition,
    emotion,
    notes,
    content: sourceText || normalizeText(shot.content),
    tone: visual
  }
}

export function normalizeStoryboardShots(shots = []) {
  if (!Array.isArray(shots)) return []
  return shots.map((shot, index) => normalizeStoryboardShot(shot, index))
}

export function validateStoryboardShots(shots = []) {
  const normalized = normalizeStoryboardShots(shots)
  const errors = []
  const warnings = []

  if (normalized.length === 0) {
    errors.push('分镜不能为空')
    return { valid: false, errors, warnings, normalized }
  }

  normalized.forEach((shot, index) => {
    const expectedSequence = index + 1
    if (shot.sequence !== expectedSequence) {
      errors.push(`第 ${expectedSequence} 条分镜序号不连续`)
    }
    if (!shot.shotId) {
      errors.push(`第 ${expectedSequence} 条分镜缺少 shotId`)
    }
    if (!shot.sourceText && !shot.content) {
      errors.push(`第 ${expectedSequence} 条分镜缺少 sourceText`)
    }
    if (!SHOT_TYPES[shot.shotType]) {
      errors.push(`第 ${expectedSequence} 条分镜景别无效`)
    }
    if (!CAMERA_MOVEMENTS[shot.cameraMovement]) {
      errors.push(`第 ${expectedSequence} 条分镜运镜无效`)
    }
    if (!Number.isFinite(Number(shot.duration)) || Number(shot.duration) <= 0) {
      errors.push(`第 ${expectedSequence} 条分镜时长无效`)
    }
    if (!ALLOWED_TRANSITIONS.has(shot.transition)) {
      errors.push(`第 ${expectedSequence} 条分镜转场无效`)
    }
    if (!shot.visual && !shot.dialogue && !shot.sound) {
      warnings.push(`第 ${expectedSequence} 条分镜缺少视觉/对白/声音描述`)
    }
  })

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    normalized
  }
}

export function createStoryboardValidationResult(shots = []) {
  const normalized = normalizeStoryboardShots(shots)
  const errors = []
  const warnings = []

  if (normalized.length === 0) {
    errors.push(createValidationIssue({
      code: 'empty_storyboard',
      message: '分镜不能为空'
    }))
  }

  normalized.forEach((shot, index) => {
    const expectedSequence = index + 1
    if (shot.sequence !== expectedSequence) {
      errors.push(createValidationIssue({
        shotId: shot.shotId,
        field: 'sequence',
        code: 'sequence_not_contiguous',
        message: `第 ${expectedSequence} 条分镜序号不连续`
      }))
    }
    if (!shot.shotId) {
      errors.push(createValidationIssue({
        field: 'shotId',
        code: 'missing_shot_id',
        message: `第 ${expectedSequence} 条分镜缺少 shotId`
      }))
    }
    if (!shot.sourceText && !shot.content) {
      errors.push(createValidationIssue({
        shotId: shot.shotId,
        field: 'sourceText',
        code: 'missing_source_text',
        message: `第 ${expectedSequence} 条分镜缺少 sourceText`
      }))
    }
    if (!SHOT_TYPES[shot.shotType]) {
      errors.push(createValidationIssue({
        shotId: shot.shotId,
        field: 'shotSize',
        code: 'invalid_shot_size',
        message: `第 ${expectedSequence} 条分镜景别无效`
      }))
    }
    if (!CAMERA_MOVEMENTS[shot.cameraMovement]) {
      errors.push(createValidationIssue({
        shotId: shot.shotId,
        field: 'cameraMovement',
        code: 'invalid_camera_movement',
        message: `第 ${expectedSequence} 条分镜运镜无效`
      }))
    }
    if (!Number.isFinite(Number(shot.duration)) || Number(shot.duration) <= 0) {
      errors.push(createValidationIssue({
        shotId: shot.shotId,
        field: 'duration',
        code: 'invalid_duration',
        message: `第 ${expectedSequence} 条分镜时长无效`
      }))
    }
    if (!ALLOWED_TRANSITIONS.has(shot.transition)) {
      errors.push(createValidationIssue({
        shotId: shot.shotId,
        field: 'transition',
        code: 'invalid_transition',
        message: `第 ${expectedSequence} 条分镜转场无效`
      }))
    }
    if (!shot.visual && !shot.dialogue && !shot.sound) {
      warnings.push(createValidationIssue({
        shotId: shot.shotId,
        code: 'weak_shot_description',
        message: `第 ${expectedSequence} 条分镜缺少视觉/对白/声音描述`,
        severity: 'warning'
      }))
    }
  })

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    checkedAt: Date.now()
  }
}

export function createStoryboardSourceRef(input = {}) {
  const source = input.source && typeof input.source === 'object' ? input.source : input
  const sourceType = normalizeSourceType(source.sourceType)
  const title = normalizeText(source.title || source.sourceLabel || source.label || getDefaultSourceTitle(sourceType))

  return {
    sourceType,
    sourceId: normalizeNullableText(source.sourceId),
    sourceVersionId: normalizeNullableText(source.sourceVersionId),
    title,
    excerpt: truncateText(source.excerpt || source.sourceText || source.content, 240)
  }
}

export function createStoryboardVersion({
  shots = [],
  taskType = null,
  promptVersion = null,
  parameters = {}
} = {}) {
  const now = Date.now()
  const normalizedShots = normalizeStoryboardShots(shots)

  return {
    versionId: `storyboard_version_${now}_${Math.random().toString(36).slice(2, 8)}`,
    createdAt: now,
    taskType: normalizeNullableText(taskType),
    promptVersion: normalizeNullableText(promptVersion),
    parameters: normalizeMetadata(parameters),
    shots: normalizedShots,
    validation: createStoryboardValidationResult(normalizedShots)
  }
}

export function createStoryboardDocument({
  id = '',
  projectId = null,
  source = {},
  shots = [],
  taskType = null,
  promptVersion = null,
  parameters = {},
  createdAt = null,
  updatedAt = null
} = {}) {
  const now = Date.now()
  const version = createStoryboardVersion({
    shots,
    taskType,
    promptVersion,
    parameters
  })

  return {
    id: normalizeText(id) || `storyboard_doc_${now}_${Math.random().toString(36).slice(2, 8)}`,
    schemaVersion: STORYBOARD_SCHEMA_VERSION,
    projectId: normalizeNullableText(projectId),
    source: createStoryboardSourceRef(source),
    currentVersionId: version.versionId,
    versions: [version],
    createdAt: normalizeTimestamp(createdAt) || now,
    updatedAt: normalizeTimestamp(updatedAt) || now
  }
}

export function saveStoryboardDocument(input = {}) {
  const document = createStoryboardDocument(input)
  const current = listStoryboardDocuments()
  const next = [
    document,
    ...current.filter((item) => item.id !== document.id)
  ]
  setItem(STORAGE_KEYS.STORYBOARD_DOCUMENTS, next)
  return document
}

export function saveStoryboardVersion({
  documentId = '',
  projectId = null,
  source = {},
  shots = [],
  taskType = null,
  promptVersion = null,
  parameters = {}
} = {}) {
  const current = listStoryboardDocuments()
  const normalizedDocumentId = normalizeText(documentId)
  const normalizedSource = createStoryboardSourceRef(source)
  const normalizedProjectId = normalizeNullableText(projectId)
  const target = normalizedDocumentId
    ? current.find((item) => item.id === normalizedDocumentId)
    : findMatchingStoryboardDocument(current, {
      projectId: normalizedProjectId,
      source: normalizedSource
    })

  if (!target) {
    const document = createStoryboardDocument({
      projectId: normalizedProjectId,
      source: normalizedSource,
      shots,
      taskType,
      promptVersion,
      parameters
    })
    const next = [document, ...current]
    setItem(STORAGE_KEYS.STORYBOARD_DOCUMENTS, next)
    return {
      created: true,
      document,
      version: document.versions[0]
    }
  }

  const version = createStoryboardVersion({
    shots,
    taskType,
    promptVersion,
    parameters
  })
  const updated = {
    ...target,
    projectId: normalizeNullableText(target.projectId),
    source: target.source || normalizedSource,
    currentVersionId: version.versionId,
    versions: [version, ...normalizeStoryboardVersions(target.versions)],
    updatedAt: Date.now()
  }
  const next = [
    updated,
    ...current.filter((item) => item.id !== updated.id)
  ]
  setItem(STORAGE_KEYS.STORYBOARD_DOCUMENTS, next)

  return {
    created: false,
    document: updated,
    version
  }
}

export function saveValidatedStoryboardVersion({
  documentId = '',
  projectId = null,
  source = {},
  shots = [],
  taskType = null,
  promptVersion = null,
  parameters = {}
} = {}) {
  const validation = validateStoryboardShots(shots)
  if (!validation.valid) {
    const error = new Error(validation.errors[0] || '分镜校验未通过')
    error.validation = validation
    throw error
  }

  const result = saveStoryboardVersion({
    documentId,
    projectId,
    source,
    shots: validation.normalized,
    taskType,
    promptVersion,
    parameters
  })

  return {
    ...result,
    shots: validation.normalized,
    validation
  }
}

export function listStoryboardDocuments({ sourceType = null, sourceId = null, projectId = null } = {}) {
  const stored = getItem(STORAGE_KEYS.STORYBOARD_DOCUMENTS)
  const list = Array.isArray(stored) ? stored : []
  const normalizedSourceType = sourceType ? normalizeSourceType(sourceType) : null
  const normalizedSourceId = normalizeNullableText(sourceId)
  const normalizedProjectId = normalizeNullableText(projectId)

  return list
    .filter((item) => item && typeof item === 'object')
    .filter((item) => !normalizedSourceType || normalizeSourceType(item.source?.sourceType) === normalizedSourceType)
    .filter((item) => !normalizedSourceId || normalizeNullableText(item.source?.sourceId) === normalizedSourceId)
    .filter((item) => !normalizedProjectId || normalizeNullableText(item.projectId) === normalizedProjectId)
    .sort((a, b) => Number(b.updatedAt || b.createdAt || 0) - Number(a.updatedAt || a.createdAt || 0))
}

export function getStoryboardDocument(documentId) {
  const normalizedDocumentId = normalizeText(documentId)
  if (!normalizedDocumentId) return null
  return listStoryboardDocuments().find((item) => item.id === normalizedDocumentId) || null
}

export function getCurrentStoryboardVersion(document) {
  if (!document || typeof document !== 'object') return null
  const versions = normalizeStoryboardVersions(document.versions)
  return versions.find((item) => item.versionId === document.currentVersionId) || versions[0] || null
}

export function listStoryboardVersions(documentId) {
  const document = getStoryboardDocument(documentId)
  return document ? normalizeStoryboardVersions(document.versions) : []
}

export function getStoryboardVersion(documentId, versionId) {
  const normalizedVersionId = normalizeText(versionId)
  if (!normalizedVersionId) return null
  return listStoryboardVersions(documentId).find((item) => item.versionId === normalizedVersionId) || null
}

export function restoreStoryboardVersion(documentId, versionId) {
  const normalizedDocumentId = normalizeText(documentId)
  const normalizedVersionId = normalizeText(versionId)
  if (!normalizedDocumentId || !normalizedVersionId) {
    return { success: false, skipped: true, reason: 'invalid-target' }
  }

  const current = listStoryboardDocuments()
  const target = current.find((item) => item.id === normalizedDocumentId) || null
  if (!target) {
    return { success: false, skipped: true, reason: 'document-not-found' }
  }

  const versions = normalizeStoryboardVersions(target.versions)
  const version = versions.find((item) => item.versionId === normalizedVersionId) || null
  if (!version) {
    return { success: false, skipped: true, reason: 'version-not-found' }
  }

  const updated = {
    ...target,
    currentVersionId: version.versionId,
    versions,
    updatedAt: Date.now()
  }
  const next = [
    updated,
    ...current.filter((item) => item.id !== updated.id)
  ]
  setItem(STORAGE_KEYS.STORYBOARD_DOCUMENTS, next)

  return {
    success: true,
    document: updated,
    version
  }
}

export function createStoryboardSnapshot({
  sourceType = 'unknown',
  sourceLabel = '',
  sourceId = '',
  shots = [],
  metadata = {}
} = {}) {
  const validation = validateStoryboardShots(shots)
  const current = listStoryboardSnapshots()
  const sameSource = current.filter((item) => item.sourceType === sourceType && item.sourceId === sourceId)
  const version = sameSource.length + 1
  const now = Date.now()

  return {
    id: `storyboard_${now}_${Math.random().toString(36).slice(2, 8)}`,
    schemaVersion: STORYBOARD_SCHEMA_VERSION,
    version,
    sourceType,
    sourceLabel: sourceLabel || sourceType,
    sourceId,
    shots: validation.normalized,
    metadata: normalizeMetadata(metadata),
    validation: {
      valid: validation.valid,
      errors: validation.errors,
      warnings: validation.warnings
    },
    createdAt: now,
    updatedAt: now
  }
}

export function saveStoryboardSnapshot(input = {}) {
  const snapshot = createStoryboardSnapshot(input)
  const documentResult = saveStoryboardVersion({
    source: {
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      title: input.sourceLabel,
      excerpt: input.metadata?.excerpt || ''
    },
    shots: input.shots,
    taskType: input.metadata?.taskType || null,
    promptVersion: input.metadata?.promptVersion || null,
    parameters: input.metadata?.parameters || {}
  })
  snapshot.documentId = documentResult.document.id
  snapshot.versionId = documentResult.version.versionId
  const current = listStoryboardSnapshots()
  const next = [snapshot, ...current]
  setItem(STORAGE_KEYS.STORYBOARD_SNAPSHOTS, next)
  return snapshot
}

export function listStoryboardSnapshots({ sourceType = null, sourceId = null } = {}) {
  const stored = getItem(STORAGE_KEYS.STORYBOARD_SNAPSHOTS)
  const list = Array.isArray(stored) ? stored : []

  return list
    .filter((item) => !sourceType || item.sourceType === sourceType)
    .filter((item) => !sourceId || item.sourceId === sourceId)
    .sort((a, b) => Number(b.version || b.createdAt || 0) - Number(a.version || a.createdAt || 0))
}

export function getLatestStoryboardSnapshot({ sourceType = null, sourceId = null } = {}) {
  return listStoryboardSnapshots({ sourceType, sourceId })[0] || null
}

export function restoreStoryboardSnapshot(snapshotId) {
  return listStoryboardSnapshots().find((item) => item.id === snapshotId) || null
}

function createValidationIssue({
  shotId = null,
  field = null,
  code = '',
  message = '',
  severity = 'error'
} = {}) {
  return {
    shotId: normalizeNullableText(shotId),
    field: normalizeNullableText(field),
    code: normalizeText(code),
    message: normalizeText(message),
    severity: severity === 'warning' ? 'warning' : 'error'
  }
}

function findMatchingStoryboardDocument(documents = [], { projectId = null, source = {} } = {}) {
  const normalizedProjectId = normalizeNullableText(projectId)
  const normalizedSourceType = normalizeSourceType(source.sourceType)
  const normalizedSourceId = normalizeNullableText(source.sourceId)

  return documents
    .filter((item) => normalizeNullableText(item.projectId) === normalizedProjectId)
    .filter((item) => normalizeSourceType(item.source?.sourceType) === normalizedSourceType)
    .filter((item) => normalizeNullableText(item.source?.sourceId) === normalizedSourceId)
    .sort((a, b) => Number(b.updatedAt || b.createdAt || 0) - Number(a.updatedAt || a.createdAt || 0))[0] || null
}

function normalizeStoryboardVersions(versions = []) {
  return Array.isArray(versions)
    ? versions.filter((item) => item && typeof item === 'object')
    : []
}

function normalizeSourceType(sourceType) {
  const raw = normalizeText(sourceType)
  const aliased = STORYBOARD_SOURCE_TYPE_ALIASES[raw] || raw
  return STORYBOARD_SOURCE_TYPES.has(aliased) ? aliased : 'manual'
}

function getDefaultSourceTitle(sourceType) {
  if (sourceType === 'prose-card') return '散文分镜卡片'
  if (sourceType === 'poetry-tree') return '诗歌分镜树'
  if (sourceType === 'narrative-asset') return '素材分镜种子'
  if (sourceType === 'chapter') return '章节片段'
  return '手动分镜'
}

function normalizeShotType(value) {
  return SHOT_TYPES[value] ? value : 'medium'
}

function normalizeCamera(value) {
  return CAMERA_MOVEMENTS[value] ? value : 'fixed'
}

function normalizeTransition(value) {
  if (ALLOWED_TRANSITIONS.has(value)) return value
  return 'cut'
}

function normalizePositiveInt(value, fallback) {
  const num = Number.parseInt(value, 10)
  return Number.isInteger(num) && num > 0 ? num : fallback
}

function normalizePositiveNumber(value, fallback) {
  const num = Number(value)
  return Number.isFinite(num) && num > 0 ? num : fallback
}

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeNullableText(value) {
  const text = normalizeText(value)
  return text || null
}

function normalizeTimestamp(value) {
  const num = Number(value)
  if (!Number.isFinite(num) || num <= 0) return null
  return Math.floor(num)
}

function truncateText(value, maxChars) {
  const text = normalizeText(value).replace(/\s+/g, ' ')
  if (!text) return ''
  return text.length > maxChars ? `${text.slice(0, maxChars)}...` : text
}

function normalizeMetadata(metadata) {
  return metadata && typeof metadata === 'object' ? metadata : {}
}
