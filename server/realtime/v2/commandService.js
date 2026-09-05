import { randomUUID } from 'node:crypto'
import { CAPABILITIES_BY_ROLE, COLLABORATION_LIMITS, COMMAND_CAPABILITIES, GENERATION_TERMINAL_CODES, GENERATION_TERMINAL_STATUSES, PROPOSAL_STATUSES } from '../../../shared/collaboration/constants.js'
import { canonicalJson, fingerprintJson, sha256Hex } from '../../../shared/collaboration/canonicalJson.js'
import { rejectedAck, validateEncryptedContent, validateEnvelope, validatePromotionRequest, validatePromotionStatus, validateProposal, validateStableLocator, validateWireArtifact, validateWireProposal } from '../../../shared/collaboration/contracts.js'
import { validateCommandShape } from './security.js'

const text = (value, max = 160) => typeof value === 'string' && Boolean(value.trim()) && value.length <= max
const transitions = Object.freeze({ open: new Set(['selected', 'rejected', 'withdrawn', 'stale']), selected: new Set(['rejected', 'stale', 'adopted']), rejected: new Set(), withdrawn: new Set(), stale: new Set(), adopted: new Set() })
const privileged = new Set(['proposal.status', 'artifact.publish', 'generation.request', 'generation.complete', 'generation.status', 'generation.terminate', 'promotion.request', 'promotion.status', 'experience.runtime.patch.accept'])
const publishableArtifactKinds = new Set(['intervention', 'direction-set', 'impact-group'])
const generationPhases = new Set(['deciding', 'requesting-step', 'finalizing', 'retrying-step', 'repairing-step', 'resource-refreshed', 'executing-tools', 'tools-complete', 'ready', 'streaming', 'complete', 'error'])
const generationTerminalStatuses = new Set(GENERATION_TERMINAL_STATUSES)
const generationTerminalCodes = new Set(GENERATION_TERMINAL_CODES)
const artifactContentCommands = new Set(['proposal.create', 'artifact.publish', 'generation.request', 'generation.complete', 'generation.status', 'experience.runtime.patch.accept'])

export class CollaborationCommandService {
  constructor ({ repository, clock = () => Date.now(), randomId = prefix => `${prefix}_${randomUUID()}`, rateLimiter = null } = {}) {
    this.repository = repository; this.clock = clock; this.randomId = randomId; this.rateLimiter = rateLimiter
  }

  #reject (envelope, code) { return { ack: rejectedAck({ commandId: envelope?.commandId, roomId: envelope?.roomId, code }) } }

