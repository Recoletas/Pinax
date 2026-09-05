import { Buffer } from 'node:buffer'
import { COLLABORATION_LIMITS, EXPERIENCE_RUNTIME_PATHS, LOCATOR_KEYS } from '../../../shared/collaboration/constants.js'

const LOCATOR_SET = new Set(LOCATOR_KEYS)
const RUNTIME_SET = new Set(EXPERIENCE_RUNTIME_PATHS)
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype
const keys = (value, allowed) => plain(value) && Object.keys(value).every(key => allowed.includes(key))
const string = (value, max = 240) => typeof value === 'string' && value.length <= max
const number = value => typeof value === 'number' && Number.isFinite(value)
const strings = (value, max = 24) => Array.isArray(value) && value.length <= max && value.every(item => string(item))
const records = (value, max, validate) => plain(value) && Object.keys(value).length <= max && Object.entries(value).every(([key, item]) => string(key, 120) && validate(item))

function runtimeItem (value, allowed, validators) {
  return keys(value, allowed) && Object.entries(value).every(([key, item]) => validators[key](item))
}

const itemSchemas = {
  writingCharacter: value => runtimeItem(value, ['name', 'gender', 'age', 'traits', 'mood', 'description', 'goal'], { name: string, gender: string, age: string, traits: value => strings(value, 12), mood: number, description: string, goal: string }),
  writingTime: value => runtimeItem(value, ['eraId', 'eraName', 'year', 'month', 'day'], { eraId: string, eraName: string, year: string, month: string, day: string }),
  worldMapState: value => runtimeItem(value, ['map', 'currentCountry', 'currentCity', 'currentScene', 'placeId'], {
    map: value => runtimeItem(value, ['countries'], { countries: value => Array.isArray(value) && value.length <= 64 && value.every(country => runtimeItem(country, ['id', 'name'], { id: string, name: string })) }),
    currentCountry: string, currentCity: string, currentScene: string, placeId: string
  }),
  placeStates: value => records(value, 64, state => runtimeItem(state, ['status', 'controllerId', 'danger'], { status: string, controllerId: string, danger: number })),
  characterStates: value => records(value, 64, state => runtimeItem(state, ['status', 'alive', 'placeId', 'goal', 'mood', 'knowledgeRefs'], { status: string, alive: value => typeof value === 'boolean', placeId: string, goal: string, mood: number, knowledgeRefs: value => strings(value, 24) })),
  characterRelations: value => records(value, 64, relation => runtimeItem(relation, ['subjectId', 'objectId', 'kind', 'status', 'sourceRefs'], { subjectId: string, objectId: string, kind: string, status: string, sourceRefs: value => strings(value, 8) })),
  canonicalFacts: value => records(value, 96, fact => runtimeItem(fact, ['subjectId', 'predicate', 'value', 'status', 'confidence', 'sourceRefs'], { subjectId: string, predicate: string, value: value => value === null || string(value) || number(value) || typeof value === 'boolean', status: string, confidence: number, sourceRefs: value => strings(value, 8) })),
  goals: value => Array.isArray(value) && value.length <= 6 && value.every(item => runtimeItem(item, ['id', 'title', 'status', 'source', 'updatedAt'], { id: string, title: string, status: string, source: string, updatedAt: number })),
  encounteredCharacters: value => Array.isArray(value) && value.length <= 12 && value.every(item => runtimeItem(item, ['id', 'name', 'gender', 'age', 'traits', 'description', 'goal', 'source', 'firstSeenAt', 'lastSeenAt'], { id: string, name: string, gender: string, age: string, traits: value => strings(value, 12), description: string, goal: string, source: string, firstSeenAt: number, lastSeenAt: number })),
  factionRelations: value => records(value, 64, number),
  keyChoices: value => Array.isArray(value) && value.length <= 10 && value.every(item => runtimeItem(item, ['id', 'label', 'source', 'createdAt'], { id: string, label: string, source: string, createdAt: number })),
  plotJournal: value => Array.isArray(value) && value.length <= 8 && value.every(item => runtimeItem(item, ['id', 'chapterId', 'summary', 'participants', 'locations', 'keyChoices', 'unresolvedHooks', 'sourceMessageIds', 'sourceStartIndex', 'sourceEndIndex', 'createdAt'], { id: string, chapterId: string, summary: string, participants: value => strings(value, 24), locations: value => strings(value, 24), keyChoices: value => strings(value, 24), unresolvedHooks: value => strings(value, 24), sourceMessageIds: value => strings(value, 64), sourceStartIndex: number, sourceEndIndex: number, createdAt: number })),
  activities: value => Array.isArray(value) && value.length <= 20 && value.every(item => runtimeItem(item, ['id', 'title', 'type', 'date', 'placeId', 'createdAt'], { id: string, title: string, type: string, date: string, placeId: string, createdAt: number }))
}

