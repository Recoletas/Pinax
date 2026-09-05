import express, { Router } from 'express'
import { COLLABORATION_LIMITS } from '../../shared/collaboration/constants.js'
import { inspectJsonPayload } from '../realtime/v2/security.js'

const safe = handler => (req, res) => { try { handler(req, res) } catch (error) { const code = String(error?.message || 'invalid-request'); res.status(code.includes('exists') ? 409 : 400).json({ error: code.slice(0, 120) }) } }
const exactBody = (value, allowed) => value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).every(key => allowed.includes(key))
export const validateRoomCreationBody = value => exactBody(value, ['roomSlug', 'roomKind', 'hostDisplayName', 'manifestFingerprint', 'shareSessionId', 'encryptionPolicy', 'targetAllowlist'])

export function createRestCreationLimiter ({ clock = () => Date.now(), maxPerMinute = 10, maxBuckets = 2_000, staleAfterMs = 2 * 60_000 } = {}) {
  const buckets = new Map()
  const sweep = now => { for (const [key, bucket] of buckets) if (now - bucket.touchedAt >= staleAfterMs) buckets.delete(key) }
  return {
    consume (ip) {
      const now = clock(); sweep(now)
      const minute = Math.floor(now / 60_000); const bucket = buckets.get(ip)
      if (!bucket && buckets.size >= maxBuckets) return false
      if (bucket?.minute === minute && bucket.count >= maxPerMinute) return false
      buckets.set(ip, bucket?.minute === minute ? { minute, count: bucket.count + 1, touchedAt: now } : { minute, count: 1, touchedAt: now })
      return true
    },
    sweep: () => sweep(clock()),
    get size () { return buckets.size }
  }
}

export function inspectCollaborationRestRequest (req, { allowedOrigins = [] } = {}) {
  const length = Number(req.get?.('content-length') || 0); if (Number.isFinite(length) && length > COLLABORATION_LIMITS.maxPayloadBytes) return { ok: false, status: 413, code: 'payload-too-large' }
  const inspected = inspectJsonPayload(req.body || {}); if (!inspected.valid) return { ok: false, status: inspected.code === 'payload-too-large' ? 413 : 400, code: inspected.code }
  const origin = req.get?.('origin'); if (origin && !allowedOrigins.includes(origin)) return { ok: false, status: 403, code: 'origin-not-allowed' }
  return { ok: true }
}

export function createCollaborationRouter ({ repository, creationLimiter = createRestCreationLimiter(), allowedOrigins = [], serverQuota = undefined, serverRoomTtlMs = COLLABORATION_LIMITS.defaultRoomTtlMs, maxActiveRooms = COLLABORATION_LIMITS.maxActiveRooms, onMembersInvalidated = null }) {
  if (!repository) throw new TypeError('collaboration-repository-required')
  const router = Router()
  router.use(express.json({ limit: COLLABORATION_LIMITS.maxPayloadBytes }))
  router.post('/rooms', safe((req, res) => {
    const inspected = inspectCollaborationRestRequest(req, { allowedOrigins }); if (!inspected.ok) return res.status(inspected.status).json({ error: inspected.code })
    if (!creationLimiter.consume(req.ip || req.socket?.remoteAddress || 'unknown')) return res.status(429).json({ error: 'rate-limited' })
    if (!validateRoomCreationBody(req.body)) return res.status(400).json({ error: 'invalid-payload' })
    if (repository.countActiveRooms() >= maxActiveRooms) return res.status(503).json({ error: 'room-capacity-exceeded' })
    const created = repository.createRoom({ ...(req.body || {}), ttlMs: serverRoomTtlMs, ...(serverQuota ? { quota: serverQuota } : {}) })
    const invite = repository.createInvite(created.room.roomId, { role: 'reviewer' })
    res.status(201).json({ room: created.room, host: created.host, invite })
  }))
  router.post('/rooms/:roomId/invites', safe((req, res) => {
    const inspected = inspectCollaborationRestRequest(req, { allowedOrigins }); if (!inspected.ok) return res.status(inspected.status).json({ error: inspected.code })
    if (!exactBody(req.body || {}, ['role', 'ttlMs', 'maxUses'])) return res.status(400).json({ error: 'invalid-payload' })
    if (!repository.authenticateMember({ roomId: req.params.roomId, memberId: req.get('x-collaboration-member'), resumeToken: req.get('x-collaboration-resume'), requiredRole: 'host' })) return res.status(403).json({ error: 'unauthorized' })
    res.status(201).json(repository.createInvite(req.params.roomId, req.body || {}))
  }))
  router.delete('/rooms/:roomId/invites/:inviteId', safe((req, res) => {
    const inspected = inspectCollaborationRestRequest(req, { allowedOrigins }); if (!inspected.ok) return res.status(inspected.status).json({ error: inspected.code })
    if (!repository.authenticateMember({ roomId: req.params.roomId, memberId: req.get('x-collaboration-member'), resumeToken: req.get('x-collaboration-resume'), requiredRole: 'host' })) return res.status(403).json({ error: 'unauthorized' })
    const result = repository.revokeInvite(req.params.roomId, req.params.inviteId)
    if (result.revoked && result.invalidatedMemberIds.length) onMembersInvalidated?.({ roomId: req.params.roomId, memberIds: result.invalidatedMemberIds, events: result.events, code: 'invite-revoked' })
    res.status(result.revoked ? 200 : 404).json(result)
  }))
  router.get('/rooms/:roomId/snapshot', safe((req, res) => {
    const origin = req.get('origin'); if (origin && !allowedOrigins.includes(origin)) return res.status(403).json({ error: 'origin-not-allowed' })
    if (!repository.authenticateMember({ roomId: req.params.roomId, memberId: req.get('x-collaboration-member'), resumeToken: req.get('x-collaboration-resume') })) return res.status(403).json({ error: 'unauthorized' })
    res.json(repository.getRecovery(req.params.roomId, Number(req.query.lastSeq) || 0))
  }))
  router.use((error, _req, res, _next) => res.status(error?.type === 'entity.too.large' ? 413 : 400).json({ error: error?.type === 'entity.too.large' ? 'payload-too-large' : 'invalid-payload' }))
  return router
}
