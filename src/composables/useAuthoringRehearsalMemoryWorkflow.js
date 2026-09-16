import { computed, ref, shallowRef } from 'vue'
import { buildAdoptedRehearsalMemoryProposal } from '../services/agents/authoring/authoringRehearsalMemoryProposal.js'

function text(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
}

function consequenceText(consequence) {
  if (consequence.kind === 'commitment') return text(consequence.content)
  if (consequence.kind === 'item') return text(consequence.name)
  return text(consequence.supportText || consequence.content)
}

export function useAuthoringRehearsalMemoryWorkflow({ queue, openReview } = {}) {
  const adoption = shallowRef(null)
  const source = shallowRef(null)
  const locator = shallowRef(null)
  const open = ref(false)
  const selectedIndex = ref(0)
  const draft = ref('')
  const error = ref('')
  const queuedCandidate = shallowRef(null)

  const consequences = computed(() => (source.value?.consequences || [])
    .filter((item) => {
      const support = consequenceText(item)
      return support && text(adoption.value?.adoptedText).includes(support)
    })
    .slice(0, 2))
  const available = computed(() => Boolean(adoption.value && consequences.value.length))

  function reset() {
    adoption.value = null
    source.value = null
    locator.value = null
    open.value = false
    selectedIndex.value = 0
    draft.value = ''
    error.value = ''
    queuedCandidate.value = null
  }

  function capture({ adoptionReceipt, draftSource, formalLocator } = {}) {
    reset()
    if (!adoptionReceipt?.adoptedText || !draftSource?.consequences?.length) return false
    adoption.value = adoptionReceipt
    source.value = draftSource
    locator.value = formalLocator
    const first = consequences.value[0]
    if (!first) return false
    draft.value = consequenceText(first)
    return true
  }

  function begin() {
    if (!available.value) return false
    open.value = true
    error.value = ''
    return true
  }

  function select(index) {
    const consequence = consequences.value[index]
    if (!consequence) return false
    selectedIndex.value = index
    draft.value = consequenceText(consequence)
    error.value = ''
    return true
  }

  function cancel() {
    open.value = false
    error.value = ''
  }

  function setDraft(value) {
    draft.value = String(value ?? '')
  }

  function submit() {
    const consequence = consequences.value[selectedIndex.value]
    const proposal = buildAdoptedRehearsalMemoryProposal({
      adoptionReceipt: adoption.value,
      locator: locator.value,
      consequence,
      content: draft.value,
      supportText: consequenceText(consequence)
    })
    if (!proposal.ok) {
      error.value = proposal.reason === 'unsupported-by-adopted-text'
        ? '采用稿中找不到依据，没有加入记忆候选。'
        : '这项变化缺少正式正文来源，暂时不能记住。'
      return false
    }
    const result = queue(proposal.proposal)
    if (!result?.success && result?.reason !== 'exact-duplicate') {
      error.value = '记忆候选保存失败，文字仍保留，可以重试。'
      return false
    }
    queuedCandidate.value = result.candidate || null
    open.value = false
    error.value = ''
    openReview?.(queuedCandidate.value)
    return true
  }

  return {
    adoption, source, locator, open, selectedIndex, draft, error, queuedCandidate,
    consequences, available, reset, capture, begin, select, cancel, setDraft, submit
  }
}

export default useAuthoringRehearsalMemoryWorkflow
