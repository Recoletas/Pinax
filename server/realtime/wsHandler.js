import { getRoomBySlug, createRoom } from './RoomRegistry.js'
import { createEvent, getEventsSince, getSnapshot, isCommandDuplicate } from './RoomEventStore.js'
import { validateNickname, validateMessage, validateActionText, checkRateLimit, clearRateBucket, ERROR_CODES } from './validators.js'
import { serialize, serverReady, roomJoined, eventAppend, snapshot, presenceSync, error, pong } from './serializer.js'

const HEARTBEAT_INTERVAL_MS = 30_000
const HEARTBEAT_TIMEOUT_MS = 60_000

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
  const evt = createEvent(room, 'narrative.requested', conn.memberId, msg.payload || {}, msg.commandId || null)
  conn.broadcastToRoom(eventAppend(room.id, evt))
}

function handleNarrativeCompleted (conn, msg) {
  const room = conn.room
  if (!room || !conn.memberId) return conn.send(error(ERROR_CODES.ERR_ROOM_NOT_FOUND, '未加入房间'))
  if (conn.memberId !== room.hostId) return conn.send(error(ERROR_CODES.ERR_NOT_HOST, '只有房主可以提交叙事结果'))
  if (msg.commandId && isCommandDuplicate(room, msg.commandId)) return
  const evt = createEvent(room, 'narrative.completed', conn.memberId, msg.payload || {}, msg.commandId || null)
  conn.broadcastToRoom(eventAppend(room.id, evt))
}

function handleRuntimePatch (conn, msg) {
  const room = conn.room
  if (!room || !conn.memberId) return conn.send(error(ERROR_CODES.ERR_ROOM_NOT_FOUND, '未加入房间'))
  if (conn.memberId !== room.hostId) return conn.send(error(ERROR_CODES.ERR_NOT_HOST, '只有房主可以执行此操作'))
  if (msg.commandId && isCommandDuplicate(room, msg.commandId)) return
  const evt = createEvent(room, 'runtime.patch.accepted', conn.memberId, msg.payload || {}, msg.commandId || null)
  conn.broadcastToRoom(eventAppend(room.id, evt))
}

function handleSnapshotRequest (conn, msg) {
  const room = conn.room
  if (!room || !conn.memberId) return conn.send(error(ERROR_CODES.ERR_ROOM_NOT_FOUND, '未加入房间'))
  const data = getSnapshot(room)
  conn.send(snapshot(room.id, data))
}

export { connections }
