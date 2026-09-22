import { tr } from '../i18n/index.js'
import { freezeWritingLanguage, getBookLanguage } from '../services/writing/writingLanguagePolicy.js'
import { computed, nextTick, ref, shallowRef, watch } from 'vue'
import { requestAdvisorTask } from '../services/advisorTaskService.js'
import { validateWritingSkillInvocation } from '../../shared/writingSkillMethodContract.js'
import { loadAuthoringReviewRun, removeAuthoringReviewRun, saveAuthoringReviewRun } from '../services/agents/authoring/authoringReviewRunStore.js'
let {
  createAuthoringReviewBatchContext,
  createAuthoringReviewSession,
  buildAuthoringReviewCoverageReport,
  markAuthoringReviewBatchStatus,
  getAuthoringReviewWorldbookRevision,
  ignoreAuthoringReviewFinding,
  markAuthoringReviewFindingsApplied,
  mergeAuthoringReviewFindings,
  prepareAuthoringReviewTransaction,
  rebaseAuthoringReviewSessionAfterTransaction,
  reconcileAuthoringReviewSession
} = {}
let reviewEnginePromise
async function loadReviewEngine() {
  const engine = await (reviewEnginePromise ||= import('../services/agents/authoring/authoringReviewSession.js').catch((error) => { reviewEnginePromise = null; throw error }))
  ;({ createAuthoringReviewBatchContext, createAuthoringReviewSession, buildAuthoringReviewCoverageReport, markAuthoringReviewBatchStatus, getAuthoringReviewWorldbookRevision, ignoreAuthoringReviewFinding, markAuthoringReviewFindingsApplied, mergeAuthoringReviewFindings, prepareAuthoringReviewTransaction, rebaseAuthoringReviewSessionAfterTransaction, reconcileAuthoringReviewSession } = engine)
}