function containsSensitiveRuntimeKey (value) {
  if (!value || typeof value !== 'object') return false
  if (Object.keys(value).some(key => /(?:api[_-]?key|provider|secret|access[_-]?token)/iu.test(key))) return true
  return Object.values(value).some(containsSensitiveRuntimeKey)
}

export function inspectJsonPayload(value, limits = COLLABORATION_LIMITS) {
  let encoded
  try { encoded = JSON.stringify(value) } catch { return { valid: false, code: 'invalid-payload' } }
  if (Buffer.byteLength(encoded) > limits.maxPayloadBytes) return { valid: false, code: 'payload-too-large' }
  const visit = (item, depth) => {
    if (depth > limits.maxDepth) return 'payload-too-deep'
    if (typeof item === 'string' && item.length > limits.maxStringLength) return 'payload-too-large'
    if (Array.isArray(item)) {
      if (item.length > limits.maxArrayLength) return 'invalid-payload'
      for (const child of item) { const error = visit(child, depth + 1); if (error) return error }
    } else if (item !== null && typeof item === 'object') {
      const keys = Object.keys(item)
      if (keys.some(key => ['__proto__', 'prototype', 'constructor'].includes(key))) return 'invalid-payload'
      if (keys.length > limits.maxObjectKeys) return 'invalid-payload'
      for (const child of Object.values(item)) { const error = visit(child, depth + 1); if (error) return error }
    } else if (typeof item === 'number' && !Number.isFinite(item)) return 'invalid-payload'
    else if (!['string', 'number', 'boolean'].includes(typeof item) && item !== null) return 'invalid-payload'
    return null
  }
  const code = visit(value, 0)
  return code ? { valid: false, code } : { valid: true, bytes: Buffer.byteLength(encoded) }
}

function onlyKeys(value, allowed) {
  return value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).every(key => allowed.includes(key))
}

export function validateCiphertextEnvelope(value) {
  if (!onlyKeys(value, ['schemaVersion', 'encryption', 'nonceBase64', 'ciphertextBase64', 'authTagBase64'])) return false
  if (value.schemaVersion !== 1 || value.encryption !== 'aes-256-gcm') return false
  return [value.nonceBase64, value.ciphertextBase64, value.authTagBase64].every(item => typeof item === 'string' && /^[A-Za-z0-9+/]*={0,2}$/.test(item))
    && Buffer.byteLength(value.ciphertextBase64, 'base64') <= COLLABORATION_LIMITS.maxCiphertextBytes
    && Buffer.byteLength(value.nonceBase64, 'base64') === 12
    && Buffer.byteLength(value.authTagBase64, 'base64') === 16
}

