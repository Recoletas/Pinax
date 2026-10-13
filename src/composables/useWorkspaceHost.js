import { computed, onScopeDispose, provide, reactive, shallowReactive, shallowRef, unref, watch } from 'vue'
import { WORKSPACE_MODULE_ROUTES, WORKSPACE_VIEW_LIMIT, isWorkspaceModule, normalizeWorkspaceLayout, normalizeWorkspaceResource, workspaceResourceKey } from '../services/workspace/workspaceViewContract.js'
import { COMPOSABLE_WORKSPACE_CONTEXT } from './useComposableWorkspace.js'
import { createWorkspaceAssistantSessions } from './useWorkspaceAssistantSessions.js'

// One host owns placement. Domain components continue to own their data/tasks.
export function provideComposableWorkspace(route, { openAssistant, openChapter, returnToPrimary } = {}) {
  const assistantNavigationNotice = '请先完成或停止助手任务，再切换作品；正文采用期间请稍候。'
  const state = reactive({ directoryOpen: false, views: [], activeId: '', mainModuleId: '', sideActiveId: '', expanded: false, hidden: false, width: 420, notice: '', primaryVisible: true, narrow: false, primaryComposing: false, composingViewId: '' })
  const directoryTarget = shallowRef(null)
  const directoryDocked = shallowRef(false)
  const railTarget = shallowRef(null)
  const railDocked = shallowRef(false)
  const primaryChapter = shallowRef(null)
  const primaryReturnResource = shallowRef(null)
  const explicitScope = shallowRef(null)
  const guards = new Map()
  const taskAdapters = shallowReactive(new Map())
  const taskSummaries = computed(() => [...taskAdapters.entries()].flatMap(([viewId, adapter]) => {
    const summary = adapter.summary()
    return summary ? [{ ...summary, viewId, open: adapter.open }] : []
  }))
  const scope = computed(() => explicitScope.value?.routeName === route.name ? unref(explicitScope.value.value)
    : { bookId: typeof route.query.bookId === 'string' ? route.query.bookId : '', worldbookId: typeof route.query.worldbookId === 'string' ? route.query.worldbookId : '' })
  const scopeKey = computed(() => JSON.stringify([scope.value.bookId, scope.value.bookId ? '' : scope.value.worldbookId]))
  const activeView = computed(() => state.views.find(view => view.id === state.activeId) || null)
  const moduleNavigation = computed(() => Boolean(route.query.bookId && (route.name !== 'experience' || scope.value.bookId === route.query.bookId) && ['authoring', 'settings-structured', 'settings-sources', 'settings-worldbook-advanced', 'settings-world-map', 'comics', 'prose-essay', 'materials', 'experience', 'online-experience'].includes(route.name)))
  const hostedRoute = computed(() => state.views.find(view => view.resource.bookId === route.query.bookId && WORKSPACE_MODULE_ROUTES[view.resource.type] === route.name))
  let revision = 0
  let disposed = false
  let returnFocus = null
  let chapterNavigator = null
  const primaryTitle = computed(() => route.name === 'authoring' ? primaryChapter.value?.title || '正文' : ({ experience: '跑团', 'online-experience': '联机', comics: '漫画', 'prose-essay': '视频', materials: '素材与插画', 'settings-structured': '设定', 'settings-sources': '资料', 'settings-world-map': '地图', 'settings-worldbook-advanced': '条目' })[route.name] || '原页面')
  watch(() => route.name, name => {
    if (name !== 'authoring') {
      primaryChapter.value = null
      if (['chapter', 'exploration'].includes(state.views.find(view => view.id === state.mainModuleId)?.resource.type)) state.mainModuleId = ''
    }
  })
  const storageKey = () => `pinax-workspace-views:v1:${scopeKey.value}`
  function persist() {
    try { localStorage.setItem(storageKey(), JSON.stringify({ version: 1, views: state.views, activeId: state.activeId,
      mainModuleId: state.mainModuleId, sideActiveId: state.sideActiveId, expanded: state.expanded, hidden: state.hidden, width: state.width })) } catch { state.notice = '布局未能保存；内容不受影响。' }
  }
  function accepts(resource) {
    return scope.value.bookId ? resource.bookId === scope.value.bookId
      : !resource.bookId && Boolean(scope.value.worldbookId) && resource.worldbookId === scope.value.worldbookId
  }
  function openResource(raw, { pinned = false, focus = true } = {}) {
    const resource = normalizeWorkspaceResource(raw)
    if (disposed || !resource || !accepts(resource)) return false
    if (resource.type === 'game-editor' && (route.name === 'online-experience' || state.views.some(view => view.resource.type === 'online-editor'))) { state.notice = '请先离开并关闭联机，再打开跑团。'; return false }
    if (resource.type === 'game-editor' && route.name === 'experience' && !hostedRoute.value) { state.notice = '当前跑团已经打开，请使用现有页面。'; return false }
    if (resource.type === 'online-editor' && (route.name === 'experience' || state.views.some(view => view.resource.type === 'game-editor'))) { state.notice = '请先返回正文，再打开联机房间。'; return false }
    if (state.composingViewId || state.primaryComposing) { state.notice = '请先完成当前输入，再切换内容。'; return false }
    const key = workspaceResourceKey(resource)
    const existing = state.views.find(view => workspaceResourceKey(view.resource) === key)
    if (existing && resource.type === 'game-editor' && existing.resource.worldbookId !== resource.worldbookId) { state.notice = '作品资料库关联已变化，请先关闭原跑团，再重新打开。'; return false }
    if (existing && resource.type === 'game-editor' && resource.sessionId && resource.sessionId !== existing.resource.sessionId && taskSummaries.value.some(task => task.viewId === existing.id)) { state.notice = '请先结束当前跑团生成，再切换存档。'; return false }
    const id = existing?.id || (state.views.some(view => view.id === key) ? `${key}:${++revision}` : key)
    if (!existing && state.views.length >= WORKSPACE_VIEW_LIMIT) { state.notice = '请先关闭一份已打开的内容，再打开新的内容。'; return false }
    if (!state.views.length && typeof document !== 'undefined') returnFocus = document.activeElement
    revision += 1
    if (existing) { existing.resource = isWorkspaceModule(resource.type) ? { ...existing.resource, ...resource, ...Object.fromEntries(['pageId', 'panelId', 'assetId', 'workspace', 'roomSlug', 'entryId', 'placeId', 'historyNodeId', 'sessionId', 'messageId'].filter(key => !Object.hasOwn(raw, key) && existing.resource[key]).map(key => [key, existing.resource[key]])) } : resource; existing.pinned ||= pinned }
    else state.views.push({ id, resource, pinned, group: 'side' })
    if (focus) {
      state.activeId = id
      if (existing?.group === 'main') state.mainModuleId = id
      else state.sideActiveId = id
    }
    state.hidden = false
    state.notice = ''
    persist()
    return true
  }
  async function prepareOpen(group = 'main') {
    if (state.primaryComposing || state.composingViewId) { state.notice = '请先完成输入。'; return false }
    const id = group === 'main' ? state.mainModuleId : state.sideActiveId
    const ticket = revision
    if (id && guards.has(id) && await guards.get(id)() === false) {
      state.notice = '请先保存当前修改，或处理待确认内容。'; return false
    }
    return !disposed && ticket === revision
  }
  async function openAt(raw, group = 'side') {
    if (!['main', 'side'].includes(group) || !openResource(raw, { focus: false })) return false
    const key = workspaceResourceKey(raw)
    const view = state.views.find(view => workspaceResourceKey(view.resource) === key)
    return view ? await move(group === 'main', view.id) : false
  }
  function activate(id) {
    if (!state.views.some(view => view.id === id)) return false
    if (state.primaryComposing) return false
    if (state.composingViewId && state.composingViewId !== id) return false
    const view = state.views.find(view => view.id === id)
    if (view.group === 'main' && ['chapter', 'exploration'].includes(view.resource.type)) return selectMain(id)
    revision += 1; state.activeId = id
    if (view.group === 'main') state.mainModuleId = id
    else state.sideActiveId = id
    state.hidden = false; persist(); return true
  }
  function focusView(id) {
    if (state.hidden || state.primaryComposing || state.composingViewId) return
    const view = state.views.find(view => view.id === id)
    if (id && (!view || ![state.mainModuleId, state.sideActiveId].includes(id))) return
    state.activeId = id; persist()
  }
  function updateResource(id, patch) {
    const view = state.views.find(view => view.id === id)
    if (!view) return false
    const resource = normalizeWorkspaceResource({ ...view.resource, ...patch })
    if (!resource || !accepts(resource) || resource.type !== view.resource.type || resource.id !== view.resource.id) return false
    revision += 1; view.resource = resource; persist(); return true
  }
  function registerGuard(id, guard) {
    guards.set(id, guard)
    return () => { if (guards.get(id) === guard) guards.delete(id) }
  }
  function registerTaskAdapter(id, adapter) {
    taskAdapters.set(id, adapter)
    return () => { if (taskAdapters.get(id) === adapter) taskAdapters.delete(id) }
  }
  function bindScope(value) {
    const binding = { routeName: route.name, value }
    explicitScope.value = binding
    return () => { if (explicitScope.value === binding) explicitScope.value = null }
  }
  async function prepareLeave(to, from) {
    if (state.primaryComposing || state.composingViewId) { state.notice = '请先完成当前输入，再切换内容。'; return false }
    if (!assistantSessions.canLeave(to)) { state.notice = assistantNavigationNotice; return false }
    state.notice = ''
    // Same-project navigation replaces only the primary page; hosted views stay.
    const sameProject = scope.value.bookId && to?.query?.bookId === scope.value.bookId
    if (sameProject && to.name === from?.name && to.params?.roomSlug === from?.params?.roomSlug) return true
    const ticket = revision
    for (const [id, guard] of [...guards.entries()]) {
      if (sameProject && state.views.some(view => view.id === id && !(view.resource.type === 'online-editor' && ['experience', 'online-experience'].includes(to.name)))) continue
      if (await guard() === false) {
      state.notice = state.views.find(view => view.id === id)?.resource.type === 'online-editor' ? '请先在联机页离开房间，再切换跑团或作品。' : '当前内容尚未保存，或仍有任务运行。请先完成保存或处理任务。'
      return false
      }
    }
    if (disposed || ticket !== revision) return false
    if (to.name === 'experience') {
      for (const view of [...state.views].filter(view => view.resource.type === 'online-editor')) if (!await close(view.id)) return false
    }
    return !disposed
  }
  async function close(id) {
    const ticket = revision
    const view = state.views.find(item => item.id === id)
    if (!view) return false
    if (state.composingViewId === id) return false
    if (guards.has(id) && await guards.get(id)() === false) {
      if (view.resource.type === 'online-editor') state.notice = '请先在联机页离开房间，再关闭联机。'
      return false
    }
    if (disposed || ticket !== revision || !state.views.includes(view) || state.composingViewId === id) { state.notice = '内容位置刚发生变化，请重新关闭。'; return false }
    if (taskSummaries.value.some(task => task.viewId === id)) { state.notice = '当前任务仍在运行，请先完成或停止任务。'; return false }
    // Closing a route-backed host must not remount its native page (or reconnect).
    if (hostedRoute.value?.id === id) {
      try { if (!returnToPrimary || await returnToPrimary(view.resource) === false) { state.notice ||= '未能返回正文，工作台仍保留。'; return false } }
      catch { state.notice = '未能返回正文，工作台仍保留。'; return false }
      if (disposed || !accepts(view.resource) || !state.views.includes(view) || state.composingViewId === id || taskSummaries.value.some(task => task.viewId === id)) { state.notice = '页面或任务状态已变化，请重新关闭。'; return false }
    }
    revision += 1
    state.notice = ''
    const index = state.views.indexOf(view)
    state.views.splice(index, 1)
    if (state.activeId === id) state.activeId = state.views[Math.min(index, state.views.length - 1)]?.id || ''
    if (state.sideActiveId === id) state.sideActiveId = state.views.find(view => view.group !== 'main')?.id || ''
    if (state.mainModuleId === id) state.mainModuleId = state.views.find(view => view.group === 'main' && !['chapter', 'exploration'].includes(view.resource.type))?.id || ''
    if (!state.views.length) { state.expanded = false; returnFocus?.isConnected && returnFocus.focus?.({ preventScroll: true }); returnFocus = null }
    persist(); return true
  }
  function bindChapterNavigator(navigate) {
    chapterNavigator = navigate
    return () => { if (chapterNavigator === navigate) chapterNavigator = null }
  }
  async function selectMain(id) {
    const view = state.views.find(view => view.id === id)
    if (!view || state.composingViewId || state.primaryComposing) return false
    if (['chapter', 'exploration'].includes(view.resource.type)) {
      const ticket = revision
      try {
        const navigate = route.name === 'authoring' && chapterNavigator ? chapterNavigator : openChapter
        if (!navigate || await navigate(view.resource) === false) { state.notice = '未能切换章节，请先处理保存问题或未确认的草稿。'; return false }
      } catch { state.notice = '未能打开章节，当前内容仍保留。'; return false }
      // Route changes may report the accepted primary chapter. Check identity,
      // never apply a late navigation result after switching projects/closing.
      if (disposed || !accepts(view.resource) || !state.views.includes(view)) return false
      if (ticket !== revision && state.mainModuleId !== id) return false
    }
    view.group = 'main'; state.mainModuleId = id; state.activeId = id
    if (state.sideActiveId === id) state.sideActiveId = state.views.find(item => item.group !== 'main')?.id || ''
    revision += 1; state.hidden = false; state.expanded = false; persist(); return true
  }
  function move(expanded, id = state.activeId) {
    if (state.composingViewId || state.primaryComposing) { state.notice = '请先完成当前输入，再移动内容。'; return false }
    const view = state.views.find(view => view.id === id)
    if (!view) return false
    if (expanded && ['chapter', 'exploration'].includes(view.resource.type)) return selectMain(id)
    view.group = expanded ? 'main' : 'side'
    state.activeId = id
    if (expanded) {
      state.mainModuleId = id
      if (state.sideActiveId === id) state.sideActiveId = state.views.find(item => item.group !== 'main')?.id || ''
    } else {
      if (state.mainModuleId === id) state.mainModuleId = ''
      state.sideActiveId = id
    }
    revision += 1; state.expanded = false; state.hidden = false; state.notice = ''; persist(); return true
  }
  function showPrimary() {
    if (state.composingViewId) return false
    state.mainModuleId = state.views.find(view => view.group === 'main' && view.id === primaryChapter.value?.id)?.id || ''; state.activeId = state.mainModuleId; revision += 1; state.hidden = false; persist(); return true
  }
  function hide() { if (state.composingViewId) return false; revision += 1; state.hidden = true; state.expanded = false; state.mainModuleId = ''; persist(); return true }
  function trackPrimaryChapter(resource, title) {
    const normalized = normalizeWorkspaceResource(resource)
    if (!normalized || !['chapter', 'exploration'].includes(normalized.type) || !accepts(normalized)) return
    const key = workspaceResourceKey(normalized)
    let view = state.views.find(view => workspaceResourceKey(view.resource) === key)
    primaryChapter.value = { id: view?.id || key, resource: normalized, title }
    primaryReturnResource.value = normalized
    // A chapter already open for comparison stays there until explicitly moved.
    if (view?.group === 'side') {
      if (['chapter', 'exploration'].includes(state.views.find(item => item.id === state.mainModuleId)?.resource.type)) state.mainModuleId = ''
      return
    }
    if (!view) {
      if (state.views.length >= WORKSPACE_VIEW_LIMIT) return
      view = { id: key, resource: normalized, pinned: false, group: 'main' }
      state.views.push(view)
    }
    view.title = title
    if (!state.mainModuleId || ['chapter', 'exploration'].includes(state.views.find(item => item.id === state.mainModuleId)?.resource.type)) state.mainModuleId = view.id
    persist()
  }
  async function reorderView(id, beforeId, group) {
    const view = state.views.find(view => view.id === id)
    if (!view || !['main', 'side'].includes(group) || state.composingViewId || state.primaryComposing) return false
    if (view.group !== group && !await move(group === 'main', id)) return false
    const target = state.views.find(view => view.id === beforeId && view.group === group)
    if (beforeId && !target || id === beforeId) return false
    state.views.splice(state.views.indexOf(view), 1)
    const index = target ? state.views.indexOf(target) : state.views.length
    state.views.splice(index, 0, view)
    revision += 1; persist(); return true
  }
  function pin(id) { const view = state.views.find(item => item.id === id); if (view) { view.pinned = !view.pinned; persist() } }
  function resize(width) { state.width = Math.min(680, Math.max(320, width)); persist() }
  // Reset placement, not resources or pending edits. Imports remain mounted.
  function resetLayout() { state.width = 420; state.mainModuleId = ''; state.expanded = false; state.hidden = false; for (const view of state.views) view.group = 'side'; state.sideActiveId = state.activeId; persist() }
  watch(scopeKey, () => {
    revision += 1; primaryChapter.value = null; primaryReturnResource.value = null; for (const view of state.views) guards.delete(view.id); returnFocus = null
    state.primaryComposing = false; state.composingViewId = ''; state.directoryOpen = false
    let saved = null
    try { saved = normalizeWorkspaceLayout(JSON.parse(localStorage.getItem(storageKey())), scope.value) } catch { /* Missing or damaged layout is safe to ignore. */ }
    if (saved && (route.name === 'experience' || saved.views.some(view => view.resource.type === 'game-editor'))) {
      saved.views = saved.views.filter(view => view.resource.type !== 'online-editor')
      if (!saved.views.some(view => view.id === saved.mainModuleId)) saved.mainModuleId = ''
      if (!saved.views.some(view => view.id === saved.activeId)) saved.activeId = saved.views.at(-1)?.id || ''
    }
    Object.assign(state, saved || { views: [], activeId: '', mainModuleId: '', sideActiveId: '', expanded: false, hidden: false, width: 420 })
    state.notice = ''
  }, { immediate: true })
  watch(() => [route.name, route.query.bookId, route.params?.roomSlug, hostedRoute.value?.id], () => {
    const view = hostedRoute.value
    if (view) {
      if (view.resource.type === 'online-editor' && view.resource.roomSlug !== String(route.params?.roomSlug || '')) updateResource(view.id, { roomSlug: String(route.params?.roomSlug || '') })
      activate(view.id); move(true)
    }
  }, { immediate: true })
  const assistantSessions = createWorkspaceAssistantSessions({ scope, registerTaskAdapter, openAssistant })
  watch(() => [assistantSessions.summary.value?.status, assistantSessions.canLeave({ query: { bookId: scope.value.bookId } })], ([status, allowed]) => {
    if (status !== 'running' && allowed && state.notice === assistantNavigationNotice) state.notice = ''
  })
  onScopeDispose(() => { disposed = true; revision += 1; assistantSessions.dispose(); guards.clear(); taskAdapters.clear() })
  const onlineMountAllowed = computed(() => route.name !== 'experience' && (route.name !== 'online-experience' || hostedRoute.value?.resource.type === 'online-editor'))
  const host = { directoryTarget, directoryDocked, prepareOpen, primaryReturnResource, primaryTitle, primaryChapter, railTarget, railDocked, onlineMountAllowed, state, scope, activeView, moduleNavigation, hostedRoute, taskSummaries, bindChapterNavigator, reorderView, selectMain, showPrimary, trackPrimaryChapter, attachAssistant: assistantSessions.attach, assistantSummary: assistantSessions.summary, focusView, openAt, openResource, updateResource, activate, bindScope, registerGuard, registerTaskAdapter, prepareLeave, close, move, hide, pin, resize, resetLayout }
  provide(COMPOSABLE_WORKSPACE_CONTEXT, host)
  return host
}
