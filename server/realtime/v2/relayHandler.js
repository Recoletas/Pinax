import { COLLABORATION_PROTOCOL_VERSION } from '../../../shared/collaboration/constants.js'
import { negotiateProtocol, rejectedAck } from '../../../shared/collaboration/contracts.js'
import { CollaborationCommandService } from './commandService.js'

export const SERVER_COLLABORATION_FEATURES = Object.freeze(['ack-v1', 'resume-v1', 'snapshot-recovery-v1', 'aes-gcm-content-v1'])
const plain = value => value && typeof value === 'object' && !Array.isArray(value)
const exact = (value, keys) => plain(value) && Object.keys(value).every(key => keys.includes(key))
const text = (value, max = 240) => typeof value === 'string' && value.length > 0 && value.length <= max
const seq = value => Number.isSafeInteger(value) && value >= 0

export function isCollaborationUpgradeOriginAllowed (request, allowedOrigins = []) {
  const origin = request?.headers?.origin
  if (!origin) return true
  return allowedOrigins.includes(origin)
}

export function setupCollaborationRelay (wss, { repository, rateLimiter = null, clock = () => Date.now(), allowExperienceCompatibility = false } = {}) {
  if (!repository) throw new TypeError('collaboration-repository-required')
  const service = new CollaborationCommandService({ repository, rateLimiter, clock }); const connections = new Set(); let nextConnectionId = 1
  const send = (conn, message) => { if (conn.socket.readyState === conn.socket.OPEN) conn.socket.send(JSON.stringify(message)) }
  const safeError = (conn, code) => send(conn, { protocolVersion: 2, type: 'error', code })
  const terminate = (conn, code = null, { disconnectMember = false } = {}) => {
    if (!connections.delete(conn)) return
    if (code) safeError(conn, code)
    if (disconnectMember && conn.roomId && conn.memberId) repository.disconnectMember({ roomId: conn.roomId, memberId: conn.memberId })
    conn.socket.terminate()
  }
  const active = conn => Boolean(conn.roomId && conn.memberId && repository.isMemberActive(conn.roomId, conn.memberId))
  const broadcast = (roomId, event) => {
    if (!event) return
    for (const conn of [...connections]) {
      if (conn.roomId !== roomId || !conn.memberId) continue
      if (!active(conn)) { terminate(conn, 'unauthorized'); continue }
      send(conn, { protocolVersion: 2, type: 'event.append', event })
    }
  }
  const broadcastEvents = (roomId, events = []) => { for (const event of events) broadcast(roomId, event) }
  const invalidateMembers = ({ roomId, memberIds = [], events = [], code = 'unauthorized' } = {}) => {
    const invalid = new Set(memberIds)
    for (const conn of [...connections]) if (conn.roomId === roomId && invalid.has(conn.memberId)) terminate(conn, code)
    broadcastEvents(roomId, events)
  }
  const invalidateRooms = (roomIds = [], code = 'expired') => { const invalid = new Set(roomIds); for (const conn of [...connections]) if (invalid.has(conn.roomId)) terminate(conn, code) }
  const sweepInactiveConnections = () => { for (const conn of [...connections]) if (conn.state === 'bound' && !active(conn)) terminate(conn, 'unauthorized') }
  const consume = (conn, message) => !rateLimiter || rateLimiter.consume({ ip: conn.ip, roomId: conn.roomId || String(message.roomId || message.roomSlug || 'unbound'), memberId: conn.memberId || `connection:${conn.id}` })
  const disconnect = conn => { if (!connections.delete(conn)) return; if (conn.roomId && conn.memberId) { const result = repository.disconnectMember({ roomId: conn.roomId, memberId: conn.memberId }); broadcast(conn.roomId, result?.event) } }
  const handle = (conn, message) => {
    if (!plain(message) || !text(message.type, 120)) return safeError(conn, 'invalid-envelope')
    const control = ['client.hello', 'room.join', 'room.resume', 'room.recovery.request', 'ping'].includes(message.type)
    if (control && !consume(conn, message)) return safeError(conn, 'rate-limited')
    if (message.type === 'client.hello') {
      if (conn.state !== 'ready') return safeError(conn, 'conflict')
      conn.state = 'hello-received'
      if (!exact(message, ['type', 'protocolVersion', 'minProtocolVersion', 'clientBuild', 'features']) || !text(message.clientBuild, 120) || !Array.isArray(message.features) || message.features.length > 32 || message.features.some(feature => !text(feature, 120))) return safeError(conn, 'invalid-envelope')
      const result = negotiateProtocol(message, SERVER_COLLABORATION_FEATURES); conn.state = result.accepted ? 'hello' : 'rejected'
      return send(conn, { type: 'server.hello', ...result, serverBuild: 'collaboration-v2' })
    }
    if (conn.state === 'ready') return safeError(conn, 'upgrade-required')
    if (message.type === 'room.join') {
      if (conn.state !== 'hello') return safeError(conn, 'conflict')
      if (!exact(message, ['type', 'roomSlug', 'inviteId', 'inviteSecret', 'displayName', 'compatibility', 'lastSeq']) || !text(message.roomSlug, 64) || !text(message.displayName, 80) || !seq(message.lastSeq)) return safeError(conn, 'invalid-payload')
      const compatibility = message.compatibility === 'experience-v1'
      if (compatibility && !allowExperienceCompatibility) return safeError(conn, 'feature-unsupported')
      if (!compatibility && (!text(message.inviteId) || !text(message.inviteSecret))) return safeError(conn, 'invalid-payload')
      if (message.compatibility != null && !compatibility) return safeError(conn, 'feature-unsupported')
      const joined = compatibility ? repository.joinExperienceCompatibility({ roomSlug: message.roomSlug, displayName: message.displayName }) : repository.joinWithInvite({ roomSlug: message.roomSlug, inviteId: message.inviteId, inviteSecret: message.inviteSecret, displayName: message.displayName })
      if (!joined.ok) return safeError(conn, joined.code)
      conn.roomId = joined.room.roomId; conn.memberId = joined.member.memberId; conn.state = 'bound'
      send(conn, { type: 'room.joined', roomId: conn.roomId, memberId: conn.memberId, resumeToken: joined.resumeToken, recovery: repository.getRecovery(conn.roomId, message.lastSeq) }); return broadcast(conn.roomId, joined.event)
    }
    if (message.type === 'room.resume') {
      if (conn.state !== 'hello') return safeError(conn, 'conflict')
      if (!exact(message, ['type', 'roomId', 'memberId', 'resumeToken', 'lastSeq']) || !text(message.roomId) || !text(message.memberId) || !text(message.resumeToken) || !seq(message.lastSeq)) return safeError(conn, 'invalid-payload')
      const resumed = repository.resumeMember(message); if (!resumed.ok) return safeError(conn, resumed.code)
      for (const prior of [...connections]) if (prior !== conn && prior.roomId === message.roomId && prior.memberId === message.memberId) terminate(prior, 'connection-superseded')
      conn.roomId = message.roomId; conn.memberId = message.memberId; conn.state = 'bound'
      send(conn, { type: 'room.resumed', roomId: conn.roomId, memberId: conn.memberId, resumeToken: resumed.resumeToken, recovery: repository.getRecovery(conn.roomId, message.lastSeq) }); return broadcast(conn.roomId, resumed.event)
    }
    if (conn.state !== 'bound') return safeError(conn, 'unauthorized')
    if (!active(conn)) return terminate(conn, 'unauthorized')
    if (message.type === 'room.recovery.request') {
      if (!exact(message, ['type', 'roomId', 'lastSeq']) || message.roomId !== conn.roomId || !seq(message.lastSeq)) return safeError(conn, 'unauthorized')
      return send(conn, { type: 'room.recovery', recovery: repository.getRecovery(conn.roomId, message.lastSeq) })
    }
    if (message.type === 'ping') {
      if (!exact(message, ['type', 'roomId', 'sentAt']) || message.roomId !== conn.roomId || !repository.renewMemberLease(conn.roomId, conn.memberId)) return safeError(conn, 'unauthorized')
      return send(conn, { type: 'pong', sentAt: message.sentAt })
    }
    if (message.roomId !== conn.roomId || message.actorId !== conn.memberId) return send(conn, rejectedAck({ commandId: message.commandId, roomId: message.roomId, code: 'unauthorized' }))
    const result = service.execute(message, { memberId: conn.memberId, ip: conn.ip }); send(conn, result.ack); if (result.event && !result.ack.duplicate) broadcast(conn.roomId, result.event)
  }
  wss.on('connection', (socket, request) => {
    const conn = { id: nextConnectionId++, socket, ip: request.socket.remoteAddress || 'unknown', state: 'ready', roomId: '', memberId: '' }; connections.add(conn)
    send(conn, { protocolVersion: COLLABORATION_PROTOCOL_VERSION, type: 'server.ready' })
    socket.on('message', raw => { try { handle(conn, JSON.parse(String(raw))) } catch { safeError(conn, 'invalid-payload') } })
    socket.once('close', () => disconnect(conn)); socket.once('error', () => disconnect(conn))
  })
  return { close: () => { for (const conn of [...connections]) terminate(conn, null, { disconnectMember: true }) }, connections, broadcastEvents, invalidateMembers, invalidateRooms, sweepInactiveConnections }
}
