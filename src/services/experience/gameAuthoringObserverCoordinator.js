import { useWorldStore } from '../../stores/worldStore.js'
import { createLegacyExperienceStateBridge } from '../agents/authoring/legacyExperienceStateBridge.js'
import { createAuthoringObserverScheduler } from '../agents/observers/authoringObserverScheduler.js'
import { createAuthoringObserverRunner } from '../agents/observers/authoringObserverDerivation.js'
import { normalizeAuthoringObserverProvenance } from '../agents/observers/authoringObservationContract.js'
import { createMemoryTriggers } from '../memory/memoryTriggers.js'
import { invalidateMemoryBySource } from '../memory/memoryCandidates.js'
import { createAuthoringObserverHub } from './gameObserverRuntime.js'

let authoringObserverBridge = null
let authoringObserverScheduler = null
let authoringMemoryTriggers = null
const authoringObserverHub = createAuthoringObserverHub()

function resolveActiveWorldbookId() {
  try { return useWorldStore().activeWorldbook?.id || null } catch { return null }
}

// One owner for observer scheduling, memory triggers, cancellation and result subscriptions.
export const gameAuthoringObserverActions = {
// Authoring runtime：惰性创建正文→观察器 bridge（模块级单例，非持久化）。
ensureAuthoringObserverRuntime() {
  if (authoringObserverBridge) return authoringObserverBridge
  authoringObserverScheduler = createAuthoringObserverScheduler({
    // 每次重算先让同一稳定 writing unit 的旧派生失效。只处理 unit
    // 来源；chapter/turn 等宽来源不能因改一段正文而整批作废。
    invalidate: async (delta) => {
      const unitRefs = [...new Set((delta.sourceRefs || []).filter((ref) => (
        String(ref || '').startsWith('unit:')
      )))]
      for (const sourceRef of unitRefs) {
        invalidateMemoryBySource({
          sourceRef,
          currentRevision: delta.sourceDocumentRevision || delta.documentRevision || '',
          reason: 'prose-unit-revised'
        })
      }
    },
    // 真实派生：编辑空闲后对文档 delta 执行五个 observer derive workflow；
    // 常规结果写入 derived-state，typed exception 分离进入审阅队列。
    run: async (delta, execution) => {
      const runner = createAuthoringObserverRunner({
        // 候选项目归属优先用 delta 携带的 memoryProjectId（Authoring 书 ID），
        // 否则回退 active worldbook，保证写入口径与召回口径一致。
        memoryTarget: (delta) => ({
          projectId: String(delta?.memoryProjectId || '').trim() || authoringObserverHub.getActiveProjectId() || resolveActiveWorldbookId() || ''
        }),
        applyDerived: async (routine, meta) => {
          const provenance = meta?.provenance || {}
          for (const observation of routine) {
            const observationRefs = Array.isArray(observation.sourceRefs) ? observation.sourceRefs : []
            const sourceRefs = observationRefs.length && observationRefs[0] !== 'document-delta'
              ? observationRefs
              : (Array.isArray(provenance.sourceRefs) ? provenance.sourceRefs : [])
            const finalProvenance = normalizeAuthoringObserverProvenance({
              ...provenance,
              sourceRefs,
              target: meta?.target || provenance.target
            }, meta?.target || provenance.target)
            authoringObserverHub.pushDerived({
              ...observation,
              schemaVersion: finalProvenance.schemaVersion,
              derivedAt: finalProvenance.derivedAt,
              documentId: finalProvenance.documentId,
              target: finalProvenance.target,
              provenance: finalProvenance,
              baseRevision: String(meta?.baseRevision || ''),
              projectId: finalProvenance.projectId,
              chapterId: finalProvenance.chapterId,
              unitId: finalProvenance.unitId,
              unitRevision: finalProvenance.unitRevision,
              documentRevision: finalProvenance.documentRevision,
              sourceRefs,
              status: observation.status === 'candidate' ? 'candidate' : 'applied'
            })
          }
          return { count: routine.length }
        },
        onException: null
      })
      return runner.run(delta, execution)
    },
    onSettled: (settled) => {
      authoringObserverHub.recordResult(settled)
      authoringObserverHub.dispatch(settled)
    }
  })
  authoringObserverBridge = createLegacyExperienceStateBridge({
    insertText: async ({ text, observerContext }) => {
      // 正文已由回合事务提交；此处只生成确定性 document receipt 供观察器对齐版本。
      const documentSequence = authoringObserverHub.nextDocumentSequence()
      return {
        revision: `${observerContext?.documentId || this.currentSessionId || 'session'}:doc-r${documentSequence}`,
        chars: String(text || '').length
      }
    },
    scheduleObservers: (delta) => {
      authoringObserverHub.recordEvent(delta)
      // Agent-off gate：关闭后不做自动派生调度。
      if (!authoringObserverHub.isAgentEnabled()) return { accepted: false, reason: 'agent-disabled' }
      authoringObserverHub.pushTriggerEvent({
        type: 'prose-commit',
        projectId: String(delta.memoryProjectId || '').trim() || authoringObserverHub.getActiveProjectId(),
        sessionId: this.currentSessionId || '',
        sourceRefs: delta.sourceRefs || [],
        revision: delta.documentRevision || '',
        emittedAt: Date.now()
      })
      return authoringObserverScheduler.scheduleObservers({
        ...delta,
        // 同章不同单元各自排队；同一单元的新 revision 则替换旧任务，
        // 让空闲观察只派生最终文本，而不是按键过程中每版都写候选。
        scheduleKey: delta.unitId
          ? `${delta.documentId || this.currentSessionId || 'session'}:unit:${delta.unitId}`
          : String(delta.documentId || this.currentSessionId || 'session')
      })
    }
  })
  return authoringObserverBridge
},

// 受控记忆触发边界：prose-commit 只在正文持久化成功后发射；undo 发射失效。
ensureAuthoringMemoryTriggers() {
  if (authoringMemoryTriggers) return authoringMemoryTriggers
  authoringMemoryTriggers = createMemoryTriggers({
    // derive 真正生成候选：经 observer scheduler → runner(memoryTarget) 队列化。
    derive: async (payload) => {
      authoringObserverHub.pushTriggerEvent({ ...payload, emittedAt: Date.now() })
      if (!authoringObserverScheduler || !payload.text) {
        return { accepted: false, reason: !payload.text ? 'empty-text' : 'observer-unavailable' }
      }
      // boundary 使用独立调度键：避免与紧随其后的 prose-commit 因同 key 合并而互相取消。
      const documentId = payload.type === 'boundary'
        ? `${payload.sessionId || 'authoring'}:boundary:${payload.scopeKey || 'unknown'}`
        : (payload.sessionId || 'authoring')
      return authoringObserverScheduler.scheduleObservers({
        documentId,
        scheduleKey: documentId,
        documentRevision: payload.revision,
        text: payload.text,
        changedText: payload.changedText,
        changedRanges: payload.changedRanges,
        sourceRefs: payload.sourceRefs,
        memoryProjectId: payload.projectId,
        chapterId: payload.chapterId,
        unitId: payload.unitId,
        unitRevision: payload.unitRevision,
        sourceDocumentRevision: payload.sourceDocumentRevision
      })
    },
    invalidate: async (payload) => {
      for (const sourceRef of payload.sourceRefs || []) {
        invalidateMemoryBySource({ sourceRef, currentRevision: payload.revision, reason: payload.reason })
      }
      authoringObserverHub.pushTriggerEvent({ ...payload, type: 'invalidation', emittedAt: Date.now() })
    },
    isAgentEnabled: () => authoringObserverHub.isAgentEnabled()
  })
  return authoringMemoryTriggers
},

setAuthoringProjectId(projectId) {
  const next = String(projectId || '').trim()
  if (authoringObserverHub.getActiveProjectId() === next) return
  authoringObserverHub.setActiveProjectId(next)
  // B13：换书即换作用域——取消旧项目作用域的待执行派生并清空观察器
  // 缓冲/来源镜像，与页面 dismissAuxiliary 的失效合同一致；订阅保留
  //（页面仍挂载）。bridge 未创建时无可取消任务。
  authoringObserverScheduler?.cancelAll()
  authoringObserverHub.clearBuffers()
},

setAuthoringMemoryAgentEnabled(value) {
  authoringObserverHub.setAgentEnabled(value !== false)
},

resolveAuthoringMemoryProjectId() {
  return authoringObserverHub.getActiveProjectId() || resolveActiveWorldbookId() || ''
},

// 显式“记住”：provider 不可用也创建本地 pending 候选。
async rememberAuthoringSelection({ content = '', sourceRefs = [], sourceRevision = '', confirm = false, projectId = '' } = {}) {
  const trimmed = String(content || '').trim()
  if (!trimmed) return { success: false, skipped: true, reason: 'empty-content' }
  const triggers = this.ensureAuthoringMemoryTriggers()
  const result = await triggers.rememberExplicitly({
    content: trimmed,
    projectId: String(projectId || '').trim() || this.resolveAuthoringMemoryProjectId(),
    sessionId: this.currentSessionId || '',
    sourceRefs: Array.isArray(sourceRefs) && sourceRefs.length ? sourceRefs : [`user-action:remember:${Date.now()}`],
    sourceRevision,
    confirm
  })
  return result
},

// Authoring 页面正文事务提交：调度一次有界观察派生（真正产出记忆候选）并记录 prose-commit 事件。
noteAuthoringTextCommit({ text = '', changedText = undefined, changedRanges = undefined, sourceRefs = [], revision = '', memoryProjectId = '', sessionId = '' } = {}) {
  const contentText = String(text || '')
  if (!contentText.trim()) return { accepted: false, reason: 'empty-text' }
  // Agent-off gate：关闭后不做自动记忆派生（显式“记住”仍可本地建候选）。
  if (!authoringObserverHub.isAgentEnabled()) {
    return { accepted: false, reason: 'agent-disabled' }
  }
  const contentTextTrimmed = contentText
  // 仅显式传入项目时同步；空值不得触发换书取消/清缓冲语义（B13）
  if (String(memoryProjectId || '').trim()) this.setAuthoringProjectId(memoryProjectId)
  this.ensureAuthoringObserverRuntime()
  const memoryProjectIdResolved = String(memoryProjectId || '').trim() || this.resolveAuthoringMemoryProjectId()
  const result = authoringObserverScheduler.scheduleObservers({
    documentId: sessionId || this.currentSessionId || 'authoring',
    documentRevision: revision,
    text: contentTextTrimmed,
    changedText,
    changedRanges,
    sourceRefs,
    memoryProjectId: memoryProjectIdResolved
  })
  authoringObserverHub.pushTriggerEvent({
    type: 'prose-commit',
    projectId: memoryProjectIdResolved,
    sessionId: sessionId || this.currentSessionId || '',
    sourceRefs,
    revision,
    emittedAt: Date.now()
  })
  return result
},

// 章节/会话边界：对上一范围做一次去重后的有界派生，不重扫整个项目。
async noteAuthoringBoundary({ scopeKey = '', text = '', changedText = undefined, changedRanges = undefined, sourceRefs = [], revision = '', memoryProjectId = '', sessionId = '', chapterId = '', unitId = '', unitRevision = 0, sourceDocumentRevision = '' } = {}) {
  this.ensureAuthoringObserverRuntime()
  const triggers = this.ensureAuthoringMemoryTriggers()
  return triggers.handle({
    type: 'boundary',
    projectId: String(memoryProjectId || '').trim() || this.resolveAuthoringMemoryProjectId(),
    sessionId: sessionId || this.currentSessionId || '',
    scopeKey,
    text,
    changedText,
    changedRanges,
    sourceRefs,
    revision,
    chapterId,
    unitId,
    unitRevision,
    sourceDocumentRevision
  })
},

getAuthoringMemoryTriggerEvents() {
  return authoringObserverHub.getTriggerEvents()
},

// 每次可见正文提交后调用一次：先落正文 receipt，再调度派生观察器（顺序由 bridge 保证）。
async commitAuthoringProseResult({ text, sourceRefs = [], memoryProjectId = '', documentId = '', chapterId = '', unitId = '', unitRevision = 0, sourceDocumentRevision = '' } = {}) {
  const contentText = String(text || '')
  if (!contentText.trim()) return null
  try {
    if (String(memoryProjectId || '').trim()) this.setAuthoringProjectId(memoryProjectId)
    const bridge = this.ensureAuthoringObserverRuntime()
    const observerDocumentId = String(documentId || chapterId || this.currentSessionId || 'authoring')
    const receipt = await bridge.commitNarrativeResult({
      text: contentText,
      baseRevision: authoringObserverHub.getLastDocumentRevision(observerDocumentId),
      sourceRefs,
      // 派生候选的项目归属与召回口径保持一致。
      memoryProjectId: String(memoryProjectId || '').trim() || authoringObserverHub.getActiveProjectId(),
      observerContext: {
        documentId: observerDocumentId,
        chapterId: String(chapterId || ''),
        unitId: String(unitId || ''),
        unitRevision: Number(unitRevision || 0),
        sourceDocumentRevision: String(sourceDocumentRevision || '')
      }
    })
    authoringObserverHub.setLastDocumentRevision(observerDocumentId, receipt.revision)
    return receipt
  } catch {
    // 观察器调度失败绝不影响已提交的可见正文。
    return null
  }
},

async handleAuthoringProseUndo({ sourceRefs = [], revision = '', reason = 'prose-undo' } = {}) {
  await this.ensureAuthoringMemoryTriggers().invalidate({
    sourceRefs,
    revision,
    reason
  })
},

getAuthoringObserverEvents() {
  return authoringObserverHub.getEvents()
},

getAuthoringObserverExceptions() {
  return authoringObserverHub.getExceptions()
},

getAuthoringDerivedState() {
  return authoringObserverHub.getDerived()
},

subscribeAuthoringObserverResults(listener) {
  return authoringObserverHub.subscribe(listener)
},

resetAuthoringObserverRuntime() {
  // 取消全部待执行派生（含 boundary 独立键），避免切换/重置会话后旧任务继续执行。
  authoringObserverScheduler?.cancelAll()
  authoringObserverHub.clearBuffers()
},
}

