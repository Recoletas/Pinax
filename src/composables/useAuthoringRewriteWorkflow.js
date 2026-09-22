import { tr } from '../i18n/index.js'
import { freezeWritingLanguage } from '../services/writing/writingLanguagePolicy.js'
import { computed, nextTick, onBeforeUnmount, ref } from 'vue'
import { requestAdvisorTask } from '../services/advisorTaskService'
import { collectWritingDialogueLocks, validateWritingLockedSegments } from '../../shared/writingCandidateContract.js'
import { validateWritingReplacement } from '../../shared/writingReplacementContract.js'
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
  getManuscriptLanguage = () => '',
  getCurrentComparison: readCurrentComparison,
  getChapterId,
  getEditorMode,
  buildTaskContext,
  commitCandidate,
  onCandidateApplied,
  onAfterApplied
}) {
  const getCurrentComparison = target => { const current = readCurrentComparison(target); return current ? { ...current, manuscriptLanguage: getManuscriptLanguage() } : null }
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

  async function generateRewriteCandidates(targetOverride = null, { preserveDialogue = false, manualLockText = '' } = {}) {
    if (targetOverride && !isRewriteTargetStillCurrent(targetOverride)) {
      rewriteError.value = tr("原改写目标已经变化，请重新选中正文后再生成。")
      return false
    }

    const target = targetOverride || getCurrentTarget()
    if (!target?.text?.trim()) {
      rewriteError.value = tr("先把光标放入正文块，或选中需要改写的文字。")
      return false
    }
    if (preserveDialogue) rewriteLockedSegments.value = target.kind === 'multi-selection'
      ? (target.nodes || []).flatMap((node) => collectWritingDialogueLocks(node.text, node.nodeId))
      : collectWritingDialogueLocks(target.text, target.nodeId)
    if (!preserveDialogue) rewriteLockedSegments.value = []
    if (manualLockText) {
      const nodes = target.kind === 'multi-selection' ? target.nodes || [] : [target]
      const matches = nodes.flatMap(node => {
        const ranges = []
        let start = node.text.indexOf(manualLockText)
        while (start >= 0) {
          ranges.push({ text: manualLockText, start, end: start + manualLockText.length, nodeId: node.nodeId })
          start = node.text.indexOf(manualLockText, start + 1)
        }
        return ranges
      })
      if (matches.length !== 1) { rewriteError.value = tr("手动锁定内容必须在目标原文中精确且唯一，请检查后重试。"); return false }
      rewriteLockedSegments.value.push(matches[0])
    }
    if (rewriteLockedSegments.value.length > 12) { rewriteError.value = tr("锁定范围超过 12 处，请缩小改写选区。"); return false }
    const languagePolicy = freezeWritingLanguage({ manuscriptLanguage: getManuscriptLanguage(), text: target.text })
    const frozenLocks = rewriteLockedSegments.value.map((segment) => ({ ...segment }))

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
      ? tr("请修正当前正文块，处理重复、语病和衔接，但不要无依据扩写。")
      : tr("请改写当前选区，保持原意、视角和人物语气，减少重复并改善节奏。"))
    const chapterId = getChapterId(target)
    const request = createWritingCandidateRequest({
      target,
      documentRevision: target.documentRevision,
      chapterId,
      question
    })

    try {
      const context = buildTaskContext({ scope, question, taskType }, target)
      const taskResult = await requestAdvisorTask({
        context,
        question,
        scope,
        taskType,
        target: request.target,
        options: {
          languagePolicy,
          editorMode: getEditorMode(),
          chapterId,
          candidateCount: 3,
          lockedSegments: frozenLocks,
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
          languagePolicy,
          kind: target.kind,
          chapterId,
          documentRevision: target.documentRevision,
          unitId: target.unitId,
          unitRevision: target.unitRevision,
          nodeId: target.nodeId,
          nodeRevision: target.nodeRevision,
          targetRange: target.range,
          lockedSegments: frozenLocks,
          patches,
          status: 'ready',
          diff: target.kind === 'multi-selection'
            ? null
            : buildWritingCandidateDiff(target.text, candidate.text)
        }
      })
      if (!candidates.length) throw new Error(tr("模型未返回可审阅的改写候选"))
      rewriteCandidates.value = candidates
      selectedRewriteCandidateId.value = candidates[0].id
      return true
    } catch (error) {
      if (version === requestVersion) {
        rewriteError.value = error?.code === 'AGENT_REQUEST_ABORTED'
          ? tr("本次生成已取消，可重新生成。")
          : error?.message || tr("改写候选生成失败")
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
    rewriteError.value = tr("本次生成已取消，可重新生成。")
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
      rewriteError.value = tr("正文或目标块已经变化，这条候选已过期，请重新生成。")
      return false
    }
    const locks = candidate.lockedSegments || []
    const replacements = candidate.patches || [{ nodeId: candidate.nodeId, baseText: candidate.baseText, replacement: candidate.text }]
    if (locks.some((lock) => lock.nodeId && !replacements.some((patch) => patch.nodeId === lock.nodeId)) || replacements.some((patch) =>
      !validateWritingReplacement(patch.replacement).valid || !validateWritingLockedSegments(patch.baseText, patch.replacement, locks.filter((lock) => !lock.nodeId || lock.nodeId === patch.nodeId)))) {
      rewriteError.value = tr("候选为空、无效或改动了锁定位置；请保留原句的位置后再采用。")
      return false
    }

    const result = commitCandidate(candidate, rewriteTarget.value)
    if (!result?.ok) {
      if (result?.silent) return false
      if (result?.stale) {
        candidate.status = 'stale'
        candidate.statusDetail = result.reason || 'target-changed'
      }
      rewriteError.value = result?.message || tr("编辑器没有接受这次改写，请重新生成。")
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
