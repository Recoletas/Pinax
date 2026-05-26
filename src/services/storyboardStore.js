import { getItem, setItem, STORAGE_KEYS } from '../composables/useStorage'
import { CAMERA_MOVEMENTS, SHOT_TYPES } from '../types/director'

export const STORYBOARD_SCHEMA_VERSION = 1

const ALLOWED_TRANSITIONS = new Set(['none', 'cut', 'dissolve', 'fade'])

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

function normalizeMetadata(metadata) {
  return metadata && typeof metadata === 'object' ? metadata : {}
}
