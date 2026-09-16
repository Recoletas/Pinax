import { computed, defineAsyncComponent, nextTick, ref, shallowRef } from 'vue'

function emptyState(enabled) {
  return {
    enabled,
    role: null,
    connectionState: enabled ? 'idle' : 'disabled',
    stale: false,
    error: null,
    room: null,
    members: [],
    invite: null,
    artifacts: {},
    proposals: [],
    votes: {},
    generation: { requests: {} },
    promotions: {}
  }
}

export function useAuthoringCollaborationWorkflow(host) {
  const enabled = host.enabled === true
  const ReviewSurface = enabled
    ? defineAsyncComponent(() => import('../components/collaboration/RehearsalReviewSurface.vue'))
    : null
  const state = shallowRef(emptyState(enabled))
  const busy = ref('')
  const error = ref('')
  const promotion = shallowRef(null)
  const active = computed(() => Boolean(state.value.room?.roomId))
  let controller = null
  let unsubscribe = null
  let returnFocus = null
  let bridgeModule = null
  let roomModule = null

  function dispose() {
    unsubscribe?.()
    unsubscribe = null
    controller?.destroy()
    controller = null
  }

  function open(payload = {}) {
    if (typeof payload?.returnFocus?.focus === 'function') returnFocus = payload.returnFocus
    host.openInspector()
  }

  function closeInspector() {
    const restore = host.isInspectorActive()
    host.closeInspector()
    if (!restore) return
    const target = returnFocus
    nextTick(() => target?.isConnected && target.focus({ preventScroll: true }))
  }

  async function start(payload = {}) {
    if (!enabled || busy.value || !host.canStart()) return false
    if (active.value) { open(payload); return true }
    if (typeof payload?.returnFocus?.focus === 'function') returnFocus = payload.returnFocus
    busy.value = 'create-room'
    error.value = ''
    try {
      [bridgeModule, roomModule] = await Promise.all([
        import('../services/collaboration/authoringRehearsalBridge.js'),
        import('../services/collaboration/authoringRehearsalRoom.js')
      ])
    } catch {
      busy.value = ''
      error.value = '共同排演模块加载失败，请重试。'
      return false
    }
    const session = host.session()
    const liveReader = bridgeModule.createAuthoringRehearsalLiveReader({
      readTarget: host.readTarget,
      readEvidence: async (locator) => {
        const sourceRef = host.sourceRef(locator)
        if (!sourceRef) return null
        const reconciled = await host.reconcileEvidence(session)
        return bridgeModule.resolveAuthoringRehearsalEvidenceAfterReconciliation({ reconciled, locator, sourceRef }) || null
      }
    })
    const registry = bridgeModule.createAuthoringRehearsalHostRegistry({ runRehearsal: host.runRehearsal(), liveReader })
    const registered = registry.registerSource({ session, scope: host.scope().scope })
    if (!registered.ok) {
      busy.value = ''
      error.value = '当前排演范围无法安全分享，请重新核对。'
      return false
    }
    dispose()
    controller = roomModule.createAuthoringRehearsalRoomController({ enabled: true, registry })
    state.value = { ...controller.state }
    unsubscribe = controller.subscribe((value) => {
      state.value = value
      if (value.connectionState === 'connected') void flushPromotionReceipt()
    })
    const result = await controller.createHostRoom({
      sourceHandle: registered.sourceHandle,
      roomSlug: `rehearsal-${Date.now().toString(36)}`,
      displayName: '作者'
    })
    busy.value = ''
    if (!result.ok) {
      error.value = result.reason || '共同排演房间创建失败'
      dispose()
      return false
    }
    open(payload)
    return true
  }

  async function run(action, task) {
    if (!controller || busy.value) return null
    busy.value = action
    error.value = ''
    try {
      const result = await task(controller)
      if (!result?.ok) error.value = result?.reason || '协作操作未完成'
      return result
    } finally { busy.value = '' }
  }

  const propose = (payload) => run('proposal', (owner) => owner.proposeDirection(payload))
  const vote = (payload) => run(`vote:${payload.proposalId}`, (owner) => owner.castVote(payload))
  const generate = (proposalId) => run(`generation:${proposalId}`, (owner) => owner.selectAndGenerate({ proposalId }))

  async function promote({ proposalId, generationRequestId } = {}) {
    const prepared = await run(`promotion:${proposalId}`, (owner) => owner.preparePromotion({ proposalId, generationRequestId }))
    if (!prepared?.ok) return false
    const request = state.value.promotions?.[proposalId]
    const artifact = state.value.generation?.requests?.[generationRequestId]?.artifact
    promotion.value = {
      proposalId,
      artifactFingerprint: request?.artifactFingerprint || artifact?.fingerprint || '',
      pendingReceipt: null,
      reported: false
    }
    await host.applyPromotion(prepared)
    return true
  }

  async function flushPromotionReceipt() {
    const owner = promotion.value
    if (!owner?.pendingReceipt || owner.reported || !controller || state.value.connectionState !== 'connected') return false
    const result = await controller.reportPromotionStatus({
      proposalId: owner.proposalId,
      artifactFingerprint: owner.artifactFingerprint,
      status: 'adopted',
      receipt: owner.pendingReceipt
    })
    if (!result?.ok) return false
    const settled = roomModule?.settleAuthoringRehearsalPromotionReceipt({ current: promotion.value, owner, result })
    if (settled === promotion.value) return false
    promotion.value = settled
    return true
  }

  function queueAdoptionReceipt(targetCount = 1) {
    const owner = promotion.value
    if (!owner || owner.reported || owner.pendingReceipt) return
    promotion.value = { ...owner, pendingReceipt: { code: 'adopted', targetCount: Math.max(1, Number(targetCount) || 1) } }
    void flushPromotionReceipt()
  }

  async function copyInvite() {
    const url = state.value.invite?.url
    if (!url) return false
    try {
      await navigator.clipboard.writeText(url)
      host.notify('共同排演邀请已复制')
      return true
    } catch {
      error.value = '浏览器未授权复制，请选中页面中的邀请链接复制。'
      return false
    }
  }

  function leave() {
    controller?.disconnect()
    dispose()
    state.value = { ...emptyState(enabled), connectionState: 'closed' }
    promotion.value = null
    host.leaveInspector()
    const target = returnFocus
    returnFocus = null
    nextTick(() => target?.isConnected && target.focus({ preventScroll: true }))
  }

  return {
    enabled,
    ReviewSurface,
    state,
    busy,
    error,
    promotion,
    active,
    open,
    closeInspector,
    start,
    propose,
    vote,
    generate,
    promote,
    queueAdoptionReceipt,
    copyInvite,
    leave,
    dispose,
    reset: leave
  }
}
