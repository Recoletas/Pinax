import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createEvent, getEventsSince, getSnapshot, isCommandDuplicate } from '../realtime/RoomEventStore.js'
import { Room } from '../realtime/RoomRegistry.js'
import { validateNickname, validateMessage, validateActionText, ERROR_CODES } from '../realtime/validators.js'

describe('RoomEventStore', () => {
  it('creates event with seq increment + commandId dedup', () => {
    const room = new Room({ slug: 'test', hostNickname: 'Host' })
    const e1 = createEvent(room, 'chat.message', 'user1', { text: 'hello' }, 'cmd1')
    const e2 = createEvent(room, 'chat.message', 'user1', { text: 'world' }, 'cmd2')

    expect(e1.seq).toBe(1)
    expect(e2.seq).toBe(2)
    expect(e1.id).toMatch(/^evt_/)
    expect(e1.commandId).toBe('cmd1')
    expect(e2.commandId).toBe('cmd2')
    expect(isCommandDuplicate(room, 'cmd1')).toBe(true)
    expect(isCommandDuplicate(room, 'cmd3')).toBe(false)
    expect(isCommandDuplicate(room, null)).toBe(false)
  })

  it('getEventsSince returns incremental events', () => {
    const room = new Room({ slug: 'test2', hostNickname: 'Host' })
    createEvent(room, 'chat.message', 'u1', { text: 'a' }, null)
    createEvent(room, 'chat.message', 'u1', { text: 'b' }, null)
    createEvent(room, 'chat.message', 'u1', { text: 'c' }, null)

    const since1 = getEventsSince(room, 1)
    expect(since1.length).toBe(2)
    expect(since1[0].seq).toBe(2)
    expect(since1[1].seq).toBe(3)

    const since0 = getEventsSince(room, 0)
    expect(since0.length).toBe(3)
  })

  it('getSnapshot returns room + members + lastSeq', () => {
    const room = new Room({ slug: 'test3', hostNickname: 'Alice' })
    createEvent(room, 'chat.message', room.hostId, { text: 'hey' }, null)
    createEvent(room, 'chat.message', room.hostId, { text: 'ho' }, null)

    const snap = getSnapshot(room)
    expect(snap.room.slug).toBe('test3')
    expect(snap.lastSeq).toBe(2)
    expect(snap.members.length).toBe(1) // host only
    expect(snap.recentEvents.length).toBe(2)
    expect(snap.room.hostId).toBe(room.hostId)
  })
})

describe('validators', () => {
  it('rejects empty/missing nickname', () => {
    expect(validateNickname('').ok).toBe(false)
    expect(validateNickname(null).ok).toBe(false)
  })
  it('rejects too-long nickname', () => {
    expect(validateNickname('a'.repeat(31)).ok).toBe(false)
  })
  it('accepts valid nickname', () => {
    const r = validateNickname('Alice')
    expect(r.ok).toBe(true)
    expect(r.value).toBe('Alice')
  })
  it('rejects empty/long messages', () => {
    expect(validateMessage('').ok).toBe(false)
    expect(validateMessage('x'.repeat(2001)).ok).toBe(false)
    expect(validateMessage('hello').ok).toBe(true)
  })
  it('ERROR_CODES has stable host-permission code', () => {
    expect(ERROR_CODES.ERR_NOT_HOST).toBe(4030)
    expect(ERROR_CODES.ERR_RATE_LIMITED).toBe(4291)
  })
})
