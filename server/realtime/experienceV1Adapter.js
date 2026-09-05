const TYPE_MAP = Object.freeze({
  'chat.send': 'chat.send',
  'action.propose': 'proposal.create',
  'action.select': 'proposal.status',
  'vote.cast': 'vote.cast',
  'narrative.request': 'generation.request',
  'narrative.completed': 'generation.complete',
  'runtime.patch.accept': 'experience.runtime.patch.accept',
  'runtime.patch.accepted': 'experience.runtime.patch.accept'
})

export function adaptExperienceV1Command(message, { roomId, actorId = '', hostEpoch = 1, manifestFingerprint = `experience:${roomId}`, shareSessionId = `experience:${roomId}` } = {}) {
  const type = TYPE_MAP[message?.type]
  if (!type) return { ok: false, code: 'unknown-command' }
  if (!String(message.commandId || '').trim()) return { ok: false, code: 'invalid-envelope' }
  const base = {
    protocolVersion: 2,
    type,
    commandId: String(message.commandId),
    roomId: String(roomId || message.roomId || ''),
    actorId: String(actorId),
    hostEpoch,
    compatibility: { source: 'experience-v1' }
  }
  if (message.type === 'action.propose') {
    base.payload = { proposal: { id: String(message.proposalId || base.commandId), kind: 'direction', target: { artifactId: 'experience-runtime', artifactRevision: 1 }, baseRevision: 1, body: String(message.text || ''), status: 'open' } }
  } else if (message.type === 'action.select') {
    base.payload = { proposalId: String(message.proposalId || ''), status: 'selected' }
  } else if (message.type === 'chat.send') {
    base.payload = { body: String(message.text || ''), target: { artifactId: 'experience-runtime', artifactRevision: 1 } }
  } else if (message.type === 'narrative.request') {
    base.payload = {
      requestId: String(message.payload?.requestId || base.commandId),
      proposalId: String(message.payload?.proposalId || ''),
      actionText: String(message.payload?.text || message.text || ''),
      target: { artifactId: 'experience-runtime', artifactRevision: 1 },
      shareSessionId,
      manifestFingerprint
    }
  } else if (message.type === 'narrative.completed') {
    base.payload = {
      requestId: String(message.payload?.requestId || ''),
      actionText: String(message.payload?.actionText || ''),
      assistantMessage: message.payload?.assistantMessage || { role: 'assistant', content: String(message.payload?.text || '') }
    }
  } else if (message.type === 'runtime.patch.accept' || message.type === 'runtime.patch.accepted') {
    base.payload = { ...(message.payload || {}) }
  } else {
    base.payload = { ...(message.payload || {}), proposalId: message.proposalId || message.payload?.proposalId }
  }
  return { ok: true, value: base }
}

export function adaptV2EventToExperienceV1(event) {
  const map = {
    'proposal.created': 'action.proposed',
    'proposal.status.changed': 'action.selected',
    'generation.requested': 'narrative.requested',
    'generation.completed': 'narrative.completed',
    'experience.runtime.patch.accepted': 'runtime.patch.accepted',
    'chat.message': 'chat.message',
    'vote.cast': 'vote.cast'
  }
  if (!map[event?.type]) return null
  return { ...event, type: map[event.type], compatibility: { target: 'experience-v1' } }
}
