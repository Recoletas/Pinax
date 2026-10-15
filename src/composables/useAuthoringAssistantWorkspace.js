import { computed, nextTick, onScopeDispose, ref, unref, watch } from 'vue'
import { getChapterMarkdown } from '../services/writing/writingDocumentSchema.js'
import { useComposableWorkspace } from './useComposableWorkspace.js'

// The editor and assistant share the Authoring owner. A query changes the
// visible surface without remounting the editor or restarting a request.
export function useAuthoringAssistantWorkspace({
  route, router, projectId, chapterId, chapters, assistant, writingTypography,
  openInspector, inspectorOpen, activeInspectorTool, closeChapterDrawer,
  captureScroll, restoreScroll, focusEditor, openEvidence, createBook,
  openSources: navigateSources, openSettings: navigateSettings, openSurface: navigateSurface, getReviewWorkflow, openIllustrator: showIllustrator
}) {
  const contentWorkspace = useComposableWorkspace()
  const expanded = ref(false)
  const newBookWithAssistant = ref(false)
  let returnPosition = null
  const emptyBook = computed(() => !chapters.value.some(chapter => getChapterMarkdown(chapter).trim()))
  // Registration belongs to the page's task owner, not the visible assistant card.
  const releaseTaskSummary = contentWorkspace?.registerTaskAdapter('assistant:primary', {
    summary: () => !unref(assistant.backgroundCapable) && unref(assistant.busy) ? { id: unref(assistant.agentState)?.taskId || '', projectId: projectId.value, label: '助手运行中', status: 'running' } : null,
    open: () => { contentWorkspace.hide(); enter() }
  })
  onScopeDispose(() => releaseTaskSummary?.())

  function setQueryView(value) {
    const query = { ...route.query }
    if (value) query.view = 'assistant'
    else delete query.view
    if (String(query.view || '') === String(route.query.view || '')) return
    void router.replace({ query })
  }

  function reveal() {
    if (!projectId.value) return false
    if (openInspector('ai') === false) return false
    if (!expanded.value) returnPosition = {
      projectId: projectId.value, chapterId: chapterId.value, scroll: captureScroll()
    }
    writingTypography.zen = false
    closeChapterDrawer()
    expanded.value = true
    assistant.markRead?.()
    return true
  }

  function enter() {
    if (!projectId.value) {
      newBookWithAssistant.value = true
      createBook()
      return
    }
    if (reveal()) setQueryView(true)
  }

  async function leave({ restore = true } = {}) {
    const wasExpanded = expanded.value
    expanded.value = false
    setQueryView(false)
    const position = returnPosition
    returnPosition = null
    if (!restore || !wasExpanded) return
    await nextTick()
    if (position?.projectId === projectId.value && position?.chapterId === chapterId.value) {
      restoreScroll(position.scroll)
      focusEditor()
    }
  }

  async function locateEvidence(evidence) {
    await leave({ restore: false })
    return openEvidence(evidence)
  }

  function startNewBook() {
    newBookWithAssistant.value = String(route.query.view || '') === 'assistant'
  }

  function afterCreateBook() {
    if (newBookWithAssistant.value) {
      assistant.selectIntent('free')
      void nextTick(enter)
    } else focusEditor()
  }

  const navigationBusy = computed(() => {
    const review = getReviewWorkflow?.()
    return Boolean(unref(assistant.busy) || unref(assistant.agentState)?.adoptionBusy || unref(review?.loading) || unref(review?.rewrite?.loading))
  })
  function blocksNavigation(to) {
    const review = getReviewWorkflow?.()
    if (unref(assistant.agentState)?.adoptionBusy || unref(review?.loading) || unref(review?.rewrite?.loading)) return true
    return Boolean(unref(assistant.busy) && !(unref(assistant.backgroundCapable) && to?.query?.bookId === projectId.value))
  }
  const blocksSameProjectNavigation = () => blocksNavigation({ query: { bookId: projectId.value } })

  async function openSources() {
    // Embedded sources leave the existing editor/request owner mounted.
    if (blocksSameProjectNavigation() && !contentWorkspace) return false
    return navigateSources()
  }

  function openSettings() {
    if (blocksSameProjectNavigation()) return false
    return navigateSettings()
  }

  function openSurface(surface) {
    if (surface === 'assistant') return enter()
    if (surface === 'writing') { closeChapterDrawer(); return leave() }
    if (blocksSameProjectNavigation()) return false
    if (surface === 'home') return router.push({ name: 'welcome' })
    if (surface === 'settings') return openSettings()
    if (surface === 'sources') return openSources()
    return navigateSurface?.(surface) ?? false
  }

  async function openIllustrator() {
    await leave({ restore: false })
    showIllustrator()
  }

  watch([projectId, () => route.query.view], ([id, view]) => {
    if (id && view === 'assistant') reveal()
    else if (expanded.value) void leave()
  }, { flush: 'post', immediate: true })
  watch([inspectorOpen, activeInspectorTool], ([open, tool]) => {
    if (open && tool === 'ai') assistant.markRead?.()
    if (expanded.value && (!open || tool !== 'ai')) void leave({ restore: false })
  })
  watch(projectId, () => { returnPosition = null })

  return { expanded, emptyBook, newBookWithAssistant, enter, leave, locateEvidence, startNewBook, afterCreateBook, openSources, openSettings, openSurface, navigationBusy, blocksNavigation, openIllustrator }
}
