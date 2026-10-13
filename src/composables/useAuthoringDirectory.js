import { nextTick, ref, watch, onMounted } from 'vue'
import { resolveBookSourceContext } from '../services/worldbook/worldbookProjectSources.js'
import { tr } from '../i18n/index.js'
import { useComposableWorkspace } from './useComposableWorkspace.js'

// Directory commands share the document owners and leave protections.
export function useAuthoringDirectory(owner) {
  const directoryHost = useComposableWorkspace()
  const directoryMode = ref('files')
  onMounted(() => {
    watch(() => String(owner.bookId() || ''), bookId => {
      try { directoryMode.value = localStorage.getItem(`pinax-directory-mode:v1:${bookId}`) === 'chapters' ? 'chapters' : 'files' } catch { directoryMode.value = 'files' }
    }, { immediate: true })
  })
  watch(directoryMode, value => {
    try { localStorage.setItem(`pinax-directory-mode:v1:${owner.bookId()}`, value) } catch { /* Display preferences do not block writing. */ }
  })
  async function refreshDirectoryWorldbook(bookId, worldbookId) {
    if (String(owner.bookId()) !== bookId) return false
    const context = resolveBookSourceContext(bookId)
    if (!context.ok) throw new Error(tr('这本书已不存在。'))
    if (worldbookId && context.worldbookId !== worldbookId) throw new Error(tr('作品的设定库关联已变化，内容保留在原资料库。'))
    owner.book().worldbookId = context.worldbookId || ''
    await owner.refreshWorldbook()
    return String(owner.bookId()) === bookId
  }
  function prepareDirectoryOpen() {
    if (owner.hasPendingDraft()) {
      directoryHost.state.notice = tr('请先采用或保留当前推演草稿，再切换内容。')
      return false
    }
    if (owner.ideaId()) return Boolean(owner.saveIdea()?.ok)
    return !owner.chapterId() || owner.saveChapter()
  }
  async function createDirectoryResource(type) {
    const bookId = String(owner.bookId())
    if (!prepareDirectoryOpen()) return null
    if (type === 'chapter') {
      if (owner.ideaId() && !owner.leaveIdea()?.ok) return null
      if (!owner.createChapter()) return null
    } else {
      const previous = owner.ideaId()
      owner.createIdea()
      if (!owner.ideaId() || previous === owner.ideaId()) return null
    }
    const id = String(type === 'chapter' ? owner.chapterId() : owner.ideaId())
    await nextTick()
    if (String(owner.bookId()) !== bookId) return null
    return { type, bookId, id }
  }
  return { directoryHost, directoryMode, prepareDirectoryOpen, createDirectoryResource, refreshDirectoryWorldbook }
}
