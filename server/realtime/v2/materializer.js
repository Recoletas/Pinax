import { CAPABILITIES_BY_ROLE } from '../../../shared/collaboration/constants.js'

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value))
}

export function emptyCollaborationSnapshot(room = {}) {
  return {
    schemaVersion: 1,
    room: {
      roomId: String(room.roomId || room.id || ''),
      roomSlug: String(room.roomSlug || room.slug || ''),
      roomKind: String(room.roomKind || 'experience'),
      status: String(room.status || 'active'),
      hostId: room.hostId || null,
      hostEpoch: Number(room.hostEpoch) || 1,
      manifestFingerprint: room.manifestFingerprint || null,
      shareSessionId: room.shareSessionId || null,
      encryptionPolicy: room.encryptionPolicy || 'none',
      targetAllowlist: clone(room.targetAllowlist || []),
      expiresAt: room.expiresAt || null
    },
    members: {},
    proposals: {},
    votes: {},
    comments: [],
    artifacts: {},
    generation: { requests: {} },
    experienceRuntimePatch: null,
    promotions: {},
    retention: {
      minRetainedSeq: 1,
      artifactExpiresAt: room.retention?.artifactExpiresAt || null,
      commentExpiresAt: room.retention?.commentExpiresAt || null,
      artifactsPurgedAt: room.retention?.artifactsPurgedAt || null,
      commentsPurgedAt: room.retention?.commentsPurgedAt || null
    },
    lastSeq: 0
  }
}

