// 工作台路由适配器（计划 Task 3）：route -> tab 与 tab -> route 双向同步。
// URL 是导航真源：syncFromRoute 只跟随 URL，不反向 push；
// push 只发生在显式用户意图（激活/打开/关闭标签），并用 syncing 标志防循环。
// 旧无 query 的 project 链接 replace 为 canonical URL（最近书或首书）。
import { loadWritingBooks } from '../writing/writingBooksRepository'
import { isNavigationFailure, NavigationFailureType } from 'vue-router'
import { PROJECT_SURFACE_ROUTE_NAMES, DUAL_MODE_ROUTE_NAMES, buildDefaultRouteForIntent, chooseCloseNeighbor, intentToTabKey, resolveRouteIntent } from './workspaceTabContract'
import { recordWorkspaceRecentRoute, resolveRecentBookId } from './workspaceRecentHistory.js'

const PROJECT_ROUTE_NAMES = new Set(Object.values(PROJECT_SURFACE_ROUTE_NAMES))

let installedRouter = null
let installedStore = null
let syncing = false
// 复验修复：程序化导航窗口内到达的外部导航不再静默丢弃——
// 缓存最新一条，窗口关闭后补处理（旧实现直接 return 会丢真实 URL 状态，
// 且同步测试流中前一个 replace 的微任务未清空时，后续合法导航全部失效）。
let inFlightRouteKey = ''
let bufferedExternalRoute = null
let navigationSequence = 0

function routeKey(route) {
  const fields = values => Object.entries(values || {}).sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => [key, value == null ? null : Array.isArray(value) ? value.map(String) : String(value)])
  return JSON.stringify([route?.name ?? null, fields(route?.params), fields(route?.query), route?.hash || ''])
}

function copyRoute(route) {
  return route ? JSON.parse(JSON.stringify(route)) : null
}

function routeForTab(tab) {
  const target = copyRoute(tab?.route)
  if (!target) return null
  if (tab.scope === 'project') {
    if (target.query?.bookId && String(target.query.bookId) !== String(tab.projectId)) return null
    target.query = { ...target.query, bookId: String(tab.projectId) }
  }
  return target
}

function routeIsCurrent(router, target) {
  const current = router.currentRoute.value
  try {
    if (router.resolve) return router.resolve(target).fullPath === current.fullPath
  } catch { return false }
  return routeKey(current) === routeKey(target)
}

async function runProgrammatic(store, router, method, target, commit = null) {
  const sequence = ++navigationSequence
  syncing = true
  inFlightRouteKey = routeKey(target)
  let committed = false
  try {
    const failure = await router[method](target)
    const duplicate = isNavigationFailure(failure, NavigationFailureType.duplicated)
    if ((failure && !duplicate) || sequence !== navigationSequence || !routeIsCurrent(router, target)) return false
    // Save guards decide first. Until this point, no tab is opened/activated/
    // removed, so a rejected route cannot delete an unsaved work surface.
    committed = commit ? commit(router.currentRoute.value) !== false : true
    return committed
  } catch {
    return false
  } finally {
    if (sequence === navigationSequence) {
      const completedRouteKey = inFlightRouteKey
      syncing = false
      inFlightRouteKey = ''
      const buffered = bufferedExternalRoute
      bufferedExternalRoute = null
      if (buffered && (!committed || routeKey(buffered) !== completedRouteKey)) {
        processRouteChange(store, router, buffered)
      }
    }
  }
}

// Default project follows durable usage history even after its tab was closed.
export function resolveDefaultBookId(store, route = null) {
  const books = loadWritingBooks()
  if (route?.name === 'authoring' && !route.query?.bookId && typeof route.query?.chapterId === 'string' && route.query.chapterId) {
    const owners = books.filter(book => book.chapters?.some(chapter => String(chapter.id) === route.query.chapterId))
    // A legacy chapter link owns a specific object. Missing/ambiguous ownership
    // must remain unresolved rather than borrowing the most recently used book.
    return owners.length === 1 ? String(owners[0].id) : ''
  }
  const recentBookId = resolveRecentBookId(books)
  if (recentBookId) return recentBookId
  const recent = [...store.tabs]
    .filter((tab) => tab.scope === 'project')
    .sort((a, b) => b.lastActiveAt - a.lastActiveAt)[0]
  if (recent && store.bookIndex[String(recent.projectId)]) return String(recent.projectId)
  let best = null
  for (const book of books) {
    if (!best || String(book.updatedAt || '') > String(best.updatedAt || '')) best = book
  }
  return best ? String(best.id) : ''
}

