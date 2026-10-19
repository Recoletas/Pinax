import { onScopeDispose, ref } from 'vue'
import { hasActiveComicProjectRequest, hasActiveComicPageRequest, isComicRequestActive, subscribeComicRequestActivity } from '../../services/media/comicRequestGuard.js'

export function useComicRequestActivity() {
  const revision = ref(0)
  const release = subscribeComicRequestActivity(() => { revision.value += 1 })
  onScopeDispose(release)
  return {
    revision,
    isActive(requestId) { void revision.value; return isComicRequestActive(requestId) },
    hasProject(projectId) { void revision.value; return hasActiveComicProjectRequest(projectId) },
    hasPage(pageId) { void revision.value; return hasActiveComicPageRequest(pageId) }
  }
}
