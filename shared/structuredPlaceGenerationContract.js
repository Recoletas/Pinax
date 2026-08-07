import {
  PLACE_KINDS,
  PLACE_FLESH_OUT_RELATION_TYPES,
  PLACE_RELATION_TYPES,
  PLACE_SCALES,
  normalizePlacePayload
} from './placeEntryContract.js'

export const STRUCTURED_PLACE_GENERATION_SCHEMA_VERSION = 1
export const STRUCTURED_PLACE_GENERATION_LIMITS = Object.freeze({
  maxPlacesPerBatch: 12,
  maxNameChars: 80,
  maxDescriptionChars: 1200,
  maxFleshOutDescriptionChars: 600,
  maxEvidenceChars: 360,
  maxRelationCount: 12
})

function text(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
}

function invalid(message, details = {}) {
  return { valid: false, error: { code: 'STRUCTURED_GENERATION_RESPONSE_INVALID', message, ...details } }
}

export function getStructuredPlaceGenerationSchema() {
  const relation = {
    type: 'object',
    properties: {
      type: { type: 'string', enum: [...PLACE_RELATION_TYPES] },
      targetName: { type: 'string', maxLength: 80 }
    },
    required: ['type', 'targetName'],
    additionalProperties: false
  }
  return {
    type: 'object',
    properties: {
      places: {
        type: 'array',
        maxItems: STRUCTURED_PLACE_GENERATION_LIMITS.maxPlacesPerBatch,
        items: {
          type: 'object',
          properties: {
            name: { type: 'string', minLength: 2, maxLength: STRUCTURED_PLACE_GENERATION_LIMITS.maxNameChars },
            kind: { type: 'string', enum: [...PLACE_KINDS] },
            scale: { type: 'string', enum: [...PLACE_SCALES] },
            aliases: { type: 'array', items: { type: 'string', maxLength: 80 }, maxItems: 12 },
            parentRef: { type: 'string', maxLength: 80 },
            factionRef: { type: 'string', maxLength: 80 },
            terrainHints: { type: 'array', items: { type: 'string', maxLength: 40 }, maxItems: 8 },
            description: { type: 'string', minLength: 2, maxLength: STRUCTURED_PLACE_GENERATION_LIMITS.maxDescriptionChars },
            evidence: { type: 'string', minLength: 2, maxLength: STRUCTURED_PLACE_GENERATION_LIMITS.maxEvidenceChars },
            relations: { type: 'array', items: relation, maxItems: STRUCTURED_PLACE_GENERATION_LIMITS.maxRelationCount }
          },
          required: ['name', 'kind', 'scale', 'aliases', 'parentRef', 'factionRef', 'terrainHints', 'description', 'evidence', 'relations'],
          additionalProperties: false
        }
      }
    },
    required: ['places'],
    additionalProperties: false
  }
}

export function normalizeStructuredPlaceGenerationPayload(payload) {
  const rawPlaces = Array.isArray(payload?.places)
    ? payload.places
    : Array.isArray(payload?.drafts?.places) ? payload.drafts.places : null
  if (!rawPlaces) return invalid('setting-places.v1 必须返回 places 数组')
  if (rawPlaces.length > STRUCTURED_PLACE_GENERATION_LIMITS.maxPlacesPerBatch) {
    return invalid(`地点草稿超过单批 ${STRUCTURED_PLACE_GENERATION_LIMITS.maxPlacesPerBatch} 项上限`)
  }
  const places = []
  const fieldErrors = {}
  rawPlaces.forEach((raw, index) => {
    const name = text(raw?.name)
    const description = text(raw?.description)
    const evidence = text(raw?.evidence || raw?.sourceEvidence)
    if (!name || !description || !evidence) {
      const reason = '地点必须包含名称、描述和原文证据'
      fieldErrors[index] = reason
      places.push({
        ...normalizePlacePayload({
          ...raw,
          sourceEvidence: evidence ? [{ excerpt: evidence, source: '地理环境', confidence: 'low' }] : [],
          reviewState: 'draft'
        }, { draft: true }),
        evidence,
        fieldIndex: index,
        invalidReason: reason
      })
      return
    }
    if (!PLACE_KINDS.includes(text(raw?.kind))) {
      const reason = `地点类型必须是 ${PLACE_KINDS.join('、')} 之一`
      fieldErrors[index] = reason
      places.push({
        ...normalizePlacePayload({
          ...raw,
          description,
          sourceEvidence: [{ excerpt: evidence, source: '地理环境', confidence: 'low' }],
          reviewState: 'draft'
        }, { draft: true }),
        evidence,
        fieldIndex: index,
        invalidReason: reason
      })
      return
    }
    const normalized = normalizePlacePayload({
      ...raw,
      description,
      sourceEvidence: [{ excerpt: evidence, source: '地理环境', confidence: 'unknown' }],
      reviewState: 'draft'
    }, { draft: true })
    places.push({ ...normalized, evidence, fieldIndex: index })
  })
  if (!places.length && rawPlaces.length) return invalid('setting-places.v1 没有可用地点', { fieldErrors })
  return { valid: true, places, fieldErrors }
}