  execute (envelope, auth = {}) {
    const valid = validateEnvelope(envelope)
    if (!valid.valid) return this.#reject(envelope, valid.reason)
    if (auth.memberId !== envelope.actorId) return this.#reject(envelope, 'unauthorized')
    const room = this.repository.getRoom(envelope.roomId)
    if (!room || room.status !== 'active' || Date.parse(room.expiresAt) <= this.clock()) return this.#reject(envelope, 'expired')
    const shape = validateCommandShape(envelope.type, envelope.payload)
    if (!shape.valid) return this.#reject(envelope, shape.code)
    const member = this.repository.getMember(envelope.roomId, auth.memberId)
    if (!member || member.leftAt || !this.repository.isMemberActive(envelope.roomId, auth.memberId)) return this.#reject(envelope, 'unauthorized')
    if (this.rateLimiter && !this.rateLimiter.consume({ ip: auth.ip || 'unknown', roomId: envelope.roomId, memberId: auth.memberId })) return this.#reject(envelope, 'rate-limited')
    if (!CAPABILITIES_BY_ROLE[member.role]?.includes(COMMAND_CAPABILITIES[envelope.type])) return this.#reject(envelope, 'unauthorized')
    const retention = this.repository.getRetentionPolicy?.(envelope.roomId) || null
    const normalized = this.#normalize(envelope, member, room, new Date(this.clock()).toISOString(), retention)
    if (normalized.error) return this.#reject(envelope, normalized.error)
    let requestFingerprint
    try { requestFingerprint = fingerprintJson({ actorId: member.memberId, type: envelope.type, payload: envelope.payload, hostEpoch: envelope.hostEpoch || null }) } catch { return this.#reject(envelope, 'invalid-payload') }
    const result = this.repository.appendAcceptedEvent({ roomId: envelope.roomId, commandId: envelope.commandId, requestFingerprint, nonceDigests: this.#nonceDigests(normalized.payload, room), actorId: member.memberId, actorDisplayName: member.displayName, type: normalized.type, payload: normalized.payload, guard: (snapshot, liveRoom) => this.#guard(envelope, normalized, snapshot, { ...liveRoom, retention }) })
    return result.rejected ? this.#reject(envelope, result.rejected) : result
  }

  #normalize (envelope, member, room, now, retention) {
    const payload = envelope.payload
    const encrypted = room.encryptionPolicy === 'aes-256-gcm'
    switch (envelope.type) {
      case 'chat.send':
        if (!validateStableLocator(payload.target).valid) return { error: 'invalid-payload' }
        if (encrypted ? (payload.body != null || !validateEncryptedContent(payload.content).valid) : (!text(payload.body, 8_000) || payload.content != null)) return { error: 'invalid-payload' }
        return { type: 'chat.message', payload: { commentId: this.randomId('comment'), body: payload.body || null, content: payload.content || null, target: payload.target } }
      case 'proposal.create': {
        const raw = payload.proposal || {}
        if (encrypted) {
          if (!validateWireProposal(raw).valid || raw.body != null || raw.replacementText != null) return { error: 'invalid-payload' }
          return { type: 'proposal.created', payload: { proposal: { ...raw, roomId: envelope.roomId, actorId: member.memberId, body: null, replacementText: null, status: 'open', createdAt: now, updatedAt: now } } }
        }
        const proposal = { ...raw, id: raw.id || this.randomId('proposal'), roomId: envelope.roomId, actorId: member.memberId, status: 'open', createdAt: now, updatedAt: now }
        return validateProposal(proposal).valid ? { type: 'proposal.created', payload: { proposal } } : { error: 'invalid-payload' }
      }
      case 'proposal.status': return text(payload.proposalId) && PROPOSAL_STATUSES.includes(payload.status) && payload.status !== 'adopted' ? { type: 'proposal.status.changed', payload } : { error: 'invalid-payload' }
      case 'vote.cast': return text(payload.proposalId) && ['up', 'down', 'abstain'].includes(payload.value) ? { type: 'vote.cast', payload } : { error: 'invalid-payload' }
      case 'artifact.publish':
        return room.roomKind !== 'experience' && encrypted
          && text(payload.shareSessionId, 240) && text(payload.manifestFingerprint, 240)
          && validateWireArtifact(payload.artifact).valid && publishableArtifactKinds.has(payload.artifact.kind)
          && this.#artifactExpiryAllowed(payload.artifact, room, retention, Date.parse(now))
          ? { type: 'artifact.published', payload: { ...payload, hostEpoch: envelope.hostEpoch } }
          : { error: 'invalid-payload' }
      case 'generation.request':
        if (!['requestId', 'shareSessionId', 'manifestFingerprint'].every(key => text(payload[key], 240)) || (encrypted && !text(payload.proposalId, 240)) || !validateStableLocator(payload.target).valid) return { error: 'invalid-payload' }
        if (encrypted ? (payload.actionText != null || (payload.content && !validateEncryptedContent(payload.content).valid)) : (payload.content != null || (payload.actionText != null && !text(payload.actionText, 8_000)))) return { error: 'invalid-payload' }
        return { type: 'generation.requested', payload: { ...payload, hostEpoch: envelope.hostEpoch } }
      case 'generation.complete':
        if (!text(payload.requestId, 240) || (encrypted && !text(payload.proposalId, 240))) return { error: 'invalid-payload' }
        if (encrypted ? (!validateWireArtifact(payload.artifact).valid || !this.#artifactExpiryAllowed(payload.artifact, room, retention, Date.parse(now)) || payload.content != null || payload.assistantMessage != null || payload.actionText != null) : (!text(payload.assistantMessage?.content, 20_000))) return { error: 'invalid-payload' }
        return { type: 'generation.completed', payload: { ...payload, artifactFingerprint: payload.artifact?.fingerprint || null, baseRevision: payload.artifact?.baseRevision || null, hostEpoch: envelope.hostEpoch } }
      case 'generation.status': return room.roomKind === 'experience' && text(payload.requestId, 240) && generationPhases.has(payload.phase) && (payload.progress == null || (Number.isFinite(payload.progress) && payload.progress >= 0 && payload.progress <= 1)) ? { type: 'generation.status', payload: { requestId: payload.requestId, phase: payload.phase, message: String(payload.message || '').slice(0, 240), progress: payload.progress ?? null, hostEpoch: envelope.hostEpoch } } : { error: 'invalid-payload' }
      case 'generation.terminate':
        return room.roomKind !== 'experience' && text(payload.requestId, 240) && generationTerminalStatuses.has(payload.status) && generationTerminalCodes.has(payload.code)
          && (payload.status === 'failed' ? ['provider-error', 'cancelled', 'artifact-invalid'].includes(payload.code) : ['host-lost', 'stale-revision'].includes(payload.code))
          ? { type: payload.status === 'failed' ? 'generation.failed' : 'generation.stale', payload: { requestId: payload.requestId, code: payload.code, hostEpoch: envelope.hostEpoch } }
          : { error: 'invalid-payload' }
      case 'promotion.request': return validatePromotionRequest(payload.request).valid ? { type: 'promotion.requested', payload: payload.request } : { error: 'invalid-payload' }
      case 'promotion.status': return validatePromotionStatus(payload).valid ? { type: 'promotion.status.changed', payload: { ...payload, hostEpoch: envelope.hostEpoch } } : { error: 'invalid-payload' }
      case 'experience.runtime.patch.accept': return room.roomKind === 'experience' ? { type: 'experience.runtime.patch.accepted', payload: { ...payload, hostEpoch: envelope.hostEpoch } } : { error: 'unauthorized' }
      default: return { error: 'unknown-command' }
    }
  }

  #targetAllowed (target, room) {
    if (!validateStableLocator(target).valid) return false
    const candidate = canonicalJson(target)
    return room.targetAllowlist.some(allowed => canonicalJson(allowed) === candidate)
  }

  #artifactExpiryAllowed (artifact, room, retention, now) {
    if (artifact?.expiresAt == null) return true
    const expiry = Date.parse(artifact.expiresAt)
    const deadline = Math.min(Date.parse(room.expiresAt), Date.parse(retention?.artifactExpiresAt || room.expiresAt))
    return Number.isFinite(expiry) && expiry > now && expiry <= deadline
  }

  #sourceRevisionsAllowed (artifact, room) {
    const keys = Object.keys(artifact?.sourceRevisions || {})
    if (!keys.length) return false
    const allowed = new Set(room.targetAllowlist.map(locator => `locator:${fingerprintJson(locator)}`))
    return keys.every(key => /^locator:sha256:[0-9a-f]{64}$/.test(key) && allowed.has(key))
  }

  #nonceDigests (payload, room) {
    if (room.roomKind === 'experience') return []
    const envelopes = [payload.content, payload.proposal?.content, payload.artifact?.content].filter(Boolean)
    return envelopes.map(content => sha256Hex(`${room.shareSessionId}\0${content.nonceBase64}`))
  }

