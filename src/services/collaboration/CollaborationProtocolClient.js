import { COLLABORATION_PROTOCOL_VERSION } from '../../../shared/collaboration/constants.js'

const memoryStorage = () => { const data = new Map(); return { getItem: key => data.get(key) || null, setItem: (key, value) => data.set(key, String(value)), removeItem: key => data.delete(key) } }
const TERMINAL_CODES = new Set(['expired', 'room-not-found', 'not-found', 'invite-revoked', 'invite-expired', 'invite-invalid', 'resume-invalid', 'unauthorized'])

export class CollaborationProtocolClient {
  constructor ({ transport, storage = memoryStorage(), timers = globalThis, clock = () => Date.now(), commandId = () => crypto.randomUUID(), clientBuild = 'web', features = [], ackTimeoutMs = 5_000, maxRetries = 2, heartbeatIntervalMs = 20_000, heartbeatTimeoutMs = 8_000 } = {}) {
    if (!transport) throw new TypeError('transport-required')
    Object.assign(this, { transport, storage, timers, clock, commandId, clientBuild, features, ackTimeoutMs, maxRetries, heartbeatIntervalMs, heartbeatTimeoutMs })
    this.state = 'idle'; this.roomId = ''; this.roomSlug = ''; this.memberId = ''; this.resumeToken = ''; this.lastSeq = 0; this.connectionEpoch = 0; this.pending = new Map(); this.listeners = new Map(); this.unsubscribers = []; this.heartbeatTimer = null; this.pongTimer = null; this.pendingPing = null
    this.unsubscribers.push(transport.on('message', msg => this.#receive(msg)), transport.on('state', state => this.#transportState(state)), transport.on('sent', sent => this.#outboundSent(sent)))
  }
  on (type, listener) { const set = this.listeners.get(type) || new Set(); set.add(listener); this.listeners.set(type, set); return () => set.delete(listener) }
  #emit (type, value) { for (const listener of this.listeners.get(type) || []) listener(value) }
  #sessionKey () { return `pinax.collaboration.session.${this.roomId || this.roomSlug}` }
  #saveIdentity () { if (this.roomId && this.memberId && this.resumeToken) { const identity = { roomId: this.roomId, memberId: this.memberId, resumeToken: this.resumeToken, lastSeq: this.lastSeq }; if (this.joinIntent) this.joinIntent.resume = identity; const value = JSON.stringify(identity); this.storage.setItem(this.#sessionKey(), value); if (this.roomSlug) this.storage.setItem(`pinax.collaboration.session.${this.roomSlug}`, value) } }
  #loadIdentity () { try { return JSON.parse(this.storage.getItem(this.#sessionKey()) || 'null') } catch { return null } }
  #terminate (message) {
    const code = message?.code || 'collaboration-terminal-error'
    const identityRoomId = this.roomId || this.joinIntent?.resume?.roomId
    if (identityRoomId) this.storage.removeItem(`pinax.collaboration.session.${identityRoomId}`)
    if (this.roomSlug) this.storage.removeItem(`pinax.collaboration.session.${this.roomSlug}`)
    for (const pending of this.pending.values()) {
      this.timers.clearTimeout(pending.timer)
      this.transport.cancel?.(pending.envelope.commandId)
      pending.reject(Object.assign(new Error(code), { code }))
    }
    this.pending.clear()
    this.#stopHeartbeat()
    if (this.joinIntent) {
      this.joinIntent.resume = null
      this.joinIntent.inviteId = undefined
      this.joinIntent.inviteSecret = undefined
    }
    this.roomId = ''; this.memberId = ''; this.resumeToken = ''; this.lastSeq = 0
    this.transport.close(code)
    this.state = code
    this.#emit('state', this.state)
    this.#emit('error', message)
  }

  async connect ({ roomId = '', roomSlug = '', inviteId, inviteSecret, displayName, compatibility, signal } = {}) {
    this.roomId = roomId; this.roomSlug = roomSlug
    const saved = this.#loadIdentity()
    if (saved?.roomId && saved?.memberId && saved?.resumeToken) this.lastSeq = Number.isSafeInteger(saved.lastSeq) ? saved.lastSeq : 0
    this.joinIntent = { roomId, roomSlug, inviteId, inviteSecret, displayName, compatibility, resume: saved }
    await this.transport.connect({ signal })
  }

  #transportState ({ state, epoch }) {
    if (state === 'open' && epoch !== this.connectionEpoch) { this.connectionEpoch = epoch; this.state = 'handshaking'; this.transport.send({ type: 'client.hello', protocolVersion: COLLABORATION_PROTOCOL_VERSION, minProtocolVersion: COLLABORATION_PROTOCOL_VERSION, clientBuild: this.clientBuild, features: this.features }); return }
    if (['disconnected', 'backoff', 'closed'].includes(state)) { this.#stopHeartbeat(); for (const pending of this.pending.values()) { this.timers.clearTimeout(pending.timer); pending.timer = null } this.state = state; this.#emit('state', this.state) }
  }
  #receive ({ data, epoch }) {
    if (epoch !== this.connectionEpoch) return
    let message
    try { message = JSON.parse(data) } catch { return }
    if (message.type === 'server.hello') {
      if (!message.accepted) { if (TERMINAL_CODES.has(message.code)) this.#terminate(message); else { this.state = message.code; this.#emit('error', message) } return }
      this.state = 'joining'; const saved = this.joinIntent.resume
      this.transport.send(saved ? { type: 'room.resume', roomId: saved.roomId, memberId: saved.memberId, resumeToken: saved.resumeToken, lastSeq: saved.lastSeq || 0 } : { type: 'room.join', roomSlug: this.joinIntent.roomSlug, inviteId: this.joinIntent.inviteId, inviteSecret: this.joinIntent.inviteSecret, displayName: this.joinIntent.displayName, lastSeq: this.lastSeq })
      if (!saved) { this.joinIntent.inviteId = undefined; this.joinIntent.inviteSecret = undefined }
      return
    }
    if (message.type === 'room.joined' || message.type === 'room.resumed') {
      this.roomId = message.roomId; this.memberId = message.memberId; this.resumeToken = message.resumeToken; this.joinIntent.resume = { roomId: this.roomId, memberId: this.memberId, resumeToken: this.resumeToken, lastSeq: this.lastSeq }; this.state = 'connected'; this.#saveIdentity(); this.#emit('identity', { roomId: this.roomId, memberId: this.memberId }); this.#applyRecovery(message.recovery); this.#emit('state', this.state); this.#retryPending(); this.#scheduleHeartbeat(); return
    }
    if (message.type === 'command.ack') { const pending = this.pending.get(message.commandId); if (!pending || pending.epoch !== epoch) return; this.timers.clearTimeout(pending.timer); this.transport.cancel?.(message.commandId); this.pending.delete(message.commandId); message.status === 'accepted' ? pending.resolve(message) : pending.reject(Object.assign(new Error(message.code), { ack: message })); return }
    if (message.type === 'event.append') { this.#event(message.event, epoch); return }
    if (message.type === 'room.recovery') { this.#applyRecovery(message.recovery); return }
    if (message.type === 'pong' && message.sentAt === this.pendingPing) { this.timers.clearTimeout(this.pongTimer); this.pongTimer = null; this.pendingPing = null; this.#scheduleHeartbeat(); return }
    if (message.type === 'error') {
      if (TERMINAL_CODES.has(message.code)) this.#terminate(message)
      else this.#emit('error', message)
    }
  }
  #applyRecovery (recovery) {
    if (!recovery) return
    if (recovery.status === 'snapshot-required' || recovery.snapshot) { const snapshot = recovery.snapshot; this.lastSeq = snapshot?.lastSeq || 0; this.#saveIdentity(); this.#emit('snapshot', snapshot); return }
    for (const event of recovery.events || []) this.#event(event, this.connectionEpoch)
  }
  #event (event, epoch) {
    if (epoch !== this.connectionEpoch || !Number.isSafeInteger(event?.seq)) return
    if (event.seq <= this.lastSeq) return
    if (event.seq !== this.lastSeq + 1) { this.transport.send({ type: 'room.recovery.request', roomId: this.roomId, lastSeq: this.lastSeq }, { key: `recovery:${this.roomId}` }); this.#emit('gap', { expected: this.lastSeq + 1, actual: event.seq }); return }
    this.lastSeq = event.seq; this.#saveIdentity(); this.#emit('event', event)
  }
  sendCommand (type, payload = {}, { commandId = this.commandId(), hostEpoch, retries = this.maxRetries } = {}) {
    if (!this.roomId || !this.memberId) return Promise.reject(new Error('client-not-joined'))
    const envelope = { protocolVersion: 2, type, commandId, roomId: this.roomId, actorId: this.memberId, payload, ...(hostEpoch == null ? {} : { hostEpoch }) }
    const existing = this.pending.get(commandId)
    if (existing) return existing.promise
    let resolve; let reject
    const promise = new Promise((ok, fail) => { resolve = ok; reject = fail })
    const pending = { envelope, resolve, reject, promise, retries, attempts: 0, epoch: this.connectionEpoch, timer: null }
    this.pending.set(commandId, pending); this.#sendPending(pending); return promise
  }
  #sendPending (pending) {
    if (this.state !== 'connected') return
    pending.epoch = this.connectionEpoch; pending.attempts += 1
    try { this.transport.send(pending.envelope, { key: pending.envelope.commandId }) } catch (error) { if (!pending.retries) { this.pending.delete(pending.envelope.commandId); pending.reject(error) } }
  }
  #outboundSent ({ key, epoch }) {
    const pending = this.pending.get(key); if (!pending) return
    pending.epoch = epoch; this.timers.clearTimeout(pending.timer)
    pending.timer = this.timers.setTimeout(() => {
      if (!this.pending.has(pending.envelope.commandId)) return
      if (pending.attempts <= pending.retries) return this.#sendPending(pending)
      this.transport.cancel?.(pending.envelope.commandId); this.pending.delete(pending.envelope.commandId); pending.reject(new Error('command-ack-timeout'))
    }, this.ackTimeoutMs)
  }
  #retryPending () { for (const pending of this.pending.values()) { this.timers.clearTimeout(pending.timer); this.#sendPending(pending) } }
  #scheduleHeartbeat () {
    this.#stopHeartbeat(); if (this.state !== 'connected') return
    const epoch = this.connectionEpoch
    this.heartbeatTimer = this.timers.setTimeout(() => {
      this.heartbeatTimer = null; if (this.state !== 'connected' || epoch !== this.connectionEpoch) return
      const sentAt = this.clock(); this.pendingPing = sentAt
      try { this.transport.send({ type: 'ping', roomId: this.roomId, sentAt }, { queue: false, key: `heartbeat:${this.roomId}` }) } catch { this.pendingPing = null; return }
      this.pongTimer = this.timers.setTimeout(() => { if (this.pendingPing !== sentAt || epoch !== this.connectionEpoch) return; this.pendingPing = null; this.pongTimer = null; this.transport.retry?.('heartbeat-timeout') }, this.heartbeatTimeoutMs)
    }, this.heartbeatIntervalMs)
  }
  #stopHeartbeat () { this.timers.clearTimeout(this.heartbeatTimer); this.timers.clearTimeout(this.pongTimer); this.heartbeatTimer = null; this.pongTimer = null; this.pendingPing = null }
  close () { this.#stopHeartbeat(); for (const pending of this.pending.values()) { this.timers.clearTimeout(pending.timer); this.transport.cancel?.(pending.envelope.commandId); pending.reject(new Error('client-closed')) } this.pending.clear(); this.transport.close(); this.state = 'closed' }
  destroy () { this.close(); this.unsubscribers.forEach(off => off()); this.listeners.clear(); this.transport.destroy() }
}
