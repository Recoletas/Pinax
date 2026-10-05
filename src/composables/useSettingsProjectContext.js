import { computed, onScopeDispose, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { loadWritingBooks } from '../services/writing/writingBooksRepository.js'
import { readWorldbookSnapshot } from '../stores/worldStore.js'
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
  let disposed = false
  const loadWorldbook = createSettingsWorldbookLoader(async (id) => {
    const loaded = await worldStore.loadWorldbookForProject(id)
    return loaded || null
  })

  const routeBookId = computed(() => String(route.query.bookId || ''))
  const routeWorldbookId = computed(() => String(route.query.worldbookId || ''))

  function reloadWorldbookSnapshot() {
    const id = String(context.value?.worldbookId || '')
    if (disposed || !id || loading.value) return null
    const updated = readWorldbookSnapshot(id)
    if (updated && String(worldbook.value?.id || '') === id
      && Number(updated.updatedAt || 0) < Number(worldbook.value.updatedAt || 0)) return worldbook.value
    worldbook.value = updated
    loadError.value = updated ? '' : (context.value?.mode === 'project'
      ? '这本书关联的世界书已不存在。' : '要打开的世界书已不存在。')
    return updated
  }

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
      if (routeWorldbookId.value) reloadWorldbookSnapshot()
      return resolved
    }
    worldbook.value = null
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
    // 加载期间可能有同库的正式保存；返回时保留已落盘的较新 revision。
    const latest = readWorldbookSnapshot(resolved.worldbookId)
    if (!latest) {
      worldbook.value = null
      loadError.value = resolved.mode === 'project' ? '这本书关联的世界书已不存在。' : '要打开的世界书已不存在。'
      return resolved
    }
    worldbook.value = Number(latest.updatedAt || 0) >= Number(result.worldbook.updatedAt || 0)
      ? latest : result.worldbook
    return resolved
  }

  watch([routeBookId, routeWorldbookId], () => { refresh() }, { immediate: true })
  watch(
    [() => worldStore.activeWorldbook, worldbook],
    ([active, snapshot]) => {
      const resolved = context.value
      if (!resolved || loading.value) return
      // 无显式 ID 的全局管理仍跟随 active；项目与显式全局 ID 不允许换库回退。
      if (resolved.mode === 'global' && !routeWorldbookId.value) {
        if (active !== snapshot) worldbook.value = active || null
        if (String(resolved.worldbookId || '') !== String(active?.id || '')) {
          context.value = { ...resolved, worldbookId: String(active?.id || ''), status: active ? 'ready' : 'unbound' }
        }
        return
      }
    }
  )
  const writeActions = new Set([
    'updateWorldbookDurable', 'deleteWorldbookDurable', 'addEntryDurable', 'updateEntryDurable', 'deleteEntryDurable'
  ])
  const unsubscribe = worldStore.$onAction?.(({ name, args, after }) => {
    if (!writeActions.has(name)) return
    const targetId = String(args[0] || '')
    after(result => {
      if (disposed || !result?.ok) return
      // 写入结束才同步；页面已换作品或仍在加载时，不触碰新 owner 的快照。
      if (loading.value || String(context.value?.worldbookId || '') !== targetId
        || String(worldbook.value?.id || '') !== targetId) return
      reloadWorldbookSnapshot()
    })
  })
  onScopeDispose(() => { disposed = true; sequence += 1; unsubscribe?.() })

  return {
    context,
    worldbook,
    loading,
    loadError,
    routeBookId,
    routeWorldbookId,
    reloadWorldbookSnapshot,
    refresh
  }
}
