export function serialize (message) {
  return JSON.stringify(message)
}

export function serverReady (roomId) {
  return serialize({ type: 'server.ready', roomId, serverTime: new Date().toISOString() })
}

export function roomJoined (roomId, memberId) {
  return serialize({ type: 'room.joined', roomId, memberId })
}

export function eventAppend (roomId, event) {
  return serialize({ type: 'event.append', roomId, event })
}

export function snapshot (roomId, data) {
  return serialize({ type: 'room.snapshot', roomId, ...data })
}

export function presenceSync (roomId, members) {
  return serialize({ type: 'presence.sync', roomId, members })
}

export function error (code, message) {
  return serialize({ type: 'error', code, message })
}

export function pong (sentAt) {
  return serialize({ type: 'pong', sentAt })
}
