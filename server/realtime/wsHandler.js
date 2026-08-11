import { getRoomBySlug, createRoom } from './RoomRegistry.js'
import {
  createEvent,
  findNarrativeRequest,
  getEventsSince,
  getSnapshot,
  hasNarrativeCompletion,
  isCommandDuplicate
} from './RoomEventStore.js'
import { validateNickname, validateMessage, validateActionText, checkRateLimit, clearRateBucket, ERROR_CODES } from './validators.js'
import { serialize, serverReady, roomJoined, eventAppend, snapshot, presenceSync, error, pong } from './serializer.js'

const HEARTBEAT_INTERVAL_MS = 30_000
const HEARTBEAT_TIMEOUT_MS = 60_000
const NARRATIVE_STATUS_PHASES = new Set([
  'deciding',
  'requesting-step',
  'finalizing',
  'retrying-step',
  'repairing-step',
  'resource-refreshed',
  'executing-tools',
  'tools-complete',
  'ready',
  'streaming',
  'complete',
  'error'
])

const connections = new Map()

export function setupWebSocket (wss) {
  wss.on('connection', (socket) => {
    const connId = 'ws_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6)

    const conn = {
      id: connId,
      room: null,
      memberId: null,
      socket,
      lastHeartbeat: Date.now(),
      send (data) {
        if (socket.readyState === socket.OPEN) {
          try { socket.send(data) } catch (_) { /* disconnected */ }
        }
      },
      broadcastToRoom (data, excludeSelf = false) {
        if (!this.room) return
        for (const [cid, other] of connections) {
          if (excludeSelf && cid === connId) continue
          if (other.room?.id === this.room.id) {
            other.send(data)
          }
        }
      },
      broadcastPresence () {
        if (!this.room) return
        const members = Array.from(this.room.members.values()).map(m => m.toJSON())
        this.broadcastToRoom(presenceSync(this.room.id, members))
      }
    }
    connections.set(connId, conn)

    socket.send(serverReady(null))

    const heartbeatTimer = setInterval(() => {
      const elapsed = Date.now() - conn.lastHeartbeat
      if (elapsed > HEARTBEAT_TIMEOUT_MS) {
        socket.terminate()
      }
    }, HEARTBEAT_INTERVAL_MS)

    socket.on('message', (raw) => {
      try {
        handleMessage(conn, raw)
      } catch (e) {
        conn.send(error(ERROR_CODES.ERR_PARSE_ERROR, '消息解析失败'))
      }
    })

    socket.on('close', () => {
      clearInterval(heartbeatTimer)
      handleDisconnect(conn)
      clearRateBucket(connId)
      connections.delete(connId)
    })

    socket.on('error', () => {
      clearInterval(heartbeatTimer)
      handleDisconnect(conn)
      clearRateBucket(connId)
      connections.delete(connId)
    })
  })
}

function handleMessage (conn, raw) {
  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch {
    conn.send(error(ERROR_CODES.ERR_PARSE_ERROR, 'JSON 解析错误'))
    return
  }

  if (!parsed || !parsed.type) {
    conn.send(error(ERROR_CODES.ERR_UNKNOWN_COMMAND, '未知消息类型'))
    return
  }

  if (!checkRateLimit(conn.id)) {
    conn.send(error(ERROR_CODES.ERR_RATE_LIMITED, '请求过于频繁，请稍后再试'))
    return
  }

  switch (parsed.type) {
    case 'ping':
      conn.lastHeartbeat = Date.now()
      conn.send(pong(parsed.sentAt ?? Date.now()))
      break
    case 'room.join':
      handleJoin(conn, parsed)
      break
    case 'room.leave':
      handleLeave(conn)
      break
    case 'chat.send':
      handleChatSend(conn, parsed)
      break
    case 'action.propose':
      handleActionPropose(conn, parsed)
      break
    case 'action.select':
      handleActionSelect(conn, parsed)
      break
    case 'vote.cast':
      handleVoteCast(conn, parsed)
      break
    case 'narrative.request':
      handleNarrativeRequest(conn, parsed)
      break
    case 'narrative.status':
      handleNarrativeStatus(conn, parsed)
      break
    case 'narrative.completed':
      handleNarrativeCompleted(conn, parsed)
      break
    case 'runtime.patch.accept':
    case 'runtime.patch.accepted':
      handleRuntimePatch(conn, parsed)
      break
    case 'room.snapshot.request':
      handleSnapshotRequest(conn, parsed)
      break
    default:
      conn.send(error(ERROR_CODES.ERR_UNKNOWN_COMMAND, '未知命令类型: ' + parsed.type))
  }
}

