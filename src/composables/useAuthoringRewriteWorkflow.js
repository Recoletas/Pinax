import { computed, nextTick, onBeforeUnmount, ref } from 'vue'
import { requestAdvisorTask } from '../services/advisorTaskService'
import {
  buildWritingCandidateDiff,
  createWritingCandidateRequest,
  getWritingCandidateStaleReason,
  normalizeWritingCandidateResponse
} from '../services/writing/writingCandidates.js'

/**
 * Authoring 批注改写候选的唯一会话 owner。
 *
 * 本层拥有请求代次、取消、候选/选择、stale 与采用状态；页面只注入：
 * - 当前编辑器目标/实时比较投影；
 * - 稀疏写作上下文构造；
 * - 真正修改正文的原子事务适配器。
 *
 * 模型结果永远先停在候选态。本层不读 DOM、不直接写正文或批注存储。
 */
export function useAuthoringRewriteWorkflow({
  getCurrentTarget,
  getCurrentComparison,
  getChapterId,
  getEditorMode,
  buildTaskContext,
  commitCandidate,
  onCandidateApplied,
  onAfterApplied
}) {
  const rewriteInstruction = ref('')
  const rewriteTarget = ref(null)
  const rewriteCandidates = ref([])
  const selectedRewriteCandidateId = ref(null)
  const rewriteLockedSegments = ref([])
  const rewriteLoading = ref(false)
  const rewriteError = ref('')
  let requestVersion = 0
  let abortController = null

  const selectedRewriteCandidate = computed(() => rewriteCandidates.value.find(
    (candidate) => candidate.id === selectedRewriteCandidateId.value
  ) || rewriteCandidates.value[0] || null)

  function resetRewriteState() {
    requestVersion += 1
    abortController?.abort()
    abortController = null
    rewriteLoading.value = false
    rewriteError.value = ''
    rewriteInstruction.value = ''
    rewriteTarget.value = null
    rewriteCandidates.value = []
    selectedRewriteCandidateId.value = null
    rewriteLockedSegments.value = []
  }

  function markRewriteCandidatesStale() {
    const current = getCurrentComparison(rewriteTarget.value)
    if (!current) return
    rewriteCandidates.value = rewriteCandidates.value.map((candidate) => {
      if (candidate.status === 'applied' || candidate.status === 'dismissed') return candidate
      const reason = getWritingCandidateStaleReason(candidate, current)
      return reason ? { ...candidate, status: 'stale', statusDetail: reason } : candidate
    })
  }

  function isRewriteTargetStillCurrent(target) {
    if (!target) return false
    const current = getCurrentComparison(target)
    if (!current) return false
    const candidate = target.kind === 'multi-selection'
      ? {
          chapterId: target.chapterId,
          documentRevision: target.documentRevision,
          patches: (target.nodes || []).map((node) => ({
            unitId: node.unitId,
            unitRevision: node.unitRevision,
            nodeId: node.nodeId,
            nodeRevision: node.nodeRevision,
            baseText: node.text
          }))
        }
      : {
          chapterId: target.chapterId,
          documentRevision: target.documentRevision,
          unitId: target.unitId,
          unitRevision: target.unitRevision,
          nodeId: target.nodeId,
          nodeRevision: target.nodeRevision,
          baseText: target.text
        }
    return !getWritingCandidateStaleReason(candidate, current)
  }

  async function generateRewriteCandidates(targetOverride = null) {
    if (targetOverride && !isRewriteTargetStillCurrent(targetOverride)) {
      rewriteError.value = '原改写目标已经变化，请重新选中正文后再生成。'
      return false
    }

    const target = targetOverride || getCurrentTarget()
    if (!target?.text?.trim()) {
      rewriteError.value = '先把光标放入正文块，或选中需要改写的文字。'
      return false
    }

    abortController?.abort()
    const controller = new AbortController()
    abortController = controller
    const version = ++requestVersion
    rewriteLoading.value = true
    rewriteError.value = ''
    rewriteTarget.value = target
    rewriteCandidates.value = []
    selectedRewriteCandidateId.value = null

    const scope = target.kind === 'block' ? 'paragraph' : 'selection'
    const taskType = target.kind === 'block' ? 'writing.fix.paragraph' : 'writing.fix.selection'
    const question = rewriteInstruction.value.trim() || (target.kind === 'block'
      ? '请修正当前正文块，处理重复、语病和衔接，但不要无依据扩写。'
      : '请改写当前选区，保持原意、视角和人物语气，减少重复并改善节奏。')
    const chapterId = getChapterId()
    const request = createWritingCandidateRequest({
      target,
      documentRevision: target.documentRevision,
      chapterId,
      question
    })

    try {
      const context = buildTaskContext({ scope, question, taskType })
      const taskResult = await requestAdvisorTask({
        context,
        question,
        scope,
        taskType,
        target: request.target,
        options: {
          editorMode: getEditorMode(),
          chapterId,
          candidateCount: 3,
          lockedSegments: rewriteLockedSegments.value,
          multiBlock: target.kind === 'multi-selection',
          targetBlocks: target.nodes || []
        },
        signal: controller.signal
      })
      if (version !== requestVersion) return false

      const targetNodesById = new Map((target.nodes || []).map((node) => [node.nodeId, node]))
      const candidates = normalizeWritingCandidateResponse(taskResult.result, request).map((candidate) => {
        const patches = candidate.patches?.map((patch) => {
          const targetNode = targetNodesById.get(patch.nodeId)
          return {
            ...patch,
            baseText: targetNode?.baseText || patch.baseText,
            targetRange: targetNode?.range || patch.targetRange,
            editorRange: targetNode?.editorRange || patch.editorRange,
            startOffset: targetNode?.startOffset,
            endOffset: targetNode?.endOffset,
            diff: buildWritingCandidateDiff(targetNode?.baseText || patch.baseText, patch.replacement)
          }
        })
        return {
          ...candidate,
          kind: target.kind,
          chapterId,
          documentRevision: target.documentRevision,
          unitId: target.unitId,
          unitRevision: target.unitRevision,
          nodeId: target.nodeId,
          nodeRevision: target.nodeRevision,
          targetRange: target.range,
          lockedSegments: rewriteLockedSegments.value,
          patches,
          status: 'ready',
          diff: target.kind === 'multi-selection'
            ? null
            : buildWritingCandidateDiff(target.text, candidate.text)
        }
      })
      if (!candidates.length) throw new Error('模型未返回可审阅的改写候选')
      rewriteCandidates.value = candidates
      selectedRewriteCandidateId.value = candidates[0].id
      return true
    } catch (error) {
      if (version === requestVersion) {
        rewriteError.value = error?.code === 'AGENT_REQUEST_ABORTED'
          ? '本次生成已取消，可重新生成。'
          : error?.message || '改写候选生成失败'
      }
      return false
    } finally {
      if (version === requestVersion) {
        rewriteLoading.value = false
        if (abortController === controller) abortController = null
      }
    }
  }

  function cancelRewriteGeneration() {
    requestVersion += 1
    abortController?.abort()
    abortController = null
    rewriteLoading.value = false
    rewriteError.value = '本次生成已取消，可重新生成。'
  }

  function retryRewriteCandidates() {
    if (rewriteLoading.value || !rewriteTarget.value) return false
    return generateRewriteCandidates(rewriteTarget.value)
  }

  function applyRewriteCandidate(candidate) {
    if (!candidate || candidate.status !== 'ready') return false
    const current = getCurrentComparison(rewriteTarget.value)
    const staleReason = getWritingCandidateStaleReason(candidate, current)
    if (staleReason) {
      candidate.status = 'stale'
      candidate.statusDetail = staleReason
      rewriteError.value = '正文或目标块已经变化，这条候选已过期，请重新生成。'
      return false
    }
    if (!candidate.patches && (candidate.lockedSegments || []).some((segment) => !candidate.text.includes(segment.text))) {
      rewriteError.value = '候选没有保留全部锁定片段，不能采用。'
      return false
    }

    const result = commitCandidate(candidate, rewriteTarget.value)
    if (!result?.ok) {
      if (result?.silent) return false
      if (result?.stale) {
        candidate.status = 'stale'
        candidate.statusDetail = result.reason || 'target-changed'
      }
      rewriteError.value = result?.message || '编辑器没有接受这次改写，请重新生成。'
      return false
    }

    candidate.status = 'applied'
    rewriteError.value = ''
    rewriteCandidates.value = rewriteCandidates.value.map((item) => item.id === candidate.id ? candidate : item)
    onCandidateApplied?.({ candidate, target: rewriteTarget.value })
    nextTick(() => {
      rewriteTarget.value = null
      rewriteCandidates.value = []
      selectedRewriteCandidateId.value = null
      rewriteInstruction.value = ''
      onAfterApplied?.()
    })
    return true
  }

  function dismissRewriteCandidate(candidate) {
    if (!candidate) return
    candidate.status = 'dismissed'
    rewriteCandidates.value = rewriteCandidates.value.map((item) => item.id === candidate.id ? candidate : item)
  }

  onBeforeUnmount(() => {
    requestVersion += 1
    abortController?.abort()
    abortController = null
  })

  return {
    rewriteInstruction,
    rewriteTarget,
    rewriteCandidates,
    selectedRewriteCandidateId,
    selectedRewriteCandidate,
    rewriteLockedSegments,
    rewriteLoading,
    rewriteError,
    resetRewriteState,
    markRewriteCandidatesStale,
    generateRewriteCandidates,
    cancelRewriteGeneration,
    retryRewriteCandidates,
    applyRewriteCandidate,
    dismissRewriteCandidate
  }
}