  #refsAllowed (refs, room) {
    return (refs || []).every(ref => this.#targetAllowed(ref, room))
  }

  #guard (envelope, normalized, snapshot, room) {
    if (privileged.has(envelope.type) && (room.hostId !== envelope.actorId || envelope.hostEpoch !== room.hostEpoch)) return 'stale-host-epoch'
    const artifactsPurged = snapshot.retention?.artifactsPurgedAt || room.retention?.artifactsPurgedAt
    const commentsPurged = snapshot.retention?.commentsPurgedAt || room.retention?.commentsPurgedAt
    if (envelope.type === 'chat.send' && commentsPurged) return 'expired'
    if (artifactContentCommands.has(envelope.type) && artifactsPurged) return 'expired'
    const target = normalized.payload.target || normalized.payload.proposal?.target || normalized.payload.artifact?.target
    if (target && !this.#targetAllowed(target, room)) return 'unauthorized'
    const evidenceRefs = normalized.payload.proposal?.evidenceRefs || normalized.payload.artifact?.evidenceRefs || []
    if (!this.#refsAllowed(evidenceRefs, room)) return 'unauthorized'
    if (normalized.payload.artifact && !this.#sourceRevisionsAllowed(normalized.payload.artifact, room)) return 'unauthorized'
    if (envelope.type === 'proposal.create' && snapshot.proposals[normalized.payload.proposal.id]) return 'conflict'
    if (envelope.type === 'artifact.publish') {
      const published = snapshot.artifacts || {}
      if (normalized.payload.shareSessionId !== room.shareSessionId || normalized.payload.manifestFingerprint !== room.manifestFingerprint) return 'stale-revision'
      if (published[normalized.payload.artifact.artifactId]) return 'conflict'
      if (Object.values(published).some(item => item.fingerprint === normalized.payload.artifact.fingerprint)) return 'conflict'
      if (Object.keys(published).length >= COLLABORATION_LIMITS.maxArtifactsPerRoom) return 'quota-exceeded'
    }
    if (envelope.type === 'proposal.status') {
      const proposal = snapshot.proposals[normalized.payload.proposalId]
      if (!proposal) return 'not-found'
      if (!transitions[proposal.status]?.has(normalized.payload.status)) return 'conflict'
    }
    if (envelope.type === 'vote.cast') {
      const proposal = snapshot.proposals[normalized.payload.proposalId]
      if (!proposal) return 'not-found'
      if (!['open', 'selected'].includes(proposal.status)) return 'conflict'
    }
    if (envelope.type === 'generation.request') {
      const proposal = snapshot.proposals[normalized.payload.proposalId]
      if (room.roomKind !== 'experience' && (!proposal || proposal.status !== 'selected')) return 'conflict'
      if (normalized.payload.shareSessionId !== room.shareSessionId || normalized.payload.manifestFingerprint !== room.manifestFingerprint) return 'stale-revision'
      if (snapshot.generation.requests[normalized.payload.requestId]) return 'conflict'
      if (Object.values(snapshot.generation.requests).some(request => request.proposalId === normalized.payload.proposalId && ['requested', 'completed'].includes(request.status))) return 'conflict'
    }
    if (envelope.type === 'generation.complete') {
      const request = snapshot.generation.requests[normalized.payload.requestId]
      if (!request) return 'not-found'
      if (request.status !== 'requested' || (room.roomKind !== 'experience' && request.proposalId !== normalized.payload.proposalId)) return 'conflict'
      if (request.hostEpoch !== room.hostEpoch) return 'stale-host-epoch'
      const proposal = snapshot.proposals[request.proposalId]
      if (room.roomKind !== 'experience' && (!proposal || proposal.status !== 'selected' || normalized.payload.baseRevision !== proposal.baseRevision)) return 'stale-revision'
    }
    if (envelope.type === 'generation.status') {
      const request = snapshot.generation.requests[normalized.payload.requestId]
      if (!request || request.status !== 'requested' || request.hostEpoch !== room.hostEpoch) return 'conflict'
    }
    if (envelope.type === 'generation.terminate') {
      const request = snapshot.generation.requests[normalized.payload.requestId]
      if (!request || request.status !== 'requested') return 'conflict'
      if (request.hostEpoch !== room.hostEpoch) return 'stale-host-epoch'
    }
    if (envelope.type === 'promotion.request') {
      const promotion = normalized.payload
      const proposal = snapshot.proposals[promotion.proposalId]
      const completion = snapshot.generation.requests[promotion.generationRequestId]
      if (!proposal || proposal.status !== 'selected' || !completion) return 'conflict'
      if (snapshot.promotions[promotion.proposalId]) return 'conflict'
      if (promotion.roomId !== envelope.roomId || promotion.roomId !== room.roomId) return 'unauthorized'
      if (promotion.hostEpoch !== room.hostEpoch || promotion.shareSessionId !== room.shareSessionId || promotion.liveTargetRevision !== proposal.baseRevision) return 'stale-revision'
      if (completion.proposalId !== promotion.proposalId || promotion.artifactId !== completion.artifact?.artifactId || promotion.artifactFingerprint !== completion.artifactFingerprint) return 'conflict'
      const sourceRevisionFingerprint = fingerprintJson(completion.artifact?.sourceRevisions)
      // liveRevisionFingerprint is an opaque host-local attestation. Only the local
      // Authoring bridge can compare it with live project state.
      if (promotion.sourceRevisionFingerprint !== sourceRevisionFingerprint) return 'stale-revision'
    }
    if (envelope.type === 'promotion.status') {
      const promotion = snapshot.promotions[normalized.payload.proposalId]
      if (!promotion || promotion.status !== 'requested') return 'conflict'
      if (promotion.hostEpoch !== room.hostEpoch) return 'stale-host-epoch'
      if (promotion.artifactFingerprint !== normalized.payload.artifactFingerprint) return 'stale-revision'
    }
    if (envelope.type === 'experience.runtime.patch.accept') {
      const request = snapshot.generation.requests[normalized.payload.requestId]
      if (!request || request.status !== 'completed') return 'conflict'
    }
    return null
  }
}