function handleJoin (conn, msg) {
  const nickValid = validateNickname(msg.nickname)
  if (!nickValid.ok) {
    return conn.send(error(ERROR_CODES.ERR_INVALID_NICKNAME, nickValid.message))
  }

  let room = null
  if (msg.roomSlug) {
    room = getRoomBySlug(msg.roomSlug)
    if (!room) {
      room = createRoom({ slug: msg.roomSlug, hostNickname: nickValid.value })
    }
  } else {
    return conn.send(error(ERROR_CODES.ERR_ROOM_NOT_FOUND, '缺少房间标识'))
  }

  const member = room.claimMember({ nickname: nickValid.value, requestedRole: msg.requestedRole || 'member' })
  if (!member) {
    return conn.send(error(ERROR_CODES.ERR_ROOM_FULL, '房间已满'))
  }

  member.socketId = conn.id
  conn.room = room
  conn.memberId = member.id
  conn.lastHeartbeat = Date.now()

  const evt = createEvent(room, 'room.member.joined', member.id, member.toJSON(), msg.commandId || null)
  conn.send(roomJoined(room.id, member.id, getSnapshot(room)))
  conn.broadcastToRoom(eventAppend(room.id, evt))
  conn.broadcastPresence()

  if (msg.lastSeq) {
    const missed = getEventsSince(room, msg.lastSeq)
    if (missed.length > 0) {
      for (const e of missed) {
        conn.send(eventAppend(room.id, e))
      }
    }
  }
}

function handleLeave (conn) {
  const room = conn.room
  if (!room || !conn.memberId) return
  const member = room.getMember(conn.memberId)
  const evt = createEvent(room, 'room.member.left', conn.memberId, {
    id: conn.memberId,
    nickname: member?.nickname || 'unknown'
  }, null)
  conn.broadcastToRoom(eventAppend(room.id, evt))
  room.removeMember(conn.memberId)
  conn.broadcastPresence()
  conn.room = null
  conn.memberId = null
}

function handleDisconnect (conn) {
  handleLeave(conn)
}

function handleChatSend (conn, msg) {
  const room = conn.room
  if (!room || !conn.memberId) return conn.send(error(ERROR_CODES.ERR_ROOM_NOT_FOUND, '未加入房间'))
  const textValid = validateMessage(msg.text)
  if (!textValid.ok) return conn.send(error(ERROR_CODES.ERR_INVALID_MESSAGE, textValid.message))
  if (msg.commandId && isCommandDuplicate(room, msg.commandId)) {
    return
  }
  const evt = createEvent(room, 'chat.message', conn.memberId, { text: textValid.value }, msg.commandId || null)
  conn.broadcastToRoom(eventAppend(room.id, evt))
}

function handleActionPropose (conn, msg) {
  const room = conn.room
  if (!room || !conn.memberId) return conn.send(error(ERROR_CODES.ERR_ROOM_NOT_FOUND, '未加入房间'))
  const textValid = validateActionText(msg.text)
  if (!textValid.ok) return conn.send(error(ERROR_CODES.ERR_INVALID_ACTION, textValid.message))
  if (msg.commandId && isCommandDuplicate(room, msg.commandId)) return
  const evt = createEvent(room, 'action.proposed', conn.memberId, { text: textValid.value, proposalId: 'prop_' + Date.now() }, msg.commandId || null)
  conn.broadcastToRoom(eventAppend(room.id, evt))
}

