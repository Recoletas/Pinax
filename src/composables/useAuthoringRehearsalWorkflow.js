import { computed, ref, shallowRef } from 'vue'

const PENDING_DRAFT_NOTICE = '请先处理正文中已有的试稿，再开始新的试演。'

// Owns the page-level rehearsal transaction. Route evolution stays in
// useAuthoringRehearsal; this boundary coordinates a frozen route with the
// manuscript draft workflow without letting Authoring.vue own the receipt.
export function useAuthoringRehearsalWorkflow({
  rehearsal,
  getDraftPreview,
  hasAlternativeDraft,
  isAuthoringTaskBusy,
  confirmRestart,
  prepareStart,
  readStartFailure,
  closeComparison,
  closeComparisonEntry,
  getDocumentScopeKey,
  prepareDraftTarget,
  generateDraft,
  readDraftFailure,
  dismissDraft,
  revealDraft,
  cancelPreparation = () => {},
  cancelGeneration = () => {},
  openProse = () => {},
  openExploration = () => {}
}) {
  const preparing = ref(false)
  const drafting = ref(false)
  const notice = ref('')
  const originTitle = ref('')
  const draftSource = shallowRef(null)
  let requestVersion = 0

  function cancel() {
    requestVersion += 1
    cancelPreparation()
    cancelGeneration()
    rehearsal.cancel()
    preparing.value = false
    drafting.value = false
    notice.value = ''
  }

  function selectTask(mode) {
    if (preparing.value || drafting.value || rehearsal.busy.value || isAuthoringTaskBusy() || getDraftPreview()) return false
    if (mode === 'prose') openProse()
    else if (mode === 'explore') openExploration()
    else return false
    return true
  }

  const draftState = computed(() => {
    const preview = getDraftPreview()
    if (!preview) return 'none'
    const session = rehearsal.run.value?.runSession
    if (!session || preview.candidate?.runSession !== session) return 'foreign'
    return draftSource.value?.routeId === rehearsal.route.value ? 'same-route' : 'other-route'
  })

  function reset() {
    cancel()
    rehearsal.clear()
    draftSource.value = null
    notice.value = ''
    originTitle.value = ''
  }

  async function start({ instruction = '', autoAdvance = false, target = null } = {}) {
    if (preparing.value || drafting.value || rehearsal.busy.value || getDraftPreview()) {
      notice.value = PENDING_DRAFT_NOTICE
      return false
    }
    if (rehearsal.steps.value.length && !confirmRestart()) return false
    const ticket = ++requestVersion
    const scope = getDocumentScopeKey()
    preparing.value = true
    notice.value = ''
    closeComparisonEntry()
    draftSource.value = null
    try {
      const ok = await prepareStart({ instruction, autoAdvance, target })
      if (ticket !== requestVersion || scope !== getDocumentScopeKey()) return false
      if (ok?.status === 'needs-review' || ok?.status === 'cancelled') return false
      if (!ok || !rehearsal.run.value) {
        notice.value = readStartFailure() || '当前现场不足以试演，请补充人物或行动目标。'
        return false
      }
      rehearsal.setAction(instruction)
      if (autoAdvance) return await rehearsal.advance({ mode: instruction.trim() ? 'instruction' : 'continue', text: instruction.trim() })
      return true
    } catch (cause) {
      if (ticket === requestVersion) notice.value = cause?.message || '推演准备未完成，请重试。'
      return false
    } finally {
      if (ticket === requestVersion) preparing.value = false
    }
  }

  async function writeDraft() {
    if (drafting.value || rehearsal.busy.value || !rehearsal.steps.value.length || isAuthoringTaskBusy()) return false
    if (getDraftPreview() || hasAlternativeDraft()) {
      notice.value = '正文中还有待处理的试稿，请先采用、留作构思或放弃，再写这一版。'
      return false
    }
    closeComparison()
    drafting.value = true
    notice.value = ''
    const run = rehearsal.run.value
    const scope = getDocumentScopeKey()
    const ticket = ++requestVersion
    try {
      if (!await rehearsal.check() || ticket !== requestVersion || scope !== getDocumentScopeKey()) return false
      const source = rehearsal.createDraftSource()
      if (!source) return false
      const instruction = '将以下作者选定的假想事件写成连续正文，承接冻结的落笔处。保留事件顺序和人物回应，不把这些假想写成正式世界设定，不输出步骤编号或说明：\n' + source.pathText
      prepareDraftTarget(run.target)
      const outcome = await generateDraft({ run, instruction })
      if (ticket !== requestVersion || scope !== getDocumentScopeKey()) return false
      if (!outcome?.preview) {
        notice.value = (outcome?.message || readDraftFailure() || '没有生成可用试稿') + '；试演仍保留，可以重试。'
        return false
      }
      if (!rehearsal.draftSourceIsCurrent(source)) {
        dismissDraft()
        notice.value = '生成期间这条走法已经变化，试稿没有挂到正文；请重新写成试稿。'
        return false
      }
      draftSource.value = Object.freeze({ ...source, candidateId: outcome.preview.candidateId })
      revealDraft()
      notice.value = '试稿已放在正文落笔处，采用前仍可修改。'
      return true
    } catch (cause) {
      if (ticket === requestVersion && scope === getDocumentScopeKey()) notice.value = cause?.message || '试稿生成失败，可重试。'
      return false
    } finally {
      if (ticket === requestVersion) drafting.value = false
    }
  }

  return {
    preparing,
    drafting,
    notice,
    originTitle,
    draftSource,
    draftState,
    reset,
    cancel,
    selectTask,
    start,
    writeDraft
  }
}
