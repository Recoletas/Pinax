import { ref, reactive, computed, onBeforeUnmount, getCurrentInstance } from 'vue'

const RECONNECT_BASE_MS = 1000
const RECONNECT_MAX_MS = 30000
const HEARTBEAT_INTERVAL_MS = 25000
const CONNECT_TIMEOUT_MS = 8000

let nextId = 0
function nanoid() {
  return `cmd_${Date.now().toString(36)}_${(nextId++).toString(36)}`
}

export function deriveWsUrl(_roomSlug, locationLike = window.location) {
  const proto = locationLike.protocol === 'https:' ? 'wss' : 'ws'
  return `${proto}://${locationLike.host}/ws/rooms`
}

function sequenceStorageKey(roomSlug) {
  return `pinax.online.lastSeq.${String(roomSlug || '').trim()}`
}

function rememberSession(key, value) {
  try { sessionStorage.setItem(key, value) } catch { /* quota */ }
}
function recallSession(key) {
  try { return sessionStorage.getItem(key) } catch { return null }
}

export function useOnlineRoom() {
  const roomSlug = ref('')
  const room = ref(null)
  const members = reactive([])
  const events = reactive([])
  const chatMessages = reactive([])
  const proposals = reactive([])
  const votes = reactive({})
  const connectionState = ref('idle')
  const error = ref(null)
  const lastSeq = ref(0)
  const nickname = ref(recallSession('pinax.online.nickname') || '')
  const selfMemberId = ref('')

  const seenEventIds = new Set()
  let ws = null
  let reconnectTimer = null
  let heartbeatTimer = null
  let connectTimer = null
  let reconnectAttempts = 0
  let intentionalClose = false

  const isConnected = computed(() => connectionState.value === 'connected')
  const isHost = computed(() => {
    if (!room.value) return false
    const self = members.find((m) => m.id === selfMemberId.value)
      || members.find((m) => m.nickname === nickname.value)
    return self?.role === 'host'
  })

  function setConnectionState(state) {
    connectionState.value = state
  }

  function isEventProcessed(evt) {
    if (seenEventIds.has(evt.id)) return true
    if (evt.seq != null && evt.seq <= lastSeq.value) return true
    return false
  }

  function markEventSeen(evt) {
    if (evt.id) seenEventIds.add(evt.id)
    if (evt.seq != null && evt.seq > lastSeq.value) {
      lastSeq.value = evt.seq
      rememberSession(sequenceStorageKey(roomSlug.value), String(evt.seq))
    }
  }

  function processEvent(evt) {
    if (isEventProcessed(evt)) return
    markEventSeen(evt)

    switch (evt.type) {
      case 'room.member.joined': {
        const idx = members.findIndex((m) => m.id === evt.payload.id)
        if (idx >= 0) members.splice(idx, 1, evt.payload)
        else members.push(evt.payload)
        events.push(evt)
        break
      }
      case 'room.member.left': {
        const idx = members.findIndex((m) => m.id === evt.payload.id)
        if (idx >= 0) members.splice(idx, 1)
        events.push(evt)
        break
      }
      case 'room.member.updated': {
        const idx = members.findIndex((m) => m.id === evt.payload.id)
        if (idx >= 0) members.splice(idx, 1, evt.payload)
        events.push(evt)
        break
      }
      case 'chat.message': {
        const actor = members.find((member) => member.id === evt.actorId)
        chatMessages.push({ ...evt.payload, actorId: evt.actorId, nickname: evt.payload?.nickname || actor?.nickname || '' })
        events.push(evt)
        break
      }
      case 'action.proposed': {
        proposals.push({ ...evt.payload, id: evt.payload?.id || evt.payload?.proposalId })
        events.push(evt)
        break
      }
      case 'action.selected': {
        const found = proposals.find((p) => p.id === evt.payload.proposalId)
        if (found) found.selected = true
        events.push(evt)
        break
      }
      case 'vote.cast': {
        if (!votes[evt.payload.proposalId]) {
          votes[evt.payload.proposalId] = []
        }
        votes[evt.payload.proposalId].push({
          actorId: evt.actorId,
          vote: evt.payload.vote
        })
        events.push(evt)
        break
      }
      case 'narrative.requested':
      case 'narrative.status':
      case 'narrative.completed':
      case 'runtime.patch.accepted':
        events.push(evt)
        break
    }
  }

  function applySnapshot(snapshot) {
    room.value = snapshot.room || null
    members.splice(0, members.length)
    if (Array.isArray(snapshot.members)) {
      snapshot.members.forEach((m) => members.push(m))
    }
    if (Array.isArray(snapshot.recentEvents)) {
      snapshot.recentEvents.forEach((evt) => processEvent(evt))
    }
    if (snapshot.lastSeq != null) {
      lastSeq.value = snapshot.lastSeq
      rememberSession(sequenceStorageKey(roomSlug.value), String(snapshot.lastSeq))
    }
  }

  function sendCommand(type, payload = {}) {
    if (!ws || ws.readyState !== WebSocket.OPEN) return ''
    const commandId = nanoid()
    const cmd = {
      type,
      commandId,
      ...payload
    }
    ws.send(JSON.stringify(cmd))
    return commandId
  }

  function startHeartbeat() {
    stopHeartbeat()
    heartbeatTimer = setInterval(() => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'ping', sentAt: new Date().toISOString() }))
      }
    }, HEARTBEAT_INTERVAL_MS)
  }

  function stopHeartbeat() {
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer)
      heartbeatTimer = null
    }
  }

  function scheduleReconnect() {
    if (intentionalClose) return
    if (reconnectTimer) clearTimeout(reconnectTimer)
    setConnectionState('reconnecting')
    const delay = Math.min(RECONNECT_BASE_MS * Math.pow(2, reconnectAttempts), RECONNECT_MAX_MS)
    reconnectTimer = setTimeout(() => {
      reconnectAttempts++
      connect()
    }, delay)
  }

  function cleanup() {
    stopHeartbeat()
    if (reconnectTimer) {
      clearTimeout(reconnectTimer)
      reconnectTimer = null
    }
    if (connectTimer) {
      clearTimeout(connectTimer)
      connectTimer = null
    }
  }

  function closeSocket() {
    if (ws) {
      intentionalClose = true
      ws.onopen = null
      ws.onmessage = null
      ws.onerror = null
      ws.onclose = null
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.close()
      }
      ws = null
    }
    cleanup()
    setConnectionState('disconnected')
  }

  function connect() {
    closeSocket()
    intentionalClose = false

    const url = deriveWsUrl(roomSlug.value)
    setConnectionState('connecting')
    error.value = null

    try {
      ws = new WebSocket(url)
    } catch (err) {
      setConnectionState('disconnected')
      error.value = '无法创建连接'
      scheduleReconnect()
      return
    }

    connectTimer = setTimeout(() => {
      if (ws && ws.readyState !== WebSocket.OPEN) {
        closeSocket()
        error.value = '连接超时'
        scheduleReconnect()
      }
    }, CONNECT_TIMEOUT_MS)

    ws.onopen = () => {
      if (connectTimer) {
        clearTimeout(connectTimer)
        connectTimer = null
      }
      sendCommand('room.join', {
        roomSlug: roomSlug.value,
        nickname: nickname.value,
        lastSeq: lastSeq.value
      })
      startHeartbeat()
    }

    ws.onmessage = (msg) => {
      let serverMsg
      try {
        serverMsg = JSON.parse(msg.data)
      } catch {
        return
      }

      switch (serverMsg.type) {
        case 'room.snapshot':
          applySnapshot(serverMsg.payload || serverMsg)
          break
        case 'event.append':
          if (serverMsg.payload || serverMsg.event) processEvent(serverMsg.payload || serverMsg.event)
          break
        case 'presence.sync':
          if (Array.isArray(serverMsg.payload?.members || serverMsg.members)) {
            members.splice(0, members.length)
            ;(serverMsg.payload?.members || serverMsg.members).forEach((m) => members.push(m))
          }
          break
        case 'room.joined':
          selfMemberId.value = serverMsg.payload?.memberId || serverMsg.memberId || ''
          applySnapshot(serverMsg.payload || serverMsg)
          reconnectAttempts = 0
          setConnectionState('connected')
          break
        case 'error':
          error.value = serverMsg.payload?.message || serverMsg.message || '服务端错误'
          if ((serverMsg.payload?.code || serverMsg.code) === 4040) {
            setConnectionState('disconnected')
            error.value = '房间不存在或已销毁（进程内房间重启后失效）'
          } else if ((serverMsg.payload?.code || serverMsg.code) === 4030) {
            setConnectionState('disconnected')
            error.value = serverMsg.payload?.message || serverMsg.message || '加入被拒绝'
          }
          break
        case 'pong':
          break
        default:
          break
      }
    }

    ws.onerror = () => {
      error.value = '连接异常'
    }

    ws.onclose = () => {
      if (connectTimer) {
        clearTimeout(connectTimer)
        connectTimer = null
      }
      stopHeartbeat()
      if (!intentionalClose) {
        scheduleReconnect()
      } else {
        setConnectionState('disconnected')
      }
    }
  }

  function joinRoom(slug, nick) {
    roomSlug.value = slug
    if (nick) {
      nickname.value = nick
      rememberSession('pinax.online.nickname', nick)
    }
    const savedSeq = recallSession(sequenceStorageKey(slug))
    if (savedSeq) lastSeq.value = Number(savedSeq)
    seenEventIds.clear()
    events.splice(0, events.length)
    chatMessages.splice(0, chatMessages.length)
    proposals.splice(0, proposals.length)
    Object.keys(votes).forEach((k) => delete votes[k])
    room.value = null
    error.value = null
    connect()
  }

  function leaveRoom() {
    sendCommand('room.leave', {})
    closeSocket()
  }

  function sendChat(text) {
    sendCommand('chat.send', { text })
  }

  function proposeAction(text) {
    sendCommand('action.propose', { text })
  }

  function selectAction(proposalId) {
    sendCommand('action.select', { proposalId })
  }

  function castVote(proposalId) {
    sendCommand('vote.cast', { proposalId })
  }

  function requestSnapshot() {
    sendCommand('room.snapshot.request', { lastSeq: lastSeq.value })
  }

  if (getCurrentInstance()) {
    onBeforeUnmount(() => {
      leaveRoom()
    })
  }

  return {
    roomSlug,
    room,
    members,
    events,
    chatMessages,
    proposals,
    votes,
    connectionState,
    error,
    lastSeq,
    nickname,
    selfMemberId,
    isConnected,
    isHost,
    joinRoom,
    leaveRoom,
    sendChat,
    sendCommand,
    proposeAction,
    selectAction,
    castVote,
    requestSnapshot
  }
}
