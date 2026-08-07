import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { useOnlineRoom } from '../composables/useOnlineRoom'
import OnlineChatOverlay from '../components/experience/OnlineChatOverlay.vue'
import OnlineRoomPanel from '../components/experience/OnlineRoomPanel.vue'
import NarrativeAgentStatus from '../components/experience/NarrativeAgentStatus.vue'
import { createExperienceSessionAdapter } from '../services/experienceSessionAdapter'
import { Room, getRoomBySlug } from '../../server/realtime/RoomRegistry.js'
import {
  createEvent,
  findNarrativeRequest,
  getEventsSince,
  hasNarrativeCompletion,
  isCommandDuplicate
} from '../../server/realtime/RoomEventStore.js'
import { eventAppend, presenceSync, roomJoined } from '../../server/realtime/serializer.js'
import { setupWebSocket } from '../../server/realtime/wsHandler.js'

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

class MockServerSocket {
  constructor() {
    this.OPEN = 1
    this.readyState = this.OPEN
    this.sent = []
    this.handlers = {}
  }
  send(data) {
    this.sent.push(JSON.parse(data))
  }
  on(type, callback) {
    this.handlers[type] = callback
  }
  _message(command) {
    this.handlers.message?.(JSON.stringify(command))
  }
  close() {
    this.readyState = 3
    this.handlers.close?.()
  }
  terminate() {
    this.close()
  }
}

