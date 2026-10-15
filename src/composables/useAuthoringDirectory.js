import { nextTick, watch, onMounted, onScopeDispose } from 'vue'
import { resolveBookSourceContext } from '../services/worldbook/worldbookProjectSources.js'
import { tr } from '../i18n/index.js'
import { useComposableWorkspace } from './useComposableWorkspace.js'

// Directory commands share the document owners and leave protections.
export function useAuthoringDirectory(owner) {
  const directoryHost = useComposableWorkspace()
  const directoryMode = directoryHost.directory.mode
  const release = directoryHost.directory.bindPrepare(prepareDirectoryOpen)
  onScopeDispose(release)
  onMounted(() => watch([directoryMode, () => String(owner.bookId() || ''), directoryHost.directory.expanded], ([mode, bookId, expanded], previous) => {
    const search = owner.getSearch?.()
    if (mode === 'search' && bookId && expanded) {
      if (previous?.[1] && previous[1] !== bookId) { search?.close({ restore: false }); search?.updateQuery('') }
      if (!search?.open.value) { search?.show(); search?.updateScope('manuscript'); if (search?.query.value) search.run() }
    } else if (mode === 'search' || previous?.[0] === 'search') search?.close({ restore: false })
  }, { immediate: true, flush: 'post' }))
  async function openDirectoryFinding(finding) {
    const bookId = String(owner.bookId())
    if (!prepareDirectoryOpen() || !await directoryHost.prepareOpen('main') || String(owner.bookId()) !== bookId) return false
    const target = finding.target || {}
    if (target.sourceKind !== 'worldbook-entry') {
      const ref = target.sourceKind === 'manuscript' ? { type: 'chapter', id: target.chapterId } : target.sourceKind === 'exploration' ? { type: 'exploration', id: target.documentId } : null
      if (!ref || !await directoryHost.openAt({ ...ref, bookId }, 'main')) return false
    }
    const opened = await owner.getSearch().openFinding(finding)
    if (opened && directoryHost.state.narrow) directoryHost.state.directoryOpen = false
    return opened
  }

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
  return { directoryHost, directoryMode, openDirectoryFinding, prepareDirectoryOpen, createDirectoryResource, refreshDirectoryWorldbook }
}
