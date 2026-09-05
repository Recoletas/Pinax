// F1-2: strict parser for the short, run-only direction planning response.

export const AUTHORING_SCENE_DIRECTION_SET_SCHEMA_VERSION = 1
export const AUTHORING_SCENE_DIRECTION_LIMITS = Object.freeze({ min: 2, max: 3, maxOutputChars: 2400 })

function text(value) {
  return String(value ?? '').trim()
}

function list(value) {
  return Array.isArray(value) ? value : []
}

function unique(values = []) {
  return [...new Set(list(values).map(text).filter(Boolean))]
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]))
}

function fingerprint(prefix, value) {
  const source = JSON.stringify(stableValue(value))
  let hash = 2166136261
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return `${prefix}-${(hash >>> 0).toString(36)}`
}

function deepFreeze(value, seen = new WeakSet()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return value
  seen.add(value)
  for (const child of Object.values(value)) deepFreeze(child, seen)
  return Object.isFrozen(value) ? value : Object.freeze(value)
}

function failure(reason, details = {}) {
  return deepFreeze({ ok: false, reason: text(reason) || 'scene-direction-invalid', ...details })
}

function parsePayload(raw) {
  if (raw && typeof raw === 'object') {
    try {
      return JSON.stringify(raw).length <= AUTHORING_SCENE_DIRECTION_LIMITS.maxOutputChars ? raw : null
    } catch {
      return null
    }
  }
  const source = text(raw).replace(/^```(?:json)?\s*/iu, '').replace(/```\s*$/u, '')
  if (!source || source.length > AUTHORING_SCENE_DIRECTION_LIMITS.maxOutputChars) return null
  try {
    return JSON.parse(source)
  } catch {
    return null
  }
}

function normalizedAction(value) {
  return text(value).toLocaleLowerCase('zh-CN').replace(/[\s，。！？、；：,.!?;:'“”‘’"()（）《》]/gu, '')
}

function bigrams(value) {
  const normalized = normalizedAction(value)
  if (normalized.length < 2) return new Set([normalized])
  return new Set([...normalized].slice(0, -1).map((character, index) => `${character}${normalized[index + 1]}`))
}

function actionSimilarity(left, right) {
  const a = bigrams(left)
  const b = bigrams(right)
  const union = new Set([...a, ...b])
  if (!union.size) return 1
  return [...a].filter((item) => b.has(item)).length / union.size
}

export function parseAuthoringSceneDirectionSet(raw, pressureProjection = {}) {
  if (pressureProjection?.kind !== 'authoring-scene-pressure-projection' || !pressureProjection?.fingerprint) {
    return failure('scene-pressure-invalid')
  }
  const payload = parsePayload(raw)
  if (!payload) return failure('direction-output-invalid-json')
  if (payload.status === 'insufficient-evidence' || payload.kind === 'insufficient-evidence') {
    return failure('insufficient-evidence', { missing: unique(payload.missing).slice(0, 6) })
  }
  if (pressureProjection.availability !== 'ready') {
    return failure(pressureProjection.availability === 'conflict' ? 'scene-pressure-conflict' : 'insufficient-evidence')
  }

  const directions = list(payload.directions)
  if (directions.length < AUTHORING_SCENE_DIRECTION_LIMITS.min || directions.length > AUTHORING_SCENE_DIRECTION_LIMITS.max) {
    return failure('direction-count-invalid', { count: directions.length })
  }
  const allowedEvidenceRefs = new Set(pressureProjection.evidence.flatMap((item) => [item.ref, ...list(item.sourceRefs)]))
  const allowedEntityRefs = new Set([
    ...pressureProjection.participants.map((item) => item.ref),
    ...(pressureProjection.location ? [pressureProjection.location.ref] : [])
  ])
  const normalized = []
  for (let index = 0; index < directions.length; index += 1) {
    const source = directions[index] || {}
    const direction = {
      id: text(source.id) || `direction-${index + 1}`,
      title: text(source.title),
      action: text(source.action),
      immediateGain: text(source.immediateGain),
      cost: text(source.cost),
      evidenceRefs: unique(source.evidenceRefs),
      entityRefs: unique(source.entityRefs)
    }
    if (!direction.title || !direction.action || !direction.immediateGain || !direction.cost) {
      return failure('direction-field-missing', { index })
    }
    if (direction.title.length > 24 || direction.action.length > 100
      || direction.immediateGain.length > 48 || direction.cost.length > 48) {
      return failure('direction-field-too-long', { index })
    }
    const unknownEvidenceRefs = direction.evidenceRefs.filter((ref) => !allowedEvidenceRefs.has(ref))
    if (!direction.evidenceRefs.length) return failure('direction-evidence-missing', { index })
    if (unknownEvidenceRefs.length) return failure('direction-evidence-unknown', { index, refs: unknownEvidenceRefs })
    const unknownEntityRefs = direction.entityRefs.filter((ref) => !allowedEntityRefs.has(ref))
    if (unknownEntityRefs.length) return failure('direction-entity-unknown', { index, refs: unknownEntityRefs })
    if (/^(更|保持)?(紧张|温柔|文学|悬疑|轻松|快速|缓慢)(一些|一点|风格|语气)?$/u.test(direction.title)
      || /(?:改成|使用|采用).{0,6}(语气|文风|风格)$/u.test(direction.action)) {
      return failure('direction-style-only', { index })
    }
    normalized.push(direction)
  }

  if (new Set(normalized.map((item) => item.id)).size !== normalized.length) {
    return failure('direction-id-duplicate')
  }
  for (let left = 0; left < normalized.length; left += 1) {
    for (let right = left + 1; right < normalized.length; right += 1) {
      if (normalizedAction(normalized[left].action) === normalizedAction(normalized[right].action)
        || actionSimilarity(normalized[left].action, normalized[right].action) >= 0.72) {
        return failure('direction-action-duplicate', { indexes: [left, right] })
      }
    }
  }

  const statement = text(payload.pressure?.statement || payload.pressureStatement)
  const pressureEvidenceRefs = unique(payload.pressure?.evidenceRefs)
  if (!statement) return failure('direction-pressure-missing')
  if (!pressureEvidenceRefs.length) return failure('direction-pressure-evidence-missing')
  const unknownPressureRefs = pressureEvidenceRefs.filter((ref) => !allowedEvidenceRefs.has(ref))
  if (unknownPressureRefs.length) return failure('direction-pressure-evidence-unknown', { refs: unknownPressureRefs })
  const value = {
    kind: 'authoring-scene-direction-set',
    version: AUTHORING_SCENE_DIRECTION_SET_SCHEMA_VERSION,
    sessionFingerprint: pressureProjection.sessionFingerprint,
    pressureFingerprint: pressureProjection.fingerprint,
    pressure: { statement, evidenceRefs: pressureEvidenceRefs },
    directions: normalized
  }
  value.fingerprint = fingerprint('scene-directions', value)
  return deepFreeze({ ok: true, directionSet: value })
}

export default parseAuthoringSceneDirectionSet
