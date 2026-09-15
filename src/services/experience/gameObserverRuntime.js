// Authoring observer 的订阅与回执 hub（B7）：结果监听注册、派发、异常隔离、
// 事件/派生/例外缓冲、文档序列与最近 revision 的唯一 owner。
// 订阅寿命合同：页面在挂载期 subscribe、卸载时调用返回的 unsubscribe；
// 会话切换（resetAuthoringObserverRuntime）清理缓冲并取消待执行派生，
// 但不偷删页面仍持有的订阅。单个监听器异常只计数隔离，不阻断其他消费者，
// 也不吞掉任何正式保存失败（观察器输出只进低优先级 derived state）。

const MAX_EVENT_ITEMS = 50
const MAX_DERIVED_ITEMS = 200
const MAX_TRIGGER_ITEMS = 100
const MAX_EXCEPTION_ITEMS = 50

export function createAuthoringObserverHub() {
  const listeners = new Set()
  const events = []
  const derived = []
  const exceptions = []
  const triggerEvents = []
  const lastDocumentRevisions = new Map()
  let listenerErrorCount = 0
  let documentSequence = 0
  let memoryAgentEnabled = true
  // 记忆项目标识真源：页面选书时同步；未同步时回退 active worldbook。
  let activeProjectId = ''

  return {
    // —— 结果监听 ——
    subscribe(listener) {
      if (typeof listener !== 'function') return () => {}
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    subscriptionCount() {
      return listeners.size
    },
    dispatch(settled) {
      for (const listener of [...listeners]) {
        try {
          listener(settled)
        } catch {
          listenerErrorCount += 1
        }
      }
    },
    listenerErrorCount() {
      return listenerErrorCount
    },

    // —— 事件与缓冲 ——
    recordEvent(delta) {
      events.push({ ...delta, scheduledAt: Date.now() })
      if (events.length > MAX_EVENT_ITEMS) events.shift()
    },
    recordResult(settled) {
      if (settled?.status && settled.status !== 'completed') return
      const result = settled?.result || settled
      const target = settled?.target || result?.target || {}
      for (const exception of result?.exceptions || []) {
        exceptions.push({
          id: String(exception.observationId || `exception-${Date.now().toString(36)}`),
          reason: String(exception.reason || ''),
          summary: String(exception.text || ''),
          documentId: String(target.documentId || ''),
          documentRevision: String(result.documentRevision || ''),
          recordedAt: Date.now()
        })
      }
      if (exceptions.length > MAX_EXCEPTION_ITEMS) {
        exceptions.splice(0, exceptions.length - MAX_EXCEPTION_ITEMS)
      }
    },
    pushDerived(observation) {
      derived.push(observation)
      if (derived.length > MAX_DERIVED_ITEMS) {
        derived.splice(0, derived.length - MAX_DERIVED_ITEMS)
      }
    },
    pushTriggerEvent(payload) {
      triggerEvents.push(payload)
      if (triggerEvents.length > MAX_TRIGGER_ITEMS) {
        triggerEvents.splice(0, triggerEvents.length - MAX_TRIGGER_ITEMS)
      }
    },
    getEvents() {
      return events.map((event) => ({ ...event }))
    },
    getExceptions() {
      return exceptions.map((exception) => ({ ...exception }))
    },
    getDerived() {
      return derived.map((item) => ({ ...item }))
    },
    getTriggerEvents() {
      return triggerEvents.map((event) => ({ ...event }))
    },
    triggerEventCount() {
      return triggerEvents.length
    },

    // —— 文档序列与最近 revision ——
    nextDocumentSequence() {
      documentSequence += 1
      return documentSequence
    },
    getLastDocumentRevision(documentId) {
      return lastDocumentRevisions.get(documentId) || ''
    },
    setLastDocumentRevision(documentId, revision) {
      lastDocumentRevisions.set(documentId, revision)
    },

    // —— 记忆配置 ——
    isAgentEnabled() {
      return memoryAgentEnabled
    },
    setAgentEnabled(value) {
      memoryAgentEnabled = !!value
    },
    getActiveProjectId() {
      return activeProjectId
    },
    setActiveProjectId(projectId) {
      activeProjectId = String(projectId || '').trim()
    },

    // 会话切换/重置：清缓冲与 revision 镜像；订阅与配置保留（页面合同）。
    clearBuffers() {
      events.length = 0
      derived.length = 0
      exceptions.length = 0
      triggerEvents.length = 0
      lastDocumentRevisions.clear()
    }
  }
}
