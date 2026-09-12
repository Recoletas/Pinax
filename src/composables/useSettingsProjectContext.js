import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { loadWritingBooks } from '../services/writing/writingBooksRepository.js'
import {
  resolveSettingsProjectContext,
  createSettingsWorldbookLoader
} from '../services/workspace/settingsProjectContext.js'

// 设定三页（结构化/地图/高级条目）共用的项目上下文加载。
// route query 变化时重新解析；世界书内容加载带竞态令牌，快速切换不串库。
export function useSettingsProjectContext({ worldStore } = {}) {
  const route = useRoute()
  const context = ref(null)
  const worldbook = ref(null)
  const loading = ref(false)
  const loadError = ref('')
  let sequence = 0
  const loadWorldbook = createSettingsWorldbookLoader(async (id) => {
    const loaded = await worldStore.loadWorldbookForProject(id)
    return loaded || null
  })

  const routeBookId = computed(() => String(route.query.bookId || ''))
  const routeWorldbookId = computed(() => String(route.query.worldbookId || ''))

  async function refresh() {
    const ticket = ++sequence
    const books = loadWritingBooks()
    const resolved = resolveSettingsProjectContext({
      books,
      bookId: routeBookId.value,
      worldbookId: routeWorldbookId.value,
      fallbackWorldbookId: worldStore.activeWorldbook?.id || ''
    })
    context.value = resolved
    if (!resolved.worldbookId) {
      // 无显式目标的全局模式沿用 active；项目未绑定则严格为空。
      worldbook.value = resolved.mode === 'global' ? (worldStore.activeWorldbook || null) : null
      loading.value = false
      loadError.value = ''
      return resolved
    }
    if (
      resolved.mode === 'global'
      && String(worldStore.activeWorldbook?.id || '') === String(resolved.worldbookId)
    ) {
      worldbook.value = worldStore.activeWorldbook
      loading.value = false
      loadError.value = ''
      return resolved
    }
    loading.value = true
    loadError.value = ''
    const result = await loadWorldbook(resolved.worldbookId)
    if (ticket !== sequence) return resolved
    loading.value = false
    if (!result.ok) {
      worldbook.value = null
      loadError.value = result.reason === 'missing-worldbook'
        ? (resolved.mode === 'project' ? '这本书关联的世界书已不存在。' : '要打开的世界书已不存在。')
        : '世界书加载失败，请重试。'
      return resolved
    }
    worldbook.value = result.worldbook
    return resolved
  }

  watch([routeBookId, routeWorldbookId], () => { refresh() }, { immediate: true })

  return {
    context,
    worldbook,
    loading,
    loadError,
    routeBookId,
    routeWorldbookId,
    refresh
  }
}
