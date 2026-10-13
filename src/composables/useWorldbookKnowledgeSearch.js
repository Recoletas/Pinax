import { computed, onScopeDispose, ref, shallowRef, toValue, watch } from 'vue'
import { searchWorldbookEntries } from '../services/worldbook/knowledgeSearchClient.js'

/** The indexed result is a view of this revision, never another worldbook owner. */
export function useWorldbookKnowledgeSearch({ bookId, worldbook, query, category, search = searchWorldbookEntries }) {
  const searching = ref(false)
  const result = shallowRef(null)
  const error = shallowRef(null)
  let sequence = 0
  let controller = null
  let disposed = false
  const entries = computed(() => Array.isArray(toValue(worldbook)?.entries) ? toValue(worldbook).entries : [])
  const currentIds = computed(() => new Set(entries.value.map(entry => String(entry.id))))
  const hitIds = computed(() => new Set((result.value?.hits || []).map(hit => String(hit.id)).filter(id => currentIds.value.has(id))))
  const relatedIds = computed(() => new Set((result.value?.expansion || []).map(hit => String(hit.id)).filter(id => currentIds.value.has(id) && !hitIds.value.has(id))))
  const visibleIds = computed(() => new Set([...hitIds.value, ...relatedIds.value]))
  const missingCount = computed(() => new Set([...(result.value?.hits || []), ...(result.value?.expansion || [])].map(hit => String(hit.id)).filter(id => !currentIds.value.has(id))).size)

  function reset() {
    sequence++
    controller?.abort()
    controller = null
    searching.value = false
    result.value = null
    error.value = null
  }

  watch([() => toValue(bookId), () => toValue(worldbook)?.id, () => toValue(query), () => toValue(category)], reset, { flush: 'sync' })
  watch(() => [toValue(worldbook)?.updatedAt, entries.value], () => {
    const hadSearch = searching.value || result.value
    reset()
    if (hadSearch) error.value = { code: 'WORLD_CHANGED' }
  }, { deep: true, flush: 'sync' })
  onScopeDispose(() => { disposed = true; reset() })

  async function run() {
    const q = String(toValue(query) || '').trim()
    if (!q || disposed || searching.value) return false
    reset()
    const scope = {
      bookId: String(toValue(bookId) || ''),
      worldbookId: String(toValue(worldbook)?.id || ''),
      worldbookRevision: String(toValue(worldbook)?.updatedAt ?? ''),
      q,
      cat: String(toValue(category) || ''),
      k: 20
    }
    if (!scope.bookId) { error.value = { code: 'NO_PROJECT_CONTEXT' }; return false }
    const ticket = sequence
    controller = new AbortController()
    searching.value = true
    try {
      const response = await search({ ...scope, signal: controller.signal })
      if (disposed || ticket !== sequence) return false
      if (!response?.ok) { error.value = response?.error || { code: 'SEARCH_FAILED' }; return false }
      const payload = response.result
      const validHit = hit => hit && typeof hit.id === 'string' && hit.id.trim()
      if (!Array.isArray(payload?.hits) || !Array.isArray(payload?.expansion) || !payload.hits.every(validHit) || !payload.expansion.every(validHit)) {
        error.value = { code: 'INVALID_RESULT' }
        return false
      }
      const coverage = payload.coverage || {}
      const revision = coverage.worldbookRevision ?? coverage.revision
      if ((coverage.worldbookId && String(coverage.worldbookId) !== scope.worldbookId) || (revision != null && String(revision) !== scope.worldbookRevision)) {
        error.value = { code: 'STALE_INDEX' }
        return false
      }
      result.value = payload
      return true
    } catch (failure) {
      if (!disposed && ticket === sequence) error.value = { code: 'SEARCH_FAILED', message: String(failure?.message || '') }
      return false
    } finally {
      if (!disposed && ticket === sequence) { searching.value = false; controller = null }
    }
  }

  return { searching, result, error, hitIds, relatedIds, visibleIds, missingCount, run, reset }
}
