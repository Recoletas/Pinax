import { describe, expect, it, beforeEach, vi } from 'vitest'
import { useOnlineRoom } from '../composables/useOnlineRoom'
import { createExperienceSessionAdapter } from '../services/experienceSessionAdapter'

class MockWebSocket {
  constructor() {
    this.readyState = WebSocket.CONNECTING
    this.sent = []
    this.onopen = null
    this.onmessage = null
    this.onerror = null
    this.onclose = null
  }
  send(data) {
    this.sent.push(JSON.parse(data))
  }
  close() {
    this.readyState = WebSocket.CLOSED
    if (this.onclose) this.onclose()
  }
  _open() {
    this.readyState = WebSocket.OPEN
    if (this.onopen) this.onopen()
  }
  _message(data) {
    if (this.onmessage) this.onmessage({ data: JSON.stringify(data) })
  }
  _error() {
    if (this.onerror) this.onerror()
  }
}

describe('useOnlineRoom', () => {
  let room
  let mockWs

  beforeEach(() => {
    vi.useFakeTimers()
    mockWs = null

    vi.stubGlobal('WebSocket', function (url) {
      mockWs = new MockWebSocket()
      return mockWs
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  function connectAndJoin(slug, nick) {
    room = useOnlineRoom()
    room.joinRoom(slug, nick)
    return room
  }

  it('deduplicates events by id and seq', () => {
    const r = connectAndJoin('test-room', 'alice')
    mockWs._open()

    const joinMsg = mockWs.sent.find((c) => c.type === 'room.join')
    expect(joinMsg.nickname).toBe('alice')

    const evt1 = {
      id: 'evt_1',
      roomId: 'room_test',
      seq: 1,
      type: 'chat.message',
      actorId: 'm_1',
      payload: { text: 'hello', nickname: 'bob' }
    }
    mockWs._message({ type: 'event.append', payload: evt1 })
    expect(r.chatMessages).toHaveLength(1)

    mockWs._message({ type: 'event.append', payload: evt1 })
    expect(r.chatMessages).toHaveLength(1)
    expect(r.lastSeq.value).toBe(1)

    const evt2 = {
      id: 'evt_2',
      roomId: 'room_test',
      seq: 1,
      type: 'chat.message',
      actorId: 'm_2',
      payload: { text: 'dup seq', nickname: 'carol' }
    }
    mockWs._message({ type: 'event.append', payload: evt2 })
    expect(r.chatMessages).toHaveLength(1)
  })

  it('applies snapshot and reconnects with lastSeq', () => {
    const r = connectAndJoin('test-room', 'alice')
    mockWs._open()

    const snapshot = {
      room: { id: 'room_test', slug: 'test-room', title: 'Test Room' },
      members: [
        { id: 'm_1', nickname: 'alice', role: 'host' },
        { id: 'm_2', nickname: 'bob', role: 'member' }
      ],
      recentEvents: [
        {
          id: 'evt_10',
          roomId: 'room_test',
          seq: 10,
          type: 'chat.message',
          actorId: 'm_1',
          payload: { text: 'hi', nickname: 'alice' }
        }
      ],
      lastSeq: 10
    }
    mockWs._message({ type: 'room.snapshot', payload: snapshot })

    expect(r.room.value?.slug).toBe('test-room')
    expect(r.members).toHaveLength(2)
    expect(r.chatMessages).toHaveLength(1)
    expect(r.lastSeq.value).toBe(10)
    expect(r.isHost.value).toBe(true)

    r.leaveRoom()

    const r2 = useOnlineRoom()
    r2.lastSeq.value = 10
    r2.joinRoom('test-room', 'alice')

    const ws2 = new MockWebSocket()
    vi.stubGlobal('WebSocket', function () { return ws2 })
    r2.joinRoom('test-room', 'alice')
    ws2._open()

    const joinCmd = ws2.sent.find((c) => c.type === 'room.join')
    expect(joinCmd.lastSeq).toBe(10)
  })

  it('restricts host controls to host members', () => {
    const r = connectAndJoin('test-room', 'player1')
    mockWs._open()

    const snapshot = {
      room: { id: 'room_test', slug: 'test-room' },
      members: [
        { id: 'm_1', nickname: 'alice', role: 'host' },
        { id: 'm_2', nickname: 'player1', role: 'member' }
      ],
      recentEvents: [],
      lastSeq: 0
    }
    mockWs._message({ type: 'room.snapshot', payload: snapshot })

    expect(r.isHost.value).toBe(false)

    const adapter = createExperienceSessionAdapter(r)
    expect(adapter.submitHostCompletion({ text: 'test' })).toBe(false)
    expect(adapter.submitAcceptedRuntimePatch({ patch: 'x' })).toBe(false)

    snapshot.members = [
      { id: 'm_1', nickname: 'player1', role: 'host' },
      { id: 'm_2', nickname: 'alice', role: 'member' }
    ]
    mockWs._message({ type: 'room.snapshot', payload: snapshot })

    expect(r.isHost.value).toBe(true)
    expect(adapter.submitHostCompletion({ text: 'test' })).toBe(true)
    expect(adapter.submitAcceptedRuntimePatch({ patch: 'x' })).toBe(true)
  })
})
