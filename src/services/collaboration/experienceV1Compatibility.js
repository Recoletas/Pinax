import { randomUUID } from '../../../shared/randomId.js'
import { computed, reactive, ref } from 'vue'
import { CollaborationProtocolClient } from './CollaborationProtocolClient.js'
import { createCollaborationDomainProjection } from './domainProjection.js'
import { buildCollaborationInviteUrl, resolveRendererCollaborationEndpoints } from './endpoint.js'
import { RemoteWebSocketTransport } from './RemoteWebSocketTransport.js'

const target = Object.freeze({ artifactId: 'experience-runtime', artifactRevision: 1 })
const eventTypes = Object.freeze({ 'proposal.created': 'action.proposed', 'proposal.status.changed': 'action.selected', 'generation.requested': 'narrative.requested', 'generation.status': 'narrative.status', 'generation.completed': 'narrative.completed', 'experience.runtime.patch.accepted': 'runtime.patch.accepted', 'chat.message': 'chat.message', 'vote.cast': 'vote.cast' })
const adaptEvent = event => eventTypes[event?.type] ? { ...event, type: eventTypes[event.type], compatibility: { target: 'experience-v1' } } : null
const session = typeof sessionStorage === 'undefined' ? { getItem: () => null, setItem: () => {}, removeItem: () => {} } : sessionStorage