describe('useOnlineRoom', () => {
  let room
  let mockWs

  beforeEach(() => {
    vi.useFakeTimers()
    mockWs = null

    vi.stubGlobal('WebSocket', function (_url) {
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
    expect(adapter.submitHostStatus({
      requestId: 'narrative_test',
      phase: 'deciding'
    })).toBe(true)
    expect(adapter.submitAcceptedRuntimePatch({ patch: 'x' })).toBe(true)
    const narrativeRequestId = adapter.requestNarrative({ text: '走进钟楼' })
    expect(narrativeRequestId).toMatch(/^narrative_/)
    expect(mockWs.sent.find((command) => command.type === 'narrative.request')).toMatchObject({
      payload: {
        requestId: narrativeRequestId,
        text: '走进钟楼'
      }
    })
    expect(mockWs.sent.find((command) => command.type === 'narrative.status')).toMatchObject({
      payload: {
        requestId: 'narrative_test',
        phase: 'deciding'
      }
    })
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

    const narrativeRequest = createEvent(serverRoom, 'narrative.requested', host.id, {
      requestId: 'narrative_1',
      text: '推开钟楼的门'
    }, 'cmd_narrative_1')
    expect(findNarrativeRequest(serverRoom, 'narrative_1')).toBe(narrativeRequest)
    expect(hasNarrativeCompletion(serverRoom, 'narrative_1')).toBe(false)
    createEvent(serverRoom, 'narrative.completed', host.id, {
      requestId: 'narrative_1',
      requestEventId: narrativeRequest.id,
      assistantMessage: { content: '门轴发出低沉的回响。' }
    }, 'cmd_narrative_complete_1')
    expect(hasNarrativeCompletion(serverRoom, 'narrative_1')).toBe(true)

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
      requestId: 'narrative_1',
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
      placeStates: { tower: { controllerId: 'guild-clock' } },
      characterStates: { lan: { alive: true, placeId: 'tower' } },
      characterRelations: {
        'relation:lan-mu': {
          subjectId: 'lan',
          objectId: 'mu',
          kind: 'sibling',
          status: 'confirmed'
        }
      },
      canonicalFacts: {
        'fact:tower-bell': {
          subjectId: 'tower',
          predicate: 'bell-state',
          value: 'silent',
          status: 'confirmed'
        }
      },
      worldMapState: { currentScene: '钟楼' },
      goals: [{ id: 'goal_1', title: '查明钟声' }]
    })
    expect(runtimePatch.paths).toEqual([
      'writingCharacter',
      'writingTime',
      'placeStates',
      'characterStates',
      'characterRelations',
      'canonicalFacts',
      'worldMapState',
      'goals'
    ])

    const chat = mount(OnlineChatOverlay, {
      props: {
        isConnected: true,
        messages: [{ id: 'chat-1', actorId: 'm_1', nickname: 'alice', text: '去钟楼。' }]
      }
    })
    expect(chat.text()).toContain('alice')
    expect(chat.text()).toContain('去钟楼。')
    await chat.get('input').setValue('我来带路')
    await chat.get('form').trigger('submit')
    expect(chat.emitted('send')?.[0]).toEqual(['我来带路'])
    chat.unmount()

    const emptyChat = mount(OnlineChatOverlay, { props: { isConnected: true, messages: [] } })
    expect(emptyChat.find('.online-chat').exists()).toBe(false)
    expect(emptyChat.find('.online-chat-launcher').exists()).toBe(true)
    await emptyChat.get('.online-chat-launcher').trigger('click')
    expect(emptyChat.find('.online-chat').exists()).toBe(true)
    emptyChat.unmount()

    const roomPanel = mount(OnlineRoomPanel, {
      props: {
        compact: true,
        roomSlug: '04bu8rsw',
        connectionState: 'connected',
        members: [{ id: 'm_1', nickname: 'REco', role: 'host' }]
      }
    })
    expect(roomPanel.classes()).toContain('online-room--compact')
    expect(roomPanel.text()).toContain('成员 · 1')
    roomPanel.unmount()

    const agentStatus = mount(NarrativeAgentStatus, {
      props: {
        status: {
          phase: 'executing-tools',
          toolRounds: 1,
          totalCalls: 2
        }
      }
    })
    expect(agentStatus.get('.narrative-agent-status').attributes('role')).toBe('status')
    expect(agentStatus.text()).toContain('查阅相关资料')
    expect(agentStatus.text()).toContain('1 轮 · 2 项')
    await agentStatus.setProps({
      status: {
        phase: 'error',
        message: '叙事资料查询超时'
      }
    })
    expect(agentStatus.get('.narrative-agent-status').attributes('role')).toBe('alert')
    expect(agentStatus.text()).toContain('叙事资料查询超时')
    agentStatus.unmount()

    let acceptConnection
    setupWebSocket({
      on(type, callback) {
        if (type === 'connection') acceptConnection = callback
      }
    })
    const hostSocket = new MockServerSocket()
    acceptConnection(hostSocket)
    hostSocket._message({
      type: 'room.join',
      commandId: 'join-host',
      roomSlug: 'agent-authority-room',
      nickname: 'host'
    })
    hostSocket._message({
      type: 'narrative.request',
      commandId: 'request-1',
      payload: {
        requestId: 'narrative_authority_1',
        text: '推开钟楼的门'
      }
    })
    hostSocket._message({
      type: 'narrative.status',
      commandId: 'status-1',
      payload: {
        requestId: 'narrative_authority_1',
        phase: 'executing-tools',
        toolRounds: 1,
        totalCalls: 2
      }
    })
    hostSocket._message({
      type: 'narrative.completed',
      commandId: 'complete-1',
      payload: {
        requestId: 'narrative_authority_1',
        actionText: '伪造的动作不会成为权威文本',
        assistantMessage: { content: '门轴发出低沉的回响。' }
      }
    })
    hostSocket._message({
      type: 'narrative.completed',
      commandId: 'complete-2',
      payload: {
        requestId: 'narrative_authority_1',
        assistantMessage: { content: '重复正文。' }
      }
    })

    const authorityRoom = getRoomBySlug('agent-authority-room')
    expect(authorityRoom.events.filter((event) => event.type === 'narrative.completed')).toHaveLength(1)
    expect(authorityRoom.events.find((event) => event.type === 'narrative.completed')?.payload).toMatchObject({
      requestId: 'narrative_authority_1',
      actionText: '推开钟楼的门',
      assistantMessage: { content: '门轴发出低沉的回响。' }
    })
    expect(authorityRoom.events.map((event) => event.type)).toEqual(expect.arrayContaining([
      'narrative.requested',
      'narrative.status',
      'narrative.completed'
    ]))
    expect(hostSocket.sent.find((message) => message.type === 'error' && message.code === 4091)).toBeTruthy()

    const memberSocket = new MockServerSocket()
    acceptConnection(memberSocket)
    memberSocket._message({
      type: 'room.join',
      commandId: 'join-member',
      roomSlug: 'agent-authority-room',
      nickname: 'member'
    })
    memberSocket._message({
      type: 'narrative.status',
      commandId: 'member-status',
      payload: {
        requestId: 'narrative_authority_1',
        phase: 'streaming'
      }
    })
    expect(memberSocket.sent.find((message) => message.type === 'error' && message.code === 4030)).toBeTruthy()
    hostSocket.close()
    memberSocket.close()
    }
  })
})
