export class RemoteWebSocketTransport {
  constructor ({ url, WebSocketImpl = globalThis.WebSocket, timers = globalThis, random = Math.random, connectTimeoutMs = 8_000, baseBackoffMs = 500, maxBackoffMs = 30_000, maxQueue = 64 } = {}) {
    if (!url || !WebSocketImpl) throw new TypeError('transport-config-required')
    Object.assign(this, { url, WebSocketImpl, timers, random, connectTimeoutMs, baseBackoffMs, maxBackoffMs, maxQueue })
    this.state = 'idle'; this.socket = null; this.epoch = 0; this.attempt = 0; this.queue = new Map(); this.listeners = new Map(); this.intentional = false; this.connectTimer = null; this.retryTimer = null; this.activeConnect = null; this.nextQueueId = 1
  }
  on (type, listener) { const set = this.listeners.get(type) || new Set(); set.add(listener); this.listeners.set(type, set); return () => { set.delete(listener); if (!set.size) this.listeners.delete(type) } }
  #emit (type, value) { for (const listener of this.listeners.get(type) || []) listener(value) }
  #state (state, detail = null) { this.state = state; this.#emit('state', { state, detail, epoch: this.epoch }) }
  #clear (name) { if (this[name] != null) this.timers.clearTimeout(this[name]); this[name] = null }
  #settleConnect (error = null, value = null) { const active = this.activeConnect; if (!active) return; this.activeConnect = null; active.cleanup(); error ? active.reject(error) : active.resolve(value) }
  connect ({ signal } = {}) {
    if (signal?.aborted) return Promise.reject(new DOMException('Aborted', 'AbortError'))
    this.#settleConnect(new Error('connection-superseded')); this.intentional = false; this.#clear('retryTimer'); this.#teardownSocket(); this.epoch += 1
    const epoch = this.epoch; this.#state('connecting')
    return new Promise((resolve, reject) => {
      let socket
      try { socket = new this.WebSocketImpl(this.url) } catch (error) { reject(error); this.#state('disconnected', 'constructor-failed'); this.#scheduleReconnect(); return }
      this.socket = socket
      const abort = () => { if (epoch === this.epoch) this.close('aborted') }
      signal?.addEventListener('abort', abort, { once: true }); const cleanup = () => signal?.removeEventListener('abort', abort)
      this.activeConnect = { epoch, resolve, reject, cleanup }
      this.connectTimer = this.timers.setTimeout(() => { if (epoch !== this.epoch) return; this.#teardownSocket(); this.#state('disconnected', 'connect-timeout'); this.#settleConnect(new Error('connect-timeout')); this.#scheduleReconnect() }, this.connectTimeoutMs)
      socket.onopen = () => { if (epoch !== this.epoch) return; this.#clear('connectTimer'); this.attempt = 0; this.#state('open'); this.#flush(); this.#settleConnect(null, { epoch }) }
      socket.onmessage = message => { if (epoch === this.epoch) this.#emit('message', { data: message.data, epoch }) }
      socket.onerror = () => { if (epoch === this.epoch) this.#emit('error', { code: 'socket-error', epoch }) }
      socket.onclose = () => { if (epoch !== this.epoch) return; this.#clear('connectTimer'); this.socket = null; this.#settleConnect(new Error('connection-closed')); this.#state('disconnected'); if (!this.intentional) this.#scheduleReconnect() }
    })
  }
  send (value, { queue = true, key = null } = {}) {
    const encoded = typeof value === 'string' ? value : JSON.stringify(value); const resolvedKey = key || `outbound:${this.nextQueueId++}`
    if (this.socket?.readyState === this.WebSocketImpl.OPEN) {
      try {
        this.socket.send(encoded); this.#emit('sent', { key: resolvedKey, epoch: this.epoch }); return { sent: true, queued: false, key: resolvedKey, epoch: this.epoch }
      } catch (error) {
        this.#emit('error', { code: 'socket-send-failed', error, epoch: this.epoch })
        this.#retryAfterFailure('socket-send-failed')
        if (!queue) throw error
        return { sent: false, queued: false, key: resolvedKey, epoch: this.epoch }
      }
    }
    if (!queue) throw new Error('transport-not-open')
    if (!this.queue.has(resolvedKey) && this.queue.size >= this.maxQueue) throw new Error('transport-queue-full')
    this.queue.set(resolvedKey, encoded); return { sent: false, queued: true, key: resolvedKey, epoch: this.epoch }
  }
  cancel (key) { return this.queue.delete(key) }
  #flush () {
    for (const [key, encoded] of [...this.queue]) {
      if (this.socket?.readyState !== this.WebSocketImpl.OPEN) break
      try { this.socket.send(encoded) } catch (error) { this.#emit('error', { code: 'socket-send-failed', error, epoch: this.epoch }); break }
      this.queue.delete(key)
      this.#emit('sent', { key, epoch: this.epoch })
    }
  }
  #scheduleReconnect () { if (this.intentional || this.retryTimer != null) return; const exponential = Math.min(this.maxBackoffMs, this.baseBackoffMs * 2 ** this.attempt++); const delay = Math.round(exponential * (0.75 + this.random() * 0.5)); this.#state('backoff', { delay }); this.retryTimer = this.timers.setTimeout(() => { this.retryTimer = null; this.connect().catch(() => {}) }, delay) }
  #retryAfterFailure (reason) { this.intentional = false; this.epoch += 1; this.#teardownSocket(); this.#settleConnect(new Error(reason)); this.#state('disconnected', reason); this.#scheduleReconnect() }
  retry (reason = 'retry-requested') { this.#retryAfterFailure(reason) }
  #teardownSocket () { this.#clear('connectTimer'); if (this.socket) { const socket = this.socket; this.socket = null; socket.onopen = socket.onmessage = socket.onerror = socket.onclose = null; if (socket.readyState === this.WebSocketImpl.OPEN || socket.readyState === this.WebSocketImpl.CONNECTING) socket.close() } }
  close (reason = 'closed') { this.intentional = true; this.epoch += 1; this.#clear('retryTimer'); this.#teardownSocket(); this.#settleConnect(reason === 'aborted' ? new DOMException('Aborted', 'AbortError') : new Error(reason)); this.#state('closed', reason) }
  destroy () { this.close('destroyed'); this.queue.clear(); this.listeners.clear() }
}
