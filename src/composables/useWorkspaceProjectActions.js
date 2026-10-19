import { computed, onBeforeUnmount, ref } from 'vue'
import { isNavigationFailure } from 'vue-router'
import { loadWritingBooks, subscribeWritingBooks } from '../services/writing/writingBooksRepository.js'
import { useWorkspaceTabsStore } from '../stores/workspaceTabsStore.js'
export function useWorkspaceProjectActions({ route, router, host, onError }) {
  const tabs = useWorkspaceTabsStore()
  const books = ref(loadWritingBooks())
  const unsubscribe = subscribeWritingBooks(() => { books.value = loadWritingBooks() })
  onBeforeUnmount(unsubscribe)
  const book = computed(() => books.value.find(item => String(item.id) === String(route.query.bookId || '')))
  const modules = [
    { key: 'writing', label: '正文', icon: 'writing', route: 'authoring' },
    { key: 'assistant', label: '助手', icon: 'message-square', route: 'authoring' },
    { key: 'settings', label: '设定', icon: 'worldbook', route: 'settings-structured' },
    { key: 'sources', label: '资料', icon: 'sources', route: 'settings-sources' },
    { key: 'comics', label: '漫画', icon: 'comics', route: 'comics' },
    { key: 'video', label: '视频', icon: 'film', route: 'prose-essay' },
    { key: 'experience', label: '跑团', icon: 'adventure', route: 'experience' }
  ]
  const extras = [{ key: 'online', label: '联机', icon: 'users', route: 'online-experience' },{ key: 'map', label: '地图', icon: 'map', route: 'settings-world-map' }, { key: 'entries', label: '条目', icon: 'list', route: 'settings-worldbook-advanced' }]
  const busy = ref(false)
  const error = ref('')
  async function openSurface(key) {
    const mapped = { canvas: 'video', materials: 'materials' }[key] || key
    const item = [...modules, ...extras].find(item => item.key === mapped)
    if (item) await open(item)
    if (error.value) onError?.(error.value)
  }
  function beside(key, expanded = false) {
    if (!book.value || (key === 'settings' && route.name === 'settings-structured')) return false
    const resource = { type: key === 'settings' ? 'settings-editor' : 'sources', bookId: String(book.value.id), worldbookId: String(book.value.worldbookId || '') }
    return host.openAt(resource, expanded ? 'main' : 'side')
  }
  async function open(item) {
    if (!book.value || busy.value) return
    error.value = ''
    if (item.key === 'online' && route.name === 'experience') {
      const failure = await router.push({ name: 'authoring', query: { bookId: String(book.value.id) } })
      if (failure) { error.value = '请先结束当前跑团任务，再打开联机。'; return }
    }
    if (['experience', 'comics', 'video', 'materials', 'online', 'map', 'entries'].includes(item.key) && (route.name !== item.route || host.hostedRoute.value)) {
      if (['experience', 'online'].includes(item.key)) {
        const conflict = item.key === 'experience' ? 'online-editor' : 'game-editor'
        for (const view of host.state.views.filter(view => view.resource.type === conflict)) {
          if (!await host.close(view.id)) { error.value = '请先结束当前跑团任务，或离开并关闭联机房间。'; return }
        }
      }
      if (host.openResource({ type: item.key === 'experience' ? 'game-editor' : item.key === 'map' ? 'map-editor' : item.key === 'entries' ? 'entries-editor' : item.key === 'online' ? 'online-editor' : item.key === 'comics' ? 'comic-editor' : item.key === 'materials' ? 'materials-editor' : 'director-editor', bookId: String(book.value.id), worldbookId: String(book.value.worldbookId || '') })) host.move(true)
      return
    }
    if (['settings', 'sources'].includes(item.key) && !(item.key === 'settings' && route.name === 'settings-structured')) {
      await beside(item.key, item.key === 'settings'); return
    }
    const query = { bookId: String(book.value.id) }
    if (book.value.worldbookId) query.worldbookId = String(book.value.worldbookId)
    if (item.route === 'authoring') {
      const remembered = route.name === 'authoring' ? route : tabs.tabs.find(tab => tab.projectId === query.bookId && tab.surface === 'authoring')?.route
      if (remembered?.query?.chapterId && book.value.chapters?.some(chapter => chapter.id === remembered.query.chapterId)) query.chapterId = remembered.query.chapterId
      if (remembered?.query?.explorationId) query.explorationId = remembered.query.explorationId
      if (item.key === 'assistant') query.view = 'assistant'
    }
    busy.value = true
    try {
    if (item.key === 'experience') {
      const { useGameStore } = await import('../stores/gameStore.js')
      const game = useGameStore()
      game.loadSessions()
      const remembered = tabs.tabs.find(tab => tab.projectId === query.bookId && tab.surface === 'roleplay')?.route
      const session = game.sessions.find(session => session.id === remembered?.query?.sessionId)
        || game.sessions.find(session => session.id === game.currentSessionId)
      if (session && (session.worldbookId || session.worldId) === query.worldbookId) query.sessionId = String(session.id)
    }
      const failure = await router.push({ name: item.route, query })
      if (!failure || route.name === item.route && String(route.query.bookId) === query.bookId) {
        if (host.hostedRoute.value) { host.activate(host.hostedRoute.value.id); host.move(true) }
        else host.hide()
      }
      else if (isNavigationFailure(failure)) error.value = '请先处理当前未保存的内容或运行任务。'
    } catch { error.value = '暂时无法打开，请重试。' }
    finally { busy.value = false }
  }

  return { openSurface }
}
