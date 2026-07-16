import { describe, expect, it, beforeEach, vi } from 'vitest'
import { useOnlineRoom } from '../composables/useOnlineRoom'
import { createExperienceSessionAdapter } from '../services/experienceSessionAdapter'
import { Room } from '../../server/realtime/RoomRegistry.js'
import { createEvent, getEventsSince, isCommandDuplicate } from '../../server/realtime/RoomEventStore.js'
import { eventAppend, presenceSync, roomJoined } from '../../server/realtime/serializer.js'

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

  it('covers event replay, reconnect, host permissions, and protocol integration', async () => {
    {
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
    }

    {
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
    }

    vi.stubGlobal('WebSocket', function () {
      mockWs = new MockWebSocket()
      return mockWs
    })
    {
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
    }

    {
    const onlineModule = await import('../composables/useOnlineRoom')
    expect(onlineModule.deriveWsUrl('atlas-room', {
      protocol: 'https:',
      host: 'pinax.example'
    })).toBe('wss://pinax.example/ws/rooms')

    const serverRoom = new Room({ slug: 'atlas-room', hostNickname: 'alice' })
    const host = serverRoom.claimMember({ nickname: 'alice', requestedRole: 'member' })
    expect(host.id).toBe(serverRoom.hostId)
    expect(host.role).toBe('host')
    expect(serverRoom.memberCount).toBe(1)

    const first = createEvent(serverRoom, 'chat.message', host.id, { text: 'first' }, 'cmd_1')
    const second = createEvent(serverRoom, 'chat.message', host.id, { text: 'second' }, 'cmd_2')
    expect([first.seq, second.seq]).toEqual([1, 2])
    expect(isCommandDuplicate(serverRoom, 'cmd_1')).toBe(true)
    expect(getEventsSince(serverRoom, 1).map((event) => event.seq)).toEqual([2])

    serverRoom.removeMember(host.id)
    const rejoinedHost = serverRoom.claimMember({ nickname: 'alice' })
    expect(rejoinedHost.role).toBe('host')
    expect(serverRoom.hostId).toBe(rejoinedHost.id)

    const eventMessage = JSON.parse(eventAppend(serverRoom.id, {
      id: 'evt_1',
      roomId: serverRoom.id,
      seq: 1,
      type: 'chat.message',
      actorId: host.id,
      payload: { text: 'hello' }
    }))
    expect(eventMessage.payload.type).toBe('chat.message')

    const presenceMessage = JSON.parse(presenceSync(serverRoom.id, [host.toJSON()]))
    expect(presenceMessage.payload.members[0].role).toBe('host')

    const joinedMessage = JSON.parse(roomJoined(serverRoom.id, host.id, serverRoom.toSnapshot()))
    expect(joinedMessage.payload.room.slug).toBe('atlas-room')
    expect(joinedMessage.payload.memberId).toBe(host.id)

    const bridgeModule = await import('../services/onlineExperienceBridge.js')
    expect(typeof bridgeModule.buildOnlineRuntimePatch).toBe('function')
    expect(typeof bridgeModule.applyOnlineNarrativeCompletion).toBe('function')

    const fakeStore = {
      messages: [],
      chatHistory: [],
      saveCurrentSession: vi.fn(),
      rebuildChatHistory: vi.fn()
    }
    const completion = {
      requestEventId: 'evt_request_1',
      actionText: '推开钟楼的门',
      assistantMessage: { role: 'assistant', content: '门轴发出低沉的回响。' }
    }
    expect(bridgeModule.applyOnlineNarrativeCompletion(fakeStore, completion)).toBe(true)
    expect(bridgeModule.applyOnlineNarrativeCompletion(fakeStore, completion)).toBe(false)
    expect(fakeStore.messages.map((message) => message.role)).toEqual(['user', 'assistant'])

    const runtimePatch = bridgeModule.buildOnlineRuntimePatch({
      writingCharacter: { name: '岚' },
      writingTime: { year: '12' },
      worldMapState: { currentScene: '钟楼' },
      goals: [{ id: 'goal_1', title: '查明钟声' }]
    })
    expect(runtimePatch.paths).toEqual(['writingCharacter', 'writingTime', 'worldMapState', 'goals'])
    }
  })
})