function handleActionSelect (conn, msg) {
  const room = conn.room
  if (!room || !conn.memberId) return conn.send(error(ERROR_CODES.ERR_ROOM_NOT_FOUND, '未加入房间'))
  if (conn.memberId !== room.hostId) return conn.send(error(ERROR_CODES.ERR_NOT_HOST, '只有房主可以执行此操作'))
  if (msg.commandId && isCommandDuplicate(room, msg.commandId)) return
  const evt = createEvent(room, 'action.selected', conn.memberId, { proposalId: msg.proposalId || '' }, msg.commandId || null)
  conn.broadcastToRoom(eventAppend(room.id, evt))
}

function handleVoteCast (conn, msg) {
  const room = conn.room
  if (!room || !conn.memberId) return conn.send(error(ERROR_CODES.ERR_ROOM_NOT_FOUND, '未加入房间'))
  if (msg.commandId && isCommandDuplicate(room, msg.commandId)) return
  const evt = createEvent(room, 'vote.cast', conn.memberId, { proposalId: msg.proposalId || '' }, msg.commandId || null)
  conn.broadcastToRoom(eventAppend(room.id, evt))
}

function handleNarrativeRequest (conn, msg) {
  const room = conn.room
  if (!room || !conn.memberId) return conn.send(error(ERROR_CODES.ERR_ROOM_NOT_FOUND, '未加入房间'))
  if (conn.memberId !== room.hostId) return conn.send(error(ERROR_CODES.ERR_NOT_HOST, '只有房主可以执行此操作'))
  if (msg.commandId && isCommandDuplicate(room, msg.commandId)) return
  const payload = msg.payload && typeof msg.payload === 'object' ? msg.payload : {}
  const requestId = normalizeNarrativeRequestId(payload.requestId || msg.commandId)
  const textValid = validateActionText(payload.text)
  if (!requestId || !textValid.ok) {
    return conn.send(error(ERROR_CODES.ERR_INVALID_NARRATIVE, textValid.message || '叙事请求标识无效'))
  }
  if (findNarrativeRequest(room, requestId)) return
  const evt = createEvent(room, 'narrative.requested', conn.memberId, {
    requestId,
    proposalId: String(payload.proposalId || '').trim().slice(0, 120),
    text: textValid.value
  }, msg.commandId || null)
  conn.broadcastToRoom(eventAppend(room.id, evt))
}

function handleNarrativeStatus (conn, msg) {
  const room = conn.room
  if (!room || !conn.memberId) return conn.send(error(ERROR_CODES.ERR_ROOM_NOT_FOUND, '未加入房间'))
  if (conn.memberId !== room.hostId) return conn.send(error(ERROR_CODES.ERR_NOT_HOST, '只有房主可以提交叙事状态'))
  if (msg.commandId && isCommandDuplicate(room, msg.commandId)) return
  const payload = normalizeNarrativeStatus(msg.payload)
  const request = findNarrativeRequest(room, payload.requestId)
  if (!request) {
    return conn.send(error(ERROR_CODES.ERR_INVALID_NARRATIVE, '找不到对应的叙事请求'))
  }
  if (hasNarrativeCompletion(room, payload.requestId)) return
  const evt = createEvent(room, 'narrative.status', conn.memberId, payload, msg.commandId || null)
  conn.broadcastToRoom(eventAppend(room.id, evt))
}

