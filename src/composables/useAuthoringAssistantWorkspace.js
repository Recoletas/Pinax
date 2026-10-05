import { computed, nextTick, ref, unref, watch } from 'vue'
import { getChapterMarkdown } from '../services/writing/writingDocumentSchema.js'

// The editor and assistant share the Authoring owner. A query changes the
// visible surface without remounting the editor or restarting a request.
export function useAuthoringAssistantWorkspace({
  route, router, projectId, chapterId, chapters, assistant, writingTypography,
  openInspector, inspectorOpen, activeInspectorTool, closeChapterDrawer,
  captureScroll, restoreScroll, focusEditor, openEvidence, createBook,
  openSources: navigateSources, openSettings: navigateSettings, getReviewWorkflow, openIllustrator: showIllustrator
}) {
  const expanded = ref(false)
  const newBookWithAssistant = ref(false)
  let returnPosition = null
  const emptyBook = computed(() => !chapters.value.some(chapter => getChapterMarkdown(chapter).trim()))

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
    return Boolean(unref(assistant.busy) || unref(review?.loading) || unref(review?.rewrite?.loading))
  })

  async function openSources() {
    // Browser-local tasks have no server recovery yet. Keep the request owner
    // alive while it is running; sources can be opened when it has settled.
    if (navigationBusy.value) return false
    return navigateSources()
  }

  function openSettings() {
    if (navigationBusy.value) return false
    return navigateSettings()
  }

  function openSurface(surface) {
    if (surface === 'assistant') return enter()
    if (surface === 'writing') { closeChapterDrawer(); return leave() }
    return surface === 'settings' ? openSettings() : openSources()
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

  return { expanded, emptyBook, newBookWithAssistant, enter, leave, locateEvidence, startNewBook, afterCreateBook, openSources, openSettings, openSurface, navigationBusy, openIllustrator }
}
