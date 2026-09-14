import { computed, nextTick, ref, shallowRef, watch } from 'vue'
import { requestAdvisorTask } from '../services/advisorTaskService.js'
import {
  createAuthoringReviewBatchContext,
  createAuthoringReviewSession,
  getAuthoringReviewWorldbookRevision,
  ignoreAuthoringReviewFinding,
  markAuthoringReviewFindingsApplied,
  mergeAuthoringReviewFindings,
  prepareAuthoringReviewTransaction,
  rebaseAuthoringReviewSessionAfterTransaction,
  reconcileAuthoringReviewSession
} from '../services/agents/authoring/authoringReviewSession.js'

export function useAuthoringReviewWorkflow(host) {
  const loading = ref(false)
  const error = ref('')
  const status = ref('')
  const completedBatches = ref(0)
  const totalBatches = ref(0)
  const panelOpen = ref(false)
  const session = shallowRef(null)
  const invocation = shallowRef(null)
  const undoReceipt = shallowRef(null)
  const documentTitle = computed(() => invocation.value?.title || host.currentTitle())
  const findings = computed(() => Array.isArray(session.value?.findings) ? session.value.findings : [])
  const undoAvailable = computed(() => Boolean(undoReceipt.value))
  let abortController = null
  let preparedSource = null
  let returnSurface = null
  let changedSurface = false

  function freeze(source, surface) {
    preparedSource = source
    returnSurface = surface
    changedSurface = false
  }

  function sourceIdentity(source) {
    source ||= {}
    return [source.projectId, source.pane, source.documentRole, source.documentId, source.documentRevision]
      .map((value) => String(value || ''))
      .join('|')
  }

  function open() {
    const source = preparedSource || host.captureSource()
    preparedSource = null
    if (!source?.document || !['manuscript', 'exploration'].includes(source.documentRole)) {
      host.notify('请先把活动窗口切到正文或速记')
      return false
    }
    host.closeOtherPanel()
    host.hideTransientTools()
    if (!returnSurface) returnSurface = host.captureSurface()
    const changedTarget = sourceIdentity(invocation.value) !== sourceIdentity(source)
    invocation.value = source
    panelOpen.value = true
    if (changedTarget) {
      session.value = null
      undoReceipt.value = null
      error.value = ''
      status.value = ''
    }
    if (!session.value && !loading.value) nextTick(run)
    return true
  }

  function close({ restore = true } = {}) {
    cancel()
    panelOpen.value = false
    preparedSource = null
    const surface = returnSurface
    returnSurface = null
    if (restore && !changedSurface && surface) nextTick(() => host.restoreSurface(surface))
  }

  function liveSource() {
    if (!invocation.value) return null
    const live = host.captureLiveSource(invocation.value)
    if (!live) return null
    const scene = live.sceneProjection || host.sceneProjection()
    const entries = live.worldbookEntries || host.worldbookEntries()
    const sourceRevisions = {}
    for (const evidence of session.value?.evidence || []) {
      if (evidence.kind === 'scene') {
        sourceRevisions[evidence.sourceRef] = String(scene?.projectionFingerprint || scene?.revision || scene?.updatedAt || '')
      } else if (evidence.kind === 'worldbook') {
        const entryId = String(evidence.sourceRef || '').replace(/^worldbook-entry:/, '')
        const entry = entries.find((item) => String(item?.id || '') === entryId)
        sourceRevisions[evidence.sourceRef] = entry ? getAuthoringReviewWorldbookRevision(entry) : ''
      }
    }
    return { ...live, sceneProjection: scene, worldbookEntries: entries, sourceRevisions }
  }

  function reconcile() {
    const live = liveSource()
    const next = reconcileAuthoringReviewSession(session.value, live ? { source: live, sourceRevisions: live.sourceRevisions } : {})
    if (!next) return
    session.value = next
    if (next.status === 'stale' || next.status === 'detached') {
      undoReceipt.value = null
      status.value = '正文或引用资料已变化；旧结果保留查看，但不能采用。'
    }
  }

  async function run() {
    if (loading.value) return
    const source = invocation.value || host.captureSource()
    if (!source?.document) {
      error.value = '当前活动窗口没有可校对的正文。'
      return
    }
    invocation.value = source
    const initial = createAuthoringReviewSession({
      source,
      sceneProjection: source.sceneProjection || host.sceneProjection(),
      worldbookEntries: source.worldbookEntries || host.worldbookEntries(),
      maxNodesPerWindow: 6,
      windowOverlap: 1
    })
    if (!initial) {
      error.value = '当前文稿没有可校对的正文片段。'
      status.value = ''
      return
    }
    abortController?.abort()
    const controller = new AbortController()
    abortController = controller
    loading.value = true
    error.value = ''
    status.value = ''
    completedBatches.value = 0
    totalBatches.value = initial.windows.length
    undoReceipt.value = null
    const completed = []
    let failed = 0
    let stale = false
    session.value = mergeAuthoringReviewFindings(initial, completed)
    try {
      for (let index = 0; index < initial.windows.length; index += 1) {
        if (controller.signal.aborted) break
        const window = initial.windows[index]
        const batch = createAuthoringReviewBatchContext(initial, window.id)
        if (!batch) continue
        try {
          const taskResult = await requestAdvisorTask({
            context: {
              chapterTitle: source.title,
              reviewBlocks: batch.reviewBlocks,
              evidence: batch.evidence,
              allowedEvidenceRefs: batch.allowedEvidenceRefs
            },
            question: '校对这批正文，只返回能精确定位的问题。确定且唯一的修法给出 replacement；不确定时只说明问题。检查错别字、标点与引号、重复、病句、称谓、时间、数值和当前场冲突，不做发布审核。',
            scope: source.documentRole === 'exploration' ? 'selection' : 'chapter',
            taskType: 'writing.chapter.health',
            target: batch.target,
            options: {
              projectId: source.projectId,
              chapterId: source.chapterId,
              documentId: source.documentId,
              documentRole: source.documentRole,
              documentRevision: source.documentRevision,
              chapterReview: true,
              reviewBlocks: batch.reviewBlocks,
              allowedEvidenceRefs: batch.allowedEvidenceRefs
            },
            signal: controller.signal
          })
          completed.push({ windowId: window.id, findings: taskResult.result?.findings || [] })
          session.value = mergeAuthoringReviewFindings(initial, completed)
          const current = liveSource()
          const checked = reconcileAuthoringReviewSession(session.value, current ? { source: current, sourceRevisions: current.sourceRevisions } : {})
          if (checked?.status === 'stale' || checked?.status === 'detached') {
            session.value = checked
            stale = true
            controller.abort()
            break
          }
        } catch (taskError) {
          if (controller.signal.aborted || taskError?.code === 'AGENT_REQUEST_ABORTED') break
          failed += 1
        } finally {
          completedBatches.value = index + 1
        }
      }
      const count = session.value?.findings?.length || 0
      if (stale) error.value = '校对期间文稿或引用资料发生变化；结果已保留为过期建议，不能采用。'
      else if (controller.signal.aborted) status.value = count ? `已停止，保留 ${count} 条只读结果。` : '校对已停止。'
      else if (failed) error.value = count
        ? `已完成 ${initial.windows.length - failed}/${initial.windows.length} 批，保留 ${count} 条结果。`
        : `${failed} 批校对失败，没有写入正文。`
      else status.value = count ? `校对完成 · ${count} 条结果` : '校对完成，没有发现明确问题。'
    } finally {
      loading.value = false
      if (abortController === controller) abortController = null
    }
  }

  function cancel() {
    abortController?.abort()
  }

  async function jump(finding) {
    if (!finding?.target || !invocation.value) return false
    changedSurface = true
    return host.navigateToFinding(invocation.value, finding.target)
  }

  function applySelected(ids = []) {
    if (host.historyLocked() || !session.value) return false
    const source = invocation.value
    const live = liveSource()
    const before = session.value
    const transaction = prepareAuthoringReviewTransaction(session.value, ids, live ? { source: live, sourceRevisions: live.sourceRevisions } : {})
    if (!transaction.ok) {
      reconcile()
      error.value = transaction.reason.includes('detached')
        ? '原文位置已经失效；仍可查看建议，但不能采用。'
        : '正文或引用资料已经变化，请重新校对后再采用。'
      return false
    }
    if (!host.protectBatch(source, live, transaction)) {
      error.value = '无法保存批量采用前版本，正文没有变化。'
      return false
    }
    if (!host.applyPatches(source, transaction.patches)) {
      error.value = '编辑器没有接受这次修改，正文未变化。'
      return false
    }
    changedSurface = true
    const after = liveSource()
    const applied = markAuthoringReviewFindingsApplied(before, transaction.receipt.findingIds)
    session.value = rebaseAuthoringReviewSessionAfterTransaction(
      applied, transaction, after ? { source: after, sourceRevisions: after.sourceRevisions } : {}
    ) || applied
    undoReceipt.value = Object.freeze({
      ...transaction.receipt,
      pane: source.pane,
      afterDocumentRevision: after?.documentRevision || '',
      findingIds: Object.freeze([...transaction.receipt.findingIds]),
      sessionBefore: before
    })
    error.value = ''
    status.value = transaction.patches.length > 1
      ? `已一次采用 ${transaction.patches.length} 条，可撤销一次恢复。`
      : '已采用，可撤销。'
    return true
  }

  function applyOne(finding) {
    return applySelected(finding?.id ? [finding.id] : [])
  }

  function ignore(finding) {
    if (finding?.id && session.value) session.value = ignoreAuthoringReviewFinding(session.value, finding.id)
  }

  function undo() {
    const receipt = undoReceipt.value
    const live = liveSource()
    if (!receipt || !session.value) return false
    if (!live || String(live.documentRevision || '') !== String(receipt.afterDocumentRevision || '')) {
      error.value = '采用后正文又有修改，不能越过新修改撤销校对。'
      undoReceipt.value = null
      return false
    }
    if (!host.undoPatches(receipt)) return false
    session.value = receipt.sessionBefore
    undoReceipt.value = null
    nextTick(reconcile)
    status.value = '已撤销本次采用。'
    return true
  }

  watch(host.reconcileSources, () => {
    if (!panelOpen.value || loading.value || !session.value) return
    nextTick(reconcile)
  }, { flush: 'post' })

  return {
    loading, error, status, completedBatches, totalBatches, panelOpen, session,
    invocation, undoReceipt, documentTitle, findings, undoAvailable,
    freeze, open, close, run, cancel, jump, applyOne, applySelected, ignore, undo, reconcile
  }
}