function processRouteChange(store, router, to) {
  // 首页是常驻导航标签，不占持久化作品标签；回首页时只清焦点，保留全部工作页。
  if (to.name === 'welcome') {
    store.clearActiveTab()
    return
  }
  // 双模式路由（高级条目）不带 bookId 是合法的全局访问，不能被补默认书后吞进项目标签。
  if (PROJECT_ROUTE_NAMES.has(to.name) && !DUAL_MODE_ROUTE_NAMES.has(to.name) && !to.query?.bookId) {
    const bookId = resolveDefaultBookId(store, to)
    if (bookId) {
      const canonical = { name: to.name, query: { ...to.query, bookId } }
      runProgrammatic(store, router, 'replace', canonical, () => Boolean(store.syncFromRoute(canonical)))
      return
    }
  }
  const focused = store.syncFromRoute(to)
  // 项目 surface 无书可解析（空库直接进 /authoring 等）：syncFromRoute 得不到
  // intent，若不清焦点，上一会话的高亮标签会继续冒充当前工作区。
  if (!focused && PROJECT_ROUTE_NAMES.has(to.name)) store.clearActiveTab()
}

function handleRouteChange(store, router, to) {
  if (syncing) {
    bufferedExternalRoute = to
    return
  }
  processRouteChange(store, router, to)
}

// 幂等安装：AppShell 重挂载（docs ↔ 工作台切换）不会重复注册 afterEach。
export function installWorkspaceRouteAdapter(store, router) {
  if (installedRouter === router && installedStore === store) return
  installedRouter = router
  installedStore = store
  // hydrate 必须同步完成：isReady() 会晚于首个 afterEach，延迟恢复会让
  // 空 store 先 persist，覆盖上一会话的标签布局（数据丢失竞态）。
  // afterEach 因此后置注册；初始导航的同步由下方 catch-up 兜底（幂等）。
  store.hydrate({ route: null })
  router.afterEach((to, from, failure) => {
    // Failed/duplicate navigation is not use. Catch-up and initial hydration do
    // not rewrite history; confirmed page objects report through the same API.
    if (failure) return
    if (from?.name && (to.fullPath !== from.fullPath || to.name !== from.name)) recordWorkspaceRecentRoute(to)
    handleRouteChange(store, router, to)
  })
  // 初始导航先于 afterEach 注册完成时补一次同步（幂等）。
  if (router.currentRoute.value?.name) handleRouteChange(store, router, router.currentRoute.value)
}

// 供合同测试直接驱动导航同步（与 afterEach 相同入口）。
export function handleRouteChangeForTest(store, router, to) {
  return handleRouteChange(store, router, to)
}

export function activateWorkspaceTab(store, router, tabId) {
  const tab = store.tabs.find(item => item.id === tabId)
  if (!tab?.route) return Promise.resolve(false)
  const target = routeForTab(tab)
  if (!target) return Promise.resolve(false)
  return runProgrammatic(store, router, 'push', target, actual => {
    if (!store.tabs.some(item => item.id === tabId)) return false
    const focused = store.syncFromRoute(actual)
    const result = store.activate(focused?.id || tabId)
    if (result.ok) store.persist()
    return result.ok
  })
}

export function openOrFocusWorkspaceTab(store, router, intent, options = {}) {
  const target = routeForTab({ scope: intent?.scope, projectId: intent?.projectId, route: options.route || buildDefaultRouteForIntent(intent) })
  if (!target || (intent?.scope === 'project' && !Object.prototype.hasOwnProperty.call(store.bookIndex, String(intent.projectId)))) return Promise.resolve(null)
  if (intentToTabKey(resolveRouteIntent(target)) !== intentToTabKey(intent)) return Promise.resolve(null)
  let tab = null
  return runProgrammatic(store, router, 'push', target, () => {
    tab = store.openOrFocus(intent, { ...options, route: target })
    return Boolean(tab)
  }).then(ok => ok ? tab : null)
}

export function closeWorkspaceTab(store, router, tabId) {
  const tab = store.tabs.find(item => item.id === tabId)
  if (!tab) return Promise.resolve({ ok: false, route: null })
  if (store.activeTabId !== tabId) return Promise.resolve(store.close(tabId))
  const neighbor = chooseCloseNeighbor(store.tabs, tabId)
  const target = neighbor ? routeForTab(neighbor) : { name: 'welcome', query: {} }
  if (!target) return Promise.resolve({ ok: false, route: null, reason: 'invalid-location' })
  let result = null
  return runProgrammatic(store, router, 'push', target, actual => {
    result = store.close(tabId)
    if (!result.ok) return false
    // The neighbor may have changed while the guard was open; actual URL owns
    // focus, rather than the neighbor chosen by the later array mutation.
    if (actual.name === 'welcome') store.clearActiveTab()
    else store.syncFromRoute(actual)
    result = { ...result, route: target }
    return true
  }).then(ok => ok ? result : { ok: false, route: null, reason: 'navigation-cancelled' })
}

// 供测试与显式调用方判断当前是否处于程序化导航窗口。
export function isWorkspaceRouteSyncing() {
  return syncing
}
