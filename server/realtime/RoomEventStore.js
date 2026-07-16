import { randomUUID } from 'node:crypto'

export function createEvent (room, type, actorId, payload, commandId = null) {
  const event = {
    id: 'evt_' + randomUUID().slice(0, 12),
    roomId: room.id,
    seq: room.nextSeq(),
    type,
    actorId,
    commandId,
    payload,
    createdAt: new Date().toISOString()
  }
  room.pushEvent(event)
  return event
}

export function getEventsSince (room, lastSeq) {
  const num = lastSeq ?? 0
  return room.events.filter(e => e.seq > num)
}

export function getSnapshot (room) {
  return room.toSnapshot()
}

export function isCommandDuplicate (room, commandId) {
  if (!commandId) return false
  return room.events.some(e => e.commandId === commandId)
}
