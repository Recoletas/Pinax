// Experience 会话工作流（R-X1）：会话选择/创建/删除、加载期状态、启动
// 引导（bootstrap）与选择器弹层状态的全部逻辑在同一个组合式函数中，通过参数注入 store/router/路由，不 import 页面，不直接读取路由单例。
import { computed, ref, watch } from 'vue'

export function useExperienceSessionWorkflow({
  gameStore,
  worldStore,
  route,
  router,
  onlineSession,
  notifySourceStatus = () => {},
  buildOnlineRuntimePatch = () => ({}),
  applyOnlineRuntimePatch = () => {},
  applyOnlineNarrativeCompletion = () => {}
}) {
  const showSessionPicker = ref(false)
  const isStarting = ref(false)
  const selectedWorldbookId = ref('')
  const sessionPickerWorldbookId = ref('')

  function rememberSelection(worldbookId) {
    selectedWorldbookId.value = worldbookId || ''
    sessionPickerWorldbookId.value = selectedWorldbookId.value
  }

  // 启动引导：按 来源会话 → 来源世界书最新会话 → 当前会话 → 全库最新 →
  // 默认新建 的顺序恢复；返回供页面滚动定位的请求信息。
  async function bootstrapSessions() {
    await worldStore.loadWorldbooksIndex()
    gameStore.loadSessions()

    const requestedWorldbookId = typeof route.query.worldbookId === 'string'
      ? route.query.worldbookId.trim()
      : ''
    const requestedSessionId = typeof route.query.sessionId === 'string'
      ? route.query.sessionId.trim()
      : ''
    const requestedSession = requestedSessionId
      ? gameStore.sessions.find((session) => String(session.id) === requestedSessionId) || null
      : null
    if (requestedSessionId && !requestedSession) notifySourceStatus('来源会话已不可用')
    const hasRequestedWorldbook = Boolean(requestedWorldbookId
      && worldStore.worldbooksIndex.some((worldbook) => worldbook.id === requestedWorldbookId))
    const activeSession = !requestedSession && !hasRequestedWorldbook
      ? gameStore.sessions.find((session) => session.id === gameStore.currentSessionId) || null
      : null
    const targetWorldbookId = hasRequestedWorldbook ? requestedWorldbookId : (worldStore.activeWorldbookId || '')
    const allLatestSession = !activeSession && Array.isArray(gameStore.sessions) && gameStore.sessions.length
      ? [...gameStore.sessions].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))[0]
      : null
    const worldbookLatestSession = !activeSession && targetWorldbookId
      ? gameStore.getLatestSessionForWorldbook(targetWorldbookId)
      : null
    const latestStoredSession = worldbookLatestSession || allLatestSession
    let loadedExistingSession = false

    if (requestedSession) {
      gameStore.loadSession(requestedSession.id)
      rememberSelection(requestedSession.worldbookId || requestedSession.worldId || '')
      if (selectedWorldbookId.value) await worldStore.setActiveWorldbook(selectedWorldbookId.value)
      showSessionPicker.value = false
      loadedExistingSession = true
    } else if (hasRequestedWorldbook) {
      const requestedWorldbookSession = gameStore.getLatestSessionForWorldbook(targetWorldbookId)
      if (requestedWorldbookSession) {
        gameStore.loadSession(requestedWorldbookSession.id)
        loadedExistingSession = true
      } else {
        await worldStore.setActiveWorldbook(targetWorldbookId)
        gameStore.createSession({
          worldbookId: targetWorldbookId,
          inheritRuntimeState: false
        })
      }
      rememberSelection(targetWorldbookId)
      await worldStore.setActiveWorldbook(targetWorldbookId)
      showSessionPicker.value = false
    } else if (activeSession) {
      gameStore.loadSession(activeSession.id)
      rememberSelection(activeSession.worldbookId || activeSession.worldId || '')
      if (selectedWorldbookId.value) {
        await worldStore.setActiveWorldbook(selectedWorldbookId.value)
      }
      loadedExistingSession = true
    } else if (latestStoredSession) {
      gameStore.loadSession(latestStoredSession.id)
      rememberSelection(latestStoredSession.worldbookId || latestStoredSession.worldId || '')
      if (selectedWorldbookId.value) {
        await worldStore.setActiveWorldbook(selectedWorldbookId.value)
      }
      showSessionPicker.value = false
      loadedExistingSession = true
    } else {
      gameStore.resetRuntimeState()
      if (worldStore.worldbooksIndex.length) {
        const defaultWorldbook = await worldStore.ensureActiveWorldbook()
        rememberSelection(defaultWorldbook?.id || worldStore.activeWorldbookId || '')
      } else {
        rememberSelection(worldStore.activeWorldbookId || '')
      }
      showSessionPicker.value = false
    }

    if (!onlineSession && loadedExistingSession && (!gameStore.isPlaying || !Array.isArray(gameStore.messages) || gameStore.messages.length === 0)) {
      await gameStore.initGame()
    }

    return { requestedSession, requestedMessageId: typeof route.query.messageId === 'string' ? route.query.messageId.trim() : '' }
  }

  async function handleSessionSelect(session) {
    if (isStarting.value) return
    try {
      isStarting.value = true
      gameStore.loadSession(session.id)
      // 设置世界书选择
      rememberSelection(session.worldbookId || session.worldId || '')
      if (selectedWorldbookId.value) {
        await worldStore.setActiveWorldbook(selectedWorldbookId.value)
      }
      showSessionPicker.value = false
      if (!onlineSession && (!gameStore.messages || gameStore.messages.length === 0)) {
        await gameStore.initGame()
      }
    } finally {
      isStarting.value = false
    }
  }

  async function handleSessionCreate() {
    if (isStarting.value) return
    try {
      isStarting.value = true
      const worldbookId = sessionPickerWorldbookId.value || selectedWorldbookId.value || ''
      if (!worldbookId) {
        router.push({ name: 'settings-worldbook' })
        return
      }
      gameStore.createSession({
        worldbookId,
        inheritRuntimeState: false
      })
      if (worldbookId) {
        await worldStore.setActiveWorldbook(worldbookId)
      }
      rememberSelection(worldbookId)
      showSessionPicker.value = false
      if (!onlineSession) {
        await gameStore.initGame()
      }
    } finally {
      isStarting.value = false
    }
  }

  async function handleSessionDelete(session) {
    if (isStarting.value) return
    try {
      isStarting.value = true
      gameStore.deleteSession(session.id)
      // 如果删除后没有会话了，自动创建一个新会话
      if (gameStore.sessions.length === 0) {
        const worldbookId = selectedWorldbookId.value || worldStore.activeWorldbookId || ''
        gameStore.createSession({
          worldbookId,
          inheritRuntimeState: false
        })
        if (worldbookId) {
          await worldStore.setActiveWorldbook(worldbookId)
        }
        rememberSelection(worldbookId)
        showSessionPicker.value = false
        if (!onlineSession) {
          await gameStore.initGame()
        }
        return
      }
      if (gameStore.currentSessionId === null) {
        showSessionPicker.value = true
      }
    } finally {
      isStarting.value = false
    }
  }

  // ── 联机会话绑定（R-X1）：订阅/主机状态/迟到清理的唯一 owner ──
  const onlineRequestIds = new Set()
  const activeOnlineNarrativeRequestId = ref('')
  const onlineNarrativeStatus = ref(null)
  let onlineUnsubscribers = []
  let lastSubmittedOnlineStatusKey = ''

  const visibleNarrativeAgentStatus = computed(() => {
    if (!onlineSession) return gameStore.narrativeAgentStatus
    return onlineSession.isHost?.value
      ? gameStore.narrativeAgentStatus
      : onlineNarrativeStatus.value
  })

  watch(() => gameStore.narrativeAgentStatus, (status) => {
    const requestId = activeOnlineNarrativeRequestId.value
    const adapter = onlineSession?.adapter
    if (!requestId || !onlineSession?.isHost?.value || !status || !adapter) return
    const outbound = {
      requestId,
      phase: String(status.phase || '').trim(),
      code: String(status.code || '').trim(),
      message: String(status.message || '').replace(/\s+/g, ' ').trim().slice(0, 180),
      toolRounds: Math.max(0, Number(status.toolRounds) || 0),
      totalCalls: Math.max(0, Number(status.totalCalls ?? status.callCount) || 0),
      stepIndex: Math.max(0, Number(status.stepIndex) || 0),
      terminalMode: String(status.terminalMode || '').trim().slice(0, 80),
      protocol: String(status.protocol || '').trim().slice(0, 40),
      groundingPolicy: String(status.groundingPolicy || '').trim().slice(0, 40),
      at: Number(status.at) || Date.now()
    }
    const statusKey = [
      outbound.requestId,
      outbound.phase,
      outbound.code,
      outbound.toolRounds,
      outbound.totalCalls
    ].join(':')
    if (!outbound.phase || statusKey === lastSubmittedOnlineStatusKey) return
    lastSubmittedOnlineStatusKey = statusKey
    adapter.submitHostStatus?.(outbound)
  }, { deep: true, flush: 'sync' })

  watch([
    () => onlineSession?.isHost?.value,
    () => onlineSession?.isConnected?.value
  ], ([isHost, isConnected]) => {
    if (!activeOnlineNarrativeRequestId.value || (isHost !== false && isConnected !== false)) return
    gameStore.cancelNarrativeGeneration?.('online-host-authority-lost')
    activeOnlineNarrativeRequestId.value = ''
    lastSubmittedOnlineStatusKey = ''
  })

  function bindOnlineSession() {
    const adapter = onlineSession?.adapter
    if (!adapter) return
    onlineUnsubscribers.forEach((unsubscribe) => unsubscribe?.())
    onlineUnsubscribers = [
      adapter.onNarrativeRequested(handleOnlineNarrativeRequested),
      adapter.onNarrativeStatus((payload) => {
        const requestId = String(payload?.requestId || '').trim()
        if (!requestId || onlineSession?.isHost?.value) return
        onlineNarrativeStatus.value = { ...payload, requestId }
      }),
      adapter.onNarrativeCompleted((payload) => {
        applyOnlineNarrativeCompletion(gameStore, payload)
        const requestId = String(payload?.requestId || payload?.requestEventId || '').trim()
        if (!requestId || onlineNarrativeStatus.value?.requestId === requestId) {
          onlineNarrativeStatus.value = null
        }
        if (activeOnlineNarrativeRequestId.value === requestId) {
          activeOnlineNarrativeRequestId.value = ''
          lastSubmittedOnlineStatusKey = ''
        }
      }),
      adapter.onRuntimePatchAccepted((payload) => {
        applyOnlineRuntimePatch(gameStore, payload)
      })
    ]
  }

  async function handleOnlineNarrativeRequested(payload = {}, event = {}) {
    const requestId = String(payload.requestId || event.commandId || event.id || '').trim()
    const requestEventId = String(event.id || payload.requestEventId || '').trim()
    const actionText = String(payload.text || '').trim()
    if (requestId && !onlineSession?.isHost?.value) {
      onlineNarrativeStatus.value = {
        requestId,
        phase: 'deciding',
        at: Date.now()
      }
    }
    if (!onlineSession?.isHost?.value) return
    if (!requestId || !requestEventId || !actionText || onlineRequestIds.has(requestId)) return
    if (gameStore.messages.some((message) => (
      message?.onlineRequestId === requestId
      || message?.onlineRequestEventId === requestEventId
    ))) return
    onlineRequestIds.add(requestId)
    activeOnlineNarrativeRequestId.value = requestId
    lastSubmittedOnlineStatusKey = ''

    try {
      const messageStart = gameStore.messages.length
      await gameStore.sendAction(actionText)
      const generated = gameStore.messages
        .slice(messageStart)
        .findLast((message) => message?.role === 'assistant' && String(message?.content || '').trim())
      if (!generated) {
        const message = String(gameStore.lastError || '模型没有返回可用正文').trim()
        if (gameStore.narrativeAgentStatus?.phase !== 'error') {
          onlineSession.adapter.submitHostStatus?.({
            requestId,
            phase: 'error',
            code: 'NARRATIVE_STREAM_EMPTY',
            message,
            at: Date.now()
          })
        }
        activeOnlineNarrativeRequestId.value = ''
        return
      }

      for (const message of gameStore.messages.slice(messageStart)) {
        message.onlineRequestId = requestId
        message.onlineRequestEventId = requestEventId
      }
      gameStore.saveCurrentSession?.()
      const runtimePatch = buildOnlineRuntimePatch(gameStore.getRuntimeSnapshot?.() || {})
      onlineSession.adapter.submitHostCompletion({
        requestId,
        requestEventId,
        actionText,
        assistantMessage: {
          role: 'assistant',
          name: generated.name || '',
          content: generated.content,
          timestamp: generated.timestamp || Date.now()
        },
        createdAt: Date.now()
      })
      onlineSession.adapter.submitAcceptedRuntimePatch(runtimePatch, { requestId })
      activeOnlineNarrativeRequestId.value = ''
      lastSubmittedOnlineStatusKey = ''
    } catch (error) {
      const message = String(error?.message || '联机叙事生成失败').trim()
      onlineSession.adapter.submitHostStatus?.({
        requestId,
        phase: 'error',
        code: String(error?.code || 'NARRATIVE_AGENT_FAILED'),
        message,
        at: Date.now()
      })
      onlineRequestIds.delete(requestId)
      activeOnlineNarrativeRequestId.value = ''
      lastSubmittedOnlineStatusKey = ''
    }
  }

  function disposeOnlineSession() {
    onlineUnsubscribers.forEach((unsubscribe) => unsubscribe?.())
    onlineUnsubscribers = []
  }

  return {
    showSessionPicker,
    onlineNarrativeStatus,
    visibleNarrativeAgentStatus,
    bindOnlineSession,
    handleOnlineNarrativeRequested,
    disposeOnlineSession,
    isStarting,
    selectedWorldbookId,
    sessionPickerWorldbookId,
    bootstrapSessions,
    handleSessionSelect,
    handleSessionCreate,
    handleSessionDelete
  }
}
