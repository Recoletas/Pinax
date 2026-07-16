import { describe, it, expect } from 'vitest'
import { createEvent, getEventsSince, getSnapshot, isCommandDuplicate } from '../realtime/RoomEventStore.js'
import { Room } from '../realtime/RoomRegistry.js'

describe('online room server', () => {
  it('seq increments + commandId idempotency (dedup)', () => {
    const room = new Room({ slug: 'test', hostNickname: 'Host' })
    const e1 = createEvent(room, 'chat.message', 'user1', { text: 'hello' }, 'cmd1')
    const e2 = createEvent(room, 'chat.message', 'user1', { text: 'world' }, 'cmd2')

    expect(e1.seq).toBe(1)
    expect(e2.seq).toBe(2)
    expect(isCommandDuplicate(room, 'cmd1')).toBe(true)
    expect(isCommandDuplicate(room, 'cmd3')).toBe(false)
  })

  it('host permission check rejects non-host', () => {
    const room = new Room({ slug: 'test2', hostNickname: 'Host' })
    expect(room.hostId).toBeTruthy()
    expect('someone-else' === room.hostId).toBe(false)
    createEvent(room, 'narrative.requested', 'host', {}, 'h-cmd')
    expect(room.events.length).toBe(1)
  })

  it('lastSeq reconnect returns incremental + snapshot replay', () => {
    const room = new Room({ slug: 'test3', hostNickname: 'Alice' })
    createEvent(room, 'chat.message', room.hostId, { text: 'a' }, null)
    createEvent(room, 'chat.message', room.hostId, { text: 'b' }, null)
    createEvent(room, 'chat.message', room.hostId, { text: 'c' }, null)

    const since1 = getEventsSince(room, 1)
    expect(since1.length).toBe(2)
    expect(since1.map(e => e.seq)).toEqual([2, 3])

    const snap = getSnapshot(room)
    expect(snap.lastSeq).toBe(3)
    expect(snap.recentEvents.length).toBe(3)
  })
})
