import { randomUUID } from 'node:crypto'

const MAX_MEMBERS = 20
const MAX_EVENT_LOG = 100
const ROOM_CLEANUP_AGE_MS = 60 * 60 * 1000 // 1 hour
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000 // 5 minutes

const rooms = new Map()

export class RoomMember {
  constructor ({ nickname, requestedRole = 'member' }) {
    this.id = 'member_' + randomUUID().slice(0, 12)
    this.nickname = String(nickname).slice(0, 30)
    this.role = requestedRole === 'host' ? 'host' : 'member'
    this.socketId = null
    this.joinedAt = new Date().toISOString()
  }

  toJSON () {
    return {
      id: this.id,
      nickname: this.nickname,
      role: this.role,
      joinedAt: this.joinedAt
    }
  }
}

export class Room {
  constructor ({ slug, hostNickname }) {
    this.id = 'room_' + randomUUID().slice(0, 8)
    this.slug = String(slug).slice(0, 50).toLowerCase().replace(/[^a-z0-9-]/g, '-')
    this.name = String(slug).slice(0, 50)
    this.members = new Map()
    this.seq = 0
    this.events = []
    this.createdAt = new Date().toISOString()
    this.lastActivityAt = new Date().toISOString()

    const host = new RoomMember({ nickname: hostNickname, requestedRole: 'host' })
    this.members.set(host.id, host)
    this.hostId = host.id
  }

  nextSeq () {
    this.seq += 1
    return this.seq
  }

  pushEvent (event) {
    this.events.push(event)
    if (this.events.length > MAX_EVENT_LOG) {
      this.events = this.events.slice(-MAX_EVENT_LOG)
    }
    this.lastActivityAt = new Date().toISOString()
  }

  addMember (member) {
    if (this.members.size >= MAX_MEMBERS) return null
    this.members.set(member.id, member)
    return member
  }

  removeMember (memberId) {
    this.members.delete(memberId)
  }

  getMember (memberId) {
    return this.members.get(memberId) ?? null
  }

  get host () {
    return this.members.get(this.hostId) ?? null
  }

  get memberCount () {
    return this.members.size
  }

  toSnapshot () {
    return {
      room: {
        id: this.id,
        slug: this.slug,
        name: this.name,
        createdAt: this.createdAt,
        hostId: this.hostId
      },
      members: Array.from(this.members.values()).map(m => m.toJSON()),
      recentEvents: this.events.slice(-20),
      lastSeq: this.seq
    }
  }

  toPublicSummary () {
    return {
      slug: this.slug,
      name: this.name,
      memberCount: this.members.size,
      lastActivityAt: this.lastActivityAt,
      createdAt: this.createdAt
    }
  }
}

export function createRoom ({ slug, hostNickname }) {
  const room = new Room({ slug, hostNickname })
  rooms.set(room.id, room)
  return room
}

export function getRoomById (id) {
  return rooms.get(id) ?? null
}

export function getRoomBySlug (slug) {
  for (const room of rooms.values()) {
    if (room.slug === slug) return room
  }
  return null
}

export function listRooms () {
  return Array.from(rooms.values()).map(r => r.toPublicSummary())
}

export function removeRoom (id) {
  return rooms.delete(id)
}

export function cleanupStaleRooms () {
  const now = Date.now()
  for (const [id, room] of rooms) {
    const age = now - new Date(room.lastActivityAt).getTime()
    if (age > ROOM_CLEANUP_AGE_MS) {
      rooms.delete(id)
    }
  }
}

let cleanupTimer = null
export function startCleanupInterval () {
  if (cleanupTimer) return
  cleanupTimer = setInterval(cleanupStaleRooms, CLEANUP_INTERVAL_MS)
  cleanupTimer.unref?.()
}

export function stopCleanupInterval () {
  if (cleanupTimer) {
    clearInterval(cleanupTimer)
    cleanupTimer = null
  }
}