export function materializeCollaborationEvent(previousSnapshot, event) {
  const snapshot = clone(previousSnapshot || emptyCollaborationSnapshot({ roomId: event?.roomId }))
  snapshot.artifacts ||= {}
  if (!event || !Number.isSafeInteger(event.seq) || event.seq !== snapshot.lastSeq + 1) {
    throw new Error(`non-contiguous-event:${snapshot.lastSeq}->${event?.seq}`)
  }
  const payload = clone(event.payload || {})
  const actor = Object.freeze({ id: String(event.actorId || ''), displayName: String(event.actorDisplayName || 'unknown') })

  switch (event.type) {
    case 'room.created':
      {
        const { retention, ...room } = payload
        snapshot.room = { ...snapshot.room, ...room }
        if (retention) snapshot.retention = { ...snapshot.retention, ...retention }
      }
      break
    case 'room.host.changed':
      snapshot.room.hostId = payload.hostId || null
      snapshot.room.hostEpoch = payload.hostEpoch
      for (const member of Object.values(snapshot.members)) {
        if (member.memberId === payload.hostId) {
          member.role = 'host'
          member.capabilities = clone(CAPABILITIES_BY_ROLE.host)
        } else if (member.role === 'host') {
          member.role = 'reviewer'
          member.capabilities = clone(CAPABILITIES_BY_ROLE.reviewer)
        }
      }
      break
    case 'room.closed':
    case 'room.expired':
      snapshot.room.status = event.type === 'room.closed' ? 'closed' : 'expired'
      break
    case 'member.joined':
    case 'member.resumed':
      snapshot.members[payload.memberId] = {
        ...(snapshot.members[payload.memberId] || {}),
        memberId: payload.memberId,
        displayName: payload.displayName,
        role: payload.role,
        capabilities: clone(payload.capabilities || []),
        joinedAt: payload.joinedAt || snapshot.members[payload.memberId]?.joinedAt || event.createdAt,
        connectionState: 'connected',
        leaseExpiresAt: payload.leaseExpiresAt || null
      }
      break
    case 'member.disconnected':
      if (snapshot.members[payload.memberId]) {
        snapshot.members[payload.memberId].connectionState = 'grace'
        snapshot.members[payload.memberId].leaseExpiresAt = payload.leaseExpiresAt
      }
      break
    case 'member.left':
      if (snapshot.members[payload.memberId]) snapshot.members[payload.memberId].connectionState = 'left'
      break
    case 'proposal.created':
      if (payload.expired) break
      snapshot.proposals[payload.proposal.id] = { ...payload.proposal, actor, votes: {} }
      snapshot.votes[payload.proposal.id] = {}
      break
    case 'proposal.status.changed':
      if (!snapshot.proposals[payload.proposalId]) throw new Error('proposal-not-found')
      snapshot.proposals[payload.proposalId].status = payload.status
      snapshot.proposals[payload.proposalId].updatedAt = event.createdAt
      break
    case 'vote.cast':
      if (!snapshot.proposals[payload.proposalId]) throw new Error('proposal-not-found')
      snapshot.votes[payload.proposalId] ||= {}
      snapshot.votes[payload.proposalId][actor.id] = { value: payload.value, actor, updatedAt: event.createdAt }
      snapshot.proposals[payload.proposalId].votes = clone(snapshot.votes[payload.proposalId])
      break
    case 'chat.message':
      if (payload.expired) break
      snapshot.comments.push({ id: payload.commentId, body: payload.body || null, content: payload.content || null, target: payload.target || null, actor, createdAt: event.createdAt })
      break
    case 'artifact.published': {
      const artifact = payload.artifact || {}
      snapshot.artifacts[artifact.artifactId] = payload.expired
        ? { ...artifact, actor, publishedAt: event.createdAt, contentExpiredAt: payload.contentExpiredAt || event.createdAt }
        : { ...artifact, actor, shareSessionId: payload.shareSessionId, manifestFingerprint: payload.manifestFingerprint, hostEpoch: payload.hostEpoch, publishedAt: event.createdAt }
      break
    }
    case 'generation.requested':
      snapshot.generation.requests[payload.requestId] = { ...payload, actor, status: 'requested', requestedAt: event.createdAt }
      break
    case 'generation.completed': {
      const request = snapshot.generation.requests[payload.requestId]
      if (!request) throw new Error('generation-request-not-found')
      snapshot.generation.requests[payload.requestId] = { ...request, ...payload, status: 'completed', completedAt: event.createdAt }
      break
    }
    case 'generation.status': {
      const request = snapshot.generation.requests[payload.requestId]
      if (!request) throw new Error('generation-request-not-found')
      request.progress = { phase: payload.phase, message: payload.message, value: payload.progress, updatedAt: event.createdAt }
      break
    }
    case 'content.expired':
      if (payload.comments) snapshot.comments = []
      if (payload.comments) snapshot.retention.commentsPurgedAt = event.createdAt
      if (payload.artifacts) {
        snapshot.retention.artifactsPurgedAt = event.createdAt
        for (const proposal of Object.values(snapshot.proposals)) {
          proposal.body = null
          proposal.replacementText = null
          proposal.content = null
          proposal.contentExpiredAt = event.createdAt
        }
        for (const request of Object.values(snapshot.generation.requests)) {
          request.actionText = null
          request.content = null
          request.contentExpiredAt = event.createdAt
          if (request.progress) request.progress.message = null
          if (request.status === 'completed') {
            request.artifact = null
            request.content = null
            request.assistantMessage = null
          }
        }
        snapshot.experienceRuntimePatch = null
        for (const [artifactId, artifact] of Object.entries(snapshot.artifacts)) {
          snapshot.artifacts[artifactId] = {
            artifactId,
            kind: artifact.kind,
            authority: artifact.authority,
            fingerprint: artifact.fingerprint,
            baseRevision: artifact.baseRevision,
            expiresAt: artifact.expiresAt || null,
            actor: artifact.actor,
            publishedAt: artifact.publishedAt,
            contentExpiredAt: event.createdAt
          }
        }
        for (const promotion of Object.values(snapshot.promotions)) {
          if (promotion.receipt) {
            promotion.receipt = {
              code: promotion.receipt.code,
              ...(Number.isSafeInteger(promotion.receipt.targetCount) ? { targetCount: promotion.receipt.targetCount } : {})
            }
            promotion.contentExpiredAt = event.createdAt
          }
        }
      }
      break
    case 'generation.failed': {
      const request = snapshot.generation.requests[payload.requestId]
      if (!request) throw new Error('generation-request-not-found')
      snapshot.generation.requests[payload.requestId] = { ...request, code: payload.code, status: 'failed', completedAt: event.createdAt }
      break
    }
    case 'generation.stale': {
      const request = snapshot.generation.requests[payload.requestId]
      if (request && request.status === 'requested') {
        request.status = 'stale'
        request.code = payload.code || 'host-lost'
        request.completedAt = event.createdAt
      }
      break
    }
    case 'promotion.requested':
      snapshot.promotions[payload.proposalId] = { ...payload, actor, status: 'requested', requestedAt: event.createdAt }
      break
    case 'promotion.status.changed': {
      const promotion = snapshot.promotions[payload.proposalId]
      if (!promotion || promotion.status !== 'requested') throw new Error('promotion-request-not-found')
      snapshot.promotions[payload.proposalId] = { ...promotion, ...payload, completedAt: event.createdAt }
      if (snapshot.proposals[payload.proposalId]) {
        snapshot.proposals[payload.proposalId].status = payload.status
        snapshot.proposals[payload.proposalId].updatedAt = event.createdAt
      }
      break
    }
    case 'experience.runtime.patch.accepted':
      snapshot.experienceRuntimePatch = payload
      break
    case 'retention.updated':
      snapshot.retention = { ...snapshot.retention, ...payload }
      break
    default:
      throw new Error(`unsupported-event:${event.type}`)
  }
  snapshot.lastSeq = event.seq
  return snapshot
}

export function replayCollaborationEvents(events, initialSnapshot = null) {
  return events.reduce((snapshot, event) => materializeCollaborationEvent(snapshot, event), initialSnapshot)
}
