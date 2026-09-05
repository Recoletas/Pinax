export function createCollaborationDomainProjection () {
  const state = { room: null, members: [], proposals: [], comments: [], votes: {}, artifacts: {}, generation: { requests: {} }, promotions: {}, retention: { minRetainedSeq: 1, artifactExpiresAt: null, commentExpiresAt: null, artifactsPurgedAt: null, commentsPurgedAt: null }, lastSeq: 0 }
  const applySnapshot = snapshot => { const copy = JSON.parse(JSON.stringify(snapshot || {})); Object.assign(state, copy, { members: Object.values(copy.members || {}), proposals: Object.values(copy.proposals || {}), artifacts: copy.artifacts || {}, retention: { ...state.retention, ...(copy.retention || {}) }, lastSeq: copy.lastSeq || 0 }); return state }
  const applyEvent = event => {
    if (!event || event.seq !== state.lastSeq + 1) throw new Error('domain-event-gap')
    state.lastSeq = event.seq
    const p = event.payload || {}
    if (event.type === 'room.created') { const { retention, ...room } = p; state.room = { ...(state.room || {}), ...room }; state.retention = { ...state.retention, ...(retention || {}) } }
    else if (['member.joined', 'member.resumed'].includes(event.type)) { const index = state.members.findIndex(m => m.memberId === p.memberId); const member = { ...p, connectionState: 'connected' }; index < 0 ? state.members.push(member) : state.members.splice(index, 1, member) }
    else if (event.type === 'member.left') state.members = state.members.filter(m => m.memberId !== p.memberId)
    else if (event.type === 'proposal.created') state.proposals.push(p.proposal)
    else if (event.type === 'proposal.status.changed') { const proposal = state.proposals.find(item => item.id === p.proposalId); if (proposal) proposal.status = p.status }
    else if (event.type === 'vote.cast') { state.votes[p.proposalId] ||= {}; state.votes[p.proposalId][event.actorId] = p.value }
    else if (event.type === 'chat.message') state.comments.push({ ...p, actorId: event.actorId, displayName: event.actorDisplayName })
    else if (event.type === 'artifact.published') {
      const actor = { id: event.actorId, displayName: event.actorDisplayName }
      state.artifacts[p.artifact.artifactId] = p.expired
        ? { ...p.artifact, actor, publishedAt: event.createdAt, contentExpiredAt: p.contentExpiredAt || event.createdAt }
        : { ...p.artifact, shareSessionId: p.shareSessionId, manifestFingerprint: p.manifestFingerprint, hostEpoch: p.hostEpoch, actor, publishedAt: event.createdAt }
    }
    else if (event.type === 'content.expired') {
      if (p.comments) {
        state.comments = []
        state.retention.commentsPurgedAt = event.createdAt
      }
      if (p.artifacts) {
        state.retention.artifactsPurgedAt = event.createdAt
        for (const proposal of state.proposals) {
          proposal.body = null
          proposal.replacementText = null
          proposal.content = null
          proposal.contentExpiredAt = event.createdAt
        }
        for (const request of Object.values(state.generation.requests)) {
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
        state.experienceRuntimePatch = null
        for (const [artifactId, artifact] of Object.entries(state.artifacts)) {
          state.artifacts[artifactId] = {
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
        for (const promotion of Object.values(state.promotions)) {
          if (promotion.receipt) {
            promotion.receipt = {
              code: promotion.receipt.code,
              ...(Number.isSafeInteger(promotion.receipt.targetCount) ? { targetCount: promotion.receipt.targetCount } : {})
            }
            promotion.contentExpiredAt = event.createdAt
          }
        }
      }
    }
    else if (event.type === 'room.host.changed' && state.room) Object.assign(state.room, p)
    else if (event.type === 'generation.requested') state.generation.requests[p.requestId] = { ...p, status: 'requested' }
    else if (event.type === 'generation.completed') state.generation.requests[p.requestId] = { ...(state.generation.requests[p.requestId] || {}), ...p, status: 'completed' }
    else if (event.type === 'generation.failed') state.generation.requests[p.requestId] = { ...(state.generation.requests[p.requestId] || {}), ...p, status: 'failed' }
    else if (event.type === 'generation.stale') {
      const request = state.generation.requests[p.requestId]
      if (request?.status === 'requested') state.generation.requests[p.requestId] = { ...request, ...p, status: 'stale' }
    }
    else if (event.type === 'promotion.requested') state.promotions[p.proposalId] = { ...p, status: 'requested' }
    else if (event.type === 'promotion.status.changed') {
      state.promotions[p.proposalId] = { ...(state.promotions[p.proposalId] || {}), ...p }
      const proposal = state.proposals.find(item => item.id === p.proposalId)
      if (proposal) proposal.status = p.status
    }
    else if (event.type === 'retention.updated') state.retention = { ...state.retention, ...p }
    return state
  }
  return { state, applySnapshot, applyEvent }
}
