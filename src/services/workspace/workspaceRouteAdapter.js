// 工作台路由适配器（计划 Task 3）：route -> tab 与 tab -> route 双向同步。
// URL 是导航真源：syncFromRoute 只跟随 URL，不反向 push；
// push 只发生在显式用户意图（激活/打开/关闭标签），并用 syncing 标志防循环。
// 旧无 query 的 project 链接 replace 为 canonical URL（最近书或首书）。
import { loadWritingBooks } from '../writing/writingBooksRepository'
import { PROJECT_SURFACE_ROUTE_NAMES, DUAL_MODE_ROUTE_NAMES } from './workspaceTabContract'

const PROJECT_ROUTE_NAMES = new Set(Object.values(PROJECT_SURFACE_ROUTE_NAMES))

let installedRouter = null
let installedStore = null
let syncing = false
// 复验修复：程序化导航窗口内到达的外部导航不再静默丢弃——
// 缓存最新一条，窗口关闭后补处理（旧实现直接 return 会丢真实 URL 状态，
// 且同步测试流中前一个 replace 的微任务未清空时，后续合法导航全部失效）。
let inFlightRouteKey = ''
let bufferedExternalRoute = null

function routeKey(route) {
  return JSON.stringify([route?.name ?? null, route?.params ?? null, route?.query ?? null])
}

function runProgrammatic(store, router, method, target) {
  syncing = true
  const inFlightKey = routeKey(target)
  inFlightRouteKey = inFlightKey
  return Promise.resolve(router[method](target)).catch(() => {}).finally(() => {
    // 复验修复：必须在清空前保存本轮 key——否则比较对象变成 ''，
    // 程序化导航自身的 afterEach 回声永远不会被识别并丢弃。
    const completedRouteKey = inFlightRouteKey
    syncing = false
    inFlightRouteKey = ''
    const buffered = bufferedExternalRoute
    bufferedExternalRoute = null
    // 与刚完成的程序化导航相同的路由是自己的回声：
    // 发起方已把 store 状态应用到目标路由，重放只会重复 syncFromRoute/persist。
    if (buffered && routeKey(buffered) !== completedRouteKey) {
      processRouteChange(store, router, buffered)
    }
  })
}

// 默认书解析：最近使用的项目标签 → 最近更新的书 → 首书。
export function resolveDefaultBookId(store) {
  const recent = [...store.tabs]
    .filter((tab) => tab.scope === 'project')
    .sort((a, b) => b.lastActiveAt - a.lastActiveAt)[0]
  if (recent && store.bookIndex[String(recent.projectId)]) return String(recent.projectId)
  let best = null
  for (const book of loadWritingBooks()) {
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
    const bookId = resolveDefaultBookId(store)
    if (bookId) {
      const canonical = { name: to.name, query: { ...to.query, bookId } }
      // 先应用 store 状态再 replace：这样自身的 afterEach 回声可以安全丢弃
      // （丢弃的前提是“发起方已把 store 应用到目标路由”）。
      store.syncFromRoute(canonical)
      runProgrammatic(store, router, 'replace', canonical)
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
  router.afterEach((to) => handleRouteChange(store, router, to))
  // 初始导航先于 afterEach 注册完成时补一次同步（幂等）。
  if (router.currentRoute.value?.name) handleRouteChange(store, router, router.currentRoute.value)
}

// 供合同测试直接驱动导航同步（与 afterEach 相同入口）。
export function handleRouteChangeForTest(store, router, to) {
  return handleRouteChange(store, router, to)
}

export function activateWorkspaceTab(store, router, tabId) {
  const result = store.activate(tabId)
  if (!result.ok || !result.route) return Promise.resolve(false)
  return runProgrammatic(store, router, 'push', result.route).then(() => true)
}

export function openOrFocusWorkspaceTab(store, router, intent, options = {}) {
  const tab = store.openOrFocus(intent, options)
  if (!tab) return Promise.resolve(null)
  return runProgrammatic(store, router, 'push', tab.route).then(() => tab)
}

export function closeWorkspaceTab(store, router, tabId) {
  const result = store.close(tabId)
  if (!result.ok || !result.route) return Promise.resolve(result)
  return runProgrammatic(store, router, 'push', result.route).then(() => result)
}

// 供测试与显式调用方判断当前是否处于程序化导航窗口。
export function isWorkspaceRouteSyncing() {
  return syncing
}
