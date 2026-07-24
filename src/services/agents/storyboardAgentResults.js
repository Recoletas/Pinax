import { CAMERA_MOVEMENTS, SHOT_TYPES } from '../../types/director'

const TRANSITIONS = new Set(['none', 'cut', 'dissolve', 'fade'])
const PATCH_FIELDS = new Set([
  'shotType', 'cameraMovement', 'duration', 'visual',
  'transition', 'dialogue', 'sound', 'notes'
])

function text(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
}

function normalizeEvidenceRefs(values, allowedRefs) {
  return [...new Set((Array.isArray(values) ? values : [])
    .map(text)
    .filter((ref) => ref && allowedRefs.has(ref)))].slice(0, 8)
}

function normalizePatch(payload, allowedShotId, allowedRefs) {
  if (text(payload?.shotId) !== allowedShotId) return null
  const changes = {}
  for (const [field, raw] of Object.entries(payload?.changes || {})) {
    if (!PATCH_FIELDS.has(field)) continue
    if (field === 'duration') {
      const duration = Number(raw)
      if (!Number.isFinite(duration) || duration < 1 || duration > 60) return null
      changes.duration = Math.round(duration)
      continue
    }
    const value = text(raw)
    if (field === 'shotType' && !SHOT_TYPES[value]) return null
    if (field === 'cameraMovement' && !CAMERA_MOVEMENTS[value]) return null
    if (field === 'transition' && !TRANSITIONS.has(value)) return null
    changes[field] = value.slice(0, field === 'visual' ? 600 : 320)
  }
  if (!Object.keys(changes).length) return null
  return {
    shotId: allowedShotId,
    changes,
    reason: text(payload?.reason).slice(0, 320),
    evidenceRefs: normalizeEvidenceRefs(payload?.evidenceRefs, allowedRefs)
  }
}

function normalizeGeneration(payload, target, allowedRefs) {
  const prompt = String(payload?.prompt || '').trim()
  if (
    text(payload?.shotId) !== text(target.allowedShotId)
    || text(payload?.versionId) !== text(target.versionId)
    || prompt.length < 20
    || prompt.length > 2000
  ) return null
  return {
    kind: 'storyboard-video',
    shotId: text(target.allowedShotId),
    versionId: text(target.versionId),
    prompt,
    evidenceRefs: normalizeEvidenceRefs(payload?.evidenceRefs, allowedRefs)
  }
}

export function validateStoryboardAgentResult(result, { taskType = '', target = {} } = {}) {
  const actions = Array.isArray(result?.actions) ? result.actions : []
  const allowedRefs = new Set((target.allowedEvidenceRefs || []).map(text).filter(Boolean))
  if (actions.length !== 1) return { valid: false, reason: 'invalid-storyboard-action-count' }
  if (taskType === 'storyboard.review' && actions[0]?.type === 'storyboard-shot-patch') {
    const payload = normalizePatch(actions[0].payload, text(target.allowedShotId), allowedRefs)
    return payload
      ? { valid: true, result: { ...result, actions: [{ ...actions[0], payload }] } }
      : { valid: false, reason: 'invalid-storyboard-patch' }
  }
  if (taskType === 'storyboard.video.prompt' && actions[0]?.type === 'generation-request') {
    const payload = normalizeGeneration(actions[0].payload, target, allowedRefs)
    return payload
      ? { valid: true, result: { ...result, actions: [{ ...actions[0], payload }] } }
      : { valid: false, reason: 'invalid-generation-request' }
  }
  return { valid: false, reason: 'unsupported-storyboard-result' }
}

export function applyStoryboardShotPatch(shots, action, allowedShotId) {
  const index = (shots || []).findIndex((shot) => text(shot?.shotId || shot?.nodeId) === text(allowedShotId))
  if (index < 0 || action?.type !== 'storyboard-shot-patch') {
    return { ok: false, reason: 'shot-not-found' }
  }
  const before = { ...shots[index] }
  const changes = { ...action.payload.changes }
  if (changes.shotType) changes.shotSize = changes.shotType
  if (changes.cameraMovement) changes.camera = changes.cameraMovement
  if (changes.visual) changes.tone = changes.visual
  const after = { ...before, ...changes }
  return {
    ok: true,
    shots: shots.map((shot, shotIndex) => shotIndex === index ? after : { ...shot }),
    receipt: { type: 'storyboard-shot-patch', shotId: text(allowedShotId), before, after }
  }
}

export function canUndoStoryboardShotPatch(shots, receipt) {
  if (receipt?.type !== 'storyboard-shot-patch') return false
  const current = (shots || []).find((shot) => text(shot?.shotId || shot?.nodeId) === receipt.shotId)
  return JSON.stringify(current) === JSON.stringify(receipt.after)
}

export function undoStoryboardShotPatch(shots, receipt) {
  return (shots || []).map((shot) =>
    text(shot?.shotId || shot?.nodeId) === receipt.shotId ? { ...receipt.before } : { ...shot }
  )
}
