export function serialize (message) {
  return JSON.stringify(message)
}

export function serverReady (roomId) {
  return serialize({ type: 'server.ready', roomId, serverTime: new Date().toISOString() })
}

export function roomJoined (roomId, memberId, data = {}) {
  return serialize({
    type: 'room.joined',
    roomId,
    memberId,
    ...data,
    payload: { roomId, memberId, ...data }
  })
}

export function eventAppend (roomId, event) {
  return serialize({ type: 'event.append', roomId, event, payload: event })
}

export function snapshot (roomId, data) {
  return serialize({ type: 'room.snapshot', roomId, ...data, payload: data })
}

export function presenceSync (roomId, members) {
  return serialize({ type: 'presence.sync', roomId, members, payload: { members } })
}

export function error (code, message) {
  return serialize({ type: 'error', code, message, payload: { code, message } })
}

export function pong (sentAt) {
  return serialize({ type: 'pong', sentAt })
}