export function createExperienceV1CompatibilityRoom ({ endpointOverride = import.meta.env?.VITE_COLLABORATION_RELAY, inviteCredentials = null, fetchImpl = globalThis.fetch, storage = session, windowLike = globalThis.window, clock = () => Date.now(), transportFactory = options => new RemoteWebSocketTransport(options), protocolClientFactory = options => new CollaborationProtocolClient(options) } = {}) {
  let credentials = inviteCredentials
  let transport = null; let client = null; let initialization = null; let publicEndpoints = null
  const projection = createCollaborationDomainProjection()
  const roomSlug = ref(''); const room = ref(null); const members = reactive([]); const events = reactive([]); const chatMessages = reactive([]); const proposals = reactive([]); const votes = reactive({}); const connectionState = ref('idle'); const error = ref(null); const lastSeq = ref(0); const nickname = ref(storage.getItem('pinax.online.nickname') || ''); const selfMemberId = ref(''); const shareInvite = ref(null)
  const shareInviteState = computed(() => shareInvite.value)
  const shareInviteUrl = computed(() => shareInviteState.value?.status === 'active' ? shareInviteState.value.url : '')
  const refreshShareInviteState = () => { if (shareInvite.value?.status === 'active' && Date.parse(shareInvite.value.expiresAt) <= clock()) shareInvite.value = { ...shareInvite.value, status: 'expired', url: '' }; return shareInvite.value }
  const sync = () => {
    const state = projection.state; room.value = state.room
    members.splice(0, members.length, ...state.members.map(member => ({ id: member.memberId, nickname: member.displayName, role: member.role })))
    proposals.splice(0, proposals.length, ...state.proposals.map(item => ({ ...item, text: item.body, selected: item.status === 'selected' })))
    Object.keys(votes).forEach(key => delete votes[key]); for (const [id, value] of Object.entries(state.votes)) votes[id] = Object.entries(value).map(([actorId, vote]) => ({ actorId, vote: vote.value || vote }))
    lastSeq.value = state.lastSeq
  }
  const ensureClient = () => {
    if (initialization) return initialization
    initialization = resolveRendererCollaborationEndpoints({ windowLike, locationLike: windowLike.location, endpointOverride }).then(endpoints => {
      publicEndpoints = endpoints
      transport = transportFactory({ url: endpoints.wsUrl })
      client = protocolClientFactory({ transport, storage, clientBuild: import.meta.env?.VITE_APP_BUILD || 'web', features: ['ack-v1', 'resume-v1', 'snapshot-recovery-v1'] })
      client.on('state', value => { connectionState.value = value })
      client.on('identity', value => { selfMemberId.value = value.memberId })
      client.on('snapshot', snapshot => { projection.applySnapshot(snapshot); sync() })
      client.on('event', event => { projection.applyEvent(event); sync(); const legacy = adaptEvent(event); if (legacy) { events.push(legacy); if (legacy.type === 'chat.message') chatMessages.push({ ...legacy.payload, text: legacy.payload.body, actorId: legacy.actorId, nickname: legacy.actorDisplayName }) } })
      client.on('error', value => { error.value = value.code || '服务端错误' })
      return client
    }).catch(value => { connectionState.value = 'disabled'; error.value = value.message; throw value })
    return initialization
  }
  const sendCommand = (type, payload = {}) => {
    if (!client) { error.value = '协作连接尚未就绪'; return '' }
    const body = payload.payload || payload
    const map = { 'chat.send': ['chat.send', { body: payload.text, target }], 'action.propose': ['proposal.create', { proposal: { id: randomUUID(), kind: 'direction', target, baseRevision: 1, body: payload.text } }], 'action.select': ['proposal.status', { proposalId: payload.proposalId, status: 'selected' }], 'vote.cast': ['vote.cast', { proposalId: payload.proposalId, value: 'up' }], 'narrative.request': ['generation.request', { ...body, target, actionText: body.text, shareSessionId: room.value?.shareSessionId, manifestFingerprint: room.value?.manifestFingerprint }], 'narrative.status': ['generation.status', body], 'narrative.completed': ['generation.complete', body], 'runtime.patch.accept': ['experience.runtime.patch.accept', body] }
    if (map['narrative.request']) delete map['narrative.request'][1].text
    const mapped = map[type] || [type, payload]; const hostEpoch = ['proposal.status', 'generation.request', 'generation.status', 'generation.complete', 'experience.runtime.patch.accept'].includes(mapped[0]) ? room.value?.hostEpoch : undefined
    const commandId = randomUUID(); client.sendCommand(mapped[0], mapped[1], { commandId, hostEpoch }).catch(value => { error.value = value.message }); return commandId
  }
  const joinRoom = (slug, nick) => {
    roomSlug.value = slug; nickname.value = nick; storage.setItem('pinax.online.nickname', nick)
    const savedIdentity = storage.getItem(`pinax.collaboration.session.${slug}`)
    if ((!credentials || credentials.roomSlug !== slug || !credentials.inviteId || !credentials.inviteSecret) && !savedIdentity) { connectionState.value = 'disabled'; error.value = '需要有效的协作邀请链接'; return Promise.resolve(false) }
    const joinCredentials = credentials; credentials = null; connectionState.value = 'configuring'
    return ensureClient().then(active => active.connect({ roomSlug: slug, displayName: nick, inviteId: joinCredentials?.inviteId, inviteSecret: joinCredentials?.inviteSecret })).then(() => true).catch(value => { error.value = value.message; return false })
  }
  const createRoom = async (slug, nick) => {
    if (typeof fetchImpl !== 'function') { error.value = '协作创建服务不可用'; return false }
    connectionState.value = 'configuring'; nickname.value = nick; roomSlug.value = slug; storage.setItem('pinax.online.nickname', nick)
    try {
      await ensureClient()
      const response = await fetchImpl(`${publicEndpoints.httpBaseUrl}/api/collaboration/rooms`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ roomSlug: slug, roomKind: 'experience', hostDisplayName: nick, encryptionPolicy: 'none' }) })
      if (!response.ok) throw new Error(`room-create-${response.status}`)
      const created = await response.json(); if (!created?.room?.roomId || !created?.host?.memberId || !created?.host?.resumeToken || !created?.invite?.inviteId || !created?.invite?.inviteSecret || !created?.invite?.expiresAt) throw new Error('room-create-response-invalid')
      storage.setItem(`pinax.collaboration.session.${slug}`, JSON.stringify({ roomId: created.room.roomId, memberId: created.host.memberId, resumeToken: created.host.resumeToken, lastSeq: created.snapshot?.lastSeq || 0 }))
      const shareBaseUrl = windowLike.location?.protocol === 'file:' ? publicEndpoints.httpBaseUrl : windowLike.location?.origin
      shareInvite.value = { inviteId: created.invite.inviteId, expiresAt: created.invite.expiresAt, status: 'active', url: buildCollaborationInviteUrl(shareBaseUrl, { roomSlug: slug, inviteId: created.invite.inviteId, inviteSecret: created.invite.inviteSecret }) }
      return joinRoom(slug, nick)
    } catch (value) { connectionState.value = 'disabled'; error.value = value.message; return false }
  }
  const rotateShareInvite = async () => {
    const identity = client && { memberId: client.memberId, resumeToken: client.resumeToken }
    if (!room.value?.roomId || !identity?.memberId || !identity?.resumeToken || !publicEndpoints) throw new Error('share-invite-host-required')
    const headers = { 'content-type': 'application/json', 'x-collaboration-member': identity.memberId, 'x-collaboration-resume': identity.resumeToken }
    const previous = shareInvite.value
    if (previous?.inviteId) {
      const revoked = await fetchImpl(`${publicEndpoints.httpBaseUrl}/api/collaboration/rooms/${room.value.roomId}/invites/${previous.inviteId}`, { method: 'DELETE', headers })
      if (!revoked.ok) throw new Error(`invite-revoke-${revoked.status}`)
      shareInvite.value = { ...previous, status: 'revoked', url: '' }
    }
    const response = await fetchImpl(`${publicEndpoints.httpBaseUrl}/api/collaboration/rooms/${room.value.roomId}/invites`, { method: 'POST', headers, body: JSON.stringify({ role: 'reviewer' }) })
    if (!response.ok) throw new Error(`invite-rotate-${response.status}`)
    const next = await response.json(); if (!next?.inviteId || !next?.inviteSecret || !next?.expiresAt) throw new Error('invite-rotate-response-invalid')
    const shareBaseUrl = windowLike.location?.protocol === 'file:' ? publicEndpoints.httpBaseUrl : windowLike.location?.origin
    shareInvite.value = { inviteId: next.inviteId, expiresAt: next.expiresAt, status: 'active', rotatedFrom: previous?.inviteId || null, url: buildCollaborationInviteUrl(shareBaseUrl, { roomSlug: roomSlug.value, inviteId: next.inviteId, inviteSecret: next.inviteSecret }) }
    return shareInvite.value
  }
  const leaveRoom = () => { shareInvite.value = null; client?.close() }
  return { roomSlug, room, members, events, chatMessages, proposals, votes, connectionState, error, lastSeq, nickname, selfMemberId, shareInviteState, shareInviteUrl, refreshShareInviteState, isConnected: computed(() => connectionState.value === 'connected'), isHost: computed(() => room.value?.hostId === selfMemberId.value), joinRoom, createRoom, rotateShareInvite, leaveRoom, sendChat: text => sendCommand('chat.send', { text }), sendCommand, proposeAction: text => sendCommand('action.propose', { text }), selectAction: proposalId => sendCommand('action.select', { proposalId }), castVote: proposalId => sendCommand('vote.cast', { proposalId }), requestSnapshot: () => transport?.send({ type: 'room.recovery.request', roomId: client.roomId, lastSeq: client.lastSeq }, { key: `recovery:${client.roomId}` }) }
}