export function validateCommandShape(type, payload) {
  const inspected = inspectJsonPayload(payload)
  if (!inspected.valid) return inspected
  const schemas = {
    'chat.send': ['body', 'content', 'target'],
    'proposal.create': ['proposal'],
    'proposal.status': ['proposalId', 'status'],
    'vote.cast': ['proposalId', 'value'],
    'artifact.publish': ['shareSessionId', 'manifestFingerprint', 'artifact'],
    'generation.request': ['requestId', 'proposalId', 'target', 'content', 'actionText', 'shareSessionId', 'manifestFingerprint'],
    'generation.complete': ['requestId', 'proposalId', 'artifact', 'content', 'actionText', 'assistantMessage'],
    'generation.status': ['requestId', 'phase', 'message', 'progress'],
    'generation.terminate': ['requestId', 'status', 'code'],
    'promotion.request': ['request'],
    'promotion.status': ['proposalId', 'artifactFingerprint', 'status', 'receipt'],
    'experience.runtime.patch.accept': ['version', 'paths', 'state', 'requestId']
  }
  if (!schemas[type] || !onlyKeys(payload, schemas[type])) return { valid: false, code: schemas[type] ? 'invalid-payload' : 'unknown-command' }
  if (payload.target && (!onlyKeys(payload.target, LOCATOR_KEYS) || Object.keys(payload.target).some(key => !LOCATOR_SET.has(key)))) return { valid: false, code: 'invalid-payload' }
  if (payload.content && typeof payload.content !== 'string' && !validateCiphertextEnvelope(payload.content)) return { valid: false, code: 'invalid-payload' }
  if (type === 'experience.runtime.patch.accept' && (payload.version !== 1 || typeof payload.requestId !== 'string' || !payload.requestId.trim()
    || !Array.isArray(payload.paths) || !payload.paths.length || new Set(payload.paths).size !== payload.paths.length
    || payload.paths.some(path => !RUNTIME_SET.has(path)) || !onlyKeys(payload.state, payload.paths))) return { valid: false, code: 'invalid-payload' }
  if (type === 'experience.runtime.patch.accept' && payload.paths.some(path => !itemSchemas[path]?.(payload.state[path]))) return { valid: false, code: 'invalid-payload' }
  if (type === 'experience.runtime.patch.accept' && containsSensitiveRuntimeKey(payload.state)) return { valid: false, code: 'invalid-payload' }
  return { valid: true, bytes: inspected.bytes }
}

export class CollaborationRateLimiter {
  constructor ({ clock = () => Date.now(), limits = COLLABORATION_LIMITS, bucketTtlMs = 2 * 60_000, maxBuckets = 30_000 } = {}) {
    if (!Number.isSafeInteger(bucketTtlMs) || bucketTtlMs <= 0 || !Number.isSafeInteger(maxBuckets) || maxBuckets < 3) throw new TypeError('invalid-rate-limiter-bounds')
    this.clock = clock
    this.limits = limits
    this.bucketTtlMs = bucketTtlMs
    this.maxBuckets = maxBuckets
    this.buckets = new Map()
    this.nextSweepAt = 0
  }

  sweep (now = this.clock()) {
    for (const [key, bucket] of this.buckets) if (now - bucket.touchedAt >= this.bucketTtlMs) this.buckets.delete(key)
    this.nextSweepAt = now + this.bucketTtlMs
    return this.buckets.size
  }

  consume ({ ip, roomId, memberId }) {
    const now = this.clock()
    if (now >= this.nextSweepAt) this.sweep(now)
    const minute = Math.floor(now / 60_000)
    const checks = [
      [`ip:${ip}`, this.limits.ratePerIpPerMinute],
      [`room:${roomId}`, this.limits.ratePerRoomPerMinute],
      [`member:${roomId}:${memberId}`, this.limits.ratePerMemberPerMinute]
    ]
    const newBucketCount = checks.reduce((count, [key]) => count + (this.buckets.has(key) ? 0 : 1), 0)
    if (this.buckets.size + newBucketCount > this.maxBuckets) return false
    for (const [key, limit] of checks) {
      const bucket = this.buckets.get(key)
      if (bucket?.minute === minute && bucket.count >= limit) return false
    }
    for (const [key] of checks) {
      const bucket = this.buckets.get(key)
      this.buckets.set(key, bucket?.minute === minute ? { minute, count: bucket.count + 1, touchedAt: now } : { minute, count: 1, touchedAt: now })
    }
    return true
  }

  get size () { return this.buckets.size }
}