export function getStructuredPlaceFleshOutSchema() {
  const relation = {
    type: 'object',
    properties: {
      type: { type: 'string', enum: [...PLACE_FLESH_OUT_RELATION_TYPES] },
      targetName: { type: 'string', maxLength: 80 }
    },
    required: ['type', 'targetName'],
    additionalProperties: false
  }
  return {
    type: 'object',
    properties: {
      places: {
        type: 'array',
        minItems: 1,
        maxItems: 1,
        items: {
          type: 'object',
          properties: {
            name: { type: 'string', minLength: 2, maxLength: STRUCTURED_PLACE_GENERATION_LIMITS.maxNameChars },
            kind: { type: 'string', enum: [...PLACE_KINDS] },
            scale: { type: 'string', enum: [...PLACE_SCALES] },
            aliases: { type: 'array', items: { type: 'string', maxLength: 80 }, maxItems: 12 },
            terrainHints: { type: 'array', items: { type: 'string', maxLength: 40 }, maxItems: 8 },
            keywords: { type: 'array', items: { type: 'string', maxLength: 40 }, maxItems: 12 },
            description: { type: 'string', minLength: 2, maxLength: STRUCTURED_PLACE_GENERATION_LIMITS.maxFleshOutDescriptionChars },
            relations: { type: 'array', items: relation, maxItems: STRUCTURED_PLACE_GENERATION_LIMITS.maxRelationCount }
          },
          required: ['name', 'kind', 'scale', 'aliases', 'terrainHints', 'keywords', 'description', 'relations'],
          additionalProperties: false
        }
      }
    },
    required: ['places'],
    additionalProperties: false
  }
}

const PLACE_KIND_ALIASES = {
  '大陆': 'continent', '区域': 'region', '城市': 'city', '城镇': 'town',
  '村落': 'village', '村庄': 'village', '港口': 'port', '要塞': 'fortress',
  '学院': 'academy', '地点': 'site', '河流': 'river', '路线': 'route'
}

function resolvePlaceKind(value) {
  const kind = text(value)
  if (PLACE_KINDS.includes(kind)) return kind
  return PLACE_KIND_ALIASES[kind] || ''
}

const NON_AUTHORED_REF = Object.freeze({
  targetId: '',
  targetName: '',
  status: 'invalid'
})

function clearNonAuthoredRefs(place) {
  if (!place || typeof place !== 'object') return place
  return {
    ...place,
    parentRef: { ...NON_AUTHORED_REF },
    factionRef: { ...NON_AUTHORED_REF },
    sourceEvidence: []
  }
}

function filterFleshOutRelations(place) {
  if (!place || typeof place !== 'object') return place
  const rawRelations = Array.isArray(place.relations) ? place.relations : []
  const allowed = new Set(PLACE_FLESH_OUT_RELATION_TYPES)
  const filtered = []
  for (const relation of rawRelations) {
    if (!relation || typeof relation !== 'object') continue
    const type = text(relation.type)
    if (!allowed.has(type)) continue
    const targetName = text(relation.targetName)
    if (!targetName) continue
    filtered.push({ type, targetName })
  }
  return { ...place, relations: filtered }
}

export function normalizeStructuredPlaceFleshOutPayload(payload) {
  const candidates = []
  if (Array.isArray(payload)) candidates.push(...payload)
  if (payload && typeof payload === 'object') {
    if (Array.isArray(payload.places)) candidates.push(...payload.places)
    if (Array.isArray(payload.drafts?.places)) candidates.push(...payload.drafts.places)
    if (payload.place && typeof payload.place === 'object') candidates.push(payload.place)
    if (typeof payload.name === 'string' && typeof payload.description === 'string') candidates.push(payload)
  }
  const raw = candidates.find((candidate) => candidate && text(candidate?.name) && text(candidate?.description))
  if (!raw) {
    return invalid('setting-place.v1 必须返回至少一个包含名称和描述的地点')
  }
  const kind = resolvePlaceKind(raw.kind) || 'site'
  const normalized = normalizePlacePayload({ ...raw, kind, reviewState: 'draft' }, { draft: true })
  const stripped = filterFleshOutRelations(clearNonAuthoredRefs(normalized))
  return { valid: true, places: [stripped], fieldErrors: {} }
}