function handleNarrativeCompleted (conn, msg) {
  const room = conn.room
  if (!room || !conn.memberId) return conn.send(error(ERROR_CODES.ERR_ROOM_NOT_FOUND, '未加入房间'))
  if (conn.memberId !== room.hostId) return conn.send(error(ERROR_CODES.ERR_NOT_HOST, '只有房主可以提交叙事结果'))
  if (msg.commandId && isCommandDuplicate(room, msg.commandId)) return
  const payload = msg.payload && typeof msg.payload === 'object' ? msg.payload : {}
  const requestId = normalizeNarrativeRequestId(payload.requestId)
  const request = findNarrativeRequest(room, requestId)
  const assistantContent = String(payload.assistantMessage?.content || payload.text || '').trim()
  if (!request || !assistantContent || assistantContent.length > 20_000) {
    return conn.send(error(ERROR_CODES.ERR_INVALID_NARRATIVE, '叙事结果无效或没有对应请求'))
  }
  if (hasNarrativeCompletion(room, requestId)) {
    return conn.send(error(ERROR_CODES.ERR_NARRATIVE_CONFLICT, '该叙事请求已经完成'))
  }
  const evt = createEvent(room, 'narrative.completed', conn.memberId, {
    requestId,
    requestEventId: request.id,
    actionText: request.payload.text,
    assistantMessage: {
      role: 'assistant',
      name: String(payload.assistantMessage?.name || '').trim().slice(0, 80),
      content: assistantContent,
      timestamp: Number(payload.assistantMessage?.timestamp) || Date.now()
    },
    createdAt: Number(payload.createdAt) || Date.now()
  }, msg.commandId || null)
  conn.broadcastToRoom(eventAppend(room.id, evt))
}

function handleRuntimePatch (conn, msg) {
  const room = conn.room
  if (!room || !conn.memberId) return conn.send(error(ERROR_CODES.ERR_ROOM_NOT_FOUND, '未加入房间'))
  if (conn.memberId !== room.hostId) return conn.send(error(ERROR_CODES.ERR_NOT_HOST, '只有房主可以执行此操作'))
  if (msg.commandId && isCommandDuplicate(room, msg.commandId)) return
  const payload = msg.payload && typeof msg.payload === 'object' ? msg.payload : {}
  const requestId = normalizeNarrativeRequestId(payload.requestId)
  if (requestId && !hasNarrativeCompletion(room, requestId)) {
    return conn.send(error(ERROR_CODES.ERR_INVALID_NARRATIVE, '运行时更新没有对应的已完成叙事'))
  }
  const evt = createEvent(room, 'runtime.patch.accepted', conn.memberId, {
    ...payload,
    requestId
  }, msg.commandId || null)
  conn.broadcastToRoom(eventAppend(room.id, evt))
}

function normalizeNarrativeRequestId (value) {
  const requestId = String(value || '').trim()
  if (!requestId || requestId.length > 120 || !/^[a-zA-Z0-9:_-]+$/.test(requestId)) return ''
  return requestId
}

function normalizeNarrativeStatus (input) {
  const payload = input && typeof input === 'object' ? input : {}
  const phase = String(payload.phase || '').trim()
  return {
    requestId: normalizeNarrativeRequestId(payload.requestId),
    phase: NARRATIVE_STATUS_PHASES.has(phase) ? phase : 'error',
    code: String(payload.code || '').trim().slice(0, 80),
    message: String(payload.message || '').replace(/\s+/g, ' ').trim().slice(0, 180),
    toolRounds: Math.max(0, Math.min(2, Number(payload.toolRounds) || 0)),
    totalCalls: Math.max(0, Math.min(6, Number(payload.totalCalls ?? payload.callCount) || 0)),
    stepIndex: Math.max(0, Math.min(20, Number(payload.stepIndex) || 0)),
    terminalMode: String(payload.terminalMode || '').trim().slice(0, 80),
    protocol: String(payload.protocol || '').trim().slice(0, 40),
    groundingPolicy: String(payload.groundingPolicy || '').trim().slice(0, 40),
    at: Number(payload.at) || Date.now()
  }
}

function handleSnapshotRequest (conn, msg) {
  const room = conn.room
  if (!room || !conn.memberId) return conn.send(error(ERROR_CODES.ERR_ROOM_NOT_FOUND, '未加入房间'))
  const data = getSnapshot(room)
  conn.send(snapshot(room.id, data))
}

export { connections }
