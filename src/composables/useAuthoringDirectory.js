import { nextTick, ref } from 'vue'
import { tr } from '../i18n/index.js'
import { useComposableWorkspace } from './useComposableWorkspace.js'

// Directory commands share the document owners and leave protections.
export function useAuthoringDirectory(owner) {
  const directoryHost = useComposableWorkspace()
  const directoryMode = ref('files')
  function prepareDirectoryOpen() {
    if (owner.hasPendingDraft()) {
      directoryHost.state.notice = tr('请先采用或保留当前推演草稿，再切换内容。')
      return false
    }
    if (owner.ideaId()) return Boolean(owner.saveIdea()?.ok)
    return !owner.chapterId() || owner.saveChapter()
  }
  async function createDirectoryResource(type) {
    if (!prepareDirectoryOpen()) return null
    if (type === 'chapter') {
      if (owner.ideaId() && !owner.leaveIdea()?.ok) return null
      if (!owner.createChapter()) return null
    } else {
      const previous = owner.ideaId()
      owner.createIdea()
      if (!owner.ideaId() || previous === owner.ideaId()) return null
    }
    await nextTick()
    return { type, bookId: String(owner.bookId()), id: String(type === 'chapter' ? owner.chapterId() : owner.ideaId()) }
  }
  return { directoryHost, directoryMode, prepareDirectoryOpen, createDirectoryResource }
}
