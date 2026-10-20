import { computed, effectScope, onScopeDispose, shallowReactive, shallowRef, unref, watch } from 'vue'
import { createAuthoringKnowledgeAssistant } from './useAuthoringKnowledgeAssistant.js'

const value = input => typeof input === 'function' ? input() : unref(input)

// The shell retains conversation/request owners. Editor capabilities are leases,
// released on page disposal; a task captures its engine before the first await.
export function createWorkspaceAssistantSessions({ scope, registerTaskAdapter, openAssistant } = {}) {
  const records = shallowReactive(new Map())
  let disposed = false
  function getRecord(projectId, options) {
    if (records.has(projectId)) return records.get(projectId)
    const lifetime = effectScope(true)
    const binding = shallowRef(null)
    const revision = shallowRef(0)
    const currentEngine = () => binding.value?.options.agentEngine
    const engine = options.agentEngine ? new Proxy({}, {
      get(_, key) {
        if (key === 'capture') return () => currentEngine()
        if (key === 'ensureEditorAuthorization') return async (permission, sessionId) => {
          const snapshot = binding.value
          const active = currentEngine()
          if (!snapshot || !active) throw new Error('请返回正文后采用修改。')
          const prepared = typeof active.permissionContext === 'function' ? active.permissionContext() : active.prepare({ text: '', bookId: projectId })
          await active.authorize?.(permission, sessionId, prepared)
          if (binding.value !== snapshot) throw new Error('编辑位置已变化，修改未应用。')
        }
        const active = currentEngine()
        const method = active?.[key]
        return typeof method === 'function' ? method.bind(active) : method
      }
    }) : null
    const input = key => value(binding.value?.options[key])
    const controller = lifetime.run(() => createAuthoringKnowledgeAssistant({
      ...options,
      projectId,
      agentEngine: engine,
      editorAttached: () => Boolean(binding.value),
      attachmentRevision: () => revision.value,
      target: () => input('target'),
      sceneProjection: () => input('sceneProjection'),
      revisionSignal: computed(() => input('revisionSignal')),
      resolveLiveSource: request => {
        const resolve = binding.value?.options.resolveLiveSource
        return typeof resolve === 'function' ? resolve(request) : value(resolve)
      },
      onReviewProposal: change => binding.value?.options.onReviewProposal?.(change)
    }))
    const record = { projectId, binding, revision, controller, lifetime, release: null }
    record.release = registerTaskAdapter?.(`assistant:${projectId}`, {
      summary: () => scope.value.bookId === projectId && controller.busy.value
        ? { id: controller.agentState.value.taskId || '', projectId, label: '助手运行中', status: 'running' } : null,
      open: () => reveal(projectId)
    })
    records.set(projectId, record)
    // Persisted conversations remain in their repository, not in this cache.
    for (const [id, old] of records) {
      if (records.size <= 8) break
      if (!old.binding.value && !old.controller.busy.value && !old.controller.agentState.value.adoptionBusy) {
        old.release?.(); old.lifetime.stop(); records.delete(id)
      }
    }
    return record
  }
  function attach(options) {
    const active = shallowRef(null)
    let lease = null
    function detach() {
      const record = active.value
      if (record?.binding.value === lease) {
        record.controller.closeProposal()
        record.binding.value = null
        record.revision.value++
        if (!record.controller.busy.value) lease.options.agentEngine?.revokePermission?.()
      }
      lease = null
    }
    watch(() => String(value(options.projectId) || ''), id => {
      detach()
      if (disposed) { active.value = null; return }
      const record = getRecord(id, options)
      lease = { options }
      record.binding.value = lease
      record.revision.value++
      active.value = record
    }, { immediate: true, flush: 'sync' })
    onScopeDispose(detach)
    return new Proxy({}, {
      get(_, key) {
        if (key === 'backgroundCapable') return true
        return active.value?.controller[key]
      }
    })
  }
  function reveal(projectId) {
    const record = records.get(projectId)
    const last = record?.controller.messages.value.findLast(message => message.kind === 'agent')
    return openAssistant?.({ bookId: projectId, chapterId: last?.chapterId || '' })
  }
  const summary = computed(() => {
    const record = records.get(scope.value.bookId)
    if (!record) return null
    const controller = record.controller
    if (!controller.busy.value && (record.binding.value || !controller.hasUnread.value)) return null
    return { projectId: record.projectId, status: controller.busy.value ? 'running' : 'completed', label: controller.busy.value ? '助手运行中' : '助手有新结果', open: () => reveal(record.projectId) }
  })
  function canLeave(to) {
    for (const record of records.values()) {
      if (record.controller.agentState.value.adoptionBusy) return false
      if (record.controller.busy.value && to?.query?.bookId !== record.projectId) return false
    }
    return true
  }
  function dispose() {
    disposed = true
    for (const record of records.values()) { record.release?.(); record.lifetime.stop() }
    records.clear()
  }
  return { attach, summary, canLeave, dispose }
}