export function useAuthoringReviewWorkflow(host) {
  const goalMode = ref(false)
  const retryAvailable = ref(false)
  const saveRetryAvailable = ref(false)
  const resumeRecord = shallowRef(null)
  let retainedBatches = []
  let retainedInitial = null
  const loading = ref(false)
  const error = ref('')
  const status = ref('')
  const completedBatches = ref(0)
  const totalBatches = ref(0)
  const panelOpen = ref(false)
  const session = shallowRef(null)
  const languagePolicy = shallowRef(null)
  const invocation = shallowRef(null)
  const undoReceipt = shallowRef(null)
  const documentTitle = computed(() => invocation.value?.title || host.currentTitle())
  const findings = computed(() => (Array.isArray(session.value?.findings) ? session.value.findings : []).map(finding => {
    if (finding.source !== 'local' || languagePolicy.value?.assistantLanguage !== 'en') return finding
    const reasons = { repetition: 'Possible repetition. Check the quoted passage.', punctuation: 'Possible repeated punctuation. Check the quoted passage.', quote: 'Possible unbalanced quotation marks. Check the original passage.', grammar: 'Possible placeholder, repetition or incomplete sentence. This is a limited pattern check, not a grammar assessment.' }
    return { ...finding, reason: reasons[finding.issueType] || 'Check the quoted passage. Local checks do not cover every writing convention.' }
  }))
  const undoAvailable = computed(() => Boolean(undoReceipt.value))
  const coverage = computed(() => session.value ? buildAuthoringReviewCoverageReport(session.value) : null)
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

  function open(options = {}) {
    const source = preparedSource || host.captureSource()
    preparedSource = null
    if (!source?.document || !['manuscript', 'exploration'].includes(source.documentRole)) {
      host.notify(tr("请先把活动窗口切到正文或速记"))
      return false
    }
    host.closeOtherPanel()
    host.hideTransientTools()
    if (!returnSurface) returnSurface = host.captureSurface()
    const changedTarget = sourceIdentity(invocation.value) !== sourceIdentity(source) || goalMode.value !== (options.goalMode === true)
    invocation.value = source
    goalMode.value = options.goalMode === true
    panelOpen.value = true
    if (changedTarget) {
      cancel()
      session.value = null
      undoReceipt.value = null
      error.value = ''
      status.value = ''
      retainedInitial = null
      retainedBatches = []
      retryAvailable.value = false
      saveRetryAvailable.value = false
      resumeRecord.value = goalMode.value ? loadAuthoringReviewRun(source) : null
    }
    if (!session.value && !loading.value && !goalMode.value) nextTick(run)
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
    if (!session.value) return
    if (!languageStillCurrent()) {
      session.value = { ...session.value, status: 'stale', findings: session.value.findings.map(finding => finding.status === 'open' ? { ...finding, status: 'stale' } : finding) }
      return
    }
    const live = liveSource()
    const next = reconcileAuthoringReviewSession(session.value, live ? { source: live, sourceRevisions: live.sourceRevisions } : {})
    if (!next) return
    session.value = next
    if (next.status === 'stale' || next.status === 'detached') {
      if (!undoReceipt.value || String(live?.documentRevision || '') !== String(undoReceipt.value.afterDocumentRevision || '')) undoReceipt.value = null
      status.value = tr("正文或引用资料已变化；旧结果保留查看，但不能采用。")
    }
  }

  async function run(options = {}) {
    if (loading.value) return
    const requestedSource = invocation.value
    try { await loadReviewEngine() } catch { error.value = tr("审稿组件加载失败，请重试。"); return }
    if (loading.value || !panelOpen.value || invocation.value !== requestedSource) return
    let source = invocation.value || host.captureSource()
    if (options.retry !== true && source) {
      const refreshed = host.captureLiveSource(source)
      if (refreshed && [refreshed.projectId, refreshed.documentId, refreshed.pane].join('|') === [source.projectId, source.documentId, source.pane].join('|')) source = refreshed
    }
    if (!source?.document) {
      error.value = tr("当前活动窗口没有可校对的正文。")
      return
    }
    invocation.value = source
    const retry = options.retry === true && retainedInitial && retryAvailable.value
    const scopedNodeIds = []
    const scopedRanges = goalMode.value && options.scope === 'selection' ? (source.selectionRanges || []) : []
    if (goalMode.value && options.scope === 'selection' && !scopedRanges.length) {
      error.value = tr("原文字选区已失效，请重新选择后再打开审稿。")
      return
    }
    if (goalMode.value && options.scope === 'block') {
      const unit = source.document.content?.find((item) => item.attrs?.unitId === source.unitId)
      const collect = (node) => {
        if (node.attrs?.nodeId) scopedNodeIds.push(node.attrs.nodeId)
        node.content?.forEach(collect)
      }
      if (!unit) { error.value = tr("当前块已失效，请回正文重新选择。"); return }
      collect(unit)
      if (!scopedNodeIds.length) { error.value = tr("当前块没有可审阅的文字。"); return }
    }
    if (goalMode.value && !retry && !String(options.goal || '').trim()) {
      error.value = tr("请写下这次希望检查的问题。")
      return
    }
    if (!retry) languagePolicy.value = freezeWritingLanguage({ projectId: source.projectId, text: '' })
    let frozenLanguage = languagePolicy.value
    const initial = retry ? retainedInitial : createAuthoringReviewSession({
      source,
      ...(goalMode.value ? {
        goal: { text: options.goal, skillId: options.skillId, skillVersion: 1 },
        scopeNodeIds: scopedRanges.length ? scopedRanges.map((range) => range.nodeId) : scopedNodeIds,
        scopeRanges: scopedRanges,
        maxCharsPerWindow: 6000
      } : {}),
      sceneProjection: source.sceneProjection || host.sceneProjection(),
      worldbookEntries: source.worldbookEntries || host.worldbookEntries(),
      maxNodesPerWindow: 6,
      windowOverlap: 1
    })
    if (!initial) {
      error.value = tr("当前文稿没有可校对的正文片段。")
      status.value = ''
      return
    }
    const current = host.captureLiveSource(source)
    if (sourceIdentity(current) !== sourceIdentity(source)) {
      error.value = tr("原文已变化，请重新打开审稿。")
      retryAvailable.value = false
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
    const completed = retry ? [...retainedBatches] : []
    const handledFindings = new Map((retry ? findings.value : []).filter((finding) => finding.status !== 'open').map((finding) => [finding.id, finding.status]))
    const mergeProgress = () => {
      const merged = mergeAuthoringReviewFindings(progressSession, completed)
      return merged ? { ...merged, findings: merged.findings.map((finding) => handledFindings.has(finding.id) ? { ...finding, status: handledFindings.get(finding.id) } : finding) } : merged
    }
    if (!retry) {
      languagePolicy.value = freezeWritingLanguage({ projectId: source.projectId, text: initial.windows.flatMap(window => window.blocks.map(block => block.text)).join('\n') })
      frozenLanguage = languagePolicy.value
    }
    retainedInitial = initial
    retainedBatches = completed
    completedBatches.value = completed.length
    let progressSession = initial
    for (const batch of completed) progressSession = markAuthoringReviewBatchStatus(progressSession, batch.windowId, 'completed') || progressSession
    retryAvailable.value = false
    if (initial.goal) saveAuthoringReviewRun({
      id: initial.sessionId, status: 'running', languagePolicy: frozenLanguage, ...initial.target, pane: source.pane,
      goal: initial.goal.text, skillId: initial.goal.skill?.skillId,
      scope: initial.scope.kind === 'text-selection' ? 'selection' : initial.scope.kind === 'selection' ? 'block' : 'chapter',
      scopeRanges: initial.scope.ranges, batches: completed, totalBatches: initial.windows.length
    })
    let failed = 0
    let attempted = 0
    let stale = false
    session.value = mergeProgress()
    try {
      for (let index = 0; index < initial.windows.length; index += 1) {
        if (controller.signal.aborted) break
        const window = initial.windows[index]
        if (completed.some((batch) => batch.windowId === window.id)) continue
        if (initial.goal && attempted >= 8) break
        const batch = createAuthoringReviewBatchContext(initial, window.id)
        if (!batch) continue
        attempted += 1
        try {
          const writingSkill = initial.goal ? validateWritingSkillInvocation({
            invocationId: `${initial.sessionId}:${window.id}`,
            taskKind: 'goal-review', skillId: initial.goal.skill?.skillId, skillVersion: 1,
            goal: initial.goal.text,
            scope: { projectId: source.projectId, documentRole: source.documentRole, documentId: source.documentId },
            revisions: { document: String(source.documentRevision) },
            materialManifest: { sourceRefs: batch.allowedEvidenceRefs },
            requestedCoverage: { wholeBook: false }
          }) : null
          if (writingSkill && !writingSkill.valid) throw new Error(tr("审稿请求无效：{value0}", { value0: writingSkill.reason }))
          const taskResult = await requestAdvisorTask({
            context: {
              chapterTitle: source.title,
              reviewBlocks: batch.reviewBlocks,
              evidence: batch.evidence,
              styleDirectives: batch.styleDirectives,
              allowedEvidenceRefs: batch.allowedEvidenceRefs
            },
            question: '校对这批正文，只返回能精确定位的问题。确定且唯一的修法给出 replacement；不确定时只说明问题。检查错别字、标点与引号、重复、病句、称谓、时间、数值和当前场冲突，不做发布审核。',
            scope: source.documentRole === 'exploration' ? 'selection' : 'chapter',
            taskType: 'writing.chapter.health',
            target: batch.target,
            options: {
              languagePolicy: frozenLanguage,
              projectId: source.projectId,
              chapterId: source.chapterId,
              documentId: source.documentId,
              documentRole: source.documentRole,
              documentRevision: source.documentRevision,
              chapterReview: true,
              ...(writingSkill ? { writingSkill: writingSkill.invocation } : {}),
              reviewBlocks: batch.reviewBlocks,
              allowedEvidenceRefs: batch.allowedEvidenceRefs
            },
            signal: controller.signal
          })
          if (controller.signal.aborted) break
          if (writingSkill) {
            const ack = taskResult.meta?.writingSkill
            if (ack?.schemaVersion !== 1 || ack?.skillId !== initial.goal.skill?.skillId || ack?.skillVersion !== 1 || ack?.outputSchema !== 'writing-skill-findings.v1' || ack?.enforcement !== 'applied') {
              throw new Error(tr("服务端尚未执行所选审稿方法，未将本批标记完成。"))
            }
          }
          const checks = (taskResult.result?.writingSkillChecks?.findings || []).map((finding) => ({
            kind: 'proofing', issueType: finding.type === 'verbatim-repeat' ? 'repetition' : 'grammar', source: 'local', severity: 'low', reason: finding.message,
            start: { nodeId: finding.nodeId, offset: finding.locator?.startOffset }, end: { nodeId: finding.nodeId, offset: finding.locator?.endOffset }, exact: finding.locator?.exact
          }))
          completed.push({ windowId: window.id, findings: [...(taskResult.result?.findings || []), ...checks] })
          if (initial.goal) saveAuthoringReviewRun({
            id: initial.sessionId, status: 'running', languagePolicy: frozenLanguage, ...initial.target, pane: source.pane,
            goal: initial.goal.text, skillId: initial.goal.skill?.skillId,
            scope: initial.scope.kind === 'text-selection' ? 'selection' : initial.scope.kind === 'selection' ? 'block' : 'chapter',
            scopeRanges: initial.scope.ranges, batches: completed, totalBatches: initial.windows.length
          })
          progressSession = markAuthoringReviewBatchStatus(progressSession, window.id, 'completed') || progressSession
          session.value = mergeProgress()
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
          progressSession = markAuthoringReviewBatchStatus(progressSession, window.id, 'failed') || progressSession
          session.value = mergeProgress()
          error.value = taskError.message || tr("本批审稿失败")
        } finally {
          completedBatches.value = completed.length
        }
      }
      const count = session.value?.findings?.length || 0
      if (stale) error.value = tr("校对期间文稿或引用资料发生变化；结果已保留为过期建议，不能采用。")
      else if (controller.signal.aborted) status.value = count ? tr("已停止，保留 {value0} 条只读结果。", { value0: count }) : tr("校对已停止。")
      else if (failed || completed.length < initial.windows.length) error.value = tr("已完成 {value0}/{value1} 批，保留 {value2} 条结果。{value3}", { value0: completed.length, value1: initial.windows.length, value2: count, value3: error.value || '达到本次 8 批上限；未覆盖部分不作结论。' })
      else status.value = count ? tr("{value0}完成 · {value1} 条结果", { value0: tr(goalMode.value ? '审稿' : '校对'), value1: count }) : tr("{value0}完成，没有发现明确问题。", { value0: tr(goalMode.value ? '审稿' : '校对') })
      if (!stale && !controller.signal.aborted && completed.length === initial.windows.length) removeAuthoringReviewRun(initial.sessionId)
    } finally {
      retryAvailable.value = !stale && completed.length < initial.windows.length
      loading.value = false
      if (abortController === controller) abortController = null
    }
  }

  function cancel() {
    abortController?.abort()
  }

  async function resume() {
    const record = resumeRecord.value
    const source = invocation.value
    if (!record || !source) return false
    if (!record.languagePolicy || record.languagePolicy.manuscriptLanguage !== getBookLanguage(source.projectId)) {
      error.value = tr("中断任务缺少语言策略或作品语言已变化，请重新审稿。")
      return false
    }
    languagePolicy.value = record.languagePolicy
    resumeRecord.value = null
    if (String(record.documentRevision) !== String(source.documentRevision)) {
      removeAuthoringReviewRun(record.id)
      error.value = tr("中断任务对应的原文已变化，不能继续；请开始新的审稿。")
      return false
    }
    await loadReviewEngine()
    const scopeNodeIds = record.scope === 'block'
      ? (source.document.content || []).find((unit) => unit.attrs?.unitId === source.unitId)?.content?.map((node) => node.attrs?.nodeId).filter(Boolean) || []
      : record.scopeRanges.map((range) => range.nodeId)
    retainedInitial = createAuthoringReviewSession({
      source, goal: { text: record.goal, skillId: record.skillId, skillVersion: 1 },
      scopeNodeIds, scopeRanges: record.scopeRanges, sceneProjection: source.sceneProjection || host.sceneProjection(),
      worldbookEntries: source.worldbookEntries || host.worldbookEntries(), maxNodesPerWindow: 6, windowOverlap: 1, maxCharsPerWindow: 6000
    })
    if (!retainedInitial) return false
    const validIds = new Set(retainedInitial.windows.map((window) => window.id))
    retainedBatches = record.batches.filter((batch) => validIds.has(batch.windowId))
    session.value = mergeAuthoringReviewFindings(retainedInitial, retainedBatches)
    completedBatches.value = retainedBatches.length
    totalBatches.value = retainedInitial.windows.length
    retryAvailable.value = retainedBatches.length < retainedInitial.windows.length
    status.value = tr("已恢复中断任务 · {value0}/{value1} 批；继续前已重新核对原文版本。", { value0: retainedBatches.length, value1: retainedInitial.windows.length })
    return true
  }

  function discardResume() {
    if (resumeRecord.value) removeAuthoringReviewRun(resumeRecord.value.id)
    resumeRecord.value = null
  }

  async function jump(finding) {
    if (!finding?.target || !invocation.value) return false
    changedSurface = true
    return host.navigateToFinding(invocation.value, finding.target)
  }

  function applySelected(ids = []) {
    if (!languageStillCurrent()) return false
    if (host.historyLocked() || !session.value) return false
    const source = invocation.value
    const live = liveSource()
    const before = session.value
    const transaction = prepareAuthoringReviewTransaction(session.value, ids, live ? { source: live, sourceRevisions: live.sourceRevisions } : {})
    if (!transaction.ok) {
      reconcile()
      error.value = transaction.reason.includes('detached')
        ? tr("原文位置已经失效；仍可查看建议，但不能采用。")
        : tr("正文或引用资料已经变化，请重新校对后再采用。")
      return false
    }
    if (!host.protectBatch(source, live, transaction)) {
      error.value = tr("无法保存批量采用前版本，正文没有变化。")
      return false
    }
    if (!host.applyPatches(source, transaction.patches)) {
      error.value = tr("编辑器没有接受这次修改，正文未变化。")
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
      ? tr("已一次采用 {value0} 条，可撤销一次恢复。", { value0: transaction.patches.length })
      : tr("已采用，可撤销。")
    return true
  }

  function applyOne(finding) {
    if (!languageStillCurrent()) return false
    return applySelected(finding?.id ? [finding.id] : [])
  }

  function ignore(finding) {
    if (finding?.id && session.value) session.value = ignoreAuthoringReviewFinding(session.value, finding.id)
  }

  function languageStillCurrent() {
    if (!languagePolicy.value || languagePolicy.value.manuscriptLanguage === getBookLanguage(invocation.value?.projectId)) return true
    error.value = tr("作品语言已变化，请重新审稿后采用建议。")
    return false
  }

  async function rewriteFinding(finding, options = {}) {
    if (!languageStillCurrent()) return false
    reconcile()
    const current = findings.value.find((item) => item.id === finding?.id)
    if (!current || current.status !== 'open' || loading.value) return false
    return host.rewrite?.begin(current, options)
  }

  function applyFindingRewrite(candidate, findingId) {
    if (!languageStillCurrent()) return false
    reconcile()
    const finding = findings.value.find((item) => item.id === findingId)
    if (!finding || finding.status !== 'open' || host.historyLocked()) {
      error.value = tr("原文或资料已经变化，请重新审稿。")
      return false
    }
    const before = session.value
    if (!host.rewrite?.apply(candidate)) return false
    changedSurface = true
    session.value = { ...before, findings: before.findings.map((item) => item.id === findingId ? { ...item, status: 'modified' } : item) }
    undoReceipt.value = Object.freeze({ pane: invocation.value.pane, afterDocumentRevision: liveSource()?.documentRevision || '', sessionBefore: before })
    saveRetryAvailable.value = host.rewrite?.savePending?.value === true
    status.value = saveRetryAvailable.value
      ? tr("已修改，但保存失败；候选与修改仍保留，可只重试保存。")
      : tr("已修改，待复核；可撤销本次修改。")
    return true
  }

  function retrySave() {
    if (!saveRetryAvailable.value || !host.rewrite?.retrySave) return false
    const saved = host.rewrite.retrySave()
    if (saved) {
      saveRetryAvailable.value = false
      status.value = tr("修改已保存；可撤销本次修改。")
      error.value = ''
    } else error.value = tr("保存仍然失败；修改保留在编辑器中，可稍后重试。")
    return saved
  }

  function undo() {
    const receipt = undoReceipt.value
    const live = liveSource()
    if (!receipt || !session.value) return false
    if (!live || String(live.documentRevision || '') !== String(receipt.afterDocumentRevision || '')) {
      error.value = tr("采用后正文又有修改，不能越过新修改撤销校对。")
      undoReceipt.value = null
      return false
    }
    if (!host.undoPatches(receipt)) return false
    session.value = receipt.sessionBefore
    undoReceipt.value = null
    saveRetryAvailable.value = false
    nextTick(reconcile)
    status.value = tr("已撤销本次采用。")
    return true
  }

  watch(host.reconcileSources, () => {
    if (!panelOpen.value || loading.value || !session.value) return
    nextTick(reconcile)
  }, { flush: 'post' })

  return {
    coverage, rewrite: host.rewrite, rewriteFinding, applyFindingRewrite,
    languagePolicy, goalMode, retryAvailable, saveRetryAvailable, resumeRecord, loading, error, status, completedBatches, totalBatches, panelOpen, session,
    invocation, undoReceipt, documentTitle, findings, undoAvailable,
    freeze, open, close, run, resume, discardResume, retrySave, cancel, jump, applyOne, applySelected, ignore, undo, reconcile
  }
}
